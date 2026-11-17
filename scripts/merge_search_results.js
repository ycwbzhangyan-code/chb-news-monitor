/**
 * 合并三轮AI搜索结果 + RSS采集结果，生成完整研报
 * 更新到新闻监测系统的数据中
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const crypto = require('crypto');

// 读取现有数据
const existingNews = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'news_items.json'), 'utf8'));
console.log(`现有新闻: ${existingNews.length}条`);

// 三轮搜索汇总的所有新闻（去重前的全量列表）
const allSearchResults = [
  // === 第一轮搜索结果 ===
  {
    title: '创兴银行参与"香港国际海岸清洁运动2026" 以实际行动守护海洋环境',
    link: 'https://chbank.com/sc/personal/footer/about-ch-bank/media-releases/index.shtml',
    date: '2026-11-05',
    source: '创兴银行官网',
    summary: '创兴银行有限公司积极履行企业社会责任，将ESG理念融入企业文化及社区服务。为支持可持续发展，本行近日组织银行义工及其亲友于10月31日前往石澳后滩，参与由环保促进会统筹的"香港国际海岸清洁运动2026"。义工收集的垃圾包括即弃餐具、塑料饮管、塑料袋、发泡胶、玻璃碎片、渔网及铁枝等，并记录数据交予环保促进会作海洋保育研究。自2017年以来，本行累计举办逾100场公益活动，员工参与人次超过2,500场次，志愿服务时数突破7,000小时。未来本行将深化ESG战略，推动绿色金融与可持续投资，扩大"金融+公益"生态圈。',
    tier_hint: 'B',
  },
  {
    title: '香农芯创关于为全资子公司提供担保及接受关联方提供担保暨关联交易的进展公告',
    link: 'https://finance.sina.cn/2026-11-06/detail-inixtnvq5785301.d.html',
    date: '2026-11-06',
    source: '新浪财经/上海证券报',
    summary: '香农芯创科技股份有限公司（证券代码：300475）发布公告编号2026-102的担保进展公告。公司全资子公司新联芯（深圳市新联芯存储科技有限公司）此前在创兴银行有限公司深圳分行申请人民币5,000万元借款额度，由公司、黄泽伟先生及彭红女士提供连带责任保证。近日，由于新联芯向创兴银行申请的借款额度增加至人民币1亿元，各方重新签署了《最高额保证合同》，将担保金额从5,000万元提升至人民币1亿元整，保证方式为连带责任保证，保证期间为主合同项下债务履行期限届满之日起三年。',
    tier_hint: 'B',
  },
  {
    title: '创兴银行有限公司横琴粤澳深度合作区支行司机服务采购结果公告',
    link: 'https://www.qianlima.com/common/agents_info.jsp?id=3115812',
    date: '2026-11-10',
    source: '千里马招标网',
    summary: '创兴银行有限公司横琴粤澳深度合作区支行发布司机服务采购结果公告，公告日期为2026年11月10日。该采购项目为创兴银行横琴粤澳深度合作区支行的日常运营配套服务采购，涉及支行司机外包服务。此前该支行曾于2025年12月发布司机外包服务采购结果公告，本次为新一轮采购周期。创兴银行横琴支行成立于2016年，位于广东省珠海市，注册资本1000万元，参与招投标项目23次，拥有行政许可10个。',
    tier_hint: 'C',
  },
  {
    title: '越秀集团发行8亿元超短期融资券 利率1.38%',
    link: 'https://baijiahao.baidu.com/s?id=1881549223483306591&wfr=spider&for=pc',
    date: '2026-11-11',
    source: '观点网/百家号',
    summary: '广州越秀集团股份有限公司披露2026年度第七期超短期融资券发行情况。该期债券简称"26越秀SCP007"，债券代码012682614，发行总额8亿元，已于11月10日起息，期限8个月，适用年利率1.38%，兑付日为2027年8月6日。合规申购家数8家，合规申购金额17.8亿元。越秀集团为创兴银行的母公司，于2021年9月完成对创兴银行的私有化程序，创兴银行现为越秀集团全资附属公司。越秀集团截至2025年12月31日财务口径资产总额达10,596亿元人民币，位列"中国企业500强"第209位。',
    tier_hint: 'B',
  },
  {
    title: '广州越秀集团2026年度第八期超短期融资券续发募集说明书',
    link: 'https://file.finance.sina.com.cn/211.154.219.97:9494/MRGG/BOND/2026/2026-11/2026-11-10/25479194.PDF',
    date: '2026-11-10',
    source: '新浪财经（债券公告）',
    summary: '广州越秀集团股份有限公司发布2026年度第八期超短期融资券续发募集说明书，本次注册金额人民币200亿元，本期发行金额8亿元，发行期限270天，无信用增进。牵头主承销商为华夏银行股份有限公司，联席主承销商为恒丰银行股份有限公司。越秀集团是创兴银行的母公司，创兴银行作为越秀集团金融板块的重要组成部分，与越秀资本共同构成越秀集团境内外两大金融业务平台。',
    tier_hint: 'C',
  },
  {
    title: '广州越秀集团SCP002将于2026年11月17日进行付息兑付',
    link: 'https://www.cnfin.com/kx/detail/20261110/4493466_1.html',
    date: '2026-11-10',
    source: '中国金融信息网/新华财经',
    summary: '广州越秀集团股份有限公司发布公告称，"26越秀集团SCP002"将于2026年11月17日进行付息兑付。该债券发行总额为10亿元，债券期限为0.5918年。越秀集团为创兴银行母公司，其融资活动与创兴银行作为旗下金融板块重要组成密切相关。',
    tier_hint: 'C',
  },
  // === 第三轮补充发现 ===
  {
    title: '香农芯创担保进展公告（中国证券报版）',
    link: 'https://epaper.cs.com.cn/zgzqb/html/2026-11/06/nw.D110000zgzqb_20261106_4-B028.htm',
    date: '2026-11-06',
    source: '中国证券报',
    summary: '中国证券报刊载的香农芯创（300475）公告编号2026-102担保进展公告。核心内容：新联芯向创兴银行有限公司深圳分行申请的借款额度由5,000万元增至人民币1亿元，公司、黄泽伟先生及彭红女士分别与创兴银行签署新的《最高额保证合同》，提供最高本金额为人民币1亿元的连带责任保证。保证期间为主合同项下债务履行期限届满之日起三年。公告备查文件第3项为新联芯与创兴银行签订的《流动资金贷款借款合同》，第4项为公司及关联方与创兴银行签订的《最高额保证合同》。',
    tier_hint: 'B',
  },
  {
    title: '香农芯创担保进展公告（上海证券报版）',
    link: 'https://paper.cnstock.com/html/2026-11/06/content_2287831.htm',
    date: '2026-11-06',
    source: '上海证券报/中国证券网',
    summary: '与新浪财经转载同一公告的上海证券报官方版本。香农芯创（300475）公告编号2026-102，详细披露了涉及创兴银行有限公司深圳分行的担保进展：新联芯向创兴银行申请的借款额度由此前的5,000万元增加至人民币1亿元，公司及关联方黄泽伟、彭红分别与创兴银行签署新的《最高额保证合同》。公告同时披露公司还为新联芯向厦门国际银行、富融银行、东亚银行等机构申请的授信提供担保，累计为子公司担保合同金额达160.31亿元。',
    tier_hint: 'B',
  },
  {
    title: '香农芯创担保进展公告（百家号版，11月5日发布）',
    link: 'https://baijiahao.baidu.com/s?id=1881044309843300813&wfr=spider&for=pc',
    date: '2026-11-05',
    source: '百家号/百度',
    summary: '百家号转载的香农芯创担保进展公告摘要。内容涉及公司全资子公司新联芯在创兴银行有限公司深圳分行申请的人民币5,000万元借款额度，现增加至人民币1亿元，公司、黄泽伟先生及彭红女士为此提供最高本金额为人民币1亿元的连带责任保证。该公告编号为2026-102，公告日期为2026年11月5日。',
    tier_hint: 'B',
  },
  {
    title: '创兴银行横琴粤澳深度合作区支行法定代表人信息更新',
    link: 'https://aiqicha.baidu.com/human_lTM-TogKuTw4wEbDCwLQ6Em2AhjgHa0b8HhVUuPPCcW',
    date: '2026-11-01',
    source: '爱企查/百度',
    summary: '爱企查显示，创兴银行有限公司横琴粤澳深度合作区支行的法定代表人/高管信息于2026年11月1日更新。赵炜担任创兴银行有限公司横琴粤澳深度合作区支行法定代表人。该支行前身为创兴银行有限公司广东自贸试验区横琴支行，成立于2016年，位于广东省珠海市横琴粤澳深度合作区，是创兴银行在内地的重要分支机构之一。',
    tier_hint: 'C',
  },
  {
    title: '创兴银行横琴粤澳深度合作区支行企业信息更新',
    link: 'https://www.qichacha.com/firm_f7ac2b86c0253a3971eb96c51444d9f6.html',
    date: '2026-10-26',
    source: '企查查',
    summary: '企查查显示创兴银行有限公司横琴粤澳深度合作区支行的最新动态：2026年9月29日发布清洁服务采购中标公告，2026年8月20日发布安保服务采购中标公告，2025年12月16日发布司机外包服务采购中标公告。该支行成立于2016年，是创兴银行在横琴粤澳深度合作区设立的重要分支机构。',
    tier_hint: 'C',
  },
  {
    title: '创兴银行横琴粤澳深度合作区支行企业信息',
    link: 'https://www.tianyancha.com/company/2459093756',
    date: '2026-11-02',
    source: '天眼查',
    summary: '天眼查显示创兴银行有限公司横琴粤澳深度合作区支行的企业信息于2026年11月2日更新。该支行曾用名为创兴银行有限公司广东自贸试验区横琴支行，成立于2016年。创兴银行于2014年成为越秀集团成员，2021年完成私有化后退市，现为越秀集团全资附属公司。',
    tier_hint: 'C',
  },
  {
    title: '创兴银行深圳分行招聘信息更新',
    link: 'https://m.liepin.com/company/9496537/',
    date: '2026-11-03',
    source: '猎聘',
    summary: '猎聘平台显示创兴银行有限公司深圳分行于2026年11月3日更新招聘信息，正在招聘多个职位，包括银行公司业务客户经理（16-30k）、对公客户经理助理应届生岗位（8-12k）、支行负责人（35-65k，深圳南山区）、银行实习生公司业务方向（100-120元/天）等。深圳分行成立于2016年11月25日，位于深圳市南山区中国华润大厦。',
    tier_hint: 'C',
  },
];

// 去重函数
function normalizeTitle(title) {
  return (title || '')
    .replace(/\s+/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[｜|].*$/, '')
    .replace(/^.*[｜|]/, '')
    .replace(/（.*版.*）$/, '')
    .toLowerCase()
    .trim();
}

function hashTitle(title) {
  return crypto.createHash('sha1').update(normalizeTitle(title)).digest('hex');
}

// 现有标题的哈希集合
const existingHashes = new Set(existingNews.map(n => n.hash));
const existingPrefixes = existingNews.map(n => normalizeTitle(n.title).substring(0, 30));

// 去重
const newItems = [];
let dupCount = 0;

for (const item of allSearchResults) {
  const hash = hashTitle(item.title);
  if (existingHashes.has(hash)) {
    dupCount++;
    continue;
  }
  // 前30字二次匹配
  const prefix = normalizeTitle(item.title).substring(0, 30);
  if (prefix.length >= 5 && existingPrefixes.some(p => p === prefix)) {
    dupCount++;
    continue;
  }
  
  // 同源去重：同一公告在多个媒体发布，只保留最有价值的版本
  // 香农芯创公告在新浪、上证报、中证报、百家号四处发布——保留新浪(最早最全)和上证报(官方版)
  const isDuplicateOfAlreadyAdded = newItems.some(n => {
    const np = normalizeTitle(n.title).substring(0, 20);
    const ip = normalizeTitle(item.title).substring(0, 20);
    return np === ip && np.length >= 5;
  });
  if (isDuplicateOfAlreadyAdded) {
    dupCount++;
    continue;
  }
  
  newItems.push({
    hash,
    title: item.title,
    link: item.link,
    description: item.summary,
    source_id: 'ai_search',
    source_name: item.source,
    source_cat: item.source.includes('证券') || item.source.includes('财经') || item.source.includes('金融') ? 'cn_mainland' : 'hk_business',
    lang: 'CH',
    pub_date: item.date + 'T00:00:00+08:00',
    fetch_date: new Date().toISOString(),
    tier: item.tier_hint || 'C',
    tier_reason: 'AI深度搜索',
    status: 'active',
    ai_researched: 1,
    id: existingNews.length + newItems.length + 1,
    created_at: new Date().toISOString(),
  });
  
  existingHashes.add(hash);
  existingPrefixes.push(prefix);
}

console.log(`\n=== 搜索结果汇总 ===`);
console.log(`总搜索到: ${allSearchResults.length}条`);
console.log(`去重后新增: ${newItems.length}条`);
console.log(`重复排除: ${dupCount}条`);

// 合并到现有新闻
const allNews = [...existingNews, ...newItems];
fs.writeFileSync(path.join(DATA_DIR, 'news_items.json'), JSON.stringify(allNews, null, 2));
console.log(`\n数据库总量: ${allNews.length}条`);

// 按日期统计
const byDate = {};
for (const n of allNews) {
  const d = (n.pub_date || '').split('T')[0];
  if (!byDate[d]) byDate[d] = { total: 0, A: 0, B: 0, C: 0 };
  byDate[d].total++;
  if (byDate[d][n.tier] !== undefined) byDate[d][n.tier]++;
}
console.log('\n按日期分布:');
Object.entries(byDate).sort().forEach(([date, s]) => {
  if (date >= '2026-11-05' && date <= '2026-11-12') {
    console.log(`  ${date}: 共${s.total}条 (A:${s.A} B:${s.B} C:${s.C})`);
  }
});

// 按来源统计
const bySource = {};
for (const n of allNews) {
  bySource[n.source_name] = (bySource[n.source_name] || 0) + 1;
}
console.log('\n按来源分布:');
Object.entries(bySource).sort((a,b) => b[1] - a[1]).forEach(([src, cnt]) => {
  console.log(`  ${src}: ${cnt}条`);
});

// 重新生成报告
const { getReportForDate, saveDailyReport, getReportList } = require('../src/services/reportBuilder');
const { getStats } = require('../src/services/store');

console.log('\n=== 重新生成报告 ===');
for (let d = 5; d <= 12; d++) {
  const dateStr = `2026-11-${String(d).padStart(2, '0')}`;
  const report = getReportForDate(dateStr);
  if (report && report.stats.total > 0) {
    saveDailyReport(report);
    console.log(`  ${dateStr}: ${report.stats.total}条 (A:${report.stats.A} B:${report.stats.B} C:${report.stats.C})`);
  }
}

const stats = getStats();
console.log(`\n=== 最终统计 ===`);
console.log(`新闻总数: ${stats.total_items}`);
console.log(`报告数: ${stats.total_reports}`);
console.log(`最新日期: ${stats.latest_date}`);
console.log(`分级:`, stats.tier_breakdown);
