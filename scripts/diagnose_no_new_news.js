#!/usr/bin/env node
/**
 * 只读诊断：为什么连续几天没有新新闻入库？
 * 实跑采集 → 过闸门 → 但绝不写库。统计闸门拒绝原因 + 通过条目的日期分布。
 */
const { fetchAllSources, guardHit, hashTitle } = require('../src/services/fetcher');
const store = require('../src/services/store');

(async () => {
  const now = new Date();
  console.log('=== 诊断时间', now.toISOString(), '===\n');
  const { results, hits } = await fetchAllSources(7, 20);
  console.log('源返回', results.length, '| 关键词命中 hits', hits.length, '\n');

  // 现有库 hash 集合
  const existing = store.getAllNews ? store.getAllNews() : [];
  const allItems = Array.isArray(existing) ? existing : (existing.items || []);
  const existingHashes = new Set(allItems.map(x => x.hash).filter(Boolean));
  console.log('现有库条目', allItems.length, '\n');

  const pass = [], reject = {};
  for (const h of hits) {
    const g = guardHit(h);
    if (g.pass) pass.push({ ...h, layer: g.layer, date: store.normalizeDate(h.pubDate || h.date) });
    else reject[g.reason] = (reject[g.reason] || 0) + 1;
  }
  console.log('=== 闸门拒绝原因 ===');
  Object.entries(reject).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(' ',v,k));

  console.log('\n=== 通过闸门', pass.length, '条 ===');
  const byDate = {};
  for (const p of pass) { const d = p.date || 'no_date'; byDate[d] = (byDate[d]||0)+1; }
  Object.entries(byDate).sort().reverse().forEach(([d,n])=>console.log(' ',d,n,'条'));

  // 通过的里面，去重后真正的新条目
  let newCount = 0;
  const newByDate = {};
  for (const p of pass) {
    const hash = hashTitle(p.title);
    if (!existingHashes.has(hash)) {
      newCount++;
      const d = p.date || 'no_date';
      newByDate[d] = (newByDate[d]||0)+1;
    }
  }
  console.log('\n=== 过闸门且去重后真正新条目', newCount, '条 ===');
  Object.entries(newByDate).sort().reverse().forEach(([d,n])=>console.log(' ',d,n,'条'));

  // 重点：11/25 之后的通过条目明细
  const recent = pass.filter(p => p.date && p.date >= '2026-11-25');
  console.log('\n=== 11/25 及以后通过闸门的条目明细（', recent.length, '条）===');
  for (const p of recent.slice(0, 40)) {
    const hash = hashTitle(p.title);
    console.log(' ', p.date, existingHashes.has(hash)?'[已有]':'[新]', '|', p.layer, '|', p.source_name, '|', String(p.title).slice(0,70));
  }
  process.exit(0);
})();
