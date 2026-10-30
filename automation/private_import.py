"""Authenticated, bounded bootstrap of the user's private source pool and posters."""
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import PurePosixPath
import re
import zipfile

from daily_planner import DailyPlanner
from object_store import ObjectStore


def import_bundle(database,body):
    if len(body)>24*1024*1024:raise ValueError('Özel aktarım paketi çok büyük')
    with zipfile.ZipFile(BytesIO(body)) as archive:
        entries=[i for i in archive.infolist() if not i.is_dir()]
        if len(entries)>200 or sum(i.file_size for i in entries)>64*1024*1024:
            raise ValueError('Aktarım boyutu sınırı aşıldı')
        for info in entries:
            p=PurePosixPath(info.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in info.filename:
                raise ValueError('Geçersiz arşiv yolu')
        dataset=json.loads(archive.read('facts.json'))
        facts=dataset['facts'];used=dataset.get('used',[])
        if not isinstance(facts,list) or len(facts)>5000:raise ValueError('Geçersiz kaynak havuzu')
        by_id={f['id']:f for f in facts}
        history={r['id']:r for r in used}
        if len(by_id)!=len(facts) or len(history)!=len(used):raise ValueError('Yinelenen kaynak kimliği')
        packs=[]
        for info in entries:
            match=re.fullmatch(r'packs/(\d{4}-\d{2}-\d{2})/paket.json',info.filename)
            if not match:continue
            day=match[1];pack=json.loads(archive.read(info))
            if pack['date']!=day or Counter(c['kind'] for c in pack['cards'])!={'duration':2,'authority':2}:
                raise ValueError('Paket bilgisi geçersiz')
            if len({c['id'] for c in pack['cards']})!=4:raise ValueError('Dört ayrı bilgi gerekli')
            for card in pack['cards']:
                fact=by_id.get(card['id']);entry=history.get(card['id'])
                if (not fact or not entry or entry['day']!=day or
                        entry['semantic_key']!=fact['semantic_key'] or
                        card['kind']!=fact['kind'] or card['statement']!=fact['statement']):
                    raise ValueError('Hazır paket tekrar engelleme kaydıyla uyuşmuyor')
            content={key:pack[key] for key in ('cards','assets_sha256','captions','targets')}
            expected=hashlib.sha256(json.dumps(content,ensure_ascii=False,sort_keys=True,indent=2).encode()).hexdigest()
            if expected!=pack['content_sha256']:raise ValueError('Paket özeti doğrulanamadı')
            files={}
            for name,sha in pack['assets_sha256'].items():
                path=PurePosixPath(name)
                if path.is_absolute() or '..' in path.parts:raise ValueError('Geçersiz görsel yolu')
                content=archive.read('packs/'+day+'/'+name)
                if hashlib.sha256(content).hexdigest()!=sha:raise ValueError('Görsel özeti uyuşmuyor')
                files[name]=(content,'image/jpeg' if name.lower().endswith(('.jpg','.jpeg')) else 'image/png')
            for name,media in (('onizleme.html','text/html; charset=utf-8'),('metinler.txt','text/plain; charset=utf-8')):
                files[name]=(archive.read('packs/'+day+'/'+name),media)
            files['paket.json']=(archive.read(info),'application/json')
            packs.append((day,files,pack['cards']))
        planner=DailyPlanner(database);objects=ObjectStore(database)
        # Refuse to overwrite a different package, including one already reviewed.
        for day,files,cards in packs:
            previous=objects.get(day+'/paket.json')
            if previous and previous[0]!=files['paket.json'][0]:
                raise ValueError('Mevcut paket sessizce değiştirilemez')
        planner.import_facts(facts,used)
        for day,files,cards in packs:
            for name,(content,media) in files.items():objects.put(day+'/'+name,content,media)
            planner.import_design_history(day,cards)
            planner.mark_ready(day)
        return {'facts':len(facts),'prepared_packs':len(packs),'published':False}
