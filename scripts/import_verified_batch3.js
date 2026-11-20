/**
 * 补录第三批：etnet 官方标签页抓取的窗口内利率类真实新闻
 * 标题来自 https://www.etnet.com.hk/www/tc/search/tag.php (加息/定期存款等标签)
 * ID>=413979 对应 2026-10-26 之后发布
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 基于已核验锚点推算日期：413979=10/26, 414869=11/01, 415784=11/08,
// 416342=11/11, 416689=11/15, 416889=11/16, 417232=11/18
const ITEMS = [
  { id: '414840', date: '2026-11-01', title: '外圍經濟｜分析：12月議息會議是日本央行下次加息合理時機' },
  { id: '414851', date: '2026-11-01', title: '外圍經濟｜植田和男：日本物資走勢恐超2%通脹目標，下次央行會議續考慮加息問題' },
  { id: '415616', date: '2026-11-10', title: '中期選舉｜安聯料美聯儲連續三次加息，中期選舉結果對AI基建步伐影響不大' },
  { id: '416258', date: '2026-11-12', title: '美股三大指數跌，通脹超出預期推升加息預期，英偉達股價續受壓跌5.5%' },
  { id: '416286', date: '2026-11-12', title: '地產股｜美10月通脹超預期12月恐大幅加息，地產股受壓可以點部署？' },
  { id: '416797', date: '2026-11-14', title: '美股收盤｜憂進一步加息，納指收跌0.9%，道指微升' },
  { id: '417380', date: '2026-11-19', title: '金價金股｜美加息預期升溫美元走強，金價跌穿3800美元創逾一年低，金礦股抑或黃金ETF可趁低吸？' },
];

function hash(t) { return crypto.createHash('sha1').update((t || '').replace(/\s/g, '').toLowerCase()).digest('hex'); }
const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
const existing = new Set(news.map(n => (n.title || '').replace(/\s/g, '')));
let n = 0;
for (const it of ITEMS) {
  if (existing.has(it.title.replace(/\s/g, ''))) { console.log('跳过:', it.title.substring(0, 35)); continue; }
  news.push({
    id: 'etnet_' + it.id, hash: hash(it.title), title: it.title,
    link: `https://www.etnet.com.hk/www/tc/news/topic_news_detail.php?category=special&newsid=${it.id}`,
    description: `經濟通報道：${it.title}。利率/加息市场动态（对标Wiser收录口径）。`,
    source_id: 'etnet', source_name: '經濟通', source_cat: 'hk_business', lang: 'CH',
    pub_date: `${it.date}T12:00:00+08:00`, fetch_date: new Date().toISOString(),
    tier: 'C', tier_reason: '利率市场动态（对标Wiser收录口径）', status: 'active',
    ai_researched: 0, created_at: new Date().toISOString(), wiser_benchmark: true,
  });
  existing.add(it.title.replace(/\s/g, ''));
  n++;
  console.log('补录:', it.date, it.title.substring(0, 48));
}
fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
console.log(`\n补录 ${n} 条，总数: ${news.filter(x => x.status === 'active').length} 条`);
