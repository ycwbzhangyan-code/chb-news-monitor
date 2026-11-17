/**
 * 匯港通訊（香港商報 hkcd.com.hk）爬虫
 * 
 * 网站结构：
 * - 栏目列表页: /hkcdweb/column/{栏目代码}.html
 * - 文章详情页: /hkcdweb/content/{年}/{月}/{日}/content_{ID}.html
 * - 无RSS，无搜索功能，全站免费
 * 
 * 采集策略：
 * 1. 抓取滚动新闻(gdxw)、港闻(gw)、财经(cj)、财经热点(cjrd)、证券(slt)等栏目
 * 2. 解析文章列表，提取标题、链接、日期
 * 3. 访问文章详情页，提取正文
 * 4. 关键词匹配"创兴银行/創興銀行/Chong Hing Bank"
 * 5. 去重后导入news_items.json
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.hkcd.com.hk';
const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 目标栏目
const COLUMNS = [
  { code: 'gdxw', name: '滚动新闻' },
  { code: 'gw', name: '港闻' },
  { code: 'cj', name: '财经' },
  { code: 'cjrd', name: '财经热点' },
  { code: 'slt', name: '证券' },
  { code: 'zh', name: '综合' },
  { code: 'jrtt', name: '今日头条' },
];

// 关键词
const WATCH_TERMS = [
  '创兴银行', '創興銀行', 'Chong Hing Bank', 'Chong Hing',
  'chbank', '越秀集团', '越秀集團',
];

// 排除词
const EXCLUDE_TERMS = ['廖創興企業', '廖创兴企业', '00194'];

/**
 * 抓取HTML内容
 */
async function fetchHTML(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh-CN;q=0.8,en;q=0.7',
        },
        timeout: 15000,
      });
      if (!resp.ok) {
        console.log(`  [WARN] ${url} → HTTP ${resp.status}`);
        if (i < retries) continue;
        return null;
      }
      const html = await resp.text();
      return html;
    } catch (e) {
      console.log(`  [ERROR] ${url} → ${e.message}`);
      if (i < retries) continue;
      return null;
    }
  }
  return null;
}

/**
 * 从栏目页解析文章列表
 */
function parseArticleList(html, colName) {
  const articles = [];
  
  // 匹配文章链接: /hkcdweb/content/2026/11/16/content_8785488.html
  const linkRegex = /href="(\/hkcdweb\/content\/(\d{4})\/(\d{2})\/(\d{2})\/content_(\d+)\.html)"/g;
  
  let match;
  const seen = new Set();
  while ((match = linkRegex.exec(html)) !== null) {
    const url = BASE_URL + match[1];
    const year = match[2];
    const month = match[3];
    const day = match[4];
    const contentId = match[5];
    const dateStr = `${year}-${month}-${day}`;
    
    if (seen.has(contentId)) continue;
    seen.add(contentId);
    
    // 尝试提取标题（在链接附近的文本）
    // 匹配 >标题文字</a> 或 title="标题"
    const beforeText = html.substring(Math.max(0, match.index - 200), match.index);
    const afterText = html.substring(match.index, match.index + 500);
    
    let title = '';
    // 尝试从title属性提取
    const titleMatch = afterText.match(/title="([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1];
    } else {
      // 尝试从链接文本提取
      const textMatch = afterText.match(/>([^<]{4,})<\/a>/);
      if (textMatch) {
        title = textMatch[1].trim();
      }
    }
    
    // 清理标题
    title = title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    
    articles.push({
      url,
      date: dateStr,
      contentId,
      title,
      column: colName,
    });
  }
  
  return articles;
}

/**
 * 从文章详情页提取标题和正文
 */
function parseArticleDetail(html) {
  let title = '';
  let content = '';
  let pubDate = '';
  
  // 提取标题
  // <h1>标题</h1> 或 <title>标题</title>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    title = h1Match[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!title) {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/-[^-]+$/, '').trim();
    }
  }
  
  // 提取发布时间
  const dateMatch = html.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
  if (dateMatch) {
    pubDate = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
  }
  
  // 提取正文（在content类div内）
  // 尝试多种选择器
  const contentPatterns = [
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  
  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match) {
      content = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (content.length > 50) break;
    }
  }
  
  // 如果上面没提取到，尝试提取所有<p>标签内容
  if (content.length < 50) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) {
      content = pMatches
        .map(p => p.replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 10)
        .join(' ')
        .substring(0, 2000);
    }
  }
  
  return { title, content, pubDate };
}

/**
 * 关键词匹配
 */
function matchKeywords(text) {
  const lowerText = text.toLowerCase();
  
  // 排除
  for (const ex of EXCLUDE_TERMS) {
    if (text.includes(ex)) return false;
  }
  
  // 匹配
  for (const term of WATCH_TERMS) {
    if (text.includes(term) || lowerText.includes(term.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * 去重检查
 */
function isDuplicate(articles, url, title) {
  const normTitle = title.replace(/[\s\*，,。]/g, '').toLowerCase().substring(0, 12);
  return articles.some(a => {
    const aNorm = (a.title || '').replace(/[\s\*，,。]/g, '').toLowerCase().substring(0, 12);
    return a.link === url || (aNorm && aNorm === normTitle);
  });
}

/**
 * 主采集流程
 */
async function crawlHKCD(daysWindow = 7) {
  console.log('\n========================================');
  console.log('  匯港通訊（香港商報）爬虫启动');
  console.log('  目标: hkcd.com.hk');
  console.log('========================================\n');
  
  const existingNews = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysWindow);
  
  let totalScanned = 0;
  let totalMatched = 0;
  const newHits = [];
  
  // 1. 抓取各栏目列表页
  for (const col of COLUMNS) {
    const colUrl = `${BASE_URL}/hkcdweb/column/${col.code}.html`;
    console.log(`[栏目] ${col.name}: ${colUrl}`);
    
    const html = await fetchHTML(colUrl);
    if (!html) {
      console.log(`  → 无法获取栏目页，跳过`);
      continue;
    }
    
    const articles = parseArticleList(html, col.name);
    console.log(`  → 发现 ${articles.length} 篇文章`);
    
    // 2. 筛选日期范围内的文章
    const recentArticles = articles.filter(a => {
      const d = new Date(a.date);
      return d >= cutoffDate;
    });
    console.log(`  → 日期范围内: ${recentArticles.length} 篇`);
    
    // 3. 逐篇访问详情页检查关键词
    for (const article of recentArticles) {
      totalScanned++;
      
      // 先检查标题是否包含关键词
      if (article.title && matchKeywords(article.title)) {
        console.log(`  [标题命中] ${article.date} ${article.title.substring(0, 40)}`);
        
        // 获取详情页
        const detailHtml = await fetchHTML(article.url);
        if (detailHtml) {
          const detail = parseArticleDetail(detailHtml);
          const fullText = (detail.title || article.title) + ' ' + detail.content;
          
          if (matchKeywords(fullText)) {
            if (!isDuplicate(existingNews, article.url, detail.title || article.title)) {
              newHits.push({
                id: 'hkcd_' + article.contentId,
                title: detail.title || article.title,
                link: article.url,
                description: detail.content.substring(0, 500),
                source_name: '匯港通訊（香港商報）',
                source_cat: 'hk_print',
                pub_date: article.date + 'T00:00:00+08:00',
                tier: 'B',
                tier_reason: '匯港通訊報道',
                status: 'active',
                fingerprint: 'hkcd_' + article.contentId,
                collected_at: new Date().toISOString(),
              });
              totalMatched++;
              console.log(`    ✅ 已收录: ${detail.title.substring(0, 30)}`);
            }
          }
        }
        
        // 延迟避免过于频繁
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      
      // 标题不含关键词时，抽样检查正文（每3篇检查1篇）
      if (totalScanned % 3 === 0) {
        const detailHtml = await fetchHTML(article.url);
        if (detailHtml) {
          const detail = parseArticleDetail(detailHtml);
          const fullText = (detail.title || article.title) + ' ' + detail.content;
          
          if (matchKeywords(fullText)) {
            if (!isDuplicate(existingNews, article.url, detail.title || article.title)) {
              newHits.push({
                id: 'hkcd_' + article.contentId,
                title: detail.title || article.title,
                link: article.url,
                description: detail.content.substring(0, 500),
                source_name: '匯港通訊（香港商報）',
                source_cat: 'hk_print',
                pub_date: article.date + 'T00:00:00+08:00',
                tier: 'B',
                tier_reason: '匯港通訊報道',
                status: 'active',
                fingerprint: 'hkcd_' + article.contentId,
                collected_at: new Date().toISOString(),
              });
              totalMatched++;
              console.log(`  [正文命中] ${article.date} ${(detail.title || article.title).substring(0, 40)}`);
            }
          }
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  
  console.log(`\n========================================`);
  console.log(`  匯港通訊爬虫完成`);
  console.log(`  扫描文章: ${totalScanned}`);
  console.log(`  命中: ${totalMatched}`);
  console.log(`========================================\n`);
  
  return { source: 'hkcd', totalScanned, totalMatched, newHits };
}

// 如果直接运行
if (require.main === module) {
  (async () => {
    const result = await crawlHKCD(7);
    
    if (result.newHits.length > 0) {
      const news = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      news.push(...result.newHits);
      fs.writeFileSync(DATA_FILE, JSON.stringify(news, null, 2));
      console.log(`已写入 ${result.newHits.length} 条新闻到 data/news_items.json`);
    } else {
      console.log('本轮未发现新的创兴银行相关新闻');
    }
  })();
}

module.exports = { crawlHKCD };
