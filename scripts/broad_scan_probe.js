/**
 * 广撒网发现能力 — 可行性探针（只读，不入库）
 *
 * 验证核心假设：从媒体 sitemap 批量取真实文章 URL，逐篇抓正文，
 * 能否自主发现「标题不点名创兴、正文含创兴」的新闻——这是关键词命中漏掉的。
 *
 * 与旧爬虫的区别：旧爬虫用标题关键词筛候选；这里不筛标题，全部抓正文核验。
 */
const fetch = require('node-fetch');

const HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh;q=0.8',
};
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing\s*Bank|Chong\s*Hing|chbank)/i;

// 高价值媒体 sitemap（真实文章 URL + lastmod）
const SITEMAPS = [
  { name: '香港經濟日報·理財', url: 'https://wealth.hket.com/interest.xml' },
  { name: '香港經濟日報·存款', url: 'https://wealth.hket.com/saving.xml' },
  { name: '香港經濟日報·即時', url: 'https://news.hket.com/hknews.xml' },
  { name: '香港01', url: 'https://www.hk01.com/sitemap.xml' },
];

async function getText(url, timeout = 12000) {
  try {
    const resp = await fetch(url, { headers: HDR, timeout });
    if (!resp.ok) return null;
    const buf = await resp.buffer();
    let t = buf.toString('utf8');
    if (t.includes('\uFFFD')) t = buf.toString('gbk');
    return t;
  } catch (e) { return null; }
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
  // 去脚本/样式/导航，取正文区域
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ')
       .replace(/&nbsp;|&#160;/g, ' ')
       .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
       .replace(/\s+/g, ' ').trim();
  return t;
}

function decodeTitle(url) {
  try {
    const last = decodeURIComponent(url.split('/').filter(Boolean).pop() || '');
    return last.replace(/\.html?$/, '').replace(/[-_]/g, ' ').slice(0, 80);
  } catch (e) { return ''; }
}

async function main() {
  const maxPerSite = parseInt(process.argv[2] || '20', 10);
  console.log('=== 广撒网发现能力探针（每站最多 ' + maxPerSite + ' 篇）===\n');
  let totalScanned = 0, totalHit = 0;
  const hits = [];

  for (const sm of SITEMAPS) {
    console.log('\n--- ' + sm.name + ' ---');
    const xml = await getText(sm.url);
    if (!xml) { console.log('  sitemap 抓取失败'); continue; }
    const urls = parseSitemap(xml);
    console.log('  sitemap 文章数: ' + urls.length);
    const picked = urls.slice(0, maxPerSite);

    for (const u of picked) {
      const html = await getText(u.url);
      totalScanned++;
      if (!html) { continue; }
      const body = stripBody(html);
      if (CHB.test(body)) {
        totalHit++;
        const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = tm ? stripBody(tm[1]) : decodeTitle(u.url);
        // 标题是否点名创兴（判断是否为「标题不点名但正文含」的漏检类型）
        const titleHasChb = CHB.test(title);
        hits.push({ source: sm.name, title, url: u.url, date: (u.lastmod || '').slice(0, 10), titleHasChb });
        console.log('  [命中' + (titleHasChb ? '·标题含' : '·正文含★') + '] ' + title.slice(0, 50));
      }
      await new Promise(r => setTimeout(r, 250)); // 限速
    }
  }

  console.log('\n=== 结果 ===');
  console.log('扫描文章: ' + totalScanned + ' | 正文含创兴: ' + totalHit);
  const bodyOnly = hits.filter(h => !h.titleHasChb);
  console.log('其中「标题不点名创兴、正文才含」= 关键词方案会漏掉的: ' + bodyOnly.length);
  if (bodyOnly.length) {
    console.log('\n★ 自主发现的新能力证据（正文含创兴，标题不含）:');
    bodyOnly.slice(0, 10).forEach(h => console.log('  - [' + h.source + '] ' + h.date + ' ' + h.title.slice(0, 55)));
  }
  require('fs').writeFileSync(
    require('path').join(__dirname, '..', 'output', 'broad_scan_probe_hits.json'),
    JSON.stringify(hits, null, 2), 'utf-8'
  );
  console.log('\n命中详情已存 output/broad_scan_probe_hits.json');
}

main();
