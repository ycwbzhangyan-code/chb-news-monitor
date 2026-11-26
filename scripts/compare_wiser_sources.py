#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""精确重做 Wiser 5967 条与自有 3865 源覆盖匹配（考虑自有源名称被截断问题）。"""
import json, io, re, collections, unicodedata

BASE = 'C:/Users/user/WorkBuddy AI/2026-11-12-14-09-43/chb-news-site/'
W = json.load(io.open(BASE+'output/wiser_full_5967.json', encoding='utf-8'))
CFG = json.load(io.open(BASE+'config/sources_full_config.json', encoding='utf-8'))
OUR = CFG['sources']

def cn(s):
    """提取字符串中的中文字符块（自有名被截断如 'South Chin 南華早報網'）"""
    if not s: return set()
    return set(re.findall(r'[\u4e00-\u9fff]{2,}', str(s)))

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKC', str(s)).lower()
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', s)

def domain(s):
    if not s: return ''
    m = re.search(r'(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9.\-]+\.[a-z]{2,})', str(s).lower())
    return m.group(1) if m else ''

# 自有索引：中文块集合 + 规范化全名 + 域名
our_cn, our_norm, our_dom = collections.defaultdict(list), set(), set()
for x in OUR:
    label = str(x.get('name','')) + ' ' + str(x.get('full',''))
    for c in cn(label): our_cn[c].append(x)
    n = norm(label)
    if n: our_norm.add(n)
    d = domain(x.get('domain') or x.get('site') or x.get('rss') or '')
    if d: our_dom.add(d)

UGC = {'Blog','BBS','Tieba','Micro Blog'}
CLOSED = re.compile(r'(weibo|weixin|wechat|微信|微博|zhihu|知乎|toutiao|facebook|instagram|linkedin|youtube|'
    r'tieba|贴吧|貼吧|xiaohongshu|小紅書|douyin|抖音|kuaishou|bilibili|twitter|x\.com|reddit|quora|'
    r'wordpress\.com|blogspot\.com|5ch\.net|2ch)', re.I)
PAYWALL = re.compile(r'(scmp|南華早報|caixin|財新|financial times|金融時報|new york times|紐約時報|wall street|華爾街|bloomberg|彭博|economist|經濟學人)', re.I)

def match(w):
    e, c = w.get('Pub Name (Eng)'), w.get('Pub Name (Chi)')
    d = domain(e)
    # 1) 中文核心块精确/包含匹配
    wcn = cn(c) | cn(e)
    for wc in wcn:
        if wc in our_cn: return '已覆盖', '中文名'
        for oc in our_cn:
            if len(wc)>=3 and len(oc)>=3 and (wc in oc or oc in wc): return '部分覆盖', '中文相似:'+oc
    # 2) 域名匹配
    if d and d in our_dom: return '已覆盖', '域名'
    root = d.split('.')[-2] if d and '.' in d else ''
    if root and len(root)>=4:
        for od in our_dom:
            if od.endswith(root+'.') or ('.'+root+'.') in od: return '部分覆盖','域名根:'+od
    # 3) 英文规范化
    ne = norm(e)
    if ne and len(ne)>=5:
        for on in our_norm:
            if len(on)>=5 and (ne in on or on in ne): return '部分覆盖','英文相似'
    return ('未覆盖-自媒体' if w.get('Media Type') in UGC else '未覆盖'), ''

results=[]
for w in W:
    st, why = match(w)
    tag = str(w.get('Pub Name (Eng)',''))+' '+str(w.get('Pub Name (Chi)',''))
    results.append({**w,'精确匹配':st,'匹配依据':why,
                    '封闭平台':bool(CLOSED.search(tag)),
                    '付费墙':bool(PAYWALL.search(tag))})

json.dump(results, io.open(BASE+'output/wiser_compare_precise.json','w',encoding='utf-8'), ensure_ascii=False)

print('=== 校准后覆盖统计 ===')
print(collections.Counter(r['精确匹配'] for r in results).most_common())
print('封闭平台',sum(1 for r in results if r['封闭平台']),'| 付费墙',sum(1 for r in results if r['付费墙']))
print()
for region in ['Hong Kong','China','Taiwan','Macao']:
    sub=[r for r in results if r['Media Region']==region]
    print(region,len(sub),collections.Counter(r['精确匹配'] for r in sub).most_common())
print()
trad=[r for r in results if r['Media Type'] in ('Newspaper','Magazine','Agency News','Broadcast','Government')]
print('传统媒体',len(trad),collections.Counter(r['精确匹配'] for r in trad).most_common())
print()
print('--- 香港传统媒体真正未覆盖 ---')
for r in trad:
    if r['Media Region']=='Hong Kong' and r['精确匹配']=='未覆盖':
        flag='[付费]' if r['付费墙'] else ''
        print(flag,r['Media Type'],'|',r['Pub Name (Eng)'],'/',r['Pub Name (Chi)'])
