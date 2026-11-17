/**
 * JSON 文件数据存储层
 * 使用纯 JSON 文件存储新闻条目和报告，无需原生编译
 */
const fs = require('fs');
const path = require('path');

// 数据目录 — Vercel serverless 环境的文件系统只读，需降级到 /tmp
let DATA_DIR = path.join(__dirname, '..', '..', 'data');
try {
  // 测试目录是否可写
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch (e) {
  // 不可写时使用 /tmp（仅读操作正常，写入会静默失败，由 git commit 机制在 CI 中持久化）
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.warn('[Store] 数据目录只读，serverless 模式使用内存/只读读取');
  }
}

const NEWS_FILE = path.join(DATA_DIR, 'news_items.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const LOGS_FILE = path.join(DATA_DIR, 'fetch_logs.json');
const SOURCES_STATUS_FILE = path.join(DATA_DIR, 'source_status.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('[Store] 无法创建数据目录:', e.message);
  }
}

// 初始化文件
function initFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    } catch (e) {
      console.warn(`[Store] 无法初始化 ${path.basename(filePath)}: ${e.message}`);
    }
  }
}

initFile(NEWS_FILE, []);
initFile(REPORTS_FILE, []);
initFile(LOGS_FILE, []);
initFile(SOURCES_STATUS_FILE, {});

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.warn(`[Store] 写入 ${path.basename(filePath)} 失败: ${e.message}`);
    return false;
  }
}

// ===== 新闻条目 =====
function getAllNews() {
  return readJSON(NEWS_FILE) || [];
}

function addNews(items) {
  const existing = getAllNews();
  const existingHashes = new Set(existing.map(n => n.hash));
  const existingTitles = existing.map(n => n.title);

  let newCount = 0;
  let dupCount = 0;

  for (const item of items) {
    // SHA1去重
    if (existingHashes.has(item.hash)) {
      dupCount++;
      continue;
    }
    // 前30字二次匹配
    const normTitle = normalizeTitle(item.title);
    const prefix = normTitle.substring(0, 30);
    if (prefix.length >= 5 && existingTitles.some(t => normalizeTitle(t).substring(0, 30) === prefix)) {
      dupCount++;
      continue;
    }

    existing.push({
      id: existing.length + 1,
      ...item,
      created_at: new Date().toISOString(),
    });
    existingHashes.add(item.hash);
    existingTitles.push(item.title);
    newCount++;
  }

  writeJSON(NEWS_FILE, existing);
  return { newCount, dupCount, total: items.length };
}

function searchNews(query) {
  const all = getAllNews();
  return all.filter(n =>
    n.status === 'active' &&
    (n.title.includes(query) || (n.description && n.description.includes(query)))
  ).sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));
}

function getNewsByDate(dateStr) {
  const all = getAllNews();
  const target = normalizeDate(dateStr);
  return all.filter(n => {
    const d = normalizeDate(n.pub_date);
    return d === target && n.status === 'active';
  }).sort((a, b) => {
    const tierOrder = { A: 0, B: 1, C: 2, X: 3 };
    return (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2);
  });
}

function getNewsByDateRange(start, end) {
  const all = getAllNews();
  const s = normalizeDate(start);
  const e = normalizeDate(end);
  return all.filter(n => {
    const d = normalizeDate(n.pub_date);
    return d >= s && d <= e && n.status === 'active';
  }).sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));
}

// ===== 报告 =====
function getAllReports() {
  return readJSON(REPORTS_FILE) || [];
}

function getReportByDate(dateStr) {
  const reports = getAllReports();
  return reports.find(r => r.report_date === dateStr);
}

function saveReport(report) {
  const reports = getAllReports();
  const idx = reports.findIndex(r => r.report_date === report.report_date);
  if (idx >= 0) {
    reports[idx] = report;
  } else {
    reports.push(report);
  }
  reports.sort((a, b) => (b.report_date || '').localeCompare(a.report_date || ''));
  writeJSON(REPORTS_FILE, reports);
}

// ===== 采集日志 =====
function addFetchLogs(results) {
  const logs = readJSON(LOGS_FILE) || [];
  const runDate = new Date().toISOString();
  for (const r of results) {
    logs.push({
      run_date: runDate,
      source_id: r.source_id,
      source_name: r.source_name,
      status: r.status,
      items_fetched: r.items_fetched,
      items_matched: r.items_matched,
      error: r.error,
      duration_ms: r.duration_ms,
    });
  }
  // 只保留最近500条日志
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  writeJSON(LOGS_FILE, logs);

  // 更新源状态
  const statusMap = readJSON(SOURCES_STATUS_FILE) || {};
  for (const r of results) {
    if (!statusMap[r.source_id]) {
      statusMap[r.source_id] = {
        last_check: runDate,
        last_ok: r.status === 'ok' ? runDate : null,
        consecutive_fails: r.status === 'ok' ? 0 : 1,
        total_fetches: 1,
        total_hits: r.items_matched || 0,
      };
    } else {
      const s = statusMap[r.source_id];
      s.last_check = runDate;
      if (r.status === 'ok') {
        s.last_ok = runDate;
        s.consecutive_fails = 0;
      } else {
        s.consecutive_fails = (s.consecutive_fails || 0) + 1;
      }
      s.total_fetches = (s.total_fetches || 0) + 1;
      s.total_hits = (s.total_hits || 0) + (r.items_matched || 0);
    }
  }
  writeJSON(SOURCES_STATUS_FILE, statusMap);
}

function getSourceStatus() {
  return readJSON(SOURCES_STATUS_FILE) || {};
}

// ===== 统计 =====
function getStats() {
  const all = getAllNews().filter(n => n.status === 'active');
  const tierBreakdown = {};
  for (const n of all) {
    tierBreakdown[n.tier] = (tierBreakdown[n.tier] || 0) + 1;
  }
  const latestDate = all.length > 0
    ? normalizeDate(all.sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''))[0].pub_date)
    : null;

  // 来源统计
  const sourceMap = {};
  for (const n of all) {
    const src = n.source_name || '未知';
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  }
  const topSources = Object.entries(sourceMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ source_name: name, count }));

  return {
    total_items: all.length,
    total_reports: getAllReports().length,
    tier_breakdown: Object.entries(tierBreakdown).map(([tier, count]) => ({ tier, count })),
    latest_date: latestDate,
    top_sources: topSources,
  };
}

/**
 * 规范化日期为 YYYY-MM-DD
 * 兼容多种输入格式：ISO 字符串、JS Date 序列化字符串、带时区的 RFC 格式
 */
function normalizeDate(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal !== 'string') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }

  // 已符合 YYYY-MM-DD 或 ISO 格式
  const isoMatch = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // RFC 格式，如 "Sun, 08 Nov 2026 08:45:09 +0100"
  const rfcMatch = dateVal.match(/\d{1,2}\s+(\w{3})\s+(\d{4})/);
  if (rfcMatch) {
    const months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
    const mon = months[rfcMatch[1]];
    if (mon) return `${rfcMatch[2]}-${mon}-${String(rfcMatch[0]).split(/\s+/)[0].padStart(2,'0')}`;
  }

  // 兜底用 Date 解析
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

// ===== 工具函数 =====
function normalizeTitle(title) {
  return (title || '')
    .replace(/\s+/g, '')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[｜|].*$/, '')
    .replace(/^.*[｜|]/, '')
    .toLowerCase()
    .trim();
}

module.exports = {
  getAllNews,
  addNews,
  searchNews,
  getNewsByDate,
  getNewsByDateRange,
  getAllReports,
  getReportByDate,
  saveReport,
  addFetchLogs,
  getSourceStatus,
  getStats,
  normalizeTitle,
  normalizeDate,
};
