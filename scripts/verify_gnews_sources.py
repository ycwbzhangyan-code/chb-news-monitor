# -*- coding: utf-8 -*-
"""生成并实测 Google News 关键词搜索 RSS（覆盖创兴银行相关全部主题）。"""
import urllib.request, ssl, urllib.parse, json, re, concurrent.futures, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (name, query, hl, gl, ceid, cat)
Q = [
 ("GNews-創興銀行繁中","創興銀行","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-创兴银行简中","创兴银行","zh-CN","CN","CN:zh-Hans","cn_mainland"),
 ("GNews-ChongHingBank","\"Chong Hing Bank\"","en-US","US","US:en","news_agency"),
 ("GNews-廖創興","廖創興","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行定存","創興銀行 定存","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行定期","創興銀行 定期存款","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興银行利率","創興銀行 利率","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行港元","創興銀行 港元","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行美元","創興銀行 美元","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行按揭","創興銀行 按揭","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行理財","創興銀行 理財","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行評級","創興銀行 評級","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行越秀","創興銀行 越秀","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-CHB-HK","CHB bank Hong Kong","en-US","US","US:en","news_agency"),
 ("GNews-ChongHing定存","Chong Hing time deposit","en-US","US","US:en","news_agency"),
 ("GNews-香港定存","香港 定存 利率","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-港元定期比較","港元 定期存款 比較","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-美元定存香港","美元 定存 香港","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-稅貸","稅貸 銀行","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-香港加息","香港 加息 銀行","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-越秀集團","越秀集團","zh-TW","HK","HK:zh-Hant","cn_mainland"),
 ("GNews-香港人壽","香港人壽","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興證券","創興證券","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興保險","創興保險","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-横琴創興","创兴银行 横琴","zh-CN","CN","CN:zh-Hans","cn_mainland"),
 ("GNews-深圳創興","创兴银行 深圳","zh-CN","CN","CN:zh-Hans","cn_mainland"),
 ("GNews-广州創興","创兴银行 广州","zh-CN","CN","CN:zh-Hans","cn_mainland"),
 ("GNews-創興銀行債券","創興銀行 債券","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行訴訟","創興銀行 訴訟","zh-TW","HK","HK:zh-Hant","hk_business"),
 ("GNews-創興銀行收購","創興銀行 收購","zh-TW","HK","HK:zh-Hant","hk_business"),
]

CTX=ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE
HDRS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}

def build(q):
    name,query,hl,gl,ceid,cat=q
    url=('https://news.google.com/rss/search?q='+urllib.parse.quote(query)
         +'&hl='+hl+'&gl='+gl+'&ceid='+ceid)
    return name,url,cat

def check(q):
    name,url,cat=build(q)
    try:
        req=urllib.request.Request(url,headers=HDRS)
        with urllib.request.urlopen(req,timeout=12,context=CTX) as r:
            txt=r.read(300000).decode('utf-8','ignore')
            n=len(re.findall(r'<item[\s>]',txt,re.I))
            if n==0: return None
            return {'name':name,'url':url,'cat':cat,'lang':'CH','items':n,'query':q[1]}
    except Exception:
        return None

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    res=list(ex.map(check,Q))
valid=[r for r in res if r]
for r in valid: print('OK',r['items'],r['name'],'|',r['query'])
print('\n=== VALID',len(valid),'/',len(Q),'===')
p=os.path.join(ROOT,'data','verified_gnews_sources.json')
json.dump(valid,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('saved:',p)
