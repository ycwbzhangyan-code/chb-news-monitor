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

// 2026-11-27 结构性漏检修复：
// Wiser 宽口径新闻（如星岛 11/25「定存攻略｜美元定期存款大比拼」，标题不点名创兴，
// 但正文利率表点名「创兴银行云利率定存4.15厘」）在第1步就被 matchKeywords 漏掉，
// 导致下游已修好的 guardHit 宽口径闸门根本收不到。这里让「宽口径主题标题」也进入候选，
// 由 guardHit 做最终判定（WIDE_TOPIC + 排除宏观噪音/历史/官网稿）。
const WIDE_TOPIC_TITLE = /(定存|定期存款|存款利率|存息|高息|息率|美元定存|港元定存|外幣定存|匯率|兌換|找換|稅貸|稅務貸款|按揭|最優惠利率|P按|HIBOR|拆息|利率比較|息率比較|存款優惠|加息|減息|減息|降息)/i;
// 必须与香港/银行语境共现，避免抓成纯宏观（美股/金价）新闻
const HK_BANK_CONTEXT = /(銀行|银行|港元|hk|香港|港銀|港银|定存|存款|稅貸|税贷|按揭|P按|HIBOR|拆息|理財|理财|ballot)/i;

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
  // 宽口径候选：标题含银行存贷汇主题词且带香港/银行语境 → 放行到 guardHit 终判
  if (WIDE_TOPIC_TITLE.test(title) && HK_BANK_CONTEXT.test(title + ' ' + (desc || ''))) return true;
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

// ===== 入库闸门（2026-11-25 修正为 Wiser 分层口径）=====
// 11/23 版本把「标题不含创兴银行」全部拒绝，误挡了 Wiser 收录的定存/汇率比较类
// （这类文章标题不点名创兴银行，但在正文利率表中列出）。11/25 改为三层：
//   L1 点名创兴银行 → 直接入库（B/C 按 classify）
//   L2 宽口径主题（定存/汇率/税贷/按揭/利率比较，香港银行产品语境）→ 作为 C 类候选入库
//   L3 无关宏观噪音（美股/金价/外围经济等）、历史文章、官网稿、同名八卦 → 拒绝
// 宽口径候选标注 discovery='wide_topic'、tier_hint='C'，便于汇报时单列"邻近窗口"。
const MONITOR_START = '2026-10-26';       // 监测起始日
const CORE_CHB = /(创兴银行|創興銀行|创興銀行|chong\s*hing\s*bank|chong\s*hing|廖創興銀行|廖创兴银行|chbank)/i;
const OFFICIAL_PAT = /(chbank\.com|创兴银行官网|創興銀行官網|官方微信|官方网站)/i;
// 同名/八卦误报：廖创兴创办人家属八卦、廖创兴企业(00194)等
const FP_PAT = /(廖倬竩|曾孙女|曾孫女|結婚|结婚|婚纱|婚紗|怒晒|上圍|八卦|廖創興企業|廖创兴企业|00194|樓盤|楼盘)/;
// Wiser 宽口径主题：香港银行存贷汇产品比较（利率表点名创兴银行即算命中）
const WIDE_TOPIC = /(定存|定期存款|定期|存款利率|存息|高息|息率|港元.*息|美元.*息|外幣.*息|澳元.*息|英鎊.*息|日圓.*息|人民幣.*息|匯率|匯價|兌港元|兌美元|找換|稅貸|稅務貸款|按揭|最優惠利率|P按|HIBOR|拆息|銀行.*優惠|利率比較|息率比較|存款優惠|稅貸2026)/i;
// 纯宏观噪音：与香港银行业务无关的市场/个股新闻（Wiser 也会收录部分，但这类对传讯处无监测价值）
const MACRO_NOISE = /(美股|納指|道指|標普|納斯達克|金價|金礦|黃金ETF|原油|美債|國債|地產股|英偉達|AI基建|中期選舉|聞泰科技|半導體|A股|滬指|深成指)/i;

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

  // 3b) 乱码标题排除：Google News 偶发编码错乱（如"擎海I伙创兴银行推按贷优惠最快明日公布销安"）
  //     特征：罕见生僻字与常见词混杂、语义不通；用可疑字集合粗筛
  const GARBLE = /(擎海|銷安|销安|伙创|夥創|I伙|I夥|最快明日公布|新浪資源|鎂|[╭╮╰╯])/;
  if (GARBLE.test(title)) return { pass: false, reason: 'garbled_title' };

  // 4) 沿用既有误报规则
  if (isFalsePositive(title, desc)) return { pass: false, reason: 'rule_excluded' };

  // 5) 分层相关性
  if (CORE_CHB.test(text)) {
    return { pass: true, layer: 'direct', tier_hint: item.tier_hint || null };  // L1 直接点名
  }
  // L3 宽口径主题但命中纯宏观噪音 → 拒绝（避免美股/金价等无关新闻）
  if (WIDE_TOPIC.test(text) && !MACRO_NOISE.test(title)) {
    return { pass: true, layer: 'wide_topic', tier_hint: 'C' };  // L2 宽口径候选
  }
  return { pass: false, reason: 'no_chb_no_topic' };
}

function saveAllHits(rssHits, aiHits) {
  // 2026-11-27 硬规则：新闻库每条点开正文必须含「创兴银行」字样，否则是伪监测。
  // RSS/GNews 摘要不含正文，无法在采集阶段自动判定，故：
  //   - AI 深度研究数据（人工核验过）→ 直接入库
  //   - 自动采集命中（direct + wide）→ 全部写入 pending_articles.json 待核验池
  //     由 verify_and_import.js 抓原文正文核验，含创兴才入库。
  const autoHits = rssHits;
  const stats = { total: autoHits.length, pass: 0, direct: 0, wide_topic: 0, rejected: {}, pending: 0 };

  const pending = [];
  for (const item of autoHits) {
    const g = guardHit(item);
    if (g.pass) {
      stats.pass++;
      stats[g.layer] = (stats[g.layer] || 0) + 1;
      pending.push({
        title: item.title,
        link: item.link || '',
        desc: item.desc || '',
        source_name: item.source_name || '',
        source_id: item.source_id || '',
        source_cat: item.source_cat || item.cat || '',
        lang: item.lang || 'CH',
        pub_date: item.pubDate || item.date || '',
        layer: g.layer,
        discovered_at: new Date().toISOString(),
        status: 'pending_verification',
      });
    } else {
      stats.rejected[g.reason] = (stats.rejected[g.reason] || 0) + 1;
    }
  }
  // 持久化待核验池（与新闻库分离，保留最近 1200 条）
  if (pending.length) {
    try {
      const pendingPath = path.join(__dirname, '..', '..', 'data', 'pending_articles.json');
      let prev = [];
      if (fs.existsSync(pendingPath)) {
        try { prev = JSON.parse(fs.readFileSync(pendingPath, 'utf-8')); } catch (e) { prev = []; }
      }
      const existing = new Set(prev.map(x => store.normalizeTitle(x.title)));
      const fresh = pending.filter(x => !existing.has(store.normalizeTitle(x.title)));
      fs.writeFileSync(pendingPath, JSON.stringify([...prev, ...fresh].slice(-1200), null, 2));
      stats.pending = fresh.length;
    } catch (e) { stats.pending_error = e.message; }
  }

  // 2026-11-27: AI 研究数据同样加入待核验池（早期 ai_research.json 混有官网稿/404链接，
  // 并非全部人工核验过），统一由 verify_and_import.js 抓正文核验后再入库。
  if (aiHits && aiHits.length) {
    try {
      const pendingPath = path.join(__dirname, '..', '..', 'data', 'pending_articles.json');
      let cur = [];
      if (fs.existsSync(pendingPath)) {
        try { cur = JSON.parse(fs.readFileSync(pendingPath, 'utf-8')); } catch (e) { cur = []; }
      }
      const existing = new Set(cur.map(x => store.normalizeTitle(x.title)));
      const freshAi = aiHits.filter(x => !existing.has(store.normalizeTitle(x.title))).map(item => ({
        title: item.title,
        link: item.link || '',
        desc: item.desc || '',
        source_name: item.source_name || '',
        source_id: item.source_id || '',
        source_cat: item.source_cat || item.cat || '',
        lang: item.lang || 'CH',
        pub_date: item.pubDate || item.date || '',
        layer: 'direct',
        ai_researched: 1,
        discovered_at: new Date().toISOString(),
        status: 'pending_verification',
      }));
      fs.writeFileSync(pendingPath, JSON.stringify([...cur, ...freshAi].slice(-1200), null, 2));
      stats.ai_pending = freshAi.length;
    } catch (e) { stats.ai_pending_error = e.message; }
  }

  // 所有条目（含AI）统一走正文核验，不再有直接入库通道
  const result = { newCount: 0, dupCount: 0, guard: stats };
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
