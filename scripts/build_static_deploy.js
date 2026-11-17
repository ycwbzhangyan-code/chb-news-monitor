/**
 * 构建纯静态部署包
 * 把 Node.js 版的新闻监测系统转为纯静态 HTML + JSON 版本
 * 可直接上传到 Cloudflare Pages、现有服务器静态目录、或任何 CDN
 *
 * 输出目录: chb-news-site/deploy/
 * 结构:
 *   deploy/
 *     index.html        — 主页面
 *     css/style.css      — 样式
 *     js/app.js          — 前端逻辑（从静态JSON加载数据）
 *     data/
 *       news_items.json  — 新闻数据
 *       reports.json     — 研报数据
 *       sources.json     — 媒体源数据（含RSS状态）
 *       stats.json       — 统计数据
 *       ai_research.json — AI深度研究数据
 *     api/               — 静态JSON模拟API响应
 *       report/latest.json
 *       report/list.json
 *       sources/status_p1.json (第1页)
 *       sources/status_p2.json (第2页)
 *       ...
 *       stats.json
 *       search_index.json (搜索索引)
 *     README.md          — 部署说明
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT, 'deploy');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_DIR = path.join(ROOT, 'config');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SRC_DIR = path.join(ROOT, 'src');

// 清理并创建部署目录
function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log('=== 构建纯静态部署包 ===\n');

// 1. 清理创建目录
rmrf(DEPLOY_DIR);
mkdirp(DEPLOY_DIR);
mkdirp(path.join(DEPLOY_DIR, 'css'));
mkdirp(path.join(DEPLOY_DIR, 'js'));
mkdirp(path.join(DEPLOY_DIR, 'data'));
mkdirp(path.join(DEPLOY_DIR, 'api'));
mkdirp(path.join(DEPLOY_DIR, 'api', 'report'));
mkdirp(path.join(DEPLOY_DIR, 'api', 'sources'));

// 2. 加载数据
const newsItems = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'news_items.json'), 'utf8'));
const reports = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'reports.json'), 'utf8'));
const aiResearch = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ai_research.json'), 'utf8'));
const sourceStatus = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'source_status.json'), 'utf8'));

// 加载完整源配置
let sourcesConfig;
const fullConfigPath = path.join(CONFIG_DIR, 'sources_full_config.json');
if (fs.existsSync(fullConfigPath)) {
  sourcesConfig = JSON.parse(fs.readFileSync(fullConfigPath, 'utf8'));
} else {
  sourcesConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'sources.json'), 'utf8'));
}

// 3. 生成静态API JSON文件

// /api/report/latest.json — 最新研报
const { getReportForDate, getLatestReport, getReportList } = require(path.join(SRC_DIR, 'services', 'reportBuilder'));
const latestReport = getLatestReport();
if (latestReport) {
  fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'report', 'latest.json'), JSON.stringify(latestReport, null, 2));
  console.log('  ✓ api/report/latest.json');
}

// /api/report/list.json — 报告列表
const reportList = getReportList(30);
fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'report', 'list.json'), JSON.stringify(reportList, null, 2));
console.log('  ✓ api/report/list.json');

// /api/report/:date.json — 每个日期的报告
const reportDates = [...new Set(newsItems.map(n => (n.pub_date || '').split('T')[0]))].filter(Boolean).sort();
for (const date of reportDates) {
  const report = getReportForDate(date);
  if (report && report.stats.total > 0) {
    fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'report', `${date}.json`), JSON.stringify(report, null, 2));
  }
}
console.log(`  ✓ api/report/${reportDates.length}个日期报告`);

// /api/sources/status.json — 全量源（不分页）
const sourcesWithStatus = sourcesConfig.sources.map(s => ({
  ...s,
  status: sourceStatus[s.id] || null,
}));
const sourcesFull = {
  total: sourcesConfig.sources.length,
  total_sources: sourcesConfig.sources.length,
  with_rss: sourcesConfig.sources.filter(s => s.rss && s.rss.length > 0).length,
  sources: sourcesWithStatus,
  categories: sourcesConfig.meta.categories || {},
};
fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'sources', 'status_all.json'), JSON.stringify(sourcesFull, null, 2));
console.log(`  ✓ api/sources/status_all.json (${sourcesConfig.sources.length}源)`);

// 分页版本 (每页50条)
const PAGE_SIZE = 50;
const totalPages = Math.ceil(sourcesConfig.sources.length / PAGE_SIZE);
for (let page = 1; page <= totalPages; page++) {
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageSources = sourcesConfig.sources.slice(startIdx, startIdx + PAGE_SIZE).map(s => ({
    ...s,
    status: sourceStatus[s.id] || null,
  }));
  const pageData = {
    total: sourcesConfig.sources.length,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    with_rss: sourcesConfig.sources.filter(s => s.rss && s.rss.length > 0).length,
    total_sources: sourcesConfig.sources.length,
    sources: pageSources,
    categories: sourcesConfig.meta.categories || {},
  };
  fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'sources', `status_p${page}.json`), JSON.stringify(pageData, null, 2));
}
console.log(`  ✓ api/sources/ ${totalPages}页分页JSON`);

// /api/stats.json — 统计
const store = require(path.join(SRC_DIR, 'services', 'store'));
const stats = store.getStats();
fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'stats.json'), JSON.stringify(stats, null, 2));
console.log('  ✓ api/stats.json');

// /api/search_index.json — 搜索索引（全部新闻条目）
const searchIndex = newsItems.filter(n => n.status === 'active').map(n => ({
  id: n.id,
  title: n.title,
  link: n.link,
  description: n.description,
  source_name: n.source_name,
  pub_date: n.pub_date,
  tier: n.tier,
  tier_reason: n.tier_reason,
}));
fs.writeFileSync(path.join(DEPLOY_DIR, 'api', 'search_index.json'), JSON.stringify(searchIndex, null, 2));
console.log(`  ✓ api/search_index.json (${searchIndex.length}条)`);

// 4. 复制数据文件
fs.copyFileSync(path.join(DATA_DIR, 'news_items.json'), path.join(DEPLOY_DIR, 'data', 'news_items.json'));
fs.copyFileSync(path.join(DATA_DIR, 'reports.json'), path.join(DEPLOY_DIR, 'data', 'reports.json'));
fs.copyFileSync(path.join(DATA_DIR, 'ai_research.json'), path.join(DEPLOY_DIR, 'data', 'ai_research.json'));
console.log('  ✓ data/ (3个数据文件)');

// 5. 生成静态版 CSS（复制原有CSS）
fs.copyFileSync(path.join(PUBLIC_DIR, 'css', 'style.css'), path.join(DEPLOY_DIR, 'css', 'style.css'));
console.log('  ✓ css/style.css');

// 6. 生成静态版 HTML
let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
// 静态版不需要服务器端刷新功能
html = html.replace('/css/style.css', 'css/style.css');
html = html.replace('/js/app.js', 'js/app.js');
fs.writeFileSync(path.join(DEPLOY_DIR, 'index.html'), html);
console.log('  ✓ index.html');

// 7. 生成静态版 JS（从静态JSON加载而非API）
let jsContent = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'app.js'), 'utf8');

// 替换 fetch('/api/...') 为 fetch('api/...')
jsContent = jsContent.replace(/fetch\('\/api\/report\/latest'\)/g, "fetch('api/report/latest.json')");
jsContent = jsContent.replace(/fetch\('\/api\/reports\/list/g, "fetch('api/report/list.json");
jsContent = jsContent.replace(/fetch\(`\/api\/report\/\${date}`\)/g, "fetch(`api/report/${date}.json`)");
jsContent = jsContent.replace(/fetch\(`\/api\/sources\/status\?\${params}`\)/g, "fetchSourcesPaginated(params)");
jsContent = jsContent.replace(/fetch\('\/api\/sources\/status'\)/g, "fetch('api/sources/status_all.json')");
jsContent = jsContent.replace(/fetch\(`\/api\/search\?q=\${encodeURIComponent\(q\)}`\)/g, "searchFromIndex(q)");
jsContent = jsContent.replace(/fetch\('\/api\/stats'\)/g, "fetch('api/stats.json')");
jsContent = jsContent.replace(/await fetch\('\/api\/fetch\/run', \{ method: 'POST' \}\)/g, 
  "alert('静态部署版不支持手动采集。请在Node.js版本中运行采集后重新生成静态包。')");

// 添加分页和搜索的静态版本函数
jsContent += `
// ===== 静态部署版：分页加载媒体源 =====
async function fetchSourcesPaginated(params) {
  const urlParams = new URLSearchParams(params);
  const page = parseInt(urlParams.get('page')) || 1;
  const pageSize = parseInt(urlParams.get('pageSize')) || 50;
  const cat = urlParams.get('cat') || '';
  const rssOnly = urlParams.get('rssOnly') === '1';

  // 加载全量数据（首次加载时缓存）
  if (!window._allSourcesCache) {
    const resp = await fetch('api/sources/status_all.json');
    window._allSourcesCache = await resp.json();
  }
  const all = window._allSourcesCache;

  let filtered = all.sources;
  if (cat) filtered = filtered.filter(s => s.cat === cat);
  if (rssOnly) filtered = filtered.filter(s => s.rss && s.rss.length > 0);

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageSources = filtered.slice(startIdx, startIdx + pageSize);

  return {
    total,
    page,
    pageSize,
    totalPages,
    with_rss: all.with_rss,
    total_sources: all.total_sources,
    sources: pageSources,
    categories: all.categories || {},
  };
}

// ===== 静态部署版：从搜索索引搜索 =====
let _searchIndex = null;
async function searchFromIndex(q) {
  if (!_searchIndex) {
    const resp = await fetch('api/search_index.json');
    _searchIndex = await resp.json();
  }
  const ql = q.toLowerCase();
  const items = _searchIndex.filter(n =>
    (n.title && n.title.toLowerCase().includes(ql)) ||
    (n.description && n.description.toLowerCase().includes(ql))
  ).sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || ''));
  return { items, total: items.length };
}

// 重写doSearch使用静态索引
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const container = document.getElementById('search-results');
  container.innerHTML = '<div class="loading">搜索中...</div>';
  try {
    const data = await searchFromIndex(q);
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="loading">未找到匹配的新闻</div>';
      return;
    }
    container.innerHTML = data.items.map(item =>
      renderNewsItem(item, item.tier || 'C')
    ).join('');
  } catch (e) {
    container.innerHTML = '<div class="loading">搜索失败</div>';
  }
}
`;

fs.writeFileSync(path.join(DEPLOY_DIR, 'js', 'app.js'), jsContent);
console.log('  ✓ js/app.js (静态版)');

// 8. 生成部署说明 README
const readme = `# 创兴银行新闻监测系统 — 静态部署包

## 概述
本目录为纯静态部署版本，无需Node.js后端，可直接上传到任何Web服务器或CDN。

## 部署方式

### 方式1：上传到现有服务器（推荐）
1. 将整个 \`deploy/\` 目录上传到现有社媒监测系统的服务器上
2. 在Nginx配置中添加 /news/ 路径指向此目录：

\`\`\`nginx
location /news/ {
    alias /path/to/deploy/;
    try_files $uri $uri/ /news/index.html;
}
\`\`\`

3. 重启Nginx后访问 https://chonghing.chonghing.uk/news/

### 方式2：Cloudflare Pages
1. 登录 Cloudflare Dashboard → Pages
2. 创建新项目，上传 deploy/ 目录
3. 绑定到 chonghing.chonghing.uk 的 /news/ 路径

### 方式3：直接替换现有社媒系统前端
1. 将 deploy/ 目录内容上传到现有服务器根目录
2. 在现有 index.html 中添加链接：\`<a href="/news/">📰 媒体新闻监测</a>\`

## 目录结构
\`\`\`
deploy/
├── index.html              — 主页面
├── css/style.css           — 样式
├── js/app.js               — 前端逻辑（静态版）
├── data/                   — 数据文件
│   ├── news_items.json     — 新闻条目
│   ├── reports.json        — 研报
│   └── ai_research.json    — AI深度研究数据
└── api/                    — 静态API响应
    ├── report/
    │   ├── latest.json     — 最新研报
    │   ├── list.json       — 报告列表
    │   └── YYYY-MM-DD.json — 各日期报告
    ├── sources/
    │   ├── status_all.json — 全量媒体源(3793条)
    │   └── status_pN.json  — 分页版本
    ├── stats.json          — 统计数据
    └── search_index.json   — 搜索索引
\`\`\`

## 功能
- 今日研报：A/B/C三级新闻分级展示
- 历史归档：按日期查看历史研报
- 媒体源监控：3793条媒体源分页浏览、分类筛选、RSS过滤
- 新闻搜索：全文搜索

## 数据更新
静态版的数据不会自动更新。要更新数据：
1. 在本地运行 Node.js 版本采集最新新闻：
   \`\`\`
   cd chb-news-site && node src/services/cronJob.js
   \`\`\`
2. 重新运行构建脚本生成新的静态包：
   \`\`\`
   node scripts/build_static_deploy.js
   \`\`\`
3. 重新上传 deploy/ 目录到服务器

## 版本
v2.0 | 2026-11-13
媒体源: 3793条 | RSS: 263个
`;
fs.writeFileSync(path.join(DEPLOY_DIR, 'README.md'), readme);
console.log('  ✓ README.md');

// 统计
console.log(`\n=== 部署包构建完成 ===`);
const fileCount = require('child_process').execSync('find "' + DEPLOY_DIR + '" -type f', {encoding:'utf8'}).trim().split('\n').length;
let totalSize = 0;
function calcSize(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) calcSize(fullPath);
    else totalSize += fs.statSync(fullPath).size;
  }
}
calcSize(DEPLOY_DIR);
console.log(`文件数: ${fileCount}`);
console.log(`总大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`部署目录: ${DEPLOY_DIR}`);
console.log(`\n访问方式: 上传到服务器后访问 /news/ 路径`);
