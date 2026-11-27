/**
 * 补录 2026-11-27 经 WebFetch 完整核验的真实新闻
 * 原则：只补能拿到真实标题+链接+日期+正文核验的条目，绝不照抄截图推测标题。
 *
 * 条目1: 星島頭條 11/25「定存攻略｜美元定期存款大比拼」
 *   - 标题、发布时间 2026-11-25 13:49 HKT、真实 URL 均经 WebFetch 核验
 *   - 正文含「创兴银行云利率定存1万至600万美元3个月有4.15厘」→ 符合 Wiser 宽口径
 *   - 之前漏检根因：标题不含创兴 + RSS摘要不含正文 → matchKeywords 第1步漏掉（已修复）
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
    title: '定存攻略｜美元定期存款大比拼 经济数据公布前夕多间银行加息',
    date: '2026-11-25',
    source: '星島頭條',
    link: 'https://www.stheadline.com/zh-hans/investment/3623151/定存攻略美元定期存款大比拼-经济数据公布前夕多间银行加息',
    tier: 'C',
    reason: 'Wiser宽口径：正文含「创兴银行云利率定存1万至600万美元3个月有4.15厘」，创兴列入美元定存利率比较表（邻近窗口）',
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
    id: `stheadline_3623151_1127`,
    hash: hash(a.title),
    title: a.title,
    link: a.link,
    description: a.reason + '（2026-11-27 经 WebFetch 核验原文标题/发布时间/URL/正文）',
    source_id: 'stheadline_3623151',
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

fs.writeFileSync(NEWS_FILE, JSON.stringify(items, null, 2));
console.log('\n完成：新增', added, '条；当前总条目', items.length);
