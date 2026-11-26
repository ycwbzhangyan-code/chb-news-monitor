#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量探测 Wiser 未覆盖媒体的官方 RSS 可达性；不可 RSS 的用 Google News site: 兜底。"""
import json, io, re, urllib.request, ssl, urllib.parse, concurrent.futures, collections

BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
R=json.load(io.open(BASE+'output/wiser_compare_precise.json',encoding='utf-8'))
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDR={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

def domain(s):
    m=re.search(r'(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9.\-]+\.[a-z]{2,})',str(s or '').lower())
    return m.group(1) if m else ''

RSS_PATHS=['/rss','/feed','/rss.xml','/feed.xml','/atom.xml','/rss/news.xml','/news/rss','/sitemap.xml']

# 聚焦：港澳地区 + 传统媒体 + 香港财经网媒，有域名，未覆盖或部分覆盖
cand=[]
for r in R:
    if r['精确匹配']=='已覆盖': continue
    d=domain(r['Pub Name (Eng)'])
    if not d: continue
    rel = r['Media Region'] in ('Hong Kong','Macao','China') or r['Media Type'] in ('Newspaper','Magazine','Broadcast','Agency News','Government')
    if not rel: continue
    if r['封闭平台']: continue
    cand.append({'name':r['Pub Name (Eng)'],'chi':r['Pub Name (Chi)'],'domain':d,'region':r['Media Region'],'type':r['Media Type']})
# 域名去重
seen=set(); uniq=[]
for c in cand:
    if c['domain'] in seen: continue
    seen.add(c['domain']); uniq.append(c)
print('CANDIDATES after dedup',len(uniq))

def probe(c):
    d=c['domain']
    results=[]
    for path in ['/rss','/feed','/rss.xml','/feed.xml']:
        url=f'https://{d}{path}'
        try:
            raw=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=6,context=ctx).read(1500)
            t=raw.decode('utf-8','ignore').lower()
            if '<rss' in t or '<feed' in t:
                return {**c,'rss_url':url,'rss_ok':True,'method':'official_rss'}
        except Exception: pass
    # 官方RSS不通过 → 标记GNews候选
    return {**c,'rss_ok':False,'method':'gnews_candidate'}

# 控制并发与时间：先探前 300 个
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    res=list(ex.map(probe,uniq[:300]))

rss_ok=[r for r in res if r['rss_ok']]
gn=[r for r in res if not r['rss_ok']]
print('official RSS ok',len(rss_ok),'GNews candidates',len(gn))
for r in rss_ok[:30]: print('  RSS',r['name'],'->',r['rss_url'])
json.dump(res,io.open(BASE+'output/wiser_probe_results.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('saved wiser_probe_results.json')
