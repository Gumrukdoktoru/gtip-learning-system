"""Generate one private draft; never authenticate a social account or publish."""
import argparse
from datetime import date,datetime
import json
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from card_renderer import build_draft
from database import Database,DatabaseConfigError
from daily_planner import DailyPlanner,PoolExhausted
from object_store import ObjectStore


def check_storage(database,day):
    """Check connectivity/readiness without reserving facts or rendering cards."""
    day=date.fromisoformat(day).isoformat()
    planner=DailyPlanner(database);objects=ObjectStore(database)
    with database.connect() as db:
        remaining=dict(db.execute('''SELECT f.kind,count(*) FROM source_facts f
            WHERE NOT EXISTS (SELECT 1 FROM fact_uses u WHERE u.semantic_key=f.semantic_key)
            GROUP BY f.kind''').fetchall())
        run_state=db.execute('SELECT state FROM daily_runs WHERE day=?',(day,)).fetchone()
    if objects.get(day+'/paket.json'):
        status='existing_draft_preserved';eligible=True
    elif run_state and run_state[0]=='prepared_elsewhere':
        status='private_pack_import_required';eligible=False
    elif run_state or all(remaining.get(k,0)>=2 for k in ('duration','authority')):
        status='ready';eligible=True
    else:
        status='private_pool_required' if planner.status()['source_fact_count']==0 else 'pool_exhausted'
        eligible=False
    return {'day':day,'database_connected':True,'persistent_storage':database.persistent,
            'status':status,'eligible':eligible,'published':False}


def run(database,day):
    planner=DailyPlanner(database);objects=ObjectStore(database)
    facts,state=planner.reserve(day)
    if objects.get(day+'/paket.json'):
        return {'day':day,'status':'existing_draft_preserved','facts':4,'published':False}
    if state=='prepared_elsewhere':
        return {'day':day,'status':'private_pack_import_required','facts':4,'published':False}
    facts=planner.designs(day,facts)
    pack,assets=build_draft(day,facts)
    # The manifest is written last, so the panel sees only complete drafts.
    for name,(body,media_type) in assets.items():
        objects.put(day+'/'+name,body,media_type)
    planner.mark_ready(day)
    return {'day':day,'status':'draft_ready','facts':len(facts),'published':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--day',default=None)
    parser.add_argument('--check-storage',action='store_true')
    args=parser.parse_args()
    if not os.environ.get('DATABASE_URL'):
        print('Kalıcı veritabanı yetkilendirilmedi; günlük iş çalıştırılmadı.',file=sys.stderr)
        raise SystemExit(2)
    day=args.day or datetime.now(ZoneInfo('Europe/Istanbul')).date().isoformat()
    try:
        operation=check_storage if args.check_storage else run
        result=operation(Database(Path('/tmp/gumruk-worker.sqlite3')),day)
    except DatabaseConfigError:
        message='DATABASE_URL geçerli PostgreSQL adresi içermiyor; Neon bağlantı alanındaki adres veya tek psql bağlantısı kopyalanmalı.'
        if os.environ.get('GITHUB_ACTIONS')=='true':print('::error::'+message)
        print(message,file=sys.stderr)
        raise SystemExit(2)
    except PoolExhausted:
        print('Yeni kaynak havuzu eksik; tekrar seçim ve paylaşım yapılmadı.',file=sys.stderr)
        raise SystemExit(3)
    except Exception as error:
        # Driver errors can include database URLs, usernames or source text.
        message='Veritabanı kontrolü veya günlük hazırlık tamamlanamadı; gizli değerler günlüğe yazılmadı.'
        # Fixed categories allow diagnosis without exposing provider error text.
        reason=str(error).lower()
        if 'password authentication failed' in reason:message='Veritabanı kullanıcı/parola doğrulaması reddedildi; Neon bağlantısı yenilenmeli.'
        elif 'certificate verify failed' in reason or 'certificate verification failed' in reason:
            message='Veritabanı TLS sertifikası doğrulanamadı; sertifika doğrulaması kapatılmadı.'
        elif 'could not translate host name' in reason or 'name or service not known' in reason:
            message='Veritabanı sunucu adresi çözülemedi; bağlantı adresi kontrol edilmeli.'
        if os.environ.get('GITHUB_ACTIONS')=='true':print('::error::'+message)
        print(message,file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result))
