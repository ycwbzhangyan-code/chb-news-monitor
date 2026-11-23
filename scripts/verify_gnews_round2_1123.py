# -*- coding: utf-8 -*-
"""第三轮 Google News 关键词源实测 — 2026-11-23
补充 Wiser 覆盖但此前遗漏的长尾主题/机构/人物关键词。
"""
import json, urllib.request, ssl, urllib.parse, concurrent.futures

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36'}

# 新增长尾关键词（中文名, 实际查询词）
KEYWORDS = [
    ('GNews-創興銀行派息', '創興銀行 派息 股息'),
    ('GNews-創興銀行業績', '創興銀行 業績 盈利'),
    ('GNews-創興銀行人事', '創興銀行 委任 辭任 高管'),
    ('GNews-創興銀行分行', '創興銀行 分行 開業'),
    ('GNews-創興銀行數字銀行', '創興銀行 數字銀行 理財APP'),
    ('GNews-創興銀行信用卡', '創興銀行 信用卡 優惠'),
    ('GNews-創興銀行按揭', '創興銀行 按揭 樓宇'),
    ('GNews-創興銀行中小企', '創興銀行 中小企 授信'),
    ('GNews-創興銀行人民幣', '創興銀行 人民幣 存款'),
    ('GNews-廖創興銀行', '廖創興銀行'),
    ('GNews-ChongHing定存利率', 'Chong Hing Bank deposit rate'),
    ('GNews-創興銀行ESG', '創興銀行 ESG 公益 環保'),
    ('GNews-創興銀行獎項', '創興銀行 獎項 排名'),
    ('GNews-創興銀行監管', '創興銀行 金管局 罰款 警告'),
    ('GNews-越秀地產創興', '越秀 創興銀行 控股'),
    ('GNews-創興銀行跨境理財', '創興銀行 跨境理財通 大灣區'),
    ('GNews-創興銀行債券發行', '創興銀行 債券 發行'),
    ('GNews-創興銀行保安', '創興銀行 保安 詐騙 警示'),
]

def gnews_url(q):
    return 'https://news.google.com/rss/search?q=' + urllib.parse.quote(q) + '&hl=zh-HK&gl=HK&ceid=HK:zh-Hant'

def verify(t):
    name, q = t
    url = gnews_url(q)
    try:
        req = urllib.request.Request(url, headers=HDR)
        raw = urllib.request.urlopen(req, timeout=12, context=ctx).read(2000)
        txt = raw.decode('utf-8', 'ignore')
        n_items = txt.lower().count('<item')
        if '<rss' in txt.lower() and n_items > 0:
            return {'ok': True, 'name': name, 'query': q, 'url': url, 'items_sample': n_items}
        return {'ok': False, 'name': name, 'reason': 'no_items'}
    except Exception as e:
        return {'ok': False, 'name': name, 'reason': type(e).__name__ + ':' + str(e)[:50]}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(verify, KEYWORDS))

ok = [r for r in results if r['ok']]
print(f'=== GNews 第三轮: {len(ok)}/{len(KEYWORDS)} 有效 ===')
for r in ok: print(' OK ', r['name'], '|', r['query'])
print('\n=== 无效 ===')
for r in results:
    if not r['ok']: print(' BAD', r['name'], '|', r['reason'])
json.dump(ok, open('data/verified_gnews_round2.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('\nsaved', len(ok))
