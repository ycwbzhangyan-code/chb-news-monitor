/**
 * 广撒网正文核验抓取器 — 把「关键词命中」升级为「广撒网 + 正文核验」
 *
 * 核心逻辑（与旧爬虫的本质区别）：
 *   旧：标题关键词命中 → 才抓正文 → 入库        （标题不点名创兴就漏掉）
 *   新：从媒体 sitemap/栏目页拿全部文章 URL → 逐篇抓正文 → 正文含创兴才入库
 *      → 能自主发现「标题不点名创兴、正文利率表点名创兴」的宽口径新闻
 *
 * 用法：
 *   node scripts/broad_scan.js --dry-run        # 只扫描不入库，看效果
 *   node scripts/broad_scan.js --days 7          # 扫描近7天，入库
 *   node scripts/broad_scan.js --days 30 --max 40  # 近30天，每源最多40篇
 *
 * 幂等：URL hash + 规范化标题去重，重复运行不产生重复条目。
 * 限速：并发 2，每篇间隔 600ms；遇到 WAF 人机验证自动降速退避，避免被封。
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const LOG_FILE = path.join(__dirname, '..', 'data', 'broad_scan_log.json');

const HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh;q=0.8',
};
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing\s*Bank|Chong\s*Hing|chbank)/i;

// 高价值媒体 sitemap —— 提供真实文章 URL（不是 GNews 加密链接）
// 按目标库命中条数排序，优先覆盖命中多的媒体栏目
const SITEMAPS = [
  { name: '香港經濟日報·理財', srcId: 's0160', urls: [
    'https://wealth.hket.com/interest.xml', 'https://wealth.hket.com/saving.xml',
    'https://wealth.hket.com/manage.xml', 'https://wealth.hket.com/workplace.xml',
  ]},
  { name: '香港經濟日報·即時', srcId: 's0573', urls: [
    'https://news.hket.com/hknews.xml', 'https://news.hket.com/policy.xml',
  ]},
  { name: '香港01', srcId: 's0171', urls: ['https://www.hk01.com/sitemap.xml'] },
];

// 栏目页 HTML 模式（从页面提取文章链接）
// 明报首页为 JS 渲染，静态 HTML 取不到 article 链接，改由 GNews 定向源覆盖，此处不重复请求。
const LIST_PAGES = [];

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? (argv[i + 1] || def) : def;
}
const DRY = argv.includes('--dry-run');
const DAYS = parseInt(arg('days', '7'), 10);
const MAX_PER_SITE = parseInt(arg('max', '25'), 10);
const CUTOFF = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

async function getText(url, timeout = 15000) {
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch(url, { headers: HDR, timeout });
      if (!resp.ok) return null;
      const buf = await resp.buffer();
      let t = buf.toString('utf8');
      if (t.includes('\uFFFD')) t = buf.toString('gbk');
      // WAF 人机验证页不是正文，视为失败并退避
      if (/Human Verification|awsWaf|gokuProps|Access Denied/i.test(t.slice(0, 3000))) {
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      return t;
    } catch (e) { if (i === 1) return null; }
  }
  return null;
}

function parseSitemap(xml) {
  const out = [];
  const re = /<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?(?:<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ url: m[1].trim(), lastmod: (m[2] || '').trim() });
  }
  return out;
}

function stripBody(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
              .replace(/<header[\s\S]*?<\/header>/gi, ' ')
              .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
              .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ')
       .replace(/&nbsp;|&#160;/g, ' ')
       .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/\s+/g, ' ').trim();
  return t;
}

function extractMeta(html, url) {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = tm ? stripBody(tm[1]) : '';
  // 常见 CMS 标题尾巴清理
  title = title.replace(/\s*[-|｜]\s*(香港經濟日報|HKET|明報|香港01|星島頭條).*$/, '').trim();
  // 发布日期：优先 meta / JSON-LD / 正文中的 YYYY-MM-DD 或 YYYYMMDD
  let date = '';
  const pats = [
    /<meta[^>]+(?:article:published_time|datePublished|publishdate)[^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/i,
    /(20\d{2}-\d{2}-\d{2})/,
    /\/(20\d{2})(\d{2})(\d{2})\//,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) {
      date = (m[1] || '').slice(0, 10);
      if (date.length === 8) date = date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8);
      if (m[2] && m[3]) date = m[1]+'-'+m[2]+'-'+m[3];
      break;
    }
  }
  return { title, date };
}

function normalizeKey(title) {
  return (title || '').replace(/\s+/g, '')
    .replace(/[｜|].*$/, '').replace(/[，,。！!：:、「」"'（）()《》]/g, '')
    .toLowerCase().trim().slice(0, 20);
}

function hashUrl(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  console.log('=== 广撒网正文核验抓取器 ===');
  console.log('模式: ' + (DRY ? 'DRY-RUN（不入库）' : '入库') + ' | 近 ' + DAYS + ' 天 | 每源最多 ' + MAX_PER_SITE + ' 篇 | 截止 ' + CUTOFF + '\n');

  // 1. 收集候选 URL
  const candidates = [];
  for (const sm of SITEMAPS) {
    for (const su of sm.urls) {
      const xml = await getText(su);
      if (!xml) { console.log('  [跳过] ' + su); continue; }
      const urls = parseSitemap(xml);
      const picked = urls.slice(0, MAX_PER_SITE).map(u => ({ ...u, source: sm.name, srcId: sm.srcId }));
      candidates.push(...picked);
      console.log('  [sitemap] ' + sm.name + ' ' + su.split('/').pop() + ': ' + urls.length + ' 篇，取 ' + picked.length);
    }
  }
  for (const lp of LIST_PAGES) {
    for (const pu of lp.urls) {
      const html = await getText(pu);
      if (!html) { console.log('  [跳过] ' + pu); continue; }
      const links = new Set(); let m;
      lp.linkRe.lastIndex = 0;
      while ((m = lp.linkRe.exec(html)) !== null) links.add(m[1]);
      const picked = [...links].slice(0, MAX_PER_SITE).map(u => ({ url: u, lastmod: '', source: lp.name, srcId: lp.srcId }));
      candidates.push(...picked);
      console.log('  [栏目页] ' + lp.name + ': ' + links.size + ' 篇，取 ' + picked.length);
    }
  }
  console.log('\n候选 URL 合计: ' + candidates.length);

  // 去重 URL
  const seenUrl = new Set();
  const uniq = candidates.filter(c => {
    if (seenUrl.has(c.url)) return false;
    seenUrl.add(c.url); return true;
  });
  console.log('去重后: ' + uniq.length);

  // 2. 逐篇抓正文核验
  let scanned = 0, bodyHit = 0, titleHit = 0, skippedDate = 0, skippedDup = 0;
  const found = [];

  const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
  const existHashes = new Set(news.map(n => n.hash));
  const existKeys = new Set(news.filter(n => n.status === 'active' || !n.status).map(n => normalizeKey(n.title)));
  const existUrls = new Set(news.map(n => n.link));

  const results = await mapLimit(uniq, 2, async (c) => {
    const html = await getText(c.url);
    await new Promise(r => setTimeout(r, 600)); // 每篇后限速，避免 WAF
    if (!html) return null;
    scanned++;
    const body = stripBody(html);
    if (!CHB.test(body)) return null;
    const meta = extractMeta(html, c.url);
    let date = meta.date || (c.lastmod || '').slice(0, 10);
    if (!date) {
      const dm = c.url.match(/\/(20\d{2})(\d{2})(\d{2})\//);
      if (dm) date = dm[1]+'-'+dm[2]+'-'+dm[3];
    }
    // 日期窗口：有日期且过旧则跳过；无日期保守放行（sitemap 取的是近期）
    if (date && date < CUTOFF) { skippedDate++; return null; }
    const titleHasChb = CHB.test(meta.title);
    const urlHash = hashUrl(c.url);
    if (existHashes.has(urlHash) || existUrls.has(c.url)) { skippedDup++; return null; }
    const key = normalizeKey(meta.title);
    if (key && existKeys.has(key)) { skippedDup++; return null; }
    // 截取含创兴的上下文作为证据（而非正文开头，创兴常出现在利率表中段）
    const hitMatch = body.match(new RegExp('.{0,80}(?:' + CHB.source + ').{0,140}', 'i'));
    const evidence = hitMatch ? hitMatch[0] : body.slice(0, 300);
    return {
      source: c.source, srcId: c.srcId, title: meta.title || '',
      url: c.url, date: date || new Date().toISOString().slice(0, 10),
      titleHasChb, body: evidence, hash: urlHash, key,
    };
  });

  for (const r of results) {
    if (!r) continue;
    found.push(r);
    if (r.titleHasChb) titleHit++; else bodyHit++;
  }

  console.log('\n=== 扫描结果 ===');
  console.log('抓取正文: ' + scanned + ' | 正文含创兴: ' + found.length + '（标题含 ' + titleHit + ' / ★标题不含正文含 ' + bodyHit + '）');
  console.log('日期过旧跳过: ' + skippedDate + ' | 重复跳过: ' + skippedDup);
  console.log('\n★ 自主发现（标题不含创兴、正文含）:');
  found.filter(f => !f.titleHasChb).forEach(f => console.log('  - [' + f.source + '] ' + f.date + ' ' + f.title.slice(0, 55)));

  const log = { run: new Date().toISOString(), days: DAYS, dry: DRY, scanned, found: found.length, titleHit, bodyHit, skippedDate, skippedDup, items: found };
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');

  if (DRY) { console.log('\nDRY-RUN 完成，未入库。日志: data/broad_scan_log.json'); return; }

  // 3. 入库
  let added = 0;
  for (const f of found) {
    const item = {
      id: news.length + 1,
      hash: f.hash,
      title: f.title,
      link: f.url,
      description: f.body,
      source_id: f.srcId,
      source_name: f.source,
      source_cat: 'hk_business',
      lang: 'CH',
      pub_date: f.date,
      fetch_date: new Date().toISOString(),
      tier: f.titleHasChb ? 'B' : 'C',
      tier_reason: '广撒网正文核验·' + (f.titleHasChb ? '标题点名创兴' : '正文含创兴·标题未点名（关键词方案会漏）'),
      body_verified: true,
      status: 'active',
      provenance: 'broad_scan',
      created_at: new Date().toISOString(),
    };
    news.push(item);
    existHashes.add(f.hash); existKeys.add(f.key); existUrls.add(f.url);
    added++;
  }
  news.sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));
  news.forEach((n, i) => n.id = i + 1);
  fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2), 'utf-8');
  console.log('\n入库新增: ' + added + ' 条 | 主库 active: ' + news.filter(n => n.status === 'active' || !n.status).length);
}

main();
