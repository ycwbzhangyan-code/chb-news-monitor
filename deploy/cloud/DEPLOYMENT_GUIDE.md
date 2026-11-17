# 创兴银行新闻监测系统 — 云端部署指南

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                   每日自动化流程                      │
│                                                      │
│  GitHub Actions (UTC 0:00 / 香港 08:00)             │
│    │                                                 │
│    ├─→ 1. RSS采集 (263个源)                          │
│    ├─→ 2. 爬虫运行 (匯港通訊 + U Lifestyle)          │
│    ├─→ 3. AI深度研究数据合并                         │
│    ├─→ 4. 去重分级入库 (B/C/X三级)                   │
│    ├─→ 5. 生成当日报告                               │
│    ├─→ 6. 邮件推送 → 传讯处团队邮箱                  │
│    ├─→ 7. git commit 数据回仓库                      │
│    └─→ 8. 触发 Vercel 重新部署前端                   │
│                                                      │
│  Vercel (chonghing.chonghing.uk)                    │
│    └─→ Express serverless + 静态前端                │
└─────────────────────────────────────────────────────┘
```

## 前置条件

- GitHub 账号（用于代码仓库 + Actions 自动化）
- Vercel 账号（免费版即可，使用 GitHub 登录）
- SMTP 邮箱（Gmail / 企业邮箱，用于发送日报）
- 域名 chonghing.chonghing.uk 的 DNS 管理权限

---

## 第一步：创建 GitHub 仓库

### 1.1 在 GitHub 创建新仓库

1. 登录 https://github.com
2. 点击右上角 **+** → **New repository**
3. 仓库名称：`chb-news-monitor`
4. 可见性：**Private**（建议私有，保护媒体源配置）
5. 勾选 **Add a README file**
6. 点击 **Create repository**

### 1.2 推送代码到 GitHub

在本地项目目录执行：

```bash
cd chb-news-site

# 初始化 git（如果还没有）
git init
git add .
git commit -m "Initial commit: CHB News Monitor System"

# 关联远程仓库（替换 YOUR_USERNAME）
git remote add origin https://github.com/YOUR_USERNAME/chb-news-monitor.git
git branch -M main
git push -u origin main
```

---

## 第二步：配置 GitHub Secrets

进入 GitHub 仓库页面 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

依次添加以下 Secrets：

| Secret 名称 | 值 | 说明 |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP服务器地址 |
| `SMTP_PORT` | `587` | SMTP端口（TLS=587, SSL=465） |
| `SMTP_USER` | `your-email@gmail.com` | 发件邮箱账号 |
| `SMTP_PASS` | `your-app-password` | 邮箱密码/App Password |
| `FROM_ADDR` | `chb-monitor@chonghing.uk` | 发件人显示地址 |
| `TO_ADDRS` | `comms1@chonghing.com,comms2@chonghing.com` | 收件人（逗号分隔） |
| `BCC_ADDRS` | `head@chonghing.com` | 密送（可选，逗号分隔） |
| `VERCEL_DEPLOY_HOOK` | （第三步获取后再填） | Vercel自动部署钩子 |

### Gmail App Password 获取方法

1. 登录 Google 账号 → https://myaccount.google.com/security
2. 启用 **两步验证**（如未启用）
3. 搜索 **App passwords** → 创建新应用密码
4. 应用名称输入 `CHB Monitor`
5. 复制生成的16位密码，填入 `SMTP_PASS`

> 如果使用企业邮箱（如 Office 365），SMTP 填 `smtp.office365.com:587`

---

## 第三步：Vercel 部署

### 3.1 创建 Vercel 项目

1. 登录 https://vercel.com（用 GitHub 账号登录）
2. 点击 **Add New** → **Project**
3. 选择刚创建的 `chb-news-monitor` 仓库
4. 配置：
   - **Framework Preset**: Other
   - **Root Directory**: `chb-news-site`（如果仓库根目录就是 chb-news-site 则留空）
   - **Build Command**: 留空（`vercel-build` 会输出 echo）
   - **Output Directory**: 留空
   - **Install Command**: `npm install`
5. 点击 **Deploy**

### 3.2 等待首次部署完成

Vercel 会自动：
- 安装 `package.json` 中的依赖
- 识别 `vercel.json` 配置
- 部署 `api/index.js` 为 serverless 函数
- 部署 `public/` 为静态资源

部署成功后会获得一个临时域名：`chb-news-monitor-xxx.vercel.app`

### 3.3 创建 Deploy Hook

1. 进入 Vercel 项目 → **Settings** → **Deploy Hooks**
2. 点击 **Create Hook**
3. Hook 名称：`daily-collect`
4. Target Branch：`main`
5. 创建后复制 URL（格式：`https://api.vercel.com/v1/integrations/deploy/xxx`）
6. 将此 URL 添加回 GitHub Secrets 的 `VERCEL_DEPLOY_HOOK`

---

## 第四步：绑定自定义域名

### 4.1 在 Vercel 添加域名

1. 进入 Vercel 项目 → **Settings** → **Domains**
2. 点击 **Add Domain**
3. 输入 `chonghing.chonghing.uk`
4. 点击 **Add**

Vercel 会显示需要配置的 DNS 记录：

```
类型: CNAME
名称: chonghing
值: cname.vercel-dns.com
```

### 4.2 在 DNS 管理面板配置

登录 chonghing.uk 的 DNS 管理面板（如 Cloudflare / GoDaddy / 阿里云）：

1. 添加记录：
   - **类型**: CNAME
   - **主机记录**: `chonghing`
   - **记录值**: `cname.vercel-dns.com`
   - **TTL**: 600（或默认）

2. 保存后等待 DNS 生效（通常 5-30 分钟）

3. 回到 Vercel，域名状态变为 **Valid Configuration** 即表示成功

### 4.3 HTTPS 证书

Vercel 自动为自定义域名签发 Let's Encrypt SSL 证书，无需手动配置。

---

## 第五步：手动触发首次采集测试

### 5.1 在 GitHub Actions 手动触发

1. 进入 GitHub 仓库 → **Actions** 标签页
2. 左侧选择 **CHB News Daily Collection**
3. 点击 **Run workflow** 按钮
4. 选择 `main` 分支，点击 **Run workflow**
5. 等待执行完成（约 5-10 分钟）

### 5.2 检查执行日志

点击运行中的 workflow → 展开各步骤查看日志：

- **Run Daily Collection** 步骤应显示：
  - `[1/6] 采集RSS源` → 命中数量
  - `[2/6] 运行站点爬虫` → 爬虫命中
  - `[3/6] 加载AI深度研究数据`
  - `[4/6] 去重分级入库` → 新增/重复条数
  - `[5/6] 生成每日报告`
  - `[6/6] 邮件推送` → 发送成功

- **Commit Updated Data** 步骤应显示：
  - `daily: YYYY-MM-DD news collection update`

- **Trigger Vercel Deploy** 步骤应显示：
  - `Vercel deploy triggered`

### 5.3 验证结果

1. **检查邮箱**：收件箱应收到「创兴银行新闻监测日报」邮件
2. **访问网站**：打开 `https://chonghing.chonghing.uk` 看到最新报告
3. **检查仓库**：GitHub 仓库 `data/` 目录下 JSON 文件已更新

---

## 文件结构说明

```
chb-news-site/
├── .github/workflows/
│   └── daily-collect.yml          # GitHub Actions 定时任务
├── api/
│   └── index.js                   # Vercel serverless 入口
├── config/
│   ├── sources.json               # 91个基础媒体源
│   └── sources_full_config.json   # 3793个完整媒体源
├── data/                          # 数据持久化（git 跟踪）
│   ├── news_items.json            # 新闻条目
│   ├── reports.json               # 生成报告
│   ├── fetch_logs.json            # 采集日志
│   └── source_status.json         # 媒体源状态
├── deploy/
│   └── cloud/
│       └── daily_collect.js       # 云端每日采集+邮件推送
├── public/                        # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── scripts/
│   ├── crawler_hkcd.js            # 匯港通訊爬虫
│   ├── crawler_ulifestyle.js      # U Lifestyle爬虫
│   └── run_crawlers.js            # 爬虫调度器
├── src/
│   ├── app.js                     # 本地开发 Express 入口
│   ├── routes/api.js              # API路由
│   └── services/
│       ├── fetcher.js             # RSS采集+分级引擎
│       ├── reportBuilder.js       # 报告生成器
│       ├── store.js               # JSON数据存储层
│       └── cronJob.js             # 本地定时任务
├── .env.example                   # 环境变量模板
├── .gitattributes                 # Git换行符配置
├── .gitignore                     # Git忽略规则
├── package.json                   # 依赖配置
└── vercel.json                    # Vercel部署配置
```

---

## 日常运维

### 修改收件人

进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
→ 编辑 `TO_ADDRS` 或 `BCC_ADDRS` 的值

### 修改监测关键词

编辑 `src/services/fetcher.js` 中的 `TIER_B_KEYWORDS` 和 `TIER_C_KEYWORDS` 数组，
提交到 GitHub，Vercel 自动重新部署

### 调整采集时间

编辑 `.github/workflows/daily-collect.yml` 中的 cron 表达式：

```yaml
# 当前：每天香港时间 08:00（UTC 00:00）
- cron: '0 0 * * *'

# 改为每天香港时间 06:00（UTC 22:00 前一天）
- cron: '0 22 * * *'

# 改为每天两次：香港时间 08:00 和 14:00
- cron: '0 0,6 * * *'
```

### 手动触发采集

GitHub 仓库 → **Actions** → **CHB News Daily Collection** → **Run workflow**

### 查看采集历史

GitHub 仓库 → **Actions** 标签页可查看所有历史运行记录和日志

---

## 常见问题排查

### Q: 邮件没有收到？

1. 检查 GitHub Actions 执行日志中 `[6/6]` 步骤是否有报错
2. 检查 `SMTP_PASS` 是否正确（Gmail 需用 App Password 而非登录密码）
3. 检查收件人邮箱的垃圾邮件文件夹
4. 如果当日无新闻，系统不会发送邮件（日志显示"今日无报告，跳过邮件推送"）

### Q: 网站显示旧数据？

1. 检查 GitHub Actions 的 `Commit Updated Data` 步骤是否成功 push
2. 检查 `Trigger Vercel Deploy` 步骤是否返回成功
3. 手动进入 Vercel 项目 → **Redeploy**

### Q: GitHub Actions 没有自动运行？

1. GitHub 免费版对 Private 仓库的 Actions 有每月限额（2000分钟），通常够用
2. cron 调度可能有 5-15 分钟延迟（GitHub 官方说明）
3. 确保 workflow 文件在 `main` 分支上

### Q: Vercel 免费版限制？

- 每月 100GB 流量（通常足够）
- Serverless 函数最大执行 30 秒（已配置 `maxDuration: 30`）
- 日常浏览足够，如果流量增长可升级 Pro 版

### Q: 爬虫在 GitHub Actions 上失败？

- Ubuntu 环境网络可能对部分香港网站有延迟
- 爬虫有重试机制和超时保护，偶尔失败不影响整体
- 日志中 `爬虫运行出错（非致命）` 表示已跳过继续执行

---

## 成本估算

| 组件 | 费用 |
|---|---|
| GitHub（Private 仓库 + Actions） | 免费（2000分钟/月） |
| Vercel（Hobby 版） | 免费（100GB流量/月） |
| 域名 chonghing.uk | 已有 |
| SMTP（Gmail） | 免费 |
| **总计** | **¥0/月** |

对比 Wiser 付费版：约 HK$X,XXX/月 → 完全免费替代

---

## 技术支持

如有问题，请联系系统开发团队或查看：
- GitHub Actions 文档：https://docs.github.com/en/actions
- Vercel 部署文档：https://vercel.com/docs
- 本系统代码仓库：https://github.com/YOUR_USERNAME/chb-news-monitor
