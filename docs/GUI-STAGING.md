# Staging GUI: try new ideas without touching the live GUI

The QA Test Center now has two copies, like a QA site and a live site:

| | Live | Staging |
|---|---|---|
| Folder | `QA-Test-Center` | `QA-Test-Center-Staging` (next to it) |
| Git branch | always a clean `main` | whatever idea is being built |
| GUI address | http://localhost:4848 | http://localhost:4949 (purple STAGING banner) |
| Start with | `npm run gui` | `npm run gui:staging` |
| Slack alerts | yes | **never** |
| Netlify uploads | yes | **never** |
| Jira writes (create, comment, move, assign, attach) | yes, after approval | **never** (reading is fine) |
| Test Reports / dashboard | its own | its own, separate |

Both folders share one git history, so branches, commits and pull requests work the same in both. Only the working files differ.

## The everyday flow

1. **Start an idea in staging.**
   `npm run staging:branch -- feature/my-idea --new`
   (starts a new branch from the latest `main`, inside the staging folder).
2. **Build it there.** Edit files in `QA-Test-Center-Staging`, not in the live folder.
3. **Try it.** `npm run gui:staging`, then open http://localhost:4949. Run tests, press Review, click around. Nothing you do posts anywhere.
4. **Happy with it?** End the day as usual ("That's it for today"): changelog, commit, push, pull request.
5. **Merge the pull request**, then update the live folder: `git pull --ff-only` there (it stays on `main`).
6. **Restart the live GUI.** The new feature is live.

The live GUI is never edited, never switched to a feature branch and never holds half-finished work.

## Commands

| Command | What it does |
|---|---|
| `npm run staging:setup` | One-time setup (already done once on this machine). Safe to run again. |
| `npm run gui:staging` | Starts the staging GUI on port 4949. |
| `npm run staging:status` | Shows both folders: branch, uncommitted files, whether each GUI is running, and a warning if the live folder is not on a clean `main`. |
| `npm run staging:branch -- <name> [--new]` | Moves the staging folder to another branch (`--new` creates it from `main`). Refuses if staging has uncommitted work. |

`npm run gui:staging -- --demo` also enables the local demo tests (`tests/p3/demo-*.spec.ts`). They fake a page, are kept out of git, and are skipped without this flag. Currently there is "Demo Raw Key Check", which shows the "Also noticed" block in Review.

`npm run gui:staging -- --allow-jira-writes` turns Jira writes **on** for that session (red banner). Only use it against a throwaway ticket, to test a feature that itself writes to Jira. Slack and Netlify stay off either way.

## How the safety works

- The staging folder holds a `.staging` marker file, and the launcher sets `STAGING=1`. Either one makes the GUI, the Jira client and the Netlify scripts refuse to write. Even a script run by hand from the staging folder refuses.
- The staging copy of `.env` is a copy of the live one (the API keys are needed for reading), but Slack and Netlify are switched off in code and by the launcher, whatever is in it.
- Staging never connects to the live GUI, its reports or its dashboard.

## Good to know

- Staging shares the live folder's installed packages (`node_modules`). If a new idea adds a package, run `npm install` once in the live folder.
- If a branch is checked out in the live folder, staging cannot use it. Switch the live folder back to `main` first.
- `npm run staging:status` warns when a branch's pull request has already been merged. New work then needs a new branch.
- Staging cannot give you a real website to test against. It is a second copy of the tool, not of the sites being tested.

## Moving work that is already in progress in the live folder

If the live folder is on a feature branch with uncommitted work (as it was when this was set up):

1. Finish and push that work as usual, so it is committed on its branch.
2. In the live folder: `git switch main`.
3. `npm run staging:branch -- <that-branch>` to carry on with it in staging.
