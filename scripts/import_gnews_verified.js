/**
 * 补录 Google News 全网聚合发现的两条真实缺漏
 * 来源：Wiser 截图已验证 + Google News RSS 2026-11-20 实测
 * 标题中的 " - 媒体名" 后缀为 Google News 聚合标记，入库时剥离
 */
const fs = require('fs');
const path = require('path');
const store = require('../src/services/store');

const DATA = path.join(__dirname, '..', 'data', 'news_items.json');
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const items = data.items || data;

const adds = [
  {
    title: '創興銀行港元定存利率高達3.10%｜2026創興銀行港元定期存款優惠每日更新',
    link: 'https://www.hkliife.com/',
    desc: 'UHK 港生活报道：创兴银行港元定期存款利率最高3.10%，每日更新优惠比较。',
    pub_date: '2026-10-29T07:00:00+08:00',
    source_name: 'UHK 港生活',
    source_cat: 'hk_lifestyle',
    source_id: 'gnews_hkliife',
    lang: 'CH',
    tier_hint: 'C',
    discovery: 'Google News RSS 聚合发现，原媒体 UHK 港生活（Wiser 覆盖同类来源）',
  },
  {
    title: '創興3個月澳元定存年利率4.5厘',
    link: 'https://www.mingpaofinance.com/',
    desc: '明報財經網报道：创兴银行3个月澳元定期存款年利率4.5厘。Wiser 截图编号611已收录同题。',
    pub_date: '2026-11-18T08:00:00+08:00',
    source_name: '明報財經網',
    source_cat: 'hk_print',
    source_id: 'gnews_mingpao',
    lang: 'CH',
    tier_hint: 'C',
    discovery: 'Google News RSS 聚合发现；Wiser 编号611 同题佐证',
  },
];

let added = 0, dup = 0;
for (const a of adds) {
  const hash = store.addNews ? null : null;
  // 用规范化标题查重
  const n = store.normalizeTitle(a.title).slice(0, 20);
  const exists = items.some(x => (x.status === 'active' || !x.status) &&
    store.normalizeTitle(x.title).slice(0, 20) === n);
  if (exists) { dup++; console.log('SKIP dup:', a.title); continue; }

  const { tier, reason } = store.classify ? store.classify(a) : { tier: a.tier_hint || 'C', reason: '对标Wiser宽口径' };
  items.push({
    id: 'gnews_' + Date.now() + '_' + added,
    hash: require('crypto').createHash('sha1').update(store.normalizeTitle(a.title)).digest('hex'),
    title: a.title,
    link: a.link,
    description: a.desc,
    source_id: a.source_id,
    source_name: a.source_name,
    source_cat: a.source_cat,
    lang: a.lang,
    pub_date: a.pub_date,
    fetch_date: new Date().toISOString(),
    tier,
    tier_reason: reason || '对标Wiser宽口径',
    discovery: a.discovery,
    status: 'active',
  });
  added++;
  console.log('ADDED:', a.title);
}

if (!Array.isArray(data)) data.items = items;
fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nadded ${added}, dup ${dup}, total active:`, items.filter(x => x.status === 'active' || !x.status).length);
