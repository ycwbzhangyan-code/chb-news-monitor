/**
 * 补录用户指出、经 curl 抓取核验的真实新闻（2026-11-27）
 *
 * 条目: 中国金融商报网 11/19「功率半导体龙头闻泰科技亮相央视 APEC 财经之夜」
 *   - URL: http://china.prcfe.com/global/2026/1119/116537.html
 *   - 核验方式: WebFetch 返回404，改用 curl -A Mozilla/5.0 抓到 HTML，UTF-8 解码
 *   - 标题/时间(2026-11-19 19:49:03)/来源(互联网)/正文均已核验
 *   - 正文原句: 「客户资金...与大众银行(香港)、创兴银行等持牌银行合作」
 *   - 按 Wiser 宽口径（正文点名创兴即算）收录为 C 类；创兴非主体，标 wide_topic_verified
 *   - 漏检根因: 该源在配置中为 crawl_only（无 RSS），系统只抓 RSS 源，从未抓过该站
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const d = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
const items = d.items || d;
const hash = t => crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);
function norm(s) { return String(s || '').replace(/[\s，。：、｜|「」《》（）()【】\[\].,…*"“”]/g, '').toLowerCase(); }

const ADDS = [
  {
    title: '功率半导体龙头闻泰科技亮相央视 “APEC 财经之夜”： 开放合作赋能 AI 与新能源，筑牢全球能源基座',
    date: '2026-11-19',
    source: '中国金融商报网',
    link: 'http://china.prcfe.com/global/2026/1119/116537.html',
    tier: 'C',
    reason: 'Wiser宽口径：正文「客户资金...与大众银行(香港)、创兴银行等持牌银行合作」点名创兴银行（非新闻主体，邻近窗口）',
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
  if (dup) { console.log('DUP  ', a.title.slice(0, 50)); continue; }
  items.push({
    id: `prcfe_116537_1127`,
    hash: hash(a.title),
    title: a.title,
    link: a.link,
    description: a.reason + '（2026-11-27 经 curl 抓取原文核验标题/时间/URL/正文；该源为crawl_only无RSS故此前漏检）',
    source_id: 's2613',
    source_name: a.source,
    source_cat: 'hk_print',
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
  console.log('ADDED', a.date, a.source, '|', a.title.slice(0, 50));
}

fs.writeFileSync(NEWS_FILE, JSON.stringify(items, null, 2));
console.log('\n完成：新增', added, '条；当前总条目', items.length);
