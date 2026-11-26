#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把实测有效的 Wiser 补源（官方RSS + GNews站点）入库到 sources_full_config.json。"""
import json, io, datetime

BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
CFG=json.load(io.open(BASE+'config/sources_full_config.json',encoding='utf-8'))
S=CFG['sources']
existing_dom=set()
for x in S:
    d=str(x.get('domain') or '')
    if d: existing_dom.add(d.lower().rstrip('/'))

rss=json.load(io.open(BASE+'output/wiser_rss_addable.json',encoding='utf-8'))
gnews=json.load(io.open(BASE+'output/wiser_gnews_addable.json',encoding='utf-8'))
today=datetime.date.today().isoformat()

added=[]
maxno=max(int(x.get('no',0) or 0) for x in S)
# 官方 RSS
for r in rss:
    d=r['domain'].lower().rstrip('/')
    if d in existing_dom: continue
    existing_dom.add(d)
    maxno+=1
    rec={'id':f'w{maxno:04d}','name':f"Wiser-{r['name'][:28]}",'full':f"{r['name']} / {r.get('chi','')}",
         'lang':'CH' if r.get('region')=='Hong Kong' else 'CH','cat':'hk_business' if r.get('region')=='Hong Kong' else 'cn_business',
         'cat_name':'Wiser清单补源(RSS)','rss':r['rss_url'],'site':f'https://{d}','domain':d,'access':'rss',
         'no':maxno,'discovery':'wiser_content_list','wiser_name':r['name'],'verified':today}
    added.append(rec)
# GNews 站点限定
for r in gnews:
    d=r['domain'].lower().rstrip('/')
    if d in existing_dom: continue
    existing_dom.add(d)
    maxno+=1
    rec={'id':f'w{maxno:04d}','name':f"WG-{r['name'][:26]}",'full':f"{r['name']} / {r.get('chi','')}",
         'lang':'CH','cat':'hk_business' if r.get('region')=='Hong Kong' else 'cn_business',
         'cat_name':'Wiser清单补源(GNews站点)','rss':r['url'],'site':f'https://{d}','domain':d,'access':'rss',
         'no':maxno,'discovery':'wiser_content_list_gnews','wiser_name':r['name'],'query':r['query'],'verified':today}
    added.append(rec)

S.extend(added)
CFG['meta']['total_sources']=len(S)
CFG['meta']['updated']=today
CFG['meta']['wiser_aligned']={'content_list_date':'2026-10-05','wiser_total':5967,'added_sources':len(added),
    'note':'对照 Wiser 官方 Content List 补齐；官方RSS 142候选+GNews站点153候选，去重后实际入库见 added_sources'}
rss_count=sum(1 for x in S if x.get('access')=='rss' or x.get('rss'))
CFG['meta']['rss_stats']['total_with_rss']=rss_count
CFG['meta']['rss_stats']['verified_wiser_1126']=len(added)

json.dump(CFG,io.open(BASE+'config/sources_full_config.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('ADDED',len(added),'| total sources',len(S),'| total RSS',rss_count)
import collections
print('BY discovery',collections.Counter(x.get('discovery','orig') for x in S if x.get('discovery')))
json.dump(added,io.open(BASE+'output/wiser_sources_added.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
