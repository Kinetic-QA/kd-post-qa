import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  file: string;
  test: string;
  status: string;
  duration_s: number;
  error: string;
}

function collectSpecs(suite: any, fileTitle: string): Array<{ file: string; spec: any }> {
  const results: Array<{ file: string; spec: any }> = [];
  for (const spec of suite.specs || []) {
    results.push({ file: fileTitle, spec });
  }
  for (const sub of suite.suites || []) {
    results.push(...collectSpecs(sub, fileTitle));
  }
  return results;
}

function flattenTests(data: any): TestResult[] {
  const rows: TestResult[] = [];
  for (const suite of data.suites || []) {
    const fileTitle = suite.title || '';
    const allSpecs = collectSpecs(suite, fileTitle);
    for (const { file, spec } of allSpecs) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          const errors = result.errors || [];
          const errorMsg = errors.length > 0
            ? (errors[0].message || '').replace(/\n/g, ' ').substring(0, 300)
            : '';
          rows.push({
            file,
            test: spec.title || '',
            status: result.status || 'unknown',
            duration_s: Math.round((result.duration || 0) / 100) / 10,
            error: errorMsg,
          });
        }
      }
    }
  }
  return rows;
}

async function generateExcelReport(rows: TestResult[], data: any): Promise<string> {
  // Dynamic import to avoid issues if exceljs not yet installed
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test Results');

  const total = rows.length;
  const passed = rows.filter(r => r.status === 'passed').length;
  const failed = rows.filter(r => ['failed', 'timedOut'].includes(r.status)).length;
  const skipped = rows.filter(r => r.status === 'skipped').length;

  let runDt = 'N/A';
  try {
    const startTime = data?.stats?.startTime;
    if (startTime) runDt = new Date(startTime).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {}

  const summary = [
    ['Run Date', runDt],
    ['Total Tests', total],
    ['Passed', passed],
    ['Failed', failed],
    ['Skipped', skipped],
    ['Pass Rate', total > 0 ? `${Math.round(passed / total * 1000) / 10}%` : '0%'],
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
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };
  });
  hr.height = 22;
  hr.commit();

  const statusColors: Record<string, string> = {
    passed: 'FF0070C0',
    failed: 'FFC00000',
    timedOut: 'FFC00000',
    skipped: 'FFFFC000',
  };
  const statusLabels: Record<string, string> = {
    passed: 'PASSED',
    failed: 'FAILED',
    timedOut: 'TIMED OUT',
    skipped: 'SKIPPED',
  };

  rows.forEach((r, idx) => {
    const rowNum = headerRow + 1 + idx;
    const dr = ws.getRow(rowNum);
    const isEven = idx % 2 === 0;
    const shade = isEven ? 'FFF2F2F2' : 'FFFFFFFF';
    const vals = [r.file, r.test, statusLabels[r.status] || r.status.toUpperCase(), r.duration_s, r.error];

    vals.forEach((val, ci) => {
      const cell = dr.getCell(ci + 1);
      cell.value = val;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
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

  ws.columns = [
    { width: 35 },
    { width: 45 },
    { width: 14 },
    { width: 14 },
    { width: 60 },
  ];

  ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outPath = path.join(__dirname, 'test-results', `test-report_${timestamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

async function globalTeardown() {
  const resultsPath = path.join(__dirname, 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) {
    console.log('\n[Report] No results.json found — skipping Excel report.');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    const rows = flattenTests(data);
    if (rows.length === 0) {
      console.log('\n[Report] No test rows found in results.json.');
      return;
    }
    const outPath = await generateExcelReport(rows, data);
    console.log(`\n[Report] Excel report saved: ${outPath}`);
  } catch (e) {
    console.error('\n[Report] Failed to generate Excel report:', e);
  }
}

export default globalTeardown;
