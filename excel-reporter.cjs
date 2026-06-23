const fs = require('fs');
const path = require('path');

class ExcelReporter {
  constructor() {
    this._results = [];
    this._startTime = null;
  }

  onBegin(config, suite) {
    this._startTime = new Date().toISOString();
    this._results = [];
    console.log('\n[Excel Reporter] Started — will generate report on completion.');
  }

  onTestEnd(test, result) {
    const titlePath = test.titlePath();
    const file = titlePath[1] || '';
    const testName = titlePath[titlePath.length - 1] || '';
    const errors = result.errors || [];
    const errorMsg = errors.length > 0
      ? (errors[0].message || '').replace(/\n/g, ' ').substring(0, 300)
      : '';
    this._results.push({
      file,
      test: testName,
      status: result.status,
      duration_s: Math.round(result.duration / 100) / 10,
      error: errorMsg,
    });
  }

  async onEnd(result) {
    const rows = this._results;
    if (rows.length === 0) {
      console.log('\n[Excel Reporter] No results to write.');
      return;
    }

    let ExcelJS;
    try {
      ExcelJS = require('exceljs');
    } catch (e) {
      console.error('\n[Excel Reporter] exceljs not found. Run: npm install');
      return;
    }

    const total = rows.length;
    const passed = rows.filter(r => r.status === 'passed').length;
    const failed = rows.filter(r => ['failed', 'timedOut'].includes(r.status)).length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? `${Math.round(passed / total * 1000) / 10}%` : '0%';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Test Results');

    const summary = [
      ['Run Date', new Date(this._startTime).toLocaleString()],
      ['Total Tests', total],
      ['Passed', passed],
      ['Failed', failed],
      ['Skipped', skipped],
      ['Pass Rate', passRate],
    ];

    summary.forEach(([label, value], i) => {
      const row = ws.getRow(i + 1);
      const lc = row.getCell(1);
      const vc = row.getCell(2);
      lc.value = label;
      lc.font = { name: 'Arial', bold: true, size: 11 };
      vc.value = value;
      if (label === 'Passed') vc.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF00B050' } };
      else if (label === 'Failed') vc.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFC00000' } };
      else vc.font = { name: 'Arial', size: 11 };
      row.commit();
    });

    const headerRow = summary.length + 2;
    const headers = ['Test File', 'Test Name', 'Status', 'Duration (s)', 'Error Message'];
    const hr = ws.getRow(headerRow);
    headers.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
    });
    hr.height = 22;
    hr.commit();

    const statusColors = { passed: 'FF0070C0', failed: 'FFC00000', timedOut: 'FFC00000', skipped: 'FFFFC000' };
    const statusLabels = { passed: 'PASSED', failed: 'FAILED', timedOut: 'TIMED OUT', skipped: 'SKIPPED' };

    rows.forEach((r, idx) => {
      const rowNum = headerRow + 1 + idx;
      const dr = ws.getRow(rowNum);
      const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
      const vals = [r.file, r.test, statusLabels[r.status] || r.status.toUpperCase(), r.duration_s, r.error];
      const border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
      vals.forEach((val, ci) => {
        const cell = dr.getCell(ci + 1);
        cell.value = val;
        cell.border = border;
        if (ci === 2) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[r.status] || 'FF808080' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.font = { name: 'Arial', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
          cell.alignment = { vertical: 'middle', wrapText: ci === 4 };
        }
      });
      dr.commit();
    });

    ws.columns = [{ width: 35 }, { width: 45 }, { width: 14 }, { width: 14 }, { width: 60 }];
    ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }];

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 23);

    const uniqueSuites = [...new Set(rows.map(r => r.file).filter(Boolean))];
    const baseName = uniqueSuites.length === 1
      ? uniqueSuites[0]
          .replace(/^(p[12]|sample)\s*[-–]\s*/i, '')  // strip "P1 - ", "P2 - ", "Sample - "
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      : 'all-tests';

    const outDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${baseName}_${timestamp}.xlsx`);
    await wb.xlsx.writeFile(outPath);
    console.log(`\n[Excel Reporter] Report saved: ${outPath}\n`);
  }
}

module.exports = ExcelReporter;
