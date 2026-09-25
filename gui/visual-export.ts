// Self-contained PDF + Excel export for a Visual Check result — everything
// (report + full-size images) lands in one timestamped local folder, so it
// works entirely offline and stays portable if the whole folder is copied
// or zipped up for someone else. No results are persisted anywhere else by
// this feature (see the memoryStorage comment on the /visual-check route),
// so export always operates on the JSON the client already rendered, not on
// anything looked up server-side.
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { chromium } from '@playwright/test';

// Mirrors CAMPAIGN_SECTIONS in gui/public/app.js — kept in sync manually
// since one lives in browser JS and the other in server TS.
const CAMPAIGN_SECTIONS: { key: string; title: string }[] = [
  { key: 'banner', title: 'Banner' },
  { key: 'popup', title: 'Pop-up' },
  { key: 'tnc', title: 'Terms & Conditions' },
];

const PANE_LABELS: Record<string, { a: string; b: string }> = {
  'document-vs-site': { a: 'Reference Document', b: 'Live Site' },
  'asset-vs-site': { a: 'Uploaded Asset', b: 'Live Site' },
  'site-vs-site': { a: 'QA Site', b: 'Production Site' },
  'figma-vs-site': { a: 'Figma Mockup', b: 'Live Site' },
  banner: { a: 'Banner Image', b: 'Live Site' },
  popup: { a: 'Pop-up Image', b: 'Live Site' },
};

interface BreakdownRow {
  field: string;
  assetValue: string;
  siteValue: string;
  match: boolean;
}

interface Finding {
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  location: string;
}

interface SectionImages {
  a?: string | null;
  aText?: string | null;
  b?: (string | null)[] | string | null;
  bLabels?: string[] | null;
  matchCrop?: string | null;
}

interface SectionData {
  error?: string;
  status?: string;
  bestFrameIndex?: number;
  breakdown?: BreakdownRow[];
  findings?: Finding[];
  images?: SectionImages;
}

export interface VisualExportInput {
  mode: string;
  error?: string;
  status?: string;
  overallStatus?: string;
  model?: string;
  sections?: Record<string, SectionData>;
  [key: string]: unknown; // single-mode results are a flat SectionData shape
}

// A saved section ready for both exporters — same numeric/text fields the
// browser already has, plus real file paths (relative to the export folder)
// standing in for what used to be base64 data URLs.
interface SavedSection {
  key: string;
  title: string;
  labels: { a: string; b: string };
  status: string;
  breakdown: BreakdownRow[];
  findings: Finding[];
  aText: string | null;
  aImagePath: string | null;
  bImagePaths: string[];
  bLabels: string[] | null;
  bestFrameIndex: number;
  matchCropPath: string | null;
}

function decodeDataUrlToFile(dataUrl: string | null | undefined, outDir: string, name: string): string | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const ext = match[1].split('/')[1]?.replace('+xml', '') || 'png';
  const filename = `${name}.${ext}`;
  fs.writeFileSync(path.join(outDir, filename), Buffer.from(match[2], 'base64'));
  return filename; // relative to outDir/images/, joined by the caller
}

function statusLabel(status: string | undefined): string {
  const meta: Record<string, string> = {
    matched: 'Matched',
    not_matched: 'Not Matched',
    issue_found: 'Issue Found',
    no_issues_found: 'No Issues Found',
  };
  return meta[status ?? ''] || status || 'Unknown';
}

// Decodes every image in the result to real files under <outDir>/images/,
// and shapes each section into the flat, file-path-based form both
// buildPdfExport and buildExcelExport share.
export function saveExportImages(data: VisualExportInput, outDir: string): SavedSection[] {
  const imagesDir = path.join(outDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const rawSections: { key: string; title: string; section: SectionData }[] = [];
  if (data.mode === 'campaign-vs-site') {
    for (const { key, title } of CAMPAIGN_SECTIONS) {
      const section = data.sections?.[key];
      if (section) rawSections.push({ key, title, section });
    }
  } else {
    rawSections.push({ key: data.mode, title: '', section: data as SectionData });
  }

  return rawSections.map(({ key, title, section }) => {
    const images = section.images || {};
    const bArray = Array.isArray(images.b) ? images.b : images.b ? [images.b] : [];

    const aImagePath = decodeDataUrlToFile(images.a, imagesDir, `${key}-reference`);
    const bImagePaths = bArray
      .map((b, i) => decodeDataUrlToFile(b ?? null, imagesDir, `${key}-site-${i}`))
      .filter((p): p is string => !!p);
    const matchCropPath = decodeDataUrlToFile(images.matchCrop, imagesDir, `${key}-matchcrop`);

    return {
      key,
      title,
      labels: PANE_LABELS[key] || { a: 'Reference', b: 'Live Site' },
      status: section.status || (section.error ? 'error' : 'no_issues_found'),
      breakdown: section.breakdown || [],
      findings: section.findings || [],
      aText: images.aText || null,
      aImagePath,
      bImagePaths,
      bLabels: Array.isArray(images.bLabels) ? images.bLabels : null,
      bestFrameIndex: Number.isInteger(section.bestFrameIndex) ? (section.bestFrameIndex as number) : 0,
      matchCropPath,
    };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionHtml(s: SavedSection): string {
  let html = `<h2 class="visual-section-title">${escapeHtml(s.title || 'Comparison Result')}</h2>`;
  html += `<span class="status-pill visual-status-pill">${escapeHtml(statusLabel(s.status))}</span>`;

  const bestIndex = Math.min(s.bestFrameIndex, Math.max(0, s.bImagePaths.length - 1));
  const bestPath = s.matchCropPath || s.bImagePaths[bestIndex] || s.bImagePaths[0];
  const bLabel = s.matchCropPath
    ? `${s.labels.b} — Close-up`
    : (s.bLabels?.[bestIndex] ? `${s.labels.b} — ${s.bLabels[bestIndex]}` : s.labels.b);

  html += '<div class="visual-compare">';
  if (s.aImagePath) {
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(s.labels.a)}</span><a href="images/${s.aImagePath}"><img src="images/${s.aImagePath}" class="visual-compare-img" /></a></div>`;
  } else if (s.aText) {
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(s.labels.a)} (extracted text)</span><pre class="visual-compare-text">${escapeHtml(s.aText)}</pre></div>`;
  }
  if (bestPath) {
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(bLabel)}</span><a href="images/${bestPath}"><img src="images/${bestPath}" class="visual-compare-img" /></a></div>`;
  }
  html += '</div>';

  if (s.bImagePaths.length > 1) {
    html += '<div class="visual-extra-frames-body">';
    html += s.bImagePaths
      .map((p, i) => `<a href="images/${p}"><img src="images/${p}" class="visual-thumb" alt="${escapeHtml(s.bLabels?.[i] || `Site frame ${i}`)}" /></a>`)
      .join('');
    html += '</div>';
  }

  if (s.breakdown.length > 0) {
    html += `
      <table class="visual-breakdown-table">
        <thead><tr><th>Field</th><th>On Asset / Reference</th><th>On Site</th><th></th></tr></thead>
        <tbody>
          ${s.breakdown.map(row => `
            <tr>
              <td>${escapeHtml(row.field)}</td>
              <td>${escapeHtml(row.assetValue)}</td>
              <td>${escapeHtml(row.siteValue)}</td>
              <td>${row.match ? '✓' : '✗'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  if (s.findings.length > 0) {
    html += '<div class="visual-findings">';
    html += s.findings.map(f => `
      <div class="visual-finding">
        <span class="status-pill">${escapeHtml(f.severity.toUpperCase())}</span>
        <div class="visual-finding-body">
          <strong>${escapeHtml(f.title)}</strong>
          ${f.location ? `<span class="visual-finding-location">${escapeHtml(f.location)}</span>` : ''}
          <p>${escapeHtml(f.description)}</p>
        </div>
      </div>
    `).join('');
    html += '</div>';
  }

  return html;
}

// Inlines the GUI's own stylesheet so the exported report visually mirrors
// the on-screen results card instead of maintaining a second, drifting copy
// of these styles — only the handful of classes referenced above actually
// matter here, but pulling in the whole file is simpler and harmless (a
// static HTML file, not the live app).
function loadGuiStyles(): string {
  try {
    return fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
  } catch {
    return '';
  }
}

export function buildReportHtml(sections: SavedSection[], mode: string, model?: string): string {
  const body = sections.map(s => `<section class="visual-section">${sectionHtml(s)}</section>`).join('<hr/>');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${loadGuiStyles()}
body { background: #fff; padding: 24px; }
.visual-compare-img { max-width: 480px; max-height: 360px; object-fit: contain; border: 1px solid var(--border); }
.visual-thumb { max-width: 160px; max-height: 120px; margin: 4px; }
a { text-decoration: none; }
</style>
</head>
<body>
<h1>Visual Check Report — ${escapeHtml(mode)}</h1>
${body}
${model ? `<div class="visual-model-note">Powered by Claude (${escapeHtml(model)})</div>` : ''}
</body>
</html>`;
}

export async function buildPdfExport(sections: SavedSection[], mode: string, model: string | undefined, outDir: string): Promise<string> {
  const html = buildReportHtml(sections, mode, model);
  const pdfPath = path.join(outDir, 'visual-check-report.pdf');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // Written to disk first, then navigated to via file:// (rather than
    // page.setContent) so the report's own relative image/link paths
    // ("images/xxx.png") resolve against the export folder on disk instead
    // of a blank about: origin — needed for Playwright to actually
    // rasterize the images into the PDF, not just preserve them as broken
    // links.
    const htmlPath = path.join(outDir, 'index.html');
    fs.writeFileSync(htmlPath, html);
    await page.goto('file://' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.pdf({ path: pdfPath, printBackground: true, format: 'A4', margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
  } finally {
    await browser.close();
  }
  return pdfPath;
}

// exceljs's addImage only accepts these three raster formats — an asset
// reference can legitimately be svg/webp (Asset vs Site accepts both), which
// still gets its "View Full Size" hyperlink but no inline thumbnail.
function excelImageExtension(filename: string): 'jpeg' | 'png' | 'gif' | null {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === 'jpg') return 'jpeg';
  if (ext === 'jpeg' || ext === 'png' || ext === 'gif') return ext;
  return null;
}

const HEADER_FILL = 'FF1F3864';
const BORDER = { top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } }, left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } }, right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } } };

export async function buildExcelExport(sections: SavedSection[], mode: string, outDir: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Visual Check Report');
  ws.columns = [
    { width: 22 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 10 }, { width: 24 },
  ];

  let rowNum = 1;
  const writeHeaderRow = (values: string[]) => {
    const row = ws.getRow(rowNum);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.border = BORDER;
    });
    row.commit();
    rowNum += 1;
  };

  for (const s of sections) {
    const titleRow = ws.getRow(rowNum);
    titleRow.getCell(1).value = s.title || `Visual Check (${mode})`;
    titleRow.getCell(1).font = { name: 'Arial', bold: true, size: 13 };
    titleRow.getCell(3).value = `Status: ${statusLabel(s.status)}`;
    titleRow.getCell(3).font = { name: 'Arial', bold: true, size: 11 };
    titleRow.commit();
    rowNum += 2;

    if (s.aImagePath || s.bImagePaths.length > 0) {
      writeHeaderRow(['', s.labels.a, s.labels.b, 'View Full Size', '', '']);
      const imgRow = ws.getRow(rowNum);
      const bestIndex = Math.min(s.bestFrameIndex, Math.max(0, s.bImagePaths.length - 1));
      const bestPath = s.matchCropPath || s.bImagePaths[bestIndex] || s.bImagePaths[0];

      if (s.aImagePath) {
        const ext = excelImageExtension(s.aImagePath);
        if (ext) {
          const imgId = wb.addImage({ filename: path.join(outDir, 'images', s.aImagePath), extension: ext });
          ws.addImage(imgId, { tl: { col: 1, row: rowNum - 1 }, ext: { width: 160, height: 120 } });
        }
      }
      if (bestPath) {
        const ext = excelImageExtension(bestPath);
        if (ext) {
          const imgId = wb.addImage({ filename: path.join(outDir, 'images', bestPath), extension: ext });
          ws.addImage(imgId, { tl: { col: 2, row: rowNum - 1 }, ext: { width: 160, height: 120 } });
        }
        const linkCell = imgRow.getCell(4);
        linkCell.value = { text: 'View Full Size', hyperlink: `images/${bestPath}` };
        linkCell.font = { name: 'Arial', size: 10, underline: true, color: { argb: 'FF0563C1' } };
      }
      imgRow.height = 92;
      imgRow.commit();
      rowNum += 1;
    }

    if (s.breakdown.length > 0) {
      rowNum += 1;
      writeHeaderRow(['Field', 'On Asset / Reference', 'On Site', 'Match', '', '']);
      s.breakdown.forEach((b, idx) => {
        const row = ws.getRow(rowNum);
        const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
        [b.field, b.assetValue, b.siteValue, b.match ? 'Yes' : 'No'].forEach((v, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = v;
          cell.border = BORDER;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
        });
        row.commit();
        rowNum += 1;
      });
    }

    if (s.findings.length > 0) {
      rowNum += 1;
      writeHeaderRow(['Severity', 'Title', 'Location', 'Description', '', '']);
      s.findings.forEach((f, idx) => {
        const row = ws.getRow(rowNum);
        const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
        [f.severity.toUpperCase(), f.title, f.location, f.description].forEach((v, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = v;
          cell.border = BORDER;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
        });
        row.commit();
        rowNum += 1;
      });
    }

    rowNum += 2; // blank separator row(s) before next section
  }

  const xlsxPath = path.join(outDir, 'visual-check-report.xlsx');
  await wb.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}
