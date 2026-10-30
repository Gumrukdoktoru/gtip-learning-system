import base64
from io import BytesIO
import json
from pathlib import Path
import secrets
import tempfile
import unittest
import zipfile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient

from card_renderer import build_draft
from daily_planner import DailyPlanner
from database import Database
from object_store import ObjectStore
from panel import create_app
from sealed_bootstrap import AAD,MAGIC,MAX_SIZE,import_with_code,open_bundle
from test_daily import facts


class SealedBootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pool=facts(4);day='2026-11-01';_,assets=build_draft(day,pool)
        used=[{'id':f['id'],'semantic_key':f['semantic_key'],'day':day} for f in pool]
        out=BytesIO()
        with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('facts.json',json.dumps({'facts':pool,'used':used}))
            for name,(body,_) in assets.items():z.writestr('packs/'+day+'/'+name,body)
        cls.bundle=out.getvalue()

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.database=Database(self.root/'test.sqlite3',{})
        key=AESGCM.generate_key(bit_length=256);self.code=base64.urlsafe_b64encode(key).decode()
        nonce=secrets.token_bytes(12)
        self.path=self.root/'fixture.enc';self.path.write_bytes(MAGIC+nonce+AESGCM(key).encrypt(nonce,self.bundle,AAD))

    def tearDown(self):self.temp.cleanup()

    def test_owner_code_restores_exact_bundle_and_replay_preserves_usage(self):
        self.assertEqual(open_bundle(self.code,self.path),self.bundle)
        result=import_with_code(self.database,self.code,self.path)
        self.assertEqual(result['prepared_packs'],1);self.assertFalse(result['published'])
        manifest=ObjectStore(self.database).get('2026-11-01/paket.json')[0]
        import_with_code(self.database,self.code,self.path)
        self.assertEqual(DailyPlanner(self.database).status()['reserved_fact_count'],4)
        self.assertEqual(ObjectStore(self.database).get('2026-11-01/paket.json')[0],manifest)

    def test_wrong_code_never_imports_any_fact(self):
        wrong=base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode()
        with self.assertRaises(ValueError):import_with_code(self.database,wrong,self.path)
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)

    def test_tampering_is_rejected_before_import(self):
        body=bytearray(self.path.read_bytes());body[-1]^=1;self.path.write_bytes(body)
        with self.assertRaises(ValueError):import_with_code(self.database,self.code,self.path)
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)

    def test_invalid_codes_are_not_echoed_in_errors(self):
        for value in ('PRIVATE-INVALID-CODE','x'*129):
            with self.assertRaises(ValueError) as caught:open_bundle(value,self.path)
            self.assertNotIn(value,str(caught.exception))

    def test_oversize_payload_is_rejected_without_reading_it(self):
        with self.path.open('wb') as f:f.truncate(MAX_SIZE+1)
        with self.assertRaises(ValueError):open_bundle(self.code,self.path)

    def test_route_requires_authentication_and_refuses_ephemeral_storage(self):
        with TestClient(create_app(self.root/'output',self.root/'panel.db','fixture-password',{})) as c:
            url='/api/automation/bootstrap/code'
            self.assertEqual(c.post(url,json={'code':self.code}).status_code,401)
            self.assertEqual(c.post(url,auth=('reviewer','fixture-password'),json={'code':self.code}).status_code,409)

    def test_private_asset_and_code_are_not_served_by_the_panel(self):
        with TestClient(create_app(self.root/'output',self.root/'panel.db','fixture-password',{})) as c:
            self.assertEqual(c.get('/assets/private-bootstrap.enc',auth=('reviewer','fixture-password')).status_code,404)
            page=c.get('/automation',auth=('reviewer','fixture-password')).text
            self.assertIn('Kodla aktar',page);self.assertNotIn(self.code,page)


if __name__=='__main__':unittest.main(verbosity=2)
