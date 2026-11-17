/* ===== 创兴银行新闻监测系统 前端逻辑 ===== */

// 视图切换
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    if (view === 'archive') loadArchive();
    if (view === 'sources') loadSources();
  });
});

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const wd = ['日','一','二','三','四','五','六'][d.getDay()];
  return `${y}年${m}月${day}日 星期${wd}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// 加载最新研报
async function loadLatestReport() {
  try {
    const resp = await fetch('/api/report/latest');
    const data = await resp.json();

    if (data.error) {
      document.getElementById('empty-state').style.display = 'block';
      document.getElementById('kpi-total').textContent = '0';
      document.getElementById('kpi-b').textContent = '0';
      document.getElementById('kpi-c').textContent = '0';
      document.getElementById('report-date').textContent = '暂无数据';
      return;
    }

    // KPI
    document.getElementById('kpi-total').textContent = data.stats.total;
    document.getElementById('kpi-b').textContent = data.stats.B;
    document.getElementById('kpi-c').textContent = data.stats.C;

    // 报告日期
    document.getElementById('report-date').innerHTML =
      `<strong>${formatDate(data.report_date)}</strong> · 生成于 ${formatTime(data.generated_at) || '自动'}`;

    // 摘要
    document.getElementById('report-summary').textContent = data.summary || '';

    // 渲染各分级
    renderTier('B', data.tiers.B);
    renderTier('C', data.tiers.C);

    if (data.stats.total === 0) {
      document.getElementById('empty-state').style.display = 'block';
    } else {
      document.getElementById('empty-state').style.display = 'none';
    }
  } catch (e) {
    console.error('加载研报失败:', e);
    document.getElementById('report-date').textContent = '加载失败，请刷新重试';
  }
}

function renderTier(tier, items) {
  const section = document.getElementById('section-' + tier.toLowerCase());
  const list = document.getElementById('list-' + tier.toLowerCase());
  const count = document.getElementById('count-' + tier.toLowerCase());

  if (!items || items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  count.textContent = items.length;
  list.innerHTML = items.map(item => renderNewsItem(item, tier)).join('');
}

function renderNewsItem(item, tier) {
  const desc = item.description || '';
  const descShort = desc.length > 300 ? desc.substring(0, 300) + '...' : desc;
  return `
    <div class="news-item">
      <div class="news-title">
        ${item.link ? `<a href="${item.link}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}
      </div>
      <div class="news-meta">
        <span class="news-source">${escapeHtml(item.source_name || '未知来源')}</span>
        <span class="news-date">${formatDate(item.pub_date)} ${formatTime(item.pub_date)}</span>
        <span class="news-tier-tag ${tier}">${tier}</span>
        ${item.tier_reason ? `<span>${escapeHtml(item.tier_reason)}</span>` : ''}
      </div>
      ${descShort ? `<div class="news-desc">${escapeHtml(descShort)}</div>` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 加载归档
async function loadArchive() {
  try {
    const resp = await fetch('/api/reports/list?limit=30');
    const list = await resp.json();
    const container = document.getElementById('archive-list');

    if (!list || list.length === 0) {
      container.innerHTML = '<div class="loading">暂无归档报告</div>';
      return;
    }

    container.innerHTML = list.map(r => {
      const tierClass = r.b_count > 0 ? 'has-b' : 'has-c';
      return `
        <div class="archive-item ${tierClass}" onclick="loadArchiveReport('${r.report_date}')">
          <div class="archive-item-date">${formatDate(r.report_date)}</div>
          <div class="archive-item-stats">
            <span>总计 ${r.total_items} 条</span>
            <span style="color:var(--c-b)">B: ${r.b_count}</span>
            <span style="color:var(--c-c)">C: ${r.c_count}</span>
          </div>
          ${r.summary ? `<div class="archive-item-summary">${escapeHtml(r.summary.substring(0, 200))}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('加载归档失败:', e);
  }
}

async function loadArchiveReport(date) {
  // 切换到dashboard视图并加载该日期报告
  document.querySelector('.nav-link[data-view="dashboard"]').click();
  try {
    const resp = await fetch(`/api/report/${date}`);
    const data = await resp.json();
    if (data && !data.error) {
      document.getElementById('kpi-total').textContent = data.stats.total;
      document.getElementById('kpi-b').textContent = data.stats.B;
      document.getElementById('kpi-c').textContent = data.stats.C;
      document.getElementById('report-date').innerHTML =
        `<strong>${formatDate(data.report_date)}</strong>（历史归档）`;
      document.getElementById('report-summary').textContent = data.summary || '';
      renderTier('B', data.tiers.B);
      renderTier('C', data.tiers.C);
      document.getElementById('empty-state').style.display = 'none';
    }
  } catch (e) {
    console.error('加载历史报告失败:', e);
  }
}

// 媒体源分页状态
let sourcesCurrentPage = 1;
let sourcesTotalPages = 1;
let sourcesPageSize = 50;

// 加载媒体源状态（分页版）
async function loadSources(page) {
  if (page) sourcesCurrentPage = page;
  const catFilter = document.getElementById('sources-cat-filter')?.value || '';
  const rssOnly = document.getElementById('sources-rss-only')?.checked ? '1' : '';

  try {
    const params = new URLSearchParams({
      page: sourcesCurrentPage,
      pageSize: sourcesPageSize,
    });
    if (catFilter) params.set('cat', catFilter);
    if (rssOnly) params.set('rssOnly', '1');

    const resp = await fetch(`/api/sources/status?${params}`);
    const data = await resp.json();

    sourcesTotalPages = data.totalPages || 1;

    // 总数徽章
    const badge = document.getElementById('sources-total-badge');
    if (badge) badge.textContent = `共 ${data.total_sources || data.total} 源`;

    // 分类下拉框（仅首次加载）
    const catSelect = document.getElementById('sources-cat-filter');
    if (catSelect && catSelect.options.length <= 1 && data.categories) {
      for (const [key, label] of Object.entries(data.categories)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        catSelect.appendChild(opt);
      }
    }

    // 汇总
    document.getElementById('sources-summary').innerHTML = `
      <div class="summary-card">
        <div class="summary-label">媒体源总数</div>
        <div class="summary-value">${data.total_sources || data.total}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">有RSS地址</div>
        <div class="summary-value">${data.with_rss}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">当前显示</div>
        <div class="summary-value">${data.sources.length}</div>
      </div>
    `;

    // 页面信息
    const pageInfo = document.getElementById('sources-page-info');
    if (pageInfo) {
      pageInfo.textContent = `第 ${sourcesCurrentPage}/${sourcesTotalPages} 页 (每页${sourcesPageSize}条)`;
    }

    // 表格
    const tbody = document.getElementById('sources-tbody');
    tbody.innerHTML = data.sources.map(s => {
      const st = s.status;
      let statusBadge;
      if (s.rss && s.rss.length > 0) {
        if (!st) {
          statusBadge = '<span class="status-badge status-no_rss">待采集</span>';
        } else if (st.consecutive_fails === 0) {
          statusBadge = '<span class="status-badge status-ok">正常</span>';
        } else {
          statusBadge = `<span class="status-badge status-error">失败(${st.consecutive_fails})</span>`;
        }
      } else {
        statusBadge = '<span class="status-badge status-no_rss">无RSS</span>';
      }
      const totalHits = st ? st.total_hits : 0;
      const catLabel = s.cat_name || s.cat || '--';
      return `
        <tr>
          <td>${s.id}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(catLabel)}</td>
          <td>${s.lang || '--'}</td>
          <td>${s.rss ? '<span style="color:#155724">RSS</span>' : '—'}</td>
          <td>${totalHits}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');

    // 分页按钮
    renderSourcesPagination();

  } catch (e) {
    console.error('加载媒体源失败:', e);
  }
}

function renderSourcesPagination() {
  const container = document.getElementById('sources-pagination');
  if (!container) return;

  const cur = sourcesCurrentPage;
  const total = sourcesTotalPages;
  let html = '';

  // 上一页
  html += `<button class="page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="loadSources(${cur - 1})">上一页</button>`;

  // 页码按钮（最多显示7个）
  let startPage = Math.max(1, cur - 3);
  let endPage = Math.min(total, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  if (startPage > 1) {
    html += `<button class="page-btn" onclick="loadSources(1)">1</button>`;
    if (startPage > 2) html += '<span class="page-info">...</span>';
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="loadSources(${i})">${i}</button>`;
  }

  if (endPage < total) {
    if (endPage < total - 1) html += '<span class="page-info">...</span>';
    html += `<button class="page-btn" onclick="loadSources(${total})">${total}</button>`;
  }

  // 下一页
  html += `<button class="page-btn" ${cur >= total ? 'disabled' : ''} onclick="loadSources(${cur + 1})">下一页</button>`;

  container.innerHTML = html;
}

// 搜索
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const container = document.getElementById('search-results');
  container.innerHTML = '<div class="loading">搜索中...</div>';

  try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await resp.json();

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="loading">未找到匹配的新闻</div>';
      return;
    }

    container.innerHTML = data.items.map(item =>
      renderNewsItem(item, item.tier || 'C')
    ).join('');
  } catch (e) {
    container.innerHTML = '<div class="loading">搜索失败</div>';
  }
}

document.getElementById('search-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doSearch();
});

// 手动触发采集
async function runFetch() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.querySelector('span').textContent = '采集中...';

  try {
    await fetch('/api/fetch/run', { method: 'POST' });
    // 等5秒后刷新数据
    setTimeout(() => {
      loadLatestReport();
      btn.disabled = false;
      btn.querySelector('span').textContent = '刷新';
    }, 5000);
  } catch (e) {
    btn.disabled = false;
    btn.querySelector('span').textContent = '刷新';
  }
}

document.getElementById('btn-refresh').addEventListener('click', runFetch);

// 初始加载
loadLatestReport();
