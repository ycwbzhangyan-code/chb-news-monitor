#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为无RSS媒体建立采集覆盖：批量生成并实测 Google News site: 限定源。
目标：Wiser有的媒体都要能采集到（无RSS的用GNews站点聚合兜底）。"""
import json, io, re, urllib.request, ssl, urllib.parse, concurrent.futures, collections

BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
CFG=json.load(io.open(BASE+'config/sources_full_config.json',encoding='utf-8'))
S=CFG['sources']
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDR={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

# 已有GNews site: 的域名，避免重复
existing_site=set()
for x in S:
    rss=str(x.get('rss',''))
    m=re.search(r'site%3A([^&\s]+)|site:([^&\s]+)',rss,re.I)
    if m: existing_site.add((m.group(1) or m.group(2)).lower())

def real_domain(x):
    """从 site/domain/name/full 中提取合法域名（配置里domain常被截断）"""
    for field in ['site','domain','full','name']:
        s=str(x.get(field,'') or '')
        # 优先 http(s) URL
        m=re.search(r'https?://(?:www\.)?([a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(?:\.[a-z]{2,})?)',s,re.I)
        if m: return m.group(1).lower().rstrip('/')
        m=re.search(r'(?:www\.)?([a-z0-9][a-z0-9\-]*\.(?:com|hk|org|net|gov|edu|cn|tw|io|co)[a-z.]*)',s,re.I)
        if m and len(m.group(1))>6: return m.group(1).lower().rstrip('/')
    return ''

# 候选：无RSS、香港/财经/广电/通讯社类、有合法域名
cand=[]
for x in S:
    if x.get('rss'): continue
    if x.get('cat') not in ('hk_print','hk_en','hk_business','tv_radio','news_agency'): continue
    d=real_domain(x)
    if not d or d in existing_site: continue
    cand.append({'id':x['id'],'name':x['name'],'domain':d,'cat':x.get('cat')})
# 域名去重
seen=set(); uniq=[]
for c in cand:
    if c['domain'] in seen: continue
    seen.add(c['domain']); uniq.append(c)
print('候选无RSS媒体',len(uniq),flush=True)

def gurl(d):
    # 站点限定 + 宽主题（创兴定存/税贷/银行比较），命中后由正文核验闸门把关
    q=f'site:{d} (創興銀行 OR 创兴银行 OR 定存 OR 存款利率 OR 稅貸 OR 銀行)'
    return 'https://news.google.com/rss/search?q='+urllib.parse.quote(q)+'&hl=zh-HK&gl=HK&ceid=HK:zh-Hant', q

def verify(c):
    url,q=gurl(c['domain'])
    try:
        raw=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=10,context=ctx).read(5000)
        t=raw.decode('utf-8','ignore').lower()
        n=t.count('<item')
        if '<rss' in t and n>0: return {**c,'ok':True,'url':url,'query':q,'items':n}
    except Exception: pass
    return {**c,'ok':False}

# 全部并发验证
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    res=list(ex.map(verify,uniq))
ok=[r for r in res if r['ok']]
print('GNews站点源有效',len(ok),'/',len(res),flush=True)
json.dump(ok,io.open(BASE+'output/no_rss_gnews_addable.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('saved',flush=True)
for r in ok[:15]: print(' OK',r['name'][:30],'|',r['domain'],'| items',r['items'])
