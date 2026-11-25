# -*- coding: utf-8 -*-
"""实测 Wiser 截图中出现但我方覆盖弱的信源 — 2026-11-25
目标媒体：星島頭條網、BusinessFocus、信報財經新聞網、U Lifestyle、明報、香港經濟日報網
"""
import json, urllib.request, ssl, concurrent.futures

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
       'Accept': 'application/rss+xml,application/xml,text/xml,*/*'}

CANDIDATES = [
    ('星島頭條網-即時', 'hk_news', 'https://www.stheadline.com/rss/news/hk'),
    ('星島頭條網-財經', 'hk_business', 'https://www.stheadline.com/rss/finance'),
    ('星島頭條網-全部', 'hk_news', 'https://www.stheadline.com/rss'),
    ('BusinessFocus', 'hk_business', 'https://www.businessfocus.com.hk/feed'),
    ('BusinessFocus-文章', 'hk_business', 'https://www.businessfocus.com.hk/rss'),
    ('U Lifestyle-首頁', 'hk_lifestyle', 'https://hk.ulifestyle.com.hk/rss'),
    ('U Lifestyle-理財', 'hk_business', 'https://hk.ulifestyle.com.hk/category/10404/rss'),
    ('信報-即時', 'hk_business', 'https://www.hkej.com/rss/hkejnews'),
    ('信報-財經', 'hk_business', 'http://www.hkej.com/rss'),
    ('明報-財經網', 'hk_business', 'https://finance.mingpao.com/feed'),
    ('明報-即時', 'hk_news', 'https://news.mingpao.com/rss'),
    ('香港經濟日報- Finance', 'hk_business', 'https://www.hket.com/rss'),
    ('香港經濟日報-理財', 'hk_business', 'https://wealth.hket.com/rss'),
]

def verify(t):
    name, cat, url = t
    try:
        req = urllib.request.Request(url, headers=HDR)
        raw = urllib.request.urlopen(req, timeout=12, context=ctx).read(3000)
        txt = raw.decode('utf-8', 'ignore')
        is_xml = '<rss' in txt.lower() or '<feed' in txt.lower() or '<channel' in txt.lower()
        has_item = '<item' in txt.lower() or '<entry' in txt.lower()
        if is_xml and has_item:
            return {'ok': True, 'name': name, 'cat': cat, 'url': url}
        return {'ok': False, 'name': name, 'url': url, 'reason': 'not_rss:' + txt[:60].replace('\n', ' ')}
    except Exception as e:
        return {'ok': False, 'name': name, 'url': url, 'reason': type(e).__name__ + ':' + str(e)[:50]}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    res = list(ex.map(verify, CANDIDATES))
ok = [r for r in res if r['ok']]
print(f'有效 {len(ok)}/{len(CANDIDATES)}')
for r in ok: print(' OK ', r['name'], '|', r['url'])
print('\n无效:')
for r in res:
    if not r['ok']: print(' BAD', r['name'], '|', r['reason'])
json.dump(ok, open('data/verified_wiser_sources_1125.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
print('\nsaved', len(ok))
