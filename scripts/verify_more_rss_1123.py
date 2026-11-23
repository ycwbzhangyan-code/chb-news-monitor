# -*- coding: utf-8 -*-
"""第二轮媒体RSS实测 — 2026-11-23
目标：补充香港本地、内地财经、国际媒体中尚未纳入的直接RSS源。
只保留实测返回有效RSS结构的地址，写入 data/verified_rss_round2.json。
"""
import json, os, re, urllib.request, ssl, concurrent.futures

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
       'Accept': 'application/rss+xml, application/xml, text/xml, */*'}

# 候选RSS：聚焦尚未覆盖的媒体与垂直栏目
CANDIDATES = [
    # 香港本地
    ('香港01-財經', 'hk_business', 'https://www.hk01.com/rss/category/41'),
    ('香港01-即時', 'hk_news', 'https://www.hk01.com/rss'),
    ('明報-即時', 'hk_news', 'https://news.mingpao.com/rss/news.xml'),
    ('明報-財經', 'hk_business', 'https://news.mingpao.com/rss/fin.xml'),
    ('星島-即時', 'hk_news', 'https://www.stheadline.com/rss/news/hk'),
    ('星島-財經', 'hk_business', 'https://www.stheadline.com/rss/finance'),
    ('東網-即時', 'hk_news', 'https://hk.on.cc/rss/hknews.xml'),
    ('東網-財經', 'hk_business', 'https://hk.on.cc/rss/fin.xml'),
    ('巴士的報-即時', 'hk_news', 'https://www.bastillepost.com/rss'),
    ('AM730-即時', 'hk_news', 'https://www.am730.com.hk/rss'),
    ('頭條日報-即時', 'hk_news', 'https://www.stheadline.com/rss'),
    ('信報-財經', 'hk_business', 'https://www.hkej.com/rss'),
    ('經濟日報-即時', 'hk_business', 'https://www.hket.com/rss/hketnews.xml'),
    ('橙新聞-即時', 'hk_news', 'https://www.orangenews.hk/rss'),
    ('點新聞-即時', 'hk_news', 'https://www.dotdotnews.com/rss'),
    ('香港電台-新聞', 'hk_news', 'https://news.rthk.hk/rthk/en/rss/latest.jsp'),
    ('now新聞-即時', 'hk_news', 'https://news.now.com/rss'),
    ('有線新聞-即時', 'hk_news', 'https://cabletv.com.hk/rss'),
    ('澳門日報-即時', 'mo_news', 'https://www.macaodaily.com/rss'),
    ('澳門電台-新聞', 'mo_news', 'https://www.tdm.com.mo/rss'),
    # 内地财经
    ('新浪財經-即時', 'cn_business', 'https://finance.sina.com.cn/roll/index.d.xml'),
    ('東方財富-要聞', 'cn_business', 'https://rss.eastmoney.com/rss/news.xml'),
    ('人民網-財經', 'cn_business', 'http://www.people.com.cn/rss/finance.xml'),
    ('新華網-財經', 'cn_business', 'http://www.xinhuanet.com/politics/news_politics.xml'),
    ('中國新聞網-財經', 'cn_business', 'https://www.chinanews.com.cn/rss/finance.xml'),
    ('環球網-財經', 'cn_business', 'https://rss.huanqiu.com/rss/china.xml'),
    ('證券時報', 'cn_business', 'https://www.stcn.com/rss/news.xml'),
    ('上海證券報', 'cn_business', 'https://www.cnstock.com/rss'),
    ('財聯社', 'cn_business', 'https://www.cls.cn/rss'),
    ('界面新聞', 'cn_business', 'https://www.jiemian.com/rss.xml'),
    ('第一財經', 'cn_business', 'https://www.yicai.com/rss/news.xml'),
    ('21世紀經濟報道', 'cn_business', 'https://www.21jingji.com/rss'),
    # 国际财经
    ('BBC中文', 'intl', 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'),
    ('BBC財經', 'intl', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
    ('路透-財經', 'intl', 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best'),
    ('CNBC', 'intl', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'),
    ('MarketWatch', 'intl', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'),
    ('FT中文網', 'intl', 'https://www.ftchinese.com/rss/feed'),
    ('華爾街日報中文', 'intl', 'https://feeds.wsj.com/cn/rss'),
    ('日經中文網', 'intl', 'https://cn.nikkei.com/rss.xml'),
    ('彭博-市場', 'intl', 'https://feeds.bloomberg.com/markets/news.rss'),
    ('Yahoo財經香港', 'intl', 'https://hk.finance.yahoo.com/news/rssindex'),
]

def verify(t):
    name, cat, url = t
    try:
        req = urllib.request.Request(url, headers=HDR)
        raw = urllib.request.urlopen(req, timeout=12, context=ctx).read(3000)
        txt = raw.decode('utf-8', 'ignore')
        # 判定有效RSS：含 <rss / <feed / <channel 且能解析出 <item>/<entry>
        is_xml = '<rss' in txt.lower() or '<feed' in txt.lower() or '<channel' in txt.lower()
        has_item = '<item' in txt.lower() or '<entry' in txt.lower()
        if is_xml and has_item:
            return {'ok': True, 'name': name, 'cat': cat, 'url': url, 'bytes': len(raw)}
        else:
            return {'ok': False, 'name': name, 'url': url, 'reason': 'not_rss', 'head': txt[:80]}
    except Exception as e:
        return {'ok': False, 'name': name, 'url': url, 'reason': type(e).__name__ + ':' + str(e)[:50]}

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(verify, CANDIDATES))

ok = [r for r in results if r['ok']]
bad = [r for r in results if not r['ok']]
print(f'=== 实测完成: {len(ok)}/{len(CANDIDATES)} 有效 ===')
for r in ok:
    print('OK  ', r['name'], '|', r['url'])
print()
print('=== 无效 ===')
for r in bad:
    print('BAD ', r['name'], '|', r['reason'])

out = 'data/verified_rss_round2.json'
json.dump(ok, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('\nsaved', out, len(ok))
