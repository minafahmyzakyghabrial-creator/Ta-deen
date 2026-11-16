// End-to-end execution on TEST, licence 20260710137 / request 77320 (2026-11-15/16), plus the defects it found.
// results: TC ID → [status, actual, defectIds]   (evidence = test-cases/bugs/<first defect>.png when present)
const R = 'Request 77320 (licence 20260710137)';

const results = {
  'TC-001-03': ['Pass', `${R}: follow-up created by "المنصة" 2026-11-15 21:49; status قيد التنفيذ; Task Management row with "مراجعة الرخصة المنتهية".`, ''],
  'TC-001-04': ['Fail', `${R}: تاريخ انتهاء الرخصة = 2030-08-19 in lists / visit panel but 2026-09-19 on the details tab.`, 'DEF-034'],
  'TC-001-05': ['Fail', `${R}: remaining = 1553 days (calculated from 2030-08-19).`, 'DEF-006'],
  'TC-001-06': ['Fail', `${R}: Expired License Review task created unassigned ("[غير مُسند]").`, 'DEF-062'],
  'TC-001-07': ['Pass', `${R}: "تم إنشاء طلب متابعة رخصة منتهية" by "المنصة".`, ''],
  'TC-001-08': ['Pass', `${R}: "قيد التنفيذ".`, ''],
  'TC-001-22': ['Fail', `${R}: licence end date 2030-08-19 (visit panel) — not expired, but a follow-up was created.`, 'DEF-006'],
  'TC-002.1-01': ['Pass', `Also on ${R}.`, ''],
  'TC-003.1-01': ['Fail', `${R}: "إسناد إلى" assigned the task to me immediately — no "لي / آخرون" dialog, no success message.`, 'DEF-036'],
  'TC-003.1-02': ['Blocked', 'No "Assign to Another" option in the menu.', 'DEF-036'],
  'TC-003.1-04': ['Fail', `${R}: after assignment the menu offers "إلغاء الإسناد".`, 'DEF-035'],
  'TC-003.2-02': ['Pass', `${R}: review and Site Eligibility panels match their task type.`, ''],
  'TC-003.2-03': ['Pass', `${R}: each confirmed step adds a "سجل الردود" entry and updates the cards.`, ''],
  'TC-004-01': ['Pass', `${R}: "تعيين الأخصائي" dropdown + "إلغاء" + "إرسال" (label "اختيار الأخصائي").`, 'DEF-055'],
  'TC-004-03': ['Pass', '"إرسال" disabled until a specialist is selected.', ''],
  'TC-004-04': ['Pass', `${R}: Site Eligibility task assigned to Explotration Demo; نوع العملية = "التحقق من أهلية الموقع - التحقق من وجود طلب…"; status قيد التنفيذ; history entry. No success message.`, 'DEF-058'],
  'TC-005-01': ['Fail', `${R}: "إنهاء الطلب" enabled with nothing selected; "إرسال" enabled before the check; no separate "تأكيد إنهاء الطلب" button.`, 'DEF-037'],
  'TC-005-02': ['Pass', `${R}: exact message "لا يوجد طلب إعادة تأهيل وإغلاق مرتبط بهذه الرخصة، أو أن الطلب لم يكتمل بعد…"; task stayed open.`, ''],
  'TC-005-08': ['Fail', `${R}: the check itself is not in سجل الطلب (only the step completion).`, 'DEF-043'],
  'TC-005-09': ['Pass', 'Close-request section available before the check.', ''],
  'TC-005-10': ['Fail', 'Empty R&C number → generic "حقل مطلوب".', 'DEF-038'],
  'TC-005-11': ['Fail', 'Option "صدور شهادة الإغلاق": no certificate upload field; "إنهاء الطلب" does nothing, no message.', 'DEF-041'],
  'TC-005-12': ['Blocked', 'No certificate upload field.', 'DEF-040'],
  'TC-005-13': ['Pass', 'Notes textarea maxlength = 250 (label "الوصف").', 'DEF-042'],
  'TC-006-01': ['Pass', `${R}: check result + "إرسال بريد إلكتروني للمستثمر" + close section; step "إرسال" disabled until the email is sent.`, ''],
  'TC-006-02': ['Pass', `${R}: "تم إرسال البريد الإلكتروني التذكيري للمستثمر بنجاح." (email content not verified — no mailbox access).`, ''],
  'TC-006-07': ['Pass', 'Email button disappears after sending (re-checked on 77325).', ''],
  'TC-006-08': ['Pass', `${R}: moved to "توثيق الزيارة الميدانية والإفادة", same specialist, قيد التنفيذ.`, ''],
  'TC-007-01': ['Fail', `${R}: follow-up section uses old name "المراجعة النهائية والتحقق(180)يوم"; reminders "قيد المراجعة"; label "وقت الزيارة"; no "تسجيل بيانات الزيارة" button.`, 'DEF-045'],
  'TC-007-02': ['Pass', `${R}: facility, licence, start 2026-08-20, end 2030-08-19, ore, complex, specialist auto-filled ("اسم المنشأه" typo).`, 'DEF-049'],
  'TC-007-03': ['Pass', 'Visit date picker: max = today, min = request creation date.', ''],
  'TC-007-04': ['Pass', 'Finding selected + empty description → "هذا الحقل مطلوب".', ''],
  'TC-007-05': ['Fail', 'Inline "هذا الحقل مطلوب" + toast "يرجى إدخال الحقول الإلزامية." (spec: "يرجى تعبئة جميع الحقول الإلزامية.").', 'DEF-052'],
  'TC-007-08': ['Fail', `${R}: date picked in the calendar is not captured (field stays required); after forcing a valid submit nothing is saved (reopen = empty, no history).`, 'DEF-047, DEF-051'],
  'E2E-01': ['Blocked', `${R}: UC-001 → UC-004 → UC-005 → UC-006 passed; blocked at UC-007 (visit cannot be saved).`, 'DEF-047, DEF-051'],
};

const VIEW77320 = '1. Request Management → "متابعة رخص منتهية" → licence 20260710137 → ⋮ → استعراض.';
const TS = '1. Log in as Technical Specialist (InternalExplotration).\n2. إدارة المهام → "متابعة رخص منتهية" → 77320 → ⋮ → الرد على الطلب → tab "الرد علي الطلب".';
// [id, uc, title, steps, expected, actual, severity, priority, evidence, note]
const e2eDefects = [
  ['DEF-034', 'UC-001 / UC-002.1', 'Licence expiry date differs between screens', `${VIEW77320}\n2. Tab تفاصيل الطلب; compare with the list row and the visit panel.`, 'One expiry date everywhere (licence end date).',
    'Details tab 2026-09-19; list, Task Management and visit panel 2030-08-19; remaining 1553 days calculated from 2030.', 'High', 'P1', '', ''],
  ['DEF-035', 'UC-003.1', '"إلغاء الإسناد" (Unassign) offered on assigned tasks', '1. Task Management → "متابعة رخص منتهية" → assigned task → ⋮.', 'No Unassign (BR-001, Change #9).', 'Menu: إلغاء الإسناد / عرض / الرد على الطلب / الرد على الطلب (للقراءة فقط).', 'High', 'P2', '', ''],
  ['DEF-036', 'UC-003 / UC-003.1', '"إسناد إلى" assigns to me directly — no Assign to Me / Assign to Another choice', '1. Unassigned task → ⋮ → إسناد إلى.', '"Assign to Me" and "Assign to Another" (existing dialog لي / آخرون) + success message.', 'Task assigned to the current user immediately; no dialog, no message; no way to assign to another user.', 'High', 'P2', '', ''],
  ['DEF-037', 'UC-005 / 006 / 007', '"إنهاء الطلب" enabled before an option is selected', TS, 'Disabled until an option and its required fields are filled (C6).', 'Enabled on page load.', 'Medium', 'P3', '', ''],
  ['DEF-038', 'UC-005 / 006 / 007', 'Empty R&C request number shows a generic message', `${TS}\n3. Option "تقدم المستثمر بطلب إعادة تأهيل وإغلاق" → إنهاء الطلب.`, '"يرجى إدخال رقم طلب إعادة التأهيل والإغلاق." (ERR-LIC-005-002).', '"حقل مطلوب".', 'Low', 'P3', '', ''],
  ['DEF-040', 'UC-005 / 006 / 007', 'No closure-certificate upload for option "تقدم المستثمر بطلب…"', `${TS}\n3. Select option 1.`, 'C3 "شهادة الإغلاق" upload shown (optional).', 'Only R&C number + "الوصف".', 'Medium', 'P2', '', ''],
  ['DEF-041', 'UC-005 / 006 / 007', 'Option "صدور شهادة الإغلاق" has no upload and no validation — closure by certificate impossible', `${TS}\n3. Select option 2 → إنهاء الطلب.`, 'C3 upload required; "يرجى إرفاق شهادة الإغلاق لإنهاء الطلب." when missing.', 'No upload field; clicking "إنهاء الطلب" does nothing and shows no message.', 'High', 'P1', '', ''],
  ['DEF-042', 'UC-005 / 006 / 007', 'Notes field labelled "الوصف"', TS, '"ملاحظات" (C4).', '"الوصف".', 'Low', 'P4', '', ''],
  ['DEF-043', 'UC-005', 'R&C check is not logged in Request History', `${TS}\n3. Click "تحقق".\n4. Tab سجل الطلب.`, 'History entry for the check (Main path 5).', 'Only "رد … التحقق من وجود طلب…" when the step is completed; no entry for the check.', 'Medium', 'P3', '', ''],
  ['DEF-044', 'UC-002.1 / UC-003.3', 'Timestamps mix UTC and local time', `${VIEW77320}\n2. Tabs المهام المرتبطة / سجل الطلب.`, 'All times in local (KSA) time.', 'Creation 2026-11-15 21:49:30 and review task 21:50:02 (UTC) vs responses 16/11/2026 12:53 AM / 01:08 AM (KSA).', 'Medium', 'P3', '', ''],
  ['DEF-045', 'UC-007 / UC-008', 'Follow-up section still uses the old task name', `${TS} (visit step) → "المتابعة التنظيمية".`, '"قرار مدير التأهيل والإغلاق" (Change #10).', '"المراجعة النهائية والتحقق(180)يوم".', 'Low', 'P3', '', ''],
  ['DEF-046', 'UC-007', 'Visit date labelled "وقت الزيارة"', `${TS} (visit step).`, '"تاريخ الزيارة".', '"وقت الزيارة*".', 'Low', 'P4', '', ''],
  ['DEF-047', 'UC-007', 'Visit date picked in the calendar is not captured', `${TS} (visit step)\n3. Pick today in "وقت الزيارة" → fill finding + description → إرسال.`, 'Date accepted; visit saved.', 'Field shows 16/11/2026 but the bound input stays empty; "هذا الحقل مطلوب" under the date on every submit.', 'High', 'P1', '', 'Reproduced with a real mouse click on the calendar day — please confirm manually.'],
  ['DEF-049', 'UC-007', 'Typo "اسم المنشأه"', `${TS} (visit step).`, '"اسم المنشأة".', '"اسم المنشأه".', 'Low', 'P4', '', ''],
  ['DEF-050', 'UC-007 / UC-008', 'Reminder status shows "قيد المراجعة"', `${TS} (visit step) → "المتابعة التنظيمية".`, '"In Progress" / "قيد التنفيذ" until due.', '"قيد المراجعة".', 'Low', 'P4', '', ''],
  ['DEF-051', 'UC-007', 'Visit is not saved after a valid submit', `${TS} (visit step)\n3. Valid date, finding, description → إرسال.\n4. Reopen the task.`, 'Visit saved, success message, history entry; task stays with the specialist.', 'No message; reopening shows empty date/finding/description; no history entry.', 'High', 'P1', '', 'Blocks UC-007 and the rest of the end-to-end flow.'],
  ['DEF-052', 'UC-007', 'Required-fields message wording', `${TS} (visit step) → submit with a missing field.`, '"يرجى تعبئة جميع الحقول الإلزامية."', 'Toast "يرجى إدخال الحقول الإلزامية." + inline "هذا الحقل مطلوب".', 'Low', 'P4', '', ''],
  ['DEF-054', 'UC-005', 'Step "إرسال" enabled before the check is run', TS, 'Disabled until the check is done (field 1 required).', 'Enabled on page load; step can be completed without checking.', 'Medium', 'P2', '', ''],
  ['DEF-055', 'UC-004', 'Specialist option shows empty parentheses', '1. RCM → review task → الرد علي الطلب → "اختيار الأخصائي".', 'Specialist name (and detail if any).', '"Explotration Demo ()".', 'Low', 'P4', '', ''],
  ['DEF-056', 'UC-003.2', 'Tab label typo "الرد علي الطلب"', '1. Open any task → respond page.', '"الرد على الطلب".', '"الرد علي الطلب".', 'Low', 'P4', '', ''],
  ['DEF-057', 'UC-003.3', 'Task page breadcrumb / title', '1. Open any task → respond page.', 'Title "طلب متابعة رخصة منتهية — [رقم]"; breadcrumb إدارة المهام / متابعة رخص منتهية.', 'Title = task name; breadcrumb "الصفحة الرئيسية / قائمة المهام / <task name>".', 'Low', 'P4', '', ''],
  ['DEF-058', 'UC-003.2', 'No success message after submitting a task response', '1. RCM submits the review (or TS completes a step).', 'Confirmation message.', 'Redirects to Task Management silently.', 'Low', 'P4', '', ''],
  ['DEF-061', 'UC-007', 'Visit panel always open — no "تسجيل بيانات الزيارة" button', `${TS} (visit step).`, 'Button that opens the visit panel (field 6).', 'Panel shown directly.', 'Low', 'P4', '', ''],
  ['DEF-062', 'UC-001', 'Expired License Review task created unassigned', `${VIEW77320}\n2. Tab المهام المرتبطة.`, 'Assigned to the Rehabilitation & Closure Manager (Main path 9).', '"مسندة إلى : مراجعة الرخصة المنتهية — [غير مُسند]".', 'Medium', 'P2', '', ''],
];

module.exports = { results, e2eDefects, defectPatches: { 'DEF-006': { note: 'Also 77320 (licence 20260710137, end 2030-08-19), 77301, 77305, 77310.' } } };
