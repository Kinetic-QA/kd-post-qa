// Removes the "trace" attachment entry from every test result inside a
// Playwright HTML report's index.html, so the report's own UI never renders
// a Trace button/link for it in the first place — rather than leaving the
// button there to 404 when clicked, which is what happened before: trace
// .zip files are deliberately never uploaded to Netlify (see
// isTraceAttachment() in deploy-reports.cjs/deploy-dashboard.cjs, and
// feedback_no_trace_upload_to_netlify — video+screenshots are enough), but
// the report's embedded metadata still listed a trace attachment for every
// test, so the button appeared and looked clickable regardless.
//
// The report's test data isn't a plain JSON blob in the HTML — Playwright's
// HTML reporter zips one JSON file per spec file and embeds that zip as
// base64 inside a <template id="playwrightReportBase64"> tag (unzipped
// client-side via zip.js on load). This re-opens that embedded zip, strips
// every attachment object named "trace" (at any nesting depth — a step can
// have its own attachments, not just the top-level test result), and
// writes the edited zip back into the same template tag.
//
// Usage: require('./strip-trace-buttons.cjs').stripTraceButtons(indexHtmlPath)

const fs = require('fs');
const JSZip = require('jszip');

const TEMPLATE_RE = /(<template id="playwrightReportBase64"[^>]*>)([\s\S]*?)(<\/template>)/;

// Walks any nested object/array looking for "attachments" arrays (test
// results carry one directly, and so does every step/sub-step) and drops
// entries named "trace" from each one found.
function stripTraceAttachmentsDeep(node) {
  if (Array.isArray(node)) {
    for (const item of node) stripTraceAttachmentsDeep(item);
    return;
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.attachments)) {
      node.attachments = node.attachments.filter(a => a.name !== 'trace');
    }
    for (const value of Object.values(node)) stripTraceAttachmentsDeep(value);
  }
}

async function stripTraceButtons(indexHtmlPath) {
  const html = fs.readFileSync(indexHtmlPath, 'utf-8');
  const match = html.match(TEMPLATE_RE);
  if (!match) return false; // Not a Playwright HTML report (or a format this doesn't recognize) — leave untouched.

  const prefix = 'data:application/zip;base64,';
  if (!match[2].startsWith(prefix)) return false;
  const zipBuffer = Buffer.from(match[2].slice(prefix.length), 'base64');

  const zip = await JSZip.loadAsync(zipBuffer);
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith('.json')) continue;
    const text = await entry.async('string');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      continue; // Not JSON (shouldn't happen for this report format) — skip rather than corrupt it.
    }
    stripTraceAttachmentsDeep(data);
    zip.file(name, JSON.stringify(data));
  }

  const newZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const newContent = prefix + newZipBuffer.toString('base64');
  const newHtml = html.slice(0, match.index) + match[1] + newContent + match[3] + html.slice(match.index + match[0].length);
  fs.writeFileSync(indexHtmlPath, newHtml);
  return true;
}

module.exports = { stripTraceButtons };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node strip-trace-buttons.cjs <path-to-report-index.html>');
    process.exit(1);
  }
  stripTraceButtons(target).then(changed => {
    console.log(changed ? `Trace buttons stripped: ${target}` : `No report data found (left unchanged): ${target}`);
  });
}
