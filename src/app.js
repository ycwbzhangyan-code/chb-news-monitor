/**
 * Express 应用主入口
 * 创兴银行新闻监测系统 - 每日研报网站
 * 部署地址: chonghing.chonghing.uk
 */
const express = require('express');
const path = require('path');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const store = require('./services/store');
const { loadAIResearch } = require('./services/fetcher');
const { getReportForDate, saveDailyReport } = require('./services/reportBuilder');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api', apiRoutes);

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 启动时加载种子数据
function loadSeedData() {
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
      const dates = [...new Set(aiFormatted.map(i => (i.pubDate || i.date || '').split('T')[0]))].sort();
      for (const d of dates) {
        if (d) {
          const report = getReportForDate(d);
          if (report && report.stats.total > 0) {
            saveDailyReport(report);
            console.log(`[Seed] 报告 ${d}: ${report.stats.total}条 (A:${report.stats.A} B:${report.stats.B} C:${report.stats.C})`);
          }
        }
      }
    }
  } else {
    console.log(`[Seed] 数据库已有 ${newsCount} 条新闻，跳过种子加载`);
  }
}

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  创兴银行新闻监测系统 v2.0`);
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  部署域名: chonghing.chonghing.uk`);
  console.log(`  媒体源: 3793条 | RSS: 263个`);
  console.log(`========================================\n`);
  loadSeedData();
});
