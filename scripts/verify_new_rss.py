# -*- coding: utf-8 -*-
"""实测候选 RSS 地址；仅保留返回合法 RSS/Atom 且含 item/entry 的源。"""
import urllib.request, ssl, json, re, concurrent.futures, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (name, url, cat, lang)
CANDIDATES = [
 # --- 香港主流 ---
 ("香港經濟日報·即時", "https://www.hket.com/rss/breaking-news", "hk_business", "CH"),
 ("香港經濟日報·理財", "https://wealth.hket.com/rss", "hk_business", "CH"),
 ("香港經濟日報·地產", "https://www.hket.com/rss/property", "hk_business", "CH"),
 ("信報·即時新聞", "https://www.hkej.com/rss/onlinenews.xml", "hk_business", "CH"),
 ("信報·財經", "https://www.hkej.com/rss/financial.xml", "hk_business", "CH"),
 ("明報·即時", "https://news.mingpao.com/rss/pns/s00001.xml", "hk_print", "CH"),
 ("明報·財經", "https://news.mingpao.com/rss/pns/s00014.xml", "hk_print", "CH"),
 ("星島頭條·RSS", "https://www.stheadline.com/rss", "hk_print", "CH"),
 ("香港01·RSS", "https://www.hk01.com/rss", "hk_business", "CH"),
 ("東網·即時", "https://hk.on.cc/rss/hk/news.xml", "hk_business", "CH"),
 ("東網·財經", "https://hk.on.cc/rss/hk/fin.xml", "hk_business", "CH"),
 ("巴士的報·RSS", "https://www.bastillepost.com/hongkong/rss.xml", "hk_business", "CH"),
 ("經濟通·即時", "https://www.etnet.com.hk/rss/news.xml", "hk_business", "CH"),
 ("香港電台·新聞", "https://news.rthk.hk/rthk/ch/rss/news.xml", "hk_business", "CH"),
 ("now新聞", "https://news.now.com/home/rss", "tv_radio", "CH"),
 ("無綫新聞", "https://news.tvb.com/rss", "tv_radio", "CH"),
 ("凤凰网香港", "https://hk.finance.ifeng.com/rss.xml", "hk_business", "CH"),
 ("Yahoo香港·財經", "https://hk.finance.yahoo.com/rss/headline", "hk_business", "CH"),
 ("亞洲日報", "https://www.asiaday.com.hk/rss.xml", "hk_print", "CH"),
 ("大公報", "https://www.tkww.hk/rss/tkww.xml", "hk_print", "CH"),
 ("文匯報", "https://www.wenweipo.com/rss.xml", "hk_print", "CH"),
 ("香港商報", "https://www.hkcd.com.hk/rss.xml", "hk_print", "CH"),
 ("澳門日報", "https://www.macaodaily.com/rss.xml", "hk_print", "CH"),
 # --- 内地财经/主流 ---
 ("人民網·財經", "http://www.people.com.cn/rss/finance.xml", "cn_mainland", "CH"),
 ("人民網·時政", "http://www.people.com.cn/rss/politics.xml", "cn_mainland", "CH"),
 ("新華網·財經", "http://www.xinhuanet.com/politics/news_politics.xml", "cn_mainland", "CH"),
 ("新浪財經", "https://finance.sina.com.cn/rss/finance.xml", "cn_mainland", "CH"),
 ("新浪新聞·全部", "https://news.sina.com.cn/rss/all.xml", "cn_mainland", "CH"),
 ("騰訊新聞·財經", "https://news.qq.com/rss/finance.xml", "cn_mainland", "CH"),
 ("网易财经", "https://money.163.com/rss/", "cn_mainland", "CH"),
 ("東方財富·資訊", "https://rss.eastmoney.com/rss/news.xml", "cn_mainland", "CH"),
 ("證券時報", "https://www.stcn.com/rss/news.xml", "cn_mainland", "CH"),
 ("中國證券報", "https://www.cs.com.cn/rss/", "cn_mainland", "CH"),
 ("上海證券報", "https://www.cnstock.com/rss/", "cn_mainland", "CH"),
 ("第一財經", "https://www.yicai.com/rss/", "cn_mainland", "CH"),
 ("财新网", "https://www.caixin.com/rss/", "cn_mainland", "CH"),
 ("36氪", "https://36kr.com/feed", "cn_mainland", "CH"),
 ("虎嗅", "https://www.huxiu.com/rss/0.xml", "cn_mainland", "CH"),
 ("界面新闻", "https://www.jiemian.com/rss.xml", "cn_mainland", "CH"),
 ("每日经济新闻", "https://www.nbd.com.cn/rss/", "cn_mainland", "CH"),
 ("经济观察网", "https://www.eeo.com.cn/rss/", "cn_mainland", "CH"),
 ("中国经营网", "https://www.cb.com.cn/rss/", "cn_mainland", "CH"),
 ("南方日报", "https://www.nfnews.com/rss.xml", "cn_mainland", "CH"),
 ("广州日报", "https://gzdaily.dayoo.com/rss.xml", "cn_mainland", "CH"),
 ("深圳特区报", "https://www.sznews.com/rss/", "cn_mainland", "CH"),
 # --- 国际 / 英文 ---
 ("BBC中文", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", "hk_en", "CH"),
 ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "hk_en", "ENG"),
 ("Reuters Business", "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best", "news_agency", "ENG"),
 ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html", "news_agency", "ENG"),
 ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/", "news_agency", "ENG"),
 ("FT中文网", "https://www.ftchinese.com/rss/feed", "hk_en", "CH"),
 ("日經中文網", "https://cn.nikkei.com/rss/cn.xml", "news_agency", "CH"),
 ("彭博·中文", "https://feeds.bloomberg.com/markets/news.rss", "news_agency", "ENG"),
 ("WSJ", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "news_agency", "ENG"),
 ("CNN Business", "http://rss.cnn.com/rss/money_latest.rss", "news_agency", "ENG"),
 ("Google News·CHB", "https://news.google.com/rss/search?q=Chong+Hing+Bank&hl=en-US&gl=US&ceid=US:en", "news_agency", "ENG"),
 ("Google News·創興銀行", "https://news.google.com/rss/search?q=%E5%89%B5%E8%88%88%E9%8A%80%E8%A1%8C&hl=zh-TW&gl=HK&ceid=HK:zh-Hant", "news_agency", "CH"),
 ("Google News·定存香港", "https://news.google.com/rss/search?q=%E5%AE%9A%E5%AD%98+when:7d&hl=zh-TW&gl=HK&ceid=HK:zh-Hant", "news_agency", "CH"),
]

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
HDRS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8'}

def check(c):
    name, url, cat, lang = c
    try:
        req = urllib.request.Request(url, headers=HDRS)
        with urllib.request.urlopen(req, timeout=12, context=CTX) as r:
            raw = r.read(200000)
            txt = raw.decode('utf-8', 'ignore')
            low = txt[:1500].lower()
            if not ('<rss' in low or '<feed' in low or '<?xml' in low):
                return None
            items = len(re.findall(r'<item[\s>]', txt, re.I)) + len(re.findall(r'<entry[\s>]', txt, re.I))
            return {'name': name, 'url': url, 'cat': cat, 'lang': lang, 'items': items, 'bytes': len(raw)}
    except Exception as e:
        return None

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    results = list(ex.map(check, CANDIDATES))

valid = [r for r in results if r and r['items'] > 0]
for r in valid:
    print('OK', r['items'], r['name'], '|', r['url'])
print('\n=== VALID', len(valid), '/', len(CANDIDATES), '===')
p = os.path.join(ROOT, 'data', 'verified_rss_candidates.json')
json.dump(valid, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('saved:', p)
