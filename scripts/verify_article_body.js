#!/usr/bin/env node
/**
 * 逐条核验新闻库文章的原文正文是否含「创兴银行」字样。
 * 只读，不改库。输出核验报告 JSON。
 * 判定：正文（title之外的 body 文本）含 创兴/創興/Chong Hing/chbank → HAS_IN_BODY
 *       仅标题含、正文无 → TITLE_ONLY
 *       抓不到原文 → UNREACHABLE（无法核验）
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const OUT = path.join(__dirname, '..', 'data', 'body_verification_1127.json');
const d = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
const items = (d.items || d).filter(x => x.status === 'active');
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing\s*Bank|Chong\s*Hing|chbank|创兴|創興)/i;

const HDR = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,*/*' };

function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|\s+/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
}

function isGenericLink(url) {
  // 通用首页/栏目页，非具体文章
  return /^https?:\/\/[^/]+\/?$/.test(url) || /\/(?:com|hk|cn)\/?$/.test(url);
}

async function verify(item) {
  const title = String(item.title || '');
  const link = String(item.link || '');
  const titleHas = CHB.test(title);
  const rec = { id: item.id, title, link, pub_date: item.pub_date, discovery: item.discovery, titleHas, result: '', evidence: '' };
  if (isGenericLink(link) || !link.startsWith('http')) {
    rec.result = 'GENERIC_LINK'; rec.evidence = link; return rec;
  }
  try {
    const resp = await fetch(link, { headers: HDR, timeout: 12000, redirect: 'follow' });
    if (!resp.ok) { rec.result = 'HTTP_' + resp.status; return rec; }
    const buf = await resp.buffer();
    let txt = buf.toString('utf8');
    if ((txt.match(/\uFFFD/g) || []).length > 5) txt = buf.toString('gbk');
    const body = strip(txt);
    // 从正文里找创兴命中句（排除title区域的重复）
    const m = CHB.exec(body);
    if (m) {
      rec.result = 'HAS_IN_BODY';
      rec.evidence = body.slice(Math.max(0, m.index - 60), m.index + 120);
    } else {
      rec.result = titleHas ? 'TITLE_ONLY' : 'NO_CHB_AT_ALL';
      rec.evidence = body.slice(0, 150);
    }
  } catch (e) {
    rec.result = 'FETCH_ERR:' + (e.name || '').slice(0, 20);
  }
  return rec;
}

(async () => {
  console.log('核验', items.length, '条...');
  const results = [];
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    const r = await Promise.all(batch.map(verify));
    results.push(...r);
    process.stdout.write(`  ${Math.min(i + 10, items.length)}/${items.length}\n`);
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const counts = {};
  for (const r of results) counts[r.result.replace(/:.*/, '')] = (counts[r.result.replace(/:.*/, '')] || 0) + 1;
  console.log('\n=== 核验结果 ===');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(' ', v, k));
  console.log('\n=== 需要移除的（正文无创兴）===');
  for (const r of results) {
    if (['TITLE_ONLY', 'NO_CHB_AT_ALL', 'GENERIC_LINK'].includes(r.result)) {
      console.log(' ', r.result, '|', r.pub_date, '|', r.title.slice(0, 48), '|', r.evidence.slice(0, 50));
    }
  }
  console.log('\nsaved', OUT);
  process.exit(0);
})();
