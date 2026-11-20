/**
 * 港媒理财/定存新闻聚合爬虫
 * 抓取经济日报、明报、星岛、信报等理财栏目中涉及定存/利率比较的新闻
 * 对标 Wiser 收录口径：凡香港银行定存/汇率/贷款比较类报道均收录为C类
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 定存/理财主题关键词 — 命中即收录（对标Wiser宽口径）
const TOPIC_TERMS = [
  '定存', '定期存款', '港元定期', '美元定期', '人民幣定存', '澳元定存',
  '存款利率', '利率比較', '息率', '加息', '減息', '降息',
  '稅貸', '稅務貸款', '匯率', '兌換', '理財', '存款',
];

// 严格关键词 — 标题直接含创兴则B类
const STRICT_TERMS = ['创兴', '創興', 'Chong Hing', 'chbank'];

// 排除同名企业
const EXCLUDE_TERMS = ['廖創興企業', '廖创兴企业', '00194', '創興企業'];

// 目标站点（含分页参数）
const SITES = [
  { id: 'hket', name: '香港經濟日報·理財', url: 'https://wealth.hket.com/', cat: 'hk_business' },
  { id: 'hket', name: '香港經濟日報', url: 'https://www.hket.com/', cat: 'hk_business' },
  { id: 'etnet', name: '經濟通', url: 'https://www.etnet.com.hk/www/tc/news/index.php', cat: 'hk_business' },
  { id: 'etnet', name: '經濟通·定期存款', url: 'https://www.etnet.com.hk/www/tc/news/categorized_news.php?category=fd', cat: 'hk_business' },
  { id: 'mingpao', name: '明報·財經', url: 'https://news.mingpao.com/pns/%E8%B2%A2%E7%B6%93%E6%97%A5%E5%A0%B1', cat: 'hk_print' },
  { id: 'stheadline', name: '星島頭條·財經', url: 'https://www.stheadline.com/finance', cat: 'hk_print' },
  { id: 'ulifestyle', name: 'U Lifestyle·理財', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1', cat: 'hk_lifestyle' },
  { id: 'ulifestyle', name: 'U Lifestyle·理財P2', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1?page=2', cat: 'hk_lifestyle' },
  { id: 'ulifestyle', name: 'U Lifestyle·理財P3', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1?page=3', cat: 'hk_lifestyle' },
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
    console.log(`  [ERR] ${url.substring(0,50)}: ${e.message.substring(0,60)}`);
    return null;
  }
}

function extractArticles(html, site) {
  const articles = [];
  const seen = new Set();

  // 模式1: <a href="..." title="标题" 或 >标题</a>
  const patterns = [
    /<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']{8,150})["'][^>]*>/gi,
    /<a[^>]*title=["']([^"']{8,150})["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    /<a[^>]*href=["']([^"']+\/article\/[^"']+)["'][^>]*>([^<]{8,150})<\/a>/gi,
    /<a[^>]*href=["']([^"']+\/topic\/[^"']+)["'][^>]*>([^<]{8,150})<\/a>/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      // 处理title在前href在后的模式（捕获组顺序相反）
      let link, title;
      if (re === patterns[1]) { title = m[1]; link = m[2]; }
      else { link = m[1]; title = m[2]; }
      title = (title || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (title.length < 8 || title.length > 150) continue;
      if (seen.has(title)) continue;
      if (!TOPIC_TERMS.some(t => title.includes(t))) continue;
      if (EXCLUDE_TERMS.some(t => title.includes(t))) continue;
      seen.add(title);
      if (link && link.startsWith('/')) {
        try { link = new URL(link, site.url).href; } catch (e) { continue; }
      }
      articles.push({ title, link: link || site.url, source_name: site.name, source_cat: site.cat, source_id: site.id });
    }
  }

  // 模式1.5: 任意 title="含定存关键词的中文标题"（hket data-title / img alt 等）
  const anyTitle = [...html.matchAll(/title=["']([^"']{8,150})["']/g)];
  for (const m of anyTitle) {
    const title = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (title.length < 8 || title.length > 150) continue;
    if (seen.has(title)) continue;
    if (!TOPIC_TERMS.some(t => title.includes(t))) continue;
    if (EXCLUDE_TERMS.some(t => title.includes(t))) continue;
    seen.add(title);
    articles.push({ title, link: site.url, source_name: site.name, source_cat: site.cat, source_id: site.id });
  }

  // 模式2: <h3>标题</h3> 后跟时间戳（hket主站、etnet）
  const h3Pattern = /<h[23][^>]*>([^<]{10,120})<\/h[23]>\s*(?:<[^>]+>\s*)*<span[^>]*class=["'][^"']*timestamp[^"']*["'][^>]*>([^<]+)<\/span>/gi;
  let hm;
  while ((hm = h3Pattern.exec(html)) !== null) {
    const title = hm[1].replace(/\s+/g, ' ').trim();
    const dateStr = (hm[2] || '').trim();
    if (title.length < 8 || seen.has(title)) continue;
    if (!TOPIC_TERMS.some(t => title.includes(t))) continue;
    if (EXCLUDE_TERMS.some(t => title.includes(t))) continue;
    seen.add(title);
    // 解析日期 DD/MM/YYYY
    let pubDate = new Date().toISOString();
    const dm = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) {
      const yyyy = dm[3], mm = dm[2].padStart(2, '0'), dd = dm[1].padStart(2, '0');
      pubDate = `${yyyy}-${mm}-${dd}T12:00:00+08:00`;
    }
    const isStrict = STRICT_TERMS.some(t => title.includes(t));
    articles.push({ title, link: site.url, source_name: site.name, source_cat: site.cat, source_id: site.id, pubDate, tier: isStrict ? 'B' : 'C' });
  }

  // 模式3: JSON-LD 或 Next.js __NEXT_DATA__ 中的 title
  const jsonTitles = [...html.matchAll(/"title"\s*:\s*"([^"]{8,150})"/g)];
  for (const m of jsonTitles) {
    const title = m[1].replace(/\\u([0-9a-f]{4})/gi, (_, c) => String.fromCharCode(parseInt(c, 16))).trim();
    if (title.length < 8 || title.length > 150) continue;
    if (seen.has(title)) continue;
    if (!TOPIC_TERMS.some(t => title.includes(t))) continue;
    if (EXCLUDE_TERMS.some(t => title.includes(t))) continue;
    seen.add(title);
    articles.push({ title, link: site.url, source_name: site.name, source_cat: site.cat, source_id: site.id });
  }

  return articles;
}

async function crawlFinanceSites() {
  console.log('\n========================================');
  console.log('  港媒理财新闻聚合爬虫启动');
  console.log('  对标Wiser口径：定存/利率/理财比较类全收录');
  console.log('========================================\n');

  const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const existingTitles = new Set(existing.map(n => (n.title || '').replace(/\s/g, '')));

  let allNew = [];
  for (const site of SITES) {
    console.log(`[站点] ${site.name}: ${site.url}`);
    const html = await fetchHTML(site.url);
    if (!html) { console.log('  → 无法获取'); continue; }
    const articles = extractArticles(html, site);
    console.log(`  → 发现 ${articles.length} 条定存/理财相关新闻`);

    for (const a of articles) {
      if (existingTitles.has(a.title.replace(/\s/g, ''))) continue;
      if (allNew.some(x => x.title.replace(/\s/g, '') === a.title.replace(/\s/g, ''))) continue;

      const isStrict = STRICT_TERMS.some(t => a.title.includes(t)) || (a.tier === 'B');
      const tier = isStrict ? 'B' : 'C';
      allNew.push({
        title: a.title,
        link: a.link,
        desc: `${a.source_name}报道：${a.title}。涉及香港银行定存/利率市场动态。`,
        source_id: a.source_id,
        source_name: a.source_name,
        source_cat: a.source_cat,
        lang: 'CH',
        pubDate: a.pubDate || new Date().toISOString(),
        tier_hint: tier,
        tier_reason: isStrict ? '直接涉及创兴银行' : '定存利率市场比较（对标Wiser收录口径）',
      });
      console.log(`    [${tier}] ${a.title.substring(0, 45)}`);
    }
  }

  console.log(`\n总计新增候选: ${allNew.length} 条`);
  return { source: 'finance_sites', newHits: allNew };
}

if (require.main === module) {
  crawlFinanceSites().then(result => {
    console.log('\n候选新闻（未自动入库，需核验后导入）:');
    result.newHits.forEach((h, i) => console.log(`${i + 1}. [${h.tier_hint}] ${h.title}`));
    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'finance_candidates.json'),
      JSON.stringify(result.newHits, null, 2)
    );
    console.log(`\n已保存到 data/finance_candidates.json`);
  });
}

module.exports = { crawlFinanceSites, extractArticles };
