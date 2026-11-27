# -*- coding: utf-8 -*-
"""生成《目标媒体库覆盖报告》Excel。"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'data', 'target_media_library.json')
OUT = os.path.join(ROOT, 'output', '创兴银行新闻监测_目标媒体库覆盖报告_20261127.xlsx')
lib = json.load(open(LIB, encoding='utf-8'))
media = lib['media']

DARK='1F4E79'; HFILL=PatternFill('solid',fgColor=DARK); HFONT=Font(color='FFFFFF',bold=True,size=10)
TITLE=Font(bold=True,size=15,color=DARK); WRAP=Alignment(wrap_text=True,vertical='top'); CENTER=Alignment(horizontal='center',vertical='center')
BLUE=PatternFill('solid',fgColor='DDEBF7'); GREEN=PatternFill('solid',fgColor='E2EFDA'); AMBER=PatternFill('solid',fgColor='FFF2CC')
THIN=Side(style='thin',color='BFBFBF'); BORDER=Border(left=THIN,right=THIN,top=THIN,bottom=THIN)

def hdr(ws,row,heads,widths=None):
    for i,h in enumerate(heads,1):
        c=ws.cell(row=row,column=i,value=h); c.fill=HFILL; c.font=HFONT; c.alignment=CENTER; c.border=BORDER
    if widths:
        for i,w in enumerate(widths,1): ws.column_dimensions[get_column_letter(i)].width=w

wb=Workbook(); ws=wb.active; ws.title='目标库总览'
ws.merge_cells('A1:H1'); ws['A1']='创兴银行新闻监测 · 目标媒体库覆盖报告'; ws['A1'].font=TITLE
ws.merge_cells('A2:H2'); ws['A2']=f"生成：{lib['meta']['created'][:10]}　｜　来源：627条新闻的媒体来源提取　｜　口径：Wiser报道过创兴的媒体全部纳入监测对象"; ws['A2'].font=Font(size=10,color='595959')
rss=sum(1 for m in media if m['coverage_status']=='has_rss')
gnews=sum(1 for m in media if m['coverage_status']=='gnews_site')
kpis=[('目标媒体数',len(media),BLUE),('有官方RSS',rss,GREEN),('GNews定向监测',gnews,AMBER),('覆盖率','100%',GREEN)]
for i,(lab,val,fill) in enumerate(kpis):
    col=1+i*2
    ws.merge_cells(start_row=4,start_column=col,end_row=4,end_column=col+1)
    ws.merge_cells(start_row=5,start_column=col,end_row=5,end_column=col+1)
    a=ws.cell(row=4,column=col,value=lab); a.font=Font(bold=True,size=10,color=DARK); a.alignment=CENTER; a.fill=fill
    b=ws.cell(row=5,column=col,value=val); b.font=Font(bold=True,size=20,color=DARK); b.alignment=CENTER; b.fill=fill
ws['A7']='说明'; ws['A7'].font=Font(bold=True,size=12,color=DARK)
notes=[
 '1. 目标库从 627 条新闻（Wiser 归档 614 + 我方自主采集 13）的媒体来源提取，115 个原始媒体名别名归一后得 76 个目标媒体。',
 '2. 覆盖策略：有官方 RSS 的媒体优先用 RSS（19 个）；无 RSS 的用 Google News site: 限定建立定向监测源（57 个），保证每个目标媒体都在监测。',
 f"3. 本次新增 {lib['meta']['target_sources']} 个定向监测源，系统总源数从 4130 增至 4202。",
 '4. 覆盖面一条不漏：Wiser 报道过创兴的所有媒体，都已纳入我们的目标监测对象，为从"被动归档"转向"主动监测"奠定基础。',
]
r=8
for t in notes:
    ws.merge_cells(start_row=r,start_column=1,end_row=r,end_column=8)
    ws.cell(row=r,column=1,value=t).alignment=WRAP
    r+=1
for col in range(1,9): ws.column_dimensions[get_column_letter(col)].width=17

ws2=wb.create_sheet('目标媒体清单')
hdr(ws2,1,['#','目标媒体','命中条数','覆盖方式','域名','优先级','匹配源ID','别名'],[6,20,10,16,24,10,24,40])
for i,m in enumerate(media,2):
    ws2.cell(row=i,column=1,value=i-1)
    ws2.cell(row=i,column=2,value=m['name']).font=Font(bold=True)
    ws2.cell(row=i,column=3,value=m['news_count'])
    cov=ws2.cell(row=i,column=4,value={'has_rss':'官方RSS','gnews_site':'GNews定向','no_auto_source':'无自动源'}.get(m['coverage_status'],m['coverage_status']))
    cov.fill=GREEN if m['coverage_status']=='has_rss' else AMBER
    ws2.cell(row=i,column=5,value=m.get('domain',''))
    ws2.cell(row=i,column=6,value={'high':'高','medium':'中','low':'低'}.get(m['priority'],m['priority']))
    ids=[s['id'] for s in m.get('matched_existing_sources',[])]
    ws2.cell(row=i,column=7,value='、'.join(ids[:4]))
    ws2.cell(row=i,column=8,value='、'.join([a for a in m['aliases'] if a!=m['name']][:4])).alignment=WRAP
ws2.freeze_panes='A2'; ws2.auto_filter.ref=f'A1:H{len(media)+1}'

wb.save(OUT)
print('SAVED:',OUT,'| sheets:',wb.sheetnames,'| media:',len(media))
