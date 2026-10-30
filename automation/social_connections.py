"""Confidential OAuth account linking. Connecting an account never publishes a post.

Provider requests are isolated for testing; real credentials are entered in secure
hosting/environment settings, never in chat or source files.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
from urllib.parse import urlencode, urlsplit

from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
import httpx


class ConnectionFailure(Exception):
    """A deliberately redacted, user-safe failure."""


PROVIDERS={
    'instagram':{
        'label':'Instagram', 'id_env':'INSTAGRAM_APP_ID', 'secret_env':'INSTAGRAM_APP_SECRET',
        'authorization':'https://www.instagram.com/oauth/authorize',
        'token':'https://api.instagram.com/oauth/access_token',
        'identity':'https://graph.instagram.com/me',
        'scopes':['instagram_business_basic','instagram_business_content_publish'],
    },
    'linkedin':{
        'label':'LinkedIn','id_env':'LINKEDIN_CLIENT_ID','secret_env':'LINKEDIN_CLIENT_SECRET',
        'authorization':'https://www.linkedin.com/oauth/v2/authorization',
        'token':'https://www.linkedin.com/oauth/v2/accessToken',
        'identity':'https://api.linkedin.com/v2/userinfo',
        'scopes':['openid','profile','w_member_social'],
    },
}


def public_base_url(config):
    value=(config.get('PUBLIC_BASE_URL') or config.get('RENDER_EXTERNAL_URL') or '').rstrip('/')
    if not value:
        return None
    parsed=urlsplit(value)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
        raise ConnectionFailure('PUBLIC_BASE_URL, herkese açık HTTPS kök adresi olmalıdır.')
    return value


class ConnectionStore:
    def __init__(self,db_path,config):
        self.db_path=Path(db_path)
        self.db_path.parent.mkdir(parents=True,exist_ok=True)
        supplied=config.get('TOKEN_ENCRYPTION_KEY')
        if supplied:
            if len(supplied)<32:
                raise ConnectionFailure('TOKEN_ENCRYPTION_KEY en az 32 rastgele karakter olmalıdır.')
            key=base64.urlsafe_b64encode(hashlib.sha256(supplied.encode()).digest())
        else:
            # Local development: preserve a private local key, never export it.
            keyfile=self.db_path.parent/'private'/'connection.key'
            keyfile.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            try:
                fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            except FileExistsError:
                key=keyfile.read_bytes()
            else:
                key=Fernet.generate_key()
                with os.fdopen(fd,'wb') as stream:
                    stream.write(key)
        self.cipher=Fernet(key)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS oauth_states (
                    state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL,expires_at INTEGER NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS social_accounts (
                    provider TEXT PRIMARY KEY,account_id TEXT NOT NULL,display_name TEXT NOT NULL,
                    encrypted_token BLOB NOT NULL,scopes TEXT NOT NULL,permissions_confirmed INTEGER NOT NULL,
                    expires_at INTEGER,connected_at TEXT NOT NULL);
            ''')

    def connect(self):
        return sqlite3.connect(self.db_path,timeout=15)

    def new_state(self,provider):
        state=secrets.token_urlsafe(32)
        hashed=hashlib.sha256(state.encode()).hexdigest()
        with self.connect() as db:
            db.execute('DELETE FROM oauth_states WHERE expires_at<?',(int(time.time()),))
            db.execute('INSERT INTO oauth_states(state_hash,provider,expires_at) VALUES (?,?,?)',
                       (hashed,provider,int(time.time())+600))
        return state

    def consume_state(self,state,provider):
        if not state or len(state)>512:
            raise ConnectionFailure('Bağlantı isteği geçersiz veya süresi dolmuş. Yeniden başlatın.')
        with self.connect() as db:
            cursor=db.execute('UPDATE oauth_states SET used=1 WHERE state_hash=? AND provider=? AND used=0 AND expires_at>=?',
                (hashlib.sha256(state.encode()).hexdigest(),provider,int(time.time())))
            if cursor.rowcount!=1:
                raise ConnectionFailure('Bağlantı isteği geçersiz veya süresi dolmuş. Yeniden başlatın.')

    def save(self,provider,account_id,display_name,token,scopes,confirmed,expires_at):
        encrypted=self.cipher.encrypt(token.encode())
        with self.connect() as db:
            db.execute('''INSERT OR REPLACE INTO social_accounts
                (provider,account_id,display_name,encrypted_token,scopes,permissions_confirmed,expires_at,connected_at)
                VALUES (?,?,?,?,?,?,?,?)''',
                (provider,account_id,display_name,encrypted,json.dumps(scopes),int(confirmed),expires_at,
                 datetime.now(timezone.utc).isoformat()))

    def status(self,provider):
        with self.connect() as db:
            row=db.execute('SELECT account_id,display_name,scopes,permissions_confirmed,expires_at,connected_at FROM social_accounts WHERE provider=?',
                           (provider,)).fetchone()
        if not row:
            return {'connected':False}
        expired=row[4] is not None and row[4]<=int(time.time())
        return {'connected':not expired,'expired':expired,'account_id':row[0],
                'display_name':row[1],'granted_scopes':json.loads(row[2]),
                'permissions_confirmed':bool(row[3]),'expires_at':row[4],'connected_at':row[5]}

    def disconnect(self,provider):
        with self.connect() as db:
            db.execute('DELETE FROM social_accounts WHERE provider=?',(provider,))


class SocialConnections:
    def __init__(self,db_path,config=None,transport=None):
        self.config=dict(os.environ if config is None else config)
        expected=self.config.get('INSTAGRAM_EXPECTED_USERNAME','')
        local_config=Path(__file__).with_name('config.json')
        configured=json.loads(local_config.read_text()) if config is None and local_config.exists() else {}
        if not expected:
            expected=configured.get('instagram',{}).get('username','')
        self.linkedin_profile_url=self.config.get('LINKEDIN_PROFILE_URL') or configured.get('linkedin',{}).get('profile_url')
        self.expected_instagram_username=expected.strip().lstrip('@').casefold()
        self.store=ConnectionStore(db_path,self.config)
        self.transport=transport

    def configuration(self,provider):
        spec=PROVIDERS[provider]
        missing=[key for key in (spec['id_env'],spec['secret_env']) if not self.config.get(key)]
        try:
            base=public_base_url(self.config)
        except ConnectionFailure:
            base=None
        if not base:
            missing.append('PUBLIC_BASE_URL')
        return missing,base

    def statuses(self):
        output={}
        for provider,spec in PROVIDERS.items():
            missing,base=self.configuration(provider)
            output[provider]={**self.store.status(provider),'label':spec['label'],
                'configuration_ready':not missing,'missing_settings':missing,
                'callback_url':base+f'/auth/{provider}/callback' if base else None,
                'requested_scopes':spec['scopes'],'publishing_enabled':False}
            if provider=='instagram':
                output[provider]['expected_username']=self.expected_instagram_username or None
                linked=output[provider].get('display_name','').lstrip('@').casefold()
                if output[provider].get('connected') and self.expected_instagram_username and linked!=self.expected_instagram_username:
                    output[provider].update({'connected':False,'account_mismatch':True})
            elif provider=='linkedin':
                # A public vanity URL is a reference, never a member ID or proof of OAuth ownership.
                output[provider]['reference_profile_url']=self.linkedin_profile_url
        output['whatsapp']={'label':'WhatsApp grubu','connected':False,
            'configuration_ready':False,'publishing_enabled':False,
            'status':'group_api_eligibility_not_verified',
            'message':'Mevcut WhatsApp grubuna resmî API ile paylaşım uygunluğu henüz doğrulanmadı. Bireysel mesaj kimlik bilgileri grup bağlantısı olarak gösterilmez.'}
        return output

    def start(self,provider):
        spec=PROVIDERS.get(provider)
        if not spec:
            raise ConnectionFailure('Bu hedef için doğrulanmış bağlantı yöntemi yok.')
        missing,base=self.configuration(provider)
        if missing:
            raise ConnectionFailure('Gerekli uygulama ve HTTPS ayarları tamamlanmalı: '+', '.join(missing))
        state=self.store.new_state(provider)
        query={'client_id':self.config[spec['id_env']],
               'redirect_uri':base+f'/auth/{provider}/callback',
               'response_type':'code','state':state,
               'scope':(','.join(spec['scopes']) if provider=='instagram' else ' '.join(spec['scopes']))}
        if provider=='instagram':
            query.update({'enable_fb_login':'0','force_authentication':'1'})
        return spec['authorization']+'?'+urlencode(query)

    def _json(self,response):
        if response.status_code>=400:
            raise ConnectionFailure('Platform yetkilendirmeyi tamamlayamadı. Uygulama izinlerini ve yönlendirme adresini kontrol edin.')
        try:
            data=response.json()
        except ValueError:
            raise ConnectionFailure('Platformdan geçerli bir yanıt alınamadı.') from None
        if not isinstance(data,dict) or data.get('error'):
            raise ConnectionFailure('Platform yetkilendirme yanıtı geçersiz.')
        return data

    def complete(self,provider,state,code,error=None):
        spec=PROVIDERS.get(provider)
        if not spec:
            raise ConnectionFailure('Geçersiz platform.')
        self.store.consume_state(state,provider)
        if error or not code:
            raise ConnectionFailure('Hesap bağlantısına izin verilmedi. Bağlantı yeniden başlatılabilir.')
        missing,base=self.configuration(provider)
        if missing:
            raise ConnectionFailure('Uygulama ayarları eksik.')
        fields={'client_id':self.config[spec['id_env']],
                'client_secret':self.config[spec['secret_env']],
                'redirect_uri':base+f'/auth/{provider}/callback',
                'code':code,'grant_type':'authorization_code'}
        try:
            with httpx.Client(transport=self.transport,timeout=25,follow_redirects=False,trust_env=True) as client:
                raw=self._json(client.post(spec['token'],data=fields))
                if isinstance(raw.get('data'),list):
                    raw=raw['data'][0] if raw['data'] else {}
                access_token=raw.get('access_token')
                if not isinstance(access_token,str) or not access_token:
                    raise ConnectionFailure('Platform erişim izni alınamadı.')
                expires_in=raw.get('expires_in')
                granted=raw.get('scope') or raw.get('permissions') or []
                if isinstance(granted,str):
                    granted=granted.replace(',',' ').split()
                if not isinstance(granted,list):
                    granted=[]
                confirmed=set(spec['scopes']).issubset(set(granted))
                if provider=='instagram':
                    # Exchange a short-lived Instagram token for its supported long-lived form.
                    long_data=self._json(client.get('https://graph.instagram.com/access_token',params={
                        'grant_type':'ig_exchange_token','client_secret':self.config[spec['secret_env']],
                        'access_token':access_token}))
                    access_token=long_data.get('access_token')
                    if not isinstance(access_token,str) or not access_token:
                        raise ConnectionFailure('Uzun süreli Instagram izni alınamadı.')
                    expires_in=long_data.get('expires_in',expires_in)
                    profile=self._json(client.get(spec['identity'],
                        params={'fields':'user_id,username'},headers={'Authorization':'Bearer '+access_token}))
                    account_id=str(profile.get('user_id') or profile.get('id') or '')
                    display_name=str(profile.get('username') or '')
                else:
                    profile=self._json(client.get(spec['identity'],headers={'Authorization':'Bearer '+access_token}))
                    account_id=str(profile.get('sub') or '')
                    display_name=str(profile.get('name') or profile.get('given_name') or '')
                if not account_id or not display_name:
                    raise ConnectionFailure('Hesap kimliği doğrulanamadı; bağlantı kaydedilmedi.')
                if provider=='instagram' and self.expected_instagram_username and display_name.lstrip('@').casefold()!=self.expected_instagram_username:
                    raise ConnectionFailure('Yetkilendirilen Instagram hesabı hedef hesapla eşleşmiyor. @'+self.expected_instagram_username+' hesabıyla yeniden giriş yapın.')
                expires_at=int(time.time())+int(expires_in) if expires_in is not None else None
                self.store.save(provider,account_id,display_name,access_token,granted,confirmed,expires_at)
        except httpx.HTTPError:
            # Never echo request URLs, query parameters, response bodies or token values.
            raise ConnectionFailure('Platforma erişilemedi. Ağ ayarları kontrol edilip bağlantı yeniden başlatılmalı.') from None
        except (TypeError,ValueError):
            raise ConnectionFailure('Platform yanıtındaki kimlik veya süre bilgisi geçersiz.') from None
        return self.store.status(provider)


def connection_router(manager):
    router=APIRouter()

    @router.get('/api/connections')
    def status():
        return {'accounts':manager.statuses(),'posting_enabled':False}

    @router.get('/connections',response_class=HTMLResponse)
    def page():
        import html
        reference=''
        if manager.linkedin_profile_url:
            reference='<p>LinkedIn hedef profili: <code>'+html.escape(manager.linkedin_profile_url)+'</code></p>'
        return CONNECTION_HTML.replace('<div id="accounts">',reference+'<div id="accounts">')

    @router.get('/auth/{provider}/start')
    def start(provider:str):
        try:
            return RedirectResponse(manager.start(provider),status_code=303)
        except ConnectionFailure as error:
            raise HTTPException(409,str(error)) from None

    @router.get('/auth/{provider}/callback',response_class=HTMLResponse)
    def callback(provider:str,state:str='',code:str='',error:str|None=None):
        try:
            manager.complete(provider,state,code,error)
        except ConnectionFailure as failure:
            import html
            return HTMLResponse('<h1>Bağlantı tamamlanamadı</h1><p>'+html.escape(str(failure))+'</p><a href="/connections">Bağlantılara dön</a>',status_code=400)
        return RedirectResponse('/connections',status_code=303)

    @router.delete('/api/connections/{provider}')
    def disconnect(provider:str):
        if provider not in PROVIDERS:
            raise HTTPException(404)
        manager.store.disconnect(provider)
        return {'connected':False}

    return router


CONNECTION_HTML='''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ufuk Çetintaş — Hesap bağlantıları</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#142d59;font:16px/1.6 system-ui,sans-serif}header{background:#142d59;color:white;padding:24px}main{max-width:1000px;margin:30px auto;padding:0 22px}h1{margin:0;font-size:27px}section{border:1px solid #d5deed;border-radius:14px;padding:22px;margin:20px 0;background:white}.state{font-weight:700}.notice{padding:16px;background:#e8effa;border-radius:12px}a.button,button{display:inline-block;border:0;border-radius:8px;padding:11px 18px;background:#174fb3;color:white;text-decoration:none;font:inherit;cursor:pointer}button.secondary{background:#626d7f}code{word-break:break-all}label{display:block}a{color:inherit}.muted{color:#586980;font-size:14px}</style><header><h1>UFUK ÇETİNTAŞ · Hesap bağlantıları</h1></header><main><p><a href="/">← Onay paneli</a></p><p class="notice">Hesabınıza platformun kendi sayfasında giriş yaparsınız. Burada hesap şifreniz istenmez. Hesap bağlantısı kurmak içerik yayımlamaz; günlük içerik onayı ayrıca korunur.</p><div id="accounts"></div><p class="muted">Bu sürümde otomatik paylaşım etkin değildir. Platform izinleri gerçek hesapla doğrulandıktan sonra yayın adımı tamamlanacaktır.</p></main><script>
const names={instagram:'Instagram · profesyonel hesap',linkedin:'LinkedIn · kişisel profil',whatsapp:'WhatsApp · grup'};
function el(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e}
async function load(){const r=await fetch('/api/connections');if(!r.ok)throw new Error('Bağlantılar yüklenemedi.');const d=await r.json();const root=document.getElementById('accounts');root.replaceChildren();for(const [key,s] of Object.entries(d.accounts)){const box=el('section');box.append(el('h2',names[key]));box.append(el('p',s.connected?'Bağlı: '+s.display_name:(s.expired?'İzin süresi dolmuş; yeniden bağlayın.':'Henüz bağlı değil.')));if(key==='whatsapp'){box.append(el('p',s.message));}else if(s.configuration_ready){const a=el('a',s.connected?'Hesabı yeniden bağla':s.label+' hesabını bağla');a.className='button';a.href='/auth/'+key+'/start';box.append(a);}else{box.append(el('p','Önce güvenli HTTPS yayını ve platform uygulama ayarları tamamlanmalı.'));const details=el('details');details.append(el('summary','Kurulum için eksik ayarlar'),el('p',s.missing_settings.join(', ')));box.append(details);}if(s.callback_url){box.append(el('p','Uygulama yönlendirme adresi:'));box.append(el('code',s.callback_url));}if(s.connected){box.append(el('p',s.permissions_confirmed?'İstenen izinler platform yanıtında doğrulandı.':'Hesap kimliği doğrulandı; yayın izinlerinin kapsamı ayrıca teyit edilecek.'));const b=el('button','Bağlantıyı kaldır');b.className='secondary';b.onclick=async()=>{const r=await fetch('/api/connections/'+key,{method:'DELETE'});if(!r.ok)throw new Error('Bağlantı kaldırılamadı.');await load()};box.append(b);}root.append(box);}}
load().catch(error=>document.getElementById('accounts').textContent=error.message);
</script></html>'''
