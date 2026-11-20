/**
 * 将真实抓取的理财/定存候选新闻核验后导入 news_items.json
 * 仅导入明确为"香港银行定存/汇率/利率比较"类的真实新闻
 * 对标 Wiser 收录口径，全部标为 C 类例行提及
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const CAND_FILE = path.join(__dirname, '..', 'data', 'finance_candidates.json');

// 必须包含的定存/利率核心词
const REQUIRED = ['定存', '定期', '存款', '息率', '利率', '加息', '減息', '降息', 'HIBOR', '拆息'];
// 明确的噪音词（排除）
const NOISE = ['保險', '家辦', '財務策劃師', '遺產', '基金', 'ETF', '美股', '科技股', 'AI股', '陽澄湖', '大閘蟹'];

function normDate(s) {
  if (!s) return new Date().toISOString().split('T')[0];
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0].substring(0, 10) : new Date().toISOString().split('T')[0];
}

function hashTitle(t) {
  return crypto.createHash('sha1').update((t || '').replace(/\s/g, '').toLowerCase()).digest('hex');
}

const news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
const candidates = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8'));
const existingTitles = new Set(news.map(n => (n.title || '').replace(/\s/g, '')));
const existingHashes = new Set(news.map(n => n.hash));

let imported = 0;
let skipped = 0;
const importedList = [];

for (const c of candidates) {
  const title = (c.title || '').trim();
  // 核验：必须含定存核心词
  if (!REQUIRED.some(t => title.includes(t))) { skipped++; continue; }
  // 排除噪音
  if (NOISE.some(t => title.includes(t))) { skipped++; continue; }
  // 去重
  if (existingTitles.has(title.replace(/\s/g, ''))) { skipped++; continue; }
  const hash = hashTitle(title);
  if (existingHashes.has(hash)) { skipped++; continue; }

  const pubDate = normDate(c.pubDate);
  const item = {
    id: 'fin_' + hash.substring(0, 8),
    hash,
    title,
    link: c.link || '',
    description: c.desc || `${c.source_name}报道：${title}`,
    source_id: c.source_id || 'finance_wire',
    source_name: c.source_name || '香港财经媒体',
    source_cat: c.source_cat || 'hk_business',
    lang: 'CH',
    pub_date: pubDate,
    fetch_date: new Date().toISOString(),
    tier: c.tier_hint === 'B' ? 'B' : 'C',
    tier_reason: c.tier_reason || '定存利率市场比较（对标Wiser收录口径）',
    status: 'active',
    ai_researched: 0,
    created_at: new Date().toISOString(),
    wiser_benchmark: true,
  };
  news.push(item);
  existingTitles.add(title.replace(/\s/g, ''));
  existingHashes.add(hash);
  imported++;
  importedList.push(item);
}

fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));

console.log(`\n导入完成：`);
console.log(`  新增: ${imported} 条`);
console.log(`  跳过: ${skipped} 条（重复或非定存类）`);
console.log(`  现有总数: ${news.filter(n => n.status === 'active').length} 条`);
console.log('\n新增新闻列表:');
importedList.forEach((n, i) => console.log(`  ${i + 1}. [${n.pub_date.substring(0,10)}] ${n.title.substring(0, 60)}`));
