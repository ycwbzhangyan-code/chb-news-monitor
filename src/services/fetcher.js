/**
 * RSS 采集器 + 去重 + 分级引擎
 * 从91个媒体源并发采集，关键词匹配，误报排除，SHA1去重，A/B/C/X分级
 */
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const store = require('./store');

// 加载配置 — 优先使用3793条完整源配置，降级到91源
let SOURCES;
const fullConfigPath = path.join(__dirname, '..', '..', 'config', 'sources_full_config.json');
const fallbackPath = path.join(__dirname, '..', '..', 'config', 'sources.json');
if (fs.existsSync(fullConfigPath)) {
  SOURCES = require(fullConfigPath);
  console.log(`[Fetcher] 加载完整源配置: ${SOURCES.sources.length}条, ${SOURCES.sources.filter(s => s.rss).length}个RSS`);
} else {
  SOURCES = require(fallbackPath);
  console.log(`[Fetcher] 加载基础源配置: ${SOURCES.sources.length}条`);
}
const RULES = require(path.join(__dirname, '..', '..', 'config', 'rules.json'));

const WATCH_TERMS = SOURCES.meta.watch_terms;
const WATCH_TERMS_WB = SOURCES.meta.watch_terms_word_boundary || [];
const EXCLUDE_KEYWORDS = RULES.exclude_keywords;
const EXCLUDE_CONTEXT = RULES.exclude_context;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

// B类关键词（重要新闻 — 原+A类高危词合并到此）
const TIER_B_KEYWORDS = [
  '罚', '罰', '处罚', '處罰', '警告', '评级', '評級', '展望', '评级下调', '評級下調',
  '业绩', '業績', '财报', '財報', '盈利', '亏损', '虧損',
  '诉讼', '訴訟', '起诉', '起訴', '调查', '調查', '涉嫌',
  '高管', '辞任', '辭任', '委任', '离职', '離職', '人事变动', '人事變動',
  '牌照', '开业', '開業', '迁址', '遷址',
  '战略合作', '戰略合作', '收购', '收購', '合并', '合併',
  '越秀集团', '越秀集團',
  // 原B类词
  '推广', '定價', '定价', '利率', '优惠', '優惠', '定存', '定期存款',
  '合作', '签约', '簽約', '案例', '排名', '奖项', '獎項',
  'ESG', '公益', '慈善', '环保', '環保', '海岸清洁',
  '系统维护', '系統維護', '服务变更', '服務變更', '电子结单', '電子結喸',
  '授信', '借款', '贷款', '貸款', '额度', '額度',
  '深圳分行', '北京分行', '广州分行', '廣州分行', '上海分行',
  '分行', '新客户', '新客戶', '出粮', '数码银行',
  '框架协议', '李锋', '路亮',
  // 补充：定存比较类关键词
  '掉頭減息', '掉头减息', '匯率', '汇率', '兌換', '兑换',
  '澳元', '歐元', '欧元', '台幣', '台币',
  '稅務貸款', '税务贷款', '稅貸', '税贷',
  '加息', '儲局', '富融', '眾安', '建行',
];

function matchKeywords(title, desc) {
  const text = (title + ' ' + (desc || '')).toLowerCase();
  for (const term of WATCH_TERMS) {
    if (text.includes(term.toLowerCase())) return true;
  }
  // 词边界匹配（如CHB需要前后是非字母字符）
  for (const term of WATCH_TERMS_WB) {
    const lower = term.toLowerCase();
    const regex = new RegExp('(^|[^a-z])' + lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)', 'i');
    if (regex.test(text)) return true;
  }
  return false;
}

function isFalsePositive(title, desc) {
  const text = title + ' ' + (desc || '');
  for (const kw of EXCLUDE_KEYWORDS) {
    if (text.includes(kw)) {
      if (text.includes('银行') || text.includes('銀行') || text.includes('Bank')) continue;
      return true;
    }
  }
  for (const ctx of EXCLUDE_CONTEXT) {
    if (text.includes(ctx)) return true;
  }
  return false;
}

function classify(item) {
  // 1. 误报排除
  if (isFalsePositive(item.title, item.desc)) {
    return { tier: 'X', reason: '同名混淆排除' };
  }

  // 2. AI研判优先（A类已废弃，A自动降为B）
  if (item.tier_hint) {
    if (item.tier_hint === 'A') return { tier: 'B', reason: 'AI深度研判(原A类→B)' };
    if (item.tier_hint === 'B') return { tier: 'B', reason: 'AI深度研判' };
    if (item.tier_hint === 'C') return { tier: 'C', reason: 'AI深度研判' };
  }

  const text = item.title + ' ' + (item.desc || '');

  // 3. B类判定（含原A类高危词）
  if (TIER_B_KEYWORDS.some(kw => text.includes(kw))) {
    return { tier: 'B', reason: '重要新闻' };
  }

  // 4. 默认C类
  return { tier: 'C', reason: '例行提及' };
}

function hashTitle(title) {
  const normalized = store.normalizeTitle(title);
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function parseRSS(xmlText) {
  const items = [];
  try {
    const parsed = xmlParser.parse(xmlText);

    // RSS 2.0
    if (parsed.rss && parsed.rss.channel && parsed.rss.channel.item) {
      const rawItems = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
      for (const item of rawItems) {
        items.push({
          title: item.title || '',
          link: item.link || '',
          description: item.description || item.summary || '',
          pubDate: item.pubDate || item['dc:date'] || '',
        });
      }
    }

    // Atom
    if (parsed.feed && parsed.feed.entry) {
      const entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
      for (const entry of entries) {
        let link = '';
        if (entry.link) {
          if (Array.isArray(entry.link)) {
            link = entry.link.find(l => l['@_rel'] === 'alternate') || entry.link[0];
            link = link['@_href'] || '';
          } else {
            link = entry.link['@_href'] || '';
          }
        }
        items.push({
          title: entry.title || '',
          link: link,
          description: entry.summary || entry.content || '',
          pubDate: entry.updated || entry.published || '',
        });
      }
    }

    // RDF
    if (parsed['rdf:RDF'] && parsed['rdf:RDF'].item) {
      const rawItems = Array.isArray(parsed['rdf:RDF'].item) ? parsed['rdf:RDF'].item : [parsed['rdf:RDF'].item];
      for (const item of rawItems) {
        items.push({
          title: item.title || '',
          link: item.link || '',
          description: item.description || '',
          pubDate: item['dc:date'] || '',
        });
      }
    }
  } catch (e) { /* parse error, return empty */ }
  return items;
}

async function fetchOneSource(source) {
  const startTime = Date.now();
  const result = {
    source_id: source.id,
    source_name: source.name,
    status: 'ok',
    items_fetched: 0,
    items_matched: 0,
    error: null,
    duration_ms: 0,
    hits: [],
  };

  if (!source.rss) {
    result.status = 'no_rss';
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(source.rss, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CHB-Monitor/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      follow: 5,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      result.status = 'http_' + response.status;
      result.error = 'HTTP ' + response.status;
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    const xmlText = await response.text();
    const items = parseRSS(xmlText);
    result.items_fetched = items.length;

    for (const item of items) {
      // Google News 聚合源：标题形如「真實標題 - 媒體名」，剝離後綴避免重複去匹配失效
      let title = item.title;
      let desc = item.description;
      let sourceName = source.name;
      if (source.name.startsWith('GNews') || source.name.startsWith('Google News')) {
        const parts = String(title).split(' - ');
        if (parts.length > 1) {
          const publisher = parts[parts.length - 1].trim();
          title = parts.slice(0, -1).join(' - ').trim();
          sourceName = publisher ? `${publisher}（Google News聚合）` : source.name;
          desc = `${desc || ''} [原始媒体: ${publisher}]`.trim();
        }
      }
      if (matchKeywords(title, desc)) {
        if (!isFalsePositive(title, desc)) {
          result.hits.push({
            title,
            link: item.link,
            desc,
            pubDate: item.pubDate,
            source_id: source.id,
            source_name: sourceName,
            source_cat: source.cat,
            lang: source.lang,
            tier_hint: null,
          });
          result.items_matched++;
        }
      }
    }

    result.duration_ms = Date.now() - startTime;
  } catch (e) {
    result.status = 'error';
    result.error = e.name === 'AbortError' ? 'timeout' : (e.message || String(e)).substring(0, 200);
    result.duration_ms = Date.now() - startTime;
  }

  return result;
}

async function fetchAllSources(daysWindow = 7, concurrency = 20) {
  const sources = SOURCES.sources.filter(s => s.rss && s.rss.length > 0);
  console.log(`[Fetcher] 开始采集 ${sources.length} 个RSS源 (并发: ${concurrency})`);
  const results = [];
  const allHits = [];
  let batchNum = 0;

  for (let i = 0; i < sources.length; i += concurrency) {
    batchNum++;
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(s => fetchOneSource(s)));
    results.push(...batchResults);
    for (const r of batchResults) {
      if (r.hits && r.hits.length > 0) allHits.push(...r.hits);
    }
    // 每5批打印一次进度
    if (batchNum % 5 === 0 || i + concurrency >= sources.length) {
      console.log(`[Fetcher] 进度: ${Math.min(i + concurrency, sources.length)}/${sources.length} 源已处理, 累计命中 ${allHits.length}`);
    }
  }

  return { results, hits: allHits };
}

function loadAIResearch() {
  const aiPath = path.join(__dirname, '..', '..', 'data', 'ai_research.json');
  if (fs.existsSync(aiPath)) {
    const data = JSON.parse(fs.readFileSync(aiPath, 'utf-8'));
    return data.items || [];
  }
  return [];
}

// ===== 入库闸门（2026-11-23 修复）=====
// 背景：11/21-11/22 自动采集误将 Google News 历史文章(2013-2025)与宽主题噪音入库。
// 根因：fetchAllSources 的 daysWindow 参数从未使用 + 宽主题候选(定存/加息/外汇)自动入库。
// 原则：自动采集只入库「创兴银行为主体 + 监测窗口内 + 非官网稿 + 非同名误报」的真实新闻。
//       宽主题候选仅作发现器，需人工核验后经 import_*.js 入库，不进自动闸门。
const MONITOR_START = '2026-10-26';       // 监测起始日
const CORE_CHB = /(创兴银行|創興銀行|创興銀行|chong\s*hing\s*bank|chong\s*hing|廖創興銀行|廖创兴银行|chbank)/i;
const OFFICIAL_PAT = /(chbank\.com|创兴银行官网|創興銀行官網|官方微信|官方网站)/i;
// 同名/八卦误报：廖创兴创办人家属八卦、廖创兴企业(00194)等
const FP_PAT = /(廖倬竩|曾孙女|曾孫女|結婚|结婚|婚纱|婚紗|怒晒|上圍|八卦|廖創興企業|廖创兴企业|00194|樓盤|楼盘)/;

function guardHit(item) {
  // 1) 日期闸门：必须在监测窗口内（含未来1天容错），无日期的拒绝
  const d = store.normalizeDate(item.pubDate || item.date);
  if (!d || d < MONITOR_START) {
    return { pass: false, reason: 'out_of_window:' + (d || 'no_date') };
  }
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (d > tomorrow) return { pass: false, reason: 'future_date:' + d };

  const title = String(item.title || '');
  const desc = String(item.desc || item.description || '');
  const link = String(item.link || '');
  const src = String(item.source_name || '');
  const text = title + ' ' + desc;

  // 2) 官网稿排除：创兴银行自有渠道不算媒体监测
  if (OFFICIAL_PAT.test(link) || OFFICIAL_PAT.test(src)) {
    return { pass: false, reason: 'official_excluded' };
  }

  // 3) 同名/八卦误报排除
  if (FP_PAT.test(text)) return { pass: false, reason: 'false_positive' };

  // 4) 创兴银行相关性：标题或摘要必须真的提到创兴银行主体
  if (!CORE_CHB.test(text)) {
    return { pass: false, reason: 'no_chb_entity' };
  }

  // 5) 沿用既有误报规则
  if (isFalsePositive(title, desc)) return { pass: false, reason: 'rule_excluded' };

  return { pass: true };
}

function saveAllHits(rssHits, aiHits) {
  // AI 深度研究数据是人工核验过的可信源，直接放行；自动采集命中必须过闸门
  const autoHits = rssHits;
  const stats = { total: autoHits.length, pass: 0, rejected: {} };

  const guarded = autoHits.filter(item => {
    const g = guardHit(item);
    if (g.pass) { stats.pass++; return true; }
    stats.rejected[g.reason] = (stats.rejected[g.reason] || 0) + 1;
    return false;
  });

  // 合并所有命中，添加hash和tier
  const allItems = [...aiHits, ...guarded].map(item => {
    const hash = hashTitle(item.title);
    const { tier, reason } = classify(item);
    return {
      hash,
      title: item.title,
      link: item.link || '',
      description: item.desc || '',
      source_id: item.source_id || '',
      source_name: item.source_name || '',
      source_cat: item.source_cat || item.cat || '',
      lang: item.lang || 'CH',
      pub_date: item.pubDate || item.date || new Date().toISOString(),
      fetch_date: new Date().toISOString(),
      tier,
      tier_reason: reason,
      status: 'active',
      ai_researched: item.tier_hint ? 1 : 0,
    };
  });

  const result = store.addNews(allItems);
  result.guard = stats;
  return result;
}

module.exports = {
  fetchAllSources,
  saveAllHits,
  loadAIResearch,
  classify,
  matchKeywords,
  isFalsePositive,
  hashTitle,
  guardHit,
};
