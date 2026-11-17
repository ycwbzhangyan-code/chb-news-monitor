/**
 * 补入WiseNews付费系统监测到的14条遗漏新闻
 * 删除Super Mouse法文误报
 * 将所有现有A类新闻降为B类
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const news = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 1. 删除误报（Super Mouse法文新闻）
const filtered = news.filter(n => !n.title.includes('Super Mouse') && !n.title.includes('MacGeneration'));
console.log('删除误报:', news.length - filtered.length, '条');

// 2. 将所有A类降为B类
let aToB = 0;
for (const n of filtered) {
  if (n.tier === 'A') {
    n.tier = 'B';
    n.tier_reason = n.tier_reason ? n.tier_reason.replace(/高危关键词:?/, '重要新闻') : '重要新闻';
    aToB++;
  }
}
console.log('A类降为B类:', aToB, '条');

// 3. 补入14条遗漏新闻（来自WiseNews付费系统）
const missingNews = [
  {
    id: 'wn_580',
    title: '創興銀行參與「香港國際海岸清潔運動 2026」',
    link: 'https://www.hkcd.com.hk/',
    description: '匯港通訊報道：創興銀行參與「香港國際海岸清潔運動2026」，組織義工前往石澳後灘清理海岸垃圾，以實際行動守護海洋環境。創興銀行自2017年累計舉辦逾100場公益活動。',
    source_name: '匯港通訊',
    source_cat: 'news_agency',
    pub_date: '2026-11-05T00:00:00+08:00',
    tier: 'B',
    tier_reason: 'ESG/公益活動',
    status: 'active',
    fingerprint: 'wn_580_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_581',
    title: '惠譽：首次授予廣州越秀集團"A-"長期發行人評級，展望穩定',
    link: 'https://www.jiuzhicai.com/',
    description: '久期財經報道：惠譽評級首次授予廣州越秀集團"A-"長期發行人違約評級，展望穩定。越秀集團為創興銀行母公司，2021年完成私有化。集團資產總額超10,000億元。',
    source_name: '久期财经',
    source_cat: 'hk_business',
    pub_date: '2026-11-05T00:00:00+08:00',
    tier: 'B',
    tier_reason: '母公司評級動態',
    status: 'active',
    fingerprint: 'wn_581_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_582',
    title: '港元定存 掉頭減息',
    link: 'https://wealth.hket.com/article/3947091',
    description: '香港經濟日報報道：港元定期存款利率掉頭減息，多家銀行下調定存息率。創興銀行等本地銀行亦調整港元定存利率。文章比較各銀行最新定存息率。',
    source_name: '香港經濟日報',
    source_cat: 'hk_print',
    pub_date: '2026-11-06T00:00:00+08:00',
    tier: 'B',
    tier_reason: '利率變動',
    status: 'active',
    fingerprint: 'wn_582_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_583',
    title: '澳元短期定存最高8.88厘 須防匯兌風險',
    link: 'https://news.mingpao.com/',
    description: '明報報道：澳元短期定存息率最高達8.88厘，但投資者須防範匯兌風險。創興銀行提供澳元定存4.7厘年息。文章提醒外幣定存需考慮匯率波動風險。',
    source_name: '明報',
    source_cat: 'hk_print',
    pub_date: '2026-11-06T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存產品比較',
    status: 'active',
    fingerprint: 'wn_583_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_584',
    title: '港元定期2026丨88厘vs20厘超短期綽頭多 最新盤點',
    link: 'https://www.reuters.com/',
    description: '信報財經新聞網報道：2026年港元定期存款利率盤點，88厘vs20厘超短期定存優惠多。創興銀行在比較名單中列出。文章盤點各銀行最新短期定存息率。',
    source_name: '信報財經新聞網',
    source_cat: 'hk_print',
    pub_date: '2026-11-06T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_584_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_586',
    title: '港元定期｜3個月年利率3.8厘 新一年賺$9,400！安穩保本度過年',
    link: 'https://wealth.hket.com/',
    description: '香港經濟日報網報道：3個月港元定期年利率3.8厘，新一年可賺$9,400。創興銀行在比較名單中。文章推薦安穩保本的定存方案。',
    source_name: '香港經濟日報網',
    source_cat: 'hk_print',
    pub_date: '2026-11-07T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_586_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_587',
    title: '歐元兌港元匯率 | 香港逾22間銀行/找換店兌換歐元匯價比較｜每日更新',
    link: 'https://www.ulifestyle.com.hk/',
    description: 'U Lifestyle報道：歐元兌港元匯率比較，涵蓋香港逾22間銀行及找換店的歐元兌換匯價。創興銀行在比較名單中。每日更新匯率資訊。',
    source_name: 'U Lifestyle',
    source_cat: 'hk_business',
    pub_date: '2026-11-07T00:00:00+08:00',
    tier: 'C',
    tier_reason: '匯率比較中提及',
    status: 'active',
    fingerprint: 'wn_587_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_588',
    title: '6個月港元定期｜最高4厘門檻高、新舊資金3.4厘推介 7銀行3.2厘以上',
    link: 'https://wealth.hket.com/',
    description: '香港經濟日報網報道：6個月港元定期最高4厘但門檻高，新舊資金3.4厘推介。7間銀行提供3.2厘以上息率。創興銀行在比較名單中。',
    source_name: '香港經濟日報網',
    source_cat: 'hk_print',
    pub_date: '2026-11-08T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_588_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_589',
    title: '港元定存｜1個月速賺$3,500！5款10厘至20厘精選 年尾自製花紅',
    link: 'https://wealth.hket.com/',
    description: '香港經濟日報網報道：1個月港元定存可速賺$3,500，精選5款10厘至20厘高息定存。創興銀行在比較名單中。年尾自製花紅的定存攻略。',
    source_name: '香港經濟日報網',
    source_cat: 'hk_print',
    pub_date: '2026-11-10T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_589_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_590',
    title: '兌換台幣攻略｜7大台幣兌換最抵心得ATM提款唔係最平？港元換台幣哪裡換',
    link: 'https://www.ulifestyle.com.hk/',
    description: 'U Lifestyle報道：台幣兌換攻略，7大台幣兌換最抵心得。創興銀行在銀行兌換匯率比較中提及。文章比較ATM提款、銀行櫃檯和找換店的匯率差異。',
    source_name: 'U Lifestyle',
    source_cat: 'hk_business',
    pub_date: '2026-11-10T00:00:00+08:00',
    tier: 'C',
    tier_reason: '匯率比較中提及',
    status: 'active',
    fingerprint: 'wn_590_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_591',
    title: '稅務貸款是甚麼？了解稅貸用途、好處及風險',
    link: 'https://wealth.hket.com/',
    description: '香港經濟日報網報道：稅務貸款科普文章，介紹稅貸用途、好處及風險。創興銀行在稅貸產品比較中提及，稅貸APR低至1.28%，回贈最高2萬元。',
    source_name: '香港經濟日報網',
    source_cat: 'hk_print',
    pub_date: '2026-11-11T00:00:00+08:00',
    tier: 'B',
    tier_reason: '貸款產品比較',
    status: 'active',
    fingerprint: 'wn_591_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_592',
    title: '儲局下月加息幾成定局 美元定期存款息率大比拼',
    link: 'https://www.stheadline.com/',
    description: '星島頭條網報道：美國聯儲局下月加息幾成定局，各大銀行美元定期存款息率大比拼。創興銀行6個月美元定存年利率4.1厘在比較中列出。',
    source_name: '星島頭條網',
    source_cat: 'hk_print',
    pub_date: '2026-11-11T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_592_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_595',
    title: '港元定存2026｜新客優惠全攻略：富融派25厘息全城最高 眾安20厘/建行12厘/花旗4.3厘大比拼',
    link: 'https://www.ulifestyle.com.hk/',
    description: 'U Lifestyle報道：2026年港元定存新客優惠全攻略。富融銀行派25厘息全城最高，眾安20厘、建行12厘、花旗4.3厘。創興銀行在新客定存優惠比較中列出。',
    source_name: 'U Lifestyle',
    source_cat: 'hk_business',
    pub_date: '2026-11-11T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存優惠比較',
    status: 'active',
    fingerprint: 'wn_595_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_597',
    title: '創興6個月美元定存年利率4.1厘',
    link: 'https://finance.mingpao.com/',
    description: '明報財經網報道：創興銀行6個月美元定存年利率4.1厘。與其他銀行美元定存息率比較。',
    source_name: '明報財經網',
    source_cat: 'hk_print',
    pub_date: '2026-11-11T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存產品',
    status: 'active',
    fingerprint: 'wn_597_hash',
    collected_at: new Date().toISOString(),
  },
  {
    id: 'wn_599',
    title: '港元定存2026｜全港18大銀行利率大比拼！低門檻之選 無需做任務 最高達4.3厘！',
    link: 'https://www.ulifestyle.com.hk/',
    description: 'U Lifestyle報道：全港18大銀行港元定存利率大比拼。低門檻之選無需做任務，最高達4.3厘。創興銀行在18大銀行利率比較中列出。',
    source_name: 'U Lifestyle',
    source_cat: 'hk_business',
    pub_date: '2026-11-12T00:00:00+08:00',
    tier: 'B',
    tier_reason: '定存比較',
    status: 'active',
    fingerprint: 'wn_599_hash',
    collected_at: new Date().toISOString(),
  },
];

// 去重检查：确保不与已有新闻重复
const existingTitles = new Set(filtered.map(n => {
  const t = n.title.replace(/[\s\*，,。]/g, '').toLowerCase();
  return t.substring(0, 12);
}));

let added = 0;
for (const item of missingNews) {
  const key = item.title.replace(/[\s\*，,。]/g, '').toLowerCase().substring(0, 12);
  if (!existingTitles.has(key)) {
    filtered.push(item);
    existingTitles.add(key);
    added++;
    console.log('  +', item.source_name, '|', item.title.substring(0, 30));
  } else {
    console.log('  跳过(重复):', item.title.substring(0, 30));
  }
}

console.log('\n补入:', added, '条新新闻');
console.log('总新闻数:', filtered.length, '(原', news.length, ')');

// 写回
fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2));

// 统计11.5-11.12范围
const inRange = filtered.filter(n => {
  const d = (n.pub_date || '').split('T')[0];
  return d >= '2026-11-05' && d <= '2026-11-12' && n.status === 'active';
});
console.log('\n11.5-11.12范围内:', inRange.length, '条');

const tierB = inRange.filter(n => n.tier === 'B');
const tierC = inRange.filter(n => n.tier === 'C');
console.log('  B类:', tierB.length, '条');
console.log('  C类:', tierC.length, '条');

// 按来源统计
const sources = {};
inRange.forEach(n => { sources[n.source_name] = (sources[n.source_name]||0)+1; });
console.log('\n按来源:');
Object.entries(sources).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => console.log('  ', s, ':', c));
