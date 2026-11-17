/**
 * 定时采集任务
 * 每天自动运行采集，生成当日研报
 *
 * 用法：
 *   直接运行：node src/services/cronJob.js
 *   系统定时：cron 0 8 * * * cd /path/to/chb-news-site && node src/services/cronJob.js
 */
const { fetchAllSources, saveAllHits, loadAIResearch } = require('./fetcher');
const { getReportForDate, saveDailyReport } = require('./reportBuilder');
const store = require('./store');

async function runDailyJob() {
  console.log(`[${new Date().toISOString()}] 开始每日采集任务...`);
  const startTime = Date.now();

  try {
    // 1. RSS 采集 (263个RSS源，并发20)
    console.log('[1/4] 采集RSS源...');
    const { results, hits } = await fetchAllSources(7, 20);
    console.log(`  -> 采集完成: ${results.length}个源, ${hits.length}条命中`);

    // 2. AI深度研究数据
    console.log('[2/4] 加载AI深度研究数据...');
    const aiHits = loadAIResearch();
    const aiFormatted = aiHits.map(item => ({
      title: item.title,
      link: item.link,
      desc: item.desc,
      pubDate: item.date,
      source_id: item.source_id,
      source_name: item.source_name,
      source_cat: item.cat,
      lang: item.lang,
      tier_hint: item.tier_hint,
    }));
    console.log(`  -> AI研究数据: ${aiFormatted.length}条`);

    // 3. 去重入库
    console.log('[3/4] 去重入库...');
    const saveResult = saveAllHits(hits, aiFormatted);
    console.log(`  -> 新增${saveResult.newCount}条, 重复${saveResult.dupCount}条`);

    // 4. 记录日志 + 生成报告
    console.log('[4/4] 记录日志 + 生成报告...');
    store.addFetchLogs(results);

    for (let i = 0; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const report = getReportForDate(dateStr);
      if (report && report.stats.total > 0) {
        saveDailyReport(report);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] 每日采集完成，耗时 ${duration}s`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] 采集失败:`, e);
    process.exit(1);
  }
}

if (require.main === module) {
  runDailyJob();
}

module.exports = { runDailyJob };
