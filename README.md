# 创兴银行新闻监测系统

## 快速启动

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 访问
http://localhost:3000
```

## 部署到 chonghing.chonghing.uk

### 方法一：Nginx 反向代理（推荐）

1. 在服务器上启动 Node 服务：
```bash
cd /path/to/chb-news-site
pm2 start src/app.js --name chb-news
pm2 save
pm2 startup  # 开机自启
```

2. Nginx 配置：
```nginx
server {
    listen 80;
    server_name chonghing.chonghing.uk;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. 配置 SSL（Let's Encrypt）：
```bash
certbot --nginx -d chonghing.chonghing.uk
```

### 方法二：Cloudflare Tunnel（无需服务器公网IP）

```bash
# 安装 cloudflared
cloudflared tunnel create chb-news
cloudflared tunnel route dns chb-news chonghing.chonghing.uk

# 配置 ~/.cloudflared/config.yml
# tunnel: <tunnel-id>
# credentials-file: ~/.cloudflared/<tunnel-id>.json
# ingress:
#   - hostname: chonghing.chonghing.uk
#     service: http://localhost:3000
#   - service: http_status:404

cloudflared tunnel run chb-news
```

## 每日自动采集

### Linux/Mac cron 定时
```bash
# 每天早上8点自动采集
0 8 * * * cd /path/to/chb-news-site && node src/services/cronJob.js >> logs/cron.log 2>&1
```

### Windows 任务计划程序
```
程序: node
参数: "C:\path\to\chb-news-site\src\services\cronJob.js"
起始位置: C:\path\to\chb-news-site
触发器: 每天 08:00
```

## 功能说明

| 页面 | 功能 |
|------|------|
| 今日研报 | 显示最新日期的新闻，按A/B/C分级展示 |
| 历史归档 | 按日期浏览历史研报 |
| 媒体源 | 91个媒体源的运行状态监控 |
| 搜索 | 关键词搜索历史新闻 |

## 数据说明

- 数据存储：JSON 文件（data/ 目录）
- 媒体源：91个源（config/sources.json）
- 分级规则：A(呈送行长) / B(重要新闻) / C(例行提及) / X(误报排除)
- 去重机制：标题SHA1哈希 + 前30字二次匹配
- AI深度研究：data/ai_research.json（Kimi深度研究结果）

## 技术栈

- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JS（无框架，零编译）
- 数据：JSON 文件存储（无需数据库）
- 采集：RSS + AI深度研究双引擎
