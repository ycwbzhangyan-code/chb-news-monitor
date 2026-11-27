#!/usr/bin/env node
/**
 * 全量导入 Wiser 2026 全年 630 条监测记录 — 分层标注（2026-11-27）
 *
 * 用户确认口径：
 *   1) 全量补录 1-11月 630 条，一条不漏
 *   2) 分层：正文确认含创兴 → 正式监测；其余 → Wiser对标区，单独标注，不混入正式新闻
 *
 * Wiser 记录表只有 日期/来源/标题，无 URL、无正文 → 绝大多数无法核验正文。
 * 分层规则（诚实标注，不假造核验）：
 *   - matched_ours：与我方 active 库标题重合（正文已核验含创兴）→ 正式监测（已在库，不重复加）
 *   - title_has_chb：标题含创兴但无URL、正文未核验 → Wiser对标区，标"标题含创兴·待核验"
 *   - wide_unverified：标题不含创兴的宽口径条目 → Wiser对标区，标"Wiser宽口径·未核验"
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const W = JSON.parse(fs.readFileSync(path.join(BASE, 'output', 'wiser_2026_full_630.json'), 'utf-8'));
const NEWS = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'news_items.json'), 'utf-8'));
const newsItems = NEWS.items || NEWS;
const CHB = /(创兴银行|創興銀行|创興銀行|Chong\s*Hing|chbank|创兴|創興)/i;

function norm(s) { return String(s || '').replace(/[\s，。：、｜|「」《》（）()【】\[\].,…*]/g, '').toLowerCase(); }
const ourTitles = new Set(newsItems.filter(x => x.status === 'active').map(x => norm(x.title)));

const archive = W.map(x => {
  const titleHas = CHB.test(x.title);
  const matched = ourTitles.has(norm(x.title));
  let layer, label;
  if (matched) { layer = 'matched_ours'; label = '我方已收录·正文已核验含创兴'; }
  else if (titleHas) { layer = 'title_has_chb'; label = 'Wiser记录·标题含创兴·无原文URL未核验'; }
  else { layer = 'wide_unverified'; label = 'Wiser宽口径·标题不含创兴·未核验'; }
  return {
    id: `wiser2026_${String(x.no).padStart(4, '0')}`,
    no: x.no,
    date: x.date,
    source: x.source,
    title: x.title.replace(/^\*/, ''),
    original_title: x.title,
    starred: x.star,
    layer,
    label,
    in_official_monitoring: layer === 'matched_ours',
    sentiment: x.positive === 1 ? 'Positive' : (x.neutral === 1 ? 'Neutral' : ''),
    imported_at: new Date().toISOString(),
  };
});

fs.writeFileSync(path.join(BASE, 'data', 'wiser_clippings_2026.json'), JSON.stringify(archive, null, 2));
const counts = {};
for (const a of archive) counts[a.layer] = (counts[a.layer] || 0) + 1;
console.log('Wiser 2026 归档', archive.length, '条');
console.log('分层', JSON.stringify(counts));
console.log('正式监测(正文核验)', counts.matched_ours, '条（已在库，不重复）');
console.log('对标区(未核验)', (counts.title_has_chb || 0) + (counts.wide_unverified || 0), '条');
console.log('saved data/wiser_clippings_2026.json');
