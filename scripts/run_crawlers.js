/**
 * 爬虫统一调度器 — 运行所有站点爬虫
 * 
 * 使用方式：
 *   node scripts/run_crawlers.js          # 运行所有爬虫
 *   node scripts/run_crawlers.js hkcd      # 仅运行匯港通訊
 *   node scripts/run_crawlers.js ulife     # 仅运行U Lifestyle
 * 
 * 采集中：
 *   1. 各爬虫独立运行，互不依赖
 *   2. 结果统一合并到 data/news_items.json
 *   3. 去重后更新报告
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

async function runAll() {
  const target = process.argv[2] || 'all';
  const results = [];
  
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   创兴银行新闻监测 · 爬虫调度器      ║');
  console.log('║   目标: 补充无RSS媒体的新闻报道      ║');
  console.log('╚══════════════════════════════════════╝\n');
  
  // 1. 匯港通訊
  if (target === 'all' || target === 'hkcd') {
    try {
      const { crawlHKCD } = require('./crawler_hkcd');
      const result = await crawlHKCD(7);
      results.push(result);
    } catch (e) {
      console.error('[匯港通訊] 爬虫异常:', e.message);
      results.push({ source: 'hkcd', totalScanned: 0, totalMatched: 0, newHits: [], error: e.message });
    }
  }
  
  // 2. U Lifestyle
  if (target === 'all' || target === 'ulife') {
    try {
      const { crawlULifestyle } = require('./crawler_ulifestyle');
      const result = await crawlULifestyle(7);
      results.push(result);
    } catch (e) {
      console.error('[U Lifestyle] 爬虫异常:', e.message);
      results.push({ source: 'ulifestyle', totalScanned: 0, totalMatched: 0, newHits: [], error: e.message });
    }
  }
  
  // 汇总写入
  const allNewHits = results.flatMap(r => r.newHits || []);
  
  if (allNewHits.length > 0) {
    const news = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    // 再次去重
    const existingKeys = new Set(news.map(n => {
      const t = (n.title || '').replace(/[\s\*，,。]/g, '').toLowerCase().substring(0, 12);
      return n.link || t;
    }));
    
    const trulyNew = allNewHits.filter(h => {
      const key = h.link || (h.title || '').replace(/[\s\*，,。]/g, '').toLowerCase().substring(0, 12);
      return !existingKeys.has(key);
    });
    
    if (trulyNew.length > 0) {
      news.push(...trulyNew);
      fs.writeFileSync(DATA_FILE, JSON.stringify(news, null, 2));
      console.log(`\n📝 已写入 ${trulyNew.length} 条新新闻到 data/news_items.json`);
    } else {
      console.log('\n📝 本轮所有命中均已存在，无新数据写入');
    }
  }
  
  // 汇总报告
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║           爬虫汇总报告               ║');
  console.log('╠══════════════════════════════════════╣');
  for (const r of results) {
    const name = r.source === 'hkcd' ? '匯港通訊' : r.source === 'ulifestyle' ? 'U Lifestyle' : r.source;
    const status = r.error ? `错误: ${r.error}` : `扫描${r.totalScanned} / 命中${r.totalMatched}`;
    console.log(`║  ${name.padEnd(16)} ${status.padEnd(28)} ║`);
  }
  console.log(`║  ${'新增总数:'.padEnd(16)} ${(allNewHits.length + ' 条').padEnd(28)} ║`);
  console.log('╚══════════════════════════════════════╝\n');
}

runAll().catch(e => {
  console.error('调度器异常:', e);
  process.exit(1);
});
