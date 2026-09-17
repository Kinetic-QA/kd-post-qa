// Static counterpart to gui/public/app.js's Dashboard tab — same rendering
// logic (trend chart, donut, days list, drilldown), reading from a baked
// data.json (see dashboard/build-data.cjs) instead of a live '/dashboard'
// endpoint, since this page is deployed as a plain static site with no
// server behind it. Also adds a Brands overview table, since the point of
// this project is "results across every brand", not one brand's console.

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

// Ticks an element's text from whatever it currently shows up/down to a new
// number instead of just replacing it — the "real widget" feel that was
// missing came mostly from numbers silently jumping between static states
// with nothing in between. Skips the animation loop entirely when the value
// hasn't changed (e.g. most 30s auto-refreshes), so it's not doing constant
// pointless work.
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function animateNumber(el, to, { duration = 700, decimals = 0, suffix = '' } = {}) {
  const from = Number(el.dataset.value || el.textContent.replace(/[^\d.-]/g, '')) || 0;
  if (from === to) {
    el.textContent = `${to}${suffix}`;
    el.dataset.value = to;
    return;
  }
  el.dataset.value = to;
  el.classList.remove('stat-pulse');
  void el.offsetWidth; // restart the CSS animation if it's already mid-pulse from a fast refresh
  el.classList.add('stat-pulse');
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const value = from + (to - from) * easeOutCubic(progress);
    el.textContent = `${value.toFixed(decimals)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// SVG geometry/transform attributes set inline are only CSS-transitionable
// once the browser has actually painted the "before" state — flipping to
// the "after" state in the very same tick collapses the transition, so every
// entrance animation below renders in a hidden/collapsed state first, then
// waits two frames (one isn't reliably enough post-paint in every browser)
// before applying the revealed state that the CSS transition animates into.
function nextPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function shortDate(dateStr) {
  return dateStr.slice(5);
}

const TREND_TITLES = {
  all: 'Pass / Fail / Flaky Trend',
  passed: 'Passed Trend',
  failed: 'Failed Trend',
  flaky: 'Flaky Trend',
};

function updateLegendHighlight(filter) {
  for (const item of document.querySelectorAll('.legend-item')) {
    const isDimmed = filter && filter !== 'all' && item.dataset.series !== filter;
    item.classList.toggle('legend-dim', isDimmed);
  }
}

function renderTrendChart(days, filter) {
  const container = document.getElementById('trend-chart');
  const rows = [...days].slice(0, 14);

  document.getElementById('trend-title').textContent = TREND_TITLES[filter || 'all'];
  updateLegendHighlight(filter);

  if (rows.length === 0) {
    container.innerHTML = '<p class="runs-empty" style="display:block;">Nothing to chart yet.</p>';
    return;
  }

  const activeSeries = filter && filter !== 'all' ? [filter] : ['passed', 'failed', 'flaky'];

  const rowH = 28;
  const barH = 16;
  const leftMargin = 54;
  const rightMargin = 34;
  const W = 380;
  const H = rows.length * rowH + 6;
  const plotW = W - leftMargin - rightMargin;

  const maxTotal = Math.max(1, ...rows.map(d => activeSeries.reduce((sum, k) => sum + d[k], 0)));
  const scale = plotW / maxTotal;
  const GAP = 1;

  let bars = '';
  let axis = '';

  rows.forEach((day, i) => {
    const rowTop = i * rowH + 6;
    const y = rowTop + (rowH - barH) / 2;
    const segments = activeSeries
      .map(key => ({ key, value: day[key], cls: `seg-${key}` }))
      .filter(s => s.value > 0);

    let x = leftMargin;
    let rowShapes = '';
    segments.forEach((seg, idx) => {
      const isLast = idx === segments.length - 1;
      const w = Math.max(2, seg.value * scale) - (isLast ? 0 : GAP);
      if (isLast) {
        const r = Math.min(4, barH / 2, w);
        rowShapes += `<path class="${seg.cls}" d="M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + barH - r} Q${x + w},${y + barH} ${x + w - r},${y + barH} L${x},${y + barH} Z" />`;
      } else {
        rowShapes += `<rect class="${seg.cls}" x="${x}" y="${y}" width="${w}" height="${barH}" />`;
      }
      x += w + GAP;
    });

    const total = activeSeries.reduce((sum, k) => sum + day[k], 0);
    rowShapes += `<text class="bar-total" x="${x + 4}" y="${y + barH / 2 + 3}" text-anchor="start">${total || ''}</text>`;

    // Grows in from the left edge, one row after another — scaleX(0) here,
    // flipped to scaleX(1) post-paint below (see nextPaint), with each row's
    // transition-delay staggered so the chart visibly builds instead of
    // appearing all at once.
    bars += `<g class="bar-row" style="transform-origin:${leftMargin}px 0;transition-delay:${i * 45}ms;">${rowShapes}</g>`;

    bars += `<rect class="bar-hit" data-date="${escapeHtml(day.date)}" data-passed="${day.passed}" data-failed="${day.failed}" data-flaky="${day.flaky}" x="0" y="${rowTop}" width="${W}" height="${rowH}" />`;

    axis += `<text class="bar-axis-label" x="${leftMargin - 8}" y="${y + barH / 2 + 3}" text-anchor="end">${escapeHtml(shortDate(day.date))}</text>`;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;" class="trend-svg" role="img" aria-label="Passed, failed, and flaky test counts by date">
      <line class="baseline" x1="${leftMargin}" y1="0" x2="${leftMargin}" y2="${H}" />
      ${bars}
      ${axis}
    </svg>
    <div id="chart-tooltip" class="chart-tooltip" hidden></div>
  `;

  nextPaint(() => {
    for (const row of container.querySelectorAll('.bar-row')) row.classList.add('bar-row-in');
  });

  const tooltip = document.getElementById('chart-tooltip');
  for (const hit of container.querySelectorAll('.bar-hit')) {
    hit.addEventListener('pointermove', event => {
      tooltip.hidden = false;
      tooltip.innerHTML = `
        <strong>${escapeHtml(hit.dataset.date)}</strong>
        <span class="tt-row"><span class="legend-swatch swatch-passed"></span>Passed <b>${hit.dataset.passed}</b></span>
        <span class="tt-row"><span class="legend-swatch swatch-failed"></span>Failed <b>${hit.dataset.failed}</b></span>
        <span class="tt-row"><span class="legend-swatch swatch-flaky"></span>Flaky <b>${hit.dataset.flaky}</b></span>
      `;
      const wrapRect = container.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - wrapRect.left + 12}px`;
      tooltip.style.top = `${event.clientY - wrapRect.top - 12}px`;
    });
    hit.addEventListener('pointerleave', () => {
      tooltip.hidden = true;
    });
  }
}

// Deliberately takes the SAME "each brand's latest run" stats object the top
// stat tiles use — NOT a fresh sum over Run History's days. Summing days
// double-counts a brand that's run more than once in the history window
// (e.g. LMS on both 09-03 and 09-17) and produced a total that didn't match
// the tiles above it (498 vs. 342), which is exactly the confusion this
// donut needs to not repeat.
function renderStatusDonut(stats, filter) {
  const container = document.getElementById('status-donut');
  const totals = { passed: stats.totalPassed, failed: stats.totalFailed, flaky: stats.totalFlaky };
  const grand = totals.passed + totals.failed + totals.flaky;

  if (grand === 0) {
    container.innerHTML = '<p class="runs-empty" style="display:block;">No data yet.</p>';
    return;
  }

  const size = 180;
  const strokeW = 26;
  const r = (size - strokeW) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gapLen = 3;

  const series = [
    { key: 'passed', value: totals.passed, cls: 'seg-passed' },
    { key: 'failed', value: totals.failed, cls: 'seg-failed' },
    { key: 'flaky', value: totals.flaky, cls: 'seg-flaky' },
  ].filter(s => s.value > 0);

  let offsetAccum = 0;
  let segments = '';
  let idx = 0;
  for (const s of series) {
    const frac = s.value / grand;
    const length = frac * circumference;
    const dash = Math.max(0, length - gapLen);
    const rotation = (offsetAccum / circumference) * 360 - 90;
    const isDimmed = filter && filter !== 'all' && s.key !== filter;
    const pct = Math.round(frac * 1000) / 10;
    // dasharray's gap is the full circumference (not circumference - dash) so
    // it's always long enough to fully hide the dash via dashoffset below,
    // regardless of how large this one segment is (even a 100% segment) —
    // the rendered arc is identical either way since the path is only ever
    // drawn once around.
    segments += `<circle class="donut-seg ${s.cls}${isDimmed ? ' donut-dim' : ''}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${strokeW}" stroke-dasharray="${dash} ${circumference}" stroke-dashoffset="${dash}" style="transition-delay:${idx * 130}ms;" transform="rotate(${rotation} ${cx} ${cy})"><title>${s.key}: ${s.value} (${pct}%)</title></circle>`;
    offsetAccum += length;
    idx += 1;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" class="donut-svg" role="img" aria-label="Overall passed, failed, and flaky split">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${strokeW}" />
      ${segments}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-total" data-value="0">0</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-total-label">tests</text>
    </svg>
  `;

  nextPaint(() => {
    for (const seg of container.querySelectorAll('.donut-seg')) seg.setAttribute('stroke-dashoffset', '0');
    animateNumber(container.querySelector('.donut-total'), grand);
  });
}

function renderRunsTable(entries) {
  const rowsHtml = entries.map(entry => {
    const link = entry.reportUrl
      ? `<a class="view-link" href="${escapeHtml(entry.reportUrl)}" target="_blank">View report</a>`
      : '<span class="none">No report</span>';
    const specsLabel = entry.specs.length > 0 ? escapeHtml(entry.specs.join(', ')) : '—';
    return `
      <tr>
        <td><span class="pill-tag">${escapeHtml(entry.brand)}</span></td>
        <td><span class="pill-tag">${escapeHtml(entry.geo)}</span></td>
        <td class="specs-cell">${specsLabel}</td>
        <td class="count-passed">${entry.passed}</td>
        <td class="count-failed">${entry.failed}</td>
        <td class="count-flaky">${entry.flaky}</td>
        <td>${link}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="runs-table">
      <thead>
        <tr>
          <th>Brand</th>
          <th>GEO</th>
          <th>Tested</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Flaky</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

// Same day, different timestamp = a separate test session (e.g. SC UK run
// 3 times in one day) — grouped so the day-card can break them out instead
// of silently summing 3 runs' worth of brand/GEO rows into one flat list.
function groupEntriesByRun(entries) {
  const byRun = new Map();
  for (const entry of entries) {
    const key = entry.runTime || 'unknown';
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key).push(entry);
  }
  // Newest run first, matching the day-card's own newest-first ordering.
  return [...byRun.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function formatRunTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 'Unknown time';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderDaysList(days) {
  const listEl = document.getElementById('days-list');
  const emptyEl = document.getElementById('runs-empty');
  listEl.innerHTML = '';

  if (days.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  days.forEach((day, i) => {
    const details = document.createElement('details');
    details.className = 'day-card';
    if (i === 0) details.open = true;

    const runGroups = groupEntriesByRun(day.entries);
    const runBadge = runGroups.length > 1 ? `<span class="run-count-badge">${runGroups.length} runs</span>` : '';

    // A normal day (one test session) stays a flat table exactly as
    // before — the nested per-run breakout only appears once there's
    // actually more than one run to distinguish, so the common case isn't
    // cluttered with an extra collapsed layer.
    const bodyHtml = runGroups.length <= 1
      ? renderRunsTable(day.entries)
      : runGroups.map(([runTime, entries], idx) => {
          const passed = entries.reduce((sum, e) => sum + e.passed, 0);
          const failed = entries.reduce((sum, e) => sum + e.failed, 0);
          const flaky = entries.reduce((sum, e) => sum + e.flaky, 0);
          return `
            <details class="run-subcard"${idx === 0 ? ' open' : ''}>
              <summary class="run-subcard-summary">
                <span class="day-chevron">&#9656;</span>
                <span class="run-time-label">${escapeHtml(formatRunTime(runTime))}</span>
                <span class="day-stats">
                  <span class="count-passed">${passed} passed</span>
                  <span class="count-failed">${failed} failed</span>
                  <span class="count-flaky">${flaky} flaky</span>
                </span>
              </summary>
              <div class="day-body">${renderRunsTable(entries)}</div>
            </details>
          `;
        }).join('');

    details.innerHTML = `
      <summary class="day-summary">
        <span class="day-chevron">&#9656;</span>
        <span class="day-date">${escapeHtml(day.date)}</span>
        ${runBadge}
        <span class="day-stats">
          <span class="count-passed">${day.passed} passed</span>
          <span class="count-failed">${day.failed} failed</span>
          <span class="count-flaky">${day.flaky} flaky</span>
        </span>
      </summary>
      <div class="day-body">${bodyHtml}</div>
    `;
    listEl.appendChild(details);
  });
}

function renderBrandsTable(brands) {
  const tbody = document.getElementById('brands-tbody');
  const emptyEl = document.getElementById('brands-empty');
  tbody.innerHTML = '';

  if (!brands || brands.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  for (const b of brands) {
    const row = document.createElement('tr');
    const geoPills = b.geos.map(g => `<span class="pill-tag">${escapeHtml(g)}</span>`).join('');
    const statusPill = STATUS_META[b.status] || STATUS_META.healthy;
    const statusTitle = b.knownIssueNote ? ` title="${escapeHtml(b.knownIssueNote)}"` : '';
    row.innerHTML = `
      <td class="brand-cell">${escapeHtml(b.brand)}</td>
      <td><span class="brand-status brand-status-${b.status}"${statusTitle}>${statusPill.icon} ${statusPill.label}</span></td>
      <td><span class="geo-pill-list">${geoPills}</span></td>
      <td>${b.passRatePct}%</td>
      <td class="count-passed">${b.passed}</td>
      <td class="count-failed">${b.failed}</td>
      <td class="count-flaky">${b.flaky}</td>
      <td>${escapeHtml(b.lastRunDate || '—')}</td>
    `;
    tbody.appendChild(row);
  }
}

// Plain-language brand status, and the same page-level health summary above
// the stat tiles — both built from the same three states so a management
// reader sees one consistent story instead of having to compare Passed/
// Failed/Flaky columns themselves to decide if something's wrong.
const STATUS_META = {
  healthy: { icon: '&#9989;', label: 'Healthy' },
  watch: { icon: '&#128064;', label: 'Worth a look' },
  'known-issue': { icon: '&#128295;', label: 'Known issue (script)' },
  issue: { icon: '&#10060;', label: 'Needs attention' },
};

// Dismiss is deliberately only ever offered for the calm states — a real
// "issue" banner must never be dismissable, or someone could hide a live
// product bug and a later visitor would see a false all-clear. The
// dismissal is keyed to the banner's own status+text rather than a blanket
// "seen it" flag, so it re-appears the moment the underlying story actually
// changes (a different brand, a new date, a different note) instead of
// silently swallowing whatever comes next.
function readDismissedBannerKey() {
  try { return localStorage.getItem('dashboardDismissedBanner'); } catch { return null; }
}
function writeDismissedBannerKey(key) {
  try { localStorage.setItem('dashboardDismissedBanner', key); } catch { /* private mode etc — dismiss just won't persist */ }
}

function renderHealthBanner(stats, brands) {
  const banner = document.getElementById('health-banner');
  const iconEl = document.getElementById('health-icon');
  const textEl = document.getElementById('health-text');
  const dismissBtn = document.getElementById('health-dismiss');
  const heroCard = document.getElementById('stat-pass-rate-card');
  if (!banner) return;

  // A brand marked "known-issue" (see dashboard/known-issues.json — a
  // confirmed script bug, not a real product bug, and only for the exact
  // run date it was confirmed against) is deliberately kept OUT of the
  // alarming "issue" bucket so the banner doesn't read as a live product
  // problem — but it's still called out by name in a calm, informational
  // tone rather than silently disappearing, so nobody mistakes "not
  // alarming" for "nothing happened."
  const issues = (brands || []).filter(b => b.status === 'issue');
  const knownIssues = (brands || []).filter(b => b.status === 'known-issue');
  const watches = (brands || []).filter(b => b.status === 'watch');

  banner.classList.remove('health-good', 'health-watch', 'health-issue', 'health-info');
  if (heroCard) heroCard.classList.remove('hero-good', 'hero-watch', 'hero-issue', 'hero-info');

  let statusKey, icon, text, dismissible;

  if (!brands || brands.length === 0) {
    statusKey = 'empty';
    banner.classList.add('health-watch');
    if (heroCard) heroCard.classList.add('hero-watch');
    icon = '&#8987;';
    text = 'No results yet.';
    dismissible = true;
  } else if (issues.length > 0) {
    statusKey = 'issue';
    banner.classList.add('health-issue');
    if (heroCard) heroCard.classList.add('hero-issue');
    icon = '&#10060;';
    const names = issues.map(b => b.brand).join(', ');
    text = issues.length === 1
      ? `${names} has failing tests — see the Brands table below for details.`
      : `${issues.length} brands have failing tests: ${names} — see the Brands table below for details.`;
    dismissible = false;
  } else if (knownIssues.length > 0) {
    statusKey = 'known-issue';
    banner.classList.add('health-info');
    if (heroCard) heroCard.classList.add('hero-info');
    icon = '&#128295;';
    const names = knownIssues.map(b => b.brand).join(', ');
    text = `No product issues — ${names} has a known test-script issue already being fixed (not a real bug).`;
    dismissible = true;
  } else if (watches.length > 0) {
    statusKey = 'watch';
    banner.classList.add('health-watch');
    if (heroCard) heroCard.classList.add('hero-watch');
    icon = '&#128064;';
    const names = watches.map(b => b.brand).join(', ');
    text = `All tests passed. ${names} had some inconsistent (flaky) results worth a look.`;
    dismissible = true;
  } else {
    statusKey = 'good';
    banner.classList.add('health-good');
    if (heroCard) heroCard.classList.add('hero-good');
    icon = '&#9989;';
    text = `All clear — every test passed across ${brands.length} brand${brands.length === 1 ? '' : 's'}.`;
    dismissible = true;
  }

  iconEl.innerHTML = icon;
  textEl.textContent = text;

  const dismissKey = `${statusKey}::${text}`;
  const alreadyDismissed = dismissible && readDismissedBannerKey() === dismissKey;
  banner.hidden = alreadyDismissed;
  if (dismissBtn) {
    dismissBtn.hidden = !dismissible;
    dismissBtn.onclick = () => {
      writeDismissedBannerKey(dismissKey);
      banner.hidden = true;
    };
  }
}

const FILTER_META = {
  all: { title: 'All Tests', icon: '&#128203;' },
  passed: { title: 'Passed Tests', icon: '&#9989;' },
  failed: { title: 'Failed Tests', icon: '&#10060;' },
  flaky: { title: 'Flaky Tests', icon: '&#128260;' },
};

let allTests = [];
let lastDays = [];
let lastStats = { totalRuns: 0, totalPassed: 0, totalFailed: 0, totalFlaky: 0, totalTests: 0, passRatePct: null, lastRunDate: null };
let activeFilter = null;

function renderDrilldown(filter) {
  const card = document.getElementById('drilldown-card');
  const tbody = document.getElementById('drilldown-tbody');
  const emptyEl = document.getElementById('drilldown-empty');
  const meta = FILTER_META[filter];

  document.getElementById('drilldown-title').textContent = meta.title;
  document.getElementById('drilldown-icon').innerHTML = meta.icon;

  const matches = (filter === 'all' ? allTests : allTests.filter(t => t.status === filter))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  tbody.innerHTML = '';
  emptyEl.style.display = matches.length === 0 ? 'block' : 'none';

  for (const t of matches) {
    const link = t.reportUrl
      ? `<a class="view-link" href="${escapeHtml(t.reportUrl)}" target="_blank">View report</a>`
      : '<span class="none">No report</span>';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(t.date)}</td>
      <td><span class="pill-tag">${escapeHtml(t.brand)}</span></td>
      <td><span class="pill-tag">${escapeHtml(t.geo)}</span></td>
      <td>${escapeHtml(t.testName || t.spec)}</td>
      <td><span class="status-tag status-${t.status}">${t.status}</span></td>
      <td>${link}</td>
    `;
    tbody.appendChild(row);
  }

  card.hidden = false;
}

function closeDrilldown() {
  activeFilter = null;
  document.getElementById('drilldown-card').hidden = true;
  for (const btn of document.querySelectorAll('.stat-clickable')) btn.classList.remove('active');
  renderTrendChart(lastDays, null);
  renderStatusDonut(lastStats, null);
}

for (const btn of document.querySelectorAll('.stat-clickable')) {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    if (activeFilter === filter) {
      closeDrilldown();
      return;
    }
    activeFilter = filter;
    for (const b of document.querySelectorAll('.stat-clickable')) b.classList.toggle('active', b === btn);
    renderDrilldown(filter);
    renderTrendChart(lastDays, filter);
    renderStatusDonut(lastStats, filter);
  });
}

document.getElementById('drilldown-close').addEventListener('click', closeDrilldown);

function loadDashboard() {
  fetch('data.json', { cache: 'no-store' })
    .then(res => res.json())
    .then(({ stats, days, tests, brands, generatedAt, targetDate }) => {
      animateNumber(document.getElementById('stat-pass-rate'), stats.passRatePct ?? 0, { decimals: 1, suffix: '%' });
      animateNumber(document.getElementById('stat-total-tests'), stats.totalTests);
      animateNumber(document.getElementById('stat-passed'), stats.totalPassed);
      animateNumber(document.getElementById('stat-failed'), stats.totalFailed);
      animateNumber(document.getElementById('stat-flaky'), stats.totalFlaky);
      lastStats = stats;
      renderHealthBanner(stats, brands);

      const noteEl = document.getElementById('last-run-note');
      noteEl.textContent = 'Last 30 days';

      const brandsNoteEl = document.getElementById('brands-note');
      if (brandsNoteEl) brandsNoteEl.textContent = "Each brand's most recent run";

      const generatedEl = document.getElementById('generated-note');
      if (generatedEl && stats.lastRunDate) {
        generatedEl.textContent = `Last updated: ${stats.lastRunDate}`;
      }

      allTests = tests;
      lastDays = days;
      if (activeFilter) renderDrilldown(activeFilter);

      renderTrendChart(days, activeFilter);
      renderStatusDonut(stats, activeFilter);
      renderDaysList(days);
      renderBrandsTable(brands);
    });
}

loadDashboard();
