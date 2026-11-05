# BUG-001 — Exploration Licence Transfer: "مهمة الرقابة" (Field Inspection) cannot be submitted

| | |
|---|---|
| **Environment** | TEST — `https://platform-test.taadeen.dev` |
| **Service** | تحويل رخصة الكشف (Exploration License Transfer) |
| **Task** | Employee task "مهمة الرقابة" (Field Inspection), ProcessTypeId 444 |
| **Severity** | Major. With a comment, no transfer can pass this task; without a comment it works (workaround), but the employee cannot record a remark and gets no error message. |
| **First seen** | 2026-10-31 (requests 76358, 76360, 76362). The same task submitted normally on 76352, 76354 and 76356 on 2026-10-30. |
| **Reproduced** | 4 times, on 3 requests, by automation and manually |
| **Reported by** | Taadeen automation (Playwright), confirmed manually by QA |

## Steps to reproduce

1. As the transferor, submit an Exploration License transfer. As the transferee, approve it and submit the 8-step application. Any recent request works, e.g. **76362**.
2. Employee portal → Task Management → search the request → task **"مهمة الرقابة"** → "إسناد إلى" → "لي".
3. "الرد على الطلب" → tab **"الرد علي الطلب"**.
4. Under "امتثال المحيل" choose **ممتثل**, and under "امتثال المحال اليه" choose **ممتثل**.
5. Write a description ("الوصف"), for example "تمت المراجعة". **The trigger is the comment.** With any comment, in either party's field or both, and with any text, the response is refused. Without a comment it submits (confirmed manually by QA, 2026-10-31).
6. Click **"إرسال الرد"**.

## Expected

The response is saved. The page returns to Task Management, the task becomes completed, and the next task "مراجعة نتيجة مهمة الرقابة ونظم المعلومات الجغرافية" is created (once GIS Review is also done). If the server refuses, a message explains why.

## Actual

- Nothing visible happens. The page stays on the task, no message or toast appears, and the task stays **"قيد التنفيذ"**.
- The server call made by the button **fails silently**:

```
POST /Licenses_Exploration_Transfer/screenservices/Licenses_Exploration_Transfer_CW/EmployeeTasks_Flow/Inspection_TechCompliance_Tasks_WB/ActionCreateInspectionTask_BL
HTTP 200
{"data":{"Out_Response":{"Is_Success":false,"Message":"تعذر إرسال التقييم"}}}
```

So there are two defects:

1. **Backend:** `ActionCreateInspectionTask_BL` refuses the inspection response ("تعذر إرسال التقييم", "the evaluation could not be sent").
2. **UI:** the refusal message is never shown to the employee. The screen gives no feedback at all.

## Evidence

| File | Content |
|---|---|
| `1-before-submit.png` | The filled response (both parties "ممتثل", description) just before "إرسال الرد" |
| `2-after-submit-no-message.png` | 10 s after the click: same screen, no message |
| `server-call.txt` | Request URL, HTTP status and the full response body |
| `reports/bugs/BUG-001/` (local, not in git) | Recording of the reproduction on request 76362 (2026-10-31 00:58 local): `employee-task-management.webm` (search, assign, open), `employee-inspection-task-submit.webm` (respond, "إرسال الرد", nothing happens), and `trace.zip` with the full network log (`npx playwright show-trace reports/bugs/BUG-001/trace.zip`). |

## Affected requests (TEST)

| Request | Result |
|---|---|
| 76358 | Refused (later withdrawn) |
| 76360 | Refused, 3 attempts with different comments (withdrawn) |
| **76362** | Refused, 2 attempts. Left open at this task for investigation. |
| 76352, 76354, 76356 | Submitted normally on 2026-10-30, before the problem started |

## Also affected: "الامتثال الفني" (Technical Compliance)

The Technical Compliance task (ProcessTypeId 480) uses the same screen block (`Inspection_TechCompliance_Tasks_WB`) and the same server action. On request 76362 (2026-10-31), with a comment it was refused identically: `ActionCreateInspectionTask_BL` → `{"Is_Success":false,"Message":"تعذر إرسال التقييم"}`, with no message on screen. Video and trace: `reports/bugs/BUG-001/technical-compliance/`.

## Workaround

Submit both tasks without a description. The automation does this through `noCommentTasks` in `src/data/exploration-transfer.data.ts` (default `["مهمة الرقابة", "الامتثال الفني"]`). Remove the entry once the fix is deployed, so this task is commented again like every other employee task.

## Impact on automation

`npm run test:transfer:*`: all three scenarios stop at this task with `"إرسال الرد" did not complete within 120 s`. The failure now includes the server response. Request 76362 (E2E-003) can be resumed once the fix is deployed (`npm run test:transfer:rework`).
