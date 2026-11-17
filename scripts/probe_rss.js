/**
 * RSS 自动探测器
 * 对所有有域名的源，探测标准RSS路径
 * 用法: node scripts/probe_rss.js [并发数] [最大探测数]
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DB_PATH = path.join(__dirname, '..', 'data', 'sources_full.json');
const CACHE_PATH = path.join(__dirname, '..', 'data', 'rss_probe_cache.json');

// 常见RSS路径
const RSS_PATHS = [
  '/feed', '/rss', '/rss.xml', '/feed.xml', '/feed/', '/rss/',
  '/index.xml', '/atom.xml', '/news/rss', '/news/rss.xml', '/news/feed',
  '/feeds/posts/default', '/blog/feed', '/blog/rss.xml', '/rss/all.xml',
  '/rssfeed', '/rss/feed', '/feeds/rss', '/feed/rss', '/.rss',
  '/rssindex.xml', '/articles/rss', '/news.xml', '/feeds/all.rss',
  '/zh-hans/rss', '/zh/rss', '/rss/zh', '/feed/zh', '/cn/rss',
  '/latest/rss', '/news/latest', '/api/rss', '/rss/index',
];

const TIMEOUT = 6000;
const CONCURRENCY = parseInt(process.argv[2]) || 20;
const MAX_PROBE = parseInt(process.argv[3]) || 999999;

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')); }
    catch (e) { return {}; }
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function probeRSS(domain) {
  for (const rssPath of RSS_PATHS) {
    const url = `https://${domain}${rssPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const isXML = ct.includes('xml') || ct.includes('rss') || ct.includes('atom');

      if (!isXML) {
        // 有些站点 content-type 不对，检查内容
        const text = await res.text();
        const head = text.substring(0, 600).toLowerCase();
        if (head.includes('<rss') || head.includes('<feed') || head.includes('<?xml')) {
          return url;
        }
        continue;
      }

      const text = await res.text();
      const head = text.substring(0, 600).toLowerCase();
      if (head.includes('<rss') || head.includes('<feed') || head.includes('<?xml')) {
        // 确认有 item 或 entry
        if (text.includes('<item') || text.includes('<entry')) {
          return url;
        }
      }
    } catch (e) {
      clearTimeout(timer);
    }
  }
  return '';
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const cache = loadCache();

  // 待探测：没有RSS但有域名的源
  let targets = db.sources.filter(s => !s.rss && s.domain && !cache[s.domain]);
  console.log(`[Probe] 总源 ${db.sources.length}, 已缓存 ${Object.keys(cache).length}, 本次待探测 ${Math.min(targets.length, MAX_PROBE)}`);

  targets = targets.slice(0, MAX_PROBE);

  let found = 0;
  let done = 0;
  const startTime = Date.now();

  // 并发执行
  const queue = [...targets];
  const workers = [];

  const worker = async () => {
    while (queue.length > 0) {
      const src = queue.shift();
      if (!src) break;
      try {
        const rss = await probeRSS(src.domain);
        if (rss) {
          cache[src.domain] = rss;
          found++;
          console.log(`  [+] ${src.domain} -> ${rss}`);
        } else {
          cache[src.domain] = '';  // 标记已探测，避免重复
        }
      } catch (e) {
        cache[src.domain] = '';
      }
      done++;
      if (done % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`[Progress] ${done}/${targets.length}, 发现 ${found} 个RSS, 耗时 ${elapsed}s`);
        saveCache(cache);
      }
    }
  };

  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  saveCache(cache);

  // 更新主数据库
  let updated = 0;
  for (const s of db.sources) {
    if (!s.rss && s.domain && cache[s.domain]) {
      s.rss = cache[s.domain];
      updated++;
    }
  }

  db.meta.updated = new Date().toISOString().slice(0, 10);
  db.meta.rss_probe_date = new Date().toISOString().slice(0, 10);
  db.stats.with_rss = db.sources.filter(s => s.rss).length;
  db.stats.probed = Object.keys(cache).length;

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  console.log('\n=== 探测完成 ===');
  console.log(`本次探测: ${done} 个域名, 发现 ${found} 个 RSS`);
  console.log(`数据库更新: ${updated} 个源新增 RSS`);
  console.log(`总 RSS 覆盖率: ${db.stats.with_rss} / ${db.sources.length} (${(db.stats.with_rss / db.sources.length * 100).toFixed(1)}%)`);
}

main().catch(e => { console.error(e); process.exit(1); });
