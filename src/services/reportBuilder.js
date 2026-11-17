/**
 * 每日报告生成器
 */
const store = require('./store');

function buildReportStructure(items, dateStr) {
  const tierB = items.filter(i => i.tier === 'B');
  const tierC = items.filter(i => i.tier === 'C');
  const tierX = items.filter(i => i.tier === 'X');

  const byCategory = {};
  for (const item of items) {
    const cat = item.source_cat || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const summary = generateSummary(tierB, tierC, dateStr);

  return {
    report_date: dateStr,
    generated_at: new Date().toISOString(),
    stats: {
      total: items.length,
      A: 0,
      B: tierB.length,
      C: tierC.length,
      X: tierX.length,
    },
    summary,
    tiers: { B: tierB, C: tierC, X: tierX },
    by_category: byCategory,
  };
}

function generateSummary(tierB, tierC, dateStr) {
  const parts = [];
  if (tierB.length > 0) {
    parts.push(`B类·重要新闻 ${tierB.length} 条`);
    for (const item of tierB.slice(0, 5)) parts.push(`  - ${item.title}`);
  }
  if (tierC.length > 0) {
    parts.push(`C类·例行提及 ${tierC.length} 条`);
  }
  if (tierB.length === 0 && tierC.length === 0) {
    parts.push('今日未监测到涉及创兴银行的新闻。');
  }
  return parts.join('\n');
}

function getReportForDate(dateStr) {
  const items = store.getNewsByDate(dateStr);
  return buildReportStructure(items, dateStr);
}

function getLatestReport() {
  const stats = store.getStats();
  if (!stats.latest_date) {
    // 尝试从已存报告获取
    const reports = store.getAllReports();
    if (reports.length > 0) return reports[0];
    return null;
  }
  const dateStr = store.normalizeDate(stats.latest_date);
  return getReportForDate(dateStr);
}

function getReportRange(start, end) {
  const items = store.getNewsByDateRange(start, end);
  const byDate = {};
  for (const item of items) {
    const d = store.normalizeDate(item.pub_date);
    if (!d) continue;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(item);
  }
  const reports = [];
  for (const [date, dayItems] of Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))) {
    reports.push(buildReportStructure(dayItems, date));
  }
  return { range: { start, end }, total_days: reports.length, total_items: items.length, daily_reports: reports };
}

function saveDailyReport(report) {
  store.saveReport(report);
}

function getReportList(limit = 30) {
  const reports = store.getAllReports();
  return reports.slice(0, limit).map(r => ({
    report_date: r.report_date,
    total_items: r.stats.total,
    a_count: r.stats.A,
    b_count: r.stats.B,
    c_count: r.stats.C,
    x_count: r.stats.X,
    summary: r.summary,
    generated_at: r.generated_at,
  }));
}

module.exports = {
  getReportForDate,
  getLatestReport,
  getReportRange,
  saveDailyReport,
  getReportList,
  buildReportStructure,
};
