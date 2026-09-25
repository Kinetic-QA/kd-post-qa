// Self-contained PDF + Excel export for a Visual Check result. The report is
// built in a throwaway temp folder (images are decoded there so Playwright /
// exceljs can embed them), then the single finished file is sent to the
// browser as a download and the temp folder is deleted — nothing is kept in
// the project folder. Because only that one file leaves the temp folder,
// "View Full Size" links point inside the file itself: a full-size page at
// the end of the PDF, or a "Full Size Images" sheet in the Excel workbook.
// No results are persisted anywhere else by this feature (see the
// memoryStorage comment on the /visual-check route), so export always
// operates on the JSON the client already rendered, not on anything looked
// up server-side.
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

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

// In-document anchor for an image's full-size page (see fullSizePagesHtml).
// Chromium keeps #anchor links as internal PDF links, so clicking jumps to
// the page inside the same file — works offline and when the PDF is shared.
function fullSizeAnchor(imagePath: string): string {
  return 'full-' + imagePath.replace(/[^a-zA-Z0-9-]/g, '-');
}

function linkedImg(imagePath: string, cls: string, alt = ''): string {
  return `<a href="#${fullSizeAnchor(imagePath)}"><img src="images/${imagePath}" class="${cls}" alt="${escapeHtml(alt)}" /></a>`;
}

function fullSizeLink(imagePath: string): string {
  return `<a class="full-size-link" href="#${fullSizeAnchor(imagePath)}">View Full Size</a>`;
}

// Every image shown in the report, in report order, with a caption — the
// source for the PDF's full-size pages and the Excel "Full Size Images" sheet.
function fullSizeImages(sections: SavedSection[]): { path: string; caption: string }[] {
  const seen = new Set<string>();
  const out: { path: string; caption: string }[] = [];
  const add = (p: string | null, caption: string) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push({ path: p, caption });
  };
  for (const s of sections) {
    const prefix = s.title ? `${s.title} — ` : '';
    add(s.aImagePath, prefix + s.labels.a);
    add(s.matchCropPath, `${prefix}${s.labels.b} — Close-up`);
    s.bImagePaths.forEach((p, i) => add(p, `${prefix}${s.labels.b}${s.bLabels?.[i] ? ` — ${s.bLabels[i]}` : ''}`));
  }
  return out;
}

// A4 content area at 96dpi, after the page.pdf margins and body padding
// below — used to cut tall images into page-sized slices.
const PDF_CONTENT_WIDTH_PX = 700;
const PDF_CONTENT_HEIGHT_PX = 1000;
const PDF_HEADING_PX = 60;

// Chromium won't split a tall image at a sensible point — it pushes the
// whole image to the next page (leaving its heading stranded) and then
// clips it. So each full-size image is cut into page-height slices first;
// the first slice leaves room for the heading. Returns slice filenames
// (relative to <outDir>/images/), or the original file if it already fits
// or isn't a format sharp can slice.
async function sliceForPdf(outDir: string, imagePath: string): Promise<string[]> {
  const file = path.join(outDir, 'images', imagePath);
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(file).metadata();
  } catch {
    return [imagePath];
  }
  if (!meta.width || !meta.height) return [imagePath];

  const pxPerCssPx = meta.width / PDF_CONTENT_WIDTH_PX;
  const firstHeight = Math.floor((PDF_CONTENT_HEIGHT_PX - PDF_HEADING_PX) * pxPerCssPx);
  const nextHeight = Math.floor(PDF_CONTENT_HEIGHT_PX * pxPerCssPx);
  if (meta.height <= firstHeight) return [imagePath];

  const slices: string[] = [];
  const base = path.parse(imagePath).name;
  for (let top = 0, i = 0; top < meta.height; i++) {
    const height = Math.min(i === 0 ? firstHeight : nextHeight, meta.height - top);
    const name = `${base}-slice-${i}.png`;
    await sharp(file).extract({ left: 0, top, width: meta.width, height }).png().toFile(path.join(outDir, 'images', name));
    slices.push(name);
    top += height;
  }
  return slices;
}

async function fullSizePagesHtml(sections: SavedSection[], outDir: string): Promise<string> {
  let html = '';
  for (const img of fullSizeImages(sections)) {
    const slices = await sliceForPdf(outDir, img.path);
    html += `
<section class="full-size-page" id="${fullSizeAnchor(img.path)}">
<h2>${escapeHtml(img.caption)}${slices.length > 1 ? ` <span class="full-size-parts">(${slices.length} pages)</span>` : ''}</h2>
${slices.map(sl => `<img src="images/${sl}" />`).join('')}
</section>`;
  }
  return html;
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
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(s.labels.a)}</span>${linkedImg(s.aImagePath, 'visual-compare-img')}${fullSizeLink(s.aImagePath)}</div>`;
  } else if (s.aText) {
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(s.labels.a)} (extracted text)</span><pre class="visual-compare-text">${escapeHtml(s.aText)}</pre></div>`;
  }
  if (bestPath) {
    html += `<div class="visual-compare-pane"><span class="visual-pane-label">${escapeHtml(bLabel)}</span>${linkedImg(bestPath, 'visual-compare-img')}${fullSizeLink(bestPath)}</div>`;
  }
  html += '</div>';

  if (s.bImagePaths.length > 1) {
    html += '<div class="visual-extra-frames-body">';
    html += s.bImagePaths
      .map((p, i) => linkedImg(p, 'visual-thumb', s.bLabels?.[i] || `Site frame ${i}`))
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

export async function buildReportHtml(sections: SavedSection[], mode: string, model: string | undefined, outDir: string): Promise<string> {
  const fullSizePages = await fullSizePagesHtml(sections, outDir);
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
.full-size-link { display: block; margin-top: 4px; font-size: 12px; color: #0563c1; text-decoration: underline; }
.full-size-page { break-before: page; }
.full-size-page h2 { height: 40px; margin: 0 0 12px; font-size: 16px; }
.full-size-parts { font-weight: normal; color: #666; font-size: 12px; }
.full-size-page img { display: block; width: 100%; height: auto; break-inside: avoid; }
</style>
</head>
<body>
<h1>Visual Check Report — ${escapeHtml(mode)}</h1>
${body}
${model ? `<div class="visual-model-note">Powered by Claude (${escapeHtml(model)})</div>` : ''}
${fullSizePages}
</body>
</html>`;
}

export async function buildPdfExport(sections: SavedSection[], mode: string, model: string | undefined, outDir: string): Promise<string> {
  const html = await buildReportHtml(sections, mode, model, outDir);
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
// gets no inline thumbnail in the Excel export (the PDF still shows it).
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
    { width: 22 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 24 },
  ];

  // Full-size images go on their own sheet, stacked vertically; each gets an
  // anchor row the main sheet's "View Full Size" links jump to.
  const fullWs = wb.addWorksheet('Full Size Images');
  fullWs.getColumn(1).width = 140;
  const FULL_WIDTH_PX = 1000;
  const ROW_PX = 20; // exceljs default row height (15pt)
  const fullSizeRow = new Map<string, number>();
  let fullRowNum = 1;
  for (const img of fullSizeImages(sections)) {
    const captionCell = fullWs.getRow(fullRowNum).getCell(1);
    captionCell.value = img.caption;
    captionCell.font = { name: 'Arial', bold: true, size: 12 };
    fullSizeRow.set(img.path, fullRowNum);
    fullRowNum += 1;

    const ext = excelImageExtension(img.path);
    const filename = path.join(outDir, 'images', img.path);
    if (!ext) {
      fullWs.getRow(fullRowNum).getCell(1).value = 'This image format cannot be embedded in Excel — see the PDF export.';
      fullRowNum += 2;
      continue;
    }
    const meta = await sharp(filename).metadata();
    const scale = Math.min(1, FULL_WIDTH_PX / (meta.width || FULL_WIDTH_PX));
    const width = Math.round((meta.width || FULL_WIDTH_PX) * scale);
    const height = Math.round((meta.height || 600) * scale);
    const imgId = wb.addImage({ filename, extension: ext });
    fullWs.addImage(imgId, { tl: { col: 0, row: fullRowNum - 1 }, ext: { width, height } });
    fullRowNum += Math.ceil(height / ROW_PX) + 2;
  }
  const fullSizeCell = (imagePath: string, text: string): ExcelJS.CellValue => ({
    text,
    hyperlink: `#'Full Size Images'!A${fullSizeRow.get(imagePath) ?? 1}`,
  });

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
        const linkCell = imgRow.getCell(5);
        linkCell.value = fullSizeCell(s.aImagePath, `${s.labels.a} (full size)`);
        linkCell.font = { name: 'Arial', size: 10, underline: true, color: { argb: 'FF0563C1' } };
      }
      if (bestPath) {
        const ext = excelImageExtension(bestPath);
        if (ext) {
          const imgId = wb.addImage({ filename: path.join(outDir, 'images', bestPath), extension: ext });
          ws.addImage(imgId, { tl: { col: 2, row: rowNum - 1 }, ext: { width: 160, height: 120 } });
        }
        const linkCell = imgRow.getCell(4);
        linkCell.value = fullSizeCell(bestPath, `${s.labels.b} (full size)`);
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
