# Playwright, Claude CLI, and VS Code — Who Does What

**Date:** 2026-08-11
**Purpose:** Plain-language explainer for the follow-up meeting — each tool's role, how they talk to each other, and how Claude CLI differs from the regular Claude app.

---

## 1. What are their respective roles

Easiest way to think about it: **three different jobs, but all three are working out of the exact same filing cabinet** (the project folder).

| Tool | What it is | What it does | What it does NOT do |
|---|---|---|---|
| **VS Code** | The editor/window where the project's files are open — like Word/Excel, but for code. | This is where Reeve views the files, reviews changes, reads code, and opens a terminal when needed. Basically the "window" into the project. | It doesn't run automated tests, and it doesn't edit code on its own — a person (or Claude CLI) still has to type/edit something. |
| **Claude CLI** | The AI agent that runs in the terminal, with direct access to the same project folder that's open in VS Code. | Reads and edits the actual files (test scripts, helper files, etc.), runs commands in the terminal (including running the Playwright checklist), reads the real results (pass/fail), and adjusts based on what actually happened. Can also commit/push to git. | It isn't a browser — it can't click or type on a real website by itself. It still needs Playwright to actually do that. |
| **Playwright** | The automation framework/tool that actually drives a real browser (like a person using Chrome, but automated). | Opens the real website, clicks buttons, fills out forms, records what happened (passed or failed), and produces the report (the Excel/HTML report we look at). | It can't think or decide what to test — it needs to be handed a script (the `.spec.ts` files) that tells it exactly what to do, step by step. |

### How do they "talk" to each other

This isn't three separate apps connected over the internet or through some API — it's simpler than that:

1. **Claude CLI and VS Code "talk" through the same folder on the computer.** When Claude CLI edits a file (say `feedback-form.spec.ts`), it literally saves that change to disk — so if that file is open in VS Code, the new content shows up right there, exactly as if another person had just edited it while you were looking.
2. **Claude CLI and Playwright talk through a terminal command.** When it's time to run the checklist, Claude CLI just runs the same command a person would type themselves (`npx playwright test`). Playwright is the one that opens the real browser, interacts with the site, and sends the results (pass/fail, error messages) back into that same terminal — that's what Claude CLI reads to know what happened.
3. **No manual copy-pasting in between.** Everything happens straight in the same shared project folder — so when we say "Claude CLI edited the test file," that's literally the same real file Playwright will use on the next run, and the same one you'd see in VS Code.

### How does Claude CLI put generated code into the actual project scripts

It's simple — **it writes directly into the same files the project actually uses**, it doesn't produce a "draft" that a person then has to copy and paste in:

- When something needs to change or be added, Claude CLI directly edits/saves the `.spec.ts` file inside the `tests/` folder (or a `.ts` helper file inside `helpers/`) — the same as if a person had typed it themselves in VS Code and hit save, just automated.
- Since these are plain text files, the change is "real" the moment it's saved — there's no separate step needed to "apply" the code to the project, saving it is the whole step.
- Once saved, Claude CLI can immediately run the full checklist using that new code, then read the results again — which is how it can do "edit → run → check if it worked → fix again if not" repeatedly in one sitting, with no person copy-pasting in between.

---

## 2. What is Claude CLI, and why is it better for coding than the regular Claude app

| | **Regular Claude App** (claude.ai or Claude desktop chat) | **Claude CLI** (Claude Code) |
|---|---|---|
| What it is | A chat window — you ask, it answers (including code snippets). | An agent that runs in the terminal on your own computer, sitting right inside the project folder. |
| Access to files | None — you have to paste a file's contents in for it to see it, and copy the answer back out yourself into your own file. | It can directly read and edit the real project files — no copy-pasting. |
| Running code/tests | Can't do it — it can only tell you what *should* happen; you still have to run it yourself and check if it worked. | Can actually run the Playwright checklist itself, read the real results (pass/fail/error), and adjust based on that — no guessing. |
| Git/commit/push | Can't do it — you have to do it yourself in your own terminal. | Can branch, commit, and push on its own, following the project's rules (e.g. the required CHANGELOG update before any push). |
| Project context | You have to re-explain the project's rules, coding standards, etc. every new conversation. | It can read the project's own files (CLAUDE.md, memory from previous sessions, git history) so it already knows the rules before it even starts. |

**Why the CLI is the better fit for actual coding work (like onboarding a new brand):**

The whole brand-onboarding process — covered in the earlier report — leans heavily on a "**try it, see what breaks, fix it, try again**" cycle. With the regular chat app, you'd have to:
1. Ask Claude for code,
2. Copy-paste it yourself into your own file,
3. Run the test yourself,
4. Copy-paste the error message back into the chat if it fails,
5. Repeat — one step at a time, all manual in between.

With the CLI, that entire 5-step loop becomes **one continuous process it runs on its own** — it edits the file, runs the checklist, reads the real results, and adjusts, all within a single ongoing session, with no person copy-pasting in the middle. This is exactly why full-day onboarding sessions (like Simba Games and Lucky Me Slots) were able to get 6+ fixes confirmed in a single day — because each "try → check → fix" cycle didn't need a manual hand-off in between.

**Bottom line:** the regular Claude app is great for quick questions or brainstorming ideas, but for actual "build it and prove it really works on the live site" work, you need a tool that can directly touch the project's files and run the real checks itself — that's what the CLI is built for.
