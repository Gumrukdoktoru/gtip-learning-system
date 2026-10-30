"""Transactional two-duration/two-authority selection. Prepared facts never repeat."""
from collections import Counter
from datetime import date,datetime,timezone,timedelta
import json


class PoolExhausted(Exception):
    pass


class DailyPlanner:
    def __init__(self,database):
        self.database=database
        with database.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS source_facts (
                    id TEXT PRIMARY KEY,semantic_key TEXT UNIQUE NOT NULL,
                    kind TEXT NOT NULL,payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS fact_uses (
                    fact_id TEXT PRIMARY KEY,semantic_key TEXT UNIQUE NOT NULL,day TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS daily_runs (
                    day TEXT PRIMARY KEY,state TEXT NOT NULL,fact_ids TEXT NOT NULL,created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS design_uses (
                    day TEXT NOT NULL,kind TEXT NOT NULL,slot INTEGER NOT NULL,variant TEXT NOT NULL,
                    PRIMARY KEY(day,kind,slot));
            ''')

    def import_facts(self,facts,used_records=()):
        """Only caller-supplied, source-checked facts become eligible for drafts."""
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            known={r[0]:(r[1],r[2]) for r in db.execute('SELECT id,semantic_key,payload FROM source_facts').fetchall()}
            pending=[]
            for fact in facts:
                if fact.get('kind') not in ('duration','authority') or fact.get('source_verified') is not True:
                    raise ValueError('A matched PDF source is required for every fact.')
                if not all(fact.get(k) for k in ('id','semantic_key','title','value','statement','legal_basis','source')):
                    raise ValueError('Incomplete source fact')
                payload=json.dumps(fact,ensure_ascii=False,sort_keys=True)
                previous=known.get(fact['id'])
                if previous:
                    if previous!=(fact['semantic_key'],payload):raise ValueError('An existing fact identity cannot be silently changed')
                    continue
                pending.append((fact['id'],fact['semantic_key'],fact['kind'],payload))
                known[fact['id']]=(fact['semantic_key'],payload)
            if pending:db.executemany('INSERT INTO source_facts(id,semantic_key,kind,payload) VALUES (?,?,?,?)',pending)
            self._import_usage(db,used_records)

    def import_usage(self,records):
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            self._import_usage(db,records)

    def _import_usage(self,db,records):
        groups={}
        for row in records:
            previous=db.execute('SELECT semantic_key,day FROM fact_uses WHERE fact_id=?',(row['id'],)).fetchone()
            if previous:
                if previous!=(row['semantic_key'],row['day']):raise ValueError('Conflicting content history')
            else:
                db.execute('INSERT INTO fact_uses(fact_id,semantic_key,day) VALUES (?,?,?)',
                           (row['id'],row['semantic_key'],row['day']))
            groups.setdefault(row['day'],[]).append(row['id'])
        for day,ids in groups.items():
            if len(ids)==4:
                db.execute('INSERT INTO daily_runs(day,state,fact_ids,created_at) VALUES (?,?,?,?) ON CONFLICT(day) DO NOTHING',
                           (day,'prepared_elsewhere',json.dumps(ids),datetime.now(timezone.utc).isoformat()))

    def reserve(self,day):
        day=date.fromisoformat(day).isoformat()
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            run=db.execute('SELECT state,fact_ids FROM daily_runs WHERE day=?',(day,)).fetchone()
            if run:
                facts=[json.loads(db.execute('SELECT payload FROM source_facts WHERE id=?',(i,)).fetchone()[0])
                       for i in json.loads(run[1])]
                return facts,run[0]
            rows=db.execute('''SELECT f.id,f.semantic_key,f.kind,f.payload FROM source_facts f
                WHERE NOT EXISTS (SELECT 1 FROM fact_uses u WHERE u.semantic_key=f.semantic_key)
                ORDER BY f.id''').fetchall()
            chosen=[]
            for kind in ('duration','authority'):
                chosen.extend([row for row in rows if row[2]==kind][:2])
            if Counter(row[2] for row in chosen)!={'duration':2,'authority':2}:
                raise PoolExhausted('Yeni iki süre ve iki makam bilgisi için kaynak havuzu tamamlanmalı; eski bilgiler tekrar seçilmedi.')
            for row in chosen:
                db.execute('INSERT INTO fact_uses(fact_id,semantic_key,day) VALUES (?,?,?)',(row[0],row[1],day))
            db.execute('INSERT INTO daily_runs(day,state,fact_ids,created_at) VALUES (?,?,?,?)',
                (day,'reserved',json.dumps([r[0] for r in chosen]),datetime.now(timezone.utc).isoformat()))
            return [json.loads(r[3]) for r in chosen],'reserved'

    def mark_ready(self,day):
        with self.database.connect() as db:
            db.execute('UPDATE daily_runs SET state=? WHERE day=?',('draft_ready',day))

    def import_design_history(self,day,cards):
        # Preserve existing artwork; older prepared packs used the hero layout.
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            slots={'duration':0,'authority':0}
            for card in cards:
                kind=card['kind'];slot=slots[kind];slots[kind]+=1
                db.execute('''INSERT INTO design_uses(day,kind,slot,variant) VALUES (?,?,?,?)
                    ON CONFLICT(day,kind,slot) DO NOTHING''',
                    (day,kind,slot,card.get('design_variant','hero')))

    def designs(self,day,facts):
        """Four distinct layouts per day; no adjacent-day reuse within a category."""
        pools={'duration':['hero','calendar','timeline','ribbon','number_card','split'],
               'authority':['hero','question','flow','document','ribbon','split']}
        current=date.fromisoformat(day)
        adjacent=[(current+timedelta(days=i)).isoformat() for i in (-1,1)]
        with self.database.connect() as db:
            self.database.serialize_daily_writer(db)
            old=db.execute('SELECT kind,slot,variant FROM design_uses WHERE day=?',(day,)).fetchall()
            chosen={(r[0],r[1]):r[2] for r in old}
            if not old:
                used_today=set()
                for kind in ('duration','authority'):
                    recent={r[0] for r in db.execute('SELECT variant FROM design_uses WHERE kind=? AND day IN (?,?)',
                              (kind,*adjacent)).fetchall()}
                    pool=pools[kind];offset=current.toordinal()%len(pool)
                    ordered=pool[offset:]+pool[:offset]
                    available=[v for v in ordered if v not in recent and v not in used_today]
                    if len(available)<2:raise ValueError('Design rotation cannot satisfy adjacent-day constraints')
                    for slot,variant in enumerate(available[:2]):
                        chosen[kind,slot]=variant;used_today.add(variant)
                        db.execute('INSERT INTO design_uses(day,kind,slot,variant) VALUES (?,?,?,?)',
                                   (day,kind,slot,variant))
            slots={'duration':0,'authority':0};result=[]
            for fact in facts:
                kind=fact['kind'];slot=slots[kind];slots[kind]+=1
                result.append({**fact,'design_variant':chosen[kind,slot]})
            return result

    def status(self):
        with self.database.connect() as db:
            total=db.execute('SELECT count(*) FROM source_facts').fetchone()[0]
            used=db.execute('SELECT count(*) FROM fact_uses').fetchone()[0]
            runs=db.execute('SELECT day,state FROM daily_runs ORDER BY day DESC LIMIT 7').fetchall()
        return {'source_fact_count':total,'reserved_fact_count':used,'recent_days':[{'day':r[0],'state':r[1]} for r in runs]}
