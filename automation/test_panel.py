"""Behavioral tests use temporary packages and never approve the user's real pack."""
import json
import base64
import hashlib
from pathlib import Path
import shutil
import tempfile
import unittest

from fastapi.testclient import TestClient
from panel import ROOT, create_app, current_content_hash


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.folder = self.root / "output/2026-10-30"
        self.folder.mkdir(parents=True)
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1EAAAAASUVORK5CYII=')
        (self.folder/'test.png').write_bytes(image)
        (self.folder/'metinler.txt').write_text('Isolated test caption')
        pack={'title':'Isolated review fixture',
              'cards':[{'id':f'test-{i}','kind':'duration' if i<2 else 'authority',
                        'files':{'feed':'test.png'}} for i in range(4)],
              'assets_sha256':{'test.png':hashlib.sha256(image).hexdigest()},
              'captions':{'instagram':'Test caption','linkedin':'Test caption'},
              'targets':{'instagram':'test-account','linkedin':'test-profile'}}
        (self.folder/'paket.json').write_text(json.dumps(pack))
        pack['content_sha256']=current_content_hash(self.folder)
        (self.folder/'paket.json').write_text(json.dumps(pack))
        self.client = TestClient(create_app(self.root / "output", self.root / "review.db", "test-only"))
        self.auth = ("reviewer", "test-only")

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def decision(self, decision="approved", content_hash=None):
        return self.client.post('/api/packages/2026-10-30/review', auth=self.auth,
            json={"decision":decision, "content_sha256":content_hash or current_content_hash(self.folder)})

    def test_anonymous_access_denied(self):
        self.assertEqual(self.client.get('/api/packages').status_code, 401)
        self.assertEqual(self.client.get('/files/2026-10-30/onizleme.html').status_code, 401)
        self.assertEqual(self.client.get('/api/packages',auth=("reviewer","wrong")).status_code,401)

    def test_approval_persists_without_publication(self):
        self.assertEqual(self.decision().json()['review_status'], 'approved')
        payload = self.client.get('/api/packages',auth=self.auth).json()
        p = payload['packages'][0]
        self.assertEqual(p['review_status'], 'approved')
        self.assertFalse(p['automatic_publishing_enabled'])
        self.assertEqual(p['publishing_status'], 'blocked_accounts_not_connected')

    def test_changed_image_invalidates_approval(self):
        self.assertEqual(self.decision().status_code,200)
        pack = json.loads((self.folder/'paket.json').read_text())
        image = self.folder / pack['cards'][0]['files']['feed']
        image.write_bytes(image.read_bytes()+b'changed')
        p = self.client.get('/api/packages',auth=self.auth).json()['packages'][0]
        self.assertEqual(p['review_status'],'changed_requires_new_review')
        self.assertEqual(self.decision().status_code,409)

    def test_caption_and_target_changes_invalidate_approval(self):
        self.assertEqual(self.decision().status_code,200)
        file=self.folder/'paket.json'
        pack=json.loads(file.read_text())
        pack['captions']['instagram']+=' altered'
        pack['targets']['instagram']='different_account'
        file.write_text(json.dumps(pack))
        p=self.client.get('/api/packages',auth=self.auth).json()['packages'][0]
        self.assertEqual(p['review_status'],'changed_requires_new_review')
        self.assertEqual(self.decision().status_code,409)

    def test_stale_preview_cannot_be_approved(self):
        self.assertEqual(self.decision(content_hash='old-version').status_code,409)
        self.assertEqual(self.decision(decision='publish_without_approval').status_code,400)

    def test_rejection_persists(self):
        response=self.decision('rejected')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['review_status'],'rejected')

    def test_private_manifest_is_not_served(self):
        self.assertEqual(self.client.get('/files/2026-10-30/paket.json',auth=self.auth).status_code,404)
        self.assertEqual(self.client.get('/files/2026-10-30/metinler.txt',auth=self.auth).status_code,200)


if __name__ == '__main__':
    unittest.main(verbosity=2)
