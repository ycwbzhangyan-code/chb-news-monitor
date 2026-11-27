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

// 全量新闻列表（支持分页、日期筛选、排序）
router.get('/news/all', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const startDate = req.query.start || '';
  const endDate = req.query.end || '';
  const tier = req.query.tier || '';
  const provenance = req.query.provenance || '';
  const sortBy = req.query.sort || 'date_desc';

  let items = store.getAllNews().filter(n => n.status === 'active');

  // 来源筛选：wiser_archive=Wiser归档 / ours=我方采集核验
  if (provenance === 'wiser_archive') {
    items = items.filter(n => n.provenance === 'wiser_archive');
  } else if (provenance === 'ours') {
    items = items.filter(n => n.provenance !== 'wiser_archive');
  }

  // 日期范围筛选
  if (startDate && endDate) {
    const s = store.normalizeDate(startDate);
    const e = store.normalizeDate(endDate);
    items = items.filter(n => {
      const d = store.normalizeDate(n.pub_date);
      return d >= s && d <= e;
    });
  }

  // 分级筛选
  if (tier && tier !== 'all') {
    items = items.filter(n => n.tier === tier);
  }

  // 排序
  if (sortBy === 'date_asc') {
    items.sort((a, b) => (a.pub_date || '').localeCompare(b.pub_date || ''));
  } else if (sortBy === 'tier') {
    const tierOrder = { B: 0, C: 1, X: 2 };
    items.sort((a, b) => (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2));
  } else {
    items.sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));
  }

  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageItems = items.slice(startIdx, startIdx + pageSize);

  res.json({
    total,
    page,
    pageSize,
    totalPages,
    items: pageItems.map(n => ({
      id: n.id,
      title: n.title,
      link: n.link,
      description: n.description || '',
      source_name: n.source_name || '',
      source_cat: n.source_cat || '',
      pub_date: n.pub_date || '',
      date_normalized: store.normalizeDate(n.pub_date),
      tier: n.tier || 'C',
      tier_reason: n.tier_reason || '',
      lang: n.lang || 'CH',
      provenance: n.provenance || 'ours',
      wiser_layer: n.wiser_layer || '',
      wiser_label: n.wiser_label || '',
      body_verified: !!n.body_verified,
    })),
  });
});

// 全量新闻导出（JSON格式，一次返回全部）
router.get('/news/export', (req, res) => {
  const format = req.query.format || 'json';
  let items = store.getAllNews().filter(n => n.status === 'active');
  items.sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));

  const formatted = items.map((n, i) => ({
    seq: i + 1,
    date: store.normalizeDate(n.pub_date),
    tier: n.tier || 'C',
    title: n.title,
    source: n.source_name || '',
    link: n.link || '',
    description: (n.description || '').substring(0, 500),
    tier_reason: n.tier_reason || '',
    lang: n.lang || 'CH',
    provenance: n.provenance || 'ours',
    source_note: n.provenance === 'wiser_archive'
      ? ('Wiser专业监测归档·' + (n.wiser_label || n.wiser_layer || ''))
      : '我方自动采集·正文核验',
    body_verified: !!n.body_verified,
  }));

  if (format === 'csv') {
    // CSV导出
    const headers = ['序号', '日期', '分级', '标题', '来源', '链接', '分级原因', '语言', '数据来源', '正文核验'];
    let csv = '\uFEFF' + headers.join(',') + '\n'; // BOM for Excel UTF-8
    for (const item of formatted) {
      const row = [
        item.seq,
        item.date,
        item.tier,
        '"' + (item.title || '').replace(/"/g, '""') + '"',
        '"' + (item.source || '').replace(/"/g, '""') + '"',
        '"' + (item.link || '').replace(/"/g, '""') + '"',
        '"' + (item.tier_reason || '').replace(/"/g, '""') + '"',
        item.lang,
        '"' + (item.source_note || '').replace(/"/g, '""') + '"',
        item.body_verified ? '已核验含创兴' : '未核验',
      ];
      csv += row.join(',') + '\n';
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chb_news_export_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  }

  // JSON格式
  res.json({
    export_date: new Date().toISOString(),
    total: formatted.length,
    date_range: {
      start: formatted.length > 0 ? formatted[formatted.length - 1].date : '',
      end: formatted.length > 0 ? formatted[0].date : '',
    },
    tier_breakdown: {
      B: formatted.filter(n => n.tier === 'B').length,
      C: formatted.filter(n => n.tier === 'C').length,
    },
    items: formatted,
  });
});

// 系统运行状态（最近采集时间、源数量等）
router.get('/system/status', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const logsFile = path.join(__dirname, '..', '..', 'data', 'fetch_logs.json');
  let lastRun = null;
  let lastRunStats = null;
  try {
    const logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
    if (logs.length > 0) {
      const latestDate = logs[logs.length - 1].run_date;
      // 找最后一次采集的所有记录
      const lastRunLogs = logs.filter(l => l.run_date === latestDate);
      lastRun = latestDate;
      lastRunStats = {
        sources: lastRunLogs.length,
        ok: lastRunLogs.filter(l => l.status === 'ok').length,
        fetched: lastRunLogs.reduce((s, l) => s + (l.items_fetched || 0), 0),
        matched: lastRunLogs.reduce((s, l) => s + (l.items_matched || 0), 0),
      };
    }
  } catch (e) { /* ignore */ }

  const stats = store.getStats();

  // 付费订阅生效倒计时（经济日报、信报）
  let paidSubscriptions = [];
  try {
    const paidFile = path.join(__dirname, '..', '..', 'config', 'paid_subscriptions.json');
    const paid = JSON.parse(fs.readFileSync(paidFile, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    paidSubscriptions = (paid.subscriptions || []).map(s => ({
      name: s.name,
      effective_date: s.effective_date,
      expiry_date: s.expiry_date,
      status: s.status,
      days_until_active: Math.ceil((new Date(s.effective_date) - new Date(today)) / 86400000),
      active: today >= s.effective_date && today <= s.expiry_date,
    }));
  } catch (e) { /* ignore */ }

  res.json({
    last_collection: lastRun,
    last_run_stats: lastRunStats,
    total_news: stats.total_items,
    latest_news_date: stats.latest_date,
    total_sources: (() => { try { return require('../../config/sources_full_config.json').sources.length; } catch (e) { return 3865; } })(),
    rss_sources: (() => { try { return require('../../config/sources_full_config.json').sources.filter(s => s.rss).length; } catch (e) { return 355; } })(),
    paid_subscriptions: paidSubscriptions,
    server_time: new Date().toISOString(),
  });
});

// 日期范围内的新闻统计（按日汇总）
router.get('/stats/daily', (req, res) => {
  const all = store.getAllNews().filter(n => n.status === 'active');
  const dailyMap = {};
  for (const n of all) {
    const d = store.normalizeDate(n.pub_date);
    if (!d) continue;
    if (!dailyMap[d]) dailyMap[d] = { date: d, total: 0, B: 0, C: 0 };
    dailyMap[d].total++;
    if (n.tier === 'B') dailyMap[d].B++;
    if (n.tier === 'C') dailyMap[d].C++;
  }
  const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
  res.json({
    total_days: daily.length,
    total_items: all.length,
    daily: daily,
  });
});

// ===== Wiser 2026 全年对标档案（分层标注，不混入正式新闻库）=====
// 2026-11-27 用户确认：全量补录 630 条；正文含创兴才算正式监测，其余单独标注为对标区
router.get('/wiser/stats', (req, res) => {
  try {
    const p = path.join(__dirname, '..', '..', 'data', 'wiser_clippings_2026.json');
    if (!fs.existsSync(p)) return res.json({ total: 0 });
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const byLayer = {};
    const byMonth = {};
    const bySource = {};
    for (const x of d) {
      byLayer[x.layer] = (byLayer[x.layer] || 0) + 1;
      const m = String(x.date).slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
      bySource[x.source] = (bySource[x.source] || 0) + 1;
    }
    const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ source: k, count: v }));
    const sortedDates = d.map(x => x.date).filter(Boolean).sort();
    res.json({
      total: d.length,
      date_range: { from: sortedDates.length ? sortedDates[0] : '', to: sortedDates.length ? sortedDates[sortedDates.length - 1] : '' },
      by_layer: byLayer,
      official_verified: byLayer.matched_ours || 0,
      reference_only: (byLayer.title_has_chb || 0) + (byLayer.wide_unverified || 0),
      by_month: byMonth,
      top_sources: topSources,
      note: 'Wiser记录表无URL/正文；仅正文核验含创兴的计入正式监测，其余为对标参考，不算我方监测成果',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/wiser/list', (req, res) => {
  try {
    const p = path.join(__dirname, '..', '..', 'data', 'wiser_clippings_2026.json');
    if (!fs.existsSync(p)) return res.json({ items: [], total: 0 });
    let d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const layer = req.query.layer || '';
    const source = req.query.source || '';
    const q = req.query.q || '';
    if (layer) d = d.filter(x => x.layer === layer);
    if (source) d = d.filter(x => x.source === source);
    if (q) { const k = q.toLowerCase(); d = d.filter(x => x.title.toLowerCase().includes(k) || x.source.toLowerCase().includes(k)); }
    const total = d.length;
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
    res.json({ total, page, pageSize, items: d.slice((page - 1) * pageSize, page * pageSize) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
