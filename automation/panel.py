"""Authenticated approval panel with explicit OAuth account-linking routes."""
import argparse
from datetime import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from social_connections import SocialConnections, connection_router

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
    with sqlite3.connect(db_path) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY, day TEXT NOT NULL, content_sha256 TEXT NOT NULL,
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
        folder = (output / day).resolve()
        if not folder.is_relative_to(output) or not (folder / "paket.json").is_file():
            raise HTTPException(404)
        return folder

    def describe(day):
        folder = folder_for(day)
        pack = json.loads((folder / "paket.json").read_text())
        actual_hash = current_content_hash(folder)
        valid = hmac.compare_digest(actual_hash, pack["content_sha256"])
        with sqlite3.connect(db_path) as db:
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
        return {"daily_preview_time":"10:00", "timezone":"Europe/Istanbul",
                "schedule_enabled":False,
                "packages":[describe(p.name) for p in sorted(output.iterdir(), reverse=True)
                            if p.is_dir() and DAY_RE.fullmatch(p.name)
                            and (p / "paket.json").is_file()]}

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
            with sqlite3.connect(db_path) as db:
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
        if os.environ.get('DEMO_MODE','').lower()=='true':
            notice='<p class="notice"><strong>Ücretsiz deneme:</strong> Bu sürümde sunucu uykuya geçebilir; onaylar ve hesap bağlantıları yeniden başlatmada kaybolabilir. Günlük otomasyon henüz etkin değildir.</p>'
            return PANEL_HTML.replace('<main>','<main>'+notice)
        return PANEL_HTML

    return app


PANEL_HTML = '''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gümrük Koçu · Onay paneli</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f5ec;color:#163a36;font:16px/1.55 system-ui,sans-serif}header{padding:25px 30px;background:#133936;color:#f8f5ec}header p{margin:8px 0 0;color:#d9ed8d}main{max-width:1380px;margin:auto;padding:25px}button,a{color:inherit}button{background:#163a36;color:#f8f5ec;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}button.reject{background:#774c3c}button:disabled{opacity:.4;cursor:not-allowed}section{padding:20px;border:1px solid #cbd3c5;border-radius:12px;margin:20px 0;background:#fffdf7}textarea{width:100%;font:inherit;padding:10px;margin:15px 0;min-height:80px;border:1px solid #cbd3c5;border-radius:8px}iframe{width:100%;height:75vh;min-height:480px;border:1px solid #cbd3c5;border-radius:10px;background:#fff}.notice{padding:14px 18px;background:#e8eddd;border-radius:8px}h1{margin:0;font-size:25px}h2{margin:0 0 10px}.actions{display:flex;gap:10px;flex-wrap:wrap}.tag{font-weight:700}#messages{padding:12px 0}label{display:block;margin:12px 0}a:focus,button:focus{outline:3px solid #e8a07c;outline-offset:3px}</style>
<header><h1>UFUK ÇETİNTAŞ · Onay paneli</h1><p>Günlük tercih: 10.00 · Türkiye saati</p><p><a href="/connections">Hesap bağlantıları →</a></p></header><main><p class="notice">Kararlar kaydedilir. Günlük zamanlayıcı ve otomatik paylaşım henüz etkin değildir. Hesap bağlantılarını ayrı ekrandan yönetebilirsiniz. Verdiğiniz onay yalnızca incelenen içerik sürümünü kapsar.</p><div id="messages" role="status" aria-live="polite"></div><div id="packs"></div></main>
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
