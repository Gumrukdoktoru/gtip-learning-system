"""Authenticated approval panel with explicit OAuth account-linking routes."""
import argparse
from datetime import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import threading
import zipfile
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from social_connections import SocialConnections, connection_router
from database import Database
from object_store import ObjectStore
from daily_planner import DailyPlanner
from private_import import import_bundle
from sealed_bootstrap import PACKAGE as SEALED_PACKAGE,import_with_code

ROOT = Path(__file__).resolve().parent
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     indent=2).encode()).hexdigest()


def current_content_hash(folder):
    pack = json.loads((folder / "paket.json").read_text())
    actual_assets = {}
    for name in pack["assets_sha256"]:
        file = (folder / name).resolve()
        if not file.is_relative_to(folder.resolve()) or not file.is_file():
            raise ValueError("Missing or invalid content asset")
        actual_assets[name] = hashlib.sha256(file.read_bytes()).hexdigest()
    return digest({"cards": pack["cards"], "assets_sha256": actual_assets,
                   "captions": pack["captions"], "targets": pack["targets"]})


class Decision(BaseModel):
    decision: str
    content_sha256: str
    note: str = ""


def create_app(output=None, db_path=None, password=None, connection_config=None, connection_transport=None):
    data_root=Path(os.environ.get('DATA_DIR',str(ROOT)))
    output = Path(output or data_root / "output").resolve()
    db_path = Path(db_path or data_root / "state/reviews.sqlite3")
    output.mkdir(parents=True,exist_ok=True)
    password = password or os.environ.get("REVIEW_PANEL_PASSWORD")
    if not password:
        raise RuntimeError("Set REVIEW_PANEL_PASSWORD securely before starting the panel.")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    lock = threading.Lock()
    database=Database(db_path,connection_config)
    objects=ObjectStore(database)
    with database.connect() as db:
        db.execute(f"""CREATE TABLE IF NOT EXISTS decisions (
            id {database.identity_column}, day TEXT NOT NULL, content_sha256 TEXT NOT NULL,
            decision TEXT NOT NULL, note TEXT NOT NULL, decided_at TEXT NOT NULL)""")
    security = HTTPBasic()

    def authorize(credentials: HTTPBasicCredentials = Depends(security)):
        user_ok = hmac.compare_digest(credentials.username.encode(), b"reviewer")
        pass_ok = hmac.compare_digest(credentials.password.encode(), password.encode())
        if not (user_ok and pass_ok):
            raise HTTPException(401, "Kimlik doğrulama gerekli.", headers={"WWW-Authenticate": "Basic"})

    app = FastAPI(title="Gümrük Koçu — Onay Paneli", docs_url=None, redoc_url=None,
                  openapi_url=None, dependencies=[Depends(authorize)])
    manager=SocialConnections(db_path,connection_config,connection_transport)
    app.include_router(connection_router(manager))

    @app.get('/api/automation/status')
    def automation_status():
        return {'persistent_storage':database.persistent,'timezone':'Europe/Istanbul',
                'code_import_available':SEALED_PACKAGE.is_file(),
                'prepared_pack_count':len(objects.days()),
                'scheduled_time':'10:00','scheduler_activation_verified':False,
                'publishing_enabled':False,**DailyPlanner(database).status()}

    @app.get('/automation',response_class=HTMLResponse)
    def automation_page():
        return AUTOMATION_HTML

    @app.post('/api/automation/bootstrap')
    async def bootstrap(request:Request):
        if not database.persistent:
            raise HTTPException(409,'Önce kalıcı veritabanı yetkilendirilmeli; özel içerik geçici denemeye aktarılmadı.')
        body=bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body)>24*1024*1024:raise HTTPException(413,'Aktarım paketi boyut sınırını aşıyor.')
        try:
            return import_bundle(database,bytes(body))
        except (ValueError,KeyError,zipfile.BadZipFile):
            raise HTTPException(400,'Özel aktarım paketi doğrulanamadı; paylaşım yapılmadı.') from None

    @app.post('/api/automation/bootstrap/code')
    async def bootstrap_code(request:Request):
        if not database.persistent:
            raise HTTPException(409,'Önce kalıcı veritabanı bağlanmalı; özel içerik geçici denemeye aktarılmadı.')
        body=bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body)>1024:raise HTTPException(413,'Aktarım kodu isteği çok uzun.')
        try:
            data=json.loads(body)
            if not isinstance(data,dict) or not isinstance(data.get('code'),str):raise ValueError()
            return import_with_code(database,data['code'])
        except FileNotFoundError:
            raise HTTPException(503,'Şifreli paket henüz bu sunucuda yok; son dağıtımın tamamlanması bekleniyor.') from None
        except (ValueError,KeyError,zipfile.BadZipFile):
            raise HTTPException(400,'Aktarım kodu veya paket doğrulanamadı. Kodun tamamını kopyalayın.') from None

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    def folder_for(day):
        if not DAY_RE.fullmatch(day):
            raise HTTPException(404)
        if database.persistent:objects.hydrate(day,output)
        folder = (output / day).resolve()
        if not folder.is_relative_to(output) or not (folder / "paket.json").is_file():
            raise HTTPException(404)
        return folder

    def describe(day):
        folder = folder_for(day)
        pack = json.loads((folder / "paket.json").read_text())
        actual_hash = current_content_hash(folder)
        valid = hmac.compare_digest(actual_hash, pack["content_sha256"])
        with database.connect() as db:
            record = db.execute("SELECT decision,note,decided_at,content_sha256 FROM decisions "
                                "WHERE day=? ORDER BY id DESC LIMIT 1", (day,)).fetchone()
        state = "draft"
        if not valid or (record and record[3] != actual_hash):
            state = "changed_requires_new_review"
        elif record:
            state = record[0]
        return {"date":day, "title":pack["title"], "review_status":state,
                "content_sha256":actual_hash, "manifest_valid":valid,
                "last_note":record[1] if record else "",
                "decided_at":record[2] if record else None,
                "publishing_status":"blocked_accounts_not_connected",
                "automatic_publishing_enabled":False}

    @app.get("/api/packages")
    def packages():
        days=objects.days() if database.persistent else [p.name for p in sorted(output.iterdir(),reverse=True)
            if p.is_dir() and DAY_RE.fullmatch(p.name) and (p/'paket.json').is_file()]
        return {"daily_preview_time":"10:00", "timezone":"Europe/Istanbul",
                "schedule_enabled":False,
                "persistent_storage":database.persistent,
                "packages":[describe(day) for day in days]}

    @app.post("/api/packages/{day}/review")
    def review(day: str, body: Decision):
        if body.decision not in ("approved", "rejected"):
            raise HTTPException(400, "Geçersiz karar.")
        if len(body.note) > 4000:
            raise HTTPException(400, "Not en fazla 4000 karakter olabilir.")
        with lock:
            item = describe(day)
            if not item["manifest_valid"] or not hmac.compare_digest(item["content_sha256"], body.content_sha256):
                raise HTTPException(409, "İçerik değişti. Yeni önizleme hazırlanıp tekrar incelenmeli.")
            now = datetime.now(ZoneInfo("Europe/Istanbul")).isoformat()
            with database.connect() as db:
                db.execute("INSERT INTO decisions(day,content_sha256,decision,note,decided_at) "
                           "VALUES (?,?,?,?,?)", (day, body.content_sha256, body.decision, body.note, now))
        return describe(day)

    @app.get("/files/{day}/{asset:path}")
    def files(day: str, asset: str):
        folder = folder_for(day)
        file = (folder / asset).resolve()
        if not file.is_relative_to(folder) or not file.is_file() or file.suffix not in (".html",".png",".jpg",".txt"):
            raise HTTPException(404)
        return FileResponse(file)

    @app.get("/", response_class=HTMLResponse)
    def index():
        if os.environ.get('DEMO_MODE','').lower()=='true' and not database.persistent:
            notice='<p class="notice"><strong>Ücretsiz deneme:</strong> Bu sürümde sunucu uykuya geçebilir; onaylar ve hesap bağlantıları yeniden başlatmada kaybolabilir. Günlük otomasyon henüz etkin değildir.</p>'
            return PANEL_HTML.replace('<main>','<main>'+notice)
        return PANEL_HTML

    return app


AUTOMATION_HTML='''<!doctype html><html lang="tr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Kalıcı kayıt ve zamanlama</title>
<style>body{max-width:900px;margin:30px auto;padding:20px;font:17px/1.6 system-ui,sans-serif;background:#f5f7fc;color:#142d59}button{font:inherit;background:#174fb3;color:white;padding:10px 18px;border:0;border-radius:8px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}section{background:white;padding:20px;border-radius:12px;margin:20px 0}input[type=password]{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c6e1;border-radius:8px;font:inherit}label{display:block;margin:12px 0}details{margin-top:25px}</style>
<h1>Kalıcı kayıt ve günlük hazırlık</h1><p><a href="/">← Onay paneli</a></p>
<section id="status">Kontrol ediliyor…</section>
<section id="import-section"><h2>Aktarım koduyla yükle</h2>
<p>Size ait aktarım kodunu yapıştırın. Hazır görseller ve tekrar engelleme geçmişi birlikte taşınır.</p>
<label for="code">Özel aktarım kodu</label><input id="code" type="password" maxlength="128" autocomplete="off" spellcheck="false">
<p><button id="code-import" disabled>Kodla aktar</button></p><p id="code-message" role="status"></p>
<details><summary>ZIP dosyasıyla aktarım</summary><input id="file" type="file" accept=".zip">
<p><button id="import" disabled>Özel paketi aktar</button></p><p id="message" role="status"></p></details></section>
<p>İçerik yalnızca taslak olarak hazırlanır. Otomatik sosyal paylaşım henüz etkin değildir.</p><script>
let durable=false,codeAvailable=false;
function buttons(busy){document.getElementById('import').disabled=busy||!durable;document.getElementById('code-import').disabled=busy||!durable||!codeAvailable;}
async function refresh(){
 const r=await fetch('/api/automation/status');if(!r.ok)throw new Error('Durum okunamadı.');const s=await r.json();durable=s.persistent_storage;codeAvailable=s.code_import_available;
 document.getElementById('import-section').hidden=s.source_fact_count>0&&s.reserved_fact_count>=8&&s.prepared_pack_count>=2;
 if(!codeAvailable)document.getElementById('code-message').textContent='Kodlu aktarım için hazır paketin yüklenmesi bekleniyor.';
 document.getElementById('status').textContent=(durable?'Kalıcı veritabanı bağlı. ':'Kalıcı veritabanı bekleniyor. ')+'Kaynak: '+s.source_fact_count+' bilgi; tekrar dışında: '+s.reserved_fact_count+' bilgi. Günlük saat: 10.00 Türkiye. Zamanlayıcının canlı etkinliği henüz doğrulanmadı.';buttons(false);
}
document.getElementById('code-import').onclick=async()=>{
 const input=document.getElementById('code');const m=document.getElementById('code-message');const code=input.value.trim();
 if(!code){m.textContent='Aktarım kodunu yapıştırın.';return;}buttons(true);m.textContent='Hazır paketler aktarılıyor…';
 try{const r=await fetch('/api/automation/bootstrap/code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
 const data=await r.json();if(!r.ok)throw new Error(data.detail||'Aktarım tamamlanamadı.');input.value='';
 m.textContent=data.prepared_packs+' hazır paket ve kullanım geçmişi aktarıldı. ';
 const link=document.createElement('a');link.href='/';link.textContent='Onay panelini aç';m.append(link);await refresh();
 }catch(e){m.textContent=e.message||'Aktarım tamamlanamadı; tekrar deneyin.';}finally{buttons(false);}
};
document.getElementById('import').onclick=async()=>{
 const file=document.getElementById('file').files[0];const m=document.getElementById('message');if(!file){m.textContent='Özel aktarım dosyasını seçin.';return;}
 buttons(true);m.textContent='Aktarılıyor…';try{const r=await fetch('/api/automation/bootstrap',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});
 if(!r.ok)throw new Error('Aktarım tamamlanamadı. Paket ve kalıcı veritabanı ayarlarını kontrol edin.');
 m.textContent='Kaynak havuzu ve mevcut paketler alındı. Paylaşım yapılmadı.';await refresh();}catch(e){m.textContent=e.message;}finally{buttons(false);}
};
refresh().catch(()=>document.getElementById('status').textContent='Durum okunamadı.');
</script></html>'''


PANEL_HTML = '''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gümrük Koçu · Onay paneli</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f5ec;color:#163a36;font:16px/1.55 system-ui,sans-serif}header{padding:25px 30px;background:#133936;color:#f8f5ec}header p{margin:8px 0 0;color:#d9ed8d}main{max-width:1380px;margin:auto;padding:25px}button,a{color:inherit}button{background:#163a36;color:#f8f5ec;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}button.reject{background:#774c3c}button:disabled{opacity:.4;cursor:not-allowed}section{padding:20px;border:1px solid #cbd3c5;border-radius:12px;margin:20px 0;background:#fffdf7}textarea{width:100%;font:inherit;padding:10px;margin:15px 0;min-height:80px;border:1px solid #cbd3c5;border-radius:8px}iframe{width:100%;height:75vh;min-height:480px;border:1px solid #cbd3c5;border-radius:10px;background:#fff}.notice{padding:14px 18px;background:#e8eddd;border-radius:8px}h1{margin:0;font-size:25px}h2{margin:0 0 10px}.actions{display:flex;gap:10px;flex-wrap:wrap}.tag{font-weight:700}#messages{padding:12px 0}label{display:block;margin:12px 0}a:focus,button:focus{outline:3px solid #e8a07c;outline-offset:3px}</style>
<header><h1>UFUK ÇETİNTAŞ · Onay paneli</h1><p>Günlük tercih: 10.00 · Türkiye saati</p><p><a href="/connections">Hesap bağlantıları →</a> · <a href="/automation">Günlük hazırlık durumu →</a></p></header><main><p class="notice">Kararlar kaydedilir. Günlük zamanlayıcı ve otomatik paylaşım henüz etkin değildir. Hesap bağlantılarını ayrı ekrandan yönetebilirsiniz. Verdiğiniz onay yalnızca incelenen içerik sürümünü kapsar.</p><div id="messages" role="status" aria-live="polite"></div><div id="packs"></div></main>
<script>
const labels={draft:'Onay bekliyor',approved:'Onaylandı · hesap bağlantısı bekleniyor',rejected:'Düzeltme istendi',changed_requires_new_review:'İçerik değişti · yeniden inceleme gerekli'};
function el(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e}
async function load(){
 const response=await fetch('/api/packages');if(!response.ok)throw new Error('Paketler yüklenemedi.');const data=await response.json();const root=document.getElementById('packs');root.replaceChildren();
 if(!data.packages.length){root.append(el('p','Henüz hazırlanmış paket yok.'));return;}
 for(const p of data.packages){const section=el('section');section.append(el('h2',p.date+' · '+p.title),el('p',labels[p.review_status]||p.review_status,'tag'));
 const link=el('a','Önizlemeyi ayrı sekmede aç');link.href='/files/'+p.date+'/onizleme.html';link.target='_blank';link.rel='noopener';section.append(link);
 const frame=el('iframe');frame.title=p.date+' içerik önizlemesi';frame.src=link.href;frame.loading='lazy';section.append(frame);
 const note=el('textarea');note.placeholder='Düzeltme notunuz (isteğe bağlı)';note.setAttribute('aria-label','Düzeltme notu');note.value=p.last_note;section.append(note);
 const check=el('input');check.type='checkbox';const label=el('label');label.append(check,document.createTextNode(' Dört kartı, kaynakları ve platform metinlerini inceledim.'));section.append(label);
 const actions=el('div',null,'actions');const approve=el('button','Bu içerik sürümünü onayla');approve.disabled=true;const reject=el('button','Düzeltme iste','reject');reject.disabled=!p.manifest_valid;
 check.addEventListener('change',()=>approve.disabled=!check.checked||!p.manifest_valid);
 async function submit(decision){approve.disabled=true;reject.disabled=true;try{const r=await fetch('/api/packages/'+p.date+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,content_sha256:p.content_sha256,note:note.value})});const body=await r.json();if(!r.ok)throw new Error(body.detail||'Karar kaydedilemedi.');document.getElementById('messages').textContent=decision==='approved'?'Onay kaydedildi. Hesaplar bağlı olmadığı için paylaşım yapılmadı.':'Düzeltme isteğiniz kaydedildi.';await load();}catch(e){document.getElementById('messages').textContent=e.message;approve.disabled=!check.checked||!p.manifest_valid;reject.disabled=!p.manifest_valid;}}
 approve.onclick=()=>submit('approved');reject.onclick=()=>submit('rejected');actions.append(approve,reject);section.append(actions);root.append(section);}
}
load().catch(e=>document.getElementById('messages').textContent=e.message);
</script></html>'''


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    uvicorn.run(create_app(), host=args.host, port=args.port, access_log=False)
