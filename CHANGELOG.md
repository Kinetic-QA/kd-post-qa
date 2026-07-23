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

## [Unreleased] - 2026-07-23

### Automation Coverage Status (per brand, for tracker use)

- **Genting Casino (GC)** — Onboarded: UK (partial), Spain (ES). Confirmed Passing: Spain only. **Status: Spain is fully done, nothing outstanding. UK is blocked** by the same kind of automated-security-service issue already seen on Mega Casino's UK site (see below) — several checks (login, sign-up, and a handful of others) get intermittently stopped by it. Per today's call, UK is parked for now rather than spending more time on it; picking Spain first paid off since it turned out to have none of that problem.
- **Mega Casino (MC)** — Onboarded: UK, .com (international), Canada, French Canada, Ireland (5 markets). Confirmed Passing: Canada, French Canada, Ireland (3 of 5). **Status: French Canada and Ireland are both now fully done, nothing outstanding.** UK remains blocked by the same automated security service noted above. .com's status still needs re-confirming next time it's touched.

### Added

- **Onboarded Genting Casino's Spain (ES) market — passes the full checklist cleanly on desktop**, including a working blog search (see Fixed below for a correction on that).
- Started onboarding Genting Casino's UK market. Several real site-specific fixes went in (see Fixed), but UK isn't being counted as "confirmed passing" yet because of the security-service blocking issue above.
- **Onboarded Mega Casino's French Canada (FR-CA) market — passes the full checklist cleanly**, tested from a confirmed Montreal connection.
- **Onboarded Mega Casino's Ireland (IE) market — passes the full checklist cleanly**, tested from a confirmed Dublin connection.

### Fixed

- **The website header's "logo goes home" check was still trying to visit Slingo's own game category page first, which Genting Casino doesn't have at all** — a leftover assumption from when only Slingo existed. Now picks any real page the current brand actually has instead.
- **Genting Casino's "hover to play" button on game tiles has no text at all, just a play icon** — every other brand we've onboarded has real text like "PLAY IT" there, so several checks (feedback form, search results, game info pop-up) that looked for that text came up empty on Genting Casino. They now also recognize the icon-only button.
- **The game filter carousel check assumed the very first row of games could always be scrolled** — on Genting Casino, the first row can genuinely be too short to need scrolling (e.g. only 3 games), which is normal, not a bug. The check now picks the first row that's actually scrollable instead of assuming row one always is.
- **A "go back" step used across several checks was timing out under normal conditions** — it was waiting for the full page (including every image) to finish loading before moving on, when the checks right after it only ever needed the page's basic content to be ready. Sped up and fixed across six different checks.
- **Several footer and sidebar links on Genting Casino's Spanish site go to genuinely translated Spanish web addresses** (e.g. "Casino" goes to a Spanish-named address, not the English one used elsewhere) — the checklist was still expecting the English addresses and failing. Now reads the correct address per market instead of assuming one fixed set for every brand.
- **Genting Casino's Contact Us page has a totally different design between UK and Spain** — UK shows two big clickable option cards with no direct email address; Spain shows a completely different layout with a real support email and a "report a problem" button. The checklist now handles both designs correctly instead of assuming they're the same.
- **Genting Casino's blog list page doesn't have a "Read More" link on articles at all** — unlike our other brands, only the article title itself is clickable. The check now falls back to clicking a real article title when no "Read More" link exists.
- **The blog logo's "click goes to blog home page" check only recognized this behavior for one specific brand** — now that a second, unrelated brand (Genting Casino) confirms the same behavior, the check treats it as the normal case and only expects the older "goes to main homepage" behavior for the one brand actually confirmed to work that way.
- **Corrected a mistaken "blog search doesn't work" finding on Genting Casino's Spanish site** — an early check looked in the wrong place (only the mobile menu) and wrongly assumed search was broken there like it is on some other brands. Re-checked properly using the real desktop search icon in the page header: it works perfectly, including returning real search results. The checklist and brand notes are now corrected to reflect that.
- **A typo in Mega Casino French Canada's web address (lowercase instead of uppercase in the "CA" part) was silently breaking every "does clicking this link take you to the right page" check.** Fixed to match the real address the site itself uses.
- **Several of Mega Casino French Canada's sign-up and log-in screens use different wording than we assumed** — the real mobile number field, birthday field, continue button, postal code field, and city field all use their own French Canadian wording rather than the wording already confirmed on a different brand's French Canada site. Updated to match what's actually there.
- **Mega Casino French Canada's log-in and Home links are genuinely in English on an otherwise-French site** (confirmed with the brand owner as intended, not a bug) — the checklist now accepts either the English or French wording instead of only expecting French and failing.
- **The sign-up form's address step on Mega Casino French Canada was silently rejecting every attempt** — typing an address needs to be done the same way a real person types (letter by letter), not pasted in all at once, or the site's own address checker never accepts it. Also fixed a related timing quirk where the postal code and city boxes sometimes don't appear until you click a small "type it in yourself" link first. Both are now handled correctly.
- **Mega Casino French Canada's contact page has no "report a problem" link at all** — the checklist was still expecting one (based on other markets) and failing. Corrected to skip that check on this market, since it's genuinely not there.
- **A sidebar "Home" link deep inside Mega Casino French Canada's menu was showing up in Portuguese ("Página Inicial") instead of French or English** — a real site wording bug, separate from the two intentional English spots above. The checklist now recognizes this wording too so the check itself doesn't fail, while the underlying site wording bug is being raised with the brand owner separately.
- **A game info pop-up check was intermittently trying to click a game tile that was scrolled out of view inside a sideways-scrolling row of games** — happened on Mega Casino Ireland but isn't specific to that market. The check now double-checks the tile is actually on-screen first and picks a different one if not, benefiting every brand that uses this same check.

### Known open items (carrying into next session)

- **Genting Casino UK's live site is guarded by an automated security service that intermittently blocks our automated checks** (not real site visitors — same category of issue already documented for Mega Casino UK). We looked into a possible workaround today and decided not to pursue it for now due to licensing limits; UK is parked until either the security team allowlists our checker, or a different workaround is found.
- **A "click the sidebar logo to go home" check on Genting Casino UK times out even when tested completely on its own**, separate from the security-service issue above — a real, still-unfixed bug worth a closer look next time UK is picked back up.
- **Two Mega Casino French Canada footer links ("Contato" and "Afiliados") are showing up in the wrong language entirely (Portuguese/Spanish, not French)** — confirmed as a real bug, ticket being filed with the brand owner. A third spot with the same problem (the sidebar's "Página Inicial" link, noted above) is likely the same root cause and worth folding into that same ticket.
- Next session: continue with whichever brand/market Reeve prioritizes next — Genting Casino's remaining markets, or another brand's onboarding.

## [Unreleased] - 2026-07-22

### Automation Coverage Status (per brand, for tracker use)

Two different questions, tracked separately: has the full checklist (desktop + mobile) been **set up** for a market ("Onboarded"), and has it actually been **run clean with no real problems found** ("Confirmed Passing")? A market can be onboarded without yet being confirmed passing.

- **SpinGenie (SNG)** — Onboarded: UK, Ireland, Canada, Ontario, French Canada, Alberta, Spain, Germany, Sweden, Rest-of-World (all 10 markets). Confirmed Passing: all 10 markets. **Status: fully complete, nothing outstanding.**
- **Slingo (SC)** — Onboarded: UK, Spain, Germany, Sweden, Ireland, Rest-of-World (all 6 markets). Confirmed Passing: UK, Spain, Germany, Sweden, Ireland (5 of 6). **Status: Rest-of-World is onboarded but NOT yet confirmed passing** — it has a repeatable pop-up/overlay problem, open item below, scheduled to be fixed next session before Genting Casino starts.
- **Mega Casino (MC)** — Onboarded: UK, .com (international), Canada (3 markets). Confirmed Passing: Canada only. **Status: UK is blocked by a security service occasionally stopping our automated checks (not a real site problem, and not something fixable from our end — needs the dev/security team to allow it through); a working test login for MC UK is also still needed. .com's status needs re-confirming next time it's touched.** Ireland has not been started yet (flagged as the likely next market).
- **Genting Casino (GC)** — Not yet started. Planned as the next new brand to onboard, after SC's Rest-of-World fix.

### Added

- **Mega Casino (MC) is now onboarded for three markets: UK, the main international site (.com), and Canada.** This is a brand-new brand for our checklist, on a site design that's different enough from our other brands that several checks needed real updates, not just new market details.
- Added Mega Casino's real market details (contact email, currency, what pages exist, category menu shape) for UK, COM, and Canada.
- **Onboarded SpinGenie's Spain (ES), Germany (DE), Sweden (SE), and Rest-of-World (ROW) markets — all four now pass the full checklist cleanly.** Spain and Germany share a login with our other brand's Spanish/German sites, so no new test accounts were needed there. Sweden uses the same "deposit first, no separate login" model already confirmed for our other brand, and Rest-of-World was tested from a Cyprus connection.
- Added a Cyprus phone-number generator for the Rest-of-World sign-up test, since that market's form checks the phone number against whatever country the tester is actually connecting from.

### Fixed

- **Mega Casino's game category names are completely different from our other brands, and two checks didn't know that.** Our other brands use names like "Slots"/"Casino"/"Bingo" in their web addresses — Mega Casino uses "Online Slots"/"Casino Games"/"Live Casino" instead. The game-filter check and the game info pop-up check were both silently assuming the old naming and failing to find any games at all. Both now read the real category names for whichever brand they're checking instead of assuming one fixed set.
- **The game info pop-up also had a hidden game tile problem specific to Mega Casino** — some tiles only reveal their title link when you actually hover over them with a mouse, and a couple of layout quirks meant a real click could land just outside the visible screen area right after scrolling to it. Both now handled properly instead of timing out.
- **Mega Casino's sign-up form needed the same kind of country-specific fixes we've hit before on other brands**, once we could actually test it properly:
  - The phone number step rejects any number that doesn't match the format of whichever country your connection is coming from (confirmed on both the Malta and Canada versions of the site) — added the correct phone number generators for each.
  - Canada's version also silently rejects the date of birth unless it's typed in a completely different style (year-month-day) than the standard form — same kind of issue we'd already found on another brand's Canadian sign-up form.
  - The home address step on the international/Canada sites has a different layout (no separate "house number" box) than our other brands' forms — the checklist was still looking for a field that doesn't exist there.
  - The final consent step also expected a Bingo-related checkbox that doesn't exist for Mega Casino, since this brand doesn't offer Bingo at all.
- **The footer's "Payment Options" link and a promotions icon in the header point to a different address, or don't exist at all, on some Mega Casino markets** — the checklist now reads the correct address per market instead of assuming one fixed one, and skips gracefully where the icon genuinely isn't there.
- **Finished confirming French Canada (FR-CA) is fully working** — the "Play Now" button check on the Promotions page was accidentally clicking a random sentence of marketing text instead of a real button (the word "play" happened to appear inside it), sending the test to the wrong page. Now it only clicks real, clickable buttons.
- **Spain's sign-up/login checklist was failing across the board** — turned out several page addresses and the "Join" button's expected wording were copied from our other brand's Spanish site instead of being checked on SpinGenie's own Spanish site directly. Corrected the Promotions and Features page addresses, the Contact and About Us page addresses (Spain translates these, unlike every other market so far), the support email, and widened the "Join" button check to recognize SpinGenie's own wording.
- **Sweden's Contact page checklist was failing** — the page has a leftover "LOG IN" link that opens an empty pop-up with no actual sign-in form inside it (expected for this deposit-only market, confirmed intentional). The checklist now skips trying to close a pop-up that was never really there.
- **Rest-of-World's sign-up test kept failing with "phone number not accepted."** The test was still using a South African-format phone number left over from when this market was last checked from a South Africa connection. Since the sign-up form checks the phone number against the tester's real location, this session's Cyprus connection rejected it every time. Now generates a Cyprus-format number to match.

### Confirmed

- **SpinGenie (SNG) — every market (UK, Ireland, Canada, Ontario, French Canada, Alberta, Spain, Germany, Sweden, Rest-of-World) is now confirmed fully working on both desktop and mobile.** This closes out the SpinGenie onboarding checklist.
- **Slingo (SC) — UK, Spain, Germany, Sweden, and Ireland are confirmed fully working on both desktop and mobile.** Rest-of-World (ROW) is **not** included in that confirmation — see below.

### Known open items (carrying into next session)

- **Slingo (SC) Rest-of-World has a recurring pop-up/overlay problem that hasn't been fixed yet.** Several different checks (search, the site header, and sign-up on mobile) get stuck with a pop-up or overlay that won't close properly, and it happened again on a repeat run, so it's a real, repeatable problem rather than an occasional glitch. Best guess so far is that the Rest-of-World site itself responds slower than our other markets, but that's not confirmed yet — needs a closer look at what's happening behind the scenes before we can fix it. Scheduled to be looked at first thing next session, before starting Genting Casino.
- **Mega Casino UK's live site is currently guarded by a security service that occasionally blocks our automated checks** (not real site visitors — confirmed by opening the exact same page in a normal, non-automated browser with no issue at all). This mostly affects the login/sign-up checks and occasionally a few others. Needs someone on the dev/security side to allow our automated checker through; not something fixable from our checklist. A working test login for Mega Casino UK is also still needed.
- Next session: fix Slingo Rest-of-World's pop-up problem first, then continue onboarding the remaining Mega Casino markets (Ireland is the most likely quick win — same site design as the three markets done today).

## [Unreleased] - 2026-07-21

### Added

- **Onboarded SpinGenie's Ontario (ON) market — fully working, whole checklist passes clean.** Ontario's sign-up form turned out to be a mix of two markets already onboarded: it uses Canada's phone/birthdate format, but Alberta's home-address layout (with a house-number box, unlike Canada's version). Also confirmed Ontario's blog search actually works properly — earlier testing had wrongly assumed it was broken everywhere on this brand's sites, when really only the Canada market has that problem.
- **Onboarded SpinGenie's French Canada (FR-CA) market — login and full sign-up flow confirmed working.** This is a French-language version of the Canada site. Every single field on the sign-up form (phone number, birthdate, name, email, address, username, password) needed to be checked by hand in French, since none of the previous markets' checklists had French text to reuse.
- Added a shared QA test-account credentials file (`.env.qa-shared.local`) that the whole QA team can drop into their own project folder to get every brand/market login already filled in, without anyone having to copy-paste them individually.

### Fixed

- **Ontario's real contact email and social media links were being guessed wrong** — corrected to the real ones found on the live site (Facebook and Instagram links were missing entirely from our checklist before).
- **A login-check bug that would have broken for any market with a "province" or "state" style web address** (like Ontario's on.spingenie.ca) — the checklist was checking for the wrong web address after logging in. Fixed so it works for every market going forward, not just a one-off patch.
- **The sign-up and log-in buttons on French Canada's site sometimes did nothing when clicked** — they showed up on screen before the page was actually ready to respond to clicks. Added a short wait specifically for this market so the buttons work reliably every time.
- Corrected several wrong assumptions carried over from the English Canada site that don't apply to French Canada: it has no blog and no "report a problem" feedback form (English Canada has both), and its "Promotions" and "Features" pages use different, French-only web addresses.

### Known open items (carrying into next session)

- French Canada's checklist hasn't had one final clean full run yet — the last attempt ran into a wave of website-loading slowdowns (likely just heavy internet traffic after a long testing session, not a real bug), so a handful of unrelated checks timed out. Needs one more full run first thing next session to confirm everything is genuinely clean.
- Next session: continue onboarding the remaining SpinGenie markets/GEOs (Spain, Germany, Sweden, and others) — these already exist for other brands on this site, so they should go faster than French Canada did.

## [Unreleased] - 2026-07-20

### Fixed

- **SpinGenie Canada's sign-up form was completely broken — now fully working.** Testing from a real Canadian connection (not just a UK one, like earlier this month) turned up four separate problems stacked on top of each other, all now fixed:
  - The phone number step rejected every number, because the country dropdown wasn't being told to pick Canada.
  - The date-of-birth field silently rejected every birthdate — turns out this specific form wants the date typed in a completely different style (year-month-day with dots) than every other market's sign-up form.
  - The home address step has a different layout for Canada than other markets (no separate "house number" box, and separate country/province menus) — the checklist was still looking for fields that don't exist on this version of the form.
  - The most interesting one: the address step's **province menu automatically fills in whichever province your real internet connection is coming from** (Alberta if testing from Calgary, Quebec if testing from Montreal, etc.) — and the site will silently refuse to continue if the submitted province doesn't match your real location. Our checklist was hardcoding "Ontario" every time, which only worked by coincidence before. It now leaves the auto-filled province alone instead of overwriting it.
  - The very last step also expected an extra Bingo-related consent checkbox that this market's sign-up form doesn't actually have (Canada doesn't offer Bingo, same as a couple of other markets already handled correctly).
- **SpinGenie's blog page had two separate small issues on the header, both now fixed.** The search icon check was accidentally grabbing the wrong hidden element behind the scenes and reporting it as broken. And the "does clicking the logo return to the blog's homepage" check was written assuming every brand behaves like Slingo (where the blog logo actually goes to the main site) — SpinGenie's blog logo genuinely goes back to the blog's own homepage instead, which is normal for this brand, not a bug.

### Known open items (carrying into next session)

- **SpinGenie's blog search feature doesn't actually work at all** — confirmed on both the UK and Canada versions of the site, not just one. The page reserves a spot for a Google-powered search box, but it never actually appears, so searching the blog is currently non-functional for site visitors. This looks like a real product issue worth flagging to the team, not something automatic to fix on our end — worth a quick manual double-check in a real browser before officially reporting it, since we've occasionally seen automated-testing-only glitches before.
- Next session: continue onboarding the remaining SpinGenie markets/GEOs.

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
