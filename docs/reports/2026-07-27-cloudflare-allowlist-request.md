# Request: Please Allow-List Our QA Automation Traffic

**For:** Dev team / Site Admin
**Re:** Genting Casino UK and Mega Casino UK — automated testing blocked by the security/anti-bot service
**Date:** 2026-07-27

---

## The short version

Our automated testing tool is being intermittently blocked by the anti-bot security check ("Performing security verification") on **Genting Casino UK** and **Mega Casino UK**. We've tried a workaround on our end, and it helps sometimes — but not reliably enough to trust. We'd like to ask whether our testing traffic can be added to an allow-list (a "these visits are known and safe" list) so this stops happening at the source, rather than us continuing to work around it from the outside.

---

## What's actually happening

Every time our automated tests visit these two markets' websites to check things like the login box or sign-up form, there's a real chance the site's security service — a well-known one called Cloudflare, which most big websites use — decides our visit looks suspicious and shows a "please wait while we verify you're not a robot" screen instead of the real page.

A real customer occasionally sees a milder version of this too (a simple checkbox to tick). But for our automated tool, this can go further: it sometimes blocks the login/sign-up box itself from loading any content at all — the box appears on screen, but it's completely empty, with nothing to type into. When that happens, we obviously can't test whether login and sign-up actually work, because the page is treating us as a threat rather than a visitor.

## What we tried on our end

We found and built in a technique that makes our automated browser look less like an obvious script and more like a normal visitor's browser — things like matching the browser's language/timezone settings to the same country as the test, and removing some telltale signs that give away automated tools.

**This helped, but only some of the time.** We tested it twice, on two separate days, and both times the login and sign-up boxes loaded correctly with real, fillable forms. But testing it again a third time — with absolutely no changes to our code or setup — the exact same page went right back to showing a completely empty box, as if the fix had never been applied at all.

That inconsistency tells us something important: **this isn't something we can reliably fix by changing how our tool behaves.** The security service appears to be making its own judgment call about our traffic each time, sometimes allowing it through and sometimes not, regardless of what we do on our end.

## What we're asking for

Rather than keep trying to out-smart the security check from the outside — which is a bit of a moving target, and not something we can guarantee will keep working even if we get it working again — we'd like to ask:

**Could our automated testing traffic be added to an allow-list (sometimes called a "bypass rule" or "trusted traffic" rule) for these two markets, so it isn't treated as suspicious in the first place?**

This is a standard, common request for internal QA/testing tools — the goal isn't to bypass security for real customers, only to let our own known, internal testing tool through cleanly, the same way a company might allow-list its own office IP address or a trusted monitoring service.

To set this up, we'd be happy to provide whatever's needed on our side — for example:
- The specific IP address(es) or IP range our tests run from
- A distinct, identifiable browser/user-agent signature for our tool, if that's a more suitable option
- Whatever else the security service's allow-list feature typically asks for

## Why this matters

Right now, these two markets are the only ones out of our fully-active brands where we can't reliably confirm login and sign-up work end-to-end through automation — every other market we test runs cleanly. Getting this resolved properly (rather than patched around) means these two markets get the same level of confidence and coverage as everywhere else, and we stop spending time re-investigating something that isn't really a bug in our tests — it's a security system correctly doing its job, just without knowing our tool is one of the "good guys."

---

*Prepared 2026-07-27. Happy to walk through any technical detail on a call if useful — the goal here is just to open the conversation about an allow-list, not to hand over a finished configuration change.*
