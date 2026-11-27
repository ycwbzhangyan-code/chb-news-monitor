/**
 * 为全年所有有新闻的日期重新生成研报归档（reports.json）。
 * 合并 Wiser 全年记录后，主库覆盖 1-11 月，需让「归档研报」视图也能看到全年。
 */
const store = require('../src/services/store');
const { getReportForDate, saveDailyReport } = require('../src/services/reportBuilder');

const all = store.getAllNews().filter(n => n.status === 'active');
const dateSet = new Set();
for (const n of all) {
  const d = store.normalizeDate(n.pub_date);
  if (d) dateSet.add(d);
}
const dates = [...dateSet].sort();

let created = 0;
for (const d of dates) {
  const report = getReportForDate(d);
  if (report && report.stats && report.stats.total > 0) {
    saveDailyReport(report);
    created++;
  }
}

const reports = store.getAllReports();
const rdates = reports.map(r => r.report_date).sort();
console.log('有新闻日期数:', dates.length, '| 已生成报告:', created);
console.log('归档报告总数:', reports.length);
console.log('归档日期范围:', rdates[0], '至', rdates[rdates.length - 1]);
console.log('按月:', JSON.stringify(rdates.reduce((a, d) => { a[d.slice(0,7)] = (a[d.slice(0,7)]||0)+1; return a; }, {})));
