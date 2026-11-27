#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把实测有效的无RSS媒体GNews站点源入库。"""
import json, io, datetime, collections
BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
CFG=json.load(io.open(BASE+'config/sources_full_config.json',encoding='utf-8'))
S=CFG['sources']
add=json.load(io.open(BASE+'output/no_rss_gnews_addable.json',encoding='utf-8'))
today=datetime.date.today().isoformat()
existing=set()
for x in S:
    d=str(x.get('domain','')).lower().rstrip('/')
    if d: existing.add(d)
added=[]
maxno=max(int(x.get('no',0) or 0) for x in S)
for r in add:
    d=r['domain'].lower().rstrip('/')
    if d in existing: continue
    existing.add(d); maxno+=1
    added.append({
        'id':f'nr{maxno:04d}','name':f"GN-{r['name'][:26]}",'full':r['name'],
        'lang':'CH','cat':r['cat'],'cat_name':'无RSS媒体GNews覆盖',
        'rss':r['url'],'site':f'https://{d}','domain':d,'access':'rss',
        'no':maxno,'discovery':'no_rss_gnews_cover','original_id':r['id'],
        'query':r['query'],'verified':today,
    })
S.extend(added)
CFG['meta']['total_sources']=len(S)
CFG['meta']['updated']=today
rss_count=sum(1 for x in S if x.get('rss'))
CFG['meta']['rss_stats']['total_with_rss']=rss_count
CFG['meta']['rss_stats']['verified_no_rss_cover_1127']=len(added)
CFG['meta']['no_rss_coverage']={
    'total_no_rss_original':3510,
    'with_valid_domain':813,
    'gnews_site_verified':len(added),
    'note':'无RSS媒体用Google News site:限定覆盖；仅Google收录的媒体可覆盖，长尾小站不可达。'
}
json.dump(CFG,io.open(BASE+'config/sources_full_config.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('ADDED',len(added),'| total',len(S),'| RSS',rss_count)
json.dump(added,io.open(BASE+'output/no_rss_sources_added.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
