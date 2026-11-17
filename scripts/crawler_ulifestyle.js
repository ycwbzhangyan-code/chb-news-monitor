/**
 * U Lifestyle (ulifestyle.com.hk) 爬虫
 * 
 * 网站结构：
 * - 理财栏目: /category/10404/理財 （含定存利率比较文章）
 * - 文章详情页: /topic/detail/{ID}/{标题URL编码} 或 /activity/detail/{ID}/{标题URL编码}
 * - 全部文章: /all 或 /listing?page=N
 * - 无RSS，无搜索，全站免费
 * 
 * 采集策略：
 * 1. 抓取理财栏目页（定存比较类文章集中地）
 * 2. 抓取全部文章列表页（覆盖汇率、税贷等）
 * 3. 解析文章标题，关键词匹配"创兴银行/創興銀行/Chong Hing"
 * 4. 命中后访问详情页提取正文
 * 5. 去重后导入news_items.json
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://hk.ulifestyle.com.hk';
const DATA_FILE = path.join(__dirname, '..', 'data', 'news_items.json');

// 目标栏目（理财类最可能含创兴银行）
const CATEGORIES = [
  { id: '10404', name: '理財', url: 'https://hk.ulifestyle.com.hk/category/10404/%E7%90%86%E8%B2%A1' },
  { id: '10402', name: '社會', url: 'https://hk.ulifestyle.com.hk/category/10402/%E7%A4%BE%E6%9C%83' },
  { id: '10403', name: '健康', url: 'https://hk.ulifestyle.com.hk/category/10403/%E5%81%A5%E5%BA%B7' },
];

// 关键词
const WATCH_TERMS = [
  '创兴银行', '創興銀行', 'Chong Hing Bank', 'Chong Hing',
  'chbank', '创兴', '創興',
  // 扩展：定存比较类关键词（文章标题常含这些词且文中列出创兴银行）
  '港元定存', '港元定期', '美元定期', '定存攻略', '定存比較',
  '利率比較', '銀行利率', '新客優惠', '稅務貸款', '稅貸',
  '匯率比較', '兌換攻略',
];

// 严格关键词（标题必须含这些才确认是创兴银行相关）
const STRICT_TERMS = ['创兴', '創興', 'Chong Hing', 'chbank'];

// 排除词
const EXCLUDE_TERMS = ['廖創興企業', '廖创兴企业', '00194'];

/**
 * 抓取HTML
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
        if (i < retries) continue;
        return null;
      }
      return await resp.text();
    } catch (e) {
      if (i < retries) continue;
      return null;
    }
  }
  return null;
}

/**
 * 从栏目页解析文章列表
 * HTML格式: <a href="https://hk.ulifestyle.com.hk/topic/detail/{ID}/{slug}" title="标题">
 */
function parseArticleList(html, catName) {
  const articles = [];
  
  // 匹配完整URL格式的文章链接（带title属性）
  const linkRegex = /href="(?:https?:\/\/hk\.ulifestyle\.com\.hk)?(\/(?:topic|activity)\/detail\/(\d+)\/[^"]+)"\s+title="([^"]+)"/g;
  
  let match;
  const seen = new Set();
  while ((match = linkRegex.exec(html)) !== null) {
    const url = BASE_URL + match[1];
    const articleId = match[2];
    const title = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    
    if (seen.has(articleId)) continue;
    seen.add(articleId);
    
    articles.push({
      url,
      articleId,
      title,
      category: catName,
    });
  }
  
  // 也匹配不带title属性的链接（用slug作为标题）
  const linkRegex2 = /href="(?:https?:\/\/hk\.ulifestyle\.com\.hk)?(\/(?:topic|activity)\/detail\/(\d+)\/([^"]+))"/g;
  while ((match = linkRegex2.exec(html)) !== null) {
    const articleId = match[2];
    if (seen.has(articleId)) continue;
    seen.add(articleId);
    
    const url = BASE_URL + match[1];
    const titleSlug = decodeURIComponent(match[3]).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    
    articles.push({
      url,
      articleId,
      title: titleSlug,
      category: catName,
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
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    title = h1Match[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!title) {
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitle) {
      title = ogTitle[1];
    }
  }
  if (!title) {
    const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleTag) {
      title = titleTag[1].replace(/\s*\|.*$/, '').replace(/\s*-.*$/, '').trim();
    }
  }
  
  // 提取发布日期
  // 尝试 meta property="article:published_time"
  const metaDate = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
  if (metaDate) {
    const d = new Date(metaDate[1]);
    if (!isNaN(d)) {
      pubDate = d.toISOString().split('T')[0];
    }
  }
  // 尝试从文本中提取日期
  if (!pubDate) {
    const dateMatch = html.match(/(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})/);
    if (dateMatch) {
      pubDate = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
    }
  }
  
  // 提取正文
  // 尝试 meta property="og:description"
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (ogDesc) {
    content = ogDesc[1];
  }
  
  // 尝试从正文div提取
  if (content.length < 100) {
    const contentPatterns = [
      /<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*detail[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
    ];
    
    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        const extracted = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (extracted.length > content.length) {
          content = extracted;
        }
        if (content.length > 200) break;
      }
    }
  }
  
  // 兜底：提取所有<p>标签
  if (content.length < 100) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) {
      content = pMatches
        .map(p => p.replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 10)
        .join(' ')
        .substring(0, 2000);
    }
  }
  
  return { title, content: content.substring(0, 1000), pubDate };
}

/**
 * 关键词匹配 — 分两层
 * 第一层：标题含严格关键词（创兴/創興/Chong Hing）→ 直接命中
 * 第二层：标题含宽泛关键词（定存比较等）→ 需正文含严格关键词才确认
 */
function matchTitle(title) {
  for (const ex of EXCLUDE_TERMS) {
    if (title.includes(ex)) return null;
  }
  // 严格匹配
  for (const term of STRICT_TERMS) {
    if (title.includes(term)) return 'strict';
  }
  // 宽泛匹配
  for (const term of WATCH_TERMS) {
    if (title.includes(term)) return 'broad';
  }
  return null;
}

function matchContent(text) {
  for (const ex of EXCLUDE_TERMS) {
    if (text.includes(ex)) return false;
  }
  for (const term of STRICT_TERMS) {
    if (text.includes(term)) return true;
  }
  return false;
}

/**
 * 去重
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
async function crawlULifestyle(daysWindow = 7) {
  console.log('\n========================================');
  console.log('  U Lifestyle 爬虫启动');
  console.log('  目标: hk.ulifestyle.com.hk');
  console.log('========================================\n');
  
  const existingNews = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysWindow);
  
  let totalScanned = 0;
  let totalMatched = 0;
  const newHits = [];
  
  // 1. 抓取理财栏目页（可翻页）
  for (const cat of CATEGORIES) {
    for (let page = 1; page <= 3; page++) {
      const catUrl = page === 1 ? cat.url : `${cat.url}?page=${page}`;
      console.log(`[栏目] ${cat.name} 第${page}页: ${catUrl.substring(0, 60)}...`);
      
      const html = await fetchHTML(catUrl);
      if (!html) {
        console.log(`  → 无法获取，跳过`);
        continue;
      }
      
      const articles = parseArticleList(html, cat.name);
      console.log(`  → 发现 ${articles.length} 篇文章`);
      
      if (articles.length === 0) break; // 无更多文章
      
      // 2. 检查每篇文章
      for (const article of articles) {
        totalScanned++;
        
        const matchType = matchTitle(article.title);
        if (!matchType) continue;
        
        console.log(`  [标题${matchType === 'strict' ? '严格' : '宽泛'}命中] ${article.title.substring(0, 40)}`);
        
        // 严格命中：直接获取详情页
        // 宽泛命中：需检查正文是否含严格关键词
        const detailHtml = await fetchHTML(article.url);
        if (!detailHtml) continue;
        
        const detail = parseArticleDetail(detailHtml);
        const fullText = (detail.title || article.title) + ' ' + detail.content;
        
        if (matchType === 'strict' || matchContent(fullText)) {
          // 日期过滤
          if (detail.pubDate) {
            const d = new Date(detail.pubDate);
            if (d < cutoffDate) {
              console.log(`    → 日期${detail.pubDate}超出范围，跳过`);
              continue;
            }
          }
          
          if (!isDuplicate(existingNews, article.url, detail.title || article.title)) {
            // 确定分级
            const title = detail.title || article.title;
            let tier = 'C';
            let reason = 'U Lifestyle報道';
            if (title.includes('定存') || title.includes('定期') || title.includes('利率')) {
              tier = 'B';
              reason = '定存/利率比較';
            } else if (title.includes('匯率') || title.includes('兌換')) {
              tier = 'C';
              reason = '匯率比較中提及';
            } else if (title.includes('稅貸') || title.includes('稅務貸款')) {
              tier = 'B';
              reason = '貸款產品比較';
            } else if (matchType === 'strict') {
              tier = 'B';
              reason = '直接提及創興銀行';
            }
            
            const pubDate = detail.pubDate || new Date().toISOString().split('T')[0];
            
            newHits.push({
              id: 'ulife_' + article.articleId,
              title: title,
              link: article.url,
              description: detail.content.substring(0, 500),
              source_name: 'U Lifestyle',
              source_cat: 'hk_business',
              pub_date: pubDate + 'T00:00:00+08:00',
              tier,
              tier_reason: reason,
              status: 'active',
              fingerprint: 'ulife_' + article.articleId,
              collected_at: new Date().toISOString(),
            });
            totalMatched++;
            console.log(`    ✅ 已收录 [${tier}]: ${title.substring(0, 30)}`);
          } else {
            console.log(`    → 已存在，跳过`);
          }
        } else {
          console.log(`    → 正文未含创兴银行，跳过`);
        }
        
        await new Promise(r => setTimeout(r, 500));
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // 3. 也检查全部文章列表页
  for (let page = 1; page <= 5; page++) {
    const listUrl = `${BASE_URL}/listing?page=${page}`;
    console.log(`[全部] 第${page}页: ${listUrl}`);
    
    const html = await fetchHTML(listUrl);
    if (!html) continue;
    
    const articles = parseArticleList(html, '全部');
    console.log(`  → 发现 ${articles.length} 篇文章`);
    
    if (articles.length === 0) break;
    
    for (const article of articles) {
      totalScanned++;
      const matchType = matchTitle(article.title);
      if (!matchType) continue;
      
      console.log(`  [标题命中] ${article.title.substring(0, 40)}`);
      
      const detailHtml = await fetchHTML(article.url);
      if (!detailHtml) continue;
      
      const detail = parseArticleDetail(detailHtml);
      const fullText = (detail.title || article.title) + ' ' + detail.content;
      
      if (matchType === 'strict' || matchContent(fullText)) {
        if (detail.pubDate) {
          const d = new Date(detail.pubDate);
          if (d < cutoffDate) continue;
        }
        
        if (!isDuplicate(existingNews, article.url, detail.title || article.title)) {
          const title = detail.title || article.title;
          let tier = 'C';
          let reason = 'U Lifestyle報道';
          if (title.includes('定存') || title.includes('定期') || title.includes('利率')) {
            tier = 'B';
            reason = '定存/利率比較';
          } else if (matchType === 'strict') {
            tier = 'B';
            reason = '直接提及創興銀行';
          }
          
          const pubDate = detail.pubDate || new Date().toISOString().split('T')[0];
          
          newHits.push({
            id: 'ulife_' + article.articleId,
            title: title,
            link: article.url,
            description: detail.content.substring(0, 500),
            source_name: 'U Lifestyle',
            source_cat: 'hk_business',
            pub_date: pubDate + 'T00:00:00+08:00',
            tier,
            tier_reason: reason,
            status: 'active',
            fingerprint: 'ulife_' + article.articleId,
            collected_at: new Date().toISOString(),
          });
          totalMatched++;
          console.log(`    ✅ 已收录 [${tier}]: ${title.substring(0, 30)}`);
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n========================================`);
  console.log(`  U Lifestyle 爬虫完成`);
  console.log(`  扫描文章: ${totalScanned}`);
  console.log(`  命中: ${totalMatched}`);
  console.log(`========================================\n`);
  
  return { source: 'ulifestyle', totalScanned, totalMatched, newHits };
}

// 直接运行
if (require.main === module) {
  (async () => {
    const result = await crawlULifestyle(7);
    
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

module.exports = { crawlULifestyle };
