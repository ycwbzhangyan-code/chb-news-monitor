/**
 * 构建完整媒体源配置 v2 — 基于域名智能匹配手工RSS
 * 合并 sources_full.json(3793条) + rss_probe_cache.json(40个探测RSS) + 原91源手工RSS
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// 加载3793条完整源
const sourcesFull = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sources_full.json'), 'utf8'));
const allSources = sourcesFull.sources || [];

// 加载RSS探测缓存
const rssCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rss_probe_cache.json'), 'utf8'));

// 加载原有91源配置
const oldConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'sources.json'), 'utf8'));
const oldSources = oldConfig.sources || [];

// 构建旧源域名→RSS映射
const oldDomainRssMap = {};
const oldNameRssMap = {};
for (const s of oldSources) {
  if (s.rss && s.rss.length > 0) {
    oldNameRssMap[s.name] = s.rss;
    if (s.site) {
      try {
        let domain = s.site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        oldDomainRssMap[domain] = { rss: s.rss, name: s.name, source: s };
      } catch(e) {}
    }
  }
}

console.log('Old sources with RSS by domain:', Object.keys(oldDomainRssMap).length);

// 从URL中提取规范化域名
function normalizeDomain(url) {
  if (!url) return '';
  let d = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return d.toLowerCase();
}

// 从域名做模糊匹配
function fuzzyMatchDomain(domain, map) {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^www\./, '');
  // 精确匹配
  if (map[d]) return map[d];
  // 后缀匹配
  for (const key of Object.keys(map)) {
    if (d.endsWith(key) || key.endsWith(d)) return map[key];
  }
  // 前缀匹配（取域名主体部分）
  const parts = d.split('.');
  if (parts.length >= 2) {
    const core = parts[parts.length - 2];
    for (const key of Object.keys(map)) {
      const keyParts = key.split('.');
      if (keyParts.length >= 2 && keyParts[keyParts.length - 2] === core) return map[key];
    }
  }
  return null;
}

// 名称模糊匹配
function fuzzyMatchName(name, map) {
  if (!name) return null;
  // 精确
  if (map[name]) return map[name];
  // 去空格/标点后匹配
  const cleanName = name.replace(/[\s·・]/g, '');
  for (const key of Object.keys(map)) {
    const cleanKey = key.replace(/[\s·・]/g, '');
    if (cleanName === cleanKey || cleanName.includes(cleanKey) || cleanKey.includes(cleanName)) {
      return map[key];
    }
  }
  return null;
}

let rssFromOld = 0;
let rssFromProbe = 0;
let rssFromOriginal = 0;
let rssTotal = 0;

// 处理3793条源
const upgradedSources = allSources.map((src, idx) => {
  const name = src.name || '';
  const domain = src.domain || '';
  const lang = src.lang || 'CH';
  const cat = src.cat || 'hk_print';
  
  const id = 's' + String(idx + 1).padStart(4, '0');
  
  let site = '';
  if (domain) {
    site = domain.startsWith('http') ? domain : `https://${domain}`;
  }
  
  // RSS地址 - 四级查找
  let rss = src.rss || '';
  
  // 1. 原始数据已有的RSS
  if (rss) {
    rssFromOriginal++;
  }
  
  // 2. 旧源名称匹配
  if (!rss) {
    const match = fuzzyMatchName(name, oldNameRssMap);
    if (match) {
      rss = match;
      rssFromOld++;
    }
  }
  
  // 3. 旧源域名匹配
  if (!rss && domain) {
    const match = fuzzyMatchDomain(domain, oldDomainRssMap);
    if (match) {
      rss = match.rss;
      rssFromOld++;
    }
  }
  
  // 4. RSS探测缓存
  if (!rss && domain) {
    const d = domain.toLowerCase().replace(/^www\./, '');
    if (rssCache[d] && rssCache[d].length > 0) {
      rss = rssCache[d];
      rssFromProbe++;
    } else {
      // 尝试部分匹配
      const parts = d.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        const partial = parts.slice(i).join('.');
        if (rssCache[partial] && rssCache[partial].length > 0) {
          rss = rssCache[partial];
          rssFromProbe++;
          break;
        }
      }
    }
  }
  
  if (rss) rssTotal++;
  
  const catMap = {
    'hk_print': '香港中文纸媒',
    'hk_en': '香港英文媒体',
    'hk_business': '香港财经/网媒',
    'cn_mainland': '内地媒体',
    'tv_radio': '电视/广播',
    'news_agency': '通讯社',
    'government': '政府/机构',
    'education': '教育/学术',
    'community': '社区媒体',
  };
  
  return {
    id,
    name,
    full: name,
    lang,
    cat,
    cat_name: catMap[cat] || cat,
    rss,
    site,
    domain,
    access: rss ? 'rss' : (site ? 'crawl_only' : 'unknown'),
    no: src.no || (idx + 1),
  };
});

// 构建新配置
const newConfig = {
  meta: {
    version: '2.0',
    updated: new Date().toISOString().split('T')[0],
    note: '完整媒体源清单 — 源自WiseNews(慧科)导出表3793条 + RSS自动探测 + 手工补充',
    org: '创兴银行 企业传讯处',
    total_sources: upgradedSources.length,
    watch_terms: oldConfig.meta.watch_terms,
    categories: {
      'hk_print': '香港中文纸媒',
      'hk_en': '香港英文媒体',
      'hk_business': '香港财经/网媒',
      'cn_mainland': '内地媒体',
      'tv_radio': '电视/广播/通讯社',
      'news_agency': '通讯社',
      'government': '政府/机构',
      'education': '教育/学术',
      'community': '社区媒体',
    },
    rss_stats: {
      total_with_rss: rssTotal,
      from_original: rssFromOriginal,
      from_old_config: rssFromOld,
      from_probe: rssFromProbe,
    },
  },
  sources: upgradedSources,
};

const outputPath = path.join(CONFIG_DIR, 'sources_full_config.json');
fs.writeFileSync(outputPath, JSON.stringify(newConfig, null, 2));

console.log(`\n=== 媒体源配置升级完成 v2 ===`);
console.log(`总源数: ${upgradedSources.length}`);
console.log(`有RSS地址: ${rssTotal}`);
console.log(`  - 原始数据自带: ${rssFromOriginal}`);
console.log(`  - 旧91源匹配补充: ${rssFromOld}`);
console.log(`  - RSS探测补充: ${rssFromProbe}`);
console.log(`输出: ${outputPath}`);

// 分类统计
const catStats = {};
upgradedSources.forEach(s => {
  catStats[s.cat] = catStats[s.cat] || { total: 0, with_rss: 0 };
  catStats[s.cat].total++;
  if (s.rss) catStats[s.cat].with_rss++;
});
console.log('\n分类统计:');
Object.entries(catStats).sort((a,b) => b[1].total - a[1].total).forEach(([cat, s]) => {
  console.log(`  ${cat}: ${s.total}条 (RSS: ${s.with_rss})`);
});

// 打印前20个有RSS的源
console.log('\n有RSS的源(前20):');
upgradedSources.filter(s => s.rss).slice(0, 20).forEach(s => {
  console.log(`  ${s.id} ${s.name} | ${s.rss}`);
});
