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
const store = require('../src/services/store');

const BASE = path.join(__dirname, '..');
const PENDING = path.join(BASE, 'data', 'pending_articles.json');
const NEWS = path.join(BASE, 'data', 'news_items.json');
const REJECT_LOG = path.join(BASE, 'data', 'verification_rejects.json');
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing\s*Bank|Chong\s*Hing|chbank)/i;
const OFFICIAL = /(chbank\.com|创兴银行官网|創興銀行官網)/i;

const HDR = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,*/*' };

// P0-2：正文范围收窄。导航栏/推荐阅读/搜索摘要不算正文。
// 先移除明显的非正文块，再优先取已知正文容器；取不到才降级整页并标记 scope='page_fallback'。
const NON_BODY_BLOCK = /<(nav|header|footer|aside)\b[\s\S]*?<\/\1>|<div[^>]*(?:class|id)=["'][^"']*(?:nav|navigation|menu|breadcrumb|footer|header|sidebar|recommend|related|hot[-_]?news|news[-_]?list|search[-_]?result|keyword|advert|adv-|banner|share|social|comment)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;

// 各站点实测正文容器（2026-11-27 DOM 探查）
const BODY_CONTAINERS = [
  /<article[^>]*\bclass=["'][^"']*\bprint\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i,   // hket: article.print
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,                                            // 通用 article
  /<div[^>]*\bclass=["'][^"']*\barticle-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, // U Lifestyle
  /<div[^>]*\bclass=["'][^"']*\bcontent_ny\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,     // PRCFE
  /<div[^>]*\bclass=["'][^"']*\bep-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,     // PRCFE 备用
  /<div[^>]*\bclass=["'][^"']*\b(?:article-body|post-content|entry-content|news-content)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
];

function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|\s+/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
}

// 平衡 div 匹配：容器内有嵌套 div 时，非贪婪正则会在第一个 </div> 截断，
// 导致 U Lifestyle / PRCFE 等站点取不到正文而降级整页。这里按深度找配对闭合标签。
function extractBalancedDiv(html, className) {
  const q = '[\"\\x27]'; // 双引号或单引号（用 \x27 避免字符串转义问题）
  const openRe = new RegExp('<div[^>]*\\bclass=' + q + '[^\"\\x27]*\\b' + className + '\\b[^\"\\x27]*' + q + '[^>]*>', 'i');
  const m = openRe.exec(html);
  if (!m) return '';
  const start = m.index + m[0].length;
  let depth = 1, pos = start;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let t;
  while ((t = tagRe.exec(html)) !== null) {
    if (/^<\/div/i.test(t[0])) depth--; else depth++;
    if (depth === 0) return html.slice(start, t.index);
  }
  return '';
}

// 返回 { text, scope }：scope 标明正文来自哪个容器，便于审计与"待核验"判断
function extractArticleBody(html) {
  let cleaned = html.replace(NON_BODY_BLOCK, ' ');
  for (const re of BODY_CONTAINERS) {
    re.lastIndex = 0;
    const m = re.exec(cleaned);
    if (m && m[1]) {
      const text = strip(m[1]);
      if (text.length >= 120) return { text, scope: re.source.slice(0, 40) };
    }
  }
  // 容器兜底：从已知正文容器起点截取到页面尾部（已剔除导航/推荐块）。
  // 不用严格平衡 div —— SVG/注释里的 <div> 会干扰深度计数而提前截断；
  // 正文容器通常在页面中后段，截到尾部仍能覆盖正文与文内目录，不会引入站外推荐块。
  for (const cls of ['article-content', 'content_ny', 'ep-content', 'article-body', 'post-content', 'entry-content']) {
    const q = '[\"\x27]';
    const openRe = new RegExp('<div[^>]*\\bclass=' + q + '[^\"\x27]*\\b' + cls + '\\b[^\"\x27]*' + q + '[^>]*>', 'i');
    const m = openRe.exec(cleaned);
    if (m) {
      const slice = cleaned.slice(m.index + m[0].length);
      const text = strip(slice);
      if (text.length >= 120) return { text, scope: 'div.' + cls + '(to-end)' };
    }
  }
  // 降级：整页（已剔除导航/推荐块），但明确标注，供汇总时区分"正文已核验"与"页面级命中"
  return { text: strip(cleaned), scope: 'page_fallback' };
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
    if (OFFICIAL.test(link)) return { ok: false, reason: 'official_excluded' };
    const { text: body, scope } = extractArticleBody(txt);
    const m = CHB.exec(body);
    if (m) return { ok: true, evidence: body.slice(Math.max(0, m.index - 50), m.index + 100), scope };
    return { ok: false, reason: 'no_chb_in_body', evidence: body.slice(0, 80), scope };
  } catch (e) {
    return { ok: false, reason: 'fetch_error:' + (e.name || '').slice(0, 16) };
  }
}

async function main() {
  if (!fs.existsSync(PENDING)) { console.log('无待核验池', PENDING); process.exit(0); }
  const pending = JSON.parse(fs.readFileSync(PENDING, 'utf-8'));
  console.log('待核验', pending.length, '条');
  const d = JSON.parse(fs.readFileSync(NEWS, 'utf-8'));
  const isArr = Array.isArray(d);
  const news = isArr ? d : (d.items || d);
  // 用统一去重策略（同一链接 / 精确同题 / 截断标题），不再用20字前缀互含
  const existingActive = news.filter(x => x.status === 'active');
  const seenInBatch = [];

  const verified = [], rejected = [];
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    const results = await Promise.all(batch.map(async p => ({ p, v: await verifyBody(p.link) })));
    for (const { p, v } of results) {
      if (v.ok) {
        const candidate = { title: p.title, link: p.link };
        if (store.isDuplicate(candidate, existingActive) || store.isDuplicate(candidate, seenInBatch)) {
          rejected.push({ title: p.title, link: p.link, reason: 'duplicate' }); continue;
        }
        verified.push({ p, evidence: v.evidence, scope: v.scope });
        seenInBatch.push(candidate);
      } else {
        // 待核验/失败分别记录原因与正文范围，不静默丢弃
        rejected.push({ title: p.title, link: p.link, reason: v.reason, scope: v.scope || '', checked_at: new Date().toISOString() });
      }
    }
    process.stdout.write(`  ${Math.min(i + 8, pending.length)}/${pending.length}\n`);
  }

  // 入库（正文核验通过的；页面级降级命中须显式标注 scope，汇总时可单列）
  for (const { p, evidence, scope } of verified) {
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
      body_verified: true,
      body_scope: scope,                       // 'article' / 'page_fallback'
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
}

module.exports = { extractArticleBody, extractBalancedDiv, strip, verifyBody };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
