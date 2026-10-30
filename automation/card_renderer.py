"""Deterministic daily poster composition using once-approved illustration assets."""
import hashlib
import html
from io import BytesIO
import json
from pathlib import Path

from PIL import Image,ImageDraw,ImageFont

ASSETS=Path(__file__).resolve().parent/'assets'


def font(size,bold=False):
    return ImageFont.truetype(str(ASSETS/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),size)


def lines(text,size,width,bold=False):
    f=font(size,bold);result=[];line=''
    for word in text.split():
        new=(line+' '+word).strip()
        if f.getlength(new)>width:
            if not line:raise ValueError('A word exceeds the poster width')
            result.append(line);line=word
        else:line=new
    if line:result.append(line)
    return result


def fit(text,width,height,start,minimum,bold=False):
    for size in range(start,minimum-1,-1):
        wrapped=lines(text,size,width,bold)
        if len(wrapped)*int(size*1.27)<=height:return size,wrapped
    raise ValueError('Source text exceeds the approved readable poster layout')


def poster(fact,index):
    bg=ASSETS/('duration-background.png' if fact['kind']=='duration' else 'authority-background.png')
    with Image.open(bg) as source:im=source.convert('RGB').resize((1122,1402),Image.Resampling.LANCZOS)
    draw=ImageDraw.Draw(im)
    duration=fact['kind']=='duration'
    ink='#08265C' if duration else '#4F1D05'
    accent='#1354DF' if duration else '#F59630'
    paper='#F4F9FF' if duration else '#FFF4DE'
    draw.rounded_rectangle((42,28,530,218),radius=30,fill=paper)
    with Image.open(ASSETS/'brand-logo.png') as raw:
        logo=raw.convert('RGBA');logo.thumbnail((442,164),Image.Resampling.LANCZOS)
        im.paste(logo,(286-logo.width//2,123-logo.height//2),logo)
    draw.text((972,58),f'{index:02d}/04',font=font(37,True),fill='white')
    draw.rounded_rectangle((44,246,560,372),radius=25,fill=accent)
    draw.text((73,262),'SÜRE' if duration else 'MAKAM',font=font(91,True),fill='white')
    size,title=fit(fact['title'],1020,154,59,37,True)
    for i,line in enumerate(title):draw.text((47,403+i*int(size*1.27)),line,font=font(size,True),fill='white')
    variant=fact.get('design_variant','hero')
    value_box=(48,585,675,316)
    color=paper
    if variant in ('calendar','number_card'):
        draw.rounded_rectangle((43,578,714,908),radius=24,fill=paper)
        draw.rounded_rectangle((43,578,714,634),radius=24,fill=accent)
        if variant=='calendar':
            for x in (119,282,445,608):draw.rounded_rectangle((x,555,x+15,607),radius=7,fill=ink)
        value_box=(68,654,615,236);color=ink
    elif variant=='timeline':
        value_box=(48,580,675,206)
        draw.line((85,837,680,837),fill=paper,width=8)
        for x in (85,680):draw.ellipse((x-13,824,x+13,850),fill=paper)
        draw.text((65,866),'Referans',font=font(23),fill=paper)
        draw.text((590,866),'Süre',font=font(23),fill=paper)
    elif variant in ('ribbon','split'):
        if variant=='split':
            draw.rounded_rectangle((43,578,721,910),radius=15,fill=ink)
            draw.rectangle((43,578,59,910),fill=paper)
            value_box=(82,607,605,280)
        else:
            draw.rounded_rectangle((43,609,1080,839),radius=28,fill=paper)
            value_box=(71,636,982,181);color=ink
    elif variant in ('question','document','flow'):
        draw.rounded_rectangle((43,608,747,908),radius=22,fill=paper)
        label={'question':'Yetkili makam','document':'Görev ve yetki','flow':'Bu işlemde yetkili'}[variant]
        draw.text((70,630),label,font=font(25,True),fill=ink)
        if variant=='flow':
            draw.line((735,738,856,738),fill=paper,width=8)
            draw.polygon([(856,738),(832,724),(832,752)],fill=paper)
        if variant=='document':
            draw.line((74,878,685,878),fill=accent,width=3)
        value_box=(68,687,643,190);color=ink
    x,y,width,height=value_box
    size,value=fit(fact['value'],width,height,190 if duration else 94,41,True)
    for i,line in enumerate(value):
        py=y+i*int(size*1.27)
        if color==paper and variant in ('hero','timeline'):
            for offset in range(9,0,-1):draw.text((x+offset,py+offset),line,font=font(size,True),fill=ink)
        draw.text((x,py),line,font=font(size,True),fill=color)
    draw.rounded_rectangle((43,948,1080,1278),radius=28,fill=paper)
    size,body=fit(fact['statement'],977,278,38,29)
    for i,line in enumerate(body):draw.text((72,974+i*int(size*1.27)),line,font=font(size),fill=ink)
    draw.line((45,1310,1078,1310),fill=paper,width=2)
    size,basis=fit(fact['legal_basis'],1025,64,24,18)
    for i,line in enumerate(basis):draw.text((48,1327+i*int(size*1.27)),line,font=font(size),fill=paper)
    out=BytesIO();im.save(out,format='JPEG',quality=90,optimize=True)
    return out.getvalue()


def build_draft(day,facts):
    if len(facts)!=4:raise ValueError('Exactly four facts are required')
    assets={};cards=[];asset_hashes={}
    for index,fact in enumerate(facts,1):
        name=f'{index:02d}-{fact["kind"]}.jpg'
        image=poster(fact,index);assets[name]=(image,'image/jpeg')
        cards.append({**fact,'files':{'feed':name}})
        asset_hashes[name]=hashlib.sha256(image).hexdigest()
    text='2 SÜRE + 2 MAKAM\n\n'+'\n\n'.join(
        f'{i}. {f["title"]}\n{f["value"]}\n{f["statement"]}\nDayanak: {f["legal_basis"]}'
        for i,f in enumerate(facts,1))+'\n\nUfuk Çetintaş · Gümrük Eğitim Koçu'
    if len(text)>2200:raise ValueError('Caption exceeds platform limits; source fact must be shortened by an editor, not silently truncated')
    captions={'instagram':text,'linkedin':text,'whatsapp':text}
    targets={'instagram':'professional_account_not_connected','linkedin':'personal_profile_not_connected',
             'whatsapp':'group_method_not_verified'}
    content={'cards':cards,'assets_sha256':asset_hashes,'captions':captions,'targets':targets}
    pack={**content,'date':day,'title':'Günlük iki süre ve iki makam','status':'draft',
          'approved_at':None,'published_at':None,'publishing_enabled':False,
          'content_sha256':hashlib.sha256(json.dumps(content,ensure_ascii=False,sort_keys=True,indent=2).encode()).hexdigest()}
    gallery=''.join(f'<article><img src="{c["files"]["feed"]}" alt="{html.escape(c["statement"])}"><p><a download href="{c["files"]["feed"]}">Görseli indir</a></p></article>' for c in cards)
    page='''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Günlük önizleme</title><style>body{margin:20px;background:#f6f7fc;color:#142d59;font:16px/1.6 system-ui,sans-serif}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}img{width:100%;height:auto}pre{white-space:pre-wrap}a{color:inherit}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><h1>UFUK ÇETİNTAŞ · Günlük önizleme</h1><p>Bu paket taslaktır. Günlük kullanıcı onayı olmadan paylaşılmaz.</p><div class="grid">'''+gallery+'</div><details><summary>Paylaşım metni</summary><pre>'+html.escape(text)+'</pre></details></html>'
    assets['onizleme.html']=(page.encode(),'text/html; charset=utf-8')
    assets['metinler.txt']=(text.encode(),'text/plain; charset=utf-8')
    assets['paket.json']=(json.dumps(pack,ensure_ascii=False,indent=2).encode(),'application/json')
    return pack,assets
