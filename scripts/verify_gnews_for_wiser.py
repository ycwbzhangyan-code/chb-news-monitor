#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 Wiser 未覆盖且有域名的媒体生成 Google News site: 限定源并验证有效率。"""
import json, io, urllib.request, ssl, urllib.parse, concurrent.futures

BASE='C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
R=json.load(io.open(BASE+'output/wiser_compare_precise.json',encoding='utf-8'))
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDR={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

def domain(s):
    import re
    m=re.search(r'(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9.\-]+\.[a-z]{2,})',str(s or '').lower())
    return m.group(1) if m else ''

# 聚焦香港/财经相关、有域名、未覆盖、非封闭平台
cand=[]
for r in R:
    if r['精确匹配']=='已覆盖' or r['封闭平台']: continue
    d=domain(r['Pub Name (Eng)'])
    if not d: continue
    if r['Media Region']!='Hong Kong' and r['Media Type'] not in ('Newspaper','Magazine','Broadcast','Agency News'): continue
    cand.append({'name':str(r['Pub Name (Eng)'])[:35],'chi':r['Pub Name (Chi)'],'domain':d,'region':r['Media Region'],'type':r['Media Type']})
seen=set(); uniq=[]
for c in cand:
    if c['domain'] in seen: continue
    seen.add(c['domain']); uniq.append(c)
print('CANDIDATES',len(uniq),flush=True)

def gurl(q,hl='zh-HK',gl='HK',ceid='HK:zh-Hant'):
    return 'https://news.google.com/rss/search?q='+urllib.parse.quote(q)+f'&hl={hl}&gl={gl}&ceid={ceid}'

def verify(c):
    # 站点限定 + 主题关键词（宽主题，命中创兴或财经动态）
    q=f"site:{c['domain']} (創興銀行 OR 创兴银行 OR 定存 OR 存款利率 OR 樓市 OR 銀行)"
    url=gurl(q)
    try:
        raw=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=10,context=ctx).read(6000)
        t=raw.decode('utf-8','ignore').lower()
        n=t.count('<item')
        if '<rss' in t and n>0: return {**c,'ok':True,'query':q,'url':url,'items':n}
        return {**c,'ok':False,'reason':'no_items'}
    except Exception as e:
        return {**c,'ok':False,'reason':type(e).__name__}

# 控制规模：验证前 250 个
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    res=list(ex.map(verify,uniq[:250]))

ok=[r for r in res if r['ok']]
print('GNEWS SITE OK',len(ok),'/',len(res),flush=True)
json.dump(ok,io.open(BASE+'output/wiser_gnews_addable.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
for r in ok[:30]: print(' OK',r['name'],'| items',r['items'])
print('saved',flush=True)
