// Shared by playwright.config.ts, excel-reporter.cjs, and gui/server.ts so a
// run's token/timestamp always reflects the machine's own local wall clock,
// not UTC — confirmed live 2026-09-11: a combined-reports filename showing
// "06-20-23" for a run made at 2:20 PM local (UTC+8) read as flat-out wrong
// to whoever's browsing the folder, even though it was technically a valid
// instant. Every place that stamps a run with a time should look right next
// to the OS's own "Date modified" column.
function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// HH-mm-ss — the run token folded into excelReportFile (gui/server.ts) and
// PW_RUN_TOKEN (playwright.config.ts).
function localTimeToken(date = new Date()) {
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// YYYY-MM-DDTHH-mm-ss-SSS — same shape excel-reporter.cjs's xlsx filename
// timestamp always had, just built from local fields instead of
// new Date().toISOString().
function localTimestampToken(date = new Date()) {
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
  return `${datePart}T${timePart}`;
}

module.exports = { localTimeToken, localTimestampToken };
