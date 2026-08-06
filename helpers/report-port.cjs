// Deterministic port for a given brand+GEO(s) key (same key -> same port
// every time), shared by playwright.config.ts (HTML reporter's own port
// option) and excel-reporter.cjs (the "Open Report.url" shortcut it drops
// next to the Excel file) so the two can never drift out of sync. Range
// 9323-9522 (200 slots) keeps it clear of Playwright's own 9323 default
// while making collisions across brand/GEO combos unlikely.
function portForKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return 9323 + (hash % 200);
}

module.exports = { portForKey };
