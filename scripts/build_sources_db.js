/**
 * 合并所有批次，构建完整媒体源数据库
 * 3793个源（编号1-4189），源自 WiseNews 订阅清单
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PARTS = ['sources_part1.json', 'sources_part2.json', 'sources_part3.json', 'sources_part4.json', 'sources_part5.json'];

let all = [];
for (const p of PARTS) {
  const f = path.join(DATA_DIR, p);
  if (fs.existsSync(f)) {
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    all = all.concat(data);
  }
}

// 按编号排序 + 去重
const seen = new Set();
all = all.filter(item => {
  if (seen.has(item.no)) return false;
  seen.add(item.no);
  return true;
}).sort((a, b) => a.no - b.no);

// ===== 智能分类 =====
// 根据名称+域名特征判断媒体类别
function classifyCategory(name, lang, domain) {
  const n = name.toLowerCase();
  const d = (domain || '').toLowerCase();

  // 中国内地域名/媒体（优先用域名判断，比名称可靠）
  const cnDomains = ['.cn', '.com.cn', '.cnr.cn', '.xinhuanet.com', '.people.com.cn',
    '.cctv.com', '.chinanews.com', '.sina.com.cn', '.sohu.com', '.163.com',
    '.qq.com', '.ifeng.com', '.caixin.com', '.yicai.com', '.jiemian.com',
    '.stcn.com', '.ce.cn', '.21jingji.com', '.hexun.com', '.eastmoney.com',
    '.jrjc.com', '.nbd.com.cn', '.chinadaily.com.cn', '.voachinese.com',
    '.dw.com', '.rfi.fr', '.france24.com', '.nytimes.com', '.mfa.gov.cn',
    '.huanqiu.com', '.chinanews.com.cn', '.gmw.cn', '.workercn.cn'];
  if (cnDomains.some(x => d.endsWith(x) || d.includes(x))) return 'cn_mainland';

  // 内地媒体名称特征
  if (/新浪|搜狐|網易|网易|騰訊|腾讯|鳳凰|凤凰|人民日報|人民网|人民日報|央視|央视|央廣|央广|中新網|中新网|新華|新华|中國日報|中国日报|光明日报|經濟日報|经济日报|中國青年|财经日报|證券日報|证券日报|第一財經|第一财经|財新|财新|界面新聞|界面新闻|華爾街見聞|华尔街见闻|格隆匯|格隆汇|金十數據|金十数据|每日經濟|每日经济|21世紀|证券时报|證券時報|觀點網|观点网|中新社|經濟導報|经济导报|新民晚報|新民晚报|中國網|中国网|中國青年網|中国青年网|中國郵政|中国邮政|经济观察|財經雜誌|财经杂志|董事會|董事会/.test(n)) return 'cn_mainland';

  // 政府/监管
  if (/gov|政府|監管|监管|hkma|金管局|人民银行|人行|央行|證監會|证监会|银保监|銀保監|稅務|税务|統計|统计|統計處|统计局|廉政公署|ICAC|入境處|入境处|海關|海关|運輸署|运输署|機管局|机场管理局|港交所|聯交所|聯交所|trade\s*dev|經濟局|知识产权|知識產權|統計|廉政|食環署|環境局|機電署|水務署|路政署|土木工程署|屋宇署|消防處|消防处|醫管局|醫管局|康文署|康乐及文化事务署|政府|立法會|立法会|國會|国务院|ministry|museum|police|警務處|警务处/.test(n)) return 'government';

  // 学校/教育
  if (/university|college|school|大學|大学|學院|学院|中學|中学|小學|小学|教育|eduhk|hku|cuhk|hkust|polyu|cityu|baptist|lingnan|languages|學校|學校|書院|书院|學會|学会|研究所|研究院|centre|center|中心|基金會|基金会|基金|慈善|公益|協會|协会|商會|商会|聯會|联会|工會|工会|青年會|青年会|同鄉|宗親|体育|體育|音樂|音乐|藝術|艺术|舞蹈|戏剧|戲劇|電影|电影|攝影|摄影|設計|设计|建築|建筑|陶瓷|書法|文学|文学|詩|诗|畫|画|戲劇|粤劇|粵劇|音乐剧/.test(n)) return 'education';

  // 电视/广播
  if (/radio|radio\.tv|電台|广播|廣播|收音|tvb|now\s*news|nowtv|rthk|rtv|atv|ctv|comm|metro\s*broadcast|metropop|am730|凤凰卫视|鳳凰衛視|有線|有线|無綫|無綫|无线|收费电视|收費電視|channels?\s*\d|凤凰|凤凰卫视|鳳凰|now\s*tv|now\s*財經|now\s*财经|now\s*生活|now\s*旅遊|now\s*旅游|now\s*健康|now\s*fm|ntv|rthk\s*\d|am\s*730|fm\s*\d|-channel/.test(n)) return 'tv_radio';

  // 通讯社
  if (/wire|agency|通訊社|通讯社|news\s*service|news\s*agency|\bcna\b|reuters|路透|bloomberg|彭博|ap\s*news|美聯社|美联社|xinhua|新華|新華社|通訊|通讯|法新社|安新社|中央社|中新社/.test(n)) return 'news_agency';

  // 财经/专业
  if (/finance|financial|economy|economic|market|markets|stock|invest|bank|wealth|money|trading|forex|bond|fund|etf|股票|證券|证券|財富|财富|基金|銀行|银行|保險|保险|期貨|期货|外匯|外汇|債券|债券|asset|assets|property|real\s*estate|地產|地产|地产|wealth\s*management|private\s*banking|私人銀行|私人银行|commercial|商業|商业|信用卡|credit\s*card|支付|payment|fintech|金融科技|crypto|加密|數字資產|数字资产|lending|貸款|贷款|mortgage|按揭|insurance|投資|投资|funds|資本|资本|ipo|上市|招股|私募|pe\b|vc\b|VC|創投|startup|新創|新创|financing|融資|融资|insurtech/.test(n)) return 'hk_business';

  // 社区/地方
  if (/neighbourhood|neighborhood|community|社區|社区|地區|地區|九龍|香港仔|沙田|屯門|元朗|荃灣|葵青|將軍澳|北角|旺角|尖沙咀|銅鑼灣|觀塘|大埔|荃灣|西貢|離島|東區|南區|北區|中西區|灣仔|油尖旺|九龍城|深水埗|黃大仙|觀塘區|東區區|中西區區|南區區|北區區/.test(n)) return 'community';

  // 网媒/数字媒体
  if (/blog|blogspot|wordpress|medium|substack|youtube|facebook|instagram|linkedin|twitter|tiktok|weibo|微博|小紅書|小红书|貼圖|贴图|貼圖|论坛|論壇|forum|community|社交|社群|在線|在线|online|daily|日報|日报|新聞|新闻|news|media|媒體|传媒|傳媒|评论|評論|评论|周报|週報|周刊|週刊|杂志|雜誌|副刊|專欄|专栏|特寫|特写|深度|报道|報道|报道/.test(n)) return 'hk_business';

  // 默认
  return lang === 'ENG' ? 'hk_en' : 'hk_print';
}

// ===== 域名提取 =====
// 从名称中提取域名（如 "hk.on.cc"、"epaper.hkct.com"）
function extractDomain(name) {
  const m = name.match(/([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}(\.[a-z]{2,3})?(?:\/[^\s]*)?/i);
  if (m) {
    let d = m[0].toLowerCase();
    // 排除明显的非域名
    if (/^(com|com\.com|org|net|www)$/.test(d)) return '';
    return d;
  }
  return '';
}

// ===== RSS地址候选 =====
// 为已知主流源预置RSS
const KNOWN_RSS = {
  '明報': 'https://news.mingpao.com/rss/pns/s00001.xml',
  '明報·經濟': 'https://news.mingpao.com/rss/pns/s00004.xml',
  '星島日報': 'https://std.stheadline.com/rss/finance',
  '東方日報': 'https://hk.on.cc/hk/bundle/cnt_newsstock.xml',
  'on.cc': 'https://hk.on.cc/hk/bundle/cnt_newsstock.xml',
  '經濟日報': 'https://www.hkej.com/rss/onlinenews.xml',
  '信報財經新聞': 'https://rss.hkej.com/finance.xml',
  '大公報': 'https://www.takungpao.com/rss/finance.xml',
  '文匯報': 'https://www.wenweipo.com/rss/finance.xml',
  '香港經濟日報': 'https://www.hket.com/rss/china.xml',
  '南華早報': 'https://www.scmp.com/rss/91/feed',
  '香港01': 'https://www.hk01.com/rss',
  'Now新聞': 'https://news.now.com/rss',
  '香港電台': 'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml',
  '中國新聞社': 'https://www.chinanews.com.cn/rss/finance.xml',
  '中新網': 'https://www.chinanews.com.cn/rss/scroll-news.xml',
  '新浪財經': 'https://rss.sina.com.cn/roll/finance/hot_roll.xml',
  '搜狐財經': 'https://rss.sohu.com/finance',
  '每日經濟新聞': 'https://www.nbd.com.cn/rss/finance.xml',
  '華爾街見聞': 'https://api.wallstreetcn.com/apiv1/content/rss',
  '阿斯達克': 'https://www.aastocks.com/rss/news.aspx?type=1',
  '經濟通': 'https://www.etnet.com.hk/www/tc/news/rss.php',
  '鉅亨網': 'https://news.anue.com.tw/rss/news.xml',
  '工商時報': 'https://news.ctimes.com/rss/finance.xml',
  '中國日報': 'http://www.chinadaily.com.cn/rss/china_rss.xml',
  'VOA': 'https://www.voachinese.com/api/zq$omekvi_',
  'RFA': 'https://www.rfa.org/mandarin/rss2.xml',
  'DW': 'https://rss.dw.com/rdf/rss-chi-all',
  'France 24': 'https://www.france24.com/zh/rss',
  'NYT中文網': 'https://cn.nytimes.com/rss/',
  'The Standard': 'https://www.thestandard.com.hk/rss',
  'Hong Kong Free Press': 'https://hongkongfp.com/feed/',
  'Time Out HK': 'https://www.timeout.com/hong-kong/feed/',
  'Ocean Times': 'https://www.oceantimes.net/feed/',
  'ESPN': 'https://www.espn.com/espn/rss/news',
  'Financial Times': 'https://www.ft.com/rss/home',
  'The Guardian': 'https://www.theguardian.com/world/rss',
  'BBC News': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'Sky News': 'https://feeds.skynews.com/feeds/rss/world.xml',
  'Channel News Asia': 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
  'The Daily Telegraph': 'https://www.telegraph.co.uk/rss.xml',
  'RTHK English': 'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_elocal.xml',
  'Mumbrella': 'https://mumbrella.news/feed/',
  '中央社': 'https://feeds.feedburner.com/rsscna/mainland',
  'HKFP Finance': 'https://hongkongfp.com/finance/feed/',
  'The Korea Herald': 'https://www.koreaherald.com/rss/newsAll.xml',
  'The Korea Times': 'https://www.koreatimes.co.kr/www2/common/rss.xml',
  'Japan Times': 'https://www.japantimes.co.jp/feed/',
  'Straits Times': 'https://www.straitstimes.com/news/world/rss.xml',
  'Sputnik': 'https://sputniknews.cn/export/rss2/archive/index.xml',
  'Times of India': 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  'Hindustan Times': 'https://www.hindustantimes.com/feeds/rss/rssfeed_topstories.aspx',
  'The Hindu': 'https://www.thehindu.com/news/feeder/default.rss',
  'NDTV': 'https://feeds.feedburner.com/ndtvnews-latest',
  'The Indian Express': 'https://indianexpress.com/section/news/feed/',
  'Business Standard': 'https://www.business-standard.com/rss/economy-102.rss',
  'Moneycontrol': 'https://www.moneycontrol.com/rss/latestnews.xml',
  'ET Now': 'https://economictimes.indiatimes.com/rssfeedstopstories.cms',
  'Rappler': 'https://www.rappler.com/feed/',
  'Manila Bulletin': 'https://mb.com.ph/feed/',
  'Philippine Daily Inquirer': 'https://newsinfo.inquirer.net/feed',
  'The Nation': 'https://www.nation.africa/kenya/rss.xml',
  'Daily Nation': 'https://nation.africa/kenya/rss.xml',
  'The EastAfrican': 'https://www.theeastafrican.co.ke/rss.xml',
  'News24': 'https://www.news24.com/rss',
  'Times Live': 'https://www.timeslive.co.za/rss/',
  'Mail & Guardian': 'https://mg.co.za/section/south-africa/news/feed/',
  'City Press': 'https://www.citypress.co.za/rss/',
  'CNA': 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
  'Coconuts': 'https://coconuts.co/feed/',
  'FMT': 'https://fmt.my/feed/',
  'NST Malaysia': 'https://www.nst.com.my/rss',
  'The Star Malaysia': 'https://www.thestar.com.my/rss/News/Nation',
  'Sin Chew': 'https://www.sinchew.com.my/?rss',
  'Oriental Daily': 'https://hk.on.cc/hk/bundle/cnt_newsstock.xml',
  'The Edge Markets': 'https://theedgemalaysia.com/rss',
  'LHB': 'https://lhb.com.my/feed/',
  'Freemalaysiatoday': 'https://www.freemalaysiatoday.com/feed/',
  'Rocket': 'https://www.rocket.com.my/feed/',
  'pocketnow': 'https://pocketnow.my/feed/',
  'lowyat': 'https://lowyat.net/feed/',
  'soyacincau': 'https://soyacincau.com/feed/',
  'Skool': 'https://soyacincau.com/feed/',
  'The Nut Graph': 'https://www.thenutgraph.com/feed/',
  'Charming Malaysia': 'https://www.charmingmalaysia.com/feed/',
  'VOCKET': 'https://www.vocket.my/feed/',
  'Hypebeast': 'https://hypebeast.com/feed/',
  'Highsnobiety': 'https://www.highsnobiety.com/feed/',
  'Sneaker Freaker': 'https://sneakerfreaker.com/feed/',
  'Complex': 'https://www.complex.com/feed/',
  'HYPEBEAST': 'https://hypebeast.com/feed/',
  'BoF': 'https://www.businessoffashion.com/feed/',
  ' Vogue Business': 'https://www.voguebusiness.com/rss',
  'Fashion Network': 'https://ww.fashionnetwork.com/rss',
  'WWD': 'https://wwd.com/feed/',
  'FashionUnited': 'https://fashionunited.com/rss',
  'Just Style': 'https://www.just-style.com/feed/',
  'Apparel News': 'https://www.apparelnews.com/rss',
  'Sourcing Journal': 'https://www.sourcingjournal.com/feed/',
  'ELLE': 'https://www.elle.com/rss/all.xml/',
  'Vogue': 'https://www.vogue.com/feed/rss',
  'Harper’s Bazaar': 'https://www.harpersbazaar.com/rss',
  'GQ': 'https://www.gq.com/feed/rss',
  'Esquire': 'https://www.esquire.com/rss',
  'Men’s Health': 'https://www.menshealth.com/rss',
  'Marie Claire': 'https://www.marieclaire.com/rss',
  'Robb Report': 'https://robbreport.com/feed/',
  'Luxury Daily': 'https://luxurydaily.com/feed/',
  'Watches & Jewellery': 'https://www.watchesandjewellery.com/feed/',
  'Retail Asia': 'https://www.retail.asia/feed/',
  'Inside Retail': 'https://insideretail.com.au/feed/',
  'Retail World': 'https://www.retailworld.co.nz/feed/',
  'Talking Retail': 'https://talkingretail.com/feed/',
  'Retail Gazette': 'https://www.retailgazette.co.uk/feed/',
  'Retail Gazette Asia': 'https://www.retailgazette.asia/feed/',
  'Retail News': 'https://www.retailnews.asia/feed/',
  'Progressive Retail': 'https://www.progressiveretail.com/feed/',
  'Just Food': 'https://www.just-food.com/feed/',
  'The Grocer': 'https://www.thegrocer.co.uk/feed',
  'Kantar': 'https://www.kantar.com/rss',
  'Marketing Week': 'https://www.marketingweek.com/feed/',
  'Marketing Dive': 'https://www.marketingdive.com/feeds/news/',
  'Digiday': 'https://digiday.com/feed/',
  'Adweek': 'https://www.adweek.com/feed/',
  'AdExchanger': 'https://www.adexchanger.com/feed/',
  'Campaign Asia': 'https://www.campaignasia.com/rss',
  'MediaPost': 'https://www.mediapost.com/feed/',
  'Ad Age': 'https://www.adage.com/rss',
  'The Drum': 'https://www.thedrum.com/rss',
  'Campaign': 'https://www.campaignlive.co.uk/rss',
  'Marketing Magazine': 'https://www.marketingmagazine.com/rss',
  'WARC': 'https://www.warc.com/rss',
  'Think with Google': 'https://www.thinkwithgoogle.com/rss/',
  'HubSpot': 'https://blog.hubspot.com/marketing/rss.xml',
  'Moz': 'https://moz.com/blog/rss.xml',
  'Search Engine Land': 'https://searchengineland.com/feed',
  'Search Engine Journal': 'https://www.searchenginejournal.com/feed',
  'Social Media Today': 'https://www.socialmediatoday.com/feeds/news/',
  'Mashable': 'https://mashable.com/feed',
  'TechCrunch': 'https://techcrunch.com/feed/',
  'The Verge': 'https://www.theverge.com/rss/index.xml',
  'Engadget': 'https://www.engadget.com/rss.xml',
  'Wired': 'https://www.wired.com/feed/rss',
  'Ars Technica': 'https://feeds.arstechnica.com/arstechnica/index',
  'Gizmodo': 'https://gizmodo.com/rss',
  'Lifehacker': 'https://lifehacker.com/feed/rss',
  'Mashable HK': 'https://mashable.com/feed',
  'HYPEBEAST HK': 'https://hypebeast.com/feed',
  'PR Newswire': 'https://www.prnewswire.com/rss/news-releases-list.rss',
  'Business Wire': 'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRXQ==',
  'Yahoo Finance': 'https://finance.yahoo.com/news/rssindex',
  'MarketWatch': 'https://feeds.marketwatch.com/marketwatch/topstories/',
  'CNBC': 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  'Forbes': 'https://www.forbes.com/forbesapi/search/more.json?query=news',
  'Business Insider': 'https://markets.businessinsider.com/rss/news',
  'Seeking Alpha': 'https://seekingalpha.com/market_currents.xml',
  'Investing.com': 'https://www.investing.com/rss/news.rss',
  'The Economist': 'https://www.economist.com/finance-and-economics/rss.xml',
  'Nikkei Asia': 'https://asia.nikkei.com/rss/feed/nar',
  'SCMP Business': 'https://www.scmp.com/rss/92/feed',
  'Asia Sentinel': 'https://www.asiasentinel.com/feed/',
  'Focus Taiwan': 'https://focustaiwan.tw/rss/all',
  'Taipei Times': 'https://www.taipeitimes.com/xml/index.rss',
  'Taiwan News': 'https://www.taiwannews.com.tw/rss/all',
  'Want Want China': 'https://www.wantwant.com.cn/rss',
  'The Standard HK': 'https://www.thestandard.com.hk/rss',
  'TVB': 'https://news.tvb.com/rss',
  'RTHK': 'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml',
  'AM730': 'https://www.am730.com.hk/rss',
  'Metro Broadcast': 'https://www.metropop.com/rss',
  'Phoenix TV': 'https://news.ifeng.com/rss',
  'Times TV': 'https://www.timstv.hk/rss',
  'Cable News': 'https://www.cable-news.com.hk/rss',
  'HK01': 'https://www.hk01.com/rss',
  'Economic Journal': 'https://www.hkej.com/rss/onlinenews.xml',
  'Oriental Daily News': 'https://hk.on.cc/hk/bundle/cnt_newsstock.xml',
  'Topick HK': 'https://topick.hket.com/srat/feed',
  'UHK': 'https://www.uhk.com.hk/rss',
  'AM Finance': 'https://www.am730.com.hk/rss',
  'Money18': 'https://money18.on.cc/rss',
  'Now Business': 'https://news.now.com/rss/finance',
  'Guardian HK': 'https://www.scmp.com/rss/91/feed',
  'Business Times': 'https://www.businesstimes.com.sg/rss',
  'The Business Times': 'https://www.businesstimes.com.sg/rss',
  'Singapore Business Review': 'https://sbr.com.sg/feed/',
  'The Online Citizen': 'https://www.theonlinecitizen.com/feed/',
  'TODAY': 'https://www.todayonline.com/feed/rss',
  'Mothership': 'https://mothership.sg/feed/',
  'The Independent Singapore': 'https://www.independent.co.sg/feed',
  'New Narrows': 'https://new Narrows.com/feed/',
  'WorthIt': 'https://worthit.sg/feed/',
  'Setanta Sports': 'https://www.setantasports.com/feed/',
  'Goal.com': 'https://www.goal.com/feeds/en/news',
  'ESPN HK': 'https://www.espn.com/espn/rss/news',
  'Sky Sports': 'https://www.skysports.com/rss/12040',
  'BBC': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'Reuters World': 'https://feeds.reuters.com/reuters/topNews',
  'CNA Lifestyle': 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
  'Korea JoongAng Daily': 'https://koreajoongangdaily.joins.com/rss',
  'Korea Herald': 'https://www.koreaherald.com/rss/newsAll.xml',
  'Yonhap': 'https://en.yna.co.kr/RSS/economy.xml',
  'Japan Today': 'https://japantoday.live/feed/',
  'Sana': 'https://www.sana.ph/rss',
  'Philstar': 'https://www.philstar.com/rss',
  'Manila Standard': 'https://manilastandard.net/feed/',
  'Malaya Business Insight': 'https://mb.com.ph/feed/',
  'BusinessWorld': 'https://businessworld.inquirer.net/feed',
  'BusinessMirror': 'https://businessmirror.com.ph/feed/',
  'The Edge': 'https://theedgemalaysia.com/rss',
  'The Malaysian Reserve': 'https://themalaysianreserve.com/feed/',
  'The Sun Malaysia': 'https://thesun.my/feed/',
  'Sin Chew Daily': 'https://www.sinchew.com.my/feed',
  'Oriental Daily Malaysia': 'https://www.orientaldaily.com.my/feed',
  'China Press': 'https://www.chinapress.com.my/feed',
  'Guang Ming': 'https://www.kwongming.com.my/feed/',
  'The Nation (THB)': 'https://www.nationthailand.com/rss',
  'Bangkok Post': 'https://www.bangkokpost.com/rss/data/most-recent.xml',
  'Krungthep Turakij': 'https://krungthepturakij.com/feed',
  'Vietnam News': 'https://vietnamnews.vn/rss/news.rss',
  'VnExpress': 'https://e.vnexpress.net/rss/news.rss',
  'The Star': 'https://www.thestar.com.my/feed',
  'AsiaOne': 'https://www.asiaone.com/rss',
  'The Diplomat': 'https://thediplomat.com/feed/',
  'South China Morning Post': 'https://www.scmp.com/rss/91/feed',
  'China Daily': 'http://www.chinadaily.com.cn/rss/china_rss.xml',
  'Global Times': 'https://www.globaltimes.cn/rss/outbrain.xml',
  'Xinhua': 'https://www.news.cn/politics/news_politics.xml',
  'People’s Daily': 'http://www.people.com.cn/rss/politics.xml',
  'CCTV': 'https://news.cctv.com/rss/china.xml',
  'Caixin': 'https://www.caixin.com/rss/all.xml',
  'Yicai': 'https://www.yicai.com/rss/news.xml',
  'Jiemian': 'https://www.jiemian.com/rss.xml',
  '第一財經': 'https://www.yicai.com/rss/news.xml',
  '21世紀經濟報道': 'https://www.21jingji.com/rss',
  '證券時報': 'https://www.stcn.com/rss/news.xml',
  '經濟日報(中國)': 'https://www.ce.cn/rss/xwzx.xml',
  'BBC中文': 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml',
  'DW中文': 'https://rss.dw.com/rdf/rss-chi-all',
  'RFI中文': 'https://www.rfi.fr/cn/rss',
  '纽约时报中文网': 'https://cn.nytimes.com/rss/',
  'Times of India TV': 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  'Al Jazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
  'CNN': 'http://rss.cnn.com/rss/edition.rss',
  'NBC News': 'https://feeds.nbcnews.com/nbcnews/public/news',
  'ABC News': 'https://www.abc.net.au/news/feed/51120/rss.xml',
  'CBS News': 'https://www.cbsnews.com/latest/rss/main',
  'NPR': 'https://feeds.npr.org/1001/rss.xml',
  'HuffPost': 'https://www.huffpost.com/section/news/feed',
  'Politico': 'https://rss.politico.com/politics-news.xml',
  'The Hill': 'https://thehill.com/news/feed/',
  'Vox': 'https://www.vox.com/rss/index.xml',
  'Axios': 'https://api.axios.com/feed/',
  'FiveThirtyEight': 'https://fivethirtyeight.com/feed/',
  'Bloomberg Technology': 'https://feeds.bloomberg.com/technology/news.rss',
  'MIT Technology Review': 'https://www.technologyreview.com/feed/',
  'TechCrunch HK': 'https://techcrunch.com/feed/',
  'Hacker News': 'https://hnrss.org/frontpage',
  'Product Hunt': 'https://www.producthunt.com/feed',
  'BetaKit': 'https://betakit.com/feed/',
  'Kr-Asia': 'https://kr-asia.com/feed/',
  'Tech in Asia': 'https://www.techinasia.com/feed',
  'DealStreetAsia': 'https://www.dealstreetasia.com/feed',
  'e27': 'https://e27.co/feed/',
  'KrAsia': 'https://kr-asia.com/feed/',
  'Mumbrella HK': 'https://mumbrella.news/feed/',
  'The Sports Net': 'https://www.sportsnet.com.au/feed/',
  'AFP': 'https://www.afp.com/en/rss',
  'Knight Frank': 'https://www.knightfrank.com/rss',
  'CBRE': 'https://www.cbre.com/feed',
  'Cushman & Wakefield': 'https://www.cushmanwakefield.com/en/rss',
  'JLL': 'https://www.jll.com/en/trends-and-insights/rss',
  'Colliers': 'https://www.colliers.com/en/news/rss',
  'Savills': 'https://www.savills.com/rss',
  'Cochrane': 'https://www.cochranechina.com/feed/',
  'KPMG China': 'https://kpmg.com/cn/zh/home/insights.html.rss',
  'PwC China': 'https://www.pwchk.com/en/press-room/press-releases.rss',
  'Deloitte China': 'https://www2.deloitte.com/cn/zh/pages/home.xml',
  'EY China': 'https://www.ey.com/zh_cn/newsroom/rss',
  'AICPA': 'https://www.aicpa.org/news.rss',
  'ACCA': 'https://www.acca.com/feed/',
  'HKEX': 'https://www.hkex.com.hk/News/News-Release/rss',
  'SFC': 'https://www.sfc.hk/en/News-and-announcements/Policy-statements-and-announcements/rss',
  'The Banker': 'https://www.thebanker.com/rss',
  'Asian Banker': 'https://www.asianbanker.com/rss',
  'Banking Asia': 'https://www.banking.asia/feed/',
  'Fintech News': 'https://www.finextra.com/rss/headlines.aspx',
  'Finextra': 'https://www.finextra.com/rss/headlines.aspx',
  'Finextra Chinese': 'https://www.finextra.cn/rss/headlines.aspx',
  'Banking Dive': 'https://www.bankingdive.com/feeds/news/',
  'Retail Banking': 'https://www.retailbanking.com/feed',
  'Bank Automation': 'https://www.bankautomation.com/feed/',
  'American Banker': 'https://www.americanbanker.com/rss',
  'Banking News': 'https://www.bankingnews.com/feed/',
  'PaymentsSource': 'https://www.paymentssource.com/rss',
  'Finextra HK': 'https://www.finextra.com/rss/headlines.aspx',
};

// ===== 构建结果 =====
const CATEGORY_LABELS = {
  hk_print: '香港中文纸媒',
  hk_en: '香港英文媒体',
  hk_business: '财经/专业网媒',
  cn_mainland: '内地媒体',
  tv_radio: '电视/广播/通讯社',
  news_agency: '通讯社',
  government: '政府/监管机构',
  education: '学校/教育机构',
  community: '社区/地方媒体',
  other: '其他',
};

const sources = all.map(item => {
  const name = item.name.trim();
  const lang = item.lang === 'ENG' ? 'ENG' : 'CH';
  const domain = extractDomain(name);
  const cat = classifyCategory(name, lang, domain);

  // 尝试匹配已知RSS
  let rss = '';
  for (const [key, url] of Object.entries(KNOWN_RSS)) {
    if (name.includes(key)) { rss = url; break; }
  }

  return {
    no: item.no,
    name: name,
    lang: lang,
    cat: cat,
    domain: domain,
    rss: rss,
    site: domain ? (domain.startsWith('http') ? domain : 'https://' + domain) : '',
  };
});

// 统计
const stats = {
  total: sources.length,
  by_lang: {},
  by_cat: {},
  with_rss: sources.filter(s => s.rss).length,
  with_domain: sources.filter(s => s.domain).length,
};

for (const s of sources) {
  stats.by_lang[s.lang] = (stats.by_lang[s.lang] || 0) + 1;
  stats.by_cat[s.cat] = (stats.by_cat[s.cat] || 0) + 1;
}

const output = {
  meta: {
    version: '2.0',
    updated: '2026-11-13',
    note: '完整 WiseNews 订阅清单，源自5批扫描件（编号1-4189）',
    org: '创兴银行 企业传讯处',
    total_extracted: sources.length,
    watch_terms: [
      '创兴银行', '創興銀行', '创興銀行', 'Chong Hing Bank', 'Chong Hing',
      '創興', '创兴', 'CHB', '廖創興', '廖创兴', 'chbank'
    ],
    category_labels: CATEGORY_LABELS,
  },
  stats: stats,
  sources: sources,
};

fs.writeFileSync(path.join(DATA_DIR, 'sources_full.json'), JSON.stringify(output, null, 2));

console.log('=== 媒体源数据库构建完成 ===');
console.log('总数:', stats.total);
console.log('语言分布:', JSON.stringify(stats.by_lang));
console.log('类别分布:');
for (const [k, v] of Object.entries(stats.by_cat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${CATEGORY_LABELS[k] || k}: ${v}`);
}
console.log('有RSS地址:', stats.with_rss);
console.log('有域名:', stats.with_domain);
