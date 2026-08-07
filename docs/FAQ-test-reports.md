# FAQ: Test Reports & Run Results

Plain-English answers to common questions about how our automated test reports work.

---

**Q: Can the built-in Playwright report give us a combined results summary, like the Excel report does?**

Playwright's own reports don't build a nice summary table the way our Excel report does — no tabs, no readable columns, no cross-brand rollup. That formatted summary is something we built on top of Playwright specifically because Playwright doesn't offer it out of the box.

That said, when we run multiple markets and both desktop + mobile together, Playwright does combine everything from that run into one report — it's just presented as a browsable list/tree instead of a spreadsheet.

---

**Q: If we run a brand across all its markets (GEOs) on both Desktop and Mobile, does Playwright create separate reports for desktop and separate ones for mobile, per market?**

No — it's all one combined report. Every market and every device type (desktop/mobile) that's part of the same run gets saved into a single report. Inside that one report, you can filter by market or device, but there's only one report file, not several.

This works the same way our Excel report does (one workbook, one tab per market/device) — Playwright just shows it as one interactive webpage instead of spreadsheet tabs.

---

**Q: Does Playwright tell us how long the entire run took?**

Yes. Playwright tracks and reports the total time for the whole run automatically — no custom work needed for that part.

---

**Q: Where do we find that overall run time?**

There are three places, all generated directly by Playwright itself (not by our custom Excel add-on):

1. **The report webpage** – When you open the test report, the total run time is shown right at the top in the summary.
2. **The terminal/log output** – When a run finishes, Playwright prints a line like "87 passed (3m 42s)" showing the total time.
3. **The results data file** – Playwright also saves a plain data file for each run that includes the exact total duration, in case anyone wants to pull the number programmatically.

**For management specifically:** if the ask is "show us a number that comes straight from Playwright, not anything custom-built," the report webpage's summary header or the results data file's total-duration value are the two to point to — both come entirely from Playwright itself. Our Excel report shows this too, but it's reading the same underlying data Playwright already recorded — it doesn't calculate anything new.

---

*Last updated: 2026-08-07*
