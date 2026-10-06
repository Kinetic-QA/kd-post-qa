# CLAUDE.md — kd-post-qa Project Rules

## Session Start Trigger

When the user says **"Let's begin"** (or a clear variant of it), get fully up to date **before any work starts**. Do both halves, in order, and report back before touching the day's task:

**1. Sync the repo — look first, change nothing until it's safe**
- Run `git fetch origin`, then report: current branch, whether the working tree is clean, how far the branch is ahead/behind its remote, and whether `main` has moved on since this branch was cut.
- Only fast-forward (`git pull --ff-only`) when it is clearly safe: working tree clean **and** no local-only commits. If the tree is dirty, the branch has diverged, or it's a feature branch with unpushed work, do **not** pull, merge, rebase, stash or switch branches on your own — say what you found and ask.
- Check whether the current branch's PR was already merged (`gh pr list --state all --head <branch>`). If it was, say so — new work goes on a new branch (see Branch Rules).
- Mention leftover uncommitted files or stashes from the last session so nothing gets forgotten.

**2. Read the latest Confluence updates (QA Knowledge Base, space `QKB`)**
- Confluence is the source of truth for QA standards. Where it disagrees with a local doc or an older memory, **Confluence wins** — re-read the page, never rely on a remembered copy.
- Find what changed since the last time this ran: search with CQL `space = QKB AND type = page AND lastmodified >= "<date>" ORDER BY lastmodified DESC`. Use the last-sync date saved in memory; if none is saved, use the last 7 days.
- **Read in full** every changed page among these core standards, and always check their last-modified time even if unchanged:
  - QA Reporting Protocols & Guidelines 2026 (`281935875`)
  - Bug Ticket Standard (`291209218`)
  - QA Lessons — Standing Rules (`282001429`)
  - QA Role & Working Conventions (`281739267`)
  - Kinetic Digital — Brands & GEO Mapping (`281870363`)
  - QA Test Intake Workflow (`298385411` — a draft; treat as guidance, not settled rule)
- Any other changed page (test-cycle write-ups, release summaries, etc.): just list title, author and date — read it only if it looks like a standard, rule, protocol or workflow, or the user asks.
- When fetching long pages, request the full text — the shared Confluence client cuts pages at 8,000 characters by default (`getConfluencePageText(id, undefined, 60000)`).
- If a changed core page affects the hard-coded checks in `gui/jira-ticket.ts`, tell the user — and only after re-reading the page and updating those checks, bump `CHECKS_WRITTEN_AGAINST` in that file. (The Jira popup also warns on its own when any of those pages has been edited since the checks were written; never bump the number without actually updating the checks, or the warning is silenced for nothing.)
- Afterwards, save today's date in memory as the new last-sync date.

**3. Report back — short and in plain language**
- Repo: branch, clean or dirty, ahead/behind, and what (if anything) was pulled.
- Confluence: what changed — rules added, changed or reversed — and whether any of it affects code we've already written (for example the checks in `gui/jira-ticket.ts`, which hard-code Bug Ticket Standard rules). If nothing changed, say so.
- Then ask what we're working on.

Ground rules: this is **read-only** — never write to Jira or Confluence, never push, never discard local changes. If Confluence or `git fetch` can't be reached, say so plainly instead of silently skipping that half.

---

## Test Results Upload Trigger

When the user says **"Done Today's test"** (or a clear variant of it), automatically upload today's GUI test results to the QA Automated Regression Results Netlify site — the user should not have to name a brand or run any commands themselves:

1. Run `node upload-todays-results.cjs` (or `npm run upload-results`) from the repo root.
2. This script auto-detects which brand(s) actually have a `Test Reports/<brand>/<geo>/<today's date>/` folder — i.e. whatever was actually run in the GUI today — rebuilds the dashboard's data snapshot, and deploys the overview plus each detected brand's per-GEO reports to Netlify.
3. Report back to the user which brand(s) were uploaded and the live URL(s) (the overview is always `https://qa-automated-regression-results.netlify.app`).
4. If the script reports no brands found for today's date, tell the user rather than silently doing nothing — it likely means the run used a different date, or hasn't finished writing its report yet.

See `docs/AUTO-UPLOAD-SYSTEM.md` for full detail on how this works.

This is a separate trigger from the Push Trigger below — "Done Today's test" only uploads results to Netlify and does not touch git or CHANGELOG.md.

---

## Push Trigger
When the user says **"That's it for today"**, execute the full end-of-session push:
1. Update CHANGELOG.md (see rules below)
2. Create a new branch — never push to `main` directly
3. Stage, commit, and push
4. After the push succeeds, create a Slack-ready update doc (see rules below)

---

## Slack Update Doc Rules

After every end-of-session push, create a new file at `docs/updates/YYYY-MM-DD-update.md` (today's date) summarizing the session for a non-technical Slack audience.

**How to write it:**
- Same plain layman's-terms voice as CHANGELOG.md — no dev jargon, write for teammates who don't code
- **Format (checklist, as of 2026-09-28):** two sections, each headed with a 🗓️ + bold label, checkbox items below (`- [ ] item`):
  - **Today :** what was actually accomplished/verified this session, one short plain-language line per item
  - **Tomorrow :** the concrete next items planned for the following session
- No raw markdown tables, sparing use of bold for emphasis, ready to paste directly into Slack as-is
- Keep it tight — a few short checklist items beat a wall of text
- If multiple sessions happen on the same date, append to that day's existing file rather than overwriting it (add any new items under the existing Today/Tomorrow lists rather than starting a duplicate set of headers)
- **Local-only — never commit this file.** `docs/updates/` is gitignored on purpose; these drafts stay on the user's machine for copy-pasting into Slack and are not part of repo history.

---

## CHANGELOG.md Rules

Every push **must** include a CHANGELOG.md update. The CI will hard-block any PR that skips it.

**How to write it:**
- Use **plain layman's terms** — write for team members who are not developers
- Always include **today's date** in `YYYY-MM-DD` format on the `## [Unreleased]` heading
- Add entries under the correct section: `### Added`, `### Changed`, `### Fixed`, `### Removed`
- One bullet per change — be specific about what was broken and what was done
- Never use jargon like "null coalescing", "refactored", "hotfix" — say what the user sees change

**Good example:**
```
## [Unreleased] - 2026-06-25

### Fixed
- **Screenshots now save to the correct folder** — Evidence screenshots were being written to a
  folder called `playwright-results/` that never existed. They now go into `test-results/`.
```

---

## Branch Rules (STRICT)

- **NEVER push directly to `main`**
- Every push must go to a new branch:
  - New test or feature → `feature/<short-name>`
  - Bug fix → `fix/<short-name>`
  - Config/tooling → `chore/<short-name>`
  - Refactor → `refactor/<short-name>`
- Branch off `develop` when it exists, otherwise off `main`
- Push with: `git push -u origin <branch-name>`

---

## AGENT-STANDARDS.md Sync Rule

`AGENT-STANDARDS.md` is the team-wide knowledge base uploaded to the RevWright
Claude Project's Project Knowledge, so every teammate (on claude.ai or CLI)
codes from the same standards. Project Knowledge does not auto-sync with git.

- If a PR modifies `AGENT-STANDARDS.md`, review that diff like any other code
  change before merging.
- After merging any PR that changed `AGENT-STANDARDS.md` to `main`/`develop`,
  the merger (currently Reeve) re-uploads the merged version to RevWright's
  Project Knowledge, replacing the previous file.
- This is not a per-session or per-push step — only when the file itself
  actually changed. Check `git log -- AGENT-STANDARDS.md` if unsure whether
  the uploaded copy is behind.

---

## Coding Standards (from CONTRIBUTING.md)

- TypeScript strict mode — no `any` unless truly necessary
- Selectors: stable only (`data-testid`, ARIA roles, visible text) — no dynamic IDs or CSS classes
- No `page.waitForTimeout()` in test files
- Assertions must prove real business behaviour, not just element existence
- Reusable logic goes in `helpers/common.ts`
- Each test must be independently runnable — no shared state between tests
- No `console.log` or debug artifacts in committed code

---

## Commit Message Format

```
<type>: <short description>
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`
