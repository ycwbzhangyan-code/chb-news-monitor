# -*- coding: utf-8 -*-
"""生成《付费订阅清单》Excel —— 供采购部逐项决策。"""
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HFILL=PatternFill('solid',fgColor='1F4E79'); HFONT=Font(color='FFFFFF',bold=True,size=10)
TITLE=Font(bold=True,size=14,color='1F4E79')
WRAP=Alignment(wrap_text=True,vertical='top')
THIN=Border(*[Side(style='thin',color='D9D9D9')]*4)
GREEN=PatternFill('solid',fgColor='E2EFDA'); YELLOW=PatternFill('solid',fgColor='FFF2CC'); RED=PatternFill('solid',fgColor='FCE4E4')

def head(ws,row,cols):
    for c,v in enumerate(cols,1):
        x=ws.cell(row=row,column=c,value=v); x.fill=HFILL; x.font=HFONT; x.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center'); x.border=THIN
    ws.row_dimensions[row].height=30

wb=Workbook()

ws=wb.active; ws.title='1_已确认采购'
ws['A1']='创兴银行新闻监测 · 付费订阅清单'; ws['A1'].font=TITLE
ws['A2']='生成日期：2026-11-20 ｜ 说明：本清单列出为达到/超过 Wiser 覆盖面所需的付费数据源，供采购部逐项评估。'
ws['A2'].font=Font(size=10,color='595959')
head(ws,4,['媒体/服务','生效日','到期日','期限','状态','解决什么缺口','优先级'])
rows=[
 ['信報（信報財經新聞網）','2026-12-28','2027-12-27','一年','已采购，待生效','Wiser 中编号566/574/584/605/612/620 等信报财经报道；我方此前仅零星覆盖','★★★'],
 ['經濟日報（含經濟日報網/理財）','2027-01-01','2027-12-31','一年','已采购，待生效','Wiser 中约30%来自经济日报系；我方经济日报内容靠免费页面，覆盖不全','★★★'],
]
for r,row in enumerate(rows,5):
    for c,v in enumerate(row,1):
        x=ws.cell(row=r,column=c,value=v); x.border=THIN; x.alignment=WRAP
        if c==5: x.fill=GREEN
    ws.row_dimensions[r].height=48

ws['A9']='待采购（按优先级排序）'; ws['A9'].font=TITLE
head(ws,10,['媒体/服务','类型','预算锚点','解决什么缺口','优先级','建议动作'])
todo=[
 ['慧科 WiseSearch / Wiser 全库','全媒体数据库','9万–18万元/年（高校采购价锚点：深圳大学约9万；广东省立中山图书馆港版慧科18万）',
  '唯一能真正对标 Wiser「面全」的方案：870+平面媒体、5000+网站、历史回溯至1998年。可一次补齐澳门日报、巴士的报、e-zone、港生活、eZone、内地媒体等全部缺口，并提供可审计的历史剪报。','★★★',
  '强烈建议采购。先申请试用账号，用「创兴银行 + 2026/10/26–11/20」跑一遍，与现有72条逐条比对后再签约。'],
 ['明報（明報財經網 / 明報電子版）','港媒订阅','需询价（参考港媒电子订阅普遍数千至数万港元/年）',
  'Wiser 中编号583/596/611等明报报道（含直接点名创兴的定存利率新闻）。目前明报即时新闻 RSS 可用，但深度财经版与历史全文需订阅。','★★',
  '先申请试用；若 RSS 已能满足每日预警，可暂缓。需要历史回溯时再订。'],
 ['澳門日報','港媒订阅','需询价',
  'Wiser 编号613；澳门本地银行定存/跨境金融报道，免费站点无稳定 RSS 与全文。','★',
  '低频来源，暂不单独采购；如慧科全库已包含则不重复订。'],
 ['巴士的報','港媒订阅','需询价',
  'Wiser 编号579（香港人寿渠道新闻，关联公司）。免费站点可抓部分，全文/历史需订阅。','★',
  '暂不单独采购；通过候选发现器维持覆盖。'],
 ['e-zone / eZone','港媒订阅','需询价',
  'Wiser 编号556/557/558/570/604（汇率比较类）。免费站点首页无有效静态内容。','★',
  '这类汇率比较稿多为每日更新、时效性短，建议不单独采购。'],
 ['香港01','港媒订阅','需询价',
  'Wiser 编号606（港元定期存款利率比较）。免费站点首页无有效静态内容。','★',
  '暂不单独采购；HK01 的 RSS 已接入，可覆盖部分。'],
 ['CTgoodjobs','行业媒体','需询价',
  'Wiser 编号553（创兴银行晋升机制，雇主品牌稿）。属招聘/雇主品牌渠道，非核心媒体声量。','★',
  '不建议采购；如需雇主品牌监测，可与公关部现有招聘平台合并考虑。'],
 ['Meltwater 融文','国际舆情平台','企业级美元报价（通常高于慧科）',
  '全球27万+新闻源，多语言强，但香港本地中文小众媒体未必优于慧科。','★',
  '除非集团已有采购，否则不建议单独为本项目采购。'],
 ['Cision / Sprinklr / LexisNexis','国际舆情平台','企业级美元报价',
  '强在社交聆听与全球媒体联络，香港中文平面媒体覆盖不一定优于慧科。','—',
  '不建议作为本项目首选。'],
]
for r,row in enumerate(todo,11):
    for c,v in enumerate(row,1):
        x=ws.cell(row=r,column=c,value=v); x.border=THIN; x.alignment=WRAP
        if c==5:
            x.fill=RED if '★★★' in str(v) else (YELLOW if '★★' in str(v) else PatternFill())
    ws.row_dimensions[r].height=68
for i,w in enumerate([30,18,46,66,10,66],1): ws.column_dimensions[get_column_letter(i)].width=w

ws2=wb.create_sheet('2_采购决策建议')
ws2['A1']='采购决策建议'; ws2['A1'].font=TITLE
head(ws2,3,['步骤','动作','目的'])
steps=[
 ['第一步','确认已采购的信報、經濟日報账号形式（账号密码/IP白名单）、是否提供 API 或批量导出、可否回溯生效日前内容','确保 12/28、1/1 生效当天即可接入，不留空窗'],
 ['第二步','申请慧科 WiseSearch / Wiser 试用账号','用真实数据验证是否值得 9万–18万元/年'],
 ['第三步','用同一检索式跑 10/26–11/20，与《Wiser覆盖差异诊断》Sheet2 的72条逐条比对','用数据而非印象做采购决策'],
 ['第四步','若试用覆盖明显优于现有系统 → 签约慧科全库；若差异不大 → 维持现有免费系统 + 两份港媒','避免过度采购'],
 ['第五步','无论是否签约慧科，都建议把工商/招聘/招标类条目移出正式媒体声量','提升报告可信度'],
]
for r,row in enumerate(steps,4):
    for c,v in enumerate(row,1):
        x=ws2.cell(row=r,column=c,value=v); x.border=THIN; x.alignment=WRAP
    ws2.row_dimensions[r].height=52
for i,w in enumerate([14,86,58],1): ws2.column_dimensions[get_column_letter(i)].width=w

out=os.path.join(ROOT,'output','创兴银行新闻监测_付费订阅清单_20261120.xlsx')
wb.save(out); print('saved:',out)
