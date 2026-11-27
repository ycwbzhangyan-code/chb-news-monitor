#!/usr/bin/env node
/**
 * 正文核验入库（2026-11-27 硬闸门执行者）
 *
 * 规则：新闻库每条点开正文必须含「创兴银行/創興銀行/Chong Hing/chbank」字样。
 * 从 pending_articles.json 读取待核验条目 → 抓原文正文 →
 *   含创兴 → 入库 news_items.json（C/B 按 classify）
 *   不含/抓不到 → 丢弃（记入 rejected 日志）
 *
 * 由每日采集流程末尾调用，也可单独运行。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const BASE = path.join(__dirname, '..');
const PENDING = path.join(BASE, 'data', 'pending_articles.json');
const NEWS = path.join(BASE, 'data', 'news_items.json');
const REJECT_LOG = path.join(BASE, 'data', 'verification_rejects.json');
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing\s*Bank|Chong\s*Hing|chbank)/i;
const OFFICIAL = /(chbank\.com|创兴银行官网|創興銀行官網)/i;

const HDR = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,*/*' };

function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|\s+/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
}
function isGeneric(link) {
  return !link || !link.startsWith('http') || /^https?:\/\/[^/]+\/?$/.test(link);
}
function normTitle(s) { return String(s || '').replace(/[\s，。：、｜|「」《》（）()【】\[\].,…*]/g, '').toLowerCase(); }
function hash(t) { return crypto.createHash('sha1').update(normTitle(t)).digest('hex').slice(0, 16); }

async function verifyBody(link) {
  if (isGeneric(link)) return { ok: false, reason: 'generic_link', evidence: link };
  try {
    const resp = await fetch(link, { headers: HDR, timeout: 12000, redirect: 'follow' });
    if (!resp.ok) return { ok: false, reason: 'http_' + resp.status };
    const buf = await resp.buffer();
    let txt = buf.toString('utf8');
    if ((txt.match(/\uFFFD/g) || []).length > 5) txt = buf.toString('gbk');
    const body = strip(txt);
    if (OFFICIAL.test(link)) return { ok: false, reason: 'official_excluded' };
    const m = CHB.exec(body);
    if (m) return { ok: true, evidence: body.slice(Math.max(0, m.index - 50), m.index + 100) };
    return { ok: false, reason: 'no_chb_in_body', evidence: body.slice(0, 80) };
  } catch (e) {
    return { ok: false, reason: 'fetch_error:' + (e.name || '').slice(0, 16) };
  }
}

(async () => {
  if (!fs.existsSync(PENDING)) { console.log('无待核验池', PENDING); process.exit(0); }
  const pending = JSON.parse(fs.readFileSync(PENDING, 'utf-8'));
  console.log('待核验', pending.length, '条');
  const d = JSON.parse(fs.readFileSync(NEWS, 'utf-8'));
  const isArr = Array.isArray(d);
  const news = isArr ? d : (d.items || d);
  const existing = new Set(news.filter(x => x.status === 'active').map(x => normTitle(x.title)));

  const verified = [], rejected = [];
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    const results = await Promise.all(batch.map(async p => ({ p, v: await verifyBody(p.link) })));
    for (const { p, v } of results) {
      if (v.ok) {
        if (existing.has(normTitle(p.title))) { rejected.push({ title: p.title, reason: 'duplicate' }); continue; }
        verified.push({ p, evidence: v.evidence });
        existing.add(normTitle(p.title));
      } else {
        rejected.push({ title: p.title, link: p.link, reason: v.reason });
      }
    }
    process.stdout.write(`  ${Math.min(i + 8, pending.length)}/${pending.length}\n`);
  }

  // 入库（正文核验通过的）
  for (const { p, evidence } of verified) {
    news.push({
      id: `verified_${hash(p.title)}`,
      hash: hash(p.title),
      title: p.title,
      link: p.link,
      description: `正文核验：${evidence}（${p.layer === 'wide_topic' ? 'Wiser宽口径' : '点名创兴'}）`,
      source_id: p.source_id || '',
      source_name: p.source_name || '',
      source_cat: p.source_cat || 'hk_business',
      lang: p.lang || 'CH',
      pub_date: p.pub_date,
      fetch_date: new Date().toISOString(),
      tier: p.layer === 'wide_topic' ? 'C' : 'C',
      tier_reason: p.layer === 'wide_topic' ? 'Wiser宽口径：正文含创兴银行（邻近窗口）' : '正文核验含创兴银行',
      status: 'active',
      ai_researched: p.ai_researched ? 1 : 0,
      discovery: 'body_verified',
      body_verified_at: new Date().toISOString(),
    });
  }
  const out = isArr ? news : (d.items = news, d);
  fs.writeFileSync(NEWS, JSON.stringify(out, null, 2));
  // 清空已处理待核验池（保留未处理的；这里全部处理完，留空）
  fs.writeFileSync(PENDING, '[]');
  // 拒绝日志
  let prevRej = [];
  try { prevRej = JSON.parse(fs.readFileSync(REJECT_LOG, 'utf-8')); } catch (e) {}
  fs.writeFileSync(REJECT_LOG, JSON.stringify([...prevRej, ...rejected].slice(-500), null, 2));

  console.log('\n=== 核验入库完成 ===');
  console.log('正文含创兴入库', verified.length, '条');
  console.log('拒绝', rejected.length, '条');
  const reasons = {};
  for (const r of rejected) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ', v, k));
  console.log('新闻库 active', news.filter(x => x.status === 'active').length);
  process.exit(0);
})();
