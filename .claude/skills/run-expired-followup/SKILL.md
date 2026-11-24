---
name: run-expired-followup
description: Run the "متابعة رخص منتهية" (expired licence follow-up) Playwright suite end to end — view → workflow → decisions — for a given licence on TEST or UAT. Use when the user asks to run, resume, or re-test the expired licence follow-up flow.
---

# Run the expired licence follow-up suite

## Before running
- **Never search for licences yourself.** The user runs the scheduled job (timer) and gives you the licence number. The follow-up request must already exist.
- Allowed environments: `test` and `uat` only (the config refuses everything else, including prod).
- Each run uses up one licence. `FINAL_DECISION` picks the final approval branch: `approve` → "مكتمل – تمت الموافقة على تسييل الضمان المالي", `reject` → "مكتمل" (the default is `reject`).

## Settings (`tests/expired-license-followup/expired-license-followup.config.ts`)
| Env var | Meaning |
|---|---|
| `LICENCE` | licence under test (required in practice) |
| `REQUEST` | force the request number; if empty, it is looked up by licence and cached in `.workflow-state/expired-followup-<licence>.json` |
| `RCM_USER` | user for every non-specialist role (default `employee1` = MIM_SuperUser) |
| `FINAL_DECISION` | `approve` or `reject` |
| `BUGS_DIR` | default `follow up bugs` → `follow up bugs/<licence>/` |

## Run (headed, all three specs in order, one shell)
```bash
export TEST_ENV=test LICENCE=<licence> FINAL_DECISION=reject
for s in view workflow decisions; do
  rm -f .auth/test/*.lock
  npx playwright test tests/expired-license-followup/expired-license-followup.$s.spec.ts --project=chromium --workers=1 --headed
done
```
- The workflow and decisions specs can be resumed: each one skips when the request isn't at its step. State is kept in `.workflow-state/expired-followup-<licence>*.json`.
- npm shortcuts: `npm run test:expired`, `test:expired:view`, `test:expired:workflow`.

## Traps
- If Playwright is killed mid-login, it leaves `.auth/<env>/<user>.lock` behind and the next login hangs, so delete the lock file. Stopping the shell doesn't stop Playwright: also run `Stop-Process -Name node` for the Playwright child, or check that it has exited.
- Field visit date: clicking today in the calendar works, but `setDate` refuses today (flatpickr min = request creation time). After a validation re-render, reopen the task.
- The task list column "نوع العملية" truncates names, so match on the first 24 characters. Detect the feedback task with `/^طلب الإفادة/`.
- Around midnight, use the local date (`toLocaleDateString('en-CA')`), not `toISOString()`.
- Saving the visit escalates straight to "قرار مدير التأهيل والإغلاق" (process 493).

## After the run
- Every failed check is its own bug with its own screenshot: `follow up bugs/<licence>/<key>.png` + `bugs.json`. Treat every finding as a bug (status New).
- Build the report with the `followup-bug-report` skill.
