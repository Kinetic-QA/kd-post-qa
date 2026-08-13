# Playwright Terminal Commands — Quick Reference

How to run the test suite from a terminal, for each common scenario. Run these from the project's root folder (`jira-qa-agent`), in PowerShell.

A few things that apply to every command below:
- **"Whole test suite"** always means `tests/p1 tests/p2 tests/p3` together — never just `tests/` on its own (that would accidentally pull in unrelated tracking tests that need different setup).
- Set `TEST_ENV=live` for the real production site, or `TEST_ENV=qa` for the QA/staging site. Examples below use `live`.
- Add `TEST_MOBILE=true` any time you want mobile included alongside desktop — it does not replace desktop, it adds a mobile run next to it.
- **PowerShell syntax note:** the `VAR=value command` inline-env style shown below (e.g. `TEST_BRAND=SC ... npx playwright test`) is Unix/bash syntax — it does **not** work in PowerShell (`TEST_BRAND=SC : The term 'TEST_BRAND=SC' is not recognized...`). In PowerShell, set each variable with `$env:` first, chained with `;`, then the command — every example below has a PowerShell version right after the bash one. Copy the PowerShell block if your terminal prompt starts with `PS C:\...>`.

---

## 1. Run ONE specific Brand + ONE specific GEO + ONE specific viewport

Desktop only (default — no flag needed):

```
TEST_BRAND=SC TEST_GEO=UK TEST_ENV=live npx playwright test tests/p1 tests/p2 tests/p3
```

PowerShell:

```powershell
$env:TEST_BRAND="SC"; $env:TEST_GEO="UK"; $env:TEST_ENV="live"; npx playwright test tests/p1 tests/p2 tests/p3
```

Mobile only for that same brand/GEO — add `TEST_MOBILE=true` and target the mobile project by name (`<GEO>-mobile`):

```
TEST_BRAND=SC TEST_GEO=UK TEST_ENV=live TEST_MOBILE=true npx playwright test tests/p1 tests/p2 tests/p3 --project=UK-mobile
```

PowerShell:

```powershell
$env:TEST_BRAND="SC"; $env:TEST_GEO="UK"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; npx playwright test tests/p1 tests/p2 tests/p3 --project=UK-mobile
```

Swap `SC`/`UK` for whatever brand/GEO you're targeting (e.g. `TEST_BRAND=GC TEST_GEO=ES`).

---

## 2. Run COMBINED GEOs on one Brand + combined viewport (Desktop + Mobile), with a pause to switch VPN between GEOs

This is a multi-step process, not a single command — because the site detects which market you're on by your real VPN/IP, so only one GEO can be tested at a time on your end. Each command below is for one GEO; after each one finishes, **switch your VPN to the next GEO before running the next command.**

Use the SAME `EXCEL_REPORT_FILE` name across all the commands so every GEO gets added as its own tab in one combined report, instead of overwriting each other.

```
# 1. Make sure you're on the UK VPN, then run:
TEST_BRAND=SC TEST_GEO=UK TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- STOP. Switch your VPN to ES. Confirm you've switched before continuing. ---

# 2. Then run:
TEST_BRAND=SC TEST_GEO=ES TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- STOP. Switch your VPN to the next GEO. Confirm before continuing. ---

# 3. Repeat for each remaining GEO the same way...
```
TEST_BRAND=SC TEST_GEO=UK TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-12.xlsx npx playwright test tests/p1 tests/p2 tests/p3
TEST_BRAND=SC TEST_GEO=ES TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-12.xlsx npx playwright test tests/p1 tests/p2 tests/p3
TEST_BRAND=SC TEST_GEO=ROW TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-12.xlsx npx playwright test tests/p1 tests/p2 tests/p3
TEST_BRAND=SC TEST_GEO=IE TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-12.xlsx npx playwright test tests/p1 tests/p2 tests/p3
TEST_BRAND=SC TEST_GEO=SE TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-combined-2026-08-12.xlsx npx playwright test tests/p1 tests/p2 tests/p3

PowerShell (same two steps — swap the date in `EXCEL_REPORT_FILE` for today's):

```powershell
# 1. Make sure you're on the UK VPN, then run:
$env:TEST_BRAND="SC"; $env:TEST_GEO="UK"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-combined-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- STOP. Switch your VPN to ES. Confirm you've switched before continuing. ---

# 2. Then run:
$env:TEST_BRAND="SC"; $env:TEST_GEO="ES"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-combined-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- STOP. Switch your VPN to the next GEO. Confirm before continuing. ---

# 3. Repeat for each remaining GEO the same way...
```

The combined report gets saved to `combined-reports/sc-combined-2026-08-07.xlsx` — not the usual `Test Reports/` folder — specifically so it survives every GEO's run without being wiped.

---

## 3. Run ALL GEOs for one Brand + combined viewport (Desktop + Mobile), with a pause to switch VPN between GEOs

Same idea as #2, just covering every GEO that brand has. Same rule: one VPN/GEO at a time, same `EXCEL_REPORT_FILE` name reused for all of them, pause between each for the VPN switch.

Example for brand **SC** (GEOs: UK, ROW, IE, ES, SE):

```
# 1. UK VPN, then:
TEST_BRAND=SC TEST_GEO=UK TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-all-geos-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to ROW, confirm, then: ---
TEST_BRAND=SC TEST_GEO=ROW TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-all-geos-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to IE, confirm, then: ---
TEST_BRAND=SC TEST_GEO=IE TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-all-geos-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to ES, confirm, then: ---
TEST_BRAND=SC TEST_GEO=ES TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-all-geos-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to SE, confirm, then: ---
TEST_BRAND=SC TEST_GEO=SE TEST_ENV=live TEST_MOBILE=true EXCEL_REPORT_FILE=sc-all-geos-2026-08-07.xlsx npx playwright test tests/p1 tests/p2 tests/p3
```

PowerShell (same sequence):

```powershell
# 1. UK VPN, then:
$env:TEST_BRAND="SC"; $env:TEST_GEO="UK"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-all-geos-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to ROW, confirm, then: ---
$env:TEST_BRAND="SC"; $env:TEST_GEO="ROW"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-all-geos-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to IE, confirm, then: ---
$env:TEST_BRAND="SC"; $env:TEST_GEO="IE"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-all-geos-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to ES, confirm, then: ---
$env:TEST_BRAND="SC"; $env:TEST_GEO="ES"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-all-geos-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3

# --- Switch VPN to SE, confirm, then: ---
$env:TEST_BRAND="SC"; $env:TEST_GEO="SE"; $env:TEST_ENV="live"; $env:TEST_MOBILE="true"; $env:EXCEL_REPORT_FILE="sc-all-geos-2026-08-07.xlsx"; npx playwright test tests/p1 tests/p2 tests/p3
```

Swap in whichever GEOs belong to the brand you're testing — check `helpers/brand-urls.ts` for the full current list per brand.

Once the very last GEO finishes, the combined workbook in `combined-reports/` has every GEO as its own tab. Copy that finished file into `docs/Backup Test Results/` as usual.

---

## 4. Getting Playwright's own combined duration for a VPN-switch run (#2 or #3)

Every run above already saves a small extra file in the background automatically (a "blob" report) — no extra flag needed, it's on by default in `playwright.config.ts`. This is what lets you get a single, official Playwright-generated report and total duration covering every GEO in the sequence, instead of each GEO's run only showing its own duration.

**After the very last GEO finishes**, run one command to combine them all:

```
TEST_BRAND=SC node merge-reports.cjs
```

PowerShell:

```powershell
$env:TEST_BRAND="SC"; node merge-reports.cjs
```

This finds every GEO's blob file from that day for that brand, merges them with Playwright's own `merge-reports` command, and opens one combined HTML report — with one real, Playwright-calculated total duration across the whole run. It gets saved to `Test Reports/SC/_blob-reports/<date>/merged-html-report/`.

This is purely additional — it doesn't change or replace the Excel workbook, which keeps being generated the same way as always and remains the detailed backup report.

---

*Last updated: 2026-08-07 (added PowerShell syntax for every command)*
