# -*- coding: utf-8 -*-
"""
将 Wiser 2026 全年 630 条监测记录全量并入主新闻库 news_items.json。
用户诉求（2026-11-27）：Wiser 能监测到的条数，我们必须监测到；主网站要能看到全年。
口径：Wiser 是付费专业监测金标准，其收录条目即为应监测到的创兴新闻；
      但 Wiser 记录表无 URL/正文，故用 provenance + wiser_layer 分层标注，保持透明。
去重：按规范化标题 20 字前缀，与现有 active 条目比对，避免重复。
幂等：重复运行不会产生重复（已有 provenance=wiser_archive 的不重复加）。
"""
import json, re, os, hashlib
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WISER_FILE = os.path.join(ROOT, 'data', 'wiser_clippings_2026.json')
NEWS_FILE = os.path.join(ROOT, 'data', 'news_items.json')

def norm(t):
    t = (t or '')
    t = re.sub(r'\s+', '', t)
    t = re.sub(r'【.*?】|\[.*?\]', '', t)
    t = re.sub(r'（有片）|(有片)$', '', t)
    t = re.sub(r'[…\.]{2,}$|…$', '', t)
    t = re.sub(r'[｜|].*$', '', t)
    t = re.sub(r'^.*[｜|]', '', t)
    t = re.sub(r'[，,。！!：:、「」"' + '\u201c\u201d' + r'（）()《》*]', '', t)
    return t.lower().strip()

wiser = json.load(open(WISER_FILE, encoding='utf-8'))
news = json.load(open(NEWS_FILE, encoding='utf-8'))

active = [x for x in news if x.get('status', 'active') == 'active']
# 去重键用 日期+标题：Wiser 有大量逐日更新的同类文章（标题相似但日期不同），
# 只按标题去重会误删 188 条，达不到「条数对标 Wiser」的诉求。
def dedup_key(title, date):
    return (str(date or '')[:10], norm(title)[:20])
existing_norm = set(dedup_key(x.get('title'), x.get('pub_date')) for x in active)
# 记录 wiser 来源键，保证幂等
existing_wiser_keys = set(
    x.get('wiser_id') for x in news if x.get('provenance') == 'wiser_archive'
)

# Wiser 内部去重（按 日期+标题 20字前缀，保留最早 no）
seen = {}
for x in wiser:
    k = dedup_key(x.get('title'), x.get('date'))
    if k not in seen:
        seen[k] = x

to_add = []
overlap = 0
skipped_existing = 0
for k, x in seen.items():
    wid = x.get('id') or f"wiser2026_{x.get('no')}"
    if wid in existing_wiser_keys:
        skipped_existing += 1
        continue
    if k in existing_norm:
        overlap += 1
        continue
    layer = x.get('layer', 'wide_unverified')
    # 分层决定 tier：标题含创兴 → B（更相关）；宽口径 → C
    tier = 'B' if layer in ('matched_ours', 'title_has_chb') else 'C'
    title = re.sub(r'^\*+', '', (x.get('title') or '').strip())
    desc_map = {
        'matched_ours': 'Wiser 2026 监测记录；正文核验含创兴银行（我方已收录）。',
        'title_has_chb': 'Wiser 2026 监测记录；标题含创兴银行，Wiser 未提供原文链接，正文未核验。',
        'wide_unverified': 'Wiser 2026 监测记录；Wiser 宽口径收录（标题不点名创兴），未提供原文链接，正文未核验。',
    }
    h = hashlib.sha1(('wiser2026|' + str(x.get('no')) + '|' + title).encode('utf-8')).hexdigest()
    item = {
        'id': len(news) + len(to_add) + 1,
        'hash': h,
        'title': title,
        'link': '',  # Wiser 记录表无 URL
        'description': desc_map.get(layer, 'Wiser 2026 监测记录。'),
        'source_id': 'wiser_archive',
        'source_name': x.get('source', ''),
        'source_cat': 'wiser_archive',
        'lang': 'CH',
        'pub_date': x.get('date', ''),
        'fetch_date': datetime.utcnow().isoformat() + 'Z',
        'tier': tier,
        'tier_reason': 'Wiser专业监测收录·' + layer,
        'sentiment': x.get('sentiment', ''),
        'status': 'active',
        'provenance': 'wiser_archive',   # 来源标注：Wiser 专业监测归档
        'wiser_id': wid,
        'wiser_no': x.get('no'),
        'wiser_layer': layer,            # 核验分层
        'wiser_label': x.get('label', ''),
        'body_verified': (layer == 'matched_ours'),
        'created_at': datetime.utcnow().isoformat() + 'Z',
    }
    to_add.append(item)
    existing_norm.add(k)

news.extend(to_add)

# 按日期排序后重排 id，保持一致
news.sort(key=lambda n: str(n.get('pub_date') or ''))
for i, n in enumerate(news, 1):
    # 保留原有的非数字 id（如 wn_580）作为 legacy_id，统一用自增数字 id 便于前端
    if not isinstance(n.get('id'), int):
        n['legacy_id'] = n.get('id')
    n['id'] = i

with open(NEWS_FILE, 'w', encoding='utf-8') as f:
    json.dump(news, f, ensure_ascii=False, indent=2)

final_active = [x for x in news if x.get('status', 'active') == 'active']
from collections import Counter
months = Counter((x.get('pub_date') or '')[:7] for x in final_active)
print('Wiser记录:', len(wiser), '| 内部唯一:', len(seen))
print('跳过(已存在wiser_id,幂等):', skipped_existing, '| 跳过(与现有active重复):', overlap)
print('本次新增:', len(to_add))
print('主库总记录:', len(news), '| active:', len(final_active))
print('active 日期范围:', min((x.get('pub_date') or '') for x in final_active), '至', max((x.get('pub_date') or '') for x in final_active))
print('按月分布:', dict(sorted(months.items())))
