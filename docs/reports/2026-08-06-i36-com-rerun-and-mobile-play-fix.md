# Ice36 (I36) re-run session — COM, IE, CA, ES — 2026-08-06

Internal engineering report. Not for Slack/non-technical distribution.

## Why this session happened

A teammate flagged possible issues in Ice36 COM and IE. Re-ran the full checklist
(desktop + mobile together) against COM first, then IE, CA, and ES, each from the
matching VPN connection, to confirm current state and chase down anything real.

## COM — 7 runs, 2 real fixes landed

| Run | Result | Notes |
|---|---|---|
| 1 (baseline) | 30 passed, 2 failed, 16 skipped | `[COM]` GCN homepage `page.goto` timeout (15s); `[COM-mobile]` WH-01 PLAY button never opened `#account` |
| 2 (local 30s override on GCN's goto only) | 29 passed, 3 failed | GCN cleared, but `sidebar-navigation.spec.ts` and `contact-us-page.spec.ts` hit the *same* 15s `page.goto` timeout instead — proved it's a general slow-load issue on this connection, not one flaky test |
| 3 (reverted local override, raised global `navigationTimeout` 15s→30s in `playwright.config.ts`) | 30 passed, 1 failed, 1 flaky | All `page.goto` timeouts gone. Only WH-01 PLAY button remained |
| 4 (rerun, no code change, to confirm) | 30 passed, 1 failed, 1 flaky | PLAY button failure reproduced identically — ruled out one-off flake |
| 5 (`playBtn.click()` → `playBtn.evaluate(el => el.click())`, native DOM click) | 28 passed, 1 failed, 3 flaky | No change — click registers (button shows active state in screenshot) but `#account` never loads |
| 6 (widened wait 10s→20s on the post-click `toHaveURL` assertion) | 29 passed, 2 failed, 1 flaky | Still failed after 20s / 42 polls — ruled out a timing issue entirely |
| 7 (`page.touchscreen.tap()` on the button's real bounding-box coordinates instead of any click emulation) | **30 passed, 0 failed, 2 flaky (both passed on retry)** | Fixed |

### Root cause 1 — slow page loads on this connection
The default `navigationTimeout` (15s) was too tight for `page.goto` under today's
South Africa connection. Not brand-specific — any spec calling the bare
`page.goto('', { waitUntil: 'domcontentloaded' })` pattern could hit it depending on
which test drew the slow window. Fixed globally in `playwright.config.ts`
(`navigationTimeout: 15_000` → `30_000`), not per-test, since three unrelated spec
files hit the identical timeout in different runs.

### Root cause 2 — mobile PLAY button needs a real touch event, not a click
`tests/p1/website-header.spec.ts`, Step 2b (`WH-01`). The mobile bottom-nav "PLAY"
button on Ice36 COM's real site only responds to a genuine touch tap — neither
Playwright's coordinate-based `.click()` nor a synthetic DOM `el.click()` fired its
handler, even though the button visibly took focus/active state after each attempt.
The user confirmed a real finger tap on the actual device opens the widget
immediately.

Fix: replaced the click with `page.touchscreen.tap()` on the button's real
bounding-box center coordinates. This is the first place in the suite using
`page.touchscreen` — no prior precedent existed for this class of touch-only
handler (distinct from the existing "click not registering, use native DOM click"
pattern used elsewhere in this file for PSL UK and the search icon, which are a
different failure mode).

**Worth flagging for other brands/markets**: any other mobile-only tab-bar/footer
button that behaves like this (visually "clicks" but doesn't navigate under
Playwright, works fine to a real finger) is a candidate for the same
`page.touchscreen.tap()` fix rather than another native-click attempt.

## IE — clean

32 passed, 0 failed, 2 flaky (both passed on retry — one 180s test-timeout /
mobile-number field render delay), 14 skipped for expected reasons. No repeat of
anything COM hit; nothing matching what the teammate flagged surfaced in this run.

## CA — clean

31 passed, 0 failed, 3 flaky (all passed on retry — same registration-field timing
pattern as IE, plus one mobile payment-strip logo-redirect check that recovered on
retry), 14 skipped.

## ES — clean

34 passed, 0 failed, 0 flaky, 14 skipped. Fastest and cleanest of the four, ~16
minutes end to end.

## Files changed

- `playwright.config.ts` — `navigationTimeout` 15s → 30s
- `tests/p1/website-header.spec.ts` — WH-01 Step 2b PLAY button now uses
  `page.touchscreen.tap()` instead of `.click()`
- `CHANGELOG.md` — dated entry added for both fixes

## Open items

- DK not re-tested this session — last confirmed complete 2026-08-05, not touched
  today.
- Nothing new found on IE that matches what the teammate described — worth asking
  them for more specifics (which page/button/flow) if this comes up again.
