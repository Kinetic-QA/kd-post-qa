const brandSelect = document.getElementById('brand-select');
const deviceSelect = document.getElementById('device-select');
const specSelect = document.getElementById('spec-select');
const geoChecksEl = document.getElementById('geo-checks');
const runBtn = document.getElementById('run-btn');
const stopBtn = document.getElementById('stop-btn');
const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const progressCardEl = document.getElementById('progress-card');
const runStepsEl = document.getElementById('run-steps');
const vpnPauseEl = document.getElementById('vpn-pause');
const vpnPauseGeoEl = document.getElementById('vpn-pause-geo');
const continueBtn = document.getElementById('continue-btn');
const resultsCardEl = document.getElementById('results-card');
const statusDetailEl = document.getElementById('status-detail');
const reportLinkEl = document.getElementById('report-link');
const excelLinkEl = document.getElementById('excel-link');

let geosByBrand = {};

// ── Desktop alerts (real run finished, or combined run paused for a VPN
// switch) ─────────────────────────────────────────────────────────────
// Notification requires a user gesture to request permission (a page
// auto-requesting on load gets silently ignored/blocked by most browsers),
// so this stays button-driven. localhost counts as a secure context, so
// no HTTPS is needed for it to work here.
const notifyToggleBtn = document.getElementById('notify-toggle');
const notifyStatusEl = document.getElementById('notify-status');

function updateNotifyUI() {
  if (!('Notification' in window)) {
    notifyStatusEl.textContent = 'Not supported in this browser';
    notifyToggleBtn.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') {
    notifyToggleBtn.classList.add('notify-on');
    notifyToggleBtn.textContent = '\u{1F514} Alerts On';
    notifyStatusEl.textContent = '';
  } else if (Notification.permission === 'denied') {
    notifyToggleBtn.classList.remove('notify-on');
    notifyToggleBtn.textContent = '\u{1F514} Desktop Alerts';
    notifyStatusEl.textContent = 'Blocked — allow notifications for this site in your browser settings';
  } else {
    notifyToggleBtn.classList.remove('notify-on');
    notifyToggleBtn.textContent = '\u{1F514} Desktop Alerts';
    notifyStatusEl.textContent = '';
  }
}

if ('Notification' in window) {
  notifyToggleBtn.addEventListener('click', () => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(updateNotifyUI);
    }
  });
}
updateNotifyUI();

// A short beep plays regardless of notification permission/tab focus, as a
// backup that's audible even before the user has granted the OS-level
// permission — built with the Web Audio API so no sound asset is needed.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Some browsers block AudioContext until a user gesture happens
    // somewhere on the page first — fail silently rather than throw into
    // an SSE onmessage handler.
  }
}

function notify(title, body) {
  beep();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* ignore */ }
  }
}

// A plain page reload otherwise always re-renders index.html from scratch,
// which defaults to the Dashboard tab (the only one marked "active" in the
// HTML) — losing whatever tab the user was actually on. Persisting the
// choice in sessionStorage (not localStorage) fixes that on refresh while
// still landing back on Dashboard for a genuinely fresh visit — sessionStorage
// survives an F5 reload of the same tab but is cleared once that tab/browser
// session ends, which is exactly the "refresh stays put, fresh open goes
// home" behavior wanted here. The URL hash is kept in sync too so a
// bookmarked/shared link lands on the right tab as well.
const TAB_STORAGE_KEY = 'qaTestCenter.activeTab';

function activateTab(name) {
  const tabBtn = document.querySelector(`.tab[data-tab="${name}"]`);
  const panel = document.getElementById(`tab-${name}`);
  if (!tabBtn || !panel) return false;
  for (const btn of document.querySelectorAll('.tab')) btn.classList.remove('active');
  for (const p of document.querySelectorAll('.tab-panel')) p.classList.remove('active');
  tabBtn.classList.add('active');
  panel.classList.add('active');
  return true;
}

for (const tabBtn of document.querySelectorAll('.tab')) {
  tabBtn.addEventListener('click', () => {
    const name = tabBtn.dataset.tab;
    activateTab(name);
    try { sessionStorage.setItem(TAB_STORAGE_KEY, name); } catch { /* ignore */ }
    history.replaceState(null, '', `#${name}`);
  });
}

(function restoreActiveTab() {
  const fromHash = location.hash.replace('#', '');
  let saved = null;
  try { saved = sessionStorage.getItem(TAB_STORAGE_KEY); } catch { /* ignore */ }
  activateTab(fromHash) || activateTab(saved) || activateTab('dashboard');
})();

function setStatus(el, text, variant) {
  el.textContent = text;
  el.className = 'status-pill' + (variant ? ` ${variant}` : '');
}

function populateGeoChecks(brand) {
  geoChecksEl.innerHTML = '';
  for (const geo of geosByBrand[brand] ?? []) {
    const label = document.createElement('label');
    label.className = 'geo-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = geo;
    label.appendChild(input);
    label.append(geo);
    input.addEventListener('change', () => label.classList.toggle('checked', input.checked));
    geoChecksEl.appendChild(label);
  }
}

function selectedGeos() {
  return [...geoChecksEl.querySelectorAll('input:checked')].map(i => i.value);
}

fetch('/meta')
  .then(res => res.json())
  .then(meta => {
    geosByBrand = meta.geosByBrand;

    for (const brand of Object.keys(geosByBrand).sort()) {
      const option = document.createElement('option');
      option.value = brand;
      option.textContent = brand;
      brandSelect.appendChild(option);
    }
    populateGeoChecks(brandSelect.value);

    for (const spec of meta.specs) {
      const option = document.createElement('option');
      option.value = spec.value;
      option.textContent = spec.label;
      specSelect.appendChild(option);
    }
  });

brandSelect.addEventListener('change', () => populateGeoChecks(brandSelect.value));

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

// Short date label for the chart's x-axis: "2026-08-20" -> "08-20".
function shortDate(dateStr) {
  return dateStr.slice(5);
}

// Ticks an element's text from whatever it currently shows up/down to a new
// number instead of just replacing it — makes a 30s auto-refresh read as a
// live widget rather than numbers silently jumping between static states.
// Skips the animation loop entirely when the value hasn't changed.
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
// waits two frames before applying the revealed state that the CSS
// transition animates into.
function nextPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

const TREND_TITLES = {
  all: 'Pass / Fail / Flaky Trend',
  passed: 'Passed Trend',
  failed: 'Failed Trend',
  flaky: 'Flaky Trend',
};

// Dims the legend swatches that aren't the active filter — the chart's own
// visual echo of which stat tile is selected, alongside the title change.
function updateLegendHighlight(filter) {
  for (const item of document.querySelectorAll('.legend-item')) {
    const isDimmed = filter && filter !== 'all' && item.dataset.series !== filter;
    item.classList.toggle('legend-dim', isDimmed);
  }
}

// One horizontal row per date (most recent on top, matching the "Test Runs
// by Date" list below it) — Passed then Failed then Flaky stacked
// left-to-right by default; a stat tile filter collapses this to a single
// series's bar per row instead. Rounded right end on the last segment
// (bars grow rightward from the date-label baseline), a 1px surface gap
// between segments, and a shared tooltip driven by an invisible full-row
// hit rect.
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

// Donut showing the overall Passed/Failed/Flaky split — part-to-whole is
// what a donut is for, so unlike the bars it always shows all three slices;
// an active stat filter dims the other two rather than removing them, so
// the proportion stays visible for context.
//
// Deliberately takes the SAME all-time stats object the top stat tiles use
// — NOT a fresh sum over the trend chart's last-14-days window. Summing
// just those rows produced a total that didn't match the tiles above it
// whenever history ran past 14 days, exactly the confusion this donut needs
// to not repeat.
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
    // regardless of how large this one segment is.
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

// Plain-language brand status — same three states the health banner above
// uses, so a reader sees one consistent story instead of having to compare
// Passed/Failed/Flaky columns themselves to decide if something's wrong.
const BRAND_STATUS_META = {
  healthy: { icon: '&#9989;', label: 'Healthy' },
  watch: { icon: '&#128064;', label: 'Worth a look' },
  'known-issue': { icon: '&#128295;', label: 'Known issue (script)' },
  issue: { icon: '&#10060;', label: 'Needs attention' },
};

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
    const statusMeta = BRAND_STATUS_META[b.status] || BRAND_STATUS_META.healthy;
    const statusTitle = b.knownIssueNote ? ` title="${escapeHtml(b.knownIssueNote)}"` : '';
    row.innerHTML = `
      <td class="brand-cell">${escapeHtml(b.brand)}</td>
      <td><span class="brand-status brand-status-${b.status}"${statusTitle}>${statusMeta.icon} ${statusMeta.label}</span></td>
      <td><span class="geo-pill-list">${geoPills}</span></td>
      <td>${b.passRatePct}%</td>
      <td class="count-passed">${b.passed}</td>
      <td class="count-failed">${b.failed}</td>
      <td class="count-flaky">${b.flaky}</td>
      <td>${escapeHtml(b.lastRunDate)}</td>
    `;
    tbody.appendChild(row);
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
let lastDashboardPayload = null;

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

// Plain-language summary built from each brand's OWN most recent run (the
// same "brands" data the table below renders) — deliberately NOT all-time
// totals, so a failure that was already fixed on a later retest doesn't
// keep alarming a reader forever. Dismiss is only ever offered for the calm
// states; a real "issue" banner must never be dismissable, or someone could
// hide a live product bug and a later visitor would see a false all-clear.
// The dismissal is keyed to the banner's own status+text so it re-appears
// the moment the underlying story actually changes instead of silently
// swallowing whatever comes next.
function readDismissedBannerKey() {
  try { return localStorage.getItem('dashboardDismissedBanner'); } catch { return null; }
}
function writeDismissedBannerKey(key) {
  try { localStorage.setItem('dashboardDismissedBanner', key); } catch { /* private mode etc — dismiss just won't persist */ }
}

function renderHealthBanner(brands) {
  const banner = document.getElementById('health-banner');
  const iconEl = document.getElementById('health-icon');
  const textEl = document.getElementById('health-text');
  const dismissBtn = document.getElementById('health-dismiss');
  const heroCard = document.getElementById('stat-pass-rate-card');
  if (!banner) return;

  banner.classList.remove('health-good', 'health-watch', 'health-issue', 'health-info');
  if (heroCard) heroCard.classList.remove('hero-good', 'hero-watch', 'hero-issue', 'hero-info');

  // A brand marked "known-issue" (see dashboard/known-issues.json — a
  // confirmed script bug, not a real product bug, and only for the exact
  // run date it was confirmed against) is deliberately kept OUT of the
  // alarming "issue" bucket — but it's still called out by name in a calm,
  // informational tone rather than silently disappearing, so nobody
  // mistakes "not alarming" for "nothing happened."
  const issues = (brands || []).filter(b => b.status === 'issue');
  const knownIssues = (brands || []).filter(b => b.status === 'known-issue');
  const watches = (brands || []).filter(b => b.status === 'watch');

  let statusKey, icon, text, dismissible;

  if (!brands || brands.length === 0) {
    statusKey = 'empty';
    banner.classList.add('health-watch');
    if (heroCard) heroCard.classList.add('hero-watch');
    icon = '&#8987;';
    text = 'No test runs yet — run a test to see results here.';
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

function loadDashboard() {
  fetch('/dashboard')
    .then(res => res.json())
    .then(payload => {
      // The 30s auto-refresh (below) re-fetches even when nothing on disk
      // has changed — most ticks during a long idle stretch. Re-rendering
      // unchanged data was pulsing every stat number and redrawing both
      // charts every 30s for no reason, which read as the whole dashboard
      // "refreshing" on its own. Skipping the render entirely when the
      // payload is byte-for-byte the same as last time keeps the live
      // auto-refresh (a real change during a long combined run still shows
      // up within 30s) without the constant visual churn.
      const raw = JSON.stringify(payload);
      if (raw === lastDashboardPayload) return;
      lastDashboardPayload = raw;

      const { stats, days, tests, brands } = payload;
      animateNumber(document.getElementById('stat-pass-rate'), stats.passRatePct ?? 0, { decimals: 1, suffix: '%' });
      animateNumber(document.getElementById('stat-total-runs'), stats.totalRuns);
      animateNumber(document.getElementById('stat-total-tests'), stats.totalTests);
      animateNumber(document.getElementById('stat-passed'), stats.totalPassed);
      animateNumber(document.getElementById('stat-failed'), stats.totalFailed);
      animateNumber(document.getElementById('stat-flaky'), stats.totalFlaky);
      lastStats = stats;
      renderHealthBanner(brands);

      const noteEl = document.getElementById('last-run-note');
      noteEl.textContent = stats.lastRunDate ? `Last run: ${stats.lastRunDate}` : '';

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

// Keeps the Dashboard current while a run (single or combined) is going —
// especially a long multi-GEO combined run, which can take many minutes
// and writes to combined-reports/*.xlsx well after this page's initial
// load. 30s is frequent enough to feel "live" without re-scanning every
// report file on every tick.
setInterval(loadDashboard, 30_000);

// Also refresh the instant the user switches back to the Dashboard tab,
// rather than waiting for the next 30s tick.
document.querySelector('.tab[data-tab="dashboard"]')?.addEventListener('click', loadDashboard);

// ── Run (single GEO or several, back-to-back) ──────────────────────────
// One flow either way: checking exactly one GEO behaves like the old plain
// single-run (starts immediately, no pause); checking several queues them
// with a VPN-switch pause in between and a combined report/workbook at the
// end (see gui/server.ts's '/run' handler).

let runSessionId = null;
let runSteps = [];

function renderRunSteps() {
  const ICONS = { pending: '&#9675;', awaiting: '&#9203;', running: '&#8987;', passed: '&#9989;', failed: '&#10060;' };
  runStepsEl.innerHTML = runSteps.map(s => `
    <span class="multi-step step-${s.status}">
      <span class="step-icon">${ICONS[s.status]}</span> ${escapeHtml(s.geo)}
    </span>
  `).join('');
}

function setRunStepStatus(geo, status) {
  const step = runSteps.find(s => s.geo === geo);
  if (step) step.status = status;
  renderRunSteps();
}

runBtn.addEventListener('click', () => {
  const brand = brandSelect.value;
  const geos = selectedGeos();
  if (geos.length === 0) {
    setStatus(statusEl, 'Pick at least one GEO', 'failed');
    return;
  }

  runSessionId = null;
  runSteps = geos.map(geo => ({ geo, status: 'pending' }));
  renderRunSteps();

  runBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus(statusEl, 'Running…', 'running');
  outputEl.textContent = '';
  progressCardEl.hidden = false;
  vpnPauseEl.hidden = true;
  continueBtn.disabled = true;
  resultsCardEl.classList.remove('visible');
  reportLinkEl.textContent = '';
  excelLinkEl.textContent = '';

  const params = new URLSearchParams({
    brand,
    geos: geos.join(','),
    device: deviceSelect.value,
    spec: specSelect.value,
  });

  let source = new EventSource(`/run?${params.toString()}`);
  // A dropped SSE stream (VPN switch resetting the network adapter, wifi
  // blip, laptop sleep/wake) used to be treated as the run failing outright.
  // The run itself keeps going server-side for a grace period (see
  // server.ts's DISCONNECT_GRACE_MS) — reconnect to it via /run/:id/resume
  // a few times before actually giving up.
  const MAX_RECONNECT_ATTEMPTS = 6;
  const RECONNECT_DELAY_MS = 2000;
  let reconnectAttempts = 0;

  function endRun(label, variant) {
    setStatus(statusEl, label, variant);
    setStatus(statusDetailEl, label, variant);
    resultsCardEl.classList.add('visible');
    runBtn.disabled = false;
    stopBtn.disabled = true;
    vpnPauseEl.hidden = true;
    continueBtn.disabled = true;
    source.close();
    loadDashboard();
  }

  function handleMessage(event) {
    // Any real message means the connection is healthy again — reset the
    // retry counter so a later, unrelated blip gets its own full grace
    // window instead of inheriting an already-exhausted count.
    reconnectAttempts = 0;
    const data = JSON.parse(event.data);

    if (data.type === 'session' || data.type === 'resumed') {
      runSessionId = data.sessionId;
      return;
    }

    if (data.type === 'awaiting-vpn') {
      setRunStepStatus(data.geo, 'awaiting');
      vpnPauseGeoEl.textContent = data.geo;
      vpnPauseEl.hidden = false;
      // Only enabled during an actual pause — greyed out the instant a GEO
      // is running (see 'geo-start' below) so there's nothing to misclick
      // while a test is mid-run.
      continueBtn.disabled = false;
      setStatus(statusEl, `Waiting for VPN switch to ${data.geo}…`, 'running');
      notify('Switch VPN now', `Switch your VPN to ${data.geo} (step ${data.step} of ${data.total}), then click Continue.`);
      return;
    }

    if (data.type === 'verifying-vpn') {
      // Fires right after Continue is clicked, before the next GEO actually
      // starts — the server briefly polls for the outbound IP to actually
      // change before launching, so a click that lands before the VPN
      // finishes switching doesn't send the test out on the old connection.
      // See server.ts's confirmVpnSwitched.
      setStatus(statusEl, `Confirming VPN switch to ${data.geo}…`, 'running');
      return;
    }

    if (data.type === 'geo-start') {
      vpnPauseEl.hidden = true;
      continueBtn.disabled = true;
      setRunStepStatus(data.geo, 'running');
      setStatus(statusEl, `Running ${data.geo}…`, 'running');
      return;
    }

    if (data.type === 'log') {
      outputEl.textContent += data.text;
      outputEl.scrollTop = outputEl.scrollHeight;
      return;
    }

    if (data.type === 'geo-done') {
      setRunStepStatus(data.geo, data.exitCode === 0 ? 'passed' : 'failed');
      return;
    }

    if (data.type === 'merging') {
      setStatus(statusEl, 'Merging report…', 'running');
      return;
    }

    if (data.type === 'stopped') {
      endRun('Stopped', 'failed');
      notify('Test run stopped', 'The run was stopped.');
      return;
    }

    if (data.type === 'all-done') {
      const allPassed = runSteps.every(s => s.status === 'passed');
      const label = allPassed ? 'Passed' : 'Completed with failures';
      endRun(label, allPassed ? 'passed' : 'failed');
      notify('Test run finished', `${runSteps.map(s => s.geo).join(', ')} — ${label}`);

      if (data.mergedReportUrl) {
        const a = document.createElement('a');
        a.href = data.mergedReportUrl;
        a.target = '_blank';
        a.textContent = 'View report';
        reportLinkEl.appendChild(a);
      } else {
        reportLinkEl.innerHTML = '<span class="none">No report found.</span>';
      }

      if (data.excelUrl) {
        const a = document.createElement('a');
        a.href = data.excelUrl;
        a.textContent = 'Download Excel report';
        excelLinkEl.appendChild(a);
      } else {
        excelLinkEl.innerHTML = '<span class="none">No Excel report found.</span>';
      }
    }
  }

  function attachSource(es) {
    es.onmessage = handleMessage;
    es.onerror = handleError;
  }

  function handleError() {
    source.close();

    // No session yet (dropped before the very first 'session' message) —
    // nothing to resume, so this is a real failure.
    if (!runSessionId) {
      endRun('Connection lost', 'failed');
      return;
    }

    reconnectAttempts += 1;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      endRun('Connection lost', 'failed');
      return;
    }

    setStatus(statusEl, `Reconnecting… (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'running');
    setTimeout(() => {
      source = new EventSource(`/run/${runSessionId}/resume`);
      attachSource(source);
    }, RECONNECT_DELAY_MS);
  }

  attachSource(source);
});

continueBtn.addEventListener('click', () => {
  if (!runSessionId) return;
  // Stays disabled on success — the upcoming 'geo-start' SSE message is
  // what re-enables the pause banner's flow for the GEO after next, not
  // this fetch resolving. Only re-enable here if the request itself
  // failed, so a genuine network hiccup doesn't strand the button off.
  continueBtn.disabled = true;
  fetch(`/run/${runSessionId}/continue`, { method: 'POST' })
    .then(res => { if (!res.ok) continueBtn.disabled = false; })
    .catch(() => { continueBtn.disabled = false; });
});

stopBtn.addEventListener('click', () => {
  stopBtn.disabled = true;
  if (!runSessionId) return;
  fetch(`/run/${runSessionId}/stop`, { method: 'POST' }).catch(() => {});
});

// ── Visual Check sub-tabs (Compare / Investigate) ────────────────────────
// Same sessionStorage-persistence idea as the top-level tabs (survives a
// refresh, resets on a fresh visit), scoped under its own key so switching
// the main tab away and back doesn't reset which sub-tab was active.
const SUBTAB_STORAGE_KEY = 'qaTestCenter.visualSubtab';

function activateSubtab(name) {
  const btn = document.querySelector(`.subtab[data-subtab="${name}"]`);
  const panel = document.getElementById(`subtab-${name}`);
  if (!btn || !panel) return false;
  for (const b of document.querySelectorAll('.subtab')) b.classList.remove('active');
  for (const p of document.querySelectorAll('.subtab-panel')) p.classList.remove('active');
  btn.classList.add('active');
  panel.classList.add('active');
  return true;
}

for (const btn of document.querySelectorAll('.subtab')) {
  btn.addEventListener('click', () => {
    const name = btn.dataset.subtab;
    activateSubtab(name);
    try { sessionStorage.setItem(SUBTAB_STORAGE_KEY, name); } catch { /* ignore */ }
  });
}

(function restoreActiveSubtab() {
  let saved = null;
  try { saved = sessionStorage.getItem(SUBTAB_STORAGE_KEY); } catch { /* ignore */ }
  if (saved) activateSubtab(saved);
})();

// ── Visual Check ────────────────────────────────────────────────────────
const visualModeSelect = document.getElementById('visual-mode-select');
const visualWidgetUpload = document.getElementById('visual-widget-upload');
const visualWidgetSites = document.getElementById('visual-widget-sites');
const visualWidgetCampaign = document.getElementById('visual-widget-campaign');
const visualWidgetFigma = document.getElementById('visual-widget-figma');
const visualFigmaUrl = document.getElementById('visual-figma-url');
const visualFigmaSiteUrl = document.getElementById('visual-figma-site-url');
const visualExportPdfBtn = document.getElementById('visual-export-pdf-btn');
const visualExportXlsxBtn = document.getElementById('visual-export-xlsx-btn');
const visualExportStatusEl = document.getElementById('visual-export-status');
let lastVisualResult = null;
const visualFileLabel = document.getElementById('visual-file-label');
const visualFileInput = document.getElementById('visual-file-input');
const visualSiteUrl = document.getElementById('visual-site-url');
const visualQaUrl = document.getElementById('visual-qa-url');
const visualProdUrl = document.getElementById('visual-prod-url');
const visualBannerInput = document.getElementById('visual-banner-input');
const visualPopupInput = document.getElementById('visual-popup-input');
const visualTncInput = document.getElementById('visual-tnc-input');
const visualCampaignSiteUrl = document.getElementById('visual-campaign-site-url');
const visualRunBtn = document.getElementById('visual-run-btn');
const visualStatusEl = document.getElementById('visual-status');
const visualResultsCard = document.getElementById('visual-results-card');
const visualErrorEl = document.getElementById('visual-error');
const visualReportBodyEl = document.getElementById('visual-report-body');
const visualProgressBar = document.getElementById('visual-progress-bar');

const VISUAL_FILE_LABELS = {
  'document-vs-site': 'Document',
  'asset-vs-site': 'Asset (image)',
};

// Labels for the two large side-by-side panes, per section kind — "b" is
// always the live site (or Production site); for asset/popup checks
// specifically it's the one frame Claude judged most relevant, not every
// frame captured.
const PANE_LABELS = {
  'document-vs-site': { a: 'Reference Document', b: 'Live Site' },
  'asset-vs-site': { a: 'Uploaded Asset', b: 'Live Site' },
  'site-vs-site': { a: 'QA Site', b: 'Production Site' },
  'figma-vs-site': { a: 'Figma Mockup', b: 'Live Site' },
  banner: { a: 'Banner Image', b: 'Live Site' },
  popup: { a: 'Pop-up Image', b: 'Live Site' },
};

const STATUS_META = {
  matched: { label: 'Matched', icon: '✅', variant: 'passed' },
  not_matched: { label: 'Not Matched', icon: '❌', variant: 'failed' },
  issue_found: { label: 'Issue Found', icon: '⚠️', variant: 'running' },
  no_issues_found: { label: 'No Issues Found', icon: '✅', variant: 'passed' },
};

function updateVisualWidgets() {
  const mode = visualModeSelect.value;
  const isUploadMode = mode === 'document-vs-site' || mode === 'asset-vs-site';
  const isCampaign = mode === 'campaign-vs-site';
  visualWidgetUpload.hidden = !isUploadMode;
  visualWidgetSites.hidden = mode !== 'site-vs-site';
  visualWidgetCampaign.hidden = !isCampaign;
  visualWidgetFigma.hidden = mode !== 'figma-vs-site';
  if (isUploadMode) {
    visualFileLabel.textContent = VISUAL_FILE_LABELS[mode];
    visualFileInput.accept = mode === 'asset-vs-site' ? '.png,.jpg,.jpeg,.webp,.gif,.svg' : '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.svg';
  }
}

visualModeSelect.addEventListener('change', updateVisualWidgets);
updateVisualWidgets();

// Click any comparison pane or thumbnail to open it full-size in a new tab.
// A full-page screenshot shrunk into a fixed-height pane is often unreadable
// as-is. Delegated on the results card (not per-image) since these images
// are inserted via innerHTML from buildSectionHtml()'s HTML strings, not
// created as DOM elements one at a time. Same blob: URL pattern used
// elsewhere in the app — Chrome blocks a top-level navigation straight to a
// data: URI, but not to a blob: URL created from one.
visualResultsCard.addEventListener('click', (e) => {
  const img = e.target.closest('.visual-compare-img, .visual-thumb');
  if (!img || !img.src) return;
  fetch(img.src)
    .then(r => r.blob())
    .then(blob => window.open(URL.createObjectURL(blob), '_blank'));
});

const SEVERITY_META = {
  critical: { label: 'Critical', variant: 'failed' },
  major: { label: 'Major', variant: 'running' },
  minor: { label: 'Minor', variant: '' },
};

// Builds one section's markup (status badge + compare panes w/ close-up
// crop + collapsed "extra frames" + breakdown table + findings list) as a
// plain HTML string — shared by the single-mode reports (Document/Asset/
// Site vs Site) and by each of the up-to-three sub-reports inside a
// Campaign Materials vs Site result, so both paths render identically
// instead of maintaining two copies of this markup.
function buildSectionHtml(sectionData, labels) {
  if (sectionData.error) {
    return `<div class="visual-error">${escapeHtml(sectionData.error)}</div>`;
  }

  const statusMeta = STATUS_META[sectionData.status] || STATUS_META.issue_found;
  let html = `<span class="status-pill ${statusMeta.variant} visual-status-pill">${statusMeta.icon} ${statusMeta.label}</span>`;

  if (sectionData.images) {
    const siteThumbs = (Array.isArray(sectionData.images.b) ? sectionData.images.b : [sectionData.images.b]).filter(Boolean);
    const bestIndex = Number.isInteger(sectionData.bestFrameIndex) ? sectionData.bestFrameIndex : 0;
    const fullBestSrc = siteThumbs[bestIndex] || siteThumbs[0];
    // Prefer the cropped close-up Claude's bounding box produced — a whole
    // full-page screenshot shrunk into the pane is unreadable on a tall
    // page. Falls back to the full frame whenever no usable crop exists.
    const usingCrop = !!sectionData.images.matchCrop;
    const bestSrc = sectionData.images.matchCrop || fullBestSrc;
    // When the reference document named specific pages to check (Document
    // vs Site only), each site frame's real URL is known — show that
    // instead of a bare "Live Site" label so it's clear which page is which.
    const bLabels = Array.isArray(sectionData.images.bLabels) ? sectionData.images.bLabels : null;
    const bLabel = usingCrop
      ? `${labels.b} — Close-up`
      : (bLabels?.[bestIndex] ? `${labels.b} — ${bLabels[bestIndex]}` : labels.b);

    const panes = [];
    if (sectionData.images.a) {
      panes.push(`
        <div class="visual-compare-pane">
          <span class="visual-pane-label">${escapeHtml(labels.a)}</span>
          <img src="${sectionData.images.a}" class="visual-compare-img" alt="${escapeHtml(labels.a)}" title="Click to view full size" />
        </div>
      `);
    } else if (sectionData.images.aText) {
      // A Word/Excel reference has no image to show — display the same
      // extracted text Claude actually compared against instead of leaving
      // this pane blank.
      panes.push(`
        <div class="visual-compare-pane">
          <span class="visual-pane-label">${escapeHtml(labels.a)} (extracted text)</span>
          <pre class="visual-compare-text">${escapeHtml(sectionData.images.aText)}</pre>
        </div>
      `);
    }
    if (bestSrc) {
      panes.push(`
        <div class="visual-compare-pane">
          <span class="visual-pane-label">${escapeHtml(bLabel)}</span>
          <img src="${bestSrc}" class="visual-compare-img" alt="${escapeHtml(bLabel)}" title="Click to view full size" />
        </div>
      `);
    }
    html += `<div class="visual-compare">${panes.join('')}</div>`;

    // Extra frames (asset/banner/popup checks, when a carousel is involved)
    // stay available for transparency without cluttering the primary view
    // — tucked behind a collapsed <details>, same pattern as the
    // Dashboard's day-cards. Always includes the full (uncropped) best
    // frame too, so the close-up above can be checked against its
    // original context.
    const extraThumbs = usingCrop ? [fullBestSrc, ...siteThumbs] : siteThumbs;
    if (extraThumbs.length > 1 || usingCrop) {
      const extraHtml = extraThumbs
        .map((src, i) => {
          const isFullBest = usingCrop ? i === 0 : i === bestIndex;
          // Map back to the real siteThumbs index for the label lookup —
          // when usingCrop, index 0 is the prepended full best frame
          // (== bestIndex in the original array), and every later index is
          // shifted by one.
          const srcIndex = usingCrop ? (i === 0 ? bestIndex : i - 1) : i;
          const url = bLabels?.[srcIndex];
          const label = usingCrop
            ? (i === 0 ? (url ? `Full page (uncropped) — ${url}` : 'Full page (uncropped)') : (url || `Site frame ${srcIndex}`))
            : (url || `Site frame ${i}`);
          return `<img src="${src}" class="visual-thumb${isFullBest ? ' visual-thumb-best' : ''}" alt="${label}" title="${label}" />`;
        })
        .join('');
      html += `
        <details class="visual-extra-frames">
          <summary>See all frames checked</summary>
          <div class="visual-extra-frames-body">${extraHtml}</div>
        </details>
      `;
    }
  }

  const breakdown = sectionData.breakdown || [];
  if (breakdown.length > 0) {
    html += `
      <table class="visual-breakdown-table">
        <thead>
          <tr><th>Field</th><th>On Asset / Reference</th><th>On Site</th><th></th></tr>
        </thead>
        <tbody>
          ${breakdown.map(row => `
            <tr>
              <td>${escapeHtml(row.field)}</td>
              <td>${escapeHtml(row.assetValue)}</td>
              <td>${escapeHtml(row.siteValue)}</td>
              <td class="visual-breakdown-check">${row.match ? '<span class="visual-check-yes">✓</span>' : '<span class="visual-check-no">✗</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const findings = sectionData.findings || [];
  if (findings.length > 0) {
    html += `<div class="visual-findings">${findings.map(f => {
      const meta = SEVERITY_META[f.severity] || SEVERITY_META.minor;
      return `
        <div class="visual-finding">
          <span class="status-pill ${meta.variant}">${meta.label}</span>
          <div class="visual-finding-body">
            <strong>${escapeHtml(f.title)}</strong>
            ${f.location ? `<span class="visual-finding-location">${escapeHtml(f.location)}</span>` : ''}
            <p>${escapeHtml(f.description)}</p>
          </div>
        </div>
      `;
    }).join('')}</div>`;
  }

  return html;
}

const CAMPAIGN_SECTIONS = [
  { key: 'banner', title: 'Banner' },
  { key: 'popup', title: 'Pop-up' },
  { key: 'tnc', title: 'Terms & Conditions' },
];

function renderVisualResults(data) {
  visualResultsCard.classList.add('visible');
  visualErrorEl.hidden = true;
  visualReportBodyEl.innerHTML = '';

  if (data.error) {
    visualErrorEl.hidden = false;
    visualErrorEl.textContent = data.error;
    return;
  }

  if (data.mode === 'campaign-vs-site') {
    const overallMeta = STATUS_META[data.overallStatus] || STATUS_META.issue_found;
    let html = `<div class="visual-status-badge"><span class="status-pill ${overallMeta.variant} visual-status-pill">${overallMeta.icon} Overall: ${overallMeta.label}</span></div>`;

    for (const { key, title } of CAMPAIGN_SECTIONS) {
      const section = data.sections && data.sections[key];
      if (!section) continue;
      html += `
        <div class="visual-section">
          <h3 class="visual-section-title">${escapeHtml(title)}</h3>
          ${buildSectionHtml(section, PANE_LABELS[key] || { a: 'Reference', b: 'Live Site' })}
        </div>
      `;
    }

    if (data.model) {
      html += `<div class="visual-model-note">Powered by Claude (${escapeHtml(data.model)})</div>`;
    }

    visualReportBodyEl.innerHTML = html;
    return;
  }

  let html = buildSectionHtml(data, PANE_LABELS[data.mode] || { a: 'Reference', b: 'Live Site' });
  if (data.model) {
    html += `<div class="visual-model-note">Powered by Claude (${escapeHtml(data.model)})</div>`;
  }
  visualReportBodyEl.innerHTML = html;
}

visualRunBtn.addEventListener('click', () => {
  const mode = visualModeSelect.value;
  const formData = new FormData();
  formData.append('mode', mode);

  if (mode === 'site-vs-site') {
    if (!visualQaUrl.value.trim() || !visualProdUrl.value.trim()) {
      setStatus(visualStatusEl, 'Enter both URLs', 'failed');
      return;
    }
    formData.append('qaUrl', visualQaUrl.value.trim());
    formData.append('prodUrl', visualProdUrl.value.trim());
  } else if (mode === 'figma-vs-site') {
    if (!visualFigmaUrl.value.trim() || !visualFigmaSiteUrl.value.trim()) {
      setStatus(visualStatusEl, 'Enter a Figma frame URL and a site URL', 'failed');
      return;
    }
    formData.append('figmaUrl', visualFigmaUrl.value.trim());
    formData.append('siteUrl', visualFigmaSiteUrl.value.trim());
  } else if (mode === 'campaign-vs-site') {
    const hasBanner = !!visualBannerInput.files[0];
    const hasPopup = !!visualPopupInput.files[0];
    const tncText = visualTncInput.value.trim();
    if (!visualCampaignSiteUrl.value.trim() || (!hasBanner && !hasPopup && !tncText)) {
      setStatus(visualStatusEl, 'Enter a site URL + at least one material', 'failed');
      return;
    }
    formData.append('siteUrl', visualCampaignSiteUrl.value.trim());
    if (hasBanner) formData.append('bannerImage', visualBannerInput.files[0]);
    if (hasPopup) formData.append('popupImage', visualPopupInput.files[0]);
    if (tncText) formData.append('tncText', tncText);
  } else {
    if (!visualFileInput.files[0] || !visualSiteUrl.value.trim()) {
      setStatus(visualStatusEl, 'Pick a file and enter a site URL', 'failed');
      return;
    }
    formData.append('file', visualFileInput.files[0]);
    formData.append('siteUrl', visualSiteUrl.value.trim());
  }

  visualRunBtn.disabled = true;
  setStatus(visualStatusEl, 'Analyzing…', 'running');
  visualResultsCard.classList.remove('visible');
  visualProgressBar.classList.add('active');

  fetch('/visual-check', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => {
      visualRunBtn.disabled = false;
      visualProgressBar.classList.remove('active');
      if (data.error) {
        setStatus(visualStatusEl, 'Error', 'failed');
      } else {
        const statusKey = data.mode === 'campaign-vs-site' ? data.overallStatus : data.status;
        const meta = STATUS_META[statusKey] || STATUS_META.issue_found;
        setStatus(visualStatusEl, meta.label, meta.variant);
      }
      lastVisualResult = data.error ? null : data;
      visualExportPdfBtn.disabled = !lastVisualResult;
      visualExportXlsxBtn.disabled = !lastVisualResult;
      visualExportStatusEl.hidden = true;
      renderVisualResults(data);
    })
    .catch(() => {
      visualRunBtn.disabled = false;
      visualProgressBar.classList.remove('active');
      setStatus(visualStatusEl, 'Request failed', 'failed');
      lastVisualResult = null;
      visualExportPdfBtn.disabled = true;
      visualExportXlsxBtn.disabled = true;
      renderVisualResults({ error: 'The request failed — check your connection and try again.' });
    });
});

function exportVisualResult(format, btn) {
  if (!lastVisualResult) return;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  visualExportStatusEl.hidden = true;
  visualExportStatusEl.classList.remove('visual-export-status-error');

  // Success comes back as the file itself (saved to the browser's Downloads
  // folder below); failures come back as JSON with an error message.
  fetch('/visual-check/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: lastVisualResult, format }),
  })
    .then(async res => {
      if ((res.headers.get('Content-Type') || '').includes('application/json')) {
        const result = await res.json();
        throw new Error(result.error || 'Export failed.');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const nameMatch = disposition.match(/filename="?([^";]+)"?/);
      return { blob: await res.blob(), filename: nameMatch ? nameMatch[1] : `visual-check-report.${format}` };
    })
    .then(({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      btn.disabled = false;
      btn.textContent = originalLabel;
      visualExportStatusEl.hidden = false;
      visualExportStatusEl.textContent = `Downloaded: ${filename}`;
    })
    .catch(err => {
      btn.disabled = false;
      btn.textContent = originalLabel;
      visualExportStatusEl.hidden = false;
      visualExportStatusEl.classList.add('visual-export-status-error');
      visualExportStatusEl.textContent = err instanceof TypeError
        ? 'Export failed — check your connection and try again.'
        : err.message;
    });
}

visualExportPdfBtn.addEventListener('click', () => exportVisualResult('pdf', visualExportPdfBtn));
visualExportXlsxBtn.addEventListener('click', () => exportVisualResult('xlsx', visualExportXlsxBtn));

// ── Visual Check: Investigate (site crawl) ───────────────────────────────
const investigateUrlInput = document.getElementById('investigate-url');
const investigateTermsInput = document.getElementById('investigate-terms');
const investigateExcludeInput = document.getElementById('investigate-exclude');
const investigateSmartMatch = document.getElementById('investigate-smart-match');
const investigateRunBtn = document.getElementById('investigate-run-btn');
const investigateStopBtn = document.getElementById('investigate-stop-btn');
const investigateStatusEl = document.getElementById('investigate-status');
const investigateProgressEl = document.getElementById('investigate-progress');
const investigateExportBtn = document.getElementById('investigate-export-btn');
const investigateCappedNote = document.getElementById('investigate-capped-note');
const investigateTheadRow = document.getElementById('investigate-thead-row');
const investigateTbody = document.getElementById('investigate-tbody');
const investigateEmptyEl = document.getElementById('investigate-empty');
const investigateResultsCard = document.getElementById('investigate-results-card');
const investigateProgressBar = document.getElementById('investigate-progress-bar');

let investigateSessionId = null;
let investigateSource = null;
let investigateTerms = [];
let investigateRows = []; // { url, status, mentions: { term: count }, aiFlags: Set<term> }

function investigateStatusBadge(status) {
  if (status === 'error') return '<span class="investigate-status-badge investigate-status-dead">Error</span>';
  if (typeof status === 'number' && status >= 200 && status < 400) {
    return `<span class="investigate-status-badge investigate-status-live">Live (${status})</span>`;
  }
  return `<span class="investigate-status-badge investigate-status-dead">${status}</span>`;
}

function investigateMentionsCell(row) {
  if (investigateTerms.length === 0) return '';
  return investigateTerms
    .map(term => {
      const count = row.mentions[term] ?? 0;
      const aiHit = row.aiFlags.has(term);
      let valueHtml;
      if (count > 0) valueHtml = `<span class="count-hit">${count}</span>`;
      else if (aiHit) valueHtml = '<span class="ai-flag">AI match</span>';
      else valueHtml = '<span class="count-zero">0</span>';
      return `<span class="investigate-mentions-term"><strong>${escapeHtml(term)}:</strong> ${valueHtml}</span>`;
    })
    .join('');
}

function renderInvestigateRow(row) {
  const tr = document.createElement('tr');
  tr.dataset.url = row.url;
  const urlCell = `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener" class="investigate-url-link">${escapeHtml(row.url)}</a>`;
  const mentionsCell = investigateTerms.length > 0 ? `<td>${investigateMentionsCell(row)}</td>` : '';
  tr.innerHTML = `<td>${urlCell}</td><td>${investigateStatusBadge(row.status)}</td>${mentionsCell}`;
  return tr;
}

function refreshInvestigateRow(row) {
  const tr = investigateTbody.querySelector(`tr[data-url="${CSS.escape(row.url)}"]`);
  if (!tr) return;
  const replacement = renderInvestigateRow(row);
  tr.replaceWith(replacement);
}

function resetInvestigateTable() {
  investigateRows = [];
  investigateTbody.innerHTML = '';
  investigateEmptyEl.style.display = 'block';
  investigateCappedNote.hidden = true;
  investigateExportBtn.disabled = true;

  investigateTheadRow.innerHTML = '<th>URL</th><th>Status</th>';
  if (investigateTerms.length > 0) {
    const th = document.createElement('th');
    th.textContent = 'Mentions';
    investigateTheadRow.appendChild(th);
  }
}

function investigateEndRun(label, variant) {
  setStatus(investigateStatusEl, label, variant);
  investigateRunBtn.disabled = false;
  investigateStopBtn.disabled = true;
  investigateProgressBar.classList.remove('active');
  if (investigateSource) investigateSource.close();
  investigateSource = null;
  investigateSessionId = null;
  investigateExportBtn.disabled = investigateRows.length === 0;
}

investigateRunBtn.addEventListener('click', () => {
  const seedUrl = investigateUrlInput.value.trim();
  if (!seedUrl) {
    setStatus(investigateStatusEl, 'Enter a site URL', 'failed');
    return;
  }

  // Both fields are now textareas so terms/patterns can be typed one per
  // line as well as comma-separated — split on either.
  investigateTerms = investigateTermsInput.value
    .split(/[,\n]/)
    .map(t => t.trim())
    .filter(Boolean);
  const excludePatterns = investigateExcludeInput.value
    .split(/[,\n]/)
    .map(p => p.trim())
    .filter(Boolean);
  const smartMatch = investigateSmartMatch.checked && investigateTerms.length > 0;

  investigateRunBtn.disabled = true;
  investigateStopBtn.disabled = false;
  investigateProgressEl.textContent = '';
  setStatus(investigateStatusEl, 'Crawling…', 'running');
  investigateProgressBar.classList.add('active');
  investigateResultsCard.classList.add('visible');
  resetInvestigateTable();

  const params = new URLSearchParams({
    url: seedUrl,
    terms: investigateTerms.join(','),
    exclude: excludePatterns.join(','),
    smartMatch: String(smartMatch),
  });

  investigateSource = new EventSource(`/investigate?${params.toString()}`);

  investigateSource.onmessage = event => {
    const data = JSON.parse(event.data);

    if (data.type === 'session') {
      investigateSessionId = data.sessionId;
      return;
    }

    if (data.type === 'page') {
      const row = { url: data.page.url, status: data.page.status, mentions: data.page.mentions, aiFlags: new Set() };
      investigateRows.push(row);
      investigateEmptyEl.style.display = 'none';
      investigateTbody.appendChild(renderInvestigateRow(row));
      investigateProgressEl.textContent = `${investigateRows.length} page(s) crawled…`;
      return;
    }

    if (data.type === 'error') {
      investigateEndRun('Error', 'failed');
      investigateProgressEl.textContent = data.message;
      return;
    }

    if (data.type === 'stopped') {
      investigateEndRun('Stopped', 'failed');
      return;
    }

    if (data.type === 'done') {
      // Smart-match hits arrive folded into the same 'done' payload — apply
      // them to already-rendered rows before flipping the run to finished,
      // so the AI-flagged cells show up on first paint, not a beat later.
      for (const [term, urls] of Object.entries(data.smartMatches || {})) {
        for (const url of urls) {
          const row = investigateRows.find(r => r.url === url);
          if (row) row.aiFlags.add(term);
        }
      }
      for (const row of investigateRows) {
        if (row.aiFlags.size > 0) refreshInvestigateRow(row);
      }

      if (data.capped) {
        investigateCappedNote.hidden = false;
        investigateCappedNote.textContent = `Stopped at the 200-page cap — this site has more pages than were crawled.`;
      }

      investigateProgressEl.textContent = `${data.pagesCrawled} page(s) crawled.`;
      investigateEndRun('Done', 'passed');
      return;
    }
  };

  investigateSource.onerror = () => {
    investigateEndRun('Connection lost', 'failed');
  };
});

investigateStopBtn.addEventListener('click', () => {
  investigateStopBtn.disabled = true;
  if (!investigateSessionId) return;
  fetch(`/investigate/${investigateSessionId}/stop`, { method: 'POST' }).catch(() => {});
});

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

investigateExportBtn.addEventListener('click', () => {
  const headers = ['URL', 'Status', ...investigateTerms.map(t => `Mentions: ${t}`)];
  const lines = [headers.map(csvEscape).join(',')];

  for (const row of investigateRows) {
    const statusText = row.status === 'error' ? 'Error' : String(row.status);
    const mentionCells = investigateTerms.map(term => {
      const count = row.mentions[term] ?? 0;
      if (count > 0) return String(count);
      return row.aiFlags.has(term) ? 'AI match' : '0';
    });
    lines.push([row.url, statusText, ...mentionCells].map(csvEscape).join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `investigate-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ── JIRA Checker tab (POC) ───────────────────────────────────────────────────
// Load Ticket -> ready? show test-case card + Check, or show a drafted
// clarification comment + Commit-to-Hold. Check runs a real Playwright spec
// server-side (never AI-generated code) and shows the drafted house-style
// comment. Commit is the only button that changes Jira ticket state.
(function jiraChecker() {
  const keyInput = document.getElementById('jira-key-input');
  const loadBtn = document.getElementById('jira-load-btn');

  const ticketCard = document.getElementById('jira-ticket-card');
  const ticketTitle = document.getElementById('jira-ticket-title');
  const ticketStatusPill = document.getElementById('jira-ticket-status');

  const testCasesBox = document.getElementById('jira-test-cases-box');
  const testCasesList = document.getElementById('jira-test-cases-list');

  const notReadyBox = document.getElementById('jira-not-ready');
  const notReadyReason = document.getElementById('jira-not-ready-reason');
  const clarificationBox = document.getElementById('jira-clarification-box');
  const clarificationText = document.getElementById('jira-clarification-text');
  const holdBtn = document.getElementById('jira-hold-btn');

  const readyBox = document.getElementById('jira-ready');
  const phaseEl = document.getElementById('jira-phase');
  const testTypeEl = document.getElementById('jira-test-type');
  const confidenceEl = document.getElementById('jira-confidence');
  const checkItemsList = document.getElementById('jira-check-items');
  const checkBtn = document.getElementById('jira-check-btn');
  const contentMismatchNote = document.getElementById('jira-content-mismatch-note');
  const compareAltBtn = document.getElementById('jira-compare-alt-btn');

  const visualReadyBox = document.getElementById('jira-visual-ready');
  const visualPhaseEl = document.getElementById('jira-visual-phase');
  const visualExplainerEl = document.getElementById('jira-visual-explainer');
  const visualDetailEl = document.getElementById('jira-visual-detail');

  // A "visual check" isn't one fixed thing — asset-vs-site (a new/changed
  // image, checked against one live site) and site-vs-site (QA vs
  // Production content mismatch) need different explanations and inputs.
  function describeVisualCheck(vc) {
    if (vc.kind === 'asset-vs-site') {
      visualExplainerEl.innerHTML = 'No automated functional test matches this ticket &mdash; but it has an attached image, so it looks like a <strong>new/changed asset check</strong> instead.';
      visualDetailEl.innerHTML = `<strong>Reference asset:</strong> ${vc.attachmentFilename} &nbsp; <strong>vs live site:</strong> ${vc.siteUrl}`;
    } else {
      visualExplainerEl.innerHTML = 'No automated functional test matches this ticket &mdash; but it looks like a <strong>QA vs Production content/visual comparison</strong> instead.';
      visualDetailEl.innerHTML = `<strong>QA:</strong> ${vc.qaUrl} &nbsp; <strong>vs Production:</strong> ${vc.liveUrl}`;
    }
  }
  const visualCheckItemsList = document.getElementById('jira-visual-check-items');
  const compareBtn = document.getElementById('jira-compare-btn');

  const resultCard = document.getElementById('jira-result-card');
  const resultPhasePill = document.getElementById('jira-result-phase');
  const resultStatusPill = document.getElementById('jira-result-status');
  const commentPreview = document.getElementById('jira-comment-preview');
  const evidenceGallery = document.getElementById('jira-evidence-gallery');
  const videoNote = document.getElementById('jira-video-note');
  const commitBtn = document.getElementById('jira-commit-btn');
  const cancelBtn = document.getElementById('jira-cancel-btn');

  function phaseLabel(phase) {
    return phase === 'post-check' ? 'Post-Check' : 'Pre-Check';
  }

  const outcomeCard = document.getElementById('jira-commit-outcome');
  const outcomeText = document.getElementById('jira-commit-outcome-text');

  let current = null; // { key, testType, testFile, checkItems, params }

  // Always drawn from Load Ticket regardless of ready/not-ready/holdable —
  // per the house Test Case Standard, a QA-executable test case is what
  // JIRA Checker owes every ticket, independent of whether automation can
  // also run against it.
  function renderTestCases(testCases, warning) {
    testCasesList.innerHTML = '';
    if (!testCases || testCases.length === 0) {
      // A failed AI interpretation and "genuinely nothing to draft" used to
      // look identical (empty box, hidden). Surface the warning explicitly
      // so a real failure isn't mistaken for the ticket just being simple.
      if (warning) {
        testCasesBox.hidden = false;
        const p = document.createElement('p');
        p.className = 'test-case-meta';
        p.textContent = `⚠️ ${warning}`;
        testCasesList.appendChild(p);
      } else {
        testCasesBox.hidden = true;
      }
      return;
    }
    testCasesBox.hidden = false;
    for (const tc of testCases) {
      const block = document.createElement('div');
      block.className = 'test-case-block';

      const header = document.createElement('div');
      header.className = 'test-case-block-header';
      const idSpan = document.createElement('span');
      idSpan.className = 'test-case-id';
      idSpan.textContent = tc.testCaseId;
      const titleStrong = document.createElement('strong');
      titleStrong.textContent = tc.title || '(untitled)';
      const autoPill = document.createElement('span');
      autoPill.className = `status-pill ${tc.automatable ? 'passed' : 'running'}`;
      autoPill.textContent = tc.automatable ? 'Automatable' : 'Manual';
      header.append(idSpan, titleStrong, autoPill);
      block.appendChild(header);

      const metaParts = [
        tc.brandGeo && `Brand/GEO: ${tc.brandGeo}`,
        tc.platform && `Platform: ${tc.platform}`,
        tc.environment && `Environment: ${tc.environment}`,
      ].filter(Boolean);
      if (metaParts.length) {
        const meta = document.createElement('p');
        meta.className = 'test-case-meta';
        meta.textContent = metaParts.join(' • ');
        block.appendChild(meta);
      }

      if (tc.requirementReference) {
        const ref = document.createElement('p');
        ref.innerHTML = `<strong>Requirement:</strong> ${tc.requirementReference}`;
        block.appendChild(ref);
      }

      if (tc.preconditions?.length) {
        const p = document.createElement('p');
        p.innerHTML = '<strong>Preconditions:</strong>';
        block.appendChild(p);
        const ul = document.createElement('ul');
        for (const pre of tc.preconditions) {
          const li = document.createElement('li');
          li.textContent = pre;
          ul.appendChild(li);
        }
        block.appendChild(ul);
      }

      if (tc.testData?.length) {
        const p = document.createElement('p');
        p.innerHTML = `<strong>Test data:</strong> ${tc.testData.join(', ')}`;
        block.appendChild(p);
      }

      if (tc.steps?.length) {
        const stepsLabel = document.createElement('p');
        stepsLabel.innerHTML = '<strong>Steps:</strong>';
        block.appendChild(stepsLabel);
        const ol = document.createElement('ol');
        for (const s of tc.steps) {
          const li = document.createElement('li');
          const stepSpan = document.createElement('div');
          stepSpan.textContent = s.step;
          const expSpan = document.createElement('div');
          expSpan.className = 'expected';
          expSpan.textContent = `Expected: ${s.expected}`;
          li.append(stepSpan, expSpan);
          ol.appendChild(li);
        }
        block.appendChild(ol);
      }

      if (tc.notes) {
        const notes = document.createElement('p');
        notes.className = 'test-case-meta';
        notes.textContent = `Notes: ${tc.notes}`;
        block.appendChild(notes);
      }

      testCasesList.appendChild(block);
    }
  }

  function hideAll() {
    ticketCard.hidden = true;
    testCasesBox.hidden = true;
    notReadyBox.hidden = true;
    clarificationBox.hidden = true;
    readyBox.hidden = true;
    visualReadyBox.hidden = true;
    contentMismatchNote.hidden = true;
    resultCard.hidden = true;
    outcomeCard.hidden = true;
  }

  // Shared by Check and Compare results — both endpoints return the same
  // { success, preview, screenshots, videoFilenames? } shape.
  function renderCheckResult(data, phase) {
    resultCard.hidden = false;
    resultPhasePill.textContent = phaseLabel(phase);
    resultPhasePill.className = `status-pill ${phase === 'post-check' ? 'running' : 'passed'}`;
    resultStatusPill.textContent = data.success ? 'PASS' : 'FAIL';
    resultStatusPill.className = `status-pill ${data.success ? 'passed' : 'failed'}`;
    commentPreview.textContent = data.preview;

    evidenceGallery.innerHTML = '';
    for (const shot of data.screenshots ?? []) {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = shot.dataUri;
      img.alt = shot.filename;
      img.title = 'Click to open full size in a new tab';
      // A full-page screenshot is tall and narrow — no inline size can show
      // every detail at once. Chrome blocks top-level navigation straight to
      // a data: URI, so convert to a blob: URL first rather than a plain
      // <a href> to the data URI.
      img.addEventListener('click', () => {
        fetch(shot.dataUri)
          .then(r => r.blob())
          .then(blob => window.open(URL.createObjectURL(blob), '_blank'));
      });
      const caption = document.createElement('figcaption');
      caption.textContent = shot.filename;
      figure.appendChild(img);
      figure.appendChild(caption);
      evidenceGallery.appendChild(figure);
    }

    if (data.videoFilenames?.length) {
      videoNote.hidden = false;
      videoNote.textContent = `${data.videoFilenames.length} video(s) recorded (${data.videoFilenames.join(', ')}) — will be attached and linked in the comment on Commit.`;
    } else {
      videoNote.hidden = true;
    }
  }

  loadBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim().toUpperCase();
    if (!key) return;
    hideAll();
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    try {
      const res = await fetch(`/jira/ticket?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Failed to load ticket');
        return;
      }

      ticketCard.hidden = false;
      ticketTitle.textContent = `${data.key} — ${data.summary}`;
      ticketStatusPill.textContent = data.status;
      ticketStatusPill.className = 'status-pill';
      renderTestCases(data.testCases, data.testCasesWarning);

      if (!data.ready) {
        notReadyBox.hidden = false;
        notReadyReason.textContent = data.reason;
        if (data.holdable && data.clarificationComment) {
          clarificationBox.hidden = false;
          clarificationText.textContent = data.clarificationComment;
          current = { key, comment: data.clarificationComment };
        }
        return;
      }

      if (data.mode === 'visual') {
        visualReadyBox.hidden = false;
        visualPhaseEl.textContent = phaseLabel(data.phase);
        visualPhaseEl.className = `status-pill ${data.phase === 'post-check' ? 'running' : 'passed'}`;
        describeVisualCheck(data.visualCheck);
        visualCheckItemsList.innerHTML = '';
        for (const item of data.checkItems.length ? data.checkItems : ['Visual/content check']) {
          const li = document.createElement('li');
          li.textContent = item;
          visualCheckItemsList.appendChild(li);
        }
        current = {
          key,
          kind: 'visual',
          phase: data.phase,
          checkItems: data.checkItems,
          visualCheck: data.visualCheck,
          geo: data.params?.GEO,
        };
        return;
      }

      readyBox.hidden = false;
      phaseEl.textContent = phaseLabel(data.phase);
      phaseEl.className = `status-pill ${data.phase === 'post-check' ? 'running' : 'passed'}`;
      testTypeEl.textContent = data.testType;
      confidenceEl.textContent = data.confidence === 'low' ? 'Low confidence — verify' : 'High confidence';
      confidenceEl.className = `status-pill ${data.confidence === 'low' ? 'running' : 'passed'}`;
      checkItemsList.innerHTML = '';
      for (const item of data.checkItems.length ? data.checkItems : [`${data.testType} flow`]) {
        const li = document.createElement('li');
        li.textContent = item;
        checkItemsList.appendChild(li);
      }
      current = {
        key,
        kind: 'playwright',
        phase: data.phase,
        testType: data.testType,
        testFile: data.testFile,
        checkItems: data.checkItems,
        params: data.params,
      };

      if (data.visualCheckRecommended && data.visualCheck) {
        contentMismatchNote.hidden = false;
        contentMismatchNote.dataset.visualCheck = JSON.stringify(data.visualCheck);
        const label = contentMismatchNote.querySelector('p');
        if (label) {
          label.innerHTML = data.visualCheck.kind === 'asset-vs-site'
            ? '&#9888;&#65039; This also reads like a <strong>new/changed asset</strong> ticket &mdash; a functional check may not verify the asset itself.'
            : '&#9888;&#65039; This also reads like a <strong>QA vs Production content mismatch</strong> &mdash; a functional check may not catch it.';
        }
      } else {
        contentMismatchNote.hidden = true;
      }
    } catch (e) {
      alert(`Could not reach the server: ${e}`);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load Ticket';
    }
  });

  holdBtn.addEventListener('click', async () => {
    if (!current?.key || !current?.comment) return;
    holdBtn.disabled = true;
    holdBtn.textContent = 'Posting...';
    try {
      const res = await fetch('/jira/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: current.key, comment: current.comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Failed to put ticket on hold');
        return;
      }
      outcomeCard.hidden = false;
      outcomeText.textContent = `${current.key} — clarification comment posted, ticket moved to On Hold.`;
    } catch (e) {
      alert(`Could not reach the server: ${e}`);
    } finally {
      holdBtn.disabled = false;
      holdBtn.textContent = 'Commit — Post & Put On Hold';
    }
  });

  checkBtn.addEventListener('click', async () => {
    if (!current?.key) return;
    resultCard.hidden = true;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Running...';
    try {
      const res = await fetch('/jira/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Check failed');
        return;
      }
      renderCheckResult(data, current.phase);
    } catch (e) {
      alert(`Could not reach the server: ${e}`);
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = '▶ Check';
    }
  });

  async function runCompare(payload, btn, idleLabel) {
    resultCard.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Comparing...';
    try {
      const res = await fetch('/jira/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Compare failed');
        return;
      }
      renderCheckResult(data, payload.phase);
    } catch (e) {
      alert(`Could not reach the server: ${e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = idleLabel;
    }
  }

  compareBtn.addEventListener('click', () => {
    if (!current?.key) return;
    runCompare(current, compareBtn, '▶ Compare');
  });

  compareAltBtn.addEventListener('click', () => {
    if (!current?.key) return;
    runCompare({
      key: current.key,
      phase: current.phase,
      checkItems: current.checkItems,
      visualCheck: JSON.parse(contentMismatchNote.dataset.visualCheck),
      geo: current.params?.GEO,
    }, compareAltBtn, '▶ Compare instead');
  });

  cancelBtn.addEventListener('click', async () => {
    if (!current?.key) return;
    resultCard.hidden = true;
    try {
      await fetch('/jira/check/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: current.key }),
      });
    } catch { /* best-effort — hiding the card is what actually matters to the user */ }
  });

  commitBtn.addEventListener('click', async () => {
    if (!current?.key) return;
    commitBtn.disabled = true;
    commitBtn.textContent = 'Posting...';
    try {
      const res = await fetch('/jira/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: current.key }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Commit failed');
        return;
      }
      outcomeCard.hidden = false;
      let msg = `${current.key} — comment posted, ticket transitioned to ${data.status}.`;
      if (data.warnings?.length) msg += `\n\nWarnings:\n${data.warnings.join('\n')}`;
      outcomeText.textContent = msg;
    } catch (e) {
      alert(`Could not reach the server: ${e}`);
    } finally {
      commitBtn.disabled = false;
      commitBtn.textContent = 'Commit — Post Comment & Update Status';
    }
  });
})();
