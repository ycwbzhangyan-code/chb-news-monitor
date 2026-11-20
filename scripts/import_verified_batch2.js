/**
 * 补录第二批经 WebFetch 逐篇核验的真实新闻
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

const VERIFIED = [
  { id: '413979', date: '2026-10-26', title: '定期存款｜一周定存合集，富融7天港元定存年息高達21厘，渣打3個月加至3.05厘', reason: '定存利率市场比较（对标Wiser口径）' },
  { id: '416266', date: '2026-11-11', title: '真知灼見－溫灼培｜市場估聯儲局加息至明年6月', reason: '利率走势分析（对标Wiser口径）' },
  { id: '417232', date: '2026-11-18', title: '外圍經濟｜基準10年期美債連升三天，市場風險偏好降溫', reason: '利率市场动态（对标Wiser口径）' },
];

function hashTitle(t) { return crypto.createHash('sha1').update((t || '').replace(/\s/g, '').toLowerCase()).digest('hex'); }
const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
const existing = new Set(news.map(n => (n.title || '').replace(/\s/g, '')));
let count = 0;
for (const v of VERIFIED) {
  if (existing.has(v.title.replace(/\s/g, ''))) { console.log('跳过:', v.title.substring(0, 35)); continue; }
  const hash = hashTitle(v.title);
  news.push({
    id: 'etnet_' + v.id, hash, title: v.title,
    link: `https://www.etnet.com.hk/www/tc/news/topic_news_detail.php?category=special&newsid=${v.id}`,
    description: `經濟通報道（${v.date}）：${v.title}`,
    source_id: 'etnet', source_name: '經濟通', source_cat: 'hk_business', lang: 'CH',
    pub_date: `${v.date}T12:00:00+08:00`, fetch_date: new Date().toISOString(),
    tier: 'C', tier_reason: v.reason, status: 'active', ai_researched: 0,
    created_at: new Date().toISOString(), wiser_benchmark: true, verified: true,
  });
  existing.add(v.title.replace(/\s/g, ''));
  count++;
  console.log('补录:', v.date, v.title.substring(0, 50));
}
fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
console.log(`补录 ${count} 条，总数: ${news.filter(n => n.status === 'active').length} 条`);
