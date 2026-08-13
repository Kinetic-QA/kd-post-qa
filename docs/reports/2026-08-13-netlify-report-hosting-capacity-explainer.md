# Netlify Report Hosting — How Much Capacity Do We Actually Have?

**Date:** 2026-08-13
**For:** Reeve — reference for planning shared-report rollout across brands (SC, SNG, and beyond)
**Related:** `deploy-reports.cjs`, `backfill-report-links.cjs`, site `kd-post-qa-reports` under the QA TEAM Netlify account

## Short version

We're on Netlify's **Free plan — 300 credits a month, resets every billing cycle, no rollover**. Uploading a report doesn't really cost anything size-wise (each deploy is a flat 15 credits no matter how big it is). What actually costs credits is **teammates viewing the report** — 20 credits per GB served. On the Free plan, that works out to roughly **13.5GB of viewing traffic per month** across every brand we deploy, after accounting for the deploys themselves. If that runs out, the site pauses until next month's reset — no automatic top-up on Free.

## How the credits actually break down

| Action | Cost | What this means for us |
|---|---|---|
| Each `netlify deploy --prod` | **15 credits, flat** | Doesn't matter if the folder is 100MB or 10GB — same cost. Uploading isn't the bottleneck. |
| Bandwidth served to viewers | **20 credits per GB** | This is the real budget item — every time someone opens a report and its videos/screenshots load, that counts. |
| Files per folder | **54,000 max** (hard technical limit, not credit-related) | Not a concern at our scale — our biggest report folder has a few hundred files. |

## Where that leaves us

- Monthly allowance: **300 credits**
- Deploying SC + SNG (one deploy each) costs 30 credits
- Remaining 270 credits ÷ 20 credits/GB = **~13.5GB of report-viewing traffic per month**, shared across every brand deployed to this one Netlify site

Each brand's trace-trimmed report (video + screenshots + native results, no trace-viewer data) currently runs about **1.4GB**. So the 13.5GB budget covers a fair number of teammate views per month, but it's not unlimited — if this becomes a daily habit for a bigger group, or more brands get added to the same site, it's worth checking usage before it becomes a surprise.

## What happens if we run out

- **Free plan has a hard cap and no auto-recharge** — once the 300 credits for the month are used up, the site pauses (stops serving) until the next billing cycle resets it.
- Credits **reset to 300 every month** — nothing rolls over, but nothing carries a penalty either. A quiet month doesn't "bank" credits for a busy one.

## What to watch going forward

- If more brands get added to the same Netlify site (SC + SNG now, more later), the same 300-credit pool covers all of them combined — it's not per-brand.
- If usage starts getting close to the ceiling, the fix is either: upgrade off the Free plan (unlocks auto-recharge/rollover), or split brands across separate Netlify sites/accounts if that ever makes sense operationally.
- There's no API field that reports real-time credit usage — the authoritative number lives in the Netlify dashboard's Usage/Billing page (`app.netlify.com/teams/reeve-t/billing`), not something scriptable from here.
