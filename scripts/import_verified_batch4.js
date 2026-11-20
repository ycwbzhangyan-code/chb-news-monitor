/**
 * 补录第四批：替换官网稿件后的真实新闻（均经WebFetch核验标题+日期）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

const VERIFIED = [
  { id: '416326', date: '2026-11-11', title: '外圍經濟｜高盛調整利率預測，料今年12月及明年3月各加息25個基點' },
  { id: '415201', date: '2026-11-03', title: '金融峰會｜金監總局肖遠企：全球債務及利率上升，環球經濟有可能會滑向「負循環」' },
  { id: '414663', date: '2026-10-29', title: '美國議息｜金管局：香港貨幣及金融市場保持有序運作，套息交易有機會令港元逐步轉弱' },
  { id: '414634', date: '2026-10-29', title: '美股三大指數連升第三日，聯儲局維持利率不變，稱通脹仍偏高' },
];

function hash(t) { return crypto.createHash('sha1').update((t || '').replace(/\s/g, '').toLowerCase()).digest('hex'); }
const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
const existing = new Set(news.map(n => (n.title || '').replace(/[\s|｜]/g, '')));
let n = 0;
for (const it of VERIFIED) {
  if (existing.has(it.title.replace(/[\s|｜]/g, ''))) { console.log('跳过:', it.title.substring(0, 35)); continue; }
  news.push({
    id: 'etnet_' + it.id, hash: hash(it.title), title: it.title,
    link: `https://www.etnet.com.hk/www/tc/news/topic_news_detail.php?category=special&newsid=${it.id}`,
    description: `經濟通報道（${it.date}）：${it.title}。利率/金融环境动态（对标Wiser收录口径）。`,
    source_id: 'etnet', source_name: '經濟通', source_cat: 'hk_business', lang: 'CH',
    pub_date: `${it.date}T12:00:00+08:00`, fetch_date: new Date().toISOString(),
    tier: 'C', tier_reason: '利率/金融环境动态（对标Wiser收录口径）', status: 'active',
    ai_researched: 0, created_at: new Date().toISOString(), wiser_benchmark: true, verified: true,
  });
  existing.add(it.title.replace(/[\s|｜]/g, ''));
  n++;
  console.log('补录:', it.date, it.title.substring(0, 48));
}
fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
console.log(`\n补录 ${n} 条，总数: ${news.filter(x => x.status === 'active').length} 条`);
