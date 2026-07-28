# Why Lord Ping UK Took the Whole Session

**Date:** 2026-07-28
**Scope:** Lord Ping (LP) UK onboarding
**Result:** Fully clean — 48 checks passed, 0 real failures, 0 skips

## The short version

Lord Ping is a **brand-new brand** — the first time we've ever tested it — and it turned out to be built differently from every other brand we've onboarded so far, in more ways than any single previous onboarding. Onboarding a brand-new brand is always slower than adding a new country to a brand we already know, because there's no existing settings file to lean on — everything has to be confirmed live, one piece at a time, and several pieces turned out to be genuinely new shapes we'd never seen before, not just small variations. Two of the day's four-plus hours were also lost to our own mistakes along the way (below), not the site itself.

## Why a brand-new brand costs more than a new country

When we add a new **country** for a brand we already test (e.g. Prime Casino Sweden, added earlier today), most of the underlying page structure is already known — we're mainly confirming which specific pages/features exist for that country and filling in a settings row. When we add a **brand-new brand**, none of that exists yet: every button, every menu, every page layout has to be inspected on the real live site first, before writing a single line of test code. That first-time cost is normal and expected — it's exactly what happened when Mega Casino, Genting Casino, and Prime Casino were each added earlier this project.

## What made Lord Ping specifically slower than a typical first-time brand

On top of the normal "first time seeing this brand" cost, Lord Ping had an unusually high number of genuinely new structural quirks — six separate ones, each requiring its own live investigation and fix, where a typical new brand has one or two:

1. **The sign-in success page lives at a different kind of web address than every other brand** — a regular page on the same site, not the special "playsecure." address every other brand redirects to.
2. **The menu that shows game categories (Slots, Live Casino, etc.) is a slide-out drawer that's tucked out of sight by default on desktop too**, not just on phones — every other brand shows this menu directly on the page.
3. **The sub-categories inside that menu (Jackpots, Megaways, "Themes," etc.) only exist inside that same slide-out drawer** — nowhere else on the page — so testing them required teaching our checks a whole new way to open the drawer, click a specific category to expand it, and then click the sub-item, instead of clicking straight from the page like every other brand allows.
4. **A brand-new type of game-browsing control ("Themes") that behaves like a searchable dropdown menu** — pick a theme, the page jumps straight to that theme's game list — needed a new kind of check built from scratch, including trying three different themes in a row to make sure it wasn't a fluke.
5. **On phones, the Log In and Join buttons live in the bottom toolbar, not the slide-out drawer** — completely different from every other brand's phone layout, which meant six separate sign-in/sign-up checks were all quietly failing on the phone version for the exact same wrong assumption.
6. **The footer, the search box wording, and one specific game's image were all just different enough** (different footer styling name, "Search" instead of "Search game," and a broken image on one particular game tile) to trip up checks that had worked unmodified on every previous brand.

Each of these needed the same process: inspect the real site live, confirm exactly what's different, then fix the check — never guess, per your instruction to inspect thoroughly rather than skip or assume. That's the right way to do it, but it's inherently slower than reusing something already proven to work.

## Where time was lost to our own mistakes (not the site)

Being straightforward about the parts that were on us, not Lord Ping's site:

- **A check was skipped entirely when only part of it didn't apply.** The "game filter" check bundles three unrelated things (a scrolling carousel, its arrow buttons, and a separate "Load more/See all" link). Lord Ping doesn't have the carousel, so the whole check was skipped — but the "Load more" part works fine here and should have kept running. You caught this directly, and it's now fixed so each part is judged on its own instead of one missing piece taking out everything.
- **Two ~25-minute full test runs were wasted on a broken search command** while trying to pin down exactly which 2 checks had been skipped, plus a redundant extra run that overwrote the very report we needed to check. That's roughly 50 minutes of pure tooling error, not testing time.
- A handful of individual re-runs (about 8 full desktop+phone passes over the course of the day, each taking roughly 25-30 minutes) were needed to progressively work through the list above, since each fix could only be confirmed by actually re-running the whole suite live against the real site.

## Bottom line

Lord Ping UK is now fully onboarded and clean, and every fix made today is a genuine, reusable improvement — several of them (the shared mobile sign-in button fix, the payment-page-address fix, the footer fix) will make the *next* new brand or country faster, not just this one. But this was a legitimately bigger job than a typical new-country addition, plus about 50 minutes of avoidable tooling mistakes on our end. Lord Ping's other markets (COM, CA, IE, DE, ES, SE) should go faster now that the brand's core quirks are already known and fixed.
