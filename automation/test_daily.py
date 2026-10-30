import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import date,timedelta
from pathlib import Path
import tempfile
import unittest

from database import Database
from daily_planner import DailyPlanner,PoolExhausted
from object_store import ObjectStore
from daily_worker import run
from panel import current_content_hash
from social_connections import ConnectionStore


def facts(n=40):
    result=[]
    for i in range(n):
        kind='duration' if i%2==0 else 'authority'
        result.append({'id':f'fixture-{i:03d}','semantic_key':f'test-semantic-{i}',
            'kind':kind,'title':'Yalnız test verisi','value':'10 GÜN' if kind=='duration' else 'Test makamı',
            'statement':f'Bu yalnızca otomasyon testi için hazırlanmış, yayımlanmayacak örnek {i} metnidir.',
            'legal_basis':'TEST · Yayımlanmaz','source_verified':True,
            'source':{'book':'test','page':1,'quote':'Synthetic fixture'}})
    return result


class DailyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.database=Database(self.root/'test.sqlite3',{})
        self.planner=DailyPlanner(self.database)
        self.data=facts();self.planner.import_facts(self.data)

    def tearDown(self):self.temp.cleanup()

    def test_two_of_each_and_same_day_is_idempotent(self):
        first,_=self.planner.reserve('2026-11-01')
        second,_=self.planner.reserve('2026-11-01')
        self.assertEqual(first,second)
        self.assertEqual(sum(x['kind']=='duration' for x in first),2)
        self.assertEqual(self.planner.status()['reserved_fact_count'],4)

    def test_next_day_never_reuses_prepared_facts(self):
        a,_=self.planner.reserve('2026-11-01');b,_=self.planner.reserve('2026-11-02')
        self.assertTrue({x['semantic_key'] for x in a}.isdisjoint({x['semantic_key'] for x in b}))

    def test_insufficient_pool_rolls_back_without_recycling(self):
        small=Database(self.root/'small.sqlite3',{});p=DailyPlanner(small)
        p.import_facts(self.data[:3])
        with self.assertRaises(PoolExhausted):p.reserve('2026-11-01')
        self.assertEqual(p.status()['reserved_fact_count'],0)

    def test_parallel_runs_cannot_duplicate_selection(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows=list(pool.map(lambda day:self.planner.reserve(day)[0],['2026-11-01','2026-11-02']))
        self.assertEqual(len({f['id'] for row in rows for f in row}),8)

    def test_designs_are_distinct_and_do_not_repeat_on_adjacent_days(self):
        previous=None
        for i in range(8):
            day=(date(2026,11,1)+timedelta(days=i)).isoformat()
            selected,_=self.planner.reserve(day)
            styled=self.planner.designs(day,selected)
            self.assertEqual(len({f['design_variant'] for f in styled}),4)
            self.assertEqual(styled,self.planner.designs(day,selected))
            if previous:
                for kind in ('duration','authority'):
                    self.assertTrue({f['design_variant'] for f in styled if f['kind']==kind}.isdisjoint(
                        {f['design_variant'] for f in previous if f['kind']==kind}))
            previous=styled

    def test_history_is_rejected_if_same_fact_is_assigned_to_another_day(self):
        f=self.data[0];entry={'id':f['id'],'semantic_key':f['semantic_key'],'day':'2026-10-30'}
        self.planner.import_usage([entry])
        with self.assertRaises(ValueError):self.planner.import_usage([{**entry,'day':'2026-11-01'}])

    def test_unverified_sources_are_not_imported(self):
        row=copy.deepcopy(self.data[0]);row['source_verified']=False
        with self.assertRaises(ValueError):self.planner.import_facts([row])

    def test_complete_draft_survives_a_lost_local_cache_and_no_post_is_made(self):
        result=run(self.database,'2026-11-01')
        self.assertEqual(result['status'],'draft_ready');self.assertFalse(result['published'])
        restarted=Database(self.root/'test.sqlite3',{})
        objects=ObjectStore(restarted);cache=self.root/'fresh-output'
        self.assertTrue(objects.hydrate('2026-11-01',cache))
        import json
        p=json.loads((cache/'2026-11-01/paket.json').read_text())
        self.assertEqual(p['content_sha256'],current_content_hash(cache/'2026-11-01'))
        self.assertIsNone(p['approved_at']);self.assertIsNone(p['published_at'])
        self.assertEqual(run(restarted,'2026-11-01')['status'],'existing_draft_preserved')
        self.assertEqual(self.planner.status()['reserved_fact_count'],4)

    def test_approved_designs_render_every_layout_without_clipping(self):
        from card_renderer import poster
        from PIL import Image
        from io import BytesIO
        pools={'duration':['hero','calendar','timeline','ribbon','number_card','split'],
               'authority':['hero','question','flow','document','ribbon','split']}
        for kind,variants in pools.items():
            for variant in variants:
                row=next(copy.deepcopy(f) for f in self.data if f['kind']==kind)
                row['design_variant']=variant
                with Image.open(BytesIO(poster(row,1))) as im:self.assertEqual(im.size,(1122,1402))


if __name__=='__main__':unittest.main(verbosity=2)
