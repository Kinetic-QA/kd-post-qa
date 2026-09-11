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
    row.innerHTML = `
      <td class="brand-cell">${escapeHtml(b.brand)}</td>
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
  fetch('data.json', { cache: 'no-store' })
    .then(res => res.json())
    .then(({ stats, days, tests, brands, generatedAt, targetDate }) => {
      document.getElementById('stat-total-runs').textContent = stats.totalRuns;
      document.getElementById('stat-passed').textContent = stats.totalPassed;
      document.getElementById('stat-failed').textContent = stats.totalFailed;
      document.getElementById('stat-flaky').textContent = stats.totalFlaky;

      const noteEl = document.getElementById('last-run-note');
      noteEl.textContent = targetDate ? targetDate : '';

      const brandsNoteEl = document.getElementById('brands-note');
      if (brandsNoteEl) brandsNoteEl.textContent = `Every brand tested on ${targetDate || 'the latest run'}`;

      const generatedEl = document.getElementById('generated-note');
      if (generatedEl && targetDate) {
        generatedEl.textContent = `Last updated: ${targetDate}`;
      }

      allTests = tests;
      lastDays = days;
      if (activeFilter) renderDrilldown(activeFilter);

      renderTrendChart(days, activeFilter);
      renderStatusDonut(days, activeFilter);
      renderDaysList(days);
      renderBrandsTable(brands);
    });
}

loadDashboard();
