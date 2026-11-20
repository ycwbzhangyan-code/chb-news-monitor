# -*- coding: utf-8 -*-
"""
以《最终汇总_74条》看板为排版模板，生成 76 条看板版。
保留：深蓝标题栏、4大指标卡、监测日期范围条、每日统计+TOP20双表、全部新闻明细表。
更新：总数76、B18/C58、新增2条的"数据标记"列标注。
"""
import json, os
from collections import Counter
from copy import copy
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, 'output', '创兴银行新闻监测_最终汇总_74条_20261120.xlsx')
OUT = os.path.join(ROOT, 'output', '创兴银行新闻监测_最终汇总_76条_看板版_20261120.xlsx')

news = json.load(open(os.path.join(ROOT, 'data', 'news_items.json'), encoding='utf-8'))
items = news['items'] if isinstance(news, dict) else news
active = [x for x in items if x.get('status') == 'active' or not x.get('status')]
active.sort(key=lambda x: (str(x.get('pub_date', ''))[:10], x.get('tier', '')), reverse=True)

wb = load_workbook(TPL)
ws = wb['统计概览']
wn = wb['全部新闻']

# ---------- 统计概览 ----------
total = len(active)
tier = Counter(x.get('tier', '') for x in active)
b_count, c_count = tier.get('B', 0), tier.get('C', 0)
dates = sorted(set(str(x.get('pub_date', ''))[:10] for x in active))

ws['A1'] = '创兴银行新闻监测系统 · 数据统计总览'
ws['A2'] = '生成时间：2026-11-20 16:26（香港时间）　|　对标Wiser：72条 → 我方76条（已超越，且已排除官网稿/重复/误报/八卦）'
ws['A4'] = '新闻总数'; ws['B4'] = 'B类·重要'; ws['C4'] = 'C类·例行'; ws['D4'] = '监测天数'
ws['A5'] = total; ws['B5'] = b_count; ws['C5'] = c_count; ws['D5'] = len(dates)
ws['A7'] = f'监测日期范围：{dates[0]} 至 {dates[-1]}　（共 {len(dates)} 天）'

# 每日统计
by_date = {}
for x in active:
    d = str(x.get('pub_date', ''))[:10]
    by_date.setdefault(d, [0, 0, 0])
    by_date[d][0] += 1
    by_date[d][1 if x.get('tier') == 'B' else 2] += 1
date_rows = sorted(by_date.items(), reverse=True)
for i, (d, vals) in enumerate(date_rows, 11):
    ws.cell(i, 1, d); ws.cell(i, 2, vals[0]); ws.cell(i, 3, vals[1]); ws.cell(i, 4, vals[2])
# 清除多余旧行
for r in range(11 + len(date_rows), 31):
    for c in range(1, 5): ws.cell(r, c).value = None
last = 10 + len(date_rows)
ws.cell(last + 1 if last + 1 < 31 else 30, 1, '合计')
ws.cell(last + 1 if last + 1 < 31 else 30, 2, total)
ws.cell(last + 1 if last + 1 < 31 else 30, 3, b_count)
ws.cell(last + 1 if last + 1 < 31 else 30, 4, c_count)

# TOP20 来源
by_src = Counter(x.get('source_name', '') for x in active)
top = by_src.most_common(20)
for i, (s, n) in enumerate(top, 11):
    ws.cell(i, 6, s); ws.cell(i, 7, n)
for r in range(11 + len(top), 31):
    ws.cell(r, 6).value = None; ws.cell(r, 7).value = None

# ---------- 全部新闻 ----------
wn['A1'] = f'创兴银行新闻监测 · 全部新闻（共 {total} 条，已去重、已排除官网稿/误报/八卦 · 含本次新增2条）'
# 表头行2不变，清空旧数据
for r in range(3, wn.max_row + 1):
    for c in range(1, 10):
        wn.cell(r, c).value = None

new_titles = ['創興銀行港元定存利率高達3.10%', '創興3個月澳元定存年利率4.5厘']
for i, x in enumerate(active, 3):
    title = x.get('title', '')
    is_new = any(nt in title for nt in new_titles)
    mark = '★本次新增(GNews核验)' if is_new else ('Wiser对标' if x.get('discovery') else '常规采集')
    vals = [
        i - 2,
        str(x.get('pub_date', ''))[:10],
        x.get('tier', ''),
        title,
        x.get('source_name', ''),
        x.get('tier_reason', '') or ('直接涉及创兴银行' if x.get('tier') == 'B' else '定存利率市场比较（对标Wiser收录口径）'),
        mark,
        '已核验' if is_new else None,
        x.get('link', ''),
    ]
    for c, v in enumerate(vals, 1):
        cell = wn.cell(i, c, v)
        if is_new:
            cell.fill = PatternFill('solid', fgColor='FFF2CC')

# ---------- 总结区块（第32行起）----------
from openpyxl.utils import get_column_letter
summary_title_fill = PatternFill('solid', fgColor='0D3B66')
summary_label_fill = PatternFill('solid', fgColor='EEF5FC')
ws.cell(32, 1, '本期总结（管理层速览）')
ws.merge_cells('A32:G32')
c = ws['A32']
c.fill = summary_title_fill
c.font = Font(bold=True, size=12, color='FFFFFF')
c.alignment = Alignment(vertical='center', horizontal='left', indent=1)
ws.row_dimensions[32].height = 24

summary_items = [
    ('监测概况', f'本期共收录 {total} 条创兴银行相关报道（B类重要 {b_count} 条、C类例行 {c_count} 条），覆盖 {dates[0]} 至 {dates[-1]} 共 {len(dates)} 天。已排除官网自有稿、重复条目、关键词误报及无关八卦，数据可直接用于汇报。'),
    ('对标Wiser', 'Wiser 同期 72 条（含 2 条与创兴无关的误报），我方 76 条已实现超越。数量达标，且来源结构较上一版更分散。'),
    ('本期重点', 'B类 18 条以直接点名创兴银行的新闻为主：包括中期业绩、惠譽/评级、海岸清洁运动 CSR、定存利率牌价、越秀母公司动态、深圳分行借款等，建议传讯处优先复核。'),
    ('覆盖扩充', '监测源库由 3,793 扩充至 3,839 个，可采集 RSS 由 263 增至 329（含 30 组 Google News 关键词聚合源）。本次新增 2 条经核验的真实报道（港生活定存 3.10%、明報財經網澳元定存 4.5厘）。'),
    ('结构性提示', f'来源集中度仍偏高：经济通 {by_src.get("經濟通", 0)} 条，占 {by_src.get("經濟通", 0) / total * 100:.0f}%。信報（12/28 生效）与經濟日報（1/1 生效）付费订阅生效后，可显著补强这两类港媒的全文覆盖。'),
    ('后续动作', '① 12月中前确认付费账号的 API/导出方式；② 申请慧科 WiseSearch 试用，用同一区间逐条比对后再决定是否采购；③ 工商/招聘/招标类条目建议在正式汇报中单列「邻近窗口」，避免与非媒体声量混淆。'),
]
r = 33
for label, text in summary_items:
    ws.cell(r, 1, label)
    lc = ws.cell(r, 1)
    lc.fill = summary_label_fill
    lc.font = Font(bold=True, size=11, color='0D3B66')
    lc.alignment = Alignment(vertical='center', horizontal='center')
    ws.cell(r, 2, text)
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
    tc = ws.cell(r, 2)
    tc.font = Font(size=10, color='334155')
    tc.alignment = Alignment(wrap_text=True, vertical='center')
    ws.row_dimensions[r].height = 42
    for cc in range(1, 8):
        ws.cell(r, cc).border = Border(bottom=Side(style='thin', color='D9E2EC'))
    r += 1

wb.save(OUT)
print('saved:', OUT)
print('total', total, 'B', b_count, 'C', c_count, 'days', len(dates))
print('sheets:', wb.sheetnames, 'news rows:', wn.max_row)
