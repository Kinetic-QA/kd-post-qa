# Why "Just Give Claude the Code" Doesn't Skip the Work — and How Long a Brand Really Takes

**For:** management, re: questions after the Thursday demo
**Date:** 2026-08-06
**Prepared by:** Reeve, with Claude

---

## The question being asked

"Claude adds a brand by crawling the site or inspecting it — so why not just hand Claude the code elements up front and have it translate them? Wouldn't that be faster?"

It's a fair question to ask. The short answer: it would save a small amount of time on a small part of the job, but it would not remove the part that actually takes the hours — and here's why, in plain terms.

## The analogy

Think of each brand's website like a different store in the same mall chain. Same kind of business, same general idea, but a different layout, different aisles, different checkout counter, different signage — even different languages on some signs. If you hand someone a map of Store A and say "just use this for Store B," they'll walk into a wall that isn't there on Store A's map.

"Code elements" are that map — a snapshot of exactly where things sit on ONE brand's specific pages: where the sign-up button is, what the registration form's steps look like, what the cookie pop-up says, what's in the menu. Every brand has a genuinely different version of all of that. Copy-pasting Store A's map into Store B means some things happen to line up and most don't — and the ones that don't fail *silently*: the check looks like it passed, but it never actually tested anything real.

## How the onboarding actually works today

It's not a full-site crawl, and it's not "looking at it" visually like a person browsing. It's targeted and iterative, and it follows the same repeatable process every time:

1. **Check the cookie pop-up first, every time.** If the "accept cookies" button's exact wording isn't recognized, it silently blocks every single click after it on every page — so this gets confirmed before anything else, not discovered halfway through.
2. **Go page by page, flow by flow** (sign-up, login, the menu, the footer, search, a pop-up) and pull back exactly what's really on the live page — not what's assumed to be there based on a similar brand.
3. **Write down what's different** in the brand's own settings file (things like: what categories exist in the menu, what the "final step" button says, whether there's a Bingo consent box, what the payment page's web address is called). This is the brand's own reference sheet going forward — every future country for that brand starts from it instead of from scratch.
4. **Run the real automated checks against the real live site** and see what actually happens — not just whether it looks right, but whether the check can genuinely click through the whole flow.
5. **Fix whatever doesn't match reality**, then re-run to confirm the fix actually holds, not just that it looks plausible.
6. **Repeat steps 2–5** for the next page or flow, until every check either passes for real or is skipped for a confirmed, documented reason (e.g. "this brand has no Bingo, so there's no Bingo checkbox to test" — not "we're not sure, so we skipped it").
7. **Run the full set of checks twice** — once for desktop, once for mobile — since the two versions of a site are often built differently underneath even when they look similar.
8. **Save the results** (a report showing exactly what passed/failed/was skipped and why) so there's a record, and flag anything that looks like a genuine site bug rather than a test problem.

That loop — confirm, write it down, test, fix, re-confirm — is where almost all the time goes. Not "where is the button," but "does the button actually do the right thing across every step, on desktop and mobile, without secretly skipping a check." Every brand's settings file from step 3 is reused for that brand's next country, which is exactly why a new *country* is so much faster than a new *brand* (see the table below).

## Why handing over code up front doesn't remove that

Giving over the code for one element (say, a sign-up button) tells us it exists and roughly where. It does **not** tell us:

- Whether the sign-up flow has 3 steps or 5, or an extra question this brand snuck in
- Whether a country-specific version of the same page behaves differently
- Whether a cookie pop-up silently blocks every click afterward until dismissed
- Whether the menu structure has an entire category (e.g. "Live Casino") that another brand doesn't have at all
- Whether the button *actually works* when clicked, every time, on both phone and desktop

Those are exactly the things that took real time on the two most recent brand-new brands we onboarded — Lord Ping and Ice36 (see the "real numbers" section below). A code snapshot is a photo of the store shelf. It doesn't tell you whether the register rings up the discount correctly. That only comes from actually trying it.

## The honest, nuanced version

Pre-supplied code snippets *can* help a little, in one narrow case: if someone already knows a specific trouble spot and hands over that one element's code, it can save the time of hunting for it. That's real, but it's a small slice of the total job — most of the time is the confirm-test-fix-reconfirm loop across many pages and flows, and that has to happen live regardless of what code is handed over first.

## The one-liner for the room

> "Code tells you what's *supposed* to be there. Testing tells you what actually happens when you use it — and that second part is the job. No shortcut skips it."

---

## How long does a brand actually take?

This varies a lot depending on whether it's a **brand-new brand** (never tested before) or a **new market/country for a brand we already know**. Real numbers from this project:

| Type | Example | Time | Why |
|---|---|---|---|
| Brand-new brand | Ice36 (I36) UK | ~2h 37m | New platform layout, new taxonomy, everything confirmed from scratch |
| Brand-new brand (unusually complex) | Lord Ping (LP) UK | 4+ hours (a full session) | 6 separate genuinely new structural quirks (desktop-only slide-out menu, different login redirect shape, phone-only button placement, etc.), plus ~50 min lost to our own tooling mistakes, not the site |
| New market, existing brand | Lord Ping Ireland | Well under a full session — "near-clone" of a market already done | Same layout/taxonomy as an already-onboarded market, only real differences confirmed |
| New market, existing brand (locale-heavy outlier) | Slingo (SNG) FR-CA | A full session | Every on-screen text label needed individual live confirmation for a brand-new locale — this is the exception, not the rule, and worth timeboxing explicitly next time |

**Rule of thumb:**
- **Brand-new brand:** roughly **2.5 to 4+ hours**, depending on how many genuinely new page structures it has. Expect this every time we add a brand we've never touched — same cost paid for Genting Casino, Mega Casino, Prime Casino, Lord Ping, and Ice36 so far.
- **New country/market for a brand we already test:** usually **well under 2 hours**, because most of the page structure is already known — we're just confirming what's different. New languages/locales are the main thing that can push this back up toward brand-new-brand cost, since translated text has to be confirmed live, not guessed.

Every fix made during a brand-new onboarding is reusable — it makes the *next* brand's onboarding faster too, not just that one. That compounding is why the first few brands cost more than the ones after them.
