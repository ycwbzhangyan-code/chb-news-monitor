/**
 * 最终去重 + 报告生成
 * 2026年11月5日-12日 创兴银行新闻监测完整报告
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const news = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'news_items.json'), 'utf8'));

// 筛选日期范围内的新闻
const inRange = news.filter(n => {
  const d = (n.pub_date || '').split('T')[0];
  return d >= '2026-11-05' && d <= '2026-11-12' && n.status === 'active';
});

console.log(`日期范围内原始条目: ${inRange.length}条\n`);

// 打印所有条目用于检查
inRange.forEach((n, i) => {
  console.log(`${i+1}. [${n.pub_date?.split('T')[0]}] [${n.tier}] ${n.title.substring(0,50)}`);
  console.log(`   来源: ${n.source_name} | 链接: ${n.link}`);
});

// 归一化标题
function norm(t) {
  return (t||'').replace(/\s+/g,'').replace(/【.*?】/g,'').replace(/\[.*?\]/g,'')
    .replace(/[（(].*?[）)]/g,'').replace(/[｜|].*$/,'').replace(/^.*[｜|]/,'')
    .replace(/「/g,'"').replace(/」/g,'"').replace(/"/g,'').replace(/'/g,'')
    .toLowerCase().trim();
}

// 严格去重：同一事件保留信息量最大的版本
const deduped = [];
const seen = new Set();

for (const item of inRange) {
  const key = norm(item.title).substring(0, 25);
  
  // 检查是否已存在相似条目
  const existingIdx = deduped.findIndex(d => {
    const dKey = norm(d.title).substring(0, 25);
    return dKey === key && key.length >= 5;
  });
  
  if (existingIdx >= 0) {
    // 保留正文更长的版本
    const existing = deduped[existingIdx];
    if ((item.description || '').length > (existing.description || '').length) {
      deduped[existingIdx] = item;
    }
    console.log(`\n[去重] 移除重复: ${item.title.substring(0,40)}`);
    console.log(`  保留: ${deduped[existingIdx].title.substring(0,40)}`);
  } else {
    deduped.push(item);
  }
}

console.log(`\n\n=== 去重结果 ===`);
console.log(`原始: ${inRange.length}条 → 去重后: ${deduped.length}条`);
console.log(`排除重复: ${inRange.length - deduped.length}条\n`);

// 按日期和分级排序
deduped.sort((a, b) => {
  const dateCompare = (a.pub_date||'').localeCompare(b.pub_date||'');
  if (dateCompare !== 0) return dateCompare;
  const tierOrder = { A: 0, B: 1, C: 2, X: 3 };
  return (tierOrder[a.tier]||2) - (tierOrder[b.tier]||2);
});

// 统计
const stats = {
  total_raw: inRange.length,
  total_deduped: deduped.length,
  by_tier: { A: 0, B: 0, C: 0 },
  by_date: {},
  by_source: {},
};
for (const n of deduped) {
  stats.by_tier[n.tier] = (stats.by_tier[n.tier]||0) + 1;
  const d = (n.pub_date||'').split('T')[0];
  stats.by_date[d] = (stats.by_date[d]||0) + 1;
  stats.by_source[n.source_name] = (stats.by_source[n.source_name]||0) + 1;
}

// 输出完整报告
console.log('=== 2026年11月5日-12日 创兴银行新闻监测报告 ===\n');
console.log(`报道总数(去重前): ${stats.total_raw}条`);
console.log(`报道总数(去重后): ${stats.total_deduped}条`);
console.log(`重复排除: ${stats.total_raw - stats.total_deduped}条`);
console.log(`\n分级统计:`);
console.log(`  A类(呈送行长): ${stats.by_tier.A}条`);
console.log(`  B类(重要新闻): ${stats.by_tier.B}条`);
console.log(`  C类(例行提及): ${stats.by_tier.C}条`);
console.log(`\n按日期分布:`);
Object.entries(stats.by_date).sort().forEach(([d,c]) => console.log(`  ${d}: ${c}条`));
console.log(`\n按来源分布:`);
Object.entries(stats.by_source).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => console.log(`  ${s}: ${c}条`));

console.log('\n\n=== 完整新闻列表 ===\n');
deduped.forEach((n, i) => {
  console.log(`--- ${i+1} ---`);
  console.log(`标题: ${n.title}`);
  console.log(`日期: ${(n.pub_date||'').split('T')[0]}`);
  console.log(`分级: ${n.tier}类 (${n.tier_reason})`);
  console.log(`来源: ${n.source_name}`);
  console.log(`链接: ${n.link}`);
  console.log(`正文摘要: ${(n.description||'').substring(0, 200)}...`);
  console.log('');
});

// 生成JSON报告文件
const report = {
  report_title: '创兴银行新闻监测报告',
  period: '2026-11-05 至 2026-11-12',
  generated_at: new Date().toISOString(),
  stats: {
    total_raw: stats.total_raw,
    total_deduped: stats.total_deduped,
    duplicates_removed: stats.total_raw - stats.total_deduped,
    tier_breakdown: stats.by_tier,
    date_breakdown: stats.by_date,
    source_breakdown: stats.by_source,
  },
  items: deduped.map(n => ({
    title: n.title,
    link: n.link,
    date: (n.pub_date||'').split('T')[0],
    tier: n.tier,
    tier_reason: n.tier_reason,
    source: n.source_name,
    summary: n.description || '',
  })),
};

const reportPath = path.join(DATA_DIR, 'final_report_1105_1112.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n报告已保存: ${reportPath}`);
