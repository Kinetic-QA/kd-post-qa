# Using RevWright — Quickstart for the QA Team

RevWright is our shared Claude agent for QA work on this repo. It already
knows our coding standards and site architecture (see `AGENT-STANDARDS.md` in
Project Knowledge) — this doc is just about how to actually work with it
day-to-day.

**RevWright (or Claude Code, for anyone working from the CLI) is the standard
AI coding tool for this repo.** Please don't use other AI coding assistants
(Cursor, Copilot, ChatGPT, etc.) to write or modify code here — different
tools don't know our conventions in `AGENT-STANDARDS.md`/`CLAUDE.md`, and
mixing them is how we'd end up with inconsistent selectors, test patterns,
and architecture across the suite. If you think another tool is genuinely
needed for something, raise it with Reeve first.

## What it does

- Writes and updates Playwright tests against our coding standards
  automatically (stable selectors, no flaky waits, independent tests, etc.)
- Can run the test suite for a GEO (UK, ES, etc.) or the whole thing
- Can walk a Jira ticket through our QA workflow (transition states, comment,
  approve)
- Updates `CHANGELOG.md` and pushes to a branch when a session wraps up

## Starting a session

Just describe what you need in plain language — "test the new banner on
mobile for UK," "run the whole suite for ES," "QA ticket SC-142." No special
syntax required.

## Things it will always do — don't be surprised

- **It will ask you for a Jira ticket key before touching Jira.** It never
  searches Jira on its own and picks a ticket to work on — that's
  intentional, so nothing gets acted on by accident.
- **If you ask it to test multiple GEOs in one go (e.g. "run UK and ES"),
  it will stop after the first GEO and ask you to switch your VPN/IP** before
  continuing to the next. This is because the site detects which country
  you're in by your real IP, not just a config setting — so it genuinely
  needs you to switch before the next GEO's results mean anything. Switch
  your VPN, then just tell it you're ready.
- **It never pushes to `main`.** Every session's work lands on a new branch
  (`feature/...`, `fix/...`, etc.) and needs a PR + review before merging.
- **Every push updates `CHANGELOG.md`** in plain language — check there for
  a quick summary of what changed in any given session.
- **When someone says "that's it for today,"** it wraps the session: updates
  the changelog, pushes the branch, and (for that person only, locally)
  drops a Slack-ready summary in `docs/updates/` — that folder is
  gitignored, so those summaries stay local and aren't something you'll see
  from teammates' sessions.

## Reviewing its work

Treat its output like any other PR — review the diff, check the CHANGELOG
entry makes sense, and confirm it followed the branch naming convention
before approving. Reeve merges PRs into `main`/`develop`.

## Something feels off?

If RevWright suggests something that contradicts these docs, or seems to have
outdated info about the site (e.g. treats an intentional behavior as a bug),
flag it — it might mean `AGENT-STANDARDS.md` needs an update. Bring it up
with Reeve, who owns keeping that file in sync.
