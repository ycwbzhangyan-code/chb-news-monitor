#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全量探测 Wiser 未覆盖媒体(1737域名)官方RSS，严格校验item数；输出可入库源清单。"""
import json, io, re, urllib.request, ssl, concurrent.futures

BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
R=json.load(io.open(BASE+'output/wiser_compare_precise.json',encoding='utf-8'))
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDR={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

def domain(s):
    m=re.search(r'(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9.\-]+\.[a-z]{2,})',str(s or '').lower())
    return m.group(1) if m else ''

cand=[]
for r in R:
    if r['精确匹配']=='已覆盖': continue
    d=domain(r['Pub Name (Eng)'])
    if not d or r['封闭平台']: continue
    rel = r['Media Region'] in ('Hong Kong','Macao','China') or r['Media Type'] in ('Newspaper','Magazine','Broadcast','Agency News','Government')
    if not rel: continue
    cand.append({'name':str(r['Pub Name (Eng)'])[:40],'chi':r['Pub Name (Chi)'],'domain':d,
                 'region':r['Media Region'],'type':r['Media Type'],'status':r['精确匹配']})
seen=set(); uniq=[]
for c in cand:
    if c['domain'] in seen: continue
    seen.add(c['domain']); uniq.append(c)
print('TOTAL CANDIDATES',len(uniq),flush=True)

PATHS=['/rss','/feed','/rss.xml','/feed.xml','/atom.xml']

def probe(c):
    d=c['domain']
    for path in PATHS:
        url=f'https://{d}{path}'
        try:
            raw=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=5,context=ctx).read(4000)
            t=raw.decode('utf-8','ignore').lower()
            if ('<rss' in t or '<feed' in t) and '<item' in t:
                n=t.count('<item')
                return {**c,'rss_url':url,'rss_ok':True,'items':n}
        except Exception: pass
    return {**c,'rss_ok':False}

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    res=list(ex.map(probe,uniq))

ok=[r for r in res if r['rss_ok']]
no=[r for r in res if not r['rss_ok']]
print('OFFICIAL RSS OK',len(ok),'| NO RSS',len(no),flush=True)
json.dump(res,io.open(BASE+'output/wiser_probe_full.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
json.dump(ok,io.open(BASE+'output/wiser_rss_addable.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('saved',flush=True)
for r in ok[:40]: print(' RSS',r['name'],'|',r['domain'],'|items',r['items'])
