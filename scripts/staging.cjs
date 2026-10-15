// Staging copy of the QA Test Center - launcher. See docs/GUI-STAGING.md.
//
//   npm run staging:setup            one-time: create the staging copy next to the live folder
//   npm run gui:staging              start the staging GUI (port 4949) - never posts to Slack/Netlify/Jira
//                                    add  -- --demo  to enable the local demo tests
//   npm run staging:status           where live and staging are, and what is safe to do next
//   npm run staging:branch -- <name> [--new]   switch the staging copy to another branch
//
// The LIVE folder is the normal checkout (GUI on 4848) and stays on `main`. The
// STAGING folder is a git worktree of the same repository, so branches, commits and
// pull requests are shared - only the working files differ. Develop and try things
// in staging; once it works, merge the pull request and pull `main` in the live folder.

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const LIVE_PORT = 4848;
const DEFAULT_STAGING_PORT = 4949;
const DEFAULT_STAGING_BRANCH = 'staging/workbench';

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// The first entry `git worktree list` prints is always the original checkout -
// the live folder - no matter which copy this script was started from.
function locate() {
  const here = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!here.ok) fail('Run this from inside the QA Test Center folder.');
  const list = git(here.out, ['worktree', 'list', '--porcelain']);
  const first = list.out.split(/\r?\n/).find(l => l.startsWith('worktree '));
  const live = path.resolve(first.slice('worktree '.length));
  const staging = path.resolve(process.env.STAGING_DIR || `${live}-Staging`);
  return { live, staging };
}

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function portInUse(port) {
  return new Promise(resolve => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(1500, () => { s.destroy(); resolve(false); });
  });
}

const changedFiles = dir => git(dir, ['status', '--porcelain']).out.split(/\r?\n/).filter(Boolean).length;
const branchOf = dir => git(dir, ['branch', '--show-current']).out || '(detached)';

// ── setup ────────────────────────────────────────────────────────────────────
function setup() {
  const { live, staging } = locate();
  const branch = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : DEFAULT_STAGING_BRANCH;

  if (fs.existsSync(path.join(live, '.staging'))) {
    fail(`The LIVE folder (${live}) has a .staging marker file. Delete it - the live GUI must never be marked as staging.`);
  }

  if (!fs.existsSync(staging)) {
    const exists = git(live, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
    const args = exists
      ? ['worktree', 'add', staging, branch]
      : ['worktree', 'add', '--no-track', '-b', branch, staging, 'main'];
    const r = git(live, args);
    if (!r.ok) fail(`Could not create the staging copy: ${r.err}`);
    console.log(`OK: Created the staging copy at ${staging} on branch ${branch}`);
  } else {
    console.log(`- Staging copy already exists at ${staging} (branch ${branchOf(staging)})`);
  }

  // node_modules: one shared install via a junction (a folder link) - no second
  // multi-hundred-MB install, and it is always the same packages as live.
  const nm = path.join(staging, 'node_modules');
  if (!fs.existsSync(nm)) {
    if (!fs.existsSync(path.join(live, 'node_modules'))) fail('The live folder has no node_modules yet - run `npm install` there first.');
    fs.symlinkSync(path.join(live, 'node_modules'), nm, 'junction');
    console.log('OK: Linked node_modules to the live folder\'s install');
  }

  // .env: copied once. Staging switches Slack/Netlify off in code, whatever is in it.
  const env = path.join(staging, '.env');
  if (!fs.existsSync(env)) {
    if (fs.existsSync(path.join(live, '.env'))) {
      fs.copyFileSync(path.join(live, '.env'), env);
      console.log('OK: Copied .env (staging still blocks Slack, Netlify and Jira writes)');
    } else {
      console.log('! The live folder has no .env - staging will start without API keys.');
    }
  }

  // The marker is what makes a script run by hand from this folder refuse to
  // post anything. It is git-ignored, so it can never reach main.
  fs.writeFileSync(path.join(staging, '.staging'),
    'This folder is the STAGING copy of the QA Test Center.\nDo not delete: it stops anything run from here posting to Slack, Netlify or Jira.\nSee docs/GUI-STAGING.md.\n');
  console.log('OK: Wrote the .staging marker');

  console.log(`\nDone. Start it with:  npm run gui:staging\nOpen:                 http://localhost:${DEFAULT_STAGING_PORT}\n`);
}

// ── start ────────────────────────────────────────────────────────────────────
async function start() {
  const { live, staging } = locate();
  if (!fs.existsSync(path.join(staging, '.staging'))) fail('No staging copy yet. Run:  npm run staging:setup');

  const args = process.argv.slice(3);
  const allowJira = args.includes('--allow-jira-writes');
  // --demo turns on the local-only demo tests (tests/p3/demo-*.spec.ts), which fake a page and are skipped otherwise.
  const demo = args.includes('--demo');
  // --simulate-raw-key[=text] plants a raw content key (default content.alberta_comment) into the REAL
  // registration widget during real AB runs, so the "Also noticed" feature can be watched firing.
  const simArg = args.find(a => a === '--simulate-raw-key' || a.startsWith('--simulate-raw-key='));
  const simulate = simArg ? (simArg.split('=')[1] || 'content.alberta_comment') : '';
  const portArg = args.find(a => a.startsWith('--port='));
  const port = Number((portArg && portArg.split('=')[1]) || process.env.STAGING_PORT || DEFAULT_STAGING_PORT);
  if (!Number.isInteger(port) || port === LIVE_PORT) fail(`Staging needs its own port (not ${LIVE_PORT}, which is the live GUI).`);
  if (await portInUse(port)) fail(`Port ${port} is already in use - is the staging GUI already running?`);

  console.log(`\nSTAGING GUI - folder: ${staging}\n                 branch: ${branchOf(staging)}\n                 URL:    http://localhost:${port}`);
  console.log('Slack: OFF   Netlify: OFF   Jira writes: ' + (allowJira ? 'ON (you asked for this - use a throwaway ticket!)' : 'OFF') + '   Demo tests: ' + (demo ? 'ON' : 'off') + '   Simulated raw key: ' + (simulate ? `"${simulate}" (planted into real AB registration runs)` : 'off') + '\n');

  const env = {
    ...process.env,
    STAGING: '1',
    GUI_PORT: String(port),
    STAGING_ALLOW_JIRA_WRITES: allowJira ? '1' : '0',
    RAW_KEY_DEMO: demo ? '1' : '0',
    RAW_KEY_SIMULATE: simulate,
    // Belt and braces: even if a code path were missed, there is nothing to post with.
    // (Set to empty, not deleted - dotenv never overrides a variable that already exists.)
    SLACK_WEBHOOK_URL: '',
    NETLIFY_AUTH_TOKEN: '',
  };
  const child = spawn('npx ts-node gui/server.ts', { cwd: staging, env, stdio: 'inherit', shell: true });
  child.on('exit', code => process.exit(code ?? 0));
}

// ── status ───────────────────────────────────────────────────────────────────
async function status() {
  const { live, staging } = locate();
  const lines = [];
  const liveBranch = branchOf(live);
  const liveDirty = changedFiles(live);
  lines.push(`LIVE     ${live}`);
  lines.push(`         branch ${liveBranch}${liveBranch === 'main' ? '' : '   WARNING: not on main'}   uncommitted files: ${liveDirty}`);
  if (liveBranch !== 'main' || liveDirty > 0) {
    lines.push('         WARNING: Restarting the live GUI would load this folder as it is right now. Keep it on a clean main.');
  }
  lines.push(`         GUI on ${LIVE_PORT}: ${(await portInUse(LIVE_PORT)) ? 'running' : 'not running'}`);
  lines.push('');

  if (!fs.existsSync(staging)) {
    lines.push('STAGING  not set up yet - run:  npm run staging:setup');
  } else {
    const sb = branchOf(staging);
    const counts = git(staging, ['rev-list', '--left-right', '--count', `main...${sb}`]).out.split(/\s+/);
    lines.push(`STAGING  ${staging}`);
    lines.push(`         branch ${sb}   behind main: ${counts[0] ?? '?'}   ahead of main: ${counts[1] ?? '?'}   uncommitted files: ${changedFiles(staging)}`);
    lines.push(`         marker: ${fs.existsSync(path.join(staging, '.staging')) ? 'ok' : 'MISSING - run npm run staging:setup'}   node_modules: ${fs.existsSync(path.join(staging, 'node_modules')) ? 'ok' : 'MISSING'}   .env: ${fs.existsSync(path.join(staging, '.env')) ? 'ok' : 'MISSING'}`);
    lines.push(`         GUI on ${DEFAULT_STAGING_PORT}: ${(await portInUse(DEFAULT_STAGING_PORT)) ? 'running' : 'not running'}`);
    // Has this branch's pull request already been merged? New work then needs a new branch.
    const pr = spawnSync('gh', ['pr', 'list', '--state', 'all', '--head', sb, '--json', 'number,state', '--limit', '1'], { cwd: staging, encoding: 'utf8' });
    if (pr.status === 0) {
      try {
        const [p] = JSON.parse(pr.stdout || '[]');
        if (p) lines.push(`         pull request #${p.number}: ${p.state}${p.state === 'MERGED' ? '   WARNING: already merged - start new work on a new branch (npm run staging:branch -- <name> --new)' : ''}`);
      } catch { /* gh gave no JSON - skip */ }
    }
  }
  console.log('\n' + lines.join('\n') + '\n');
}

// ── branch ───────────────────────────────────────────────────────────────────
function branch() {
  const { staging } = locate();
  if (!fs.existsSync(staging)) fail('No staging copy yet. Run:  npm run staging:setup');
  const rest = process.argv.slice(3);
  const isNew = rest.includes('--new');
  const name = rest.find(a => !a.startsWith('--'));
  if (!name) fail('Give a branch name, e.g.  npm run staging:branch -- feature/my-idea --new');
  if (changedFiles(staging) > 0) fail('The staging copy has uncommitted changes. Commit or set them aside first, so two ideas never get mixed.');

  const r = isNew
    ? git(staging, ['switch', '--no-track', '-c', name, 'main'])
    : git(staging, ['switch', name]);
  if (!r.ok) {
    const hint = /already (checked out|used by worktree)/i.test(r.err)
      ? '\nThat branch is checked out in the live folder. Put the live folder back on main first (git switch main there).'
      : '';
    fail(`Could not switch: ${r.err}${hint}`);
  }
  console.log(`OK: Staging is now on ${name}${isNew ? ' (new, from main)' : ''}. Restart the staging GUI to load it.`);
}

const commands = { setup, start, status, branch };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log('Usage: node scripts/staging.cjs <setup | start | status | branch> - see docs/GUI-STAGING.md');
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch(e => fail(e.message));
