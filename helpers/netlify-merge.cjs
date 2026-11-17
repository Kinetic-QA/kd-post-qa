// Publishes a folder to a Netlify site WITHOUT removing what is already live.
//
// `netlify deploy --dir X` makes the site exactly equal to X, so an upload from
// a laptop that doesn't hold every earlier run silently wipes those runs from
// the public site (2026-11-13: an upload from the second laptop removed the
// 10-29..10-31 ES runs). Here the new deploy is "every file currently live,
// plus/over-written by every file in X": the live file list comes from the
// Netlify API, the new folder's files overlay it, and Netlify is only sent the
// files it doesn't already have.
//
// Netlify lowercases every published path (and 301-redirects mixed-case URLs to
// the lowercase one), so paths are compared lowercase here too.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.netlify.com/api/v1';

async function api(token, method, urlPath, { json, body } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Netlify ${method} ${urlPath} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const toKey = rel => '/' + rel.split(path.sep).join('/').replace(/^\/+/, '').toLowerCase();

function sha1OfFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push({ abs, key: toKey(path.relative(base, abs)) });
  }
  return out;
}

// path (lowercase, leading slash) -> sha1 of everything the site serves right now.
async function listLiveFiles(token, siteId) {
  const files = await api(token, 'GET', `/sites/${siteId}/files`);
  return new Map(files.map(f => [String(f.path).toLowerCase(), f.sha]));
}

// dropPrefixes: live paths under these (e.g. "/reports/sc/2026-11-13/uk/") are
// removed first, so a re-uploaded report folder doesn't keep stale leftovers.
// include(key): optional filter on the folder's files (key = lowercase path with a
// leading slash) — used to leave stale leftovers of old uploads out of the deploy.
async function mergeDeploy({ token, siteId, dir, dropPrefixes = [], include = () => true, dryRun = false, log = console.log }) {
  const live = await listLiveFiles(token, siteId);
  const prefixes = dropPrefixes.map(p => p.toLowerCase());
  const merged = new Map();
  let dropped = 0;
  for (const [p, sha] of live) {
    if (prefixes.some(pre => p.startsWith(pre))) { dropped++; continue; }
    merged.set(p, sha);
  }

  const local = new Map(); // key -> { abs, sha }
  const clashes = [];
  for (const f of walk(dir)) {
    if (!include(f.key)) continue;
    if (local.has(f.key)) { clashes.push(f.key); continue; }
    local.set(f.key, { abs: f.abs, sha: null });
  }
  for (const [key, entry] of local) entry.sha = await sha1OfFile(entry.abs);

  let added = 0, replaced = 0;
  for (const [key, { sha }] of local) {
    if (!merged.has(key)) added++;
    else if (merged.get(key) !== sha) replaced++;
    merged.set(key, sha);
  }
  const summary = {
    liveFiles: live.size, dropped, localFiles: local.size, added, replaced,
    keptFromLive: [...merged.keys()].filter(k => !local.has(k)).length,
    totalAfter: merged.size, clashes,
  };
  log(`Merge plan: ${summary.liveFiles} live files, ${summary.localFiles} from this machine ` +
    `(${added} new, ${replaced} changed), ${summary.keptFromLive} kept from live -> ${summary.totalAfter} files after deploy.`);
  if (clashes.length) log(`  (${clashes.length} files differed only by letter case and were skipped)`);
  if (dryRun) return { summary, merged, dryRun: true };

  const files = Object.fromEntries(merged);
  const deploy = await api(token, 'POST', `/sites/${siteId}/deploys`, { json: { files } });
  const required = new Set(deploy.required || []);
  log(`Netlify needs ${required.size} file(s) uploaded.`);

  const pathBySha = new Map();
  for (const [key, { sha }] of local) if (required.has(sha) && !pathBySha.has(sha)) pathBySha.set(sha, key);
  const missing = [...required].filter(s => !pathBySha.has(s));
  if (missing.length) throw new Error(`Netlify asked for ${missing.length} file(s) that aren't in the folder being uploaded; aborting (nothing went live).`);

  const queue = [...pathBySha.entries()];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const [sha, key] = queue.shift();
      const rel = key.replace(/^\//, '').split('/').map(encodeURIComponent).join('/');
      await api(token, 'PUT', `/deploys/${deploy.id}/files/${rel}`, { body: fs.readFileSync(local.get(key).abs) });
      done++;
      if (done % 200 === 0) log(`  uploaded ${done}/${pathBySha.size}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const deadline = Date.now() + 10 * 60 * 1000;
  let state = deploy;
  while (state.state !== 'ready') {
    if (state.state === 'error') throw new Error(`Netlify deploy ${deploy.id} failed: ${state.error_message || 'unknown error'}`);
    if (Date.now() > deadline) throw new Error(`Netlify deploy ${deploy.id} did not become ready in 10 minutes.`);
    await new Promise(r => setTimeout(r, 3000));
    state = await api(token, 'GET', `/deploys/${deploy.id}`);
  }
  return { summary, deploy: state };
}

module.exports = { mergeDeploy, listLiveFiles };
