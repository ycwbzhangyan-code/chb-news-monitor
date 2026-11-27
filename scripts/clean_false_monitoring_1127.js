/**
 * 清理伪监测条目（2026-11-27）
 * 用户要求：新闻库每条点开正文必须含「创兴银行」字样，否则是伪监测。
 * 依据 body_verification_1127.json 的逐条正文核验结果：
 *   - 保留 HAS_IN_BODY（正文确认含创兴）
 *   - 移除 NO_CHB_AT_ALL / TITLE_ONLY / GENERIC_LINK / 抓取失败且标题无创兴
 *   - 抓取失败但标题点名创兴的，逐条人工判定（见 UNVERIFIABLE_REMOVE）
 */
const fs = require('fs');
const path = require('path');
const NEWS_FILE = path.join(__dirname, '..', 'data', 'news_items.json');
const VFILE = path.join(__dirname, '..', 'data', 'body_verification_1127.json');

const d = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
const isArr = Array.isArray(d);
const items = isArr ? d : (d.items || d);
const V = JSON.parse(fs.readFileSync(VFILE, 'utf-8'));

// 判定 map
const verdict = {};
for (const r of V) verdict[String(r.id)] = r;

// 抓取失败但标题含创兴、仍判定移除的（链接不可达/需登录/路径错误/重复）
const UNVERIFIABLE_REMOVE = new Set([
  '4',                    // stheadline 3623151 错误路径+错误日期，与 11/25 正确版重复
  'wealth_hket_4186443',  // 404
  // mingpao/企查查/天眼查 由抓取失败且标题含创兴保留的逻辑处理，这里按 id 精确移除
]);
// 按 link 特征移除（点开看不到创兴）
const BAD_LINK_PAT = /(qichacha\.com|tianyancha\.com|news\.mingpao\.com\/pns\/經濟|hket\.com\/article\/4186443)/;

const keep = [], remove = [];
for (const item of items) {
  if (item.status !== 'active') { keep.push(item); continue; } // 非active原样保留
  const v = verdict[String(item.id)];
  let decision = 'REMOVE', why = '';
  if (v) {
    if (v.result === 'HAS_IN_BODY') { decision = 'KEEP'; why = '正文含创兴'; }
    else if (BAD_LINK_PAT.test(item.link || '')) { why = '链接不可达/需登录'; }
    else if (v.result.startsWith('FETCH') || v.result.startsWith('HTTP')) {
      // 标题点名创兴且链接可达性未确认 → 保守移除（用户标准：点开必须看到）
      why = '原文不可达,无法核验正文';
    }
    else if (v.result === 'GENERIC_LINK') why = '链接为媒体首页';
    else if (v.result === 'TITLE_ONLY') why = '正文无创兴(仅标题)';
    else why = '正文无创兴';
  } else {
    // 未在核验列表（理论上没有）— 保守移除
    why = '未核验';
  }
  if (UNVERIFIABLE_REMOVE.has(String(item.id))) { decision = 'REMOVE'; why = '重复/错误条目'; }
  (decision === 'KEEP' ? keep : remove).push({ item, why });
}

console.log('保留', keep.length, '条 | 移除', remove.length, '条');
console.log('\n=== 移除明细 ===');
for (const { item, why } of remove) console.log('  [',why,']', item.pub_date, '|', item.title.slice(0, 46));

// 写回：移除的条目标记为 excluded_false_monitoring（保留审计痕迹），不物理删除
for (const { item, why } of remove) {
  item.status = 'excluded_false_monitoring';
  item.exclusion_reason = why;
  item.excluded_at = new Date().toISOString();
}

const out = isArr ? items : (d.items = items, d);
fs.writeFileSync(NEWS_FILE, JSON.stringify(out, null, 2));
console.log('\n写回完成：active', items.filter(x => x.status === 'active').length,
            '| excluded', items.filter(x => x.status === 'excluded_false_monitoring').length);
