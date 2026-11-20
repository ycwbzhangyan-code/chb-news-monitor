# -*- coding: utf-8 -*-
"""生成扩充监测源后的《最终汇总》Excel —— 全量76条 + 统计 + 扩充说明。"""
import json, os, re
from collections import Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
news=json.load(open(os.path.join(ROOT,'data','news_items.json'),encoding='utf-8'))
items=news['items'] if isinstance(news,dict) else news
active=[x for x in items if x.get('status')=='active' or not x.get('status')]
active.sort(key=lambda x:(str(x.get('pub_date',''))[:10], x.get('source_name','')))

HFILL=PatternFill('solid',fgColor='1F4E79'); HFONT=Font(color='FFFFFF',bold=True,size=10)
TITLE=Font(bold=True,size=14,color='1F4E79')
WRAP=Alignment(wrap_text=True,vertical='top')
THIN=Border(*[Side(style='thin',color='D9D9D9')]*4)
GREEN=PatternFill('solid',fgColor='E2EFDA'); GRAY=PatternFill('solid',fgColor='F1EFE8')

def head(ws,row,cols):
    for c,v in enumerate(cols,1):
        x=ws.cell(row=row,column=c,value=v); x.fill=HFILL; x.font=HFONT
        x.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center'); x.border=THIN
    ws.row_dimensions[row].height=28

wb=Workbook()
ws=wb.active; ws.title='1_统计概览'
ws['A1']='创兴银行新闻监测 · 最终汇总（扩充监测源后）'; ws['A1'].font=TITLE
ws['A2']='生成日期：2026-11-20 ｜ 监测区间：2026-10-26 至 2026-11-20 ｜ 媒体源库：3839（其中329个RSS，含30个Google News关键词聚合源）'
ws['A2'].font=Font(size=10,color='595959')

tier=Counter(x.get('tier','') for x in active)
src=Counter(x.get('source_name','') for x in active)
dates=sorted(set(str(x.get('pub_date',''))[:10] for x in active))

head(ws,4,['指标','数值','说明'])
rows=[
 ['新闻总数',len(active),'已排除官网稿5条、重复2条、误报2条；本次新增2条'],
 ['B类（重要新闻）',tier.get('B',0),'直接涉及创兴银行的重要报道'],
 ['C类（例行提及）',tier.get('C',0),'定存/利率比较、市场动态等'],
 ['监测天数',len(dates),f'{dates[0]} 至 {dates[-1]}'],
 ['媒体来源数',len(src),'较上一版基本持平，但源库覆盖面大幅扩展'],
 ['Wiser 对标',f'{len(active)} vs 72','已超过 Wiser 72条（其中Wiser有2条误报）'],
]
for r,row in enumerate(rows,5):
    for c,v in enumerate(row,1):
        x=ws.cell(row=r,column=c,value=v); x.border=THIN; x.alignment=WRAP

ws['A13']='本次监测源扩充'; ws['A13'].font=TITLE
head(ws,14,['扩充项','数量','说明'])
exp=[
 ['媒体源总数','3793 → 3839','新增46个经实测验证的可用源'],
 ['RSS源总数','283 → 329','新增46个全部实测返回合法RSS'],
 ['Google News关键词聚合源','0 → 30','覆盖创兴银行、廖创兴、Chong Hing Bank、定存/利率/按揭/评级/越秀/深圳横琴等30组关键词'],
 ['其他验证RSS','0 → 16','明报即时/财经、星岛头条、人民网财经/时政、新华网财经、BBC中文/Business、CNBC、MarketWatch、FT中文、彭博、WSJ、CNN等'],
 ['实测命中','347条 → 去重后19条 → 新增2条','Google News聚合源在监测区间内发现2条我方此前缺漏的真实报道，已核验补录'],
 ['付费订阅','已定2家','信报2026-12-28生效、经济日报2027-01-01生效，各一年'],
]
for r,row in enumerate(exp,15):
    for c,v in enumerate(row,1):
        x=ws.cell(row=r,column=c,value=v); x.border=THIN; x.alignment=WRAP
        if c==2: x.fill=GREEN
    ws.row_dimensions[r].height=42

ws['A23']='重要说明'; ws['A23'].font=TITLE
notes=[
 '1. 覆盖面已大幅提升：从"逐个站点蹲守"升级为"搜索引擎全网聚合 + 329个RSS双引擎"，未来每日采集能发现过去抓不到的媒体。',
 '2. 但历史区间（10/26–11/20）的新增有限：Google News 主要索引近30天内容，区间内相关报道此前已基本收录，本次仅新增2条真实缺漏。',
 '3. 要真正补齐 Wiser 的历史覆盖面（如澳门日报、巴士的报、e-zone等），仍需付费订阅——详见《付费订阅清单》。',
 '4. 官网自有稿件不计入监测（用户明确要求）；宽关键词候选需人工核验后才入库。',
]
for i,s in enumerate(notes,24):
    ws.merge_cells(start_row=i,start_column=1,end_row=i,end_column=3)
    x=ws.cell(row=i,column=1,value=s); x.alignment=WRAP
    ws.row_dimensions[i].height=30
for i,w in enumerate([26,20,90],1): ws.column_dimensions[get_column_letter(i)].width=w

ws2=wb.create_sheet('2_全部76条')
head(ws2,1,['序号','发布日期','来源','分级','主题','标题','链接'])
for r,x in enumerate(active,2):
    t=x.get('title','')
    theme='创兴直接' if any(k in t for k in ['創興','创兴','Chong Hing']) else ('越秀/关联' if '越秀' in t else ('定存/存款' if any(k in t for k in ['定存','定期','存款']) else ('利率走势' if any(k in t for k in ['加息','減息','利率','息']) else '其他')))
    vals=[r-1,str(x.get('pub_date',''))[:10],x.get('source_name',''),x.get('tier',''),theme,t,x.get('link','')]
    for c,v in enumerate(vals,1):
        cell=ws2.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
ws2.freeze_panes='A2'; ws2.auto_filter.ref=f'A1:G{len(active)+1}'
for i,w in enumerate([8,13,24,8,14,72,58],1): ws2.column_dimensions[get_column_letter(i)].width=w

ws3=wb.create_sheet('3_来源统计')
head(ws3,1,['来源','条数','占比'])
for r,(s,c) in enumerate(src.most_common(),2):
    for col,v in enumerate([s,c,f'{c/len(active)*100:.1f}%'],1):
        x=ws3.cell(row=r,column=col,value=v); x.border=THIN; x.alignment=WRAP
ws3.freeze_panes='A2'
for i,w in enumerate([32,12,12],1): ws3.column_dimensions[get_column_letter(i)].width=w

out=os.path.join(ROOT,'output','创兴银行新闻监测_最终汇总_76条_20261120.xlsx')
wb.save(out); print('saved:',out)
print('items',len(active),'tier',dict(tier),'sources',len(src))
