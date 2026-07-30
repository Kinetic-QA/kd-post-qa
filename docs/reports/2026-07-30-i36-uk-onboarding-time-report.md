# Ice36 (I36) UK Onboarding — Time & Summary Report

**Date:** 2026-07-30
**Scope:** Ice36 (I36) UK — first-ever onboarding for this brand, desktop + mobile
**Time:** ~2 hours 37 minutes total (4:01 PM – 6:38 PM) — desktop ~1h35m, mobile ~1h02m
**Result — Desktop:** 18 of 24 checks passed clean, 2 skipped correctly, 2 real open findings.
**Result — Mobile:** 20 of 24 checks passed clean, 3 skipped correctly, 1 real open finding (same root cause as one of desktop's).

## The short version

Ice36 is a **brand-new brand** — nothing about it existed in our settings before today. Same underlying platform family as Mega Casino (same "SkillOnNet" site engine), but its own page layout, game categories, and page paths, so everything had to be discovered fresh from the real live site rather than reused. That first-time cost is normal and expected — every new brand costs more than adding a new country to one we already know.

## What we found and fixed

- **Registration form was checking a "Bingo" consent box that doesn't exist for this brand.** Ice36 has no Bingo games anywhere on the site, so the sign-up form only shows 3 consent checkboxes, not the usual 4. Fixed to match — same fix already made for Mega Casino previously.
- **The "Slots" footer link goes to a different web address than most other brands.** Most brands use `/slots/`; Ice36 uses `/slots-jackpots/`. Fixed the settings to match.
- **The search results and game-tile checks were looking for the wrong page-address patterns.** Built the real list from the live site (`/slots-jackpots/`, `/casino/`, `/live-casino/`, etc.) and wired it in.
- **The sign-in and sign-up pop-ups don't show a "Report a problem" link, even though the standalone Contact Us page does.** This is a genuine difference between two parts of the same site — turns out we'd already seen this exact split once before, on Lord Ping Spain/Canada, and there's already a settings flag for it. Reused that instead of inventing a new one.

## Real, still-open findings (not fixable from our side)

1. **Clicking a game tile to open its info pop-up sometimes fails outright**, showing the site's own generic "Something went wrong" error screen instead of the game details. This happened repeatedly today, including on isolated re-runs, so it doesn't look like ordinary bad luck — worth a closer look by the dev team.
2. **The real sign-in test (using the actual test account you provided) doesn't reliably open the login pop-up.** Clicking "Login" sometimes just does nothing — the page stays put instead of showing the sign-in form. This matches a known issue already logged on Mega Casino's own sign-in/registration pop-up ("opens/closes inconsistently") — looks like the same underlying platform-wide quirk, not something new to Ice36. **Confirmed on mobile too** — the mobile "Play" button (which doubles as mobile's Login/Join entry point) shows this exact same symptom, consistently reproducible on a clean isolated re-run, not a one-off.

## Mobile results

Mobile went noticeably smoother than desktop — 20 of 24 checks passed clean on the first real pass, with only the one open finding above (shared with desktop, not a new mobile-only issue). None of the "Something went wrong"/page-timeout flakiness seen during parts of the desktop session showed up during mobile testing.

## Where time went

- Roughly half the session was building the brand's settings file from scratch (site structure discovery, taxonomy, consent checkboxes, feedback-form split) — expected first-time cost.
- The other half was spent re-running the suite multiple times to separate **real** problems from **temporary site hiccups** — today's site was showing its own "Something went wrong" error and plain page-load timeouts unusually often, likely from the sheer amount of testing already run against these QA/live sites earlier today (Mega Casino Denmark and Alberta, plus this). Several checks that looked broken on one run (game filter, sidebar navigation, blog pages, help page) turned out to pass cleanly on a calmer re-run — genuinely flaky, not real bugs.

## Next steps

- I36/UK is now done for both desktop and mobile, per your new standing instruction to always onboard both together.
- The 2 open findings above should get a ticket/decision on whether to escalate to the brand/dev team, same as we've done for similar open items on other brands.
- Remaining I36 markets after UK: COM, IE, CA, ES, DK (DE excluded per your instruction).
