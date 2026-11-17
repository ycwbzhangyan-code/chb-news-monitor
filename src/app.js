/**
 * Express 应用主入口
 * 创兴银行新闻监测系统 - 每日研报网站
 *
 * 同时支持两种运行模式：
 * - 本地开发: node src/app.js  → 调用 app.listen()
 * - Vercel 部署: require('src/app.js') → 导出 app 实例供 serverless 使用
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const store = require('./services/store');
const { loadAIResearch } = require('./services/fetcher');
const { getReportForDate, saveDailyReport } = require('./services/reportBuilder');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());

// 启动时加载种子数据（仅首次冷启动时执行）
let seedLoaded = false;
function ensureSeedData() {
  if (seedLoaded) return;
  seedLoaded = true;

  const newsCount = store.getAllNews().length;
  if (newsCount === 0) {
    console.log('[Seed] 数据库为空，加载AI深度研究种子数据...');
    const aiHits = loadAIResearch();
    if (aiHits.length > 0) {
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

      const { saveAllHits } = require('./services/fetcher');
      const result = saveAllHits([], aiFormatted);
      console.log(`[Seed] 加载完成: 新增${result.newCount}条, 重复${result.dupCount}条`);

      // 为每个有新闻的日期生成报告
      const dates = [...new Set(aiFormatted.map(i => store.normalizeDate(i.pubDate || i.date)))].filter(Boolean).sort();
      for (const d of dates) {
        const report = getReportForDate(d);
        if (report && report.stats.total > 0) {
          saveDailyReport(report);
          console.log(`[Seed] 报告 ${d}: ${report.stats.total}条 (B:${report.stats.B} C:${report.stats.C})`);
        }
      }
    }
  }
}

// 每次请求前确保种子数据已加载
app.use((req, res, next) => {
  ensureSeedData();
  next();
});

// 首页 — 必须在 API 路由之前
app.get('/', (req, res, next) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// API 路由 — 双挂载以兼容本地开发与 Vercel serverless 路径剥离
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

// 静态资源
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// 导出 app 供 Vercel serverless 使用
module.exports = app;

// 仅在直接运行时启动服务器（被 require 时不启动）
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  创兴银行新闻监测系统 v2.0`);
    console.log(`  服务地址: http://localhost:${PORT}`);
    console.log(`  部署域名: chonghing.chonghing.uk`);
    console.log(`  媒体源: 3793条 | RSS: 263个`);
    console.log(`========================================\n`);
    ensureSeedData();
  });
}
