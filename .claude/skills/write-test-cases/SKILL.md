---
name: write-test-cases
description: Write Taadeen test cases (Arabic titles, E2E / UAT scenarios) for a service such as متابعة رخص منتهية, and export them to CSV or the Excel workbook. Use when the user asks for test cases, test case titles, UAT cases, or to put cases in a CSV/xlsx.
---

# Write test cases

## Rules
- Titles are in **Arabic**, starting with "التحقق من …". Use the on-screen names exactly (statuses, task names, buttons), e.g. "مكتمل", "قرار مدير التأهيل والإغلاق", "طلب إفادة", "إعادة للموظف السابق".
- Source order: user stories (UC-xxx) first, then end-to-end scenarios.
- E2E cases each walk a **different path through the whole flow** (creation → review/assign → check → email → field visit → RCM decision → SGM/CCO/levels → final approval/reject → status), not one screen.
- For **UAT**, keep only cases that can run in a normal UAT cycle. Drop or flag cases needing aged data (e.g. 180-day escalation), unconfirmed paths, or a role nobody holds. State the preconditions: expired licences (one per case/branch), one account per role, who runs the scheduled job.
- IDs: `E2E-01…` for scenarios, `UC-xxx.n` for story cases.

## CSV export
- Save under `test-cases/<Service>-<Scope>.csv` (e.g. `test-cases/Expired-License-Follow-up-UAT-E2E.csv`).
- Quote every field and double inner quotes (`""مكتمل""`).
- Add a **UTF-8 BOM** so Excel shows Arabic correctly. Write the file with the Write tool, then prepend the BOM in PowerShell:
  ```powershell
  $p='<path>'; $b=[IO.File]::ReadAllBytes($p); if(-not($b[0]-eq 0xEF)){[IO.File]::WriteAllBytes($p,[byte[]](0xEF,0xBB,0xBF)+$b)}
  ```
  Don't put Arabic inside PowerShell command strings: the console encoding corrupts it.

## Excel workbook (expired licence follow-up)
- `test-cases/build-expired-license-test-cases.js` builds `test-cases/Expired-License-Follow-up-Test-Cases.xlsx`. The case data lives in `expired-license-cases-more.js`, and the run results and defects in `expired-license-results.js`.
- It needs `exceljs@4.4.0`, which is **not** a project dependency. Install it in the scratchpad and run:
  `NODE_PATH=<scratch>/node_modules node test-cases/build-expired-license-test-cases.js <out.xlsx>`
- There is no Python on this PC, so use Node for any spreadsheet work.
