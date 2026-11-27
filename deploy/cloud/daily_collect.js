/**
 * 云端每日采集 + 报告生成 + 邮件推送
 * 由 GitHub Actions cron 每天早上8点触发
 * 
 * 流程：
 * 1. RSS 采集（全量配置源）
 * 2. 运行爬虫（匯港通訊 + U Lifestyle）
 * 3. AI 深度研究数据合并
 * 4. 去重分级入库
 * 5. 生成当日报告
 * 6. 邮件推送给传讯处团队
 * 7. 自动 git commit 更新数据
 */
const { fetchAllSources, saveAllHits, loadAIResearch } = require('../../src/services/fetcher');
const { getReportForDate, saveDailyReport, generateSummary } = require('../../src/services/reportBuilder');
const store = require('../../src/services/store');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// 邮件配置（从环境变量读取）
const EMAIL_CONFIG = {
  smtp_host: process.env.SMTP_HOST || 'smtp.163.com',
  smtp_port: parseInt(process.env.SMTP_PORT || '465'),
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  from_addr: process.env.FROM_ADDR || '',
  to_addrs: (process.env.TO_ADDRS || '').split(',').filter(Boolean),
  bcc_addrs: (process.env.BCC_ADDRS || '').split(',').filter(Boolean),
};

async function runCloudDailyJob() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  console.log(`\n========================================`);
  console.log(`  创兴银行新闻监测系统 · 云端每日采集`);
  console.log(`  日期: ${todayStr}`);
  console.log(`  时间: ${now.toISOString()}`);
  console.log(`========================================\n`);

  const startTime = Date.now();
  let totalNewNews = 0;
  let reportSaved = false;

  // ========== 第1步：RSS 采集 ==========
  try {
    console.log('[1/6] 采集RSS源（全量配置）...');
    const { results, hits } = await fetchAllSources(7, 20);
    console.log(`  -> 采集完成: ${results.length}个源返回, ${hits.length}条命中`);

    // ========== 第2步：运行爬虫 ==========
    console.log('[2/6] 运行站点爬虫...');
    let crawlerHits = [];
    try {
      const { crawlHKCD } = require('../../scripts/crawler_hkcd');
      const { crawlULifestyle } = require('../../scripts/crawler_ulifestyle');
      
      console.log('  -> 匯港通訊爬虫...');
      const hkcdResult = await crawlHKCD(7);
      const hkcdHits = (hkcdResult.newHits || []).map(h => ({
        title: h.title,
        link: h.link,
        desc: h.description || '',
        pubDate: h.pub_date || new Date().toISOString(),
        source_id: 'hkcd',
        source_name: h.source_name || '匯港通訊（香港商報）',
        source_cat: h.source_cat || 'hk_print',
        lang: 'CH',
      }));
      console.log(`     匯港通訊: ${hkcdHits.length}条命中`);
      
      console.log('  -> U Lifestyle爬虫...');
      const ulifeResult = await crawlULifestyle(7);
      const ulifeHits = (ulifeResult.newHits || ulifeResult.hits || []).map(h => ({
        title: h.title,
        link: h.link,
        desc: h.description || '',
        pubDate: h.pub_date || new Date().toISOString(),
        source_id: 'ulifestyle',
        source_name: h.source_name || 'U Lifestyle',
        source_cat: h.source_cat || 'hk_lifestyle',
        lang: 'CH',
      }));
      console.log(`     U Lifestyle: ${ulifeHits.length}条命中`);
      
      // 港媒理财聚合爬虫（候选发现器 — 只写候选文件，不自动入库）
      // 2026-11-23 修复：宽主题词(定存/加息/外汇)会抓到大量不提创兴银行的噪音，
      // 必须人工核验相关性与日期后才能经 import_*.js 入库，故不进 allHits。
      console.log('  -> 港媒理财聚合爬虫（候选发现器）...');
      try {
        const { crawlFinanceSites } = require('../../scripts/crawler_finance_sites');
        const financeResult = await crawlFinanceSites();
        const financeHits = (financeResult.newHits || []).map(h => ({
          title: h.title,
          link: h.link,
          desc: h.desc,
          pubDate: h.pubDate || new Date().toISOString(),
          source_id: h.source_id || 'finance_wire',
          source_name: h.source_name || '香港财经媒体',
          source_cat: h.source_cat || 'hk_business',
          lang: 'CH',
          tier_hint: h.tier_hint === 'B' ? 'B' : 'C',
          tier_reason: h.tier_reason,
          discovered_at: new Date().toISOString(),
        }));
        // 只保留候选文件，供人工核验；不 push 到 crawlerHits
        const candsPath = path.join(__dirname, '..', '..', 'data', 'finance_candidates.json');
        let prev = [];
        try { prev = JSON.parse(fs.readFileSync(candsPath, 'utf-8')); } catch (e) { prev = []; }
        const merged = [...prev, ...financeHits].slice(-500);
        fs.writeFileSync(candsPath, JSON.stringify(merged, null, 2));
        console.log(`     港媒理财: 发现 ${financeHits.length} 条候选（未自动入库，待核验）`);
      } catch (e) {
        console.log(`  -> 理财聚合爬虫出错（非致命）: ${e.message}`);
      }

      // 中国金融商报网爬虫（候选发现器 — 2026-11-27 新增）
      // 该源无RSS(crawl_only)，用户指出 11/19 文章正文点名创兴被漏检。
      console.log('  -> 中国金融商报网爬虫（候选发现器）...');
      try {
        const { crawlPRCFE } = require('../../scripts/crawler_prcfe');
        const prcfeResult = await crawlPRCFE();
        console.log(`     中国金融商报网: 扫描 ${prcfeResult.scanned} 篇，发现 ${prcfeResult.added} 条候选（待核验）`);
      } catch (e) {
        console.log(`  -> 中国金融商报网爬虫出错（非致命）: ${e.message}`);
      }
      
      crawlerHits = [...hkcdHits, ...ulifeHits, ...crawlerHits];
    } catch (e) {
      console.log(`  -> 爬虫运行出错（非致命）: ${e.message}`);
    }

    // ========== 第3步：AI深度研究数据 ==========
    console.log('[3/6] 加载AI深度研究数据...');
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
    console.log(`  -> AI研究数据: ${aiFormatted.length}条`);

    // ========== 第4步：去重入库 ==========
    console.log('[4/6] 去重分级入库...');
    const allHits = [...hits, ...crawlerHits];
    const saveResult = saveAllHits(allHits, aiFormatted);
    console.log(`  -> 待核验${saveResult.guard?.pending || 0}条(自动采集), 新增${saveResult.newCount}条(AI核验), 重复${saveResult.dupCount}条`);

    // 2026-11-27 硬闸门：自动采集条目必须抓原文正文核验含创兴银行才入库
    console.log('  -> 正文核验入库（必须含创兴银行字样）...');
    try {
      const { execFileSync } = require('child_process');
      const vout = execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'verify_and_import.js')], { encoding: 'utf-8', timeout: 240000 });
      const vm = vout.match(/正文含创兴入库 (\d+) 条/);
      if (vm) { const verifiedCount = parseInt(vm[1]); totalNewNews += verifiedCount; }
      console.log(`     正文核验通过入库: ${vm ? vm[1] : '见日志'} 条`);
    } catch (e) {
      console.log(`  -> 正文核验出错（非致命）: ${e.message}`);
    }

    // 2026-11-27 广撒网发现能力：从高价值媒体 sitemap 批量取文章 URL，
    // 不靠标题关键词，逐篇抓正文核验含创兴才入库（发现"标题不点名创兴"的漏检新闻）
    console.log('  -> 广撒网正文核验（高价值媒体，发现标题不点名创兴的新闻）...');
    try {
      const { execFileSync } = require('child_process');
      const bout = execFileSync(process.execPath,
        [path.join(__dirname, '..', '..', 'scripts', 'broad_scan.js'), '--days', '7', '--max', '20'],
        { encoding: 'utf-8', timeout: 480000 });
      const bm = bout.match(/入库新增: (\d+) 条/);
      if (bm) { const bc = parseInt(bm[1]); totalNewNews += bc; }
      console.log(`     广撒网自主发现入库: ${bm ? bm[1] : '见日志'} 条`);
    } catch (e) {
      console.log(`  -> 广撒网扫描出错（非致命）: ${e.message}`);
    }

    // 记录采集日志
    try { store.addFetchLogs(results); } catch(e) { console.log(`  -> 日志记录失败（非致命）: ${e.message}`); }

    // ========== 第5步：生成报告 ==========
    console.log('[5/6] 生成每日报告...');
    const report = getReportForDate(todayStr);
    if (report && report.stats.total > 0) {
      saveDailyReport(report);
      reportSaved = true;
      console.log(`  -> 报告已生成: ${report.stats.total}条 (B:${report.stats.B} C:${report.stats.C})`);
    } else {
      console.log(`  -> 今日无新闻，未生成报告`);
    }

    // 同时更新最近7天的报告（补充遗漏）
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const r = getReportForDate(dateStr);
      if (r && r.stats.total > 0) {
        saveDailyReport(r);
      }
    }
  } catch (e) {
    console.error(`[ERROR] 采集步骤失败:`, e.message);
    console.error(e.stack);
    // 不退出，继续尝试邮件和提交
  }

  // ========== 第6步：邮件推送 ==========
  try {
    console.log('[6/6] 邮件推送...');
    if (reportSaved && EMAIL_CONFIG.to_addrs.length > 0 && EMAIL_CONFIG.smtp_user) {
      const report = getReportForDate(todayStr);
      if (report && report.stats.total > 0) {
        await sendEmailReport(report);
        console.log(`  -> 邮件已发送至: ${EMAIL_CONFIG.to_addrs.join(', ')}`);
      }
    } else if (!reportSaved) {
      console.log('  -> 今日无报告，跳过邮件推送');
    } else {
      console.log('  -> 未配置SMTP或收件人，跳过邮件推送');
    }
  } catch (e) {
    console.error(`[ERROR] 邮件推送失败（非致命）:`, e.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`  每日采集完成`);
  console.log(`  耗时: ${duration}s`);
  console.log(`  新增新闻: ${totalNewNews}条`);
  console.log(`  报告: ${reportSaved ? '已生成' : '无'}`);
  console.log(`========================================\n`);
  // 始终成功退出（即使无新新闻），确保git commit步骤能执行
  process.exit(0);
}

async function sendEmailReport(report) {
  const transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.smtp_host,
    port: EMAIL_CONFIG.smtp_port,
    secure: EMAIL_CONFIG.smtp_port === 465,
    auth: {
      user: EMAIL_CONFIG.smtp_user,
      pass: EMAIL_CONFIG.smtp_pass,
    },
  });

  const dateStr = report.report_date;
  const bCount = report.stats.B;
  const cCount = report.stats.C;
  const total = report.stats.total;

  // 构建邮件HTML
  const html = buildEmailHtml(report);

  const mailOptions = {
    from: `创兴银行新闻监测 <${EMAIL_CONFIG.from_addr}>`,
    to: EMAIL_CONFIG.to_addrs.join(', '),
    bcc: EMAIL_CONFIG.bcc_addrs.length > 0 ? EMAIL_CONFIG.bcc_addrs.join(', ') : undefined,
    subject: `【创兴银行新闻监测】${dateStr} 日报 - ${total}条新闻 (B类${bCount}条)`,
    html: html,
  };

  await transporter.sendMail(mailOptions);
}

function buildEmailHtml(report) {
  const { report_date, stats, tiers } = report;
  
  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
.header { background: #1565C0; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.header h1 { margin: 0; font-size: 20px; }
.header .meta { font-size: 13px; opacity: 0.9; margin-top: 5px; }
.summary { background: #F5F7FA; padding: 15px 20px; border-left: 4px solid #1565C0; margin: 15px 0; }
.summary table { width: 100%; border-collapse: collapse; }
.summary td { padding: 5px 10px; }
.tier-section { margin: 15px 0; }
.tier-title { font-size: 16px; font-weight: bold; padding: 8px 12px; border-radius: 4px; }
.tier-b { background: #FFF3E0; color: #E65100; border-left: 3px solid #FF9800; }
.tier-c { background: #E8F5E9; color: #2E7D32; border-left: 3px solid #4CAF50; }
.news-item { padding: 10px 15px; border-bottom: 1px solid #eee; }
.news-item .title { font-weight: 600; color: #1565C0; text-decoration: none; }
.news-item .source { font-size: 12px; color: #888; margin-top: 3px; }
.footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="header">
  <h1>创兴银行新闻监测日报</h1>
  <div class="meta">报告日期: ${report_date} | 系统自动生成 | chonghing.chonghing.uk</div>
</div>

<div class="summary">
  <table>
    <tr><td><strong>新闻总数</strong></td><td>${stats.total} 条</td>
        <td><strong>B类重要</strong></td><td>${stats.B} 条</td></tr>
    <tr><td><strong>C类例行</strong></td><td>${stats.C} 条</td>
        <td><strong>X类排除</strong></td><td>${stats.X || 0} 条</td></tr>
  </table>
</div>
`;

  // B类新闻
  if (tiers.B && tiers.B.length > 0) {
    html += `<div class="tier-section"><div class="tier-title tier-b">B类 重要新闻 (${tiers.B.length}条)</div>`;
    for (const item of tiers.B) {
      html += `<div class="news-item">
        <a href="${item.link || '#'}" class="title">${item.title}</a>
        <div class="source">${item.source_name} | ${item.tier_reason || ''}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // C类新闻
  if (tiers.C && tiers.C.length > 0) {
    html += `<div class="tier-section"><div class="tier-title tier-c">C类 例行提及 (${tiers.C.length}条)</div>`;
    for (const item of tiers.C) {
      html += `<div class="news-item">
        <a href="${item.link || '#'}" class="title">${item.title}</a>
        <div class="source">${item.source_name}</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="footer">
    本邮件由创兴银行新闻监测系统自动发送<br>
    访问 <a href="https://chonghing.chonghing.uk">chonghing.chonghing.uk</a> 查看完整报告<br>
    如需调整监测关键词或收件人，请联系企业传讯处
  </div>
</body>
</html>`;

  return html;
}

// 入口
if (require.main === module) {
  runCloudDailyJob();
}

module.exports = { runCloudDailyJob, sendEmailReport };
