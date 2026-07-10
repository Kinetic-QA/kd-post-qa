# CLAUDE.md — kd-post-qa Project Rules

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
- Format it ready to paste directly into Slack (short paragraphs/bullets, no raw markdown tables, sparing use of bold for emphasis)
- Cover: what changed today, why it matters, and anything the team should know or watch for (e.g. a pending finding, a decision made, next steps)
- Keep it tight — a few short bullets beat a wall of text
- If multiple sessions happen on the same date, append to that day's existing file rather than overwriting it
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
