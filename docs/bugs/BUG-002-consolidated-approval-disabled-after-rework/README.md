# BUG-002 — WITHDRAWN (not an application bug)

**Status:** withdrawn on 2026-10-31. QA confirmed that "توصية بالقبول" in Consolidated Feedback ("المراجعة العامة") is enabled once **every** assessed section is "تحققت المتطلبات", as TP-16316 requires.

**What actually happened:** when the Technical Assessment comes back for reassessment, each section's previous rating is pre-selected. The returned section was still "لم تتحقق المتطلبات" from the previous round. The automation only rated sections that had no rating, so that section stayed Not Met, and its log counted sections instead of their state, wrongly reporting "all met". The application correctly kept Recommend Approval disabled.

**Fix in the automation:** `TransferTaskResponsePage.markAllUnratedMet` now sets every section to "تحققت المتطلبات" unless it was rated Not Met deliberately in the same answer, then asserts that no section is left Not Met.
