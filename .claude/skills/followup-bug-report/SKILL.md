---
name: followup-bug-report
description: Build the expired licence follow-up bug report (xlsx + PDF with one screenshot per bug, English text, New vs Already reported) from "follow up bugs/<licence>/bugs.json". Use after a follow-up run or when the user asks for the bug report / bugs PDF.
---

# Build the follow-up bug report

## Input
`follow up bugs/<licence>/` contains `bugs.json` and one `<key>.png` per bug. `src/utils/bug-recorder.ts` writes them during the run.

## Rules
- **Every finding is a bug** (status New). Report each one separately, **with its own screenshot**. Never merge bugs.
- Write all bug text (titles, steps, expected, actual) in **English**. Keep the on-screen Arabic as an "On screen:" line. The glossary is `test-cases/followup-en.js` (`tr()`, `en()`, `bugTitle()`); add new terms there, not inline.
- The report marks each bug as **New in this run** or **Already reported (licence …)** by comparing it with the sibling licence folders. Level families (the same fault on another level) count as already reported.
- Remove false positives from `bugs.json` before building, and tell the user which ones you removed.

## Build
`exceljs@4.4.0` is not a project dependency. Install it in the scratchpad and set `NODE_PATH`:
```bash
NODE_PATH=<scratch>/node_modules node test-cases/build-followup-bug-report.js "follow up bugs/<licence>"
```
Output: `follow up bugs/<licence>/Bug-Report-<licence>.xlsx` + `.pdf`. Set `PREVIEW=<dir>` to render preview PNGs and check the layout before sending.

## Report back
- Give the counts: total, new, and already reported. List the new bugs with one line each.
- Name the bugs that were fixed since the previous licence run, i.e. those in the previous `bugs.json` but not in this one.
