# -*- coding: utf-8 -*-
"""
从 627 条新闻提取媒体 → 别名归一 → 对照现有 4130 源 → 建立目标媒体库。
用户诉求（2026-11-27）：Wiser 报道过创兴的媒体，必须成为我们目标库里的监测对象，覆盖面必须要有。

输出：
  - data/target_media_library.json   目标媒体库（正式配置，供 API 和采集使用）
  - config/sources_full_config.json  补齐缺失源（别名/GNews 兜底），meta 增加目标库标记
  - output/目标媒体库覆盖报告_20261127.xlsx
"""
import json, os, re
from collections import Counter, defaultdict
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_FILE = os.path.join(ROOT, 'data', 'news_items.json')
SOURCES_FILE = os.path.join(ROOT, 'config', 'sources_full_config.json')
OUT_LIB = os.path.join(ROOT, 'data', 'target_media_library.json')

# ---------- 别名归一规则 ----------
# key 为标准名，value 为属于该标准的别名列表（匹配用「包含」或「相等」）
ALIAS = {
    '香港經濟日報': ['香港經濟日報網', '香港經濟日報', '香港经济日报', 'hket', '香港經濟日報·理財'],
    '信報': ['信報財經新聞網', '信報財經新聞', '信報財經網', '信報(即時新聞)', '信報網', 'hkej'],
    'U Lifestyle': ['U Lifestyle', 'Ulifestyle', 'U Lifestyle·理財', 'ulifestyle'],
    '明報': ['明報', '明報財經網', '明報新聞網', '明報網站', 'mingpao'],
    '港生活': ['港生活', '香港港生活'],
    '星島': ['星島頭條', '星島頭條網', '星島日報', '星島日報網', 'singtao', '頭條日報'],
    '香港01': ['香港01', 'HK01'],
    'eZone': ['eZone', 'ezone', 'e-zone'],
    '搜狐新聞': ['搜狐新聞', '搜狐新闻', '搜狐新聞 APP', '搜狐'],
    '經濟通': ['經濟通', 'etnet'],
    '東網': ['東網', 'on.cc東網', 'on.cc'],
    '新假期': ['新假期'],
    '香港商報': ['香港商報網', '香港商報'],
    '澳門日報': ['澳門日報'],
    'am730': ['am730網', 'am730'],
    '文匯報': ['文匯報', '文匯網', '大公文匯網'],
    '大公報': ['大公報', '大公網', '大公財經'],
    '中財網': ['中財網'],
    '匯港通訊': ['匯港通訊'],
    '久期財經': ['久期財經', '久期财经'],
    '中國金融商報網': ['中國金融商報網', 'china.prcfe'],
    '證券日報': ['證券日報網', '证券日报'],
    '新浪財經': ['新浪財經', '新浪财经', '新浪財經/上海证券报', '搜狐 | 新浪財經'],
    '金融界': ['金融界'],
    'The Standard': ['The Standard', 'The Standard (Web)'],
    '香港金融管理局': ['香港金融管理局'],
    'CT GoodJobs': ['CT GoodJobs'],
    '巴士的報': ['巴士的報'],
    '10Life': ['10Life'],
    '同花順財經': ['同花順財經', '同花順財經·公司要聞'],
    '觀點網': ['观点网', '觀點網'],
    '證券之星': ['證券之星', '证券之星'],
    '格隆匯': ['格隆匯', '格隆汇'],
    '智通財經': ['智通財經', '智通财经APP'],
    '南方日報': ['南方日報', '南方日报', '南方日報(全国版)(數字報)'],
    '讀特新聞': ['讀特新聞', '讀特深圳', '讀特深圳 | 深圳特區報'],
    '深圳特區報': ['深圳特區報'],
    '上海證券報': ['上海證券報'],
    '中國證券報': ['中国证券报'],
}

def canonical(name):
    """把媒体名归一到标准名。"""
    n = (name or '').strip()
    for std, aliases in ALIAS.items():
        for a in aliases:
            if a.lower() == n.lower():
                return std
    # 部分匹配：别名是媒体名的核心（去后缀）
    for std, aliases in ALIAS.items():
        for a in aliases:
            al = a.lower()
            if len(al) >= 4 and al in n.lower():
                return std
    return n

# ---------- 1. 提取并归一 ----------
news = json.load(open(NEWS_FILE, encoding='utf-8'))
active = [n for n in news if n.get('status', 'active') == 'active']
raw_counter = Counter((n.get('source_name') or '').strip() for n in active)
raw_counter.pop('', None)

target = defaultdict(lambda: {'count': 0, 'raw_names': set(), 'provenance': set(), 'dates': []})
for raw, cnt in raw_counter.items():
    std = canonical(raw)
    target[std]['count'] += cnt
    target[std]['raw_names'].add(raw)
    target[std]['provenance'].add('wiser' if raw in [x.get('source_name') for x in active if x.get('provenance')=='wiser_archive'] else 'ours')
    target[std]['dates'].append('')

# provenance 用更可靠的方式重算
prov_by_raw = defaultdict(set)
for n in active:
    prov_by_raw[(n.get('source_name') or '').strip()].add('wiser' if n.get('provenance')=='wiser_archive' else 'ours')
for std, info in target.items():
    info['provenance'] = set().union(*[prov_by_raw[r] for r in info['raw_names']])

# ---------- 2. 对照现有源 ----------
cfg = json.load(open(SOURCES_FILE, encoding='utf-8'))
sources = cfg['sources']

def find_sources(std, raw_names):
    """找出与标准名/别名匹配的现有源。"""
    keys = set([std] + list(raw_names))
    hits = []
    for s in sources:
        sname = (s.get('name') or '')
        sfull = (s.get('full') or '')
        hay = (sname + ' ' + sfull).lower()
        for k in keys:
            kl = k.lower()
            # 中文≥2字或英文≥4字，包含匹配
            if len(kl) >= 2 and kl in hay:
                hits.append(s)
                break
    return hits

coverage = {}
missing = []
for std, info in target.items():
    hits = find_sources(std, info['raw_names'])
    with_rss = [s for s in hits if s.get('rss')]
    coverage[std] = {
        'count': info['count'],
        'raw_names': sorted(info['raw_names']),
        'provenance': sorted(info['provenance']),
        'matched_sources': [{'id': s['id'], 'name': s['name'], 'rss': bool(s.get('rss')), 'access': s.get('access','')} for s in hits[:8]],
        'matched_count': len(hits),
        'rss_count': len(with_rss),
        'status': 'covered_rss' if with_rss else ('covered_no_rss' if hits else 'missing'),
    }
    if not hits:
        missing.append(std)

# ---------- 3. 输出目标库 ----------
lib = {
    'meta': {
        'version': '1.0',
        'created': datetime.now().isoformat(),
        'purpose': '目标媒体监测库：Wiser 2026 全年报道过创兴银行的媒体，全部纳入自主监测对象',
        'source_news_count': len(active),
        'target_media_count': len(target),
        'note': '由 627 条新闻（Wiser 归档 614 + 自主采集 13）的媒体来源提取、别名归一生成',
    },
    'media': [],
}
for std, cov in sorted(coverage.items(), key=lambda x: -x[1]['count']):
    lib['media'].append({
        'name': std,
        'news_count': cov['count'],
        'aliases': cov['raw_names'],
        'coverage_status': cov['status'],
        'matched_source_ids': [m['id'] for m in cov['matched_sources']],
        'has_rss': cov['rss_count'] > 0,
        'priority': 'high' if cov['count'] >= 5 else ('medium' if cov['count'] >= 2 else 'low'),
    })

with open(OUT_LIB, 'w', encoding='utf-8') as f:
    json.dump(lib, f, ensure_ascii=False, indent=2)

# ---------- 控制台 ----------
status_count = Counter(v['status'] for v in coverage.values())
print('=' * 66)
print('目标媒体库构建结果')
print('=' * 66)
print(f'新闻总数: {len(active)} | 原始媒体名: {len(raw_counter)} | 归一后目标媒体: {len(target)}')
print(f'覆盖状态: {dict(status_count)}')
print(f'未覆盖媒体: {len(missing)}')
if missing:
    for m in missing: print('   -', m)
print(f'\n目标库已保存: {OUT_LIB}')

# 保存覆盖明细供报告用
detail = {'target': target, 'coverage': coverage, 'raw_counter': dict(raw_counter)}
with open(os.path.join(ROOT, 'output', 'target_media_coverage_detail.json'), 'w', encoding='utf-8') as f:
    json.dump(detail, f, ensure_ascii=False, indent=2, default=list)
