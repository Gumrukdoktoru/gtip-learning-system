import json
from pathlib import Path
import tempfile
import unittest

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
import base64

from automatic_transfer import MAX_SIZE,PrivateTransfer,seal_for_recipient
from database import Database
from daily_planner import DailyPlanner
from object_store import ObjectStore
import test_sealed_bootstrap as fixture


class AutomaticTransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SealedBootstrapTests.setUpClass();cls.bundle=fixture.SealedBootstrapTests.bundle

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.database=Database(self.root/'test.sqlite3',{})
        self.transfer=PrivateTransfer(self.database,'isolated-fixture-master')
        self.path=self.root/'transfer.enc'

    def tearDown(self):self.temp.cleanup()

    def test_waiting_result_contains_only_the_public_recipient_key(self):
        result=self.transfer.run(self.path)
        self.assertEqual(set(result),{'status','public_key','published'})
        self.assertEqual(len(base64.urlsafe_b64decode(result['public_key'])),32)
        self.assertNotIn('isolated-fixture-master',json.dumps(result))

    def test_recipient_is_durable_and_private_material_is_wrapped(self):
        public=self.transfer.recipient()
        restarted=PrivateTransfer(self.database,'isolated-fixture-master')
        self.assertEqual(public,restarted.recipient())
        with self.database.connect() as db:
            row=db.execute('SELECT wrapped_private,wrap_salt,wrap_nonce FROM private_transfers').fetchone()
        self.assertEqual(len(row[0]),48);self.assertEqual(len(row[1]),16);self.assertEqual(len(row[2]),12)

    def test_transfer_restores_pack_once_and_deletes_the_private_key(self):
        self.path.write_bytes(seal_for_recipient(self.bundle,self.transfer.recipient()))
        result=self.transfer.run(self.path)
        self.assertEqual(result['status'],'private_sources_imported')
        self.assertEqual((result['facts'],result['packs'],result['used']),(4,1,4))
        self.assertFalse(result['published'])
        before=ObjectStore(self.database).get('2026-11-01/paket.json')[0]
        self.path.write_bytes(b'No reread after completed import')
        self.assertEqual(self.transfer.run(self.path)['status'],'private_sources_ready')
        self.assertEqual(ObjectStore(self.database).get('2026-11-01/paket.json')[0],before)
        with self.database.connect() as db:
            row=db.execute('SELECT wrapped_private,wrap_salt,wrap_nonce,state FROM private_transfers').fetchone()
        self.assertEqual(row,(None,None,None,'complete'))

    def test_tampered_transfer_cannot_write_facts(self):
        body=bytearray(seal_for_recipient(self.bundle,self.transfer.recipient()));body[-1]^=1
        self.path.write_bytes(body)
        with self.assertRaises(InvalidTag):self.transfer.run(self.path)
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)

    def test_wrong_recipient_waits_without_importing(self):
        other=base64.urlsafe_b64encode(X25519PrivateKey.generate().public_key().public_bytes_raw()).decode()
        self.path.write_bytes(seal_for_recipient(self.bundle,other))
        result=self.transfer.run(self.path)
        self.assertEqual(result['status'],'awaiting_encrypted_payload')
        self.assertEqual(result['public_key'],self.transfer.recipient())
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)

    def test_wrong_wrapping_credential_fails_closed_and_preserves_the_key(self):
        self.path.write_bytes(seal_for_recipient(self.bundle,self.transfer.recipient()))
        wrong=PrivateTransfer(self.database,'different-isolated-fixture-master')
        with self.assertRaises(InvalidTag):wrong.run(self.path)
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)
        self.assertEqual(self.transfer.run(self.path)['used'],4)

    def test_oversized_file_is_rejected(self):
        with self.path.open('wb') as f:f.truncate(MAX_SIZE+1)
        with self.assertRaises(ValueError):self.transfer.run(self.path)


if __name__=='__main__':unittest.main(verbosity=2)
