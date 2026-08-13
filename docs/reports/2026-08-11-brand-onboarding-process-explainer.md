# How We Add a New Brand — Process, Timing, and a Faster Way Forward

**Date:** 2026-08-11
**Purpose:** Plain-language explainer for the follow-up meeting — what we actually do when a new brand gets added, why it takes as long as it does, and whether there's a smarter way to do it.

---

## 1. What our process looks like today (high level)

Think of it like moving into a new house that's supposedly "the same layout" as one you've lived in before, but you don't get to see it until moving day.

| Step | What happens |
|---|---|
| 1. Start from a similar brand | Most of our brands run on a handful of shared website platforms, so we start by copying the checklist from a brand that's already working on the same kind of platform — a "best guess" starting point, not a blank page. |
| 2. Quick page check | We send a plain, no-frills request straight to each page's web address and read back whether the server says "yes, this page exists" or "no, it doesn't." No browser involved — it's a text/code-level check, like knocking on a door to see if anyone answers, without stepping inside. This tells us *which pages exist* (does this brand have a blog? a promotions page?), not what they look like or how they behave. |
| 3. Run the full checklist live | We run our entire automated checklist against the real, live website using that borrowed starting guess. This is code-driven end to end — our automation tool loads each page and interacts with it (clicks buttons, fills forms) exactly like a real visitor would, and reports back pass/fail results. Nobody is watching a screen and eyeballing it. |
| 4. See what breaks | Whatever doesn't work, we go dig into that exact spot in the page's underlying code/structure (its real button labels, menu markup, form fields) and into the automated tool's error output, to see what's actually different from the brand we borrowed from. |
| 5. Fix and re-run everything | We correct the checklist to match what we actually found, then re-run the **entire** checklist again (computer + phone) to make sure the fix worked and nothing else broke. |
| 6. Repeat until clean | Steps 4-5 repeat, one discovery at a time, until a full run comes back with zero real problems. |
| 7. Roll out to other countries | Once the brand's core quirks are known, we repeat a lighter version of this for each additional country that brand operates in — this part is faster because the big unknowns are already solved. |

**In short: we learn what's different about a new site by testing it, watching it fail, and fixing one thing at a time — not by fully mapping the site out before we start.**

**Important clarification: none of this is "visual" inspection.** There's no step where a person looks at screenshots or eyeballs how a page renders. Every step is either a plain code-level request (step 2) or reading raw page structure/automated test output (steps 3-4) — even when our tool "opens" a page, that's the automation clicking and filling things in on its own, not a person watching and judging by sight. "Crawl" is a fair word for step 2 (checking which pages exist across the site); it's not a visual process anywhere in the pipeline.

---

## 2. How long does it take, and why

| Scenario | Typical time | Why |
|---|---|---|
| Brand-new brand (first market, e.g. Simba Games UK, Lucky Me Slots UK) | Roughly one full working day | Everything about the site is unknown up front — the menu, the buttons, the sign-up form, all of it has to be discovered live, one surprise at a time. |
| An especially different brand (e.g. Lord Ping UK, 6 major structural surprises) | A full extended session (4+ hours) | More surprises than usual, each needing its own investigate-fix-confirm cycle. |
| Additional countries for a brand already onboarded | A few hours per country, sometimes same-day for several countries | The big unknowns are already solved — we're mostly just checking "does this country have the same setup, or a small variation?" |

**The real reason it's slow isn't the investigating itself — it's the confirming.** Every time we fix one small thing (say, "the menu slides open from the right side, not the left"), we can't just check that one spot — we have to re-run the **entire** checklist, computer and phone together, to be sure the fix is right and nothing else broke. That full re-run takes about 25-30 minutes on its own.

So if a brand-new brand has, say, 6 real surprises to fix (which is normal), that's not 6 quick checks — it's roughly 6-plus full 25-30 minute re-runs, one after another, plus the time spent inspecting each surprise by hand in between. That's where a full day goes.

**Analogy:** it's like baking a cake where you can only tell if it's done by baking the whole thing for 30 minutes, tasting it, changing one ingredient, and starting the whole 30-minute bake over again — repeated for every ingredient you get wrong.

---

## 3. Is there a faster way — and why didn't we start with it?

**Yes — there's a better order to do this in.** Right now we discover the site's real structure by testing it live and watching it fail. A faster approach flips that order:

- **Before writing a single test**, do one upfront "walkthrough" of the new brand's key pages (homepage, sign-in, sign-up, blog, contact page, etc.) and write down what's actually there — the real menu items, real button wording, real form fields — in one sitting.
- **Then** build the checklist against that real information from the start, instead of guessing from a similar brand and discovering the differences one at a time.
- **While fixing anything that still slips through**, check just that one specific piece instead of re-running the entire 25-30 minute checklist every single time — save the full run for the very end, as a final confirmation.

This wouldn't eliminate surprises entirely, but it would turn "discover the site's shape through a dozen full test runs" into "know the site's shape once, then confirm it once" — cutting out most of the repeated 25-30 minute cycles.

**Why we didn't do it this way from day one:** Early in this project, every brand we onboarded was the first of its kind — there was no reliable "similar brand" to compare against yet, so the fastest real option at the time genuinely was hands-on trial and observation. It's only after onboarding several brands (Mega Casino, Genting Casino, Prime Casino, Slingo, Spin Genie, Lord Ping, Simba Games, Lucky Me Slots, Ice36, Zingo Bingo) that a clear pattern emerged — most of them share a small number of underlying website platforms, which is exactly the kind of repetition that makes an upfront "walkthrough" step worth building. On top of that, every session so far was scoped around "get this specific brand fully working today," not "pause and improve how we work" — so nobody stopped mid-project to build that step, even once the pattern became obvious.

**Bottom line:** the slower, discover-as-you-go approach made sense at the start when we had nothing to compare against. Now that we have a solid track record across many brands on the same platforms, it's a good time to build the upfront walkthrough step — it should meaningfully cut down onboarding time on the brands we still have left to add.
