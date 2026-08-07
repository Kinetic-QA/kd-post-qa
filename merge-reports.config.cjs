// Used only by `npx playwright merge-reports` (invoked via merge-reports.cjs).
// That CLI command reads its output settings from a config file's own
// `reporter` array — CLI flags can only pick a reporter by name, not set its
// options — so this tiny config exists purely to hand it a real outputFolder
// via the MERGE_REPORT_OUTPUT env var that merge-reports.cjs sets before
// invoking it.
const outputFolder = process.env.MERGE_REPORT_OUTPUT || 'merged-html-report';

module.exports = {
  reporter: [['html', { outputFolder, open: 'never' }]],
};
