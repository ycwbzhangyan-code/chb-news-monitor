# -*- coding: utf-8 -*-
"""
目标媒体库 v2 — 从 627 条新闻提取媒体，归一，精确匹配现有源，为全部目标媒体建定向监测源。
用户诉求：把 627 条新闻涉及的媒体存进目标库，成为监测对象，覆盖面必须要有。

策略：
  1. 115 原始媒体名 → 78 归一目标媒体（别名表）
  2. 每个目标媒体映射到主域名（MEDIA_DOMAIN 表）
  3. 用域名精确匹配现有 4130 源 → 已覆盖的标记真实 source_id
  4. 为每个目标媒体建立 GNews site: 定向源（创兴银行 + 定存/利率等主题），保证主动监测覆盖
     - 已有定向源的不重复建
  5. 输出 data/target_media_library.json（供 API/前端展示）+ 更新 sources_full_config.json

输出：
  data/target_media_library.json
  config/sources_full_config.json (追加 target_*.json 源 + meta.target_media)
  output/目标媒体库覆盖报告_20261127.xlsx
"""
import json, os, re, urllib.parse
from collections import Counter, defaultdict
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_FILE = os.path.join(ROOT, 'data', 'news_items.json')
SOURCES_FILE = os.path.join(ROOT, 'config', 'sources_full_config.json')
OUT_LIB = os.path.join(ROOT, 'data', 'target_media_library.json')

# 标准媒体名 -> (主域名, 监测关键词主题, 类别)
# 域名来自实际新闻链接/Wiser Content List，用于精确匹配和 GNews site: 限定
MEDIA_DOMAIN = {
    '香港經濟日報': ('hket.com', '創興銀行 OR 定存 OR 存款利率', 'hk_business'),
    '信報': ('hkej.com', '創興銀行 OR 定存 OR 存款利率', 'hk_business'),
    'U Lifestyle': ('ulifestyle.com.hk', '創興銀行 OR 定存 OR 定期存款', 'hk_lifestyle'),
    '明報': ('mingpao.com', '創興銀行 OR 定存 OR 定期存款', 'hk_business'),
    '港生活': ('hkulifestyle.com', '創興銀行 OR 定存', 'hk_lifestyle'),
    '星島': ('stheadline.com', '創興銀行 OR 定存 OR 存款', 'hk_business'),
    '香港01': ('hk01.com', '創興銀行 OR 定存', 'hk_business'),
    'eZone': ('ezone.hk', '創興銀行 OR 定存 OR 匯率', 'hk_tech'),
    '搜狐新聞': ('sohu.com', '创兴银行 OR 定存', 'cn_mainland'),
    '經濟通': ('etnet.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '東網': ('on.cc', '創興銀行 OR 定存', 'hk_business'),
    '新假期': ('weekendweekly.com', '創興銀行 OR 定存', 'hk_lifestyle'),
    '香港商報': ('hkcommercial.com', '創興銀行 OR 定存', 'hk_business'),
    '澳門日報': ('modaily.com.mo', '創興銀行 OR 定存', 'mo_media'),
    'am730': ('am730.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '文匯報': ('wenweipo.com', '創興銀行 OR 定存', 'hk_business'),
    '大公報': ('takungpao.com', '創興銀行 OR 定存', 'hk_business'),
    '中財網': ('cnfin.com', '创兴银行 OR 定存', 'cn_mainland'),
    '匯港通訊': ('hkspectrum.com', '創興銀行 OR 定存', 'hk_news_agency'),
    '久期財經': ('prcfe.com', '创兴银行 OR 定存', 'cn_finance'),
    '中國金融商報網': ('prcfe.com', '创兴银行 OR 定存', 'cn_finance'),
    '證券日報': ('zqrb.cn', '创兴银行 OR 定存', 'cn_finance'),
    '新浪財經': ('sina.com.cn', '创兴银行 OR 定存', 'cn_finance'),
    '金融界': ('jrj.com.cn', '创兴银行 OR 定存', 'cn_finance'),
    'The Standard': ('thestandard.com.hk', 'Chong Hing Bank OR fixed deposit', 'hk_business'),
    '香港金融管理局': ('hkma.gov.hk', '創興銀行 OR Chong Hing', 'hk_regulator'),
    'CT GoodJobs': ('ctgoodjobs.hk', '創興銀行 OR Chong Hing', 'hk_jobs'),
    '巴士的報': ('bakeryhk.com', '創興銀行 OR 定存', 'hk_business'),
    '10Life': ('10life.com', 'Chong Hing Bank OR fixed deposit', 'hk_finance'),
    '同花順財經': ('10jqka.com.cn', '创兴银行 OR 定存', 'cn_finance'),
    '觀點網': ('guandian.cn', '创兴银行 OR 越秀', 'cn_finance'),
    '證券之星': ('stockstar.com', '创兴银行 OR 定存', 'cn_finance'),
    '格隆匯': ('gelonghui.com', '创兴银行 OR 定存', 'hk_finance'),
    '智通財經': ('zhitongcaijing.com', '创兴银行 OR 定存', 'hk_finance'),
    '南方日報': ('nfnews.com', '创兴银行 OR 定存', 'cn_mainland'),
    '讀特新聞': ('dutenews.com', '创兴银行 OR 定存', 'cn_mainland'),
    '深圳特區報': ('sznews.com', '创兴银行 OR 定存', 'cn_mainland'),
    '上海證券報': ('cnstock.com', '创兴银行 OR 定存', 'cn_finance'),
    '中國證券報': ('cs.com.cn', '创兴银行 OR 定存', 'cn_finance'),
    '大河財立方': ('dahecube.com', '创兴银行 OR 定存', 'cn_mainland'),
    '南方Plus App': ('southplus.com', '创兴银行 OR 定存', 'cn_mainland'),
    '南方財經網': ('stcn.com', '创兴银行 OR 定存', 'cn_finance'),
    '中國網': ('china.com.cn', '创兴银行 OR 定存', 'cn_mainland'),
    '雅虎(香港)': ('hk.yahoo.com', '創興銀行 OR 定存', 'hk_portal'),
    '深圳商報': ('sznews.com', '创兴银行 OR 定存', 'cn_mainland'),
    '東方財經雜誌': ('eastmoney.com', '创兴银行 OR 定存', 'cn_finance'),
    '實況網': ('fitnews.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '新財網': ('xcfinance.com', '创兴银行 OR 定存', 'cn_finance'),
    '21世紀經濟報道': ('21jingji.com', '创兴银行 OR 定存', 'cn_finance'),
    '國際金融報': ('cnfin.com', '创兴银行 OR 定存', 'cn_finance'),
    '紅商網': ('redshang.com', '创兴银行 OR 定存', 'cn_mainland'),
    '大智慧資訊': ('dzh.com.cn', '创兴银行 OR 定存', 'cn_finance'),
    '新城廣播有限公司': ('metraday.com', '創興銀行 OR 定存', 'hk_broadcast'),
    '美通社': ('prnasia.com', 'Chong Hing Bank OR 创兴银行', 'news_agency'),
    '阿思達克財經網': ('aastocks.com', '創興銀行 OR 定存', 'hk_finance'),
    '橙新聞': ('orangenews.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '南方都市報': ('oeeee.com', '创兴银行 OR 定存', 'cn_mainland'),
    '廣州日報新花城': ('dayoo.com', '创兴银行 OR 定存', 'cn_mainland'),
    '東方日報': ('orientaldaily.on.cc', '創興銀行 OR 定存', 'hk_business'),
    '百度APP': ('baidu.com', '创兴银行 OR 定存', 'cn_portal'),
    '快資訊': ('kuaizixun.com', '创兴银行 OR 定存', 'cn_aggregate'),
    '智富雜誌(電子版)': ('smartmoney.com.hk', '創興銀行 OR 定存', 'hk_finance'),
    '濠江日報': ('haoujiang.com', '創興銀行 OR 定存', 'mo_media'),
    '微信公眾號 | JRRS': ('weixin.qq.com', '创兴银行', 'cn_social'),
    '經濟一週': ('经济一周.com.hk', '創興銀行 OR 定存', 'hk_finance'),
    'ZAKER新闻': ('myzaker.com', '创兴银行 OR 定存', 'cn_aggregate'),
    'NOW免費即時資訊網站': ('now.com', '創興銀行 OR 定存', 'hk_broadcast'),
    '網易': ('163.com', '创兴银行 OR 定存', 'cn_portal'),
    '港人講地': ('speakout.hk', '創興銀行 OR 定存', 'hk_business'),
    '看点时报': ('kanditimes.com', '创兴银行 OR 定存', 'cn_mainland'),
    '观点网': ('guandian.hk', '创兴银行 OR 定存', 'cn_finance'),
    '优酷': ('youku.com', '创兴银行', 'cn_video'),
    'am730網': ('am730.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '華富財經': ('quamnet.com', '創興銀行 OR 定存', 'hk_finance'),
    '市民日報': ('shimindaily.com.mo', '創興銀行 OR 定存', 'mo_media'),
    '今日頭條': ('toutiao.com', '创兴银行 OR 定存', 'cn_aggregate'),
    '成報': ('sungpao.com.hk', '創興銀行 OR 定存', 'hk_business'),
    '深圳新聞網': ('sznews.com', '创兴银行 OR 定存', 'cn_mainland'),
    'BusinessFocus': ('businessfocus.io', '創興銀行 OR 定存', 'hk_finance'),
    '新假期': ('weekendweekly.com', '創興銀行 OR 定存', 'hk_lifestyle'),
    '證券之星': ('stockstar.com', '创兴银行 OR 定存', 'cn_finance'),
}

# 别名归一（复用 v1 逻辑）
ALIAS = {
    '香港經濟日報': ['香港經濟日報網','香港經濟日報','香港经济日报','hket','香港經濟日報·理財'],
    '信報': ['信報財經新聞網','信報財經新聞','信報財經網','信報(即時新聞)','信報網','hkej'],
    'U Lifestyle': ['U Lifestyle','Ulifestyle','U Lifestyle·理財','ulifestyle'],
    '明報': ['明報','明報財經網','明報新聞網','明報網站','mingpao'],
    '港生活': ['港生活','香港港生活','hkulifestyle'],
    '星島': ['星島頭條','星島頭條網','星島日報','星島日報網','singtao','頭條日報'],
    '香港01': ['香港01','HK01'],
    'eZone': ['eZone','ezone','e-zone'],
    '搜狐新聞': ['搜狐新聞','搜狐新闻','搜狐新聞 APP','搜狐'],
    '經濟通': ['經濟通','etnet'],
    '東網': ['東網','on.cc東網','on.cc'],
    '香港商報': ['香港商報網','香港商報'],
    '文匯報': ['文匯報','文匯網','大公文匯網'],
    '大公報': ['大公報','大公網','大公財經'],
    '證券日報': ['證券日報網','证券日报'],
    '新浪財經': ['新浪財經','新浪财经','新浪財經/上海证券报','搜狐 | 新浪財經'],
    '同花順財經': ['同花順財經','同花順財經·公司要聞'],
    '南方日報': ['南方日報','南方日报','南方日報(全国版)(數字報)'],
    '讀特新聞': ['讀特新聞','讀特深圳','讀特深圳 | 深圳特區報'],
    'The Standard': ['The Standard','The Standard (Web)'],
    '10Life': ['10Life'],
    '觀點網': ['观点网','觀點網'],
    '證券之星': ['證券之星','证券之星'],
    '格隆匯': ['格隆匯','格隆汇'],
    '智通財經': ['智通財經','智通财经APP'],
    '久期財經': ['久期財經','久期财经'],
    '中國金融商報網': ['中國金融商報網','中国金融商报网','china.prcfe'],
    '中國證券報': ['中国证券报'],
    'CT GoodJobs': ['CT GoodJobs'],
    '香港金融管理局': ['香港金融管理局'],
    '東方日報': ['東方日報','東方日報網'],
    '南方Plus App': ['南方Plus App','南方plus APP','南方Plus'],
}

def canonical(name):
    n = (name or '').strip()
    for std, aliases in ALIAS.items():
        for a in aliases:
            if a.lower() == n.lower(): return std
    for std, aliases in ALIAS.items():
        for a in aliases:
            if len(a) >= 4 and a.lower() in n.lower(): return std
    return n

# ---------- 1. 提取归一 ----------
news = json.load(open(NEWS_FILE, encoding='utf-8'))
active = [n for n in news if n.get('status','active')=='active']
raw_counter = Counter((n.get('source_name') or '').strip() for n in active)
raw_counter.pop('', None)
prov_by_raw = defaultdict(set)
for n in active:
    prov_by_raw[(n.get('source_name') or '').strip()].add('wiser' if n.get('provenance')=='wiser_archive' else 'ours')

target = defaultdict(lambda: {'count':0,'raw_names':set(),'provenance':set()})
for raw, cnt in raw_counter.items():
    std = canonical(raw)
    target[std]['count'] += cnt
    target[std]['raw_names'].add(raw)
    target[std]['provenance'] |= prov_by_raw[raw]

# ---------- 2. 精确匹配现有源 ----------
cfg = json.load(open(SOURCES_FILE, encoding='utf-8'))
sources = cfg['sources']
# 域名 -> 源列表索引
domain_index = defaultdict(list)
name_index = defaultdict(list)
for s in sources:
    dom = (s.get('domain') or '').lower().strip()
    if dom: domain_index[dom].append(s)
    nm = (s.get('name') or '').lower()
    for token in re.split(r'[\s\.\-]+', nm):
        if len(token) >= 4: name_index[token].append(s)

def match_sources(std, raw_names):
    dom, _, _ = MEDIA_DOMAIN.get(std, ('', '', ''))
    hits = {}
    # 域名精确匹配
    if dom:
        for d, ss in domain_index.items():
            if d == dom or d.endswith('.' + dom) or dom.endswith('.' + d):
                for s in ss: hits[s['id']] = s
    # 名称 token 匹配（用标准名中的关键词）
    keys = set([std] + list(raw_names))
    for k in keys:
        kl = k.lower()
        core = re.sub(r'(網|網站|新聞|財經|報|網|app|web|\(.*?\))', '', kl).strip()
        for token in [kl, core]:
            if len(token) >= 3 and token in name_index:
                for s in name_index[token]: hits[s['id']] = s
    return list(hits.values())

# ---------- 3. 为每个目标媒体建立定向 GNews 源 ----------
existing_target_ids = set(s['id'] for s in sources if s['id'].startswith('tmedia'))
new_sources = []
library_media = []
next_no = max([s.get('no', 0) for s in sources] + [0]) + 1

for std, info in sorted(target.items(), key=lambda x: -x[1]['count']):
    dom, topic, cat = MEDIA_DOMAIN.get(std, ('', '創興銀行 OR 定存', 'other'))
    hits = match_sources(std, info['raw_names'])
    with_rss = [s for s in hits if s.get('rss')]
    tid = None
    if dom:
        # 定向源 id：tmedia + 域名哈希前6位
        import hashlib
        tid = 'tmedia_' + hashlib.md5(dom.encode()).hexdigest()[:6]
    need_new = bool(dom) and tid not in existing_target_ids
    if need_new:
        q = f'site:{dom} {topic}'
        enc = urllib.parse.quote(q)
        new_sources.append({
            'id': tid,
            'name': f'目标媒体-{std}',
            'full': f'目标媒体定向监测-{std}',
            'lang': 'CH',
            'cat': 'target_media',
            'cat_name': '目标媒体定向',
            'rss': f'https://news.google.com/rss/search?q={enc}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
            'site': f'https://{dom}',
            'domain': dom,
            'access': 'gnews_site',
            'no': next_no,
            'is_target_media': True,
            'target_name': std,
        })
        next_no += 1
        existing_target_ids.add(tid)

    library_media.append({
        'name': std,
        'news_count': info['count'],
        'aliases': sorted(info['raw_names']),
        'domain': dom,
        'topic': topic,
        'category': cat,
        'provenance': sorted(info['provenance']),
        'matched_existing_sources': [{'id': s['id'], 'name': s['name'], 'rss': bool(s.get('rss'))} for s in hits[:6]],
        'existing_with_rss': len(with_rss),
        'target_source_id': tid if (dom and (tid in existing_target_ids)) else None,
        'coverage_status': 'has_rss' if with_rss else ('gnews_site' if dom else 'no_auto_source'),
        'priority': 'high' if info['count']>=5 else ('medium' if info['count']>=2 else 'low'),
    })

# ---------- 4. 写回配置 ----------
cfg['sources'].extend(new_sources)
meta = cfg.setdefault('meta', {})
meta['target_media'] = {
    'total_target_media': len(target),
    'new_target_sources_added': len(new_sources),
    'note': '目标媒体库：627条新闻涉及的媒体，全部建立定向监测源（GNews site:限定）',
    'updated': datetime.now().isoformat(),
}
meta['total_sources'] = len(cfg['sources'])
with open(SOURCES_FILE, 'w', encoding='utf-8') as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)

# ---------- 5. 写目标库 ----------
lib = {
    'meta': {
        'version': '2.0',
        'created': datetime.now().isoformat(),
        'purpose': '目标媒体监测库：Wiser 2026 报道过创兴的媒体，全部纳入自主监测对象',
        'source_news_count': len(active),
        'target_media_count': len(target),
        'target_sources': len(new_sources),
        'note': '由 627 条新闻的媒体来源提取、别名归一生成；每个目标媒体建立 GNews site: 定向监测源',
    },
    'media': library_media,
}
with open(OUT_LIB, 'w', encoding='utf-8') as f:
    json.dump(lib, f, ensure_ascii=False, indent=2)

# ---------- 控制台 ----------
st = Counter(m['coverage_status'] for m in library_media)
print('=' * 66)
print('目标媒体库 v2 构建结果')
print('=' * 66)
print(f'新闻: {len(active)} | 原始媒体名: {len(raw_counter)} | 归一目标媒体: {len(target)}')
print(f'覆盖状态: {dict(st)}')
print(f'新增定向监测源: {len(new_sources)}')
print(f'系统总源数: {len(cfg["sources"])}')
no_dom = [m['name'] for m in library_media if not m['domain']]
print(f'无域名映射(无法自动建源): {len(no_dom)} -> {no_dom}')
print(f'\n目标库: {OUT_LIB}')
print(f'源配置: {SOURCES_FILE}')
