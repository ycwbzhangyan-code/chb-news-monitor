# 创兴银行新闻监测系统 — 静态部署包

## 概述
本目录为纯静态部署版本，无需Node.js后端，可直接上传到任何Web服务器或CDN。

## 部署方式

### 方式1：上传到现有服务器（推荐）
1. 将整个 `deploy/` 目录上传到现有社媒监测系统的服务器上
2. 在Nginx配置中添加 /news/ 路径指向此目录：

```nginx
location /news/ {
    alias /path/to/deploy/;
    try_files $uri $uri/ /news/index.html;
}
```

3. 重启Nginx后访问 https://chonghing.chonghing.uk/news/

### 方式2：Cloudflare Pages
1. 登录 Cloudflare Dashboard → Pages
2. 创建新项目，上传 deploy/ 目录
3. 绑定到 chonghing.chonghing.uk 的 /news/ 路径

### 方式3：直接替换现有社媒系统前端
1. 将 deploy/ 目录内容上传到现有服务器根目录
2. 在现有 index.html 中添加链接：`<a href="/news/">📰 媒体新闻监测</a>`

## 目录结构
```
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
```

## 功能
- 今日研报：A/B/C三级新闻分级展示
- 历史归档：按日期查看历史研报
- 媒体源监控：3793条媒体源分页浏览、分类筛选、RSS过滤
- 新闻搜索：全文搜索

## 数据更新
静态版的数据不会自动更新。要更新数据：
1. 在本地运行 Node.js 版本采集最新新闻：
   ```
   cd chb-news-site && node src/services/cronJob.js
   ```
2. 重新运行构建脚本生成新的静态包：
   ```
   node scripts/build_static_deploy.js
   ```
3. 重新上传 deploy/ 目录到服务器

## 版本
v2.0 | 2026-11-13
媒体源: 3793条 | RSS: 263个
