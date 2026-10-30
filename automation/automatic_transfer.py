"""Private source handoff to the already-authorized worker, without user copying.

Only the recipient PUBLIC key is announced. The private key stays wrapped in
the private database and is deleted after a verified, idempotent import.
"""
import base64
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey,X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from database import Database
from daily_planner import DailyPlanner
from object_store import ObjectStore
from private_import import import_bundle

MAGIC=b'GKAUTO1'
SLOT='prepared-packs-2026-10-30'
PACKAGE=Path(__file__).resolve().parent/'assets/automatic-bootstrap.enc'
MAX_SIZE=24*1024*1024+128


def derive(secret,salt,context):
    return HKDF(algorithm=hashes.SHA256(),length=32,salt=salt,info=context).derive(secret)


def seal_for_recipient(body,public_code):
    """Public-key encryption: no existing owner code or private key is exported."""
    recipient=base64.b64decode(public_code,altchars=b'-_',validate=True)
    if len(recipient)!=32 or len(body)>24*1024*1024:raise ValueError('Invalid transfer material')
    ephemeral=X25519PrivateKey.generate();public=ephemeral.public_key().public_bytes_raw()
    salt=secrets.token_bytes(16);nonce=secrets.token_bytes(12)
    header=MAGIC+recipient+public+salt+nonce
    shared=ephemeral.exchange(X25519PublicKey.from_public_bytes(recipient))
    key=derive(shared,salt,b'gumruk-source-transfer-v1'+recipient+public)
    return header+AESGCM(key).encrypt(nonce,body,header)


class PrivateTransfer:
    def __init__(self,database,wrapping_secret=None):
        self.database=database
        secret=wrapping_secret if wrapping_secret is not None else database.url
        if not secret:raise RuntimeError('Private storage authorization is required')
        self.wrapping_secret=secret.encode()
        with database.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS private_transfers (
                slot TEXT PRIMARY KEY,public_key TEXT NOT NULL,wrapped_private BLOB,
                wrap_salt BLOB,wrap_nonce BLOB,state TEXT NOT NULL,
                payload_sha256 TEXT,created_at TEXT NOT NULL,completed_at TEXT)''')

    def _row(self,db):
        return db.execute('''SELECT public_key,wrapped_private,wrap_salt,wrap_nonce,state
            FROM private_transfers WHERE slot=?''',(SLOT,)).fetchone()

    def recipient(self):
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            row=self._row(db)
            if row:return row[0]
            private=X25519PrivateKey.generate()
            public=base64.urlsafe_b64encode(private.public_key().public_bytes_raw()).decode()
            salt=secrets.token_bytes(16);nonce=secrets.token_bytes(12)
            key=derive(self.wrapping_secret,salt,b'gumruk-transfer-key-wrap-v1')
            wrapped=AESGCM(key).encrypt(nonce,private.private_bytes_raw(),SLOT.encode())
            db.execute('''INSERT INTO private_transfers
                (slot,public_key,wrapped_private,wrap_salt,wrap_nonce,state,created_at)
                VALUES (?,?,?,?,?,?,?)''',(SLOT,public,wrapped,salt,nonce,'pending',datetime.now(timezone.utc).isoformat()))
            return public

    def summary(self,status):
        counts=DailyPlanner(self.database).status()
        return {'status':status,'facts':counts['source_fact_count'],
                'used':counts['reserved_fact_count'],'packs':len(ObjectStore(self.database).days()),'published':False}

    def run(self,path=None):
        public=self.recipient()
        with self.database.connect() as db:row=self._row(db)
        if row[4]=='complete':return self.summary('private_sources_ready')
        path=Path(path or PACKAGE)
        waiting={'status':'awaiting_encrypted_payload','public_key':public,'published':False}
        if not path.is_file():return waiting
        if path.stat().st_size>MAX_SIZE:raise ValueError('Transfer payload too large')
        envelope=path.read_bytes();offset=len(MAGIC)
        if not envelope.startswith(MAGIC) or len(envelope)<offset+32+32+16+12+16:
            raise ValueError('Invalid encrypted transfer')
        recipient=envelope[offset:offset+32];offset+=32
        if recipient!=base64.urlsafe_b64decode(public):return waiting
        peer=envelope[offset:offset+32];offset+=32
        salt=envelope[offset:offset+16];offset+=16
        nonce=envelope[offset:offset+12];offset+=12
        wrap_key=derive(self.wrapping_secret,bytes(row[2]),b'gumruk-transfer-key-wrap-v1')
        private_raw=AESGCM(wrap_key).decrypt(bytes(row[3]),bytes(row[1]),SLOT.encode())
        private=X25519PrivateKey.from_private_bytes(private_raw)
        key=derive(private.exchange(X25519PublicKey.from_public_bytes(peer)),salt,
                   b'gumruk-source-transfer-v1'+recipient+peer)
        plaintext=AESGCM(key).decrypt(nonce,envelope[offset:],envelope[:offset])
        imported=import_bundle(self.database,plaintext)
        with self.database.connect() as db:
            db.execute('''UPDATE private_transfers SET wrapped_private=NULL,wrap_salt=NULL,
                wrap_nonce=NULL,state=?,payload_sha256=?,completed_at=? WHERE slot=?''',
                ('complete',hashlib.sha256(envelope).hexdigest(),datetime.now(timezone.utc).isoformat(),SLOT))
        return {**self.summary('private_sources_imported'),'imported_packs':imported['prepared_packs']}


if __name__=='__main__':
    if not os.environ.get('DATABASE_URL'):
        print('::error::Özel aktarım için kalıcı veritabanı yetkisi eksik.')
        raise SystemExit(2)
    try:result=PrivateTransfer(Database('/tmp/unused-transfer.sqlite3')).run()
    except Exception:
        print('::error::Özel aktarım tamamlanamadı; gizli bağlantı veya anahtar değerleri günlüğe yazılmadı.')
        raise SystemExit(1)
    if result['status']=='awaiting_encrypted_payload':
        print('::notice::PRIVATE_TRANSFER_PUBLIC_KEY: '+result['public_key'])
    else:
        print('::notice::PRIVATE_TRANSFER_READY: facts='+str(result['facts'])+'; packs='+str(result['packs'])+'; used='+str(result['used']))
    print(json.dumps(result))
