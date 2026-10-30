from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from card_renderer import build_draft
from database import Database
from daily_planner import DailyPlanner
from object_store import ObjectStore
from private_import import import_bundle
from test_daily import facts


class PrivateImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.facts=facts(4)
        cls.day='2026-11-01'
        cls.pack,assets=build_draft(cls.day,cls.facts)
        used=[{'id':f['id'],'semantic_key':f['semantic_key'],'day':cls.day} for f in cls.facts]
        cls.files={'facts.json':json.dumps({'facts':cls.facts,'used':used}).encode()}
        cls.files.update({f'packs/{cls.day}/{name}':body for name,(body,_) in assets.items()})

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.database=Database(Path(self.temp.name)/'test.sqlite3',{})

    def tearDown(self):self.temp.cleanup()

    def bundle(self,files=None):
        out=BytesIO()
        with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
            for name,body in (self.files if files is None else files).items():z.writestr(name,body)
        return out.getvalue()

    def test_import_and_retry_preserve_artwork_and_history(self):
        body=self.bundle()
        self.assertEqual(import_bundle(self.database,body)['prepared_packs'],1)
        self.assertFalse(import_bundle(self.database,body)['published'])
        self.assertEqual(DailyPlanner(self.database).status()['reserved_fact_count'],4)
        self.assertEqual(ObjectStore(self.database).get(self.day+'/paket.json')[0],
                         self.files[f'packs/{self.day}/paket.json'])

    def test_wrong_image_hash_is_rejected_before_import(self):
        files=dict(self.files)
        files[next(k for k in files if k.endswith('.jpg'))]=b'changed image'
        with self.assertRaises(ValueError):import_bundle(self.database,self.bundle(files))
        self.assertEqual(DailyPlanner(self.database).status()['source_fact_count'],0)

    def test_zip_path_escape_is_rejected(self):
        with self.assertRaises(ValueError):
            import_bundle(self.database,self.bundle({**self.files,'../../escape.txt':b'no'}))

    def test_pack_without_matching_non_repeat_history_is_rejected(self):
        files=dict(self.files);dataset=json.loads(files['facts.json'])
        dataset['used'][0]['day']='2026-11-02'
        files['facts.json']=json.dumps(dataset).encode()
        with self.assertRaises(ValueError):import_bundle(self.database,self.bundle(files))

    def test_existing_package_cannot_be_overwritten(self):
        import_bundle(self.database,self.bundle())
        files=dict(self.files);key=f'packs/{self.day}/paket.json'
        pack=json.loads(files[key]);pack['title']='Changed after review'
        files[key]=json.dumps(pack).encode()
        with self.assertRaises(ValueError):import_bundle(self.database,self.bundle(files))
        self.assertEqual(ObjectStore(self.database).get(self.day+'/paket.json')[0],self.files[key])


if __name__=='__main__':unittest.main(verbosity=2)
