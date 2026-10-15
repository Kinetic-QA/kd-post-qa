// "Are we the STAGING copy of the QA Test Center?" — one definition, used by the
// GUI server, the Jira client and the Netlify deploy scripts so none of them can
// disagree. See docs/GUI-STAGING.md.
//
// A copy counts as staging when EITHER:
//   - STAGING=1 is in the environment (set by `npm run gui:staging`), or
//   - a `.staging` marker file sits in this copy's root folder (written once by
//     `npm run staging:setup`, never committed). The marker is what protects a
//     script run by hand from the staging folder, where nobody set STAGING=1.
//
// Staging never writes to the outside world: no Slack posts, no Netlify uploads,
// no Jira writes (create / comment / transition / assign / attach). Jira writes
// can be switched on deliberately with `--allow-jira-writes` (STAGING_ALLOW_JIRA_WRITES=1)
// to test against a throwaway ticket. Reading from Jira/Confluence is always fine.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function isStaging() {
  return process.env.STAGING === '1' || fs.existsSync(path.join(ROOT, '.staging'));
}

function jiraWritesAllowedInStaging() {
  return process.env.STAGING_ALLOW_JIRA_WRITES === '1';
}

// Plain-language reason shown to whoever hit the block.
function stagingBlockMessage(action, hint) {
  return `Blocked in the STAGING copy: ${action}. Staging never posts to Slack, uploads to Netlify or writes to Jira.` +
    (hint ? ` ${hint}` : ' Do this from the live GUI once the change has been merged.');
}

module.exports = { isStaging, jiraWritesAllowedInStaging, stagingBlockMessage, ROOT };
