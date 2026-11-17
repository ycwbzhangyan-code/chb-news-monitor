/**
 * Vercel Serverless 入口
 * 将 Express 应用导出为 Vercel serverless 函数
 * 
 * 本地开发仍使用 src/app.js（含 app.listen）
 * Vercel 部署使用本文件（导出 app 实例）
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

app.use(cors());
app.use(express.json());

// API 路由 — 必须注册在静态资源之前
app.use('/api', apiRoutes);

// 静态资源目录（本地开发用；Vercel 会自动处理 public/）
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// 首页
app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).type('html').send('<h1>CHB News Monitor</h1><p>Index not found.</p>');
});

// 启动时加载种子数据（仅首次冷启动时）
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

      const { saveAllHits } = require('../src/services/fetcher');
      const result = saveAllHits([], aiFormatted);
      console.log(`[Seed] 加载完成: 新增${result.newCount}条, 重复${result.dupCount}条`);

      const dates = [...new Set(aiFormatted.map(i => (i.pubDate || i.date || '').split('T')[0]))].sort();
      for (const d of dates) {
        if (d) {
          const report = getReportForDate(d);
          if (report && report.stats.total > 0) {
            saveDailyReport(report);
          }
        }
      }
    }
  }
}

// 在每次请求时检查种子数据（轻量级，仅首次真正执行）
app.use((req, res, next) => {
  ensureSeedData();
  next();
});

// 导出 app 供 Vercel 使用
module.exports = app;
