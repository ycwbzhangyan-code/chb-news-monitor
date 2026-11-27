/**
 * 中国金融商报网 (china.prcfe.com) 候选发现器
 *
 * 背景：该源在配置中为 crawl_only（无 RSS），系统只抓 RSS 源，从未抓取该站。
 * 2026-11-19 文章「功率半导体龙头闻泰科技...」正文点名创兴银行（资金存管合作行）被漏检，用户指出。
 *
 * 该站特点：
 * - 无 RSS / sitemap
 * - 文章 URL: /global/YYYY/MMDD/ID.html
 * - 栏目页 /global/ /news/ /bank/ 列出文章链接
 * - 文章页底部有「相关文章」同日链接（ID 相邻，但不可直接递增猜测）
 *
 * 策略：抓栏目页 + 已知文章页的关联链接 → 去重 → 抓正文 → 匹配创兴 → 写入候选池待核验。
 * 只发现不入库（与 crawler_finance_sites 一致），避免软文/低质稿直接污染新闻库。
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const BASE = 'http://china.prcfe.com';
const SEED_PAGES = ['/global/', '/news/', '/bank/', '/global/2026/1119/116537.html'];
const WATCH = /(创兴银行|創興銀行|Chong\s*Hing\s*Bank|chbank)/i;
const MONITOR_START = '2026-10-26';
const CAND_FILE = path.join(__dirname, '..', 'data', 'finance_candidates.json');

const HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

async function fetchHTML(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { headers: HDR, timeout: 12000 });
      if (!resp.ok) return null;
      const buf = await resp.buffer();
      // 站点 UTF-8 与 GBK 混用，优先 UTF-8
      let txt = buf.toString('utf8');
      if (txt.includes('\uFFFD')) txt = buf.toString('gbk');
      return txt;
    } catch (e) { if (i === retries) return null; }
  }
  return null;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<[^>]+>/g, ' ')
             .replace(/&nbsp;|&#160;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/\s+/g, ' ').trim();
}

function extractArticleLinks(html) {
  const re = /href=["'](\/?global\/(\d{4})\/(\d{4})\/(\d+)\.html)["']/gi;
  const out = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].startsWith('http') ? m[1] : BASE + (m[1].startsWith('/') ? m[1] : '/' + m[1]);
    const yyyy = m[2], mmdd = m[3];
    const date = `${yyyy}-${mmdd.slice(0,2)}-${mmdd.slice(2,4)}`;
    out.set(url, date);
  }
  return [...out.entries()].map(([url, date]) => ({ url, date }));
}

function extractTitleDate(html) {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = tm ? stripTags(tm[1]).replace(/_中国金融商报网\s*$/, '').trim() : '';
  const dm = html.match(/(20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
  const date = dm ? dm[1].slice(0, 10) : '';
  return { title, date };
}

async function crawlPRCFE() {
  console.log('=== 中国金融商报网 候选发现器启动 ===');
  const links = new Map();
  for (const seed of SEED_PAGES) {
    const html = await fetchHTML(BASE + seed);
    if (!html) { console.log('  [跳过]', seed); continue; }
    for (const a of extractArticleLinks(html)) {
      if (a.date >= MONITOR_START) links.set(a.url, a.date);
    }
    console.log('  [种子]', seed, '累计链接', links.size);
  }

  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(CAND_FILE, 'utf-8')); } catch (e) { prev = []; }
  const seen = new Set(prev.map(x => x.link));

  let added = 0, scanned = 0;
  for (const [url, date] of links) {
    if (seen.has(url)) continue;
    scanned++;
    if (scanned > 80) break; // 控制单次抓取量
    const html = await fetchHTML(url);
    if (!html) continue;
    const body = stripTags(html);
    if (!WATCH.test(body)) continue;
    const { title, date: pubDate } = extractTitleDate(html);
    if (!title) continue;
    const d = pubDate || date;
    if (d < MONITOR_START) continue;
    // 创兴命中句子
    const idx = body.search(WATCH);
    const snippet = body.slice(Math.max(0, idx - 80), idx + 160);
    prev.push({
      title,
      link: url,
      desc: snippet,
      pubDate: d,
      source_name: '中国金融商报网',
      source_id: 's2613',
      discovery: 'crawler_prcfe',
      status: 'pending_verification',
      discovered_at: new Date().toISOString(),
    });
    added++;
    console.log('  [候选]', d, '|', title.slice(0, 46));
  }

  fs.writeFileSync(CAND_FILE, JSON.stringify(prev.slice(-800), null, 2));
  console.log(`=== 完成：扫描 ${scanned} 篇，新增候选 ${added} 条 ===`);
  return { scanned, added };
}

if (require.main === module) {
  crawlPRCFE().then(r => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { crawlPRCFE };
