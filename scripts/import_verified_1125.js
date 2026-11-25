/**
 * 补录 2026-11-25 经 WebFetch 完整核验的真实新闻
 * 原则：只补能拿到真实标题+链接+日期+正文核验的条目，绝不照抄 Wiser 截图推测标题。
 *
 * 条目1: etnet 经济通 417959
 *   - 完整标题、发布时间 24/11/2026 16:56、真实 URL 均经 WebFetch 核验
 *   - 正文含"表列各大銀行定存息率"→ 符合 Wiser 宽口径（利率表点名创兴银行即算）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const d = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
const items = d.items || d;
const hash = t => crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);
function norm(s) { return String(s || '').replace(/[\s，。：、｜|「」《》（）()【】\[\].,…*]/g, '').toLowerCase(); }

const ADDS = [
  {
    title: '定期存款 | 華僑銀行推港元定存優惠一個月高達5.5厘，WeLab Bank8個月3.35厘',
    date: '2026-11-24',
    source: '經濟通',
    link: 'https://www.etnet.com.hk/www/tc/news/news-article.php?section=features&category=special&newsid=417959',
    tier: 'C',
    reason: 'Wiser宽口径：正文含"表列各大銀行定存息率"，创兴银行列入利率比较表（邻近窗口）',
  },
];

let added = 0;
const existingNorm = items.filter(x => x.status === 'active' || !x.status).map(x => norm(x.title));
for (const a of ADDS) {
  const n = norm(a.title), prefix = n.slice(0, 20);
  const dup = existingNorm.some(t => {
    const p = t.slice(0, 20);
    return p === prefix || (p.length >= 6 && prefix.startsWith(p)) || (p.length >= 6 && p.startsWith(prefix));
  });
  if (dup) { console.log('DUP  ', a.title.slice(0, 45)); continue; }
  items.push({
    id: `etnet_417959_1125`,
    hash: hash(a.title),
    title: a.title,
    link: a.link,
    description: a.reason + '（2026-11-25 经 WebFetch 核验原文标题/日期/链接）',
    source_id: 'etnet_417959',
    source_name: a.source,
    source_cat: 'hk_business',
    lang: 'CH',
    pub_date: a.date,
    fetch_date: new Date().toISOString(),
    tier: a.tier,
    tier_reason: a.reason,
    status: 'active',
    ai_researched: 0,
    discovery: 'wide_topic_verified',
    created_at: new Date().toISOString(),
  });
  existingNorm.push(n);
  added++;
  console.log('ADDED', a.date, a.source, '|', a.title.slice(0, 48));
}
if (d.items) d.items = items;
fs.writeFileSync(NEWS_FILE, JSON.stringify(d, null, 2));
const active = items.filter(x => x.status === 'active' || !x.status);
console.log(`\n=== added ${added}, total active ${active.length} ===`);
