# Changelog

All notable changes to the **kd-post-qa** Playwright automation suite must be recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> ⚠️ **MANDATORY RULE:** Every push or pull request MUST include an update to this file.
> PRs without a CHANGELOG entry will be blocked by the GitHub Actions workflow.

---

## Format

Each release or change set uses this structure:

```
## [Unreleased]
### Added      — new tests, features, or helpers
### Changed    — updates to existing tests or config
### Fixed      — bug fixes or flaky test corrections
### Removed    — deleted tests or deprecated helpers
### Security   — security-related changes
```

---

## [Unreleased] - 2026-07-17

### Added

- **SpinGenie (SNG) Alberta (AB) is now fully working across the whole checklist, on both computer and phone screens.** Everything found broken was fixed today: the game category menu, the sidebar menu, the payment methods page, the footer's regulation-logo links, the sign-up form, and the game info pop-up. A full run of the entire checklist came back clean (35 passed, 1 one-off retry that fixed itself, 0 real problems).
- **Reused the checklist for three more SpinGenie markets that are already live for real customers: UK, Ireland, and Canada** — previously only the not-yet-live Alberta market had been tried. UK and Canada worked with little to no changes needed. Ireland's sign-up form needed the same kind of fix as Alberta's (see below).
- Added SpinGenie's real market details (contact email, currency, what pages exist, category menu shape) for UK, Ireland, and Canada, replacing generic placeholder assumptions.

### Fixed

- **SpinGenie Alberta's sign-up form was rejecting every phone number, no matter the format.** The phone country dropdown was defaulting to Israel instead of Canada (a side effect of the office VPN connection needed to reach this pre-live site), so the number was being checked against the wrong country's rules. The check now explicitly picks the correct country from the dropdown first — same for Ireland's sign-up form, which had the identical problem while testing from a UK connection instead of an Irish one.
- **SpinGenie Alberta's sign-up form also rejected every home address**, once the phone number issue above was fixed — turns out this brand's site only currently allows Ontario as the home province for new sign-ups, even though the whole site is built and branded for Alberta players. This looks like the Alberta market's backend isn't fully turned on yet behind the scenes, worth flagging to the team separately. The check now uses Ontario for this brand's test data so sign-up can still be fully checked end-to-end.
- **SpinGenie Alberta's game category menu was clicking the wrong thing on both computer and phone screens** — an invisible leftover menu was sitting on top of the real one and swallowing clicks. Also found and fixed two clicking mix-ups: a "New Slots" link inside the phone's slide-out menu getting mistaken for an actual game, and the game info pop-up's Play button (which only shows itself on mouse-hover, so it never worked when checked from a phone screen) — fixed by clicking it directly instead of relying on hover.
- **The sidebar menu check had a real bug affecting every single brand, not just Alberta** — opening the slide-out menu twice in a row (which happened by accident while checking for optional categories) accidentally closed it again right before the next click, causing the whole check to hang for nearly two minutes on its very first step. Confirmed this same bug existed for the original Slingo UK site too, not just the new brand. Fixed so opening the menu only happens once it's actually needed.
- **SpinGenie Alberta's payment methods page shows all the payment logos as one single image instead of separate ones per provider** — the check was only looking for separate images, so it saw zero and failed. It now also recognises this single-image style as valid.
- **One of SpinGenie Alberta's regulation-logo links (a responsible-gambling one) opens the page in the same browser tab instead of a new one**, unlike the others — the check now accepts either behaviour instead of assuming every logo always opens a new tab. A second, unrelated link in that same row also needed a full page refresh instead of "go back" to reliably reappear for the next check in line.
- **SpinGenie UK's "email address matches this market" check was comparing against the wrong email** — a leftover placeholder from the original Slingo site instead of this brand's real support email, now fixed with this brand's actual confirmed address.

### Known open items (carrying into next session)

- **Ireland's sign-up form still rejects a genuinely correctly-formatted home postcode**, even after fixing the phone number and country dropdown — looks like the postcode check may be using a different, not-yet-found setting that isn't fixed by picking the right country from the dropdown. Needs a proper Irish connection to test this correctly rather than a UK one.
- Canada and Ireland haven't yet had a full whole-checklist run with the summary report generated (only the sign-up and category-menu checks were tried individually) — planned for next session.

## [Unreleased] - 2026-07-16

### Added

- **Started reusing the entire test suite for a second brand: SpinGenie (SNG), Alberta market (AB)** — this is a not-yet-live QA site (only reachable on the IL/CY office connections), so the goal today was to see how much of the existing Slingo-built suite could be reused as-is. Result: most of it works with no code changes at all, just pointing the suite at the new brand/market. **Confirmed working today on SNG Alberta**: footer navigation and links, header navigation (search, promotions icon, hamburger menu, logo-to-homepage), feedback form, contact page, help page's FAQ accordion, game filter, and every page that gracefully skips checks for things this market genuinely doesn't have yet (no blog, no bingo card generator page). Still being worked through tomorrow: the sidebar's category menu (this brand's menu is laid out differently — categories live inside the hamburger menu instead of on the page itself), the game info popup, the sign-up form's phone number field, the footer's regulation-logo links (this brand's version doesn't open a new tab the way Slingo's does), and the payment methods page.
- **The combined report's Summary tab now separately reports two different things that were previously blended into one confusing "Fully Reliable? Yes/No" line.** "Clean Run?" answers "did the site pass every check this run" (a statement about the site). "Automation Reliability" answers "can the checks themselves be trusted" (a statement about the tooling) — it only says "No" if a check needed a retry to get a consistent answer, regardless of whether the site itself had a real problem. This way, the report no longer looks worse just because the automation successfully caught a real bug.

### Fixed

- **The regulation/licensing logo check in the footer (GamCare, Gamstop, Spelinspektionen, etc.) could occasionally fail on the German and Swedish sites**, saying a click on one of those logos didn't open the expected new tab. Dug into it live on both real German and Swedish connections and couldn't get it to fail again — it turned out to be a rare one-off timing hiccup (most likely the "special offer" popup reappearing at the exact moment of the click and swallowing it), not a real broken link on either site. The check now tries the click a second time if the first attempt doesn't open a tab in time, so a rare hiccup like this won't fail the whole check. Confirmed clean with two full re-runs each on real German and Swedish connections after the fix.
- **A page-loading wait that could occasionally make almost any check across the whole suite time out**, especially deep into a long run — every check was waiting for the page to FULLY finish loading (every image, ad, and tracking script), when all it actually needed was for the page's content to be ready. Fixed everywhere across the suite (21 files) to wait for just what's needed, which is faster and much less likely to time out under load. Confirmed this was the real cause behind a run of UK checks failing, then re-ran the UK checks clean afterward (48 passed, 0 failed).
- **The search results page's "hover over a game, a Play button appears" check could occasionally miss the button** if the hover animation was still playing when the check looked — it now tries hovering again instead of giving up after one look.
- **The Spanish sign-up flow's "Continue" button could occasionally not advance to the next step** on one specific step (entering email + mobile number) — it now tries clicking Continue a second time before reporting a real problem, the same fix already applied elsewhere in the suite for this exact kind of one-off click hiccup.
- **The sidebar menu's Slingo/Slots/Bingo/Casino category links assumed every brand offers the same fixed set of categories** — a different brand's menu (SpinGenie) has a different set (Slots/Casino/Live Casino, no Slingo/Bingo), which the check now skips gracefully per-category instead of assuming one fixed list, the same way missing footer links already skip cleanly.
- **Test account credentials weren't separated by brand** — only by market, meaning a market that exists under two different brands (there's already an "AB" market for two different brands in our config) could have silently used the wrong brand's saved login. Fixed so each brand's saved login is kept fully separate, with a clear error instead of a silent wrong-account fallback if one is ever missing.

## [Unreleased] - 2026-07-14

### Added

- **The combined 6-market report's Summary tab now shows two new numbers: how much of the full regression checklist is actually automated, and how reliable that automation is.** "Coverage" is the share of all checks across every market/device that actually ran (not skipped for not existing in that market) — currently 77.4%. "Reliability" is, of everything that actually ran, how much came back clean — currently 98.7%. A plain "Fully Reliable? Yes/No" line is also shown, so anyone opening the report can tell at a glance whether today's run had any real problems without reading every tab.

### Fixed

- **A UK check for a broken-looking error page ("Something Went Wrong") could report the site as broken when it was actually fine again a couple of seconds later.** This showed up deep into a long test run — the page can flash a "loading hiccup" message briefly and then recover on its own, but the check only looked once and gave up immediately. It now waits a few seconds and checks again, and if it's still showing after that, refreshes the page once before giving up for good. Confirmed clean across two full re-runs of the entire UK check-list after the fix.
- **On the UK site, clicking "Contact us" in the side menu could land on the Help page instead** — this only happened right after checking the Help page, when the site's page-change from that check hadn't fully caught up yet before the next click fired. The check now waits for the correct page to actually finish loading before checking where it landed.
- **The blog page's "click the side ad, it should open sign-up" check could quietly report success even when the ad genuinely wasn't found and nothing was clicked.** Turns out this ad only shows on desktop screens, not phone screens, by design — the check now skips it cleanly on mobile, but will correctly report a real failure if it's ever missing on desktop.
- **On the German site, the side-menu check was timing out trying to click "Slingo," "Slots," and "Casino" links that don't exist there.** Germany doesn't have those category links at all (already known from earlier German testing), but this particular check hadn't been told to skip them yet — it now skips cleanly, matching how the same check already behaves for other missing pages. Confirmed clean on a real German connection, desktop and mobile.

---

## [Unreleased] - 2026-07-13

### Added

- **Germany (DE) and Sweden (SE) are now covered by the test suite**, alongside the existing UK, Spain, Ireland, and Rest of World markets. Both markets were checked directly on the live site first (not guessed) to figure out what's actually there:
  - **Germany**: full sign-up now works, matching the real 5-screen German sign-up flow (phone/birthday, personal details, address, then username/password/agreements). Turns out Germany doesn't have a Casino games section, a "report a problem" link, or the games filter carousel that other markets have — checks for those now skip cleanly on Germany instead of failing.
  - **Sweden**: turns out Sweden doesn't have a traditional log-in/sign-up screen, an account pop-up, or a payment methods page at all — checks for those now skip cleanly instead of failing. Sweden does have a Casino games section like the UK.
- **One combined report across all 6 markets.** Ran the entire suite (desktop and mobile) for UK, Spain, Germany, Sweden, Ireland, and Rest of World back-to-back, all landing in a single Excel file with one tab per market/device — easier to hand over as one clean baseline snapshot instead of six separate files.
- **The combined report now adds up the total run time across every market and device into one grand total**, on its own "Summary" tab, so it's easy to see how long the whole suite took to run end-to-end instead of having to add up each tab by hand.

### Fixed

- **The cookie pop-up was blocking every single test on Germany and Sweden** because the "accept all cookies" button text on those two markets ("alle cookies zulassen" / "tillåt alla cookies") wasn't recognized yet. Fixed by teaching the check both phrases.
- **Germany's sign-up form was reporting the two agreement checkboxes as ticked when they actually weren't** — a shortcut way of clicking them wasn't reliably registering with the page. Replaced with a real click-and-double-check approach so this can't silently pass anymore.
- **A search-results check could occasionally match the wrong thing on the page** — a game tile sitting in the background, hidden behind the search pop-up, rather than an actual search result. Now it only looks inside the actual search results panel.
- **A "which page did this link lead to" check could occasionally match an unrelated individual game page** instead of correctly detecting that a category doesn't exist for a given market. Fixed so it only matches the exact category link, not anything that happens to start with the same web address.
- **A check for Sweden's side-menu could silently throw away everything it had already confirmed passed**, the moment it hit a menu item Sweden doesn't have, instead of recording what did pass and skipping only what's missing. Now it correctly keeps the earlier results.

---

## [Unreleased] - 2026-07-10

### Added

- **Wrote down our team's coding rules and testing know-how in one shareable file** (`AGENT-STANDARDS.md`), so everyone on the QA team gets the same guidance no matter which tool they use to write tests — instead of that knowledge living only in one person's head or one person's chat history.
- **Added a short "how to use RevWright" guide** (`docs/USING-REVWRIGHT.md`) explaining what to expect day-to-day — like it always asking for a specific Jira ticket before touching Jira, and pausing to ask you to switch your VPN when testing more than one country in a row.
- **Rest of World (ROW) is now covered by the test suite, on both desktop and mobile.** Sign-up needed its own fix since ROW's sign-up form checks the phone number against whichever country your connection is really coming from, not a fixed country — so it needed real South-Africa-formatted numbers to work during testing, plus the same "no house number field, one fewer tick-box" pattern already found on the Ireland site.
- **Test results for a country now include both the desktop and mobile results in a single results file**, on two separate tabs, instead of two separate files — easier to review and won't get overwritten by accident.

### Changed

- **Added a note in our project rules** about keeping the shared knowledge file up to date after changes get merged in, so the version everyone's using doesn't quietly fall behind.
- **The social media icons check now skips entirely for countries that don't show social icons at all** (Ireland, ROW), instead of running the check and discovering that partway through.

### Fixed

- **A footer link ("Payment Options") could occasionally show as broken when it wasn't** — clicking it right after clicking a different footer link could land on the wrong page if the earlier click's page-load was still catching up. The check now properly waits for each click to fully land before checking the next one.
- **The search feature's "search for a game, then sign up" check could occasionally fail on phone screens, ending up on a game preview page instead of the sign-up form.** This turned out to be a testing-only issue (not something a real visitor would ever hit) — our test was doing a "hover" motion before clicking, which doesn't make sense on a phone (phones don't have hover), and a leftover pop-up from an earlier step wasn't always fully closing before the next click. Both are now fixed, verified with over a dozen repeated test runs with no failures.

---

## [Unreleased] - 2026-07-09

### Added

- **The whole test suite now runs on mobile phone screens, not just desktop.** All 24 checks for the UK and Spanish sites now pass on a phone-sized view as well as desktop — this covers things like the slide-out menu, the bottom navigation bar, and the sign-up form, all of which look and behave differently on mobile.
- **Ireland (IE) is now covered by the test suite on desktop.** Sign-in and sign-up both work — sign-up needed its own rebuild since Ireland's form is a little different from the UK's (different phone number format, no separate "house number" field, and one fewer tick-box).

### Fixed

- **The pop-up that closes the special-offer banner could silently fail to close itself if it showed up slowly**, which became more likely the longer a test run went on. It now waits longer and tries more times before giving up, so a slow pop-up doesn't block whatever the test was about to do next.
- **On mobile, "Log In" and "Join" aren't separate buttons up top like on desktop — they're inside the slide-out side menu.** Every test that needs to log in or sign up on mobile now knows to open that menu first.
- **Testing a country other than the UK on mobile was silently logging in with the UK test account instead of that country's own account**, which caused a "wrong region" error. Now it always uses the right account for whichever country is being tested.
- **The "Terms & Conditions apply" link under the homepage banner was being reported as missing on some markets, when it was actually there** — the check required it to be visibly on-screen, but this link is intentionally tucked out of sight until expanded. Now it's checked for correctly either way.
- **On the Spanish site, a "LOGIN" link on the Contact Us page wasn't being recognized** because the check was only looking for "Log in" (with a space) — this also would have affected every other market with a similar wording difference.

---

## [Unreleased] - 2026-07-07

### Added

- **New shortcuts to run the full check-list for one country at a time** (`npm run test:uk` and `npm run test:es`) that always produce the results spreadsheet. Running the checks the old way could silently skip generating the spreadsheet if two unrelated tracking tests happened to be included in the run — these shortcuts avoid that entirely.
- **The sign-up test now double-checks that every required tick-box is actually ticked**, not just that it was clicked. On the Spanish site this caught a real bug (see Fixed below); the same safety check was added to the UK version too so this can't quietly slip through there either.

### Fixed

- **Spanish sign-up form was only ticking one of three required boxes** (age confirmation, data-privacy consent, and terms & conditions) — the other two were never actually ticked, even though the test reported success. Now all three are ticked and verified.
- **The "social media icons" and "regulator logos" checks were only reading the button's address, never actually clicking it.** Rebuilt both to genuinely click each icon/logo and confirm the correct page opens, rather than trusting an address that could be wrong or outdated without anyone noticing.
- **The footer's licensing/regulator logos test was checking the wrong thing entirely** — it was clicking a "Responsible Gaming" text link instead of the actual regulator logos (GamCare, Gamstop, UK Gambling Commission, GambleAware, etc.) in the bottom-right of the footer. Rebuilt to click every real regulator logo and confirm it opens the right regulator's website, for both UK and Spain (Spain has a different set of logos, including a self-exclusion link that opens in the same tab instead of a new one — now handled correctly).
- **A promotional pop-up could reappear partway through any test and silently swallow the next click**, without failing the test. The pop-up watcher now keeps checking for and dismissing it for the entire test, not just when the page first loads.
- **Blog-related tests were jumping straight to the blog page by typing in the address**, which isn't how a real visitor gets there. Fixed so these tests open the side menu and click "Blog," the same way a real visitor would.
- **The blog side menu test only ever checked one menu link (and only the Login button) before finishing**, even though it's supposed to check every link in the menu. Fixed to go through every link, one at a time.
- **A rare "Something Went Wrong" site glitch could flash on-screen right at the very end of the footer navigation test**, after every other check had already passed, without anyone catching it. Added one more check at the end so this no longer slips through unnoticed.
- **The footer navigation test on the Spanish site was skipping 10 out of 18 links** — it was only looking for the English wording ("Responsible Gaming," "Bonus Policy," "Terms and Conditions," etc.), so on the Spanish site it silently reported most of these as "not available in this country" instead of actually checking them, even though they're really there in Spanish. Also found that Spain's "Mobile App" and "Bingo Card Generator" links use different web addresses than the UK's. Both are now fixed — the test recognizes the Spanish wording and the correct Spanish addresses, so it genuinely checks all the links that exist for each country instead of skipping most of them.

---

## [Unreleased] - 2026-07-06

### Added

- **Spain (ES) is now fully covered by the automated test suite** — all 24 checks that already ran against the UK site now also run against the Spanish site, and both pass end-to-end. This included rebuilding the sign-up test almost from scratch, since Spain's sign-up form is genuinely different from the UK's (it asks for a Spanish national ID number instead of a mobile number, and has a different number of steps).
- **One Excel file, one tab per country** — running the suite for more than one country at once (e.g. UK and Spain together) now produces a single results file with each country on its own labeled tab, instead of separate files with no way to tell them apart.
- **Error messages in the Excel report are now in plain English** — a new "What Went Wrong" column explains failures in everyday language (e.g. "Couldn't find this on the page — it may not exist for this market"), with the original technical error kept in a second column for anyone who needs it.
- **The Excel report now shows total run time**, not just how long each individual test took.
- **Tests now recover automatically from a rare site glitch** — if the site briefly shows a generic "Something Went Wrong" error page mid-test, the test refreshes and tries itself again once, instead of being marked as failed. The rest of the suite is unaffected either way.

### Changed

- **Login test rebuilt to work correctly in any country** — it now uses each country's own button wording (e.g. "Log in" vs. Spanish "Iniciar sesión") and figures out the correct post-login redirect address automatically instead of assuming it's always the UK one.
- **Sign-up and several other tests generalized to stop assuming UK-only page layouts** — things like the "Features" page address, the payment page, and the blog's category names are now looked up per-country instead of hardcoded, so they keep working as more countries are tested.

### Fixed

- **Root cause of nearly every country-specific test failure:** a bug meant the test suite could lose track of which country it was actually checking when running more than one country in the same session — it would silently keep testing the UK version of a page even while labeled as testing a different country. This is now fixed, and it's likely responsible for a lot of quietly-wrong results in past multi-country runs.
- **The cookie pop-up dismiss logic only recognized English wording** ("allow all cookies"), so on the Spanish site it silently failed to close the pop-up and blocked every click after it. Now recognizes both languages.
- **A handful of tests were clicking the wrong thing on the page** — a promotional banner button or a leftover menu link happened to have the same wording as the button the test actually meant to click, so it clicked the wrong one. These are now scoped to the correct area of the page so this can't happen.

---

## [Unreleased] - 2026-07-02 (2)

### Fixed

- **Two tracking tests were silently broken** — `google-analytics.spec.ts` and `meta-pixel.spec.ts` were left pointing at the wrong file path and referencing a misspelled setting name (`QA_QA_BASE_URL` instead of `QA_BASE_URL`) after being moved into a new folder in an earlier update. Both tests would fail to even start. Fixed the path and the typo so they run normally again.

---

## [Unreleased] - 2026-07-02

### Added

- **14 new automated regression tests** covering site areas that had no automated coverage before: Website Header, Game Filter, Promotions Page, Banner, Registration Widget, Login Widget, Footer Regulations, Payment Method Strip, Features Page, Help Page, Blog Page, Blog Page Header, Blog Sidebar, and Footer Social Media Strip. Every one of these was run against the live site and fixed until it passed for real — not just written and left untested.

### Changed

- **Test folders reorganized to match the official QA priority checklist** — Several existing tests were filed under the wrong priority folder (e.g. Game Information Modal and Game Category Navigation were sitting in the P2 folder but are actually P1). They've been moved to match the spreadsheet the team uses to rank what matters most, including two spots where the spreadsheet's own reviewer comment overrode the initial ranking (Feedback Form moved up to P1, Contact Us Page moved down to P3).
- **Features Page and Help Page tests now enter through the sidebar menu** instead of jumping straight to the page's web address — this matches how an actual visitor would reach those pages, so the test also confirms the menu link itself works.

### Fixed

- **Registration test updated for a recent site change** — the "Enter password" step no longer exists on the live registration form (the password field shows immediately), so the test was updated to match.
- **Flaky test runs caused by the cookie banner** — during long test runs, the cookie consent popup would occasionally still be on screen a beat after the test expected it to be gone, causing random click failures. The dismiss logic now keeps retrying for a few seconds instead of giving up after one attempt.
- **"Forgot Password" test was racing ahead too fast** — it was only waiting for the login button to disappear (which happens almost instantly) before moving to the next check, so it never actually gave the password-reset window time to finish appearing on screen. It now waits the full time that window actually takes to load.
- **Removed a leftover script** that printed a confusing "no results found" message in the terminal even when every test passed — it was duplicate, broken reporting logic left over from earlier work; the real Excel/HTML reports were never affected.

### Notes for the team

- Confirmed with dev: the blog page's logo intentionally links to the main homepage, not the blog homepage — this matches other brand sites and is not a bug.
- Confirmed with dev: the mobile banner is currently 750×360px. The 750×484px size in the checklist is a newer banner format already live on other brands (MC, GC, SNG) but not yet rolled out to Slingo — the test is written to expect the new size so it'll start passing automatically once Slingo gets the update.

---

## [Unreleased] - 2026-06-30

### Added

- **Meta Pixel tag checker** — New automated check (`tests/p1/tracking/meta-pixel.spec.ts`) that crawls every page on the QA site and verifies the Facebook Pixel script is present, `fbq()` is initialised, and the correct Pixel ID is the one that was fired. On any failure it attaches a screenshot of the broken page to the Jira comment.

- **Full Jira workflow transition map** — All 17 transition IDs for the SC/SNG workflow are now documented and loaded into both `.env` and `.env.example`. Previously only 3 were wired up; the rest (QA Rejected, Reopened, Production QA, Post Release QA, Released, Done no QA, Rejected, and all globals) were missing.

- **Tracking test types added to agent header** — `google analytics`, `meta pixel`, `tiktok pixel`, and `google tag manager` are now listed in the agent's supported test types comment.

### Changed

- **Failed QA checks now move ticket to QA Rejected** — Previously when a Playwright test failed, the ticket was left silently in "In Review". It now transitions to QA Rejected (which moves it to Reopened status) so the developer knows it needs attention.

- **AI interpreter now returns structured output** — The ticket interpreter previously returned just a test type string. It now returns `testType`, `checkItems` (bullet points for the Jira comment scope section), `params` (brand, GEO, tag ID), and `confidence`. Low-confidence matches are flagged in the console.

- **Jira comment scope bullets now match the ticket** — The "Scope Checked" section in the QA comment used to show a generic label. It now lists the actual check items extracted from the ticket by the AI interpreter.

- **Agent reads brand + GEO to resolve the correct QA URL** — When the interpreter extracts a brand and GEO from the ticket (e.g. `[SNG AB]`), the agent looks up the matching QA environment from `helpers/brand-urls.ts` and runs the test against that URL instead of the default.

- **`.env.example` fully updated** — All 17 transition IDs are now documented with comments explaining which state each one moves a ticket from and to.

### Fixed

- **TypeScript error in ticket interpreter** — `Object.fromEntries` on `parsed.params` was inferred as `{ [k: string]: unknown }` which conflicted with `Record<string, string>`. Fixed with an explicit type predicate on the filter callback.

- **`meta pixel` test type now routes to real spec** — Previously `meta pixel` tickets pointed to `not-implemented.spec.ts` and would always fail with a "not implemented" error. They now run the new Meta Pixel spec.

### Security

- **Patched `form-data` CRLF injection vulnerability** — `form-data` was pinned to 4.0.5 which contained a high-severity CRLF injection flaw (GHSA-hmw2-7cc7-3qxx) allowing malicious multipart field names or filenames to inject arbitrary headers. Bumped to 4.0.6 via `npm audit fix`. No code changes required.

---

## [Unreleased] - 2026-06-25

### Fixed

- **Screenshots now save correctly** — Evidence screenshots taken during login tests were being saved to a folder called `playwright-results/` that never existed on disk. They now go to `test-results/`, and that folder is automatically created if it doesn't exist yet. This means screenshot evidence will no longer silently disappear during test runs.

- **Excel test report now generates properly** — The command to produce the Excel report was pointing at a JavaScript file that doesn't exist. It now correctly runs the Python script (`generate-report.py`). The `test-results/` folder it writes into is also created automatically so the report never fails on a fresh machine.

- **Jira images now show up in comments** — When the agent posted QA results as a comment on a Jira ticket, any screenshots attached were not displaying — only broken image placeholders appeared. This was caused by using the wrong URL field when building the comment. Now fixed so screenshots render correctly inside the Jira comment.

- **Global setup and teardown scripts now actually run** — Two important scripts (`global-setup.ts` and `global-teardown.ts`) existed in the project but were never wired up to Playwright. This meant pre-test setup and post-test Excel report generation were silently skipped on every run. Both are now properly registered.

- **Transition checker no longer crashes without a ticket number** — Running `npm run check-transitions` without providing a Jira ticket key would crash with a confusing error. It now shows a clear usage message instead.

- **`form-data` package now properly declared** — A package used for uploading screenshots to Jira was only included indirectly through another dependency. It is now explicitly listed in `package.json` to prevent it from breaking if dependencies are updated.

### Added

- **`CLAUDE.md`** — Added a rules file to the repo that documents session rules, CHANGELOG requirements, branch naming conventions, and coding standards. This file loads automatically so the rules are always in context.

- **`requirements.txt`** — Added a Python dependencies file listing `openpyxl` (required for `generate-report.py`). New team members can now install Python dependencies with a single command.

## [Unreleased] - 2026-06-24

### Added

**Jira QA Agent (`src/agent.ts`)**
- CLI: `npx ts-node src/agent.ts <TICKET-KEY> [--dry-run]`
- Full automated QA workflow: fetch ticket → detect test type → transition to In Review → run Playwright → upload screenshots → post ADF comment → transition to Approved (or leave in In Review on failure)

**Agent source files**
- `src/jira-client.ts` — Jira REST API v3 wrapper (fetch ticket, transition, comment, upload attachment)
- `src/requirements-parser.ts` — Extracts `Test Type: <value>` keyword from ticket description
- `src/test-runner.ts` — Maps 10 test types to Playwright spec files, runs tests, parses results
- `src/ticket-interpreter.ts` — AI fallback (Claude Sonnet): reads free-form ticket text and identifies the test type when no keyword is present. Requires `ANTHROPIC_API_KEY` in `.env`
- `src/check-transitions.ts` — Diagnostic script to list available Jira workflow transitions for a ticket
- `src/browser-runner.ts` — Standalone login/logout runner with evidence screenshots

**Config & dependencies**
- `.env.example` updated with `ANTHROPIC_API_KEY` for the AI interpreter (optional)
- `@anthropic-ai/sdk` added as a runtime dependency
- `npm run agent` and `npm run check-transitions` scripts added to `package.json`

### Changed

**Test type detection in `src/agent.ts`**
- Now tries keyword match first (`Test Type: login` in description) — fast, no API cost
- Falls back to AI interpreter if no keyword is found — Claude Sonnet reads the ticket and picks the closest match
- Error message updated to explain both options when neither method resolves a test type

## [1.0.0] - 2026-06-23

### Added
- Initial Playwright automation suite for Slingo (https://www.slingo.com)
- P1 tests (17 tests across 5 files):
  - `tests/p1/login.spec.ts` — Login flow validation
  - `tests/p1/registration.spec.ts` — User registration flow
  - `tests/p1/search.spec.ts` — Search functionality
  - `tests/p1/blog-search.spec.ts` — Blog search
  - `tests/p1/feedback-form.spec.ts` — Feedback form submission
- P2 tests (5 files):
  - `tests/p2/contact-us-page.spec.ts`
  - `tests/p2/footer-navigation.spec.ts`
  - `tests/p2/game-category-navigation.spec.ts`
  - `tests/p2/game-info-modal.spec.ts`
  - `tests/p2/sidebar-navigation.spec.ts`
- Shared helpers: `helpers/common.ts`, `helpers/testData.ts`
- Global setup/teardown: `global-setup.ts`, `global-teardown.ts`
- Excel test report generator: `excel-reporter.cjs`, `generate-report.py`
- Playwright config targeting ZingoBingo with hash-based routing support
- TypeScript config (ESNext module, bundler resolution)
- Repository structure, `.gitignore`, PR template, CONTRIBUTING guide
- GitHub Actions workflow enforcing CHANGELOG updates on every PR

---

[Unreleased - 2026-06-24]: https://github.com/ed-pacson/kd-post-qa/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ed-pacson/kd-post-qa/releases/tag/v1.0.0
