/**
 * 港媒理财/定存新闻聚合爬虫（候选发现器）
 *
 * 设计原则：
 * 1. 只做"候选发现"，绝不自动入库。所有候选必须核验后经 import_*.js 导入。
 * 2. 对标 Wiser 宽口径：定存/利率/汇率/税贷/按揭/理财比较类都发现，
 *    但必须命中"核心主题词"，单独的币种名（美元/人民幣等）不作为触发条件，
 *    否则会混入艺术品、AI硬件、黄金等非银行业新闻。
 * 3. 覆盖 Wiser 有而我方原来缺的小众媒体：e-zone、港生活、星島、
 *    巴士的報、香港01、CTgoodjobs、澳門日報、中財網、南方日報等。
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 核心主题词：必须命中其一才进入候选
const TOPIC_TERMS = [
  // 存款
  '定存', '定期存款', '港元定期', '美元定期', '澳元定存',
  '存款利率', '利率比較', '存款', '存息', '高息', '息率',
  // 利率走势
  '加息', '減息', '降息', '議息', '息口', '拆息', 'HIBOR', 'P按', '最優惠利率',
  // 外汇兑换（必须是汇率/兑换语境，不是单纯币种名）
  '匯率', '兌換', '外匯', '滙率', '找換', '匯價', '兌港元',
  // 贷款理财
  '稅貸', '稅務貸款', '按揭', '私人貸款',
  // 母公司/关联公司/评级（评级仅限惠譽等机构点名，避免券商目标价噪音）
  '越秀', '香港人壽', '創興銀行', '创兴银行', 'Chong Hing', '惠譽',
];

// 严格关键词 — 标题直接含创兴则B类
const STRICT_TERMS = ['创兴', '創興', 'Chong Hing', 'chbank'];

// 排除同名企业 / 明显噪音
const EXCLUDE_TERMS = ['廖創興企業', '廖创兴企业', '00194', '創興企業'];
const NOISE_TERMS = [
  '梵高', '偽鈔', '偽钞', '畫作', '画作', 'AI硬件', '黃金ETF',
  // 导航标签 / 栏目名（不是新闻）
  '理財智慧', '理財主頁', '收息攻略', '保險熱話', '定期存款 定期存款',
  '外匯／人民幣信而有證', '公司搜尋', '市場指標', '外匯黃金', '會訊',
  '俄烏開戰高息攻略', '黃金外匯每日必讀', '定期存款銀行外幣兌換',
  '港元匯率美元匯率', 'HIBOR走勢最優惠利率', '首席副總裁', '營運總監',
  // 券商评级/目标价类噪音（与创兴无关）
  '大行報告', '大行炒', '外資精點', '券商精點', '目標價', '目标价',
  '获得增持评级', '获买入评级', '获得推荐评级', '净利翻倍',
  // 非金融语境
  '民航', '航班', '機場', '客運',
];

// 目标站点（含分页参数）
const SITES = [
  // 原有核心源
  { id: 'hket', name: '香港經濟日報·理財', url: 'https://wealth.hket.com/', cat: 'hk_business' },
  { id: 'hket', name: '香港經濟日報', url: 'https://www.hket.com/', cat: 'hk_business' },
  { id: 'etnet', name: '經濟通', url: 'https://www.etnet.com.hk/www/tc/news/index.php', cat: 'hk_business' },
  { id: 'etnet', name: '經濟通·定期存款', url: 'https://www.etnet.com.hk/www/tc/news/categorized_news.php?category=fd', cat: 'hk_business' },
  { id: 'mingpao', name: '明報·財經', url: 'https://news.mingpao.com/pns/%E8%B2%A2%E7%B6%93%E6%97%A5%E5%A0%B1', cat: 'hk_print' },
  { id: 'stheadline', name: '星島頭條·財經', url: 'https://www.stheadline.com/finance', cat: 'hk_print' },
  { id: 'ulifestyle', name: 'U Lifestyle·理財', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1', cat: 'hk_lifestyle' },
  { id: 'ulifestyle', name: 'U Lifestyle·理財P2', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1?page=2', cat: 'hk_lifestyle' },
  { id: 'oncc', name: '東網 on.cc', url: 'https://hk.on.cc/hk/news/bc/fin/index.html', cat: 'hk_business' },
  { id: 'bastille', name: '巴士的報·財經', url: 'https://www.bastillepost.com/hongkong/finance', cat: 'hk_business' },

  // ---- Wiser 覆盖但我方原来完全缺失的媒体（本次新增） ----
  { id: 'stheadline_rss', name: '星島頭條·RSS', url: 'https://www.stheadline.com/rss', cat: 'hk_print', format: 'rss' },
  { id: 'hk01', name: '香港01', url: 'https://www.hk01.com/', cat: 'hk_business' },
  { id: 'ezone', name: 'e-zone', url: 'https://www.e-zone.com.hk/', cat: 'hk_tech' },
  { id: 'ctgoodjobs', name: 'CTgoodjobs', url: 'https://www.ctgoodjobs.hk/', cat: 'hk_jobs' },
  { id: 'ctgoodjobs_fin', name: 'CTgoodjobs·財經', url: 'https://finance.ctgoodjobs.hk/', cat: 'hk_jobs' },
  { id: 'macaodaily', name: '澳門日報', url: 'https://www.macaodaily.com/', cat: 'hk_print' },
  { id: 'hkliife', name: '港生活', url: 'https://www.hkliife.com/', cat: 'hk_lifestyle' },
  { id: 'cfi', name: '中財網', url: 'http://www.cfi.cn/', cat: 'cn_finance' },
  { id: 'nfnews', name: '南方日報/南方+', url: 'https://www.nfnews.com/', cat: 'cn_print' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh-CN;q=0.8,en;q=0.7',
};

async function fetchHTML(url, timeout = 15000) {
  try {
    const r = await fetch(url, { headers: HEADERS, timeout, follow: 4 });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    console.log(`  [ERR] ${url.substring(0, 50)}: ${e.message.substring(0, 60)}`);
    return null;
  }
}

function relevant(title) {
  if (!title || title.length < 8 || title.length > 160) return false;
  if (EXCLUDE_TERMS.some(t => title.includes(t))) return false;
  if (NOISE_TERMS.some(t => title.includes(t))) return false;
  return TOPIC_TERMS.some(t => title.includes(t));
}

function cleanTitle(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArticles(html, site) {
  const articles = [];
  const seen = new Set();

  function add(link, rawTitle, pubDate) {
    const title = cleanTitle(rawTitle);
    if (!relevant(title) || seen.has(title)) return;
    seen.add(title);
    if (link && link.startsWith('/')) {
      try { link = new URL(link, site.url).href; } catch (e) { link = site.url; }
    }
    if (link && !/^https?:\/\//i.test(link)) link = site.url;
    const isStrict = STRICT_TERMS.some(t => title.includes(t));
    articles.push({
      title,
      link: link || site.url,
      pubDate,
      source_name: site.name,
      source_cat: site.cat,
      source_id: site.id,
      tier: isStrict ? 'B' : 'C',
    });
  }

  // RSS / Atom
  if (site.format === 'rss' || /<rss|<feed/i.test(html)) {
    for (const m of html.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
      const block = m[0];
      const t = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
      const l = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1];
      const d = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1];
      if (t) add(cleanTitle(l), t, d || undefined);
    }
  }

  // 通用 <a href>锚文本 —— 覆盖 e-zone / hk01 / ctgoodjobs / cfi / nfnews / bastille
  const anchorRe = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{8,220}?)<\/a>/gi;
  let am;
  while ((am = anchorRe.exec(html)) !== null) {
    const href = am[1];
    const text = am[2];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    if (/[{}]/.test(text) || /^\s*-->/.test(cleanTitle(text))) continue; // 跳过CSS注释
    const title = cleanTitle(text);
    const chinese = (title.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chinese < 6) continue; // 必须是中文新闻标题
    add(href, title, undefined);
  }

  // title / data-title 属性（hket / etnet 常用）
  for (const m of html.matchAll(/(?:data-)?title=["']([^"']{8,160})["']/gi)) {
    add(undefined, m[1], undefined);
  }

  // JSON-LD / Next.js
  for (const m of html.matchAll(/"title"\s*:\s*"([^"]{8,160})"/g)) {
    const t = m[1].replace(/\\u([0-9a-f]{4})/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
    add(undefined, t, undefined);
  }

  return articles;
}

async function crawlFinanceSites() {
  console.log('\n========================================');
  console.log('  港媒理财新闻候选发现器启动');
  console.log('  只发现不入库；候选需核验后导入');
  console.log('========================================\n');

  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.log('  [WARN] 无法读取已有数据，去重基准为空');
  }
  const existingTitles = new Set(
    existing
      .filter(n => n.status === 'active' || !n.status)
      .map(n => (n.title || '').replace(/[\s，。：、｜|「」《》（）()]/g, '').slice(0, 20))
  );

  let allNew = [];
  const siteStats = [];
  for (const site of SITES) {
    process.stdout.write(`[站点] ${site.name} ... `);
    const html = await fetchHTML(site.url);
    if (!html) { console.log('无法获取'); siteStats.push({ name: site.name, count: 0, ok: false }); continue; }
    const articles = extractArticles(html, site);
    console.log(`候选 ${articles.length} 条`);
    siteStats.push({ name: site.name, count: articles.length, ok: true });

    for (const a of articles) {
      const key = a.title.replace(/[\s，。：、｜|「」《》（）()]/g, '').slice(0, 20);
      if (existingTitles.has(key)) continue;
      if (allNew.some(x => x.title.replace(/[\s，。：、｜|「」《》（）()]/g, '').slice(0, 20) === key)) continue;

      allNew.push({
        title: a.title,
        link: a.link,
        desc: `${a.source_name}报道：${a.title}`,
        source_id: a.source_id,
        source_name: a.source_name,
        source_cat: a.source_cat,
        lang: 'CH',
        pubDate: a.pubDate || new Date().toISOString(),
        tier_hint: a.tier,
        tier_reason: a.tier === 'B' ? '标题直接涉及创兴银行' : '银行业务主题（对标Wiser宽口径，需核验相关性）',
      });
    }
  }

  console.log(`\n总计新增候选: ${allNew.length} 条`);
  console.log('站点统计:', JSON.stringify(siteStats));
  return { source: 'finance_sites', newHits: allNew, siteStats };
}

if (require.main === module) {
  crawlFinanceSites().then(result => {
    console.log('\n候选新闻（未自动入库，需核验后导入）:');
    result.newHits.forEach((h, i) => console.log(`${i + 1}. [${h.tier_hint}] ${h.source_name} | ${h.title}`));
    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'finance_candidates.json'),
      JSON.stringify(result.newHits, null, 2)
    );
    console.log('\n已保存到 data/finance_candidates.json');
  });
}

module.exports = { crawlFinanceSites, extractArticles };
