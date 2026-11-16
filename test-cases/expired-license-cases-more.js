// Test cases UC-002.1 … UC-017, E2E scenarios, extra defects, open questions and change log
// for the "Follow-up on Expired License" workbook. Consumed by build-expired-license-test-cases.js.
//
// Case row:  [area, title, pre, steps, data, expected, ref, priority, type, exec]
// Executed:  ... + [status, actual, defectIds, evidence]
// Roles: RCM = Rehabilitation & Closure Manager · TS = Technical Specialist · SGM = Sustainability General Manager ·
//        CCO = Chief Compliance Officer (ESNAD) · L1 = GM Sustainability & Community Affairs · L2 = Assistant Deputy
//        Minister · L3 = Deputy (سعادة الوكيل) · DM = His Excellency the Deputy Minister.

const EV = 'test-results-probe/';
const REQ = 'Employee → الطلبات → tab "متابعة رخص منتهية"';
const TASKS = 'Employee → إدارة المهام → tab "متابعة رخص منتهية"';
const RESP = (role, task) => `${role} logged in; "${task}" task assigned to them.`;
const OPEN = (task) => `1. ${TASKS}.\n2. Row of the request → ⋮ → "الرد على الطلب".\n3. Tab "الرد على الطلب" (${task}).`;
const CLOSE_OPT1 = '"تقدم المستثمر بطلب إعادة تأهيل وإغلاق"';
const CLOSE_OPT2 = '"صدور شهادة الإغلاق"';
const DONE_PATH = 'status "مكتمل – تم تقديم طلب/ شهادة إعادة التأهيل والإغلاق"';

// ---------------------------------------------------------------- UC-002.1 View request details (from Request Management)
const uc021 = [
  ['Open', 'View opens the request details in view-only mode', 'Follow-up request exists.', `1. ${REQ}.\n2. Row ⋮ → View.`, 'Request 77248',
    'Details page opens in view-only mode.', 'Main path 1–2', 'High', 'Positive', 'Auto', 'Pass',
    'Menu item "استعراض" opens a new tab /Licenses_Monitoring_Expired/RequestDetails?In_RequestNumber=77248&In_IsViewOnly=true.', '', EV + 'expired-view/77248/0-default.png'],
  ['Open', 'Title = "طلب متابعة رخصة منتهية — [Request Number]" without the licence number', 'Details page open.', '1. Read the page title.', 'Request 77248',
    'Title shows the request number; no licence number.', 'Main path 2; Change #6', 'Medium', 'UI', 'Auto', 'Fail',
    'Title is "طلب متابعة رخصة منتهية" — request number missing.', 'DEF-015', EV + 'expired-view/77248/0-default.png'],
  ['Company Profile', 'Company Profile tab opens by default', 'Details page open.', '1. Check the selected tab after opening.', 'Request 77248',
    '"ملف الشركة" selected; section "معلومات الشركة" shown.', 'Main path 3', 'Medium', 'Positive', 'Auto', 'Pass', 'Opens on ملف الشركة → معلومات الشركة.', '', ''],
  ['Company Profile', 'Company Information shows fields 1–6', 'Details page open.', '1. Tab ملف الشركة.', 'Request 77248',
    'الاسم, السجل التجاري, الرقم الموحد, الرقم الوطني / رقم الإقامة, نوع السجل التجاري, تاريخ انتهاء السجل التجاري — read-only, values from MoC.',
    'Fields 1–6', 'Medium', 'Positive', 'Auto', 'Fail',
    'No "الرقم الوطني / رقم الإقامة" field. Extra fields shown (status, issue date, capital, fax, phone, address). حالة السجل التجاري = "active" (English).', 'DEF-017', EV + 'expired-view/77248/1-ملف_الشركة.png'],
  ['Request Details', 'Request Details shows fields 7–15 including "نوع العملية"', 'Details page open.', '1. Tab تفاصيل الطلب.', 'Request 77248',
    'رقم الطلب, رقم الرخصة, نوع الرخصة, فئة الرخصة, تاريخ انتهاء الرخصة, تاريخ إنشاء الطلب, حالة الطلب, نوع العملية, تجاوز المهلة النظامية؟, عدد الأيام المتبقية.',
    'Fields 7–15; Change #5', 'High', 'Positive', 'Auto', 'Fail', '"نوع العملية" (Process Type) is missing; all other fields present.', 'DEF-016', EV + 'expired-view/77248/2-تفاصيل_الطلب.png'],
  ['Request Details', 'Request Details values match the list row', 'Details page open.', '1. Compare tab تفاصيل الطلب with the results-table row.', 'Request 77248',
    'All values identical.', 'Fields 7–15', 'High', 'Positive', 'Auto', 'Pass',
    '77248 / 1447412 / إصدار رخصة تعدين / أخرى / 2026-09-30 / 2026-11-15 / قيد التنفيذ / لا / 134 — match (list shows "No" instead of "لا", see DEF-008).', '', ''],
  ['Request Details', 'Status shows "قيد التنفيذ" only, without the stage', 'Request in a later stage (e.g. Level 1).', '1. Tab تفاصيل الطلب → حالة الطلب.', 'Request 77248 (at Level 1 + feedback)',
    'Exactly "قيد التنفيذ".', 'Field 13; Change #4', 'Medium', 'Positive', 'Auto', 'Pass', '"قيد التنفيذ" while the workflow is at Level 1.', '', ''],
  ['Request Details', 'Process Type shows the current task name', 'Request in a later stage.', '1. Tab تفاصيل الطلب → نوع العملية.', 'Request 77248',
    'Current task name per UC-003 list (e.g. "مراجعة قرار تسييل الضمان المالي – المستوى الأول").', 'Field 13.1; Change #5', 'High', 'Positive', 'Auto', 'Blocked', 'Field missing.', 'DEF-016', ''],
  ['Request Details', 'Remaining Days shown as "XX days"', 'Details page open.', '1. Read عدد الأيام المتبقية.', 'Request 77248',
    '"134 يوم".', 'Field 15', 'Low', 'UI', 'Auto', 'Fail', 'Bare number "134".', 'DEF-012', ''],
  ['Request Details', 'Completed request: Remaining 0, Process Type "—", Exceeded per BR-001', 'Request in any "مكتمل – …" status.', '1. Open the completed request → تفاصيل الطلب.', 'Completed request',
    'عدد الأيام المتبقية = 0; نوع العملية = "—"; تجاوز = لا.', 'ALT-002', 'High', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Linked Tasks', 'Full workflow shown: completed, current and upcoming (Not Started) steps', 'Request in the middle of the workflow.', '1. Tab المهام المرتبطة.', 'Request 77248',
    'One card per main-path step: done = Completed, current = In Progress, later steps (L2, L3, Final) = Not Started.', 'Main path; Change #7', 'High', 'Positive', 'Auto', 'Fail',
    'Only tasks already created are shown; no cards for upcoming steps.', 'DEF-018', EV + 'expired-view/77248/3-المهام_المرتبطة.png'],
  ['Linked Tasks', 'Card fields: task name, assignee, status, date (dd/mm/yyyy)', 'Linked Tasks tab open.', '1. Read each card.', 'Request 77248',
    'Name per UC-003 list; "مسندة إلى" = user; status Completed/In Progress/Not Started; date dd/mm/yyyy; Not Started → empty assignee and date.',
    'Fields 16–18.1; Change #8', 'Medium', 'UI', 'Auto', 'Fail',
    '"مسندة إلى" shows "<another task name> — [user]" (e.g. Site Eligibility cards show "قرار مدير التأهيل والإغلاق"; RCM cards show old name "المراجعة النهائية والتحقق"); status "منتهي"; date "2026-11-15 14:40:13".',
    'DEF-020, DEF-022', ''],
  ['Linked Tasks', 'Branch steps (re-verify, return, feedback) appear when they occur', 'Request had returns and a feedback request.', '1. Tab المهام المرتبطة.', 'Request 77248',
    'Extra cards for each repeated step and for the Feedback Request.', 'Main path; Change #7', 'Medium', 'Positive', 'Auto', 'Pass',
    'Repeated L1 / CCO cards and a "طلب الإفادة" card are shown.', '', ''],
  ['Linked Tasks', 'One card per task (no duplicates)', 'Linked Tasks tab open.', '1. Compare card names + timestamps.', 'Request 77248',
    'No two identical cards.', 'Main path', 'High', 'Negative', 'Auto', 'Fail',
    '"قرار مدير التأهيل والإغلاق" appears twice with the same timestamp 2026-11-15 14:02:16.', 'DEF-019', EV + 'expired-view/77248/3-المهام_المرتبطة.png'],
  ['Linked Tasks', 'Cards are view-only', 'Linked Tasks tab open.', '1. Look for any action on the cards.', 'Request 77248',
    'No buttons / links on cards.', 'Main path', 'Low', 'Negative', 'Auto', 'Pass', 'No enabled controls except the 4 tab buttons.', '', ''],
  ['Linked Tasks', 'No-Action-Required request shows the no-data message', 'Request completed by UC-001 step 8 (R&C existed).', '1. Tab المهام المرتبطة.', 'Request from TC-001-09',
    '"لا توجد بيانات".', 'ALT-001', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['History', 'Each action is a timeline entry with description, performed by, date & time', 'Request with several actions.', '1. Tab سجل الطلب.', 'Request 77248',
    'One entry per action (creation, assignments, responses, decisions…) with وصف الإجراء, تم بواسطة, التاريخ والوقت.', 'Fields 19–21', 'High', 'Positive', 'Manual', 'Fail',
    'Only the creation entry is listed as a timeline item; other steps appear as a stage tracker (all ✓, incl. Level 1 still pending) + a collapsed "سجل الردود". To confirm after expanding "سجل الردود".', 'DEF-024', EV + 'expired-view/77248/4-سجل_الطلب.png'],
  ['History', 'Automated actions show "المنصة" as performer', 'Request created by UC-001.', '1. Tab سجل الطلب → creation entry.', 'Request 77248',
    '"تم إنشاء طلب متابعة رخصة منتهية" by "المنصة".', 'Field 20', 'Medium', 'Positive', 'Auto', 'Pass', '"تم إنشاء طلب متابعة رخصة منتهية" — تم بواسطة "المنصة".', '', ''],
  ['History', 'Date & time format dd/mm/yyyy – hh:mm AM/PM', 'History tab open.', '1. Read the entry date.', 'Request 77248',
    'e.g. "15/11/2026 – 12:58 م".', 'Field 21', 'Low', 'UI', 'Auto', 'Fail', '"2026-11-15 12:58:22" under label "تاريخ تقديم الطلب".', 'DEF-024', ''],
  ['History', 'Attachment link opens / downloads the file', 'A visit (UC-007) or closure certificate (UC-005..007) was saved.', '1. Tab سجل الطلب → entry with attachment → click link.', 'Request with attachments',
    'File opens / downloads; correct file.', 'Field 22', 'Medium', 'Positive', 'Manual', 'Not Run', '', '', ''],
  ['Navigation', 'Breadcrumb "إدارة الطلبات" / "متابعة رخص منتهية" returns to the list', 'Details page open.', '1. Click each breadcrumb item.', 'Request 77248',
    'Returns to the request list on the "متابعة رخص منتهية" tab.', 'Main path (breadcrumb)', 'Low', 'Positive', 'Auto', 'Fail',
    'Breadcrumb is "الصفحة الرئيسية / الطلبات / طلب متابعة رخصة منتهية" — no "متابعة رخص منتهية" item. Return not yet clicked.', 'DEF-033', ''],
  ['Access', 'View disabled for migrated "مكتمل – بيانات تاريخية مُرحّلة" requests', 'Migrated request exists.', `1. ${REQ}.\n2. Row ⋮.`, 'Migrated request',
    'View option disabled.', 'Pre-condition 3', 'Medium', 'Negative', 'Manual', 'Not Run', '', '', ''],
  ['Access', 'Viewing changes nothing', 'Details page open.', '1. Visit all tabs.\n2. Re-check list row and history.', 'Any request',
    'No data changed; no history entry for viewing.', 'Post-condition', 'Low', 'Negative', 'Auto', 'Not Run', '', '', ''],
];

// ---------------------------------------------------------------- UC-003 Task list
const uc003 = [
  ['Navigation', 'Open Task Management → "متابعة رخص منتهية"', 'Employee with Task Follow-up permission.', `1. ${TASKS}.`, '—',
    'Task list with filter and results table.', 'Main path 1–2', 'High', 'Positive', 'Auto', 'Pass', 'Tab "متابعة رخص منتهية" next to "جميع الرخص"; 18 tasks.', '', EV + 'expired-tasks/0-tab.png'],
  ['Filters', 'Search fields 1–5 are displayed', 'Task list open.', '1. Click "تصفية(0)".', '—',
    'رقم الرخصة, رقم الطلب, نوع الرخصة, نوع العملية, تجاوز المهلة النظامية؟', 'Search fields 1–5', 'Medium', 'UI', 'Auto', 'Pass',
    'All 5 present (spelling: "رقم الرخصه", "أختار نوع الرخصة", "اختار نوع العملية" — DEF-013).', '', ''],
  ['Filters', 'License Type values BMQ / Mining / Small Mining', 'Filter open.', '1. Open نوع الرخصة.', '—',
    'Three licence types, same list as Request Management.', 'Search field 3', 'Medium', 'Positive', 'Auto', 'Fail',
    '"إصدار رخصة محجر مواد بناء / إصدار رخصة تعدين / إصدار رخصة منجم صغير" — service names; differs from Request Management ("تحويل رخصة منجم صغير").', 'DEF-002', ''],
  ['Filters', 'Process Type values follow the Task Names list', 'Filter open.', '1. Open نوع العملية.', '—',
    'Names per Task Names table (and the descriptive Site Eligibility step names per Change #11).', 'Search field 4; Change #10–12', 'Medium', 'Positive', 'Auto', 'Fail',
    '13 values: 4 Site Eligibility steps (one named "… - إنهاء المهمة بعد تقديم طلب إعادة التأهيل والإغلاق"), Levels 1–3 separate, spelled "المستوي".', 'DEF-023, DEF-028', ''],
  ['Filters', '"تجاوز المهلة النظامية؟" offers نعم / لا', 'Filter open.', '1. Open the dropdown.', '—', 'نعم / لا.', 'Search field 5', 'Low', 'Positive', 'Auto', 'Pass', 'أختار .... / نعم / لا.', '', ''],
  ['Search', 'Search without criteria lists all tasks', 'Filter open.', '1. Click "البحث".', '—', 'All tasks.', 'ALT-001', 'High', 'Positive', 'Auto', 'Pass', '18 tasks.', '', EV + 'expired-tasks/1-empty-search.png'],
  ['Search', 'No match shows the platform message', 'Filter open.', '1. رقم الطلب = 999999999 → البحث.', '999999999',
    'Standard message + empty table.', 'ALT-002', 'Medium', 'Negative', 'Auto', 'Pass', '"لا توجد نتائج لعرضها".', '', EV + 'expired-tasks/2-no-match.png'],
  ['Search', 'Search by each criterion and by a combination', 'Filter open.', '1. Search by licence no., request no., licence type, process type, exceeded, then combined.', 'Your licence / request',
    'Only matching tasks (AND logic).', 'Search fields 1–5', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Results', 'Columns and order per data dictionary', 'Task list open.', '1. Read the headers.', '—',
    'رقم الطلب, نوع الرخصة, رقم الرخصة, فئة الرخصة, تاريخ انتهاء الرخصة, تجاوز المهلة النظامية؟, المهلة النظامية المتبقية, نوع العملية, الإجراء — no نوع الطلب.',
    'Display fields 6–15; Change #1', 'Low', 'UI', 'Auto', 'Fail', 'رقم الرخصة comes before نوع الرخصة (swapped).', 'DEF-032', ''],
  ['Results', 'Remaining period = 180 − days since expiry, within 0–180', 'Task list open.', '1. Check المهلة النظامية المتبقية.', '77317 (exp 2026-08-31), 77313 (exp 2026-07-18)',
    'Correct value; never > 180 or < 0.', 'Display field 13; UC-002 BR-003', 'High', 'Boundary', 'Auto', 'Fail',
    '77317 → 104 ✓, 77313 → 60 ✓, but 77320 → 1553, 77325 → 2005 (licences expiring 2030/2031).', 'DEF-006', ''],
  ['Results', 'Process Type column shows the current task', 'Task list open.', '1. Read نوع العملية.', 'Any row',
    'Current task name.', 'Display field 14', 'Medium', 'Positive', 'Auto', 'Pass', '"مراجعة الرخصة المنتهية" for new requests.', '', ''],
  ['Export', 'Export: Excel, same columns/order, file "Expired Licenses Monitoring"', 'Task list open.', '1. Click "تصدير".', '—',
    'File "Expired Licenses Monitoring.xlsx" with the table columns in order.', 'ALT-003; Change #2', 'Low', 'Positive', 'Auto', 'Fail',
    'File "متابعة الرخص المنتهية.xlsx" (different again from Request Management "متابعة الرخصة المنتهية.xlsx").', 'DEF-010', ''],
  ['Actions', 'Action menu offers View / Assign / Respond per permissions', 'Task list open.', '1. Row ⋮.', 'Any row',
    'View, Assign to Me / Assign to Another, Respond to Request (when assigned to me).', 'Main path 5; Display field 15', 'High', 'Positive', 'Auto', 'Pass',
    'Items seen: "إسناد إلى" / "عرض" / "الرد على الطلب" / "الرد على الطلب (للقراءة فقط)".', '', ''],
  ['Actions', 'No "Unassign" for an assigned task', 'Task assigned to a user.', '1. Row ⋮ of the assigned task.', 'Assigned task',
    'No "إلغاء الإسناد"; only Assign to Another.', 'Main path 5; UC-003.1 BR-001; Change #9', 'High', 'Negative', 'Auto', 'Not Run', '', '', ''],
  ['Actions', 'Bulk "تعيين جميع المهام لي" button', 'Task list open.', '1. Look at the toolbar.', '—',
    'Not in UC-003 / UC-003.1 — confirm if it should exist on this tab.', '—', 'Low', 'UI', 'Manual', 'Fail', 'Button "تعيين جميع المهام لي" shown on the tab.', 'DEF-029', ''],
  ['Access', 'User without Task Follow-up permission does not see the tab', 'Employee without the permission.', `1. ${TASKS}.`, 'Restricted account',
    'Tab hidden / no tasks.', 'Pre-condition 1', 'Medium', 'Negative', 'Manual', 'Not Run', '', '', ''],
  ['Access', 'Each role sees the tasks of its task types', 'Technical Specialist account (employee2).', `1. Log in as TS.\n2. ${TASKS}.`, 'employee2',
    'TS sees Site Eligibility tasks assigned / available to TS.', 'Pre-condition', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
];

// ---------------------------------------------------------------- UC-003.1 Assign
const uc0031 = [
  ['Assign', 'Assign to Me', 'Unassigned open task; user holds the task type permission.', `1. ${TASKS}.\n2. Row ⋮ → "إسناد إلى" → "لي" → حفظ.`, 'Your request',
    'Toast "تم إسناد المهمة بنجاح"; owner = me; "الرد على الطلب" available; assignment logged in سجل الطلب.', 'Main path; Post-conditions', 'High', 'Positive', 'Auto'],
  ['Assign', 'Assign to Another', 'Open task.', '1. Row ⋮ → "إسناد إلى" → "آخرون" → pick user → حفظ.', 'employee2 (TS)',
    'New owner = selected user; in-platform assignment notification to that user; logged in سجل الطلب.', 'Main path; Notifications', 'High', 'Positive', 'Auto'],
  ['Assign', 'Reassign an assigned task via Assign to Another', 'Task assigned to user A.', '1. Row ⋮ → "إسناد إلى" → "آخرون" → user B.', 'Users A, B',
    'Owner replaced directly by B; task never becomes unassigned; A loses "الرد على الطلب".', 'BR-001', 'High', 'Positive', 'Auto'],
  ['Assign', 'Unassign is not offered', 'Task assigned to a user.', '1. Row ⋮.', 'Assigned task',
    'No "إلغاء الإسناد" option.', 'BR-001; Change #9', 'High', 'Negative', 'Auto'],
  ['Assign', '"آخرون" list only contains users holding the task type permission', 'Open task.', '1. Row ⋮ → إسناد إلى → آخرون → open user list.', '—',
    'Only eligible users (e.g. TS for Site Eligibility).', 'Secondary paths', 'Medium', 'Negative', 'Manual'],
  ['Assign', 'User without the task type permission cannot assign', 'User lacking permission.', '1. Row ⋮.', 'Restricted account',
    'Follows existing mechanism (option hidden or error).', 'Secondary paths', 'Medium', 'Negative', 'Manual'],
  ['Assign', 'Closed task cannot be assigned', 'Completed task.', '1. Row ⋮ of a closed task.', 'Closed task',
    'No assign option.', 'Pre-condition 2', 'Medium', 'Negative', 'Auto'],
];

// ---------------------------------------------------------------- UC-003.2 Respond
const uc0032 = [
  ['Respond', '"الرد على الطلب" tab only for the assignee', 'Task assigned to another user.', '1. Open the task details (عرض).', 'Task owned by someone else',
    'Tab "الرد على الطلب" hidden.', 'ALT-001', 'High', 'Negative', 'Auto'],
  ['Respond', 'Response panel matches the task type', 'Task assigned to me.', OPEN('each task type'), 'One task of each type',
    'Panel defined by UC-004…UC-017 for that type.', 'Main path 2', 'High', 'Positive', 'Auto'],
  ['Respond', 'Confirming a response logs history and updates Linked Tasks', 'Task assigned to me.', '1. Complete the panel → confirm.', 'Any task',
    'Action executed; new entry in سجل الطلب; card status updated in المهام المرتبطة.', 'Main path 4–5', 'High', 'Positive', 'Auto'],
  ['Respond', 'Cancel saves nothing', 'Respond tab open with data entered.', '1. Click "إلغاء".', 'Any task',
    'No changes; task unchanged.', 'ALT-003', 'Medium', 'Negative', 'Auto'],
  ['Respond', 'Closed task shows the submitted response read-only', 'Task completed.', '1. Row ⋮ → "الرد على الطلب (للقراءة فقط)".', 'Completed task',
    'Submitted response shown read-only; no submit.', 'ALT-002', 'Medium', 'Positive', 'Auto'],
  ['Respond', 'Action button labels follow the agreed action names', 'Respond tab open.', '1. Read the buttons of each task type.', 'Each task type',
    'Per change table (Completed/مكتمل, إنهاء الطلب, اعتماد, إعادة للموظف السابق, طلب إفادة, رفض); submit button unified to "إرسال".', 'Change table', 'Low', 'UI', 'Manual'],
  ['Respond', 'Double-click on submit does not run the action twice', 'Respond tab open.', '1. Double-click the submit/confirm button.', 'Any task',
    'Single action, single history entry, no duplicate next task.', '— (robustness)', 'High', 'Negative', 'Manual'],
  ['Respond', 'Responding to a task not assigned to me via direct URL is blocked', 'Task assigned to someone else.', '1. Open the respond URL of that task directly.', 'Task owned by someone else',
    'Access denied / read-only.', '— (security)', 'High', 'Negative', 'Manual'],
];

// ---------------------------------------------------------------- UC-003.3 View from Task Management
const uc0033 = [
  ['Open', 'View from the task list opens the request details (view-only)', 'Task exists.', `1. ${TASKS}.\n2. Row ⋮ → "عرض".`, 'Your request',
    'Details page "طلب متابعة رخصة منتهية — [Request Number]" in view-only; Company Profile by default.', 'Main path 1–3; Change #6', 'High', 'Positive', 'Auto'],
  ['Tabs', 'Tabs 1–4 show the same data as UC-002.1 for the same request', 'Details page open.', '1. Compare all 4 tabs with the view from Request Management.', 'Your request',
    'Identical content (incl. نوع العملية, full workflow cards, history).', 'Fields 1–22', 'High', 'Positive', 'Auto'],
  ['Tabs', 'Tab 5 "الرد على الطلب" only when the task is assigned to me', 'Task assigned / not assigned to me.', '1. Open details for both cases.', 'Two tasks',
    'Tab 5 shown only for my task.', 'Tab 5; UC-003.2 ALT-001', 'High', 'Positive', 'Auto'],
  ['Navigation', 'Breadcrumb returns to the task list', 'Details page open from Task Management.', '1. Click "إدارة المهام" / "متابعة رخص منتهية".', 'Your request',
    'Returns to the Task Management tab "متابعة رخص منتهية" (not the request list).', 'Main path (breadcrumb)', 'Low', 'Positive', 'Auto'],
  ['Request Details', 'Completed request: Remaining 0, Process Type "—"', 'Completed request.', '1. Tab تفاصيل الطلب.', 'Completed request',
    'عدد الأيام المتبقية = 0, نوع العملية = "—", تجاوز = لا.', 'ALT-001', 'Medium', 'Positive', 'Auto'],
];

// ---------------------------------------------------------------- UC-004 Expired License Review (RCM)
const uc004 = [
  ['Panel', 'Respond panel of "مراجعة الرخصة المنتهية"', RESP('RCM', 'مراجعة الرخصة المنتهية'), OPEN('مراجعة الرخصة المنتهية'), 'Your licence',
    '"تعيين الأخصائي" dropdown (required, single), "إلغاء" and the submit button.', 'Fields 11–13; Change table', 'High', 'UI', 'Auto'],
  ['Panel', 'Specialist list = users holding the site-eligibility permission', 'Respond panel open.', '1. Open "تعيين الأخصائي".', '—',
    'Only TS users (employee2 InternalExplotration included); confirm whether filtered by licence category A/B/C.', 'Field 11', 'Medium', 'Positive', 'Manual'],
  ['Validation', 'Submit without a specialist is blocked', 'Respond panel open.', '1. Leave the dropdown empty → submit.', '—',
    'Required-field message; nothing created.', 'Field 11', 'High', 'Negative', 'Auto'],
  ['Routing', 'Assign specialist creates the Site Eligibility Verification task', 'Respond panel open.', '1. Select employee2 → submit.', 'employee2',
    'Review task closed; "التحقق من أهلية الموقع" task assigned to employee2 + notification; status قيد التنفيذ; نوع العملية = التحقق من أهلية الموقع; history + Linked Tasks updated.',
    'Main path 4–5; Post-conditions', 'High', 'Positive', 'Auto'],
  ['Routing', 'Cancel saves nothing', 'Respond panel open.', '1. Select a specialist → "إلغاء".', '—',
    'Task stays with RCM; nothing created.', 'Field 12', 'Medium', 'Negative', 'Auto'],
  ['Access', 'Only the RCM can respond to Expired License Review', 'TS (employee2) logged in.', `1. ${TASKS}.\n2. Try to respond to a review task.`, 'employee2',
    'Not possible (no permission).', 'Pre-conditions', 'Medium', 'Negative', 'Auto'],
];

// ---------------------------------------------------------------- UC-005 Check for R&C request (TS)
const closeSection = (uc, err1, err2) => [
  ['Close request', `${CLOSE_OPT1}: request number required`, 'Site Eligibility respond tab open.', `1. "هل ترغب في إغلاق الطلب؟" = ${CLOSE_OPT1}.\n2. Leave رقم الطلب empty → "تأكيد – إنهاء الطلب".`, '—',
    `C2 shown & required, C3 optional; confirm disabled or message "${err2}".`, `ALT; C1–C6; ${uc}`, 'High', 'Negative', 'Auto'],
  ['Close request', `${CLOSE_OPT2}: certificate required`, 'Respond tab open.', `1. Option ${CLOSE_OPT2}.\n2. No file → confirm.`, '—',
    `C2 hidden, C3 required; message "${err1}".`, `ALT; C1–C6; ${uc}`, 'High', 'Negative', 'Auto'],
  ['Close request', 'Certificate file rules', 'Respond tab open, option chosen.', '1. Upload PDF, JPG, PNG (accepted); DOCX, EXE (rejected); 5 MB (accepted); 5.1 MB (rejected).', 'Sample files',
    'Only PDF/JPG/PNG ≤ 5 MB accepted.', 'C3', 'Medium', 'Boundary', 'Manual'],
  ['Close request', 'Notes: 250 characters max, Arabic/English/numbers', 'Respond tab open.', '1. Type 250 then 251 chars; mixed Arabic/English/digits; symbols.', '—',
    '250 accepted, 251 blocked; letters and numbers accepted.', 'C4', 'Low', 'Boundary', 'Manual'],
  ['Close request', 'Confirm → confirm/cancel message → request closed', 'Option + required field filled.', '1. "تأكيد – إنهاء الطلب".\n2. Confirm the message.', 'R&C request no. or certificate',
    `${DONE_PATH}; task closed; reminders + 180-day escalation cancelled; option, number, certificate and notes in سجل الطلب; Linked Tasks updated.`, `ALT; BR-005; ${uc}`, 'High', 'Positive', 'Auto'],
  ['Close request', 'Cancel in the confirm message / C5 Cancel keeps the task open', 'Option + required field filled.', '1. "تأكيد – إنهاء الطلب" → cancel in the message.\n2. Then C5 "إلغاء".', '—',
    'Nothing saved; task open; status unchanged.', `ALT; C5; ${uc}`, 'Medium', 'Negative', 'Auto'],
];
const uc005 = [
  ['Panel', 'Respond panel of Site Eligibility – check step', RESP('TS', 'التحقق من أهلية الموقع'), OPEN('التحقق من أهلية الموقع'), 'Your licence',
    '"التحقق من وجود طلب إعادة تأهيل وإغلاق", "إلغاء", "تأكيد إنهاء الطلب" (disabled) and the close-request section.', 'Fields 1–3, C1–C6', 'High', 'UI', 'Auto'],
  ['Check', 'No R&C request → message, task stays open', 'Licence without any R&C request.', '1. Click the check button.', 'Your licence',
    'Message "لا يوجد طلب إعادة تأهيل وإغلاق مرتبط بهذه الرخصة، أو أن الطلب لم يكتمل بعد…"; confirm closure disabled; status قيد التنفيذ; next step = send reminder (UC-006); check logged.', 'ALT-001; BR-002', 'High', 'Positive', 'Auto'],
  ['Check', 'R&C request not completed → same as no request', 'Licence with an In-Progress R&C request.', '1. Click the check button.', 'R&C request in progress',
    'Same message; task stays open.', 'ALT-001', 'High', 'Negative', 'Auto'],
  ['Check', 'Completed R&C request → prompt to confirm closure', 'Licence with a Completed R&C request (same number, start, end).', '1. Click the check button.', 'Completed R&C request',
    'Message "يوجد طلب إعادة تأهيل وإغلاق مكتمل برقم \"…\" مرتبط بهذه الرخصة. يرجى تأكيد إنهاء الطلب."; "تأكيد إنهاء الطلب" enabled; check logged.', 'Main path 4–6; BR-001', 'High', 'Positive', 'Auto'],
  ['Check', 'Confirm closure after a positive check', 'Positive check result.', '1. "تأكيد إنهاء الطلب".', 'Completed R&C request',
    `${DONE_PATH}; task closed; history + Linked Tasks updated; no further reminders.`, 'Main path 7–8', 'High', 'Positive', 'Auto'],
  ['Check', 'Completed R&C request of another licence term is ignored', 'Completed R&C for same licence number but older start/end.', '1. Click the check button.', 'Older-term R&C',
    'Negative result (no closure prompt).', 'BR-001', 'High', 'Negative', 'Manual'],
  ['Check', 'Several R&C requests, one Completed → check passes', 'Licence with one Rejected and one Completed R&C.', '1. Click the check button.', '2 R&C requests',
    'Positive result.', 'BR-001', 'Medium', 'Positive', 'Manual'],
  ['Check', 'Each check run is logged', 'Respond tab open.', '1. Run the check twice.\n2. Tab سجل الطلب.', '—',
    'Two check entries with date/time and user.', 'Main path 5', 'Low', 'Positive', 'Auto'],
  ['Close request', 'Close request available before running the check', 'Respond tab open, check not run.', '1. Look at "هل ترغب في إغلاق الطلب؟".', '—',
    'Section available immediately.', 'BR-003; Change #12', 'Medium', 'Positive', 'Auto'],
  ...closeSection('UC-005', 'يرجى إرفاق شهادة الإغلاق لإنهاء الطلب.', 'يرجى إدخال رقم طلب إعادة التأهيل والإغلاق.'),
  ['Close request', 'R&C request number is validated', 'Option 1 selected.', '1. Enter a non-existent / other licence\'s R&C number → confirm.', '99999999',
    'Confirm whether the number must exist and belong to the licence (Open Question Q27).', 'C2', 'Medium', 'Negative', 'Manual'],
];

// ---------------------------------------------------------------- UC-006 Send reminder email (TS)
const uc006 = [
  ['Panel', 'Reminder step shows the check result and "إرسال بريد إلكتروني للمستثمر"', 'Check returned "no request / not completed".', OPEN('التحقق من أهلية الموقع'), 'Your licence',
    'Indicator "No request found" (or "Request No. X — status (not completed)"); send button; cancel; close-request section.', 'Fields 1–3', 'High', 'UI', 'Auto'],
  ['Email', 'No R&C request → Email A sent', 'No R&C request.', '1. Click "إرسال بريد إلكتروني للمستثمر".', 'Your licence; investor mailbox',
    'Email A (subject "تذكير بضرورة تقديم طلب إعادة التأهيل والإغلاق – الرخصة رقم …") with licence no., investor name, expiry date, 180 days; message "تم إرسال البريد الإلكتروني التذكيري للمستثمر بنجاح."; logged.', 'Main path; BR-002', 'High', 'Positive', 'Manual'],
  ['Email', 'R&C request not completed → Email B with its number and status', 'R&C request in progress.', '1. Send the email.', 'R&C in progress',
    'Email B (subject "مطلوب متابعة طلب إعادة التأهيل والإغلاق – الرخصة رقم …") with R&C number and current status.', 'BR-002', 'High', 'Positive', 'Manual'],
  ['Email', 'R&C request Rejected / Withdrawn → Email A', 'Only a Rejected or Withdrawn R&C request.', '1. Send the email.', 'Rejected R&C',
    'Email A.', 'BR-002', 'Medium', 'Negative', 'Manual'],
  ['Email', 'Several R&C requests → the most recent decides the email', 'Older In-Progress + newer Rejected R&C.', '1. Send the email.', '2 R&C requests',
    'Wording based on the most recent request.', 'BR-002', 'Medium', 'Boundary', 'Manual'],
  ['Email', 'All placeholders replaced; approved template + signature; AR and EN', 'Email received.', '1. Open the email.', '—',
    'No "[…]" left; correct dates; correct template.', 'Email content', 'Medium', 'UI', 'Manual'],
  ['Email', 'Sending a second time', 'Email already sent.', '1. Check the button / click again.', '—',
    'Confirm expected behaviour (disabled vs. resend) — Open Question Q28.', '—', 'Low', 'Boundary', 'Manual'],
  ['Flow', 'After sending: task stays with TS, status/process unchanged, visit step available', 'Email sent.', '1. Reload the respond tab.', '—',
    'Same TS; قيد التنفيذ; نوع العملية = التحقق من أهلية الموقع; "تسجيل بيانات الزيارة" shown (UC-007).', 'Post-conditions', 'High', 'Positive', 'Auto'],
  ...closeSection('UC-006', 'يرجى إرفاق شهادة الإغلاق لإنهاء الطلب.', 'يرجى إدخال رقم طلب إعادة التأهيل والإغلاق.').slice(0, 2),
];

// ---------------------------------------------------------------- UC-007 Field visit (TS)
const uc007 = [
  ['Panel', 'Visit step shows read-only status fields + "تسجيل بيانات الزيارة"', 'Reminder email sent.', OPEN('التحقق من أهلية الموقع'), 'Your licence',
    'Check result; "Sent — Email A/B"; first/second reminder = "In Progress" (not yet due); إلغاء; تسجيل بيانات الزيارة.', 'Fields 1–6', 'High', 'UI', 'Auto'],
  ['Visit', 'Visit panel auto-fills licence data and specialist', 'Visit step open.', '1. Click "تسجيل بيانات الزيارة".', 'Your licence',
    'اسم المنشأة, رقم الرخصة, تاريخ البداية, تاريخ النهاية, نوع الخام, المجمع / الموقع read-only and correct; الأخصائي الفني = logged-in user.', 'Fields 7–12, 17', 'High', 'Positive', 'Auto'],
  ['Visit', 'Visit date rules', 'Visit panel open.', '1. Try tomorrow, a day before request creation, the creation date and today.', 'Dates',
    'Tomorrow / before creation rejected with "يجب أن يكون تاريخ الزيارة في تاريخ اليوم أو قبله، وألا يسبق تاريخ إنشاء الطلب."; creation date and today accepted.', 'Field 13; Errors', 'High', 'Boundary', 'Auto'],
  ['Visit', 'Description required when Finding is selected', 'Visit panel open.', '1. Finding = "موقع مؤهل", description empty → حفظ.', '—',
    '"يرجى تعبئة جميع الحقول الإلزامية."', 'Fields 15–16', 'High', 'Negative', 'Auto'],
  ['Visit', 'Required fields empty on save', 'Visit panel open.', '1. Clear visit date → حفظ.', '—', '"يرجى تعبئة جميع الحقول الإلزامية."', 'Errors', 'Medium', 'Negative', 'Auto'],
  ['Visit', 'Observation attachments', 'Visit panel open.', '1. Upload several PDF/JPG/PNG ≤ 5 MB; then DOCX and a 6 MB file.', 'Sample files',
    'Multiple valid files accepted; invalid type/size rejected.', 'Field 14', 'Medium', 'Boundary', 'Manual'],
  ['Visit', 'Description 250 characters max', 'Visit panel open.', '1. Type 250 / 251 chars.', '—', '250 accepted, 251 blocked.', 'Field 16', 'Low', 'Boundary', 'Manual'],
  ['Visit', 'Save stores the visit and keeps the task with the TS', 'Valid visit data.', '1. حفظ.', 'Visit date today, finding, description, 1 file',
    'Saved; history entry with attachments; task stays with TS; قيد التنفيذ / التحقق من أهلية الموقع; reminder cycle unaffected.', 'Main path; Post-conditions', 'High', 'Positive', 'Auto'],
  ['Visit', 'Saved visit can be reopened and edited', 'Visit saved.', '1. "تسجيل بيانات الزيارة" again → change description → حفظ.', '—',
    'Previous values shown; edit saved and logged.', 'Field 6', 'Medium', 'Positive', 'Auto'],
  ['Re-verify', 'After RCM "Re-verify Site", saving the visit returns the task to the RCM', 'UC-010 Re-verify done for this TS.', '1. TS opens the reopened task (decision notes visible).\n2. Update visit → حفظ.', '—',
    'Task auto-assigned to RCM as "قرار مدير التأهيل والإغلاق"; 180-day period not reset; no need to repeat check/email.', 'ALT-001; UC-010 BR-002', 'High', 'Positive', 'Auto'],
  ['Close request', 'Close request available during the visit step and re-verification', 'Visit step / re-verification.', '1. Use "هل ترغب في إغلاق الطلب؟".', '—',
    `Same rules as UC-005; ${DONE_PATH}.`, 'ALT-002', 'Medium', 'Positive', 'Auto'],
];

// ---------------------------------------------------------------- UC-008 Reminders & escalation (system)
const T = 'Needs a licence whose expiry date is the required number of days in the past (or a date override) + the daily job run.';
const uc008 = [
  ['Reminder 1', 'No reminder on day 30', T, '1. Run the daily job when 30 days have elapsed since expiry.', 'Expiry = today − 30',
    'No reminder; "تم إرسال التذكير الأول" = In Progress.', 'BR-003', 'High', 'Boundary', 'Manual'],
  ['Reminder 1', 'Reminder 1 on day 31', T, '1. Run the job on day 31.', 'Expiry = today − 31',
    'Email A/B with "– Reminder No. 1" in the subject; in-platform notification to the investor; history entry; field = Yes.', 'Main path 2; BR-003', 'High', 'Positive', 'Manual'],
  ['Reminder 2', 'Reminder 2 on day 61 (none on day 60)', T, '1. Run the job on day 60 and day 61.', 'Expiry = today − 60 / − 61',
    'Day 60 nothing; day 61 email "– Reminder No. 2" + notification + history; field = Yes.', 'Main path 3; BR-003', 'High', 'Boundary', 'Manual'],
  ['Reminder', 'Exactly two reminders', T, '1. Run the job on days 62–180.', '—', 'No third reminder.', 'BR-002', 'Medium', 'Negative', 'Manual'],
  ['Reminder', 'Email A/B chosen from the current check result at send time', 'R&C request status changes between reminder 1 and 2.', '1. Change R&C status.\n2. Run job on day 61.', '—',
    'Reminder 2 wording matches the new state.', 'BR-005; UC-006 BR-002', 'Medium', 'Positive', 'Manual'],
  ['Reminder', 'Reminders do not change status, assignment or workflow', 'Reminder sent.', '1. Check request + task after the reminder.', '—', 'No change.', 'BR-005', 'Medium', 'Negative', 'Manual'],
  ['Escalation', 'No escalation on day 180', T, '1. Run the job on day 180.', 'Expiry = today − 180', 'Nothing happens; remaining = 0? (confirm day-180 value).', 'BR-003', 'High', 'Boundary', 'Manual'],
  ['Escalation', 'Escalation on day 181 from Site Eligibility', T + ' Task at Site Eligibility.', '1. Run the job on day 181.', 'Expiry = today − 181',
    'Site Eligibility task closed; "قرار مدير التأهيل والإغلاق" task to RCM; قيد التنفيذ; نوع العملية = قرار مدير التأهيل والإغلاق; تجاوز = نعم; remaining 0.', 'Main path 4', 'High', 'Positive', 'Manual'],
  ['Escalation', 'Escalation on day 181 while still at Expired License Review', 'RCM never assigned a specialist.', '1. Run the job on day 181.', '—',
    'Review task closed; RCM decision task created.', 'Main path 4', 'High', 'Positive', 'Manual'],
  ['Escalation', 'Escalation without a recorded visit', 'No visit saved.', '1. Escalate.\n2. RCM opens the decision task.', '—', 'Visit details = "Not recorded".', 'ALT-002; BR-006', 'Medium', 'Positive', 'Manual'],
  ['Stop', 'Closure before day 180 stops reminders and escalation', 'Request closed by UC-005/006/007 on day 20.', '1. Run the job on days 31, 61, 181.', '—',
    'No reminders, no escalation; reminder fields = No.', 'ALT-001; BR-004', 'High', 'Negative', 'Manual'],
  ['Reassign', 'New specialist continues from the last step', 'Site Eligibility reassigned to another TS after email sent.', '1. New TS opens the task.', 'employee2 + another TS',
    'Visit step shown (no repeat of check/email).', 'BR-001', 'Medium', 'Positive', 'Manual'],
  ['Dates', 'Spec example: expiry 01/01/2026', 'Data with expiry 01/01/2026.', '1. Check the dates of reminders/escalation in history.', 'Expiry 01/01/2026',
    'R1 01/02/2026, R2 03/03/2026, period end 30/06/2026, escalation 01/07/2026.', 'BR-003 example', 'Medium', 'Boundary', 'Manual'],
  ['Dates', 'Request created after day 31 (late detection / migrated)', 'Request created when 40 days had already elapsed.', '1. Run the job.', 'Expiry = today − 40',
    'Confirm whether reminder 1 is sent immediately — Open Question Q25.', '—', 'Low', 'Boundary', 'Manual'],
];

// ---------------------------------------------------------------- UC-010 RCM decision
const decisionCommon = (uc, role, notesErr = 'يرجى تعبئة جميع الحقول الإلزامية.') => [
  ['Validation', 'Decision is required', `${role} respond tab open.`, '1. Submit without a decision.', '—', 'Required-field message.', `${uc} Decision`, 'Medium', 'Negative', 'Auto'],
  ['Validation', 'Decision Notes max 250 characters', `${role} respond tab open.`, '1. Type 250 / 251 chars.', '—', '250 accepted, 251 blocked.', `${uc} Decision Notes`, 'Low', 'Boundary', 'Manual'],
  ['Cancel', 'Cancel saves nothing', `${role} respond tab open.`, '1. Choose a decision → "إلغاء".', '—', 'Task unchanged.', `${uc} Cancel`, 'Medium', 'Negative', 'Auto'],
  ['History', 'Decision logged and Linked Tasks updated', 'Decision confirmed.', '1. Tabs سجل الطلب / المهام المرتبطة.', '—', 'Entry with decision, notes, user, date; card statuses updated.', `${uc} Post-conditions`, 'Medium', 'Positive', 'Auto'],
];
const uc010 = [
  ['Panel', 'Read-only history fields', RESP('RCM', 'قرار مدير التأهيل والإغلاق'), OPEN('قرار مدير التأهيل والإغلاق'), 'Escalated request',
    'Check result; email status ("Not yet performed" if not sent); "بيانات الزيارة" (or "Not recorded"); reminder 1/2 = Yes/No.', 'Fields 1–5', 'High', 'UI', 'Auto'],
  ['Decision', 'Decision values', 'Respond tab open.', '1. Open "القرار".', '—',
    '"مراجعة مدير عام الاستدامة" / "إعادة التحقق من الموقع" (or Approve / Return To Previous Employee per change table — Q11).', 'Field 6; Change table', 'High', 'Positive', 'Auto'],
  ['Decision', 'Refer to SGM', 'Respond tab open.', '1. Decision = مراجعة مدير عام الاستدامة → اعتماد القرار.', '—',
    'RCM task closed; "مراجعة مدير عام الاستدامة" task to SGM + notification; قيد التنفيذ; نوع العملية = مراجعة مدير عام الاستدامة.', 'Main path 5', 'High', 'Positive', 'Auto'],
  ['Re-verify', 'Re-verify needs specialist + notes', 'Respond tab open.', '1. Decision = إعادة التحقق من الموقع, notes empty → confirm.', '—',
    '"تعيين الأخصائي" shown, defaulted to previous TS; notes required → error.', 'Fields 7–8', 'High', 'Negative', 'Auto'],
  ['Re-verify', 'Re-verify reopens the whole Site Eligibility task', 'Respond tab open.', '1. Re-verify, keep default TS, notes → confirm.', 'employee2',
    'Site Eligibility reopened for TS with all actions (check, email, visit, close) and notes visible; نوع العملية = التحقق من أهلية الموقع; remaining period continues (not reset).', 'Main path 6; BR-001/002', 'High', 'Positive', 'Auto'],
  ['Re-verify', 'Re-verify to a different specialist', 'Respond tab open.', '1. Re-verify, choose another TS.', 'Another TS',
    'Selected TS gets the task + notification.', 'Field 7', 'Medium', 'Positive', 'Manual'],
  ['Return', 'Task returned by SGM (Re-verify) shows SGM notes', 'UC-011 Re-verify done.', '1. RCM opens the reopened task.', '—', 'SGM notes visible; both decisions available.', 'ALT-001', 'Medium', 'Positive', 'Auto'],
  ...decisionCommon('UC-010', 'RCM'),
];

// ---------------------------------------------------------------- UC-011 SGM review / UC-012 CCO review
const uc011 = [
  ['Panel', 'Read-only history incl. RCM decision', RESP('SGM', 'مراجعة مدير عام الاستدامة'), OPEN('مراجعة مدير عام الاستدامة'), '—',
    'Fields 1–5 + "قرار مدير التأهيل والإغلاق" button showing decision and notes.', 'Fields 1–6', 'High', 'UI', 'Auto'],
  ['Decision', 'Only Approve / Re-verify (no Request Feedback)', 'Respond tab open.', '1. Open "القرار".', '—', '"اعتماد" / "إعادة التحقق" only.', 'BR-001', 'High', 'Negative', 'Auto'],
  ['Decision', 'Approve (notes optional) → CCO review', 'Respond tab open.', '1. اعتماد, notes empty → اعتماد القرار.', '—',
    'CCO task created + notification; قيد التنفيذ; نوع العملية = مراجعة رئيس الامتثال بإسناد.', 'Main path; BR-003', 'High', 'Positive', 'Auto'],
  ['Decision', 'Re-verify without notes is blocked', 'Respond tab open.', '1. إعادة التحقق, notes empty → confirm.', '—', '"يرجى تعبئة جميع الحقول الإلزامية."', 'Errors; BR-003', 'High', 'Negative', 'Auto'],
  ['Decision', 'Re-verify returns to the RCM decision only', 'Respond tab open.', '1. إعادة التحقق + notes → confirm.', '—',
    'RCM decision task reopened with notes; نوع العملية = قرار مدير التأهيل والإغلاق; period not reset; no field steps repeated.', 'Main path; BR-002', 'High', 'Positive', 'Auto'],
  ['Return', 'Returned by CCO shows CCO notes', 'UC-012 Re-verify done.', '1. SGM opens reopened task.', '—', 'CCO notes visible.', 'ALT-001', 'Medium', 'Positive', 'Auto'],
  ...decisionCommon('UC-011', 'SGM').slice(1),
];
const uc012 = [
  ['Panel', 'Read-only history incl. RCM and SGM decisions', RESP('CCO', 'مراجعة رئيس الامتثال بإسناد'), OPEN('مراجعة رئيس الامتثال بإسناد'), '—',
    'Fields 1–5 + RCM and SGM decision buttons.', 'Fields 1–7', 'High', 'UI', 'Auto'],
  ['Decision', 'Only Approve / Re-verify (no Request Feedback)', 'Respond tab open.', '1. Open "القرار".', '—', '"اعتماد" / "إعادة التحقق" only.', 'BR-001', 'High', 'Negative', 'Auto'],
  ['Decision', 'Approve → Level 1 task', 'Respond tab open.', '1. اعتماد → اعتماد القرار.', '—',
    'Level 1 task to GM Sustainability & Community Affairs + notification; status "قيد التنفيذ" (Change #4); نوع العملية = Level 1.', 'Main path; Change #4', 'High', 'Positive', 'Auto'],
  ['Decision', 'Re-verify without notes is blocked', 'Respond tab open.', '1. إعادة التحقق, notes empty.', '—', '"يرجى تعبئة جميع الحقول الإلزامية."', 'Errors', 'High', 'Negative', 'Auto'],
  ['Decision', 'Re-verify reopens SGM review', 'Respond tab open.', '1. إعادة التحقق + notes.', '—',
    'SGM task reopened with notes; status "قيد التنفيذ" (story text says "In Progress – SGM Review" — Q14).', 'Main path; BR-002', 'High', 'Positive', 'Auto'],
  ['Return', 'Returned by Level 1 shows Level 1 notes', 'UC-013 Return for Amendment done.', '1. CCO opens reopened task.', '—', 'Level 1 notes visible.', 'ALT-001', 'Medium', 'Positive', 'Auto'],
  ...decisionCommon('UC-012', 'CCO').slice(1),
];

// ---------------------------------------------------------------- UC-013 / 014 / 015 approval levels
function level(uc, n, role, prevTask, nextTask, history, executed) {
  const task = `مراجعة قرار تسييل الضمان المالي – المستوى ${['', 'الأول', 'الثاني', 'الثالث'][n]}`;
  const rows = [
    ['Panel', `Level ${n} read-only history`, RESP(role, task), OPEN(task), '—', `Fields 1–5 + decision buttons: ${history}; "الإفادات السابقة" only when feedback exists.`, 'Read-only fields', 'High', 'UI', 'Auto'],
    ['Decision', 'Decision values', 'Respond tab open.', '1. Open "القرار".', '—', '"اعتماد" / "إعادة للتعديل" / "طلب إفادة" (labels per change table — Q11).', 'BR-001', 'High', 'Positive', 'Auto'],
    ['Decision', `Approve (notes optional) → ${nextTask}`, 'Respond tab open.', '1. اعتماد → اعتماد القرار.', '—', `Level ${n} task closed; ${nextTask} created + notification; status قيد التنفيذ.`, 'Main path', 'High', 'Positive', 'Auto'],
    ['Decision', 'Return for Amendment without notes is blocked', 'Respond tab open.', '1. إعادة للتعديل, notes empty.', '—', '"يرجى تعبئة جميع الحقول الإلزامية."', 'BR-003; Errors', 'High', 'Negative', 'Auto'],
    ['Decision', `Return for Amendment reopens ${prevTask}`, 'Respond tab open.', '1. إعادة للتعديل + notes.', '—', `${prevTask} reopened for its owner with notes visible.`, 'Main path', 'High', 'Positive', 'Auto'],
    ['Feedback', 'Request Feedback needs role + notes', 'Respond tab open.', '1. طلب إفادة; leave role / notes empty.', '—', '"الدور الوظيفي المطلوب إفادته" shown and required; notes required → error.', 'Fields; Errors', 'High', 'Negative', 'Auto'],
    ['Feedback', 'Request Feedback creates a separate Feedback task; level task stays open', 'Respond tab open.', '1. طلب إفادة + role + notes → confirm.', 'Role = any',
      `"طلب الإفادة" task for the role; Level ${n} task NOT closed, still assigned to ${role}; request status unchanged; logged.`, 'ALT-001; BR-002', 'High', 'Positive', 'Auto'],
    ['Feedback', n === 1 ? 'Decision stays active while feedback is pending' : 'While feedback is pending: Approve / Return available, Request Feedback disabled', 'Feedback pending.', '1. Reopen the respond tab.', '—',
      n === 1 ? 'Approve / Return for Amendment selectable without waiting (UC-013 does not say Request Feedback is disabled — Q13).' : 'Approve and Return for Amendment enabled; Request Feedback disabled.', 'BR-002', 'High', 'Positive', 'Auto'],
    ['Feedback', 'Submitted feedback shown under "الإفادات السابقة"; another feedback possible', 'Feedback submitted (UC-017).', '1. Reopen the respond tab.', '—', 'Feedback visible; all decisions available again.', 'ALT-001', 'Medium', 'Positive', 'Auto'],
    ['Feedback', 'Approve while a feedback request is still pending', 'Feedback pending.', '1. اعتماد → confirm.', '—', 'Confirm what happens to the open Feedback task (Open Question Q29).', 'BR-002', 'Medium', 'Boundary', 'Manual'],
    ['Feedback', 'Requested role list = job roles of the workflow', 'Respond tab open.', '1. Open the role list.', '—', 'Only workflow roles.', 'Field "Requested Role"', 'Low', 'Positive', 'Manual'],
    ...decisionCommon(uc, role).slice(1),
  ];
  if (executed) rows[6] = [...rows[6], 'Fail', 'On request 77248 the Level 1 card is "منتهي" (closed) while its Feedback Request is "قيد التنفيذ".', 'DEF-021', EV + 'expired-view/77248/3-المهام_المرتبطة.png'];
  return rows;
}
const uc013 = level('UC-013', 1, 'L1 (GM Sustainability & Community Affairs)', 'Chief Compliance Officer review', 'Level 2 task (Assistant Deputy Minister)', 'RCM, SGM, CCO', true);
const uc014 = level('UC-014', 2, 'L2 (Assistant Deputy Minister)', 'Level 1 task', 'Level 3 task (Deputy)', 'RCM, SGM, CCO, Level 1', false);
const uc015 = level('UC-015', 3, 'L3 (Deputy)', 'Level 2 task', 'Final Guarantee Liquidation Approval (Deputy Minister)', 'RCM, SGM, CCO, Level 1, Level 2', false);

// ---------------------------------------------------------------- UC-016 Final approval
const uc016 = [
  ['Panel', 'Full approval trail visible', RESP('DM', 'الاعتماد النهائي لتسييل الضمان المالي'), OPEN('الاعتماد النهائي لتسييل الضمان المالي'), '—',
    'Fields 1–5 + RCM, SGM, CCO, Level 1, 2, 3 decisions; "الإفادات السابقة" when present.', 'Fields 1–12', 'High', 'UI', 'Auto'],
  ['Decision', 'Values Approve / Reject / Request Feedback — no Return', 'Respond tab open.', '1. Open "القرار".', '—', '"اعتماد" / "رفض" / "طلب إفادة"; no return option.', 'BR-001; BR-004', 'High', 'Positive', 'Auto'],
  ['Approve', 'Approve completes the request and sends the notice', 'Respond tab open.', '1. اعتماد → اعتماد القرار.', 'Configured recipient mailbox',
    'Status "مكتمل – تمت الموافقة على تسييل الضمان المالي"; task + request closed; notice email to configured recipient (licence no., facility, expiry, request no., Art. 88/90/95); remaining 0; نوع العملية "—"; تجاوز = لا.', 'Main path; BR-005/006', 'High', 'Positive', 'Auto'],
  ['Reject', 'Reject without notes is blocked', 'Respond tab open.', '1. رفض, notes empty.', '—', '"يرجى تعبئة جميع الحقول الإلزامية." (ERR-LIC-016-001).', 'BR-003; Errors', 'High', 'Negative', 'Auto'],
  ['Reject', 'Reject completes the request without email', 'Respond tab open.', '1. رفض + notes → confirm.', '—', 'Status "مكتمل – تم رفض تسييل الضمان المالي"; no notice email; request closed.', 'Main path', 'High', 'Positive', 'Auto'],
  ['Feedback', 'Request Feedback; Approve / Reject stay available; Request Feedback disabled while pending', 'Respond tab open.', '1. طلب إفادة + role + notes.\n2. Reopen tab.', '—',
    'Feedback task created; DM task stays open; status unchanged; only Approve / Reject available until feedback submitted.', 'ALT-001; BR-002', 'High', 'Positive', 'Auto'],
  ['Email', 'Notice recipient is configurable', 'Admin access.', '1. Change the recipient in configuration.\n2. Approve another request.', '—', 'Email goes to the new recipient.', 'BR-006', 'Medium', 'Positive', 'Manual'],
  ['After', 'Completed request in search & details', 'Request approved / rejected.', `1. ${REQ}: search by the new status.\n2. View → تفاصيل الطلب.`, '—',
    'Findable by status (blocked by DEF-001); completion days = creation → completion; remaining frozen at 0.', 'UC-002 BR-002/003', 'Medium', 'Positive', 'Auto'],
  ...decisionCommon('UC-016', 'DM').slice(1),
];

// ---------------------------------------------------------------- UC-017 Feedback
const uc017 = [
  ['Task', 'Feedback task reaches the selected role with requester notes', 'A level requested feedback.', `1. Log in as the selected role.\n2. ${TASKS}.`, '—',
    'Task "طلب الإفادة" listed; panel shows requester notes and requesting level.', 'Main path 1–2', 'High', 'Positive', 'Auto'],
  ['Panel', 'Feedback field required, 250 max', 'Feedback respond tab open.', '1. Submit empty.\n2. Type 251 chars.', '—', 'Error on empty; 251 blocked.', 'Field 11', 'High', 'Negative', 'Auto'],
  ['Submit', 'Submitting returns the originating level task to its owner', 'Feedback respond tab open.', '1. Enter feedback → اعتماد.', '—',
    'Feedback task closed; originating level task active again for the same owner with the response; counter +1; notification to owner; logged.', 'Main path 5; Post-conditions', 'High', 'Positive', 'Auto'],
  ['Submit', 'Works from each level (L1, L2, L3, Final)', 'Feedback requested from each level.', '1. Submit feedback for each.', '—', 'Returns to the right level each time.', 'Post-conditions', 'High', 'Positive', 'Auto'],
  ['Submit', 'Several feedback rounds', 'Same level requests feedback twice.', '1. Submit both.', '—', 'Counter = 2; both under "الإفادات السابقة".', 'Main path 5', 'Medium', 'Positive', 'Auto'],
  ['Cancel', 'Cancel saves nothing', 'Feedback tab open.', '1. Type text → "إلغاء".', '—', 'Task unchanged.', 'Field 12', 'Medium', 'Negative', 'Auto'],
  ['Scope', 'SGM and CCO have no Request Feedback', 'SGM / CCO task open.', '1. Open "القرار".', '—', 'No "طلب إفادة".', 'Business context', 'Medium', 'Negative', 'Auto'],
];

// ---------------------------------------------------------------- E2E scenarios (final run on the licence)
const e2e = [
  ['E2E', 'Happy path to Guarantee Liquidation Approved', 'Licence given by you, expired, no R&C request; roles available.',
    '1. Run timer (UC-001).\n2. RCM assigns TS (UC-004).\n3. TS: check → none (UC-005), send Email A (UC-006), record visit (UC-007).\n4. Day 181 escalation (UC-008) — needs date setup.\n5. RCM → SGM (UC-010) → SGM approve → CCO approve → L1 → L2 → L3 approve → DM approve.',
    'Your licence', 'Each step: right task / owner / process type / history / linked tasks; final status "مكتمل – تمت الموافقة على تسييل الضمان المالي" + notice email.', 'UC-001…016', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'Path ending with Reject', 'As E2E-01.', '1. Same as E2E-01 until DM.\n2. DM rejects with notes.', 'Licence', 'Status "مكتمل – تم رفض تسييل الضمان المالي"; no email.', 'UC-016', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'R&C request exists at detection → No Action Required', 'Expired licence with an In-Progress R&C request.', '1. Run timer.', 'Licence with R&C', '"مكتمل – لا يتطلب إجراء"; no task; Linked Tasks "لا توجد بيانات".', 'UC-001 step 8; UC-002.1 ALT-001', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'Completed R&C found by the TS check', 'R&C completed after detection.', '1. Timer → RCM assigns TS.\n2. TS check → confirm closure.', 'Licence + completed R&C', DONE_PATH + '; no reminders.', 'UC-005', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'Manual closure "تقدم المستثمر بطلب…" after the email', 'Timer + assignment done.', '1. TS check → email → close with option 1 + R&C number.', 'Licence', DONE_PATH + '; reminders cancelled.', 'UC-006 ALT-001', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'Manual closure "صدور شهادة الإغلاق" during the visit step', 'Visit recorded.', '1. Close with option 2 + certificate PDF.', 'Licence + PDF', DONE_PATH + '; certificate downloadable in history.', 'UC-007 ALT-002', 'High', 'E2E', 'Auto (after timer)'],
  ['E2E', 'Re-verify loops (RCM, SGM, CCO)', 'Request at RCM decision.', '1. RCM re-verify → TS saves visit → back to RCM.\n2. RCM → SGM re-verify → RCM.\n3. … CCO re-verify → SGM.', 'Licence', 'Each return lands on the right owner with notes; period not reset.', 'UC-007/010/011/012', 'Medium', 'E2E', 'Manual'],
  ['E2E', 'Return-for-amendment chain L3 → L2 → L1 → CCO', 'Request at L3.', '1. L3 return → L2 return → L1 return → CCO.\n2. Approve back up.', 'Licence', 'Correct reopen at each step; history complete.', 'UC-013…015', 'Medium', 'E2E', 'Manual'],
  ['E2E', 'Feedback at every level', 'Request at L1.', '1. Each level requests feedback → role submits → level decides.', 'Licence', 'Feedback counter and "الإفادات السابقة" correct; level task stays open.', 'UC-013…017', 'Medium', 'E2E', 'Manual'],
  ['E2E', 'Escalation with no visit → RCM re-verify for a visit', 'Day 181 reached without visit.', '1. Escalate → RCM re-verify → TS records visit → RCM.', 'Licence', 'Visit "Not recorded" then filled.', 'UC-008 ALT-002', 'Medium', 'E2E', 'Manual'],
];

// ---------------------------------------------------------------- Defects found on UC-002.1 / UC-003
// [id, uc, title, steps, expected, actual, severity, priority, evidence, note]
const VIEW = `1. ${REQ}.\n2. Request 77248 → ⋮ → استعراض.`;
const extraDefects = [
  ['DEF-015', 'UC-002.1 / UC-003.3', 'Details page title has no request number', VIEW, '"طلب متابعة رخصة منتهية — 77248".', '"طلب متابعة رخصة منتهية".', 'Medium', 'P3', EV + 'expired-view/77248/0-default.png', ''],
  ['DEF-016', 'UC-002.1 / UC-003.3', '"نوع العملية" (Process Type) missing from Request Details tab', VIEW + '\n3. Tab تفاصيل الطلب.', 'Field 13.1 showing the current task (Change #5).', 'Field not present.', 'High', 'P2', EV + 'expired-view/77248/2-تفاصيل_الطلب.png', ''],
  ['DEF-017', 'UC-002.1 / UC-003.3', 'Company Profile lacks National ID / Iqama; CR status in English', VIEW, 'Fields 1–6 incl. "الرقم الوطني / رقم الإقامة".', 'No National ID / Iqama field; حالة السجل التجاري = "active".', 'Medium', 'P3', EV + 'expired-view/77248/1-ملف_الشركة.png', ''],
  ['DEF-018', 'UC-002.1 / UC-003.3', 'Linked Tasks does not show upcoming (Not Started) workflow steps', VIEW + '\n3. Tab المهام المرتبطة.', 'Full workflow incl. not-started steps (Change #7).', 'Only created tasks; no cards for Level 2, Level 3, Final.', 'High', 'P2', EV + 'expired-view/77248/3-المهام_المرتبطة.png', ''],
  ['DEF-019', 'UC-010 / UC-002.1', 'RCM decision task created twice', VIEW + '\n3. Tab المهام المرتبطة.', 'One "قرار مدير التأهيل والإغلاق" task per escalation/return.', 'Two identical cards, same timestamp 2026-11-15 14:02:16.', 'High', 'P1', EV + 'expired-view/77248/3-المهام_المرتبطة.png', 'Check Task Management for two open tasks.'],
  ['DEF-020', 'UC-002.1 / UC-003.3', 'Linked Tasks "مسندة إلى" shows the wrong / old task name', VIEW + '\n3. Tab المهام المرتبطة.', '"مسندة إلى" = assignee.', 'Shows "<task name> — [user]": Site Eligibility cards show "قرار مدير التأهيل والإغلاق"; RCM cards show old name "المراجعة النهائية والتحقق" (Change #10).', 'Medium', 'P2', '', ''],
  ['DEF-021', 'UC-013 / UC-017', 'Level 1 task closed while its feedback request is pending', VIEW + '\n3. Tab المهام المرتبطة.', 'Level task stays open and assigned; decision active (UC-013 BR-002).', 'Level 1 card "منتهي" while "طلب الإفادة" is "قيد التنفيذ".', 'High', 'P2', EV + 'expired-view/77248/3-المهام_المرتبطة.png', 'To confirm: UC-017 says the level task is "recreated" after feedback — stories conflict (Q13).'],
  ['DEF-022', 'UC-002.1 / UC-003.3', 'Linked task card status/date format', VIEW + '\n3. Tab المهام المرتبطة.', 'Status مكتمل / قيد التنفيذ / لم يبدأ; date dd/mm/yyyy.', 'Status "منتهي"; "تاريخ انشاء المهمة :2026-11-15 14:40:13".', 'Low', 'P4', '', ''],
  ['DEF-023', 'UC-003 / UC-002.1', 'Spelling "المستوي" in task names', `1. ${TASKS} → تصفية → نوع العملية.`, '"المستوى الأول / الثاني / الثالث".', '"المستوي الأول …"; assignee label "المستوي الاول".', 'Low', 'P4', '', ''],
  ['DEF-024', 'UC-002.1 / UC-003.3', 'Request History is not a per-action timeline; date format', VIEW + '\n3. Tab سجل الطلب.', 'Timeline entry per action (description, performed by, dd/mm/yyyy – hh:mm AM/PM, attachment).',
    'Stage tracker (all ✓ incl. Level 1 still pending) + one creation entry ("تاريخ تقديم الطلب 2026-11-15 12:58:22") + collapsed "سجل الردود".', 'Medium', 'P2', EV + 'expired-view/77248/4-سجل_الطلب.png', 'To confirm after expanding "سجل الردود".'],
  ['DEF-028', 'UC-003', 'Process Type value still says "إنهاء المهمة"', `1. ${TASKS} → تصفية → نوع العملية.`, '"إنهاء الطلب" (Change #12).', '"التحقق من أهلية الموقع - إنهاء المهمة بعد تقديم طلب إعادة التأهيل والإغلاق".', 'Low', 'P4', '', ''],
  ['DEF-029', 'UC-003 / UC-003.1', 'Extra bulk "تعيين جميع المهام لي" button', `1. ${TASKS}.`, 'Only View / Assign / Respond actions.', 'Bulk assign-all button on the tab.', 'Low', 'P4', '', 'To confirm with BA.'],
  ['DEF-032', 'UC-003', 'Task list columns order', `1. ${TASKS}.`, 'رقم الطلب, نوع الرخصة, رقم الرخصة, …', 'رقم الطلب, رقم الرخصة, نوع الرخصة, …', 'Low', 'P4', '', ''],
  ['DEF-033', 'UC-002.1', 'Breadcrumb lacks "متابعة رخص منتهية"', VIEW, 'الصفحة الرئيسية / إدارة الطلبات / متابعة رخص منتهية / …', 'الصفحة الرئيسية / الطلبات / طلب متابعة رخصة منتهية.', 'Low', 'P4', '', ''],
];
// Notes appended to existing defects
const defectPatches = {
  'DEF-002': { note: 'Task Management shows a different list: "إصدار رخصة منجم صغير" instead of "تحويل رخصة منجم صغير".' },
  'DEF-006': { actual: '77247 licence 141841 expiry 2027-10-20 (519 days). 77320 licence 20260710137 expiry 2030-08-19 (1553). 77325 licence 20260610075 (small mine issued today by request 77319) expiry 2031-11-14 (2005) — appeared on 2026-11-15 ~21:30.', note: 'To confirm: if 77325 was created by the job, BR-001 is broken.' },
  'DEF-008': { note: 'Details page and Task Management show "لا" — only the Request Management list shows "Yes/No".' },
  'DEF-004': { note: 'Same 4 rows for 77247 in the Task Management list.' },
  'DEF-010': { actual: 'Request Management: "متابعة الرخصة المنتهية.xlsx"; Task Management: "متابعة الرخص المنتهية.xlsx".', note: 'Approved name "Expired Licenses Monitoring" (Change #2).', replaceNote: true },
  'DEF-012': { note: 'Same on the details page (عدد الأيام المتبقية = "134").' },
};

// ---------------------------------------------------------------- Open questions
const extraQuestions = [
  ['Q11', 'Change table vs stories', 'Which button/decision labels are final? Change table: Approve/اعتماد, Return To Previous Employee/إعادة للموظف السابق, Request Feedback, Reject, Completed/مكتمل, Terminate Request/إنهاء الطلب, submit unified to "Send/إرسال". Stories: تعيين, تأكيد إنهاء الطلب, مراجعة مدير عام الاستدامة / إعادة التحقق من الموقع, إعادة التحقق, إعادة للتعديل, اعتماد القرار.'],
  ['Q12', 'Change table', 'The change table still names the task "Final Review" while Change #10 renamed it "قرار مدير التأهيل والإغلاق" — confirm the final name.'],
  ['Q13', 'UC-013 vs UC-017', 'UC-013 BR-002: level task is NOT closed while feedback is pending. UC-017: feedback submission "recreates" the level task. TEST closes the level task (DEF-021). Also UC-013 does not say Request Feedback is disabled while pending (UC-014/015/016 do).'],
  ['Q14', 'UC-012 / UC-013 vs Change #4', 'UC-012/013 text uses statuses "In Progress – Chief Compliance Officer (ESNAD) Review" / "In Progress – Sustainability General Manager Review"; Change #4 says status is only "قيد التنفيذ". Assume Change #4 wins?'],
  ['Q15', 'UC-003 Task Names', 'UC-003 lists 8 task names; TEST has 13 (4 Site Eligibility steps, Levels 1/2/3 separate). Which list is expected in the filter and in نوع العملية?'],
  ['Q16', 'Roles / accounts', 'Which TEST accounts hold RCM, SGM, CCO, Level 1, Level 2, Level 3 and Deputy Minister roles? (Have: employee1 MIM_SuperUser, employee2 InternalExplotration = Technical Specialist.)'],
  ['Q17', 'UC-008 timing', 'How do we test day 31 / 61 / 181 actions — licence with back-dated expiry, configurable periods, or DB date change? Which timer runs reminders/escalation?'],
  ['Q18', 'Emails', 'Where can we read emails (investor reminders A/B, liquidation notice)? Test mailbox / email log?'],
  ['Q19', 'UC-017', 'Where is the "number of feedback requests" counter displayed?'],
  ['Q20', 'UC-004', 'Is the specialist list filtered by licence category (A/B/C) or does the RCM choose freely?'],
  ['Q25', 'UC-008', 'If a request is created after day 31 (late detection / migration), is reminder 1 sent at once or skipped?'],
  ['Q27', 'UC-005 C2', 'Must the entered R&C request number exist and belong to the licence?'],
  ['Q28', 'UC-006', 'Can the reminder email be sent more than once from the panel?'],
  ['Q29', 'UC-013…016', 'What happens to an open Feedback task when the level approves / returns before the feedback is submitted?'],
];
const questionAnswers = { Q8: 'Yes — Change #2 approves "Expired Licenses Monitoring" as the unified export name.', Q10: 'Task Management tab has no assignee column; check via View → المهام المرتبطة. TS account = employee2 (InternalExplotration).' };

// ---------------------------------------------------------------- Change log (from the user, 2026-11-15)
const changeLog = [
  ['1', 'Remove "نوع الطلب" (Request Type) from the results tables of Request Management and Task Management.', 'UC-002, UC-003'],
  ['2', 'Unified export file name "Expired Licenses Monitoring".', 'UC-002'],
  ['3', '180-day period excludes the expiry date; day 1 = next day; reminder 1 on day 31, reminder 2 on day 61, escalation on day 181.', 'UC-001, 002, 003, 002.1, 003.3, 006, 007, 008, 010, 011'],
  ['4', 'Status shows only "قيد التنفيذ" without the stage; stage documented through "نوع العملية".', 'UC-002, 002.1, 003.3, 001, 004, 005, 006, 007, 008, 010, 011'],
  ['5', 'Add "نوع العملية" to the Request Details tab (current task name).', 'UC-002.1, UC-003.3'],
  ['6', 'Remove the licence number from the view screen title.', 'UC-002.1, UC-003.3'],
  ['7', 'Linked Tasks shows the full workflow: completed, current and not-started steps; branch steps added when they occur.', 'UC-002.1, UC-003.3'],
  ['8', 'Add "التاريخ" (task creation/assignment date) to linked task cards.', 'UC-002.1, UC-003.3'],
  ['9', 'No "Unassign" once a task is assigned; change owner via "Assign to Another"; story renamed "إسناد المهمة".', 'UC-003.1, UC-003, UC-004'],
  ['10', 'Task "المراجعة النهائية والتحقق" renamed "قرار مدير التأهيل والإغلاق" (Rehabilitation and Closure Manager\'s Decision) everywhere; UC-010 title updated.', 'UC-010, 003, 003.2, 007, 008, 011, 002.1, 003.3'],
  ['11', 'Site Eligibility parts (Part 1/2/3…) replaced by descriptive step names in titles and panels.', 'UC-005, 006, 007, 008'],
  ['12', 'Full "إنهاء الطلب" (close request) fields added to the first three Site Eligibility steps, available at any stage: option 1 "تقدم المستثمر بطلب إعادة تأهيل وإغلاق" (request no. required, certificate optional) / option 2 "صدور شهادة الإغلاق" (certificate required). Result: "مكتمل – تم تقديم طلب/شهادة إعادة التأهيل والإغلاق", task closed, reminders + escalation cancelled, logged with attachments. Naming unified to "إنهاء الطلب" instead of "إنهاء المهمة".', 'UC-005, 006, 007'],
];
const actionTable = [
  ['Expired License Review', 'Completed / مكتمل', '', ''],
  ['Site Eligibility Verification / Part 1', 'Completed / مكتمل', 'Terminate Request / إنهاء الطلب', ''],
  ['Site Eligibility Verification / Part 2', 'Completed / مكتمل', 'Terminate Request / إنهاء الطلب', ''],
  ['Site Eligibility Verification / Part 3', 'Completed / مكتمل', 'Terminate Request / إنهاء الطلب', ''],
  ['Final Review', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', ''],
  ['Sustainability General Manager', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', ''],
  ['Chief Compliance Officer', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', ''],
  ['Guarantee Liquidation Decision Review — Level 1', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', 'Request Feedback / طلب إفادة'],
  ['Guarantee Liquidation Decision Review — Level 2', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', 'Request Feedback / طلب إفادة'],
  ['Guarantee Liquidation Decision Review — Level 3', 'Approve / اعتماد', 'Return To Previous Employee / إعادة للموظف السابق', 'Request Feedback / طلب إفادة'],
  ['Final Guarantee Liquidation Approval', 'Approve / اعتماد', 'Reject / رفض', 'Request Feedback / طلب إفادة'],
  ['Feedback Request', 'Completed / مكتمل', '', ''],
  ['* Unify Submit button to "Send"', '', '', ''],
];

module.exports = {
  sheets: [
    { name: 'UC-002.1 View Request', uc: '002.1', cases: uc021 },
    { name: 'UC-003 Task List', uc: '003', cases: uc003 },
    { name: 'UC-003.1 Assign', uc: '003.1', cases: uc0031 },
    { name: 'UC-003.2 Respond', uc: '003.2', cases: uc0032 },
    { name: 'UC-003.3 View Task', uc: '003.3', cases: uc0033 },
    { name: 'UC-004 Expired Review', uc: '004', cases: uc004 },
    { name: 'UC-005 R&C Check', uc: '005', cases: uc005 },
    { name: 'UC-006 Reminder Email', uc: '006', cases: uc006 },
    { name: 'UC-007 Field Visit', uc: '007', cases: uc007 },
    { name: 'UC-008 Reminders 180d', uc: '008', cases: uc008 },
    { name: 'UC-010 RCM Decision', uc: '010', cases: uc010 },
    { name: 'UC-011 SGM Review', uc: '011', cases: uc011 },
    { name: 'UC-012 CCO Review', uc: '012', cases: uc012 },
    { name: 'UC-013 Level 1', uc: '013', cases: uc013 },
    { name: 'UC-014 Level 2', uc: '014', cases: uc014 },
    { name: 'UC-015 Level 3', uc: '015', cases: uc015 },
    { name: 'UC-016 Final Approval', uc: '016', cases: uc016 },
    { name: 'UC-017 Feedback', uc: '017', cases: uc017 },
    { name: 'E2E Scenarios', uc: 'E2E', cases: e2e },
  ],
  extraDefects, defectPatches, extraQuestions, questionAnswers, changeLog, actionTable,
};
