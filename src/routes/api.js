/**
 * API 路由
 */
const express = require('express');
const router = express.Router();

const store = require('../services/store');
const { getReportForDate, getLatestReport, getReportRange, saveDailyReport, getReportList } = require('../services/reportBuilder');

// 首页 - 最新研报
router.get('/report/latest', (req, res) => {
  const report = getLatestReport();
  if (!report) {
    return res.json({ error: 'no_data', message: '暂无报告数据，请先运行采集' });
  }
  res.json(report);
});

// 指定日期研报
router.get('/report/:date', (req, res) => {
  const date = req.params.date;
  const report = getReportForDate(date);
  res.json(report);
});

// 报告归档列表
router.get('/reports/list', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const list = getReportList(limit);
  res.json(list);
});

// 媒体源状态 — 支持分页和分类筛选
const fs = require('fs');
const path = require('path');

router.get('/sources/status', (req, res) => {
  // 优先加载3793条完整配置
  const fullConfigPath = path.join(__dirname, '..', '..', 'config', 'sources_full_config.json');
  const fallbackPath = path.join(__dirname, '..', '..', 'config', 'sources.json');
  
  let SOURCES;
  if (fs.existsSync(fullConfigPath)) {
    SOURCES = require(fullConfigPath);
  } else {
    SOURCES = require(fallbackPath);
  }
  
  const statusMap = store.getSourceStatus();
  
  // 支持分页和分类筛选
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const catFilter = req.query.cat || '';
  const rssOnly = req.query.rssOnly === '1';
  
  let filtered = SOURCES.sources;
  if (catFilter) {
    filtered = filtered.filter(s => s.cat === catFilter);
  }
  if (rssOnly) {
    filtered = filtered.filter(s => s.rss && s.rss.length > 0);
  }
  
  const total = filtered.length;
  const startIdx = (page - 1) * pageSize;
  const pageSources = filtered.slice(startIdx, startIdx + pageSize);
  
  const fullList = pageSources.map(s => ({
    ...s,
    status: statusMap[s.id] || null,
  }));

  res.json({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    with_rss: SOURCES.sources.filter(s => s.rss && s.rss.length > 0).length,
    total_sources: SOURCES.sources.length,
    sources: fullList,
    categories: SOURCES.meta.categories || {},
  });
});

// 触发手动采集
router.post('/fetch/run', async (req, res) => {
  res.json({ status: 'started', message: '采集任务已启动' });

  try {
    const { fetchAllSources, saveAllHits, loadAIResearch } = require('../services/fetcher');
    const { saveDailyReport } = require('../services/reportBuilder');

    console.log('[Fetch] 开始采集...');
    const { results, hits } = await fetchAllSources(7, 20);
    console.log(`[Fetch] RSS完成: ${results.length}源, ${hits.length}命中`);

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

    const saveResult = saveAllHits(hits, aiFormatted);
    console.log(`[Fetch] 入库: 新增${saveResult.newCount}, 重复${saveResult.dupCount}`);

    store.addFetchLogs(results);

    // 生成最近7天报告
    for (let i = 0; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const report = getReportForDate(dateStr);
      if (report && report.stats.total > 0) {
        saveDailyReport(report);
      }
    }

    console.log('[Fetch] 采集任务完成');
  } catch (e) {
    console.error('[Fetch] 失败:', e);
  }
});

// 搜索新闻
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ items: [], total: 0 });
  const items = store.searchNews(q);
  res.json({ items, total: items.length });
});

// 统计数据
router.get('/stats', (req, res) => {
  res.json(store.getStats());
});

module.exports = router;
