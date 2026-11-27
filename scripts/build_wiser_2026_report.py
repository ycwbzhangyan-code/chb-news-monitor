# -*- coding: utf-8 -*-
"""
生成《创兴银行新闻监测 Wiser 2026 全年对标报告》Excel。
数据来源：data/wiser_clippings_2026.json（Wiser 2026-01-02 至 2026-11-24 共 630 条全量归档）。
分层口径（用户 2026-11-27 确认）：
  - 全量补录 630 条，一条不漏；
  - matched_ours     : 正文核验含创兴，计入正式监测（8 条，已在库）
  - title_has_chb    : 标题含创兴，但 Wiser 记录无 URL/正文，未核验（96 条）
  - wide_unverified  : Wiser 宽口径，标题不点名创兴，未核验（526 条）
  后两层仅作对标参考，不计入我方监测成果，不混入正式新闻。
"""
import json, os
from collections import Counter, OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, PieChart, Reference

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'wiser_clippings_2026.json')
OUT = os.path.join(ROOT, 'output', '创兴银行新闻监测_Wiser2026全年对标报告_20261127.xlsx')

with open(SRC, encoding='utf-8') as f:
    data = json.load(f)

# ---------- 样式（复用既有报告配色） ----------
DARK = '1F4E79'
HFILL = PatternFill('solid', fgColor=DARK)
HFONT = Font(color='FFFFFF', bold=True, size=10)
TITLEFONT = Font(bold=True, size=15, color=DARK)
SUBFONT = Font(size=10, color='595959')
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center')
FILL_GRN = PatternFill('solid', fgColor='E2EFDA')   # 正式监测
FILL_YEL = PatternFill('solid', fgColor='FFF2CC')   # 标题含创兴待核验
FILL_GRY = PatternFill('solid', fgColor='E7E6E6')   # 宽口径未核验
FILL_BLU = PatternFill('solid', fgColor='DDEBF7')
THIN = Side(style='thin', color='BFBFBF')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

LAYER_LABEL = {
    'matched_ours': '正文已核验·正式监测',
    'title_has_chb': '标题含创兴·待核验',
    'wide_unverified': 'Wiser宽口径·未核验',
}
LAYER_FILL = {
    'matched_ours': FILL_GRN,
    'title_has_chb': FILL_YEL,
    'wide_unverified': FILL_GRY,
}

def hdr(ws, row, headers, widths=None):
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.fill = HFILL; c.font = HFONT; c.alignment = CENTER; c.border = BORDER
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w

# ---------- 统计 ----------
total = len(data)
by_layer = Counter(x['layer'] for x in data)
by_month = Counter(str(x['date'])[:7] for x in data if x.get('date'))
by_source = Counter(x['source'] for x in data if x.get('source'))
dates = sorted(x['date'] for x in data if x.get('date'))
d_from, d_to = dates[0], dates[-1]
official = by_layer.get('matched_ours', 0)
ref = by_layer.get('title_has_chb', 0) + by_layer.get('wide_unverified', 0)
pct = round(official / total * 100, 1) if total else 0

wb = Workbook()

# ===== Sheet 1: 看板 =====
ws = wb.active
ws.title = '看板'
ws.merge_cells('A1:H1')
ws['A1'] = '创兴银行新闻监测 · Wiser 2026 全年对标报告'
ws['A1'].font = TITLEFONT
ws.merge_cells('A2:H2')
ws['A2'] = f'数据范围：{d_from} 至 {d_to}　｜　生成日期：2026-11-27　｜　口径：全量补录一条不漏，分层标注，正文含创兴才算正式监测'
ws['A2'].font = SUBFONT

kpis = [
    ('Wiser 全年记录', total, FILL_BLU),
    ('正文已核验·正式监测', official, FILL_GRN),
    ('对标参考·未核验', ref, FILL_YEL),
    ('正文核验覆盖率', f'{pct}%', FILL_BLU),
]
for i, (label, val, fill) in enumerate(kpis):
    col = 1 + i * 2
    ws.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 1)
    ws.merge_cells(start_row=5, start_column=col, end_row=5, end_column=col + 1)
    c1 = ws.cell(row=4, column=col, value=label); c1.font = Font(bold=True, size=10, color=DARK); c1.alignment = CENTER; c1.fill = fill
    c2 = ws.cell(row=5, column=col, value=val); c2.font = Font(bold=True, size=20, color=DARK); c2.alignment = CENTER; c2.fill = fill

ws['A7'] = '分层说明'
ws['A7'].font = Font(bold=True, size=12, color=DARK)
notes = [
    ('matched_ours', f'{official} 条：正文已核验含「创兴银行」字样，计入我方正式监测（已在本系统新闻库，不重复入库）。'),
    ('title_has_chb', f'{by_layer.get("title_has_chb",0)} 条：标题含创兴，但 Wiser 记录表无原文 URL 与正文，无法核验，仅作对标参考。'),
    ('wide_unverified', f'{by_layer.get("wide_unverified",0)} 条：Wiser 宽口径收录（标题不点名创兴，多为定存/汇率/税贷主题），未核验，仅作对标参考。'),
]
r = 8
for layer, txt in notes:
    ws.cell(row=r, column=1, value=LAYER_LABEL[layer]).font = Font(bold=True, size=10)
    ws.cell(row=r, column=1).fill = LAYER_FILL[layer]
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    ws.cell(row=r, column=2, value=txt).alignment = WRAP
    r += 1

ws.cell(row=r + 1, column=1, value='重要声明').font = Font(bold=True, size=11, color='C00000')
ws.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=8)
ws.cell(row=r + 1, column=2, value='Wiser 全年记录表不含原文 URL 与正文；依用户硬口径「内文必须有创兴银行字样」，仅正文核验通过的条目才算正式监测，其余为对标参考，不混入正式新闻库，避免伪监测。').alignment = WRAP

for col in range(1, 9):
    ws.column_dimensions[get_column_letter(col)].width = 18

# 月度分布表 + 柱状图（放在看板右侧 J 列起）
ws.cell(row=7, column=10, value='月份').fill = HFILL; ws.cell(row=7, column=10).font = HFONT
ws.cell(row=7, column=11, value='记录数').fill = HFILL; ws.cell(row=7, column=11).font = HFONT
months = sorted(by_month.keys())
for i, m in enumerate(months, 8):
    ws.cell(row=i, column=10, value=m)
    ws.cell(row=i, column=11, value=by_month[m])
chart = BarChart()
chart.title = 'Wiser 2026 月度监测量'
chart.y_axis.title = '条数'; chart.x_axis.title = '月份'
chart.height = 8; chart.width = 16
data_ref = Reference(ws, min_col=11, min_row=7, max_row=7 + len(months))
cats_ref = Reference(ws, min_col=10, min_row=8, max_row=7 + len(months))
chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats_ref)
ws.add_chart(chart, 'M7')

# 分层饼图数据（J20 起）
ws.cell(row=20, column=10, value='分层'); ws.cell(row=20, column=11, value='条数')
for i, layer in enumerate(['matched_ours', 'title_has_chb', 'wide_unverified'], 21):
    ws.cell(row=i, column=10, value=LAYER_LABEL[layer])
    ws.cell(row=i, column=11, value=by_layer.get(layer, 0))
pie = PieChart()
pie.title = '监测分层构成'
pie.height = 8; pie.width = 12
pdata = Reference(ws, min_col=11, min_row=20, max_row=23)
pcats = Reference(ws, min_col=10, min_row=21, max_row=23)
pie.add_data(pdata, titles_from_data=True)
pie.set_categories(pcats)
ws.add_chart(pie, 'M20')

# ===== Sheet 2: 分层汇总 =====
ws2 = wb.create_sheet('分层汇总')
hdr(ws2, 1, ['分层', '条数', '占比', '是否计入正式监测', '说明'], [26, 10, 10, 20, 70])
r = 2
for layer in ['matched_ours', 'title_has_chb', 'wide_unverified']:
    cnt = by_layer.get(layer, 0)
    ws2.cell(row=r, column=1, value=LAYER_LABEL[layer]).fill = LAYER_FILL[layer]
    ws2.cell(row=r, column=2, value=cnt)
    ws2.cell(row=r, column=3, value=f'{round(cnt/total*100,1)}%')
    ws2.cell(row=r, column=4, value='是' if layer == 'matched_ours' else '否')
    desc = {
        'matched_ours': '正文核验含创兴，已在本系统新闻库',
        'title_has_chb': '标题含创兴，无 URL/正文，未核验',
        'wide_unverified': 'Wiser 宽口径，标题不点名创兴，未核验',
    }[layer]
    ws2.cell(row=r, column=5, value=desc).alignment = WRAP
    for c in range(1, 6):
        ws2.cell(row=r, column=c).border = BORDER
    r += 1
ws2.cell(row=r, column=1, value='合计').font = Font(bold=True)
ws2.cell(row=r, column=2, value=total).font = Font(bold=True)
ws2.cell(row=r, column=3, value='100%').font = Font(bold=True)

# ===== Sheet 3: Wiser 全年 630 条清单 =====
ws3 = wb.create_sheet('Wiser全年630条')
hdr(ws3, 1, ['序号', '日期', '媒体来源', '标题', '分层标注', '情感', '计入正式监测'], [7, 12, 20, 80, 26, 10, 16])
for i, x in enumerate(data, 2):
    ws3.cell(row=i, column=1, value=x.get('no', i - 1))
    ws3.cell(row=i, column=2, value=x.get('date', ''))
    ws3.cell(row=i, column=3, value=x.get('source', ''))
    ws3.cell(row=i, column=4, value=x.get('title', '')).alignment = WRAP
    lc = ws3.cell(row=i, column=5, value=LAYER_LABEL.get(x.get('layer'), x.get('layer', '')))
    lc.fill = LAYER_FILL.get(x.get('layer'), FILL_GRY)
    ws3.cell(row=i, column=6, value=x.get('sentiment', ''))
    ws3.cell(row=i, column=7, value='是' if x.get('in_official_monitoring') else '否')
ws3.freeze_panes = 'A2'
ws3.auto_filter.ref = f'A1:G{len(data)+1}'

# ===== Sheet 4: 媒体来源分布 =====
ws4 = wb.create_sheet('媒体来源分布')
hdr(ws4, 1, ['媒体来源', '记录数', '占比'], [32, 12, 12])
for i, (src, cnt) in enumerate(by_source.most_common(), 2):
    ws4.cell(row=i, column=1, value=src)
    ws4.cell(row=i, column=2, value=cnt)
    ws4.cell(row=i, column=3, value=f'{round(cnt/total*100,1)}%')
ws4.freeze_panes = 'A2'
ws4.auto_filter.ref = f'A1:C{len(by_source)+1}'

# ===== Sheet 5: 月度分布 =====
ws5 = wb.create_sheet('月度分布')
hdr(ws5, 1, ['月份', '记录数', '占比'], [14, 12, 12])
for i, m in enumerate(months, 2):
    ws5.cell(row=i, column=1, value=m)
    ws5.cell(row=i, column=2, value=by_month[m])
    ws5.cell(row=i, column=3, value=f'{round(by_month[m]/total*100,1)}%')

wb.save(OUT)
print('SAVED:', OUT)
print('total:', total, 'layers:', dict(by_layer), 'official:', official, 'ref:', ref, 'pct:', pct)
print('date range:', d_from, 'to', d_to)
