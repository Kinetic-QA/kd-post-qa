# Test Automation Status Report — 2026-07-27

Prepared for: internal review / dev presentation
Source of truth: `kd-post-qa` repo (CHANGELOG.md + code) and the "Web Release QA Automation Follow Up File" tracker

---

## 1. Brand Tally — all 12 brands

Out of our 12 brands, here's where each one stands:

| Status | Count | Brands |
|---|---|---|
| ✅ **Fully automated** | 2 | Slingo (SC), Spin Genie (SNG) |
| 🔶 **Currently being automated (in progress)** | 2 | Genting Casino (GC), Mega Casino (MC) |
| ⬜ **Not started yet** | 8 | Lord Ping, Ice36, Prime Casino, Lucky Me Slots, Prime Scratch Cards, Prime Slots, Simba Games, Zingo Bingo |

**In plain terms:** 2 of our 12 brands are completely done and passing everywhere they're supposed to. 2 more are actively being worked on right now (some markets done, some still in progress). The remaining 8 haven't had any automation work started on them yet — they're next in the queue, in whatever order gets prioritized.

---

## 2. Per-Brand GEO Breakdown (for the 4 brands with any activity)

For each brand that's been touched, here's how its individual markets (GEOs) break down.

### Slingo (SC) — Fully Automated ✅

| Fully Automated | In Progress | Not Onboarded |
|---|---|---|
| 6 / 6 | 0 | 0 |

All 6 markets (UK, ROW, IE, DE, ES, SE) are built and passing cleanly. Nothing outstanding.

### Spin Genie (SNG) — Essentially Fully Automated ✅

| Fully Automated | In Progress | Not Onboarded |
|---|---|---|
| 9 / 10 | 1 | 0 |

9 of 10 markets (UK, ROW, CA, IE, DE, FR-CA, SE, ON, ES) are fully done. Alberta (AB) has one single leftover checklist item still open (the real sign-in check) — everything else on Alberta already passes.

### Genting Casino (GC) — In Progress 🔶

| Fully Automated | In Progress | Not Onboarded |
|---|---|---|
| 2 / 6 | 2 | 2 |

- **Fully automated:** Spain (ES), Sweden (SE)
- **In progress:** UK (see note below — a fix was found and confirmed working today, not yet folded into a full run), Denmark (everything passes except sign-up, which needs a Danish ID-number field our tests don't fill in yet)
- **Not started:** Rest-of-World (ROW), Ireland (IE) — both share the UK's website address and the same blocker UK has

### Mega Casino (MC) — In Progress 🔶

| Fully Automated | In Progress | Not Onboarded |
|---|---|---|
| 5 / 10 | 2 | 3 |

- **Fully automated:** .com (international), Canada, Ireland, Germany, French Canada
- **In progress:** UK (same note as GC UK below), Denmark (same sign-up gap as GC Denmark)
- **Not started:** Sweden, Spain, Alberta

---

### A note on Genting Casino UK / Mega Casino UK's "in progress" status

Both of these markets have been blocked by an automated anti-bot security check (Cloudflare) that shows visitors a "please wait while we verify you're not a robot" screen instead of the real site. **Today, we found and confirmed a working fix** for this — tested twice on two different days for Genting Casino UK, and the login and sign-up boxes both now load as real, usable forms instead of getting stuck. This fix is written into the code already. It just hasn't been run through a full end-to-end confirmation pass yet, so the tracker still shows these as "in progress" until that full pass is done and recorded.

---

## 3. Layman's Explanation: How We Handle Pop-ups and Cookie Banners

Every one of these casino sites shows the same two kinds of interruptions the moment a real visitor lands on the page: a **cookie consent banner** ("This site uses cookies...") and, on top of that, sometimes a **promotional pop-up** (a "Get your welcome bonus!" style offer box). A real person just clicks past both without thinking. Our automated tests have to do the same thing, every single time, reliably — here's how, step by step.

### Step 1 — Handling the cookie banner

1. As soon as the page loads, our test looks for a button that says something like "Allow all cookies" — but it doesn't assume the wording is always in English. We keep a running list of the exact phrase used on every market we've tested so far (English, Spanish, German, Swedish, Danish), and check for all of them at once.
2. Some brands hide this button inside a special, sealed-off piece of the page (developers call this a "shadow root") that doesn't show up the normal way — we specifically check inside that hidden area too, not just the visible page, so we don't miss it.
3. This banner doesn't always appear instantly — sometimes it takes a few extra seconds to show up, especially if the site is under load. So instead of checking once and giving up, we check repeatedly for up to about 16 seconds before we treat it as "not there." This was a real problem we hit and fixed: early on, a one-time check would sometimes run before the banner had even appeared, so the test would think there was nothing to click — and then the banner would pop up moments later and silently block every single click for the rest of that test, causing confusing failures elsewhere.
4. Once we find the button, we click it and give the page a brief moment to settle before continuing.

### Step 2 — Handling the promotional pop-up

This one's trickier because it can show up in two different designs depending on the brand, and it doesn't always appear right at page load — sometimes it slides in a few seconds later, or even mid-test while we're in the middle of doing something else.

1. We watch for **two known pop-up designs**:
   - A newer style with its own visible "X" close button.
   - An older style where the only way to close it is to press the Escape key (same as a real user would).
2. Rather than only checking once at the start, we've set up a **continuous background watcher** that runs for the entire test — think of it like a motion-sensor light that switches on the moment it detects movement, rather than someone having to flip the switch manually. The moment either pop-up design becomes visible on screen — at any point during the test, not just at the start — it's automatically detected and closed within a fraction of a second, before it can get in the way of whatever click we're trying to do next.
3. This watcher is careful not to trigger twice in a row on the same pop-up (it has a brief 2-second "cooldown" after closing one), so it doesn't accidentally interfere with anything else on the page.

### Why this matters (the business impact)

Cookie banners and promo pop-ups are invisible overlays sitting on top of the real page — if we don't close them, every click underneath silently fails to register, which looks like a completely unrelated, confusing test failure ("why did the login button not respond?") when the real cause is just an unclosed pop-up. Handling both of these reliably, on every single market and every single brand, is what makes the rest of the test suite trustworthy — it's the foundation everything else is built on top of.

---

*Report generated 2026-07-27. Data pulled live from the CHANGELOG, `helpers/geo-features.ts`, and the SharePoint tracker — reflects repo state as of this date, not a permanent snapshot.*
