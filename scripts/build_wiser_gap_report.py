# -*- coding: utf-8 -*-
"""
生成 Wiser 72 条 vs 我方 74 条的覆盖差异诊断工作簿。
数据来源：
  - Wiser 截图编号 549-620（2026-11-20 提供），逐行放大转录；日期与媒体可靠，
    标题末尾因截图分辨率有限处用「…」标记，不猜测补全。
  - 我方 data/news_items.json 中 status=active 的 74 条。
"""
import json, re, os, difflib
from datetime import datetime
from collections import Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 序号, 日期, 媒体, 标题（据截图转录）, 备注
WISER = [
(549,"26/10","香港經濟日報網","港元定存10月尾班車！3.2厘至12厘 7款快閃高息之選",""),
(550,"26/10","香港經濟日報網","澳元定存｜新資金4.8厘、1元起存4.3厘｜澳央行減息…",""),
(551,"26/10","中財網","26越資05：廣州越秀資本控股集團股份有限公司…",""),
(552,"26/10","南方日報(全國版)","越秀集團：當好耐心資本 助力科技創新",""),
(553,"27/10","CT GoodJobs","創興銀行提供清晰透明晉升機制 助新一代金融人才…",""),
(554,"28/10","星島頭條網","定存攻略｜美元定期存款 議息前夕多間銀行…",""),
(555,"28/10","U Lifestyle","港元定存2026｜新客優惠全攻略：富融派25厘息…",""),
(556,"29/10","e-zone","港幣兌台幣匯率｜香港11間銀行/找換店兌換…",""),
(557,"29/10","e-zone","日元兌港元最新匯率｜香港22間銀行/找換店…",""),
(558,"29/10","e-zone","人民幣兌港幣匯率｜香港20間銀行/找換店…",""),
(559,"30/10","久期財經","惠譽：確認創興銀行「BBB」長期發行人評級","直接點名創興，B類"),
(560,"30/10","星島頭條網","定存攻略｜聯儲局下次議息加息機會大 美元…",""),
(561,"30/10","香港經濟日報網","港元定期｜3個月年利率3.8厘 新一年賺$9,400",""),
(562,"31/10","香港經濟日報網","6個月港元定期 新資金最高4厘、現有資金3.4厘",""),
(563,"31/10","U Lifestyle","港幣兌台幣匯率｜香港11間銀行/找換店兌換…",""),
(564,"01/11","U Lifestyle","日元兌港元最新匯率｜香港22間銀行/找換店日元…",""),
(565,"02/11","香港經濟日報網","港元定期｜11月全新優惠！一個月20厘速賺$1,313",""),
(566,"02/11","信報財經新聞網","美元定存2026｜中資行鎖長錢 1年期存息高達4.x厘",""),
(567,"02/11","香港經濟日報網","【港元定存】港元定存高息榜最激20厘迎11月",""),
(568,"03/11","香港經濟日報網","創興銀行港元定存最高10厘！2026年11月最新定存","直接點名創興，B類"),
(569,"03/11","U Lifestyle","英鎊兌港元匯率｜香港逾22間銀行/找換店兌換英鎊",""),
(570,"03/11","eZone","香港18大銀行港元定期存款利率比較｜2026最新",""),
(571,"03/11","香港經濟日報網","港元定存｜15款新開戶優惠比併 18厘比88厘…",""),
(572,"03/11","香港經濟日報網","澳洲央行加息至18年高 釋出鴿派訊號 澳元…",""),
(573,"03/11","U Lifestyle","兌換台幣攻略｜7大台幣兌換最抵心得ATM提款…",""),
(574,"04/11","信報財經新聞網","紐元定存2026｜12月加息？1個月存期賺5.38厘",""),
(575,"04/11","港生活","港元定存2026｜新客優惠全攻略：富融派25厘息…",""),
(576,"04/11","香港經濟日報網","美元定期｜3個月高達5.2厘！12個月4.32厘",""),
(577,"05/11","港生活","港元定期存款利率2026每日更新｜全港17大銀行",""),
(578,"04/11","星島頭條","定存攻略｜美元定期存款息率大比拼 再有銀行…",""),
(579,"04/11","巴士的報","香港人壽正式啟動保險經紀渠道 拓展多元化分銷","关联公司"),
(580,"05/11","匯港通訊","創興銀行參與「香港國際海岸清潔運動 2026」","直接點名創興，B類"),
(581,"05/11","久期財經","惠譽：首次授予廣州越秀集團「A-」長期發行人評級","母公司"),
(582,"06/11","香港經濟日報","港元定存 掉頭減息",""),
(583,"06/11","明報","澳元短期定存最高8.88厘 須防匯兌風險",""),
(584,"06/11","信報財經新聞網","港元定期2026｜88厘vs20厘超短期綽頭多 最新盤點",""),
(585,"06/11","星島頭條網","定存攻略｜美元定期存款息率大比拼 多間銀行…",""),
(586,"07/11","香港經濟日報網","港元定期｜3個月年利率3.8厘 新一年賺$9,400",""),
(587,"07/11","U Lifestyle","歐元兌港元匯率｜香港逾22間銀行/找換店兌換歐元",""),
(588,"08/11","香港經濟日報網","6個月港元定期｜最高4厘門檻高、新資金3.4厘",""),
(589,"10/11","香港經濟日報網","港元定存｜1個月速賺$3,500！5款10厘至20厘精選",""),
(590,"10/11","U Lifestyle","兌換台幣攻略｜7大台幣兌換最抵心得ATM提款…",""),
(591,"11/11","香港經濟日報網","稅務貸款是甚麼？了解稅貸用途、好處及風險",""),
(592,"11/11","星島頭條","儲局下月加息幾成定局 美元定期存款息率大比拼",""),
(593,"11/11","香港經濟日報網","稅務貸款是甚麼？了解稅貸用途、好處及風險",""),
(594,"11/11","星島頭條網","定存攻略｜儲局下月加息幾成定局 美元定期存款…",""),
(595,"11/11","U Lifestyle","港元定存2026｜新客優惠全攻略：富融派25厘息…",""),
(596,"11/11","明報","美元定存6個月年利率4.1厘","标题末尾截图不清"),
(597,"11/11","明報財經網","創興6個月美元定存年利率4.1厘","直接點名創興，B類"),
(598,"11/11","星島頭條網","定存攻略｜儲局下月加息幾成定局 美元定期存款…",""),
(599,"12/11","U Lifestyle","港元定存2026｜全港18大銀行利率大比拼！低門檻",""),
(600,"13/11","星島頭條網","定存攻略｜美元定期存款息率大比拼 12個月期…",""),
(601,"13/11","看点时报","上志國際委任羅家英出任品牌超級代言人","Wiser 自身误报，与创兴无关"),
(602,"14/11","香港經濟日報","美百分百加息 美元定存息口勝港元",""),
(603,"14/11","香港經濟日報網","港元定存｜4個月收息1萬元 3個月新資金3.3厘…",""),
(604,"15/11","eZone","人民幣兌港幣匯率｜香港逾20間銀行/找換店兌換",""),
(605,"16/11","信報財經新聞網","美元定存2026｜外資行突出招1個月快賺7厘",""),
(606,"16/11","香港01","港元定期存款利率比較2026年11月｜銀行最高20厘",""),
(607,"16/11","观点网","越秀地產與廣州越秀修訂工程服務持續關連交易","母公司"),
(608,"17/11","U Lifestyle","港幣兌台幣匯率｜香港11間銀行/找換店兌換台幣",""),
(609,"17/11","港生活","港元定期存款利率2026每日更新｜全港17大銀行",""),
(610,"17/11","香港經濟日報網","港元定存｜3個月新高3.68厘，特別存期5.8厘！",""),
(611,"18/11","明報財經網","創興3個月澳元定存年利率4.5厘","直接點名創興，B類"),
(612,"18/11","信報財經新聞網","澳元定存2026｜中小銀行跟加存息 邊間最吸引",""),
(613,"18/11","澳門日報","百萬存款逾四百八十萬…","标题末尾截图不清"),
(614,"18/11","星島頭條","定存攻略｜美元定期存款息率大比拼 多間銀行",""),
(615,"18/11","港生活","港元定存2026｜新客優惠全攻略：富融派25厘息",""),
(616,"19/11","香港經濟日報網","澳元定存4.8厘見頂？失業率創5年高 市場押注…",""),
(617,"19/11","香港經濟日報網","【港元定存】港元定存「趣同息」最高3.55厘…",""),
(618,"19/11","香港經濟日報網","兩個月港元定存3.48厘 大戶穩袋$28,600",""),
(619,"19/11","中國金融商報網","功率半導體龍頭聞泰科技亮相央視「APEC財經…」","Wiser 自身误报，与创兴无关"),
(620,"20/11","信報財經新聞網","英鎊定存2026｜英國加息周期開啟 可撈英鎊…",""),
]

# 媒体别名归一
ALIAS = {
 "香港經濟日報網":"經濟日報","香港經濟日報":"經濟日報","香港經濟日報·理財":"經濟日報",
 "U Lifestyle":"U Lifestyle","U Lifestyle·理財":"U Lifestyle","星島頭條網":"星島","星島頭條":"星島","星島日報":"星島",
 "信報財經新聞網":"信報","明報":"明報","明報財經網":"明報","明報·經濟":"明報",
 "東網 on.cc":"東網","久期財經":"久期財經","久期财经":"久期財經","匯港通訊":"匯港通訊",
 "澳門日報":"澳門日報","巴士的報":"巴士的報","香港01":"香港01","e-zone":"e-zone","eZone":"e-zone",
 "港生活":"港生活","中財網":"中財網","CT GoodJobs":"CTgoodjobs","CTgoodjobs":"CTgoodjobs",
 "南方日報(全國版)":"南方日報","观点网":"觀點網","观点网/百家号":"觀點網",
 "中國金融商報網":"中國金融商報網","看点时报":"看点时报","香港金融管理局":"金管局",
}

def norm(s):
    return re.sub(r'[\s，,。.：:、｜|「」《》（）()【】\[\]"\'!?！？…·-]', '', (s or '')).lower()

def day(s):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(s or ''))
    if not m: return None
    try: return datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
    except ValueError: return None

def theme(title):
    t = title
    if any(k in t for k in ['創興','创兴','Chong Hing','惠譽：確認']): return '创兴直接相关'
    if any(k in t for k in ['越秀','香港人壽']): return '母公司/关联公司'
    if any(k in t for k in ['匯率','兌換','找換','匯價','台幣','日元','英鎊','人民幣兌','港幣兌']): return '外汇兑换'
    if any(k in t for k in ['稅貸','稅務貸款']): return '税贷'
    if any(k in t for k in ['按揭']): return '按揭'
    if any(k in t for k in ['定存','定期','存款','存息','息率','高息']): return '定存/存款'
    if any(k in t for k in ['加息','減息','議息','息口','拆息','利率']): return '利率走势'
    return '其他'

def load_ours():
    p = os.path.join(ROOT,'data','news_items.json')
    d = json.load(open(p,encoding='utf-8'))
    items = d['items'] if isinstance(d,dict) and 'items' in d else d
    return [x for x in items if x.get('status')=='active' or not x.get('status')]

ours = load_ours()
our_src_counter = Counter(ALIAS.get(x.get('source_name',''), x.get('source_name','')) for x in ours)
our_theme_counter = Counter(theme(x.get('title','')) for x in ours)
our_norm = [(norm(x.get('title','')), x) for x in ours]

# ---------- 样式 ----------
HFILL = PatternFill('solid', fgColor='1F4E79')
HFONT = Font(color='FFFFFF', bold=True, size=10)
TITLEFONT = Font(bold=True, size=14, color='1F4E79')
WRAP = Alignment(wrap_text=True, vertical='top')
THIN = Border(*[Side(style='thin', color='D9D9D9')]*4)
FILL_RED = PatternFill('solid', fgColor='FCE4E4')
FILL_YEL = PatternFill('solid', fgColor='FFF2CC')
FILL_GRN = PatternFill('solid', fgColor='E2EFDA')
FILL_GRY = PatternFill('solid', fgColor='E7E6E6')

def header(ws, row, cols):
    for c, v in enumerate(cols,1):
        cell = ws.cell(row=row,column=c,value=v)
        cell.fill=HFILL; cell.font=HFONT; cell.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center')
        cell.border=THIN
    ws.row_dimensions[row].height=28

def widths(ws, ws_widths):
    for i,w in enumerate(ws_widths,1): ws.column_dimensions[get_column_letter(i)].width=w

wb = Workbook()

# ---------- Sheet 1 诊断总览 ----------
ws = wb.active; ws.title='1_诊断总览'
ws['A1']='创兴银行新闻监测 · Wiser 覆盖差异诊断'; ws['A1'].font=TITLEFONT
ws['A2']='对比区间：2026-10-26 至 2026-11-20 ｜ Wiser 编号 549–620 共 72 条 ｜ 我方 active 74 条'
ws['A2'].font=Font(size=10, color='595959')

rows = [
 ['指标','Wiser','我方','判断'],
 ['总条数',72,len(ours),'数量已达标，但结构不同'],
 ['其中明显误报',2,0,'Wiser 也有噪音（601、619 与创兴无关）'],
 ['有效条数',70,len(ours),'口径基本相当'],
 ['媒体家数',len(set(ALIAS.get(x[2],x[2]) for x in WISER[:-2])),len(our_src_counter),'我方看似更多，但大量为工商登记/招聘/招标站'],
 ['真正的媒体新闻条数',70,len([x for x in ours if x.get('source_name') not in ['企查查','爱企查/百度','天眼查','猎聘','千里马招标网']]),'剔除邻近窗口后我方约 69 条'],
 ['最大单一来源占比','约 30%（經濟日報系）','%.0f%%（經濟通 25/74）'%(25/len(ours)*100),'我方来源集中度过高'],
 ['定存/存款主题占比','约 65%','%.0f%%'%(our_theme_counter['定存/存款']/len(ours)*100),'主题结构相近，但我方缺汇率/税贷/母公司等延展'],
]
for r,row in enumerate(rows,4):
    for c,v in enumerate(row,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
        if r==4: cell.fill=HFILL; cell.font=HFONT
ws['A14']='核心结论'; ws['A14'].font=TITLEFONT
concl = [
 '1. 数量不是问题：我方 74 条 ≥ Wiser 72 条；剔除 Wiser 两条误报后双方有效量基本持平。',
 '2. 问题在"面"：Wiser 覆盖 9 类我方完全没有的媒体（e-zone、港生活、CT GoodJobs、香港01、巴士的報、澳門日報、中財網、南方日報、中國金融商報網）。',
 '3. 我方 25/74 来自经济通（34%），高度依赖单一免费源；一旦该站改版，监测量会断崖式下跌。',
 '4. 我方混入大量工商登记/招聘/招标/担保公告（企查查、天眼查、猎聘、千里马、香农芯创担保等），这些不是媒体声量，会稀释报告可信度。',
 '5. 根本原因：Wiser 是付费全媒体数据库（870+平面媒体、5000+网站、历史回溯至1998），我方是免费公开网页抓取，名单与全文覆盖天然不对等。',
 '6. 结论：免费系统适合做"每日预警 + 线索发现"，要真正对标 Wiser 的"面全"，必须接入付费数据库；两者并行而非互相取代。',
 '7. 采购决定（已确认）：经济日报自 2027-01-01 起、信报自 2026-12-28 起各订阅一年；生效前继续免费抓取，生效后接入正式采集。',
]
for i,s in enumerate(concl,15):
    ws.cell(row=i,column=1,value=s).alignment=WRAP
    ws.merge_cells(start_row=i,start_column=1,end_row=i,end_column=4)
    ws.row_dimensions[i].height=28
widths(ws,[26,26,28,54])

# ---------- Sheet 2 Wiser 72 条逐条对照 ----------
ws=wb.create_sheet('2_Wiser72条逐条对照')
header(ws,1,['Wiser编号','日期','媒体','标题（据截图转录）','主题','我方对应情况','我方对应条目','缺口类型','备注'])
for r,(no,date,src,title,note) in enumerate(WISER,2):
    if no in (601,619):
        status='对方误报，不计缺口'; matched='—'; gap='无需补齐'; fill=FILL_GRY
    else:
        nt=norm(title)
        # 标题相似度匹配
        best=None; bestscore=0
        for on,item in our_norm:
            if len(on)<8: continue
            sc=difflib.SequenceMatcher(None,nt[:40],on[:40]).ratio()
            if sc>bestscore: bestscore=sc; best=item
        osrc=ALIAS.get(src,src)
        same_media=[x for x in ours if ALIAS.get(x.get('source_name',''),x.get('source_name',''))==osrc]
        wday=datetime.strptime(date,'%d/%m').replace(year=2026)
        if bestscore>=0.62 and best:
            bday=day(best.get('pub_date',''))
            if bday and abs((wday-bday).days)<=3:
                status='已收录（同题同期）'; matched=best.get('title',''); gap='无缺口'; fill=FILL_GRN
            else:
                status='同题不同日期/媒体'; matched=best.get('title',''); gap='非同一篇'; fill=FILL_YEL
        elif same_media:
            status='同媒体有其他条目'; matched=same_media[0].get('title',''); gap='同媒体不同篇'; fill=FILL_YEL
        elif theme(title) in ['创兴直接相关','母公司/关联公司']:
            status='未覆盖（高优先级）'; matched='—'; gap='媒体缺失'; fill=FILL_RED
        elif osrc not in our_src_counter:
            status='未覆盖（媒体缺失）'; matched='—'; gap='媒体缺失'; fill=FILL_RED
        else:
            status='仅主题覆盖'; matched='—'; gap='同主题不同媒体/日期'; fill=FILL_YEL
    vals=[no,'2026-'+date,src,title,theme(title),status,matched,gap,note]
    for c,v in enumerate(vals,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN
        cell.alignment=WRAP
        if c in (6,8): cell.fill=fill
ws.freeze_panes='A2'; ws.auto_filter.ref=f'A1:I{len(WISER)+1}'
widths(ws,[10,12,20,62,16,22,54,22,28])

# ---------- Sheet 3 来源覆盖差异 ----------
ws=wb.create_sheet('3_来源覆盖差异')
header(ws,1,['媒体（归一）','Wiser条数','我方条数','差异','结论/处置'])
wsrc=Counter(ALIAS.get(x[2],x[2]) for x in WISER if x[0] not in (601,619))
allsrc=sorted(set(list(wsrc)+list(our_src_counter)))
for r,s in enumerate(allsrc,2):
    w=wsrc.get(s,0); o=our_src_counter.get(s,0)
    if w>0 and o==0: verdict='★ 关键缺口：Wiser 有、我方无，已加入候选发现器'
    elif w==0 and o>0:
        verdict='我方独有；若为工商/招聘/招标站，建议从正式报告剔除'
        if s in ['企查查','爱企查/百度','天眼查','猎聘','千里马招标网']:
            verdict='建议剔除：非媒体声量（工商/招聘/招标）'
    else: verdict='双方均覆盖'
    vals=[s,w,o,o-w,verdict]
    for c,v in enumerate(vals,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
        if w>0 and o==0: cell.fill=FILL_RED
        elif '建议剔除' in verdict: cell.fill=FILL_GRY
ws.freeze_panes='A2'; ws.auto_filter.ref=f'A1:E{len(allsrc)+1}'
widths(ws,[26,12,12,10,62])

# ---------- Sheet 4 我方74条明细 ----------
ws=wb.create_sheet('4_我方74条明细')
header(ws,1,['发布日期','来源','分级','主题','标题','链接'])
ours_sorted=sorted(ours,key=lambda x:str(x.get('pub_date',''))[:10])
for r,x in enumerate(ours_sorted,2):
    vals=[str(x.get('pub_date',''))[:10],x.get('source_name',''),x.get('tier',''),theme(x.get('title','')),x.get('title',''),x.get('link','')]
    for c,v in enumerate(vals,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
ws.freeze_panes='A2'; ws.auto_filter.ref=f'A1:F{len(ours_sorted)+1}'
widths(ws,[13,24,8,18,72,60])

# ---------- Sheet 5 行动方案 ----------
ws=wb.create_sheet('5_行动方案')
header(ws,1,['方向','具体动作','当前状态','预期效果','限制/风险'])
actions=[
 ['① 补采小众媒体','e-zone、港生活、CT GoodJobs、香港01、巴士的報、澳門日報、中財網、南方日報已加入候选发现器；星島 RSS 已接入','已完成代码层，站点可达性已实测','覆盖 Wiser 独有来源，后续可发现原漏检条目','部分站点无稳定 RSS/列表页（港生活本机 DNS 失败、澳門日報首页无链接），需 GitHub Actions 环境再测'],
 ['② 扩展主题关键词','定存/利率/汇率/税贷/按揭/越秀/香港人壽/惠譽评级全部纳入候选发现；去掉单独币种名避免噪音','已完成第一版','发现"创兴直接相关但不含定存"的新闻（如评级、CSR、招聘）','宽词仍会带券商评级/导航标签噪音，已加排除表；仍需人工核验后入库'],
 ['③ 接入付费数据源','已决定先订阅两份港媒：经济日报 2027-01-01 生效、信报 2026-12-28 生效，各一年；慧科全库暂不采购','采购已定，待生效接入','补上 Wiser 高频来源中的经济日报系与信报全文','生效前仍靠免费抓取；需在12月中前拿到账号/API/导出方式并接入采集器'],
 ['④ 差异清单','本工作簿 Sheet2 逐条对照 72 条，Sheet3 来源缺口','已完成','明确每条是已收录/同媒体不同篇/媒体缺失/对方误报','截图标题末尾部分字迹模糊，已用「…」标注；日期与媒体 100% 可靠'],
 ['⑤ 报告质量（新增建议）','把企查查/天眼查/猎聘/千里马/担保公告等移出正式媒体声量，单列为"邻近窗口"','待执行','提升报告可信度，避免把工商数据当媒体曝光','会减少总数约 10 条，需由真实补录补回'],
 ['⑥ 采集稳定性（新增建议）','降低经济通 34% 集中度：为 9 个新源各配置独立采集器并加入每日 Actions','待执行','避免单一源改版导致监测量断崖','新站点结构易变，需持续维护选择器'],
]
for r,row in enumerate(actions,2):
    for c,v in enumerate(row,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
    ws.row_dimensions[r].height=72
widths(ws,[22,66,26,40,58])

# ---------- Sheet 6 付费数据源评估 ----------
ws=wb.create_sheet('6_付费数据源评估')
header(ws,1,['方案','公开资料与价格锚点','覆盖能力','接入可行性','建议'])
vendors=[
 ['慧科讯业 WiseSearch / Wiser（当前对标对象）',
  '广东省立中山图书馆2026年度数字资源采购公示：「港版慧科新闻数据库」单项 180,000 元；深圳大学同类 WiseSearch 采购约 90,000 元/年。高校采购价通常低于商业客户。',
  '官方口径：覆盖 57万+数据源、220+国家、130+语种；历史可回溯至1998年。Wiser 截图所展示的"面全"即来自此数据库。',
  '公开 API 未开放，需商务洽谈；通常提供 Web 检索台、邮件剪报、批量导出，部分套餐可给 API/数据包。',
  '★ 首选。建议先申请试用，用「创兴银行 + 2026/10/26–11/20」同一条件跑一遍，与现有72条逐条比对，再谈价。预算锚点 9万–18万元/年。'],
 ['本次实际采购（已确认）',
  '经济日报：2027-01-01 起生效，订阅一年。信报：2026-12-28 起生效，订阅一年。两者均为香港主流财经媒体，即 Wiser 截图高频来源。（明報、慧科全库本次未采购）',
  '覆盖经济日报系（Wiser 中约 30%）与信报财新网（Wiser 中多次出现），可直接补上我方最缺的两类港媒全文。',
  '生效日前需向采购部确认：账号形式、是否提供 API 或批量导出、可否回溯生效前内容；再决定接入方式。',
  '★ 已决策。建议 12 月中前完成账号对接与采集器改造，确保 12/28 信报生效即开始入库。'],
 ['Meltwater 融文',
  '国际企业级定价（美元），公开资料称覆盖 27万+新闻源。',
  '多语言、跨区域能力强；对香港本地中文小众媒体（e-zone、港生活、澳門日報）覆盖需实测验证。',
  '成熟的 API 与导出，企业集成方便。',
  '备选。若集团已有采购可复用；单独为香港银行业监测采购，性价比通常不如慧科。'],
 ['Cision / Sprinklr / LexisNexis / Onclusive',
  '国际第一梯队，企业级报价，无公开标准价。',
  '强在社交聆听与全球媒体联络，香港中文平面媒体未必优于慧科。',
  'API 成熟，但本地化支持与中文分词需评估。',
  '不建议作为本项目首选；除非集团层面的全球舆情平台已统一采购。'],
 ['继续自建免费采集（当前系统）',
  '成本≈0（GitHub Actions + Vercel 免费额度）。',
  '已覆盖 3793 个媒体源清单、263 个 RSS；本次再补 9 个 Wiser 独有媒体。但免费网页无全文历史、无授权转载、站点改版即失效。',
  '完全可控，已在云端每日自动运行并邮件推送。',
  '保留。定位为「每日预警 + 线索发现 + 付费库交叉校验」，不承诺与 Wiser 同等覆盖。'],
]
for r,row in enumerate(vendors,2):
    for c,v in enumerate(row,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
        if c==1: cell.font=Font(bold=True)
    ws.row_dimensions[r].height=110
ws['A9']='决策建议'; ws['A9'].font=TITLEFONT
advice=[
 '① 若管理层要求的是「完整剪报、可回溯历史、可向审计说明的覆盖证明」——必须采购慧科，免费方案无法替代。',
 '② 若需求只是「每天知道有没有新报道、第一时间预警」——现有免费系统已够用，配合本次补采的9个媒体即可。',
 '③ 最稳妥做法：先向慧科申请试用账号，用同一检索式跑10/26–11/20，把结果与本工作簿 Sheet2 逐条核对，用数据决定是否付费。',
 '④ 采购时间表：信报 2026-12-28 生效、经济日报 2027-01-01 生效，各一年。12 月中前需拿到账号/API/导出方式并完成采集器改造，避免生效后空窗。',
 '⑤ 无论是否采购，都建议把工商/招聘/招标类条目移出正式媒体声量，避免"74条"里混有约10条非媒体信息。',
]
for i,s in enumerate(advice,10):
    ws.merge_cells(start_row=i,start_column=1,end_row=i,end_column=5)
    cell=ws.cell(row=i,column=1,value=s); cell.alignment=WRAP
    ws.row_dimensions[i].height=26
widths(ws,[34,62,56,50,62])

# ---------- Sheet 7 付费订阅时间线 ----------
ws=wb.create_sheet('7_付费订阅时间线')
ws['A1']='港媒付费订阅 · 采购与接入时间线'; ws['A1'].font=TITLEFONT
ws['A2']='用户确认（2026-11-20）：订阅经济日报与信报，各一年；明報、慧科全库本次未采购。'
ws['A2'].font=Font(size=10,color='595959')
header(ws,4,['媒体','生效日','到期日','期限','状态','接入准备事项'])
timeline=[
 ['信報（信報財經新聞網）','2026-12-28','2027-12-27','一年','已采购，待生效',
  '① 12月中前向采购部确认账号/API/全文导出方式；② 在采集器中新增信报专用源；③ 生效后回溯补采生效日前后关键报道；④ 与Wiser中编号566/574/584/605/612/620等信报条目比对验证'],
 ['經濟日報（含經濟日報網/理財）','2027-01-01','2027-12-31','一年','已采购，待生效',
  '① 12月中同步确认账号与数据交付形式；② 接入后优先替换现有免费抓取的hket源；③ 用Wiser中549/550/561/562/565/616-618等经济日报系条目做覆盖校验；④ 评估可否回溯10/26起历史内容'],
 ['明報','—','—','—','本次未采购','继续免费抓取明报网；Wiser中编号583/596/611等明报条目靠公开页面与核验补录维持覆盖'],
 ['慧科 WiseSearch / Wiser 全库','—','—','—','本次未采购','保留为升级选项；如需完整历史回溯与全媒体覆盖，按9万–18万元/年预算另行申请'],
]
for r,row in enumerate(timeline,5):
    for c,v in enumerate(row,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
        if c==5 and '已采购' in str(v): cell.fill=FILL_GRN
    ws.row_dimensions[r].height=80
ws['A10']='关键时间点'; ws['A10'].font=TITLEFONT
header(ws,11,['时间','事项','负责/说明'])
milestones=[
 ['2026-12-15 前','确认两家媒体的账号形式、API或批量导出能力、可回溯范围','传讯处 → 采购部'],
 ['2026-12-20 前','完成采集器改造与配置，接入信报与经济日报付费源','系统维护'],
 ['2026-12-28','信報订阅生效，开始正式采集与入库','自动采集任务'],
 ['2027-01-01','經濟日報订阅生效，切换为付费源采集','自动采集任务'],
 ['生效后首个日报','用Wiser同区间条目逐条比对，验证覆盖是否补齐','传讯处复核'],
]
for r,row in enumerate(milestones,12):
    for c,v in enumerate(row,1):
        cell=ws.cell(row=r,column=c,value=v); cell.border=THIN; cell.alignment=WRAP
    ws.row_dimensions[r].height=32
widths(ws,[30,16,16,10,20,86])

out=os.path.join(ROOT,'output','创兴银行新闻监测_Wiser覆盖差异诊断_20261120.xlsx')
os.makedirs(os.path.dirname(out),exist_ok=True)
wb.save(out)
print('saved:',out)
print('Wiser rows:',len(WISER),'ours:',len(ours))
print('source gap:',[s for s in allsrc if wsrc.get(s,0)>0 and our_src_counter.get(s,0)==0])
