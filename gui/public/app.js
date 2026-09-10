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
    segments.forEach((seg, idx) => {
      const isLast = idx === segments.length - 1;
      const w = Math.max(2, seg.value * scale) - (isLast ? 0 : GAP);
      if (isLast) {
        const r = Math.min(4, barH / 2, w);
        bars += `<path class="${seg.cls}" d="M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + barH - r} Q${x + w},${y + barH} ${x + w - r},${y + barH} L${x},${y + barH} Z" />`;
      } else {
        bars += `<rect class="${seg.cls}" x="${x}" y="${y}" width="${w}" height="${barH}" />`;
      }
      x += w + GAP;
    });

    const total = activeSeries.reduce((sum, k) => sum + day[k], 0);
    bars += `<text class="bar-total" x="${x + 4}" y="${y + barH / 2 + 3}" text-anchor="start">${total || ''}</text>`;

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

// Donut showing the overall Passed/Failed/Flaky split across the same
// window of dates as the trend chart — part-to-whole is what a donut is
// for, so unlike the bars it always shows all three slices; an active stat
// filter dims the other two rather than removing them, so the proportion
// stays visible for context.
function renderStatusDonut(days, filter) {
  const container = document.getElementById('status-donut');
  const rows = [...days].slice(0, 14);
  const totals = rows.reduce(
    (acc, d) => {
      acc.passed += d.passed;
      acc.failed += d.failed;
      acc.flaky += d.flaky;
      return acc;
    },
    { passed: 0, failed: 0, flaky: 0 }
  );
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
  for (const s of series) {
    const frac = s.value / grand;
    const length = frac * circumference;
    const dash = Math.max(0, length - gapLen);
    const rotation = (offsetAccum / circumference) * 360 - 90;
    const isDimmed = filter && filter !== 'all' && s.key !== filter;
    const pct = Math.round(frac * 1000) / 10;
    segments += `<circle class="donut-seg ${s.cls}${isDimmed ? ' donut-dim' : ''}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${strokeW}" stroke-dasharray="${dash} ${circumference - dash}" transform="rotate(${rotation} ${cx} ${cy})"><title>${s.key}: ${s.value} (${pct}%)</title></circle>`;
    offsetAccum += length;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" class="donut-svg" role="img" aria-label="Overall passed, failed, and flaky split">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${strokeW}" />
      ${segments}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-total">${grand}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-total-label">tests</text>
    </svg>
  `;
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

    const rowsHtml = day.entries.map(entry => {
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

    details.innerHTML = `
      <summary class="day-summary">
        <span class="day-chevron">&#9656;</span>
        <span class="day-date">${escapeHtml(day.date)}</span>
        <span class="day-stats">
          <span class="count-passed">${day.passed} passed</span>
          <span class="count-failed">${day.failed} failed</span>
          <span class="count-flaky">${day.flaky} flaky</span>
        </span>
      </summary>
      <div class="day-body">
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
      </div>
    `;
    listEl.appendChild(details);
  });
}

const FILTER_META = {
  all: { title: 'All Tests', icon: '&#128203;' },
  passed: { title: 'Passed Tests', icon: '&#9989;' },
  failed: { title: 'Failed Tests', icon: '&#10060;' },
  flaky: { title: 'Flaky Tests', icon: '&#128260;' },
};

let allTests = [];
let lastDays = [];
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
  renderStatusDonut(lastDays, null);
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
    renderStatusDonut(lastDays, filter);
  });
}

document.getElementById('drilldown-close').addEventListener('click', closeDrilldown);

function loadDashboard() {
  fetch('/dashboard')
    .then(res => res.json())
    .then(({ stats, days, tests }) => {
      document.getElementById('stat-total-runs').textContent = stats.totalRuns;
      document.getElementById('stat-passed').textContent = stats.totalPassed;
      document.getElementById('stat-failed').textContent = stats.totalFailed;
      document.getElementById('stat-flaky').textContent = stats.totalFlaky;

      const noteEl = document.getElementById('last-run-note');
      noteEl.textContent = stats.lastRunDate ? `Last run: ${stats.lastRunDate}` : '';

      allTests = tests;
      lastDays = days;
      if (activeFilter) renderDrilldown(activeFilter);

      renderTrendChart(days, activeFilter);
      renderStatusDonut(days, activeFilter);
      renderDaysList(days);
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
  if (isUploadMode) {
    visualFileLabel.textContent = VISUAL_FILE_LABELS[mode];
    visualFileInput.accept = mode === 'asset-vs-site' ? '.png,.jpg,.jpeg,.webp,.gif,.svg' : '.pdf,.png,.jpg,.jpeg,.webp,.gif,.svg';
  }
}

visualModeSelect.addEventListener('change', updateVisualWidgets);
updateVisualWidgets();

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
    const bLabel = usingCrop ? `${labels.b} — Close-up` : labels.b;

    const panes = [];
    if (sectionData.images.a) {
      panes.push(`
        <div class="visual-compare-pane">
          <span class="visual-pane-label">${escapeHtml(labels.a)}</span>
          <img src="${sectionData.images.a}" class="visual-compare-img" alt="${escapeHtml(labels.a)}" />
        </div>
      `);
    }
    if (bestSrc) {
      panes.push(`
        <div class="visual-compare-pane">
          <span class="visual-pane-label">${escapeHtml(bLabel)}</span>
          <img src="${bestSrc}" class="visual-compare-img" alt="${escapeHtml(bLabel)}" />
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
          const label = usingCrop
            ? (i === 0 ? 'Full page (uncropped)' : `Site frame ${i - 1}`)
            : `Site frame ${i}`;
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
      renderVisualResults(data);
    })
    .catch(() => {
      visualRunBtn.disabled = false;
      visualProgressBar.classList.remove('active');
      setStatus(visualStatusEl, 'Request failed', 'failed');
      renderVisualResults({ error: 'The request failed — check your connection and try again.' });
    });
});

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
