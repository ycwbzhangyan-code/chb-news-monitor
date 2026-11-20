/**
 * 补录经逐篇核验的真实新闻（etnet 经济通定存专题，含准确标题/日期/URL）
 * 全部通过 WebFetch 打开原页面核验，非推测数据
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 逐篇核验过的真实文章
const VERIFIED = [
  { id: '414869', date: '2026-11-01', title: '定期存款｜一周定存合集，港元定存鬥高息！12個月最高3.55厘，6個月低門檻3.2厘' },
  { id: '415052', date: '2026-11-02', title: '定期存款｜平安數字銀行一個月港元定存年息大幅加至20厘，大眾銀行推「雙11」定存優惠' },
  { id: '415251', date: '2026-11-03', title: '澳元｜鄭廣復：澳元受惠息差，68美仙仍穩' },
  { id: '415784', date: '2026-11-08', title: '港元定存VS活期！工銀亞洲3個月低門檻定存6厘，建行亞洲活期「月月增息」最高3.6厘' },
  { id: '416342', date: '2026-11-11', title: '定期存款｜華僑銀行推新優惠1個月港元定存最高5.5厘，信銀國際一年期加至3.4厘' },
  { id: '416689', date: '2026-11-15', title: '港元定存大比拼！美國加息預期升溫，銀行出招吸客，華僑1個月5.5厘新高，數銀最高20厘' },
  { id: '416889', date: '2026-11-16', title: '定期存款｜南商3個月港元定存息加至3.68厘，平安數字銀行推港股交易兼可賺取額外定存加息券優惠' },
];

function hashTitle(t) {
  return crypto.createHash('sha1').update((t || '').replace(/\s/g, '').toLowerCase()).digest('hex');
}

const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
const existing = new Set(news.map(n => (n.title || '').replace(/\s/g, '')));
let imported = 0;

for (const v of VERIFIED) {
  if (existing.has(v.title.replace(/\s/g, ''))) { console.log('  跳过(重复):', v.title.substring(0, 40)); continue; }
  const hash = hashTitle(v.title);
  news.push({
    id: 'etnet_' + v.id,
    hash,
    title: v.title,
    link: `https://www.etnet.com.hk/www/tc/news/topic_news_detail.php?category=special&newsid=${v.id}`,
    description: `經濟通專題報道（${v.date}）：${v.title}。涉及香港銀行定存息率及產品動態。`,
    source_id: 'etnet',
    source_name: '經濟通',
    source_cat: 'hk_business',
    lang: 'CH',
    pub_date: `${v.date}T12:00:00+08:00`,
    fetch_date: new Date().toISOString(),
    tier: 'C',
    tier_reason: '定存利率市场比较（对标Wiser收录口径）',
    status: 'active',
    ai_researched: 0,
    created_at: new Date().toISOString(),
    wiser_benchmark: true,
    verified: true,
  });
  existing.add(v.title.replace(/\s/g, ''));
  imported++;
  console.log('  补录:', v.date, v.title.substring(0, 50));
}

fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
console.log(`\n补录 ${imported} 条，现有总数: ${news.filter(n => n.status === 'active').length} 条`);
