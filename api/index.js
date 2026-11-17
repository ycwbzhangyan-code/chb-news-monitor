/**
 * Vercel Serverless API 入口
 *
 * 使用 Vercel 的 catch-all 路由约定：
 * /api/*  →  api/index.js  (req.url 保持为 /api/stats 等)
 *
 * 内部使用 Express 处理路由，挂载在根路径上。
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const apiRoutes = require('../src/routes/api');
const store = require('../src/services/store');
const { loadAIResearch } = require('../src/services/fetcher');
const { getReportForDate, saveDailyReport } = require('../src/services/reportBuilder');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());

let seedLoaded = false;
function ensureSeedData() {
  if (seedLoaded) return;
  seedLoaded = true;
  const newsCount = store.getAllNews().length;
  if (newsCount === 0) {
    const aiHits = loadAIResearch();
    if (aiHits.length > 0) {
      const aiFormatted = aiHits.map(item => ({
        title: item.title, link: item.link, desc: item.desc,
        pubDate: item.date, source_id: item.source_id,
        source_name: item.source_name, source_cat: item.cat,
        lang: item.lang, tier_hint: item.tier_hint,
      }));
      const { saveAllHits } = require('../src/services/fetcher');
      saveAllHits([], aiFormatted);
      const dates = [...new Set(aiFormatted.map(i => store.normalizeDate(i.pubDate || i.date)))].filter(Boolean).sort();
      for (const d of dates) {
        const report = getReportForDate(d);
        if (report && report.stats.total > 0) saveDailyReport(report);
      }
    }
  }
}

app.use((req, res, next) => { ensureSeedData(); next(); });

// 首页
app.get('/', (req, res, next) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  next();
});

// API 路由 — 挂载在 /api 下（Vercel rewrite 保留了完整路径）
app.use('/api', apiRoutes);

// 静态资源兜底
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// Vercel serverless handler — 直接导出 app（Express 兼容 Vercel 的 (req, res) 签名）
module.exports = app;
