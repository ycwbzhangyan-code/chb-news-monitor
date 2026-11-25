# -*- coding: utf-8 -*-
"""用 Google News site: 限定补充 Wiser 截图媒体的聚合源 — 2026-11-25
这些媒体（信报/明报/BusinessFocus/星岛/U Lifestyle/HKET）多无公开RSS，
用 GNews site: 查询间接覆盖。
"""
import json, urllib.request, ssl, urllib.parse, concurrent.futures

ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDR={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

# (name, query) — site: 限定 + 主题词
QUERIES=[
    ('GNewsSite-信報-定存', 'site:hkej.com 定存 OR 定期存款'),
    ('GNewsSite-信報-港元', 'site:hkej.com 港元 OR 存款利率'),
    ('GNewsSite-明報-定存', 'site:mingpao.com 定存 OR 定期'),
    ('GNewsSite-明報-財經', 'site:finance.mingpao.com 存款 OR 息率'),
    ('GNewsSite-BusinessFocus-稅貸', 'site:businessfocus.com.hk 稅貸 OR 定存'),
    ('GNewsSite-星島頭條-定存', 'site:stheadline.com 定存 OR 美元'),
    ('GNewsSite-Ulife-匯率', 'site:ulifestyle.com.hk 匯率 OR 兌換'),
    ('GNewsSite-Ulife-定存', 'site:ulifestyle.com.hk 定存 OR 定期存款'),
    ('GNewsSite-HKET-定存', 'site:hket.com 定存 OR 定期存款'),
    ('GNewsSite-HKET-英鎊', 'site:hket.com 英鎊 OR 日元 OR 外幣'),
]

def gurl(q):
    return 'https://news.google.com/rss/search?q='+urllib.parse.quote(q)+'&hl=zh-HK&gl=HK&ceid=HK:zh-Hant'

def verify(t):
    name,q=t; url=gurl(q)
    try:
        raw=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=12,context=ctx).read(2000)
        txt=raw.decode('utf-8','ignore')
        n=txt.lower().count('<item')
        if '<rss' in txt.lower() and n>0: return {'ok':True,'name':name,'query':q,'url':url,'sample':n}
        return {'ok':False,'name':name,'reason':'no_items'}
    except Exception as e:
        return {'ok':False,'name':name,'reason':type(e).__name__+':'+str(e)[:50]}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    res=list(ex.map(verify,QUERIES))
ok=[r for r in res if r['ok']]
print(f'有效 {len(ok)}/{len(QUERIES)}')
for r in ok: print(' OK ',r['name'],'| sample',r['sample'])
print('\n无效:')
for r in res:
    if not r['ok']: print(' BAD',r['name'],r['reason'])
json.dump(ok,open('data/verified_gnews_sites_1125.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('\nsaved',len(ok))
