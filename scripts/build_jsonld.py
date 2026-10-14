#!/usr/bin/env python3
"""Inject schema.org JSON-LD built ONLY from data/*.json + visible page text. Re-runnable."""
import json, re, html, os
B='https://spotandtravel.com/'
TYPES={'pubs':'BarOrPub','luxury':'Hotel','arenas':'StadiumOrArena','beaches':'Beach','parks':'Park',
 'landmarks':'LandmarkOrHistoricalBuilding','islands':'TouristDestination','cities':'City','countries':'Country','hidden-gems':'TouristAttraction'}
def put(path, marker, obj):
    s=open(path,encoding='utf-8').read()
    blk=f'<script type="application/ld+json" id="{marker}">'+json.dumps(obj,ensure_ascii=False).replace('</','<\\/')+'</script>'
    s=re.sub(r'\s*<script type="application/ld\+json" id="%s">.*?</script>'%marker,'',s,flags=re.S)
    anchor='  <!-- /seo -->' if '<!-- /seo -->' in s else '</head>'
    s=s.replace(anchor,'  '+blk+'\n'+anchor,1); assert blk in s, path
    open(path,'w',encoding='utf-8').write(s)
for tab,t in TYPES.items():
    page=f'pages/{tab}.html'; url=B+page; items=[]
    title=html.unescape(re.search(r'<title>(.*?)</title>',open(page).read()).group(1))
    for i,c in enumerate(json.load(open(f'data/{tab}.json')),1):
        f=c.get('facts',{}); im=c.get('image',{})
        o={'@type':t,'name':c['name']}
        d=f.get('one_liner'); 
        if d: o['description']=d
        img=im.get('local_path'); o['image']=B+img if img and os.path.exists(img) else im.get('url')
        if t=='Country': pass
        elif t=='City': o['containedInPlace']={'@type':'Country','name':c['country']} if c.get('country') else None
        else:
            a={'@type':'PostalAddress'}
            if c.get('city'): a['addressLocality']=c['city']
            if c.get('country'): a['addressCountry']=c['country']
            if len(a)>1: o['address']=a
        if isinstance(c.get('lat'),(int,float)) and isinstance(c.get('lng'),(int,float)):
            o['geo']={'@type':'GeoCoordinates','latitude':c['lat'],'longitude':c['lng']}
        if f.get('official_or_tourism_url'): o['url']=f['official_or_tourism_url']
        o={k:v for k,v in o.items() if v}
        items.append({'@type':'ListItem','position':i,'item':o})
    put(page,'ld-places',{'@context':'https://schema.org','@type':'ItemList','name':title.split(' | ')[0],'url':url,'numberOfItems':len(items),'itemListElement':items})
put('index.html','ld-org',{'@context':'https://schema.org','@type':'Organization','name':'Spot and Travel','url':B,
 'logo':B+'assets/logo.png','email':'hello@spotandtravel.com'})
# FAQ from visible <details>
s=open('pages/support.html').read(); qa=[]
for q,a in re.findall(r'<details><summary>(.*?)</summary><div class="ans">(.*?)</div></details>',s,re.S):
    txt=lambda x: re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',x))).strip()
    qa.append({'@type':'Question','name':txt(q),'acceptedAnswer':{'@type':'Answer','text':txt(a).replace(' .','.').replace(' ,',',')}})
put('pages/support.html','ld-faq',{'@context':'https://schema.org','@type':'FAQPage','mainEntity':qa})
print('faq',len(qa))
