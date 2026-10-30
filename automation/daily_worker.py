"""Generate one private draft; never authenticate a social account or publish."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from card_renderer import build_draft
from database import Database
from daily_planner import DailyPlanner,PoolExhausted
from object_store import ObjectStore


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
    args=parser.parse_args()
    if not os.environ.get('DATABASE_URL'):
        print('Kalıcı veritabanı yetkilendirilmedi; günlük iş çalıştırılmadı.',file=sys.stderr)
        raise SystemExit(2)
    day=args.day or datetime.now(ZoneInfo('Europe/Istanbul')).date().isoformat()
    try:
        result=run(Database(Path('/tmp/gumruk-worker.sqlite3')),day)
    except PoolExhausted:
        print('Yeni kaynak havuzu eksik; tekrar seçim ve paylaşım yapılmadı.',file=sys.stderr)
        raise SystemExit(3)
    except Exception:
        # Driver errors can include database URLs, usernames or source text.
        print('Günlük taslak hazırlanamadı; gizli bağlantı veya kaynak değerleri günlüğe yazılmadı.',file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result))
