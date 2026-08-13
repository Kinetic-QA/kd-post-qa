# Simba Games & Lucky Me Slots — Full Brand Onboarding Time Report

**Date compiled:** 2026-08-11
**Scope:** Simba Games (SG) and Lucky Me Slots (LMS) — every market, from brand-new to fully onboarded
**Source:** CHANGELOG.md entries dated 2026-08-03 through 2026-08-05

## Bottom line up front

| Brand | Markets covered | Calendar days to full rollout | Markets needing a later recheck |
|---|---|---|---|
| **Lucky Me Slots (LMS)** | UK, CA, SE, DK, COM (5) | 3 days (2026-08-03 → 2026-08-05) | 0 — every market clean on its first run |
| **Simba Games (SG)** | UK, CA, DK, SE, COM (5) | 2 days (2026-08-04 → 2026-08-05) | 0 — every market clean on its first run |

Both brands are the fastest full 5-market rollouts on the project so far. Neither one ever needed a "came back clean on a *later* recheck" cycle — every market hit 0 real failures on the same run where it was first reported, because any real bugs found along the way got fixed live in the same session before the final numbers were logged.

---

## Lucky Me Slots (LMS) — market-by-market

| Date | Market | Result | Notes |
|---|---|---|---|
| 2026-08-03 | **UK** (brand-new brand) | 34 passed, 0 failed | First-ever coverage for this brand. Own slide-out side menu, own category list (Slots, Progressive Jackpots, Table Games, Live Casino, separate "Features" section). Several slow-hover timeouts fixed mid-session, cutting some checks from minutes down to under a minute. |
| 2026-08-04 | **CA** | 33 passed, 0 failed | Near-exact clone of the UK site, just priced in Canadian dollars. |
| 2026-08-04 | **SE** | 24 passed, 0 failed | Smaller menu (no Table Games, no Live Casino, has a "Withdrawals" link others don't). Login/sign-up intentionally left out of scope for this market per instruction. |
| 2026-08-04 | **DK** | 28 passed, 0 failed | Full UK-style menu, but sign-up asks for a real Danish ID number (same limit already seen on other brands' Danish sites) — sign-up correctly skips. Clean on the first try. |
| 2026-08-05 (session 2) | **COM** | 32 passed, 0 failed | Tested from a South Africa connection. No government-ID requirement here, so full sign-up flow was tested end-to-end. No login test run (no test account exists yet). Closes out the brand's full rollout. |

**LMS total: 3 calendar days, 5/5 markets clean on first run, 151 total checks passed across the brand.**

---

## Simba Games (SG) — market-by-market

| Date | Market | Result | Notes |
|---|---|---|---|
| 2026-08-04 | **UK** (brand-new brand) | 38 passed, 0 failed | The single most involved onboarding on the project so far. Shares Lucky Me Slots' underlying menu style but with a much bigger game menu (7 categories including Live Dealer, Roulette, Video Poker) and a blog section running on noticeably older website software. Several real bugs found *and fixed within the same session* (see below) before this run was logged as clean. |
| 2026-08-04 | **CA** | 34 passed, 0 failed | Clean near-copy of the UK site. Blog page is technically reachable by typing the address directly, but has no real link to it anywhere on the Canadian site — correctly doesn't count as a real feature here. |
| 2026-08-05 (session 1) | **DK** | 28 passed, 0 failed | Sign-up asks for a real Danish personal ID number — correctly skips, same as other brands' Danish sites. |
| 2026-08-05 (session 1) | **SE** | 24 passed, 0 failed | Most unusual market for this brand: "Log In" opens a scan-a-QR-code screen instead of a normal password box; "Create Account" opens a normal form that also asks for a real Swedish ID number. Much smaller game menu (just Slots — also loses Card & Table Games, Live Dealer, Roulette, Video Poker). |
| 2026-08-05 (session 1) | **COM** | 32 passed, 0 failed | Tested from a South Africa connection, priced in Rand. No government-ID requirement here (unlike DK/SE), so full sign-up flow tested end-to-end. No login test run (no test account exists yet). Closes out the brand's full rollout. |

**SG total: 2 calendar days, 5/5 markets clean on first run, 156 total checks passed across the brand.**

---

## Real bugs found and fixed along the way

These are the genuine site/tooling issues discovered during onboarding — all fixed live, in the same session, before the affected market's run was reported as clean:

| Brand / Market | Issue | Fix |
|---|---|---|
| SG UK | A second, completely empty, invisible copy of the sign-up form sat in front of the real one (leftover from an older page version); checks were finding the decoy and giving up. | Checks now confirm a form has real fields before using it. |
| SG UK | Once the sign-in window had been opened once, clicking a different button (e.g. "Register") right after did nothing until a full page refresh. | Added a refresh step for this brand. |
| SG UK | Blog runs on much older software: empty header (no sign-in there — confirmed not a bug), broken on-page search (opens a random old post instead of searching), and date-based post URLs instead of the usual category/post-name style. | All three now handled correctly instead of causing false failures. |
| SG UK (shared fix) | The "did the slide-out menu open" check assumed every brand's menu slides in from the left — true for LMS, but SG's slides in from the right. | Widened to recognize either direction — benefits every future brand on this platform. |
| SG / LMS (shared fix) | Sign-up button wording check only recognized "Join" — SG's real button says "Register." | Widened to accept either wording. |
| SG UK | Swedish-language search box placeholder has a trailing "..." on LMS Sweden that the check didn't expect. | Fixed in the shared locale-strings check. |
| SG Denmark | Danish menu links (e.g. "Spilleautomater") point to Danish URLs, but the actual games live at the same English URLs as UK/CA. | Check now looks in the right place. |
| SG Denmark (shared fix) | The "Don't have an account?" login-widget link check wasn't scoped to just the sign-in pop-up, so it accidentally matched the header's separate "Create Account" button sitting behind the pop-up and timed out waiting. | Now scoped to only look inside the actual pop-up — benefits any brand sharing this widget. |
| SG Sweden | After closing a sign-up window opened from a search result, clicking the search icon again did nothing — needs a page refresh first (same quirk already seen on SG UK). | Added the same refresh step here. |
| SG Sweden | Game tiles use "Create Account" as their hover button text instead of the usual "Play" (this market has no Play preview at all). | Now recognized correctly instead of failing to find a nonexistent Play button. |
| LMS UK | Most game tiles only reveal their "Play Now" button on hover, and the automated hover-click was patiently retrying for a full 30 seconds every time something else got in the way. | Retry logic sped up — cut some checks from several minutes down to under a minute. |
| LMS (mobile, all markets) | Confirmed Lucky Me Slots genuinely has no "Play Now" pop-up on phone screens at all (a real, deliberate site difference, not a bug). | Checks now skip this step cleanly on phones instead of failing on something that was never going to be there. |

## Why these two went faster than average

Both brands share the same broad "SkillOnNet-style" menu family already proven out by earlier brands, which meant less first-contact investigation than a genuinely unfamiliar platform. The handful of real bugs found (mostly menu-direction, stuck-window-needs-refresh, and wording gaps) were also the kind that get fixed once and then benefit every other brand sharing that same component — several of the SG UK fixes in particular (menu-slide-direction, login-widget pop-up scoping, "Register" wording) are shared-platform fixes, not one-off patches, which is part of why the remaining 4 markets on each brand rolled out so quickly right after.
