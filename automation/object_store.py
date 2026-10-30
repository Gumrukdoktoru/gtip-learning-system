"""Private posters/manifests in the same durable DB; no public repository payloads."""
from datetime import datetime,timezone
import hashlib
import json
import re

DAY=re.compile(r'^\d{4}-\d{2}-\d{2}$')


class ObjectStore:
    def __init__(self,database):
        self.database=database
        with database.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS pack_objects (
                path TEXT PRIMARY KEY,body BLOB NOT NULL,media_type TEXT NOT NULL,
                sha256 TEXT NOT NULL,updated_at TEXT NOT NULL)''')

    def put(self,path,body,media_type):
        if not isinstance(body,bytes):raise ValueError('Object payload must be bytes')
        with self.database.connect() as db:
            db.execute('''INSERT INTO pack_objects(path,body,media_type,sha256,updated_at)
                VALUES (?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET
                body=excluded.body,media_type=excluded.media_type,sha256=excluded.sha256,
                updated_at=excluded.updated_at''',
                (path,body,media_type,hashlib.sha256(body).hexdigest(),datetime.now(timezone.utc).isoformat()))

    def get(self,path):
        with self.database.connect() as db:
            row=db.execute('SELECT body,media_type,sha256 FROM pack_objects WHERE path=?',(path,)).fetchone()
        if row is None:return None
        body=bytes(row[0])
        if hashlib.sha256(body).hexdigest()!=row[2]:raise ValueError('Stored object checksum mismatch')
        return body,row[1]

    def days(self):
        with self.database.connect() as db:
            rows=db.execute("SELECT path FROM pack_objects WHERE path LIKE ?",('%/paket.json',)).fetchall()
        return sorted({r[0].split('/')[0] for r in rows if DAY.fullmatch(r[0].split('/')[0])},reverse=True)

    def hydrate(self,day,output):
        if not DAY.fullmatch(day):raise ValueError('Invalid day')
        manifest=self.get(day+'/paket.json')
        if manifest is None:return False
        pack=json.loads(manifest[0])
        folder=(output/day).resolve()
        folder.mkdir(parents=True,exist_ok=True)
        wanted=[('paket.json',manifest[0])]
        for name in [*pack['assets_sha256'],'onizleme.html','metinler.txt']:
            target=(folder/name).resolve()
            if not target.is_relative_to(folder):raise ValueError('Invalid object path')
            entry=self.get(day+'/'+name)
            if entry is None:
                if name in pack['assets_sha256']:raise ValueError('Required image missing')
                continue
            if name in pack['assets_sha256'] and hashlib.sha256(entry[0]).hexdigest()!=pack['assets_sha256'][name]:
                raise ValueError('Poster does not match its manifest')
            wanted.append((name,entry[0]))
        for name,body in wanted:
            target=folder/name;target.parent.mkdir(parents=True,exist_ok=True)
            temp=target.with_suffix(target.suffix+'.tmp');temp.write_bytes(body);temp.replace(target)
        return True
