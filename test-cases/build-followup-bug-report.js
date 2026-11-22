/**
 * Bug report for the "متابعة رخص منتهية" (Follow-up on Expired License) runs — one report per bug.
 *
 *   node test-cases/build-followup-bug-report.js "follow up bugs/<licence>"
 *
 * Reads <dir>/bugs.json (written by src/utils/bug-recorder.ts) and writes <dir>/Bug-Report-<licence>.xlsx:
 *   - "Summary": one row per bug (linked to its report)
 *   - one sheet per bug (FU-001 …): ID, title, status, severity, priority, user story, environment, test data,
 *     preconditions, steps to reproduce, expected, actual, URL, related workbook defect, screenshot (embedded).
 * Needs exceljs (NODE_PATH to an install of exceljs@4.4.0 — not a project dependency).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
// Report wording in English (user's request 2026-11-17); on-screen Arabic kept as "[on screen: …]" evidence.
const EN = require('./followup-en');

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node test-cases/build-followup-bug-report.js "follow up bugs/<licence>"');
const licence = path.basename(path.resolve(dir));
const bugs = JSON.parse(fs.readFileSync(path.join(dir, 'bugs.json'), 'utf8')).map((b) => ({
  ...b, title: EN.bugTitle(b.key, b.title), uc: EN.en(b.uc), expected: EN.tr(b.expected), actual: EN.tr(b.actual),
  test: EN.en(b.test),
}));
// Bugs already reported on other licences (sibling folders of <dir>): key → licences. Anything else is NEW in this run.
// Level families (same fault on another level) count as already reported: feedback-flow, feedback-role-is-person, return-notes-not-visible.
const family = (key) => key.replace(/^(level[0-9]|final-approval|rcm-decision|sgm|cco|visit)-(feedback-flow|feedback-role-is-person|return-notes-not-visible)$/, 'family:$2').replace(/^(feedback-role-is-person)$/, 'family:$1');
const seenBefore = {};
for (const other of fs.readdirSync(path.dirname(path.resolve(dir)))) {
  const file = path.join(path.dirname(path.resolve(dir)), other, 'bugs.json');
  if (other === licence || !fs.existsSync(file)) continue;
  for (const b of JSON.parse(fs.readFileSync(file, 'utf8'))) for (const k of [b.key, family(b.key)]) if (!(seenBefore[k] ?? []).includes(other)) (seenBefore[k] ??= []).push(other);
}
const seenList = (bug) => seenBefore[bug.key] ?? seenBefore[family(bug.key)];
const firstSeen = (bug) => (seenList(bug) ? `Already reported (licence ${seenList(bug).join(', ')})` : 'New in this run');
const isNew = (bug) => !seenList(bug);
const statePath = path.resolve('.workflow-state', `expired-followup-${licence}.json`);
const request = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')).request ?? '' : '';

const RCM = 'Super user (employee1, acting as Rehabilitation & Closure Manager)';
const TS = 'Explotration Demo (employee2, Technical Specialist)';
const REQ = 'Employee portal → إدارة الطلبات → tab "متابعة رخص منتهية"';
const TASKS = 'Employee portal → إدارة المهام → tab "متابعة رخص منتهية"';
const FILTER = (what) => `Open "تصفية" → ${what} → "البحث".`;
const RESPOND = (step) => [`${TASKS}.`, FILTER(`رقم الطلب = ${request}`), '⋮ → "إسناد إلى" (if unassigned) → "الرد على الطلب".', `Tab "الرد علي الطلب" (current step: ${step}).`];
const VIEW = [`${REQ}.`, FILTER(`رقم الطلب = ${request}`), '⋮ → "عرض" (opens the request details in a new tab).'];
const REVIEW = 'مراجعة الرخصة المنتهية';
const CHECK = 'التحقق من أهلية الموقع – التحقق من وجود طلب إعادة التأهيل والإغلاق';
const EMAIL = 'التحقق من أهلية الموقع – إرسال بريد تذكيري للمستثمر';
const VISIT = 'التحقق من أهلية الموقع – توثيق الزيارة الميدانية والإفادة';

/** key → [user, preconditions, steps[]] */
const S = {
  // ---------------- UC-001 / UC-002 list
  'one-row-per-licence': [RCM, 'Follow-up request created by the scheduled job.', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Count the rows.']],
  'licence-not-expired': [RCM, 'Follow-up request created by the scheduled job.', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "تاريخ انتهاء الرخصة" and compare with today.']],
  'remaining-period-wrong': [RCM, 'Follow-up request created by the scheduled job.', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "المهلة النظامية المتبقية".', 'Compute 180 − days elapsed since the expiry date (expiry day not counted).']],
  'exceeded-english': [RCM, '—', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "تجاوز المهلة النظامية؟".']],
  'licence-type-service-name': [RCM, '—', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "نوع الرخصة".']],
  'category-not-abc': [RCM, '—', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "فئة الرخصة".']],
  'remaining-no-days-unit': [RCM, '—', [`${REQ}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read "المهلة النظامية المتبقية".']],
  'status-filter-values': [RCM, '—', [`${REQ}.`, 'Open "تصفية".', 'Open the "حالة الطلب" dropdown and read its values.']],
  'licence-type-filter-values': [RCM, '—', [`${REQ}.`, 'Open "تصفية".', 'Open the "نوع الرخصة" dropdown and read its values.']],
  'export-file-name-requests': [RCM, '—', [`${REQ}.`, 'Click "تصدير".', 'Read the downloaded file name.']],
  'search-by-request': [RCM, '—', [`${REQ}.`, FILTER(`رقم الطلب = ${request}`), 'Read the rows.']],
  'search-unknown-licence': [RCM, '—', [`${REQ}.`, FILTER('رقم الرخصة = 99999999999'), 'Read the rows.']],
  'search-no-results-message': [RCM, '—', [`${REQ}.`, FILTER('رقم الرخصة = 99999999999'), 'Look for the empty-result message.']],
  'reset-keeps-filters': [RCM, '—', [`${REQ}.`, FILTER(`رقم الطلب = ${request}, رقم الرخصة = ${licence}`), 'Click "إعادة تهيئة".', 'Open "تصفية" and read the filter fields.']],
  'task-search-by-licence': [RCM, '—', [`${TASKS}.`, FILTER(`رقم الرخصة = ${licence}`), 'Read the rows.']],
  // ---------------- UC-002.1 details
  'details-title': [RCM, '—', [...VIEW, 'Read the page title / header.']],
  'company-national-id': [RCM, '—', [...VIEW, 'Tab "ملف الشركة": look for الرقم الوطني / رقم الإقامة.']],
  'details-process-type': [RCM, '—', [...VIEW, 'Tab "تفاصيل الطلب": look for "نوع العملية".']],
  'expiry-mismatch': [RCM, '—', [`${REQ}: note "تاريخ انتهاء الرخصة" of the row.`, ...VIEW.slice(1), 'Tab "تفاصيل الطلب": read "تاريخ إنتهاء الرخصة" and compare.']],
  'details-status': [RCM, '—', [...VIEW, 'Tab "تفاصيل الطلب": read "حالة الطلب".']],
  'linked-task-duplicates': [RCM, '—', [...VIEW, 'Tab "المهام المرتبطة": compare the cards.']],
  'linked-tasks-no-upcoming': [RCM, '—', [...VIEW, 'Tab "المهام المرتبطة": look for the upcoming (not started) steps.']],
  'linked-task-assignee': [RCM, '—', [...VIEW, 'Tab "المهام المرتبطة": read "مسندة إلى" on each card.']],
  'linked-task-status-texts': [RCM, '—', [...VIEW, 'Tab "المهام المرتبطة": read the status of each card.']],
  'history-creation': [RCM, '—', [...VIEW, 'Tab "سجل الطلب": read the creation entry.']],
  'history-date-format': [RCM, '—', [...VIEW, 'Tab "سجل الطلب": read "تاريخ تقديم الطلب".']],
  // ---------------- UC-003 tasks
  'task-columns-order': [RCM, '—', [`${TASKS}.`, 'Read the column headers.']],
  'assign-choices': [RCM, 'Task unassigned.', [`${TASKS}.`, FILTER(`رقم الطلب = ${request}`), 'Open the row ⋮ menu.']],
  'unassign-offered': [RCM, '—', [`${TASKS}.`, FILTER(`رقم الطلب = ${request}`), '⋮ → "إسناد إلى".', 'Open the row ⋮ menu again.']],
  'export-file-name-tasks': [RCM, '—', [`${TASKS}.`, 'Click "تصدير".', 'Read the downloaded file name.']],
  // ---------------- UC-004 review
  'specialist-can-take-review': [TS, `Request at "${REVIEW}", not assigned yet.`, [`Log in as the Technical Specialist.`, `${TASKS}.`, FILTER(`رقم الطلب = ${request}`), 'Open the row ⋮ menu.']],
  'review-cancel-saved': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), `Choose specialist "Explotration Demo".`, 'Click "إلغاء".', 'Open the task again; check its step and "سجل الطلب".']],
  'review-no-cancel': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Look for "إلغاء".']],
  'respond-tab-typo': [RCM, '—', [...RESPOND(REVIEW).slice(0, 3), 'Read the tab label.']],
  'review-send-enabled-empty': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Do not choose a specialist; look at "إرسال".']],
  'specialist-empty-brackets': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Open "اختيار الأخصائي" and read the options.']],
  'no-success-message-review': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Choose "Explotration Demo" → "إرسال".', 'Watch for a confirmation message.']],
  // ---------------- UC-005 check + close section
  'close-enabled-no-option': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Do not choose a close option; look at "إنهاء الطلب".']],
  'check-step-send-before-check': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Do not run "تحقق"; look at the bottom "إرسال".']],
  'close-notes-label': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Read the notes label under "هل ترغب في إغلاق الطلب؟".']],
  'close-option1-no-certificate': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "تقدم المستثمر بطلب إعادة تأهيل وإغلاق".', 'Look for the optional certificate upload.']],
  'close-empty-number-confirm': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "تقدم المستثمر بطلب إعادة تأهيل وإغلاق", leave the number empty.', 'Click "إنهاء الطلب".']],
  'close-empty-number-message': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "تقدم المستثمر بطلب إعادة تأهيل وإغلاق", leave the number empty.', 'Click "إنهاء الطلب".']],
  'close-unknown-rc-number': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "تقدم المستثمر بطلب إعادة تأهيل وإغلاق".', 'رقم الطلب = 99999999 (does not exist).', 'Click "إنهاء الطلب" (then cancel the dialog).']],
  'close-unknown-rc-silent': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "تقدم المستثمر بطلب إعادة تأهيل وإغلاق".', 'رقم الطلب = 99999999 (does not exist).', 'Click "إنهاء الطلب".']],
  'close-option2-no-upload': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "صدور شهادة الإغلاق".', 'Look for the certificate upload.']],
  'close-no-certificate-confirm': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "صدور شهادة الإغلاق", no file.', 'Click "إنهاء الطلب".']],
  'close-no-certificate-message': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Choose "صدور شهادة الإغلاق", no file.', 'Click "إنهاء الطلب".']],
  'check-message': [TS, `Request at "${CHECK}", licence without R&C request.`, [...RESPOND(CHECK), 'Click "تحقق".', 'Read the message.']],
  'check-not-logged': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Click "تحقق".', 'Tab "سجل الطلب" → "سجل الردود".']],
  // ---------------- UC-006 email
  'email-confirmation': [TS, `Request at "${EMAIL}".`, [...RESPOND(EMAIL), 'Click the email "إرسال".', 'Watch for the confirmation message.']],
  'email-button-still-enabled': [TS, `Request at "${EMAIL}".`, [...RESPOND(EMAIL), 'Click the email "إرسال".', 'Look at the email button.']],
  // ---------------- UC-007 visit
  'followup-old-task-name': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the "المتابعة التنظيمية" section.']],
  'reminder-status-text': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the reminder status fields.']],
  'visit-date-label': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the visit date label.']],
  'facility-typo': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the facility name label.']],
  'visit-date-future-accepted': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Set the visit date to tomorrow.', 'Look for the date validation message.']],
  'visit-date-not-bound': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Open the visit date calendar → pick today.', 'The field shows the date, but the value saved with the form stays empty.']],
  'visit-description-not-required': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Visit date today, upload an observation, finding "مؤهل".', 'Leave "الوصف" empty → "إرسال".']],
  'visit-not-saved': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Visit date today, upload sample.pdf, finding "مؤهل", الوصف filled → "إرسال".', 'Open the task again: the visit fields are empty.']],
  'visit-partially-saved': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Fill and save a valid visit.', 'Open the task again; check the finding and the description.']],
  'visit-not-logged': [TS, 'Visit saved.', [...RESPOND(VISIT), 'Tab "سجل الطلب" → "سجل الردود".']],
  'visit-edit-not-saved': [TS, 'Visit saved.', [...RESPOND(VISIT), 'Change "الوصف" → "إرسال".', 'Open the task again; read "الوصف".']],
};

// ---------------- decision levels (UC-010 … UC-017): keys "<level>-<check>"
const LEVEL = {
  'rcm-decision': ['قرار مدير التأهيل والإغلاق', TS, 'UC-010'], sgm: ['مراجعة مدير عام الاستدامة', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the SGM task'), 'UC-011'],
  cco: ['مراجعة رئيس الامتثال بإسناد', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the CCO task'), 'UC-012'],
  level1: ['مراجعة قرار تسييل الضمان المالي المستوي الأول', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the Level 1 task'), 'UC-013'],
  level2: ['مراجعة قرار تسييل الضمان المالي المستوي الثاني', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the Level 2 task'), 'UC-014'],
  level3: ['مراجعة قرار تسييل الضمان المالي المستوي الثالث', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the Level 3 task'), 'UC-015'],
  'final-approval': ['الاعتماد النهائي لتسييل الضمان المالي', RCM.replace('acting as Rehabilitation & Closure Manager', 'taking the final-approval task'), 'UC-016'],
  visit: [VISIT, TS, 'UC-007/UC-010'],
};
const NEXT_UP = { visit: 'قرار مدير التأهيل والإغلاق', 'rcm-decision': 'مراجعة مدير عام الاستدامة', sgm: 'مراجعة رئيس الامتثال بإسناد', cco: 'المستوى الأول', level1: 'المستوى الثاني', level2: 'المستوى الثالث' };
function levelSteps(key) {
  const m = key.match(/^(rcm-decision|sgm|cco|level1|level2|level3|final-approval|visit)-(.+)$/);
  if (!m) return undefined;
  const [task, user] = LEVEL[m[1]];
  const R = RESPOND(task);
  const s = {
    'no-decision-accepted': [...R, 'Do not choose a decision → "إرسال".'],
    'return-no-notes': [...R, 'القرار = "إعادة للموظف السابق".', 'Leave "ملاحظات القرار" empty → "إرسال".'],
    'return-not-routed': [...R, 'القرار = "إعادة للموظف السابق" + notes → "إرسال".', `${REQ} → ⋮ → "عرض" → tab "المهام المرتبطة".`],
    'return-notes-not-visible': [`On "${NEXT_UP[m[1]] ?? 'the next level'}": القرار = "إعادة للموظف السابق" + notes → "إرسال" (returns the request to "${task}").`, ...R, 'Look for the return notes on the panel.'],
    'feedback-no-role-notes': [...R, 'القرار = "طلب إفادة"; leave the role and the notes empty → "إرسال".'],
    'feedback-flow': [...R, 'القرار = "طلب إفادة", choose "الدور الوظيفي المطلوب إفادته", notes → "إرسال".', `${REQ} → ⋮ → "عرض" → tab "المهام المرتبطة": check the level task and the "طلب الإفادة" task.`],
    'feedback-role-is-person': [...R, 'القرار = "طلب إفادة".', 'Open "الدور الوظيفي المطلوب إفادته" and read the options.'],
  }[m[2]];
  return s ? [user, `Request at "${task}".`, s] : undefined;
}
Object.assign(S, {
  'visit-escalates-immediately': [TS, `Request at "${VISIT}"; licence far from day 181.`, [...RESPOND(VISIT), 'Pick today in the calendar, upload an observation, finding "مؤهل", الوصف → "إرسال".', `${REQ} → ⋮ → "عرض" → tabs "تفاصيل الطلب" and "المهام المرتبطة".`]],
  'decision-assigned-to-specialist': [RCM, 'Visit saved (the decision task was created).', [...VIEW, 'Tab "المهام المرتبطة": read "مسندة إلى" of "قرار مدير التأهيل والإغلاق".']],
  'visit-date-not-persisted': [TS, 'Visit saved with a date, then returned from "قرار مدير التأهيل والإغلاق".', [...RESPOND(VISIT), 'Read "وقت الزيارة" (finding and description are still filled).']],
  'final-status': [RCM, 'All levels approved, final approval "اعتماد".', [`${REQ}.`, FILTER(`رقم الطلب = ${request}`), 'Read "حالة الطلب".']],
  'feedback-role-is-person': [RCM, 'Any level with "طلب إفادة" (Level 1/2/3, final approval).', [...RESPOND('مراجعة قرار تسييل الضمان المالي المستوي الأول'), 'القرار = "طلب إفادة".', 'Open "الدور الوظيفي المطلوب إفادته" and read the options.', `${REQ} → ⋮ → "عرض" → "المهام المرتبطة": "طلب الإفادة — [Explotration Demo]".`]],
});

/** Steps for the 2026-11-17 check families: data-*, taskname-*, role-*, history-*, final-approval-reject-no-notes. */
function extraSteps(bug) {
  if (/^data-/.test(bug.key)) return [RCM, '—', [`${REQ}: ${FILTER(`رقم الطلب = ${request}`).replace(' → "البحث".', '')} → note the row.`, `${TASKS}: same request → note the row.`, ...VIEW.slice(1), 'Compare the field on "تفاصيل الطلب" / "ملف الشركة" / "سجل الطلب" with both lists.']];
  if (/^taskname-/.test(bug.key)) return [RCM, 'Request at (or past) the task.', ['Open the place named in the title (respond page / Task Management list / "المهام المرتبطة" / "سجل الطلب").', 'Read the task name and compare with the user stories / change log (#10, #11).']];
  if (/^role-/.test(bug.key)) return [RCM, 'Request at the task.', ['Log in as Internal1_Preprod (all roles except specialist) and as InternalExplotration (specialist).', `${TASKS} → ${FILTER(`رقم الطلب = ${request}`)}`, 'Check who can take / answer the task (row menu "إسناد إلى" / "الرد على الطلب").']];
  if (/^history-/.test(bug.key)) return [RCM, 'Workflow run to the end.', [...VIEW, 'Tab "سجل الطلب" → "سجل الردود": check every "رد …" entry (task, decision, employee, date/time, notes) against "المهام المرتبطة".']];
  if (bug.key === 'final-approval-reject-no-notes') return [RCM, 'Request at "الاعتماد النهائي لتسييل الضمان المالي".', [...RESPOND('الاعتماد النهائي لتسييل الضمان المالي'), 'القرار = "رفض"; leave the notes empty → "إرسال".']];
  if (bug.key === 'final-status-rejected') return [RCM, 'Final approval answered with "رفض" + notes.', [`${REQ}.`, FILTER(`رقم الطلب = ${request}`), 'Read "حالة الطلب".']];
  return undefined;
}

/** UI / text defects; everything else is workflow / business LOGIC (listed first — user's focus, 2026-11-16). */
const UI = /^(taskname-|history-response-date-format|history-unexpected-status|exceeded-english|category-not-abc|remaining-no-days-unit|export-file-name|details-title|linked-task-status-texts|history-date-format|task-columns-order|respond-tab-typo|specialist-empty-brackets|no-success-message-review|close-notes-label|followup-old-task-name|reminder-status-text|visit-date-label|facility-typo|email-confirmation|search-no-results-message|close-empty-number-message|.*-return-no-notes)/;
const category = (bug) => (UI.test(bug.key) ? 'UI / Text' : 'Logic');
const severityOrder = { High: 0, Medium: 1, Low: 2 };
bugs.sort((a, b) => (isNew(a) === isNew(b) ? 0 : isNew(a) ? -1 : 1) || (category(a) === category(b) ? 0 : category(a) === 'Logic' ? -1 : 1) || severityOrder[a.severity] - severityOrder[b.severity] || a.at.localeCompare(b.at));

const wb = new ExcelJS.Workbook();
const pdfReports = [];
wb.creator = 'Taadeen automation';
const font = { name: 'Arial', size: 10 };
const head = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const sevColor = { High: 'FFC00000', Medium: 'FFED7D31', Low: 'FF2F75B5' };
const border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };

const summary = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 4, rightToLeft: false }] });
summary.mergeCells('A1:J1');
summary.getCell('A1').value = `Bug report — Follow-up on Expired Licenses — licence ${licence}${request ? `, request ${request}` : ''}`;
summary.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
summary.getCell('A2').value = `Environment: TEST (platform-test.taadeen.dev, employee portal) · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${bugs.length} bugs (${bugs.filter((x) => category(x) === 'Logic').length} logic) · all status New · logic bugs first`;
summary.getCell('A2').font = { ...font, italic: true };
const cols = [['Bug ID', 10], ['First seen', 16], ['Category', 11], ['Title', 60], ['Severity', 10], ['Priority', 9], ['User story', 26], ['Status', 9], ['Related defect', 13], ['Actual result', 70]];
summary.columns = cols.map(([, width]) => ({ width }));
const hr = summary.getRow(4);
cols.forEach(([h], i) => { const c = hr.getCell(i + 1); c.value = h; c.font = head; c.fill = fill('FF1F4E78'); c.border = border; c.alignment = { vertical: 'middle' }; });

bugs.forEach((bug, i) => {
  const id = `FU-${String(i + 1).padStart(3, '0')}`;
  const priority = { High: 'P1', Medium: 'P2', Low: 'P3' }[bug.severity];
  const r = summary.getRow(5 + i);
  [id, firstSeen(bug), category(bug), bug.title, bug.severity, priority, bug.uc, 'New', bug.defect ?? '', bug.actual].forEach((v, k) => {
    const c = r.getCell(k + 1);
    c.value = v; c.font = font; c.border = border; c.alignment = { wrapText: true, vertical: 'top' };
  });
  r.getCell(1).value = { text: id, hyperlink: `#'${id}'!A1` };
  r.getCell(1).font = { ...font, color: { argb: 'FF0563C1' }, underline: true };
  r.getCell(5).font = { ...font, bold: true, color: { argb: sevColor[bug.severity] } };
  if (category(bug) === 'Logic') r.getCell(3).font = { ...font, bold: true };
  if (isNew(bug)) r.getCell(2).font = { ...font, bold: true, color: { argb: 'FF00703C' } };

  // ---- one sheet per bug
  const ws = wb.addWorksheet(id);
  ws.columns = [{ width: 24 }, { width: 110 }];
  const [user, pre, steps] = EN.steps(bug.key, { licence, request })
    ?? (S[bug.key] ?? levelSteps(bug.key) ?? extraSteps(bug) ?? [RCM, '—', [`Found by test "${bug.test}" at ${bug.url}`]]).map((v) => (Array.isArray(v) ? v.map(EN.en) : EN.en(v)));
  const rows = [
    ['Bug ID', id],
    ['Title', bug.title],
    ['Status', 'New'],
    ['First seen', firstSeen(bug)],
    ['Category', category(bug)],
    ['Severity', bug.severity],
    ['Priority', priority],
    ['Service / module', 'Follow-up on Expired Licenses — employee portal'],
    ['User story / requirement', bug.uc],
    ['Environment', 'TEST — https://platform-test.taadeen.dev (employee portal), Chromium (Playwright)'],
    ['Test data', `Licence ${licence}${request ? ` · follow-up request ${request}` : ''}`],
    ['User / role', user],
    ['Preconditions', pre],
    ['Steps to reproduce', steps.map((s, k) => `${k + 1}. ${s}`).join('\n')],
    ['Expected result', bug.expected],
    ['Actual result', bug.actual],
    ['Page URL', bug.url],
    ['Related workbook defect', bug.defect ?? '— (new)'],
    ['Found by', `Automated test "${bug.test}" — ${bug.at.slice(0, 16).replace('T', ' ')} UTC`],
    ['Screenshot', `${path.basename(bug.screenshot)} (offending element outlined in red) — below`],
  ];
  rows.forEach(([k, v], n) => {
    const row = ws.getRow(n + 1);
    row.getCell(1).value = k; row.getCell(1).font = { ...font, bold: true }; row.getCell(1).fill = fill('FFDDEBF7');
    row.getCell(2).value = v; row.getCell(2).font = font;
    [1, 2].forEach((c) => { row.getCell(c).border = border; row.getCell(c).alignment = { wrapText: true, vertical: 'top' }; });
    if (k === 'Title') row.getCell(2).font = { ...font, bold: true, size: 12 };
    if (k === 'Severity') row.getCell(2).font = { ...font, bold: true, color: { argb: sevColor[bug.severity] } };
    const lines = String(v).split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / 100)), 0);
    row.height = Math.max(18, lines * 15);
  });
  ws.getRow(2).height = 22;
  const shot = path.resolve(bug.screenshot);
  if (fs.existsSync(shot)) {
    const img = wb.addImage({ filename: shot, extension: 'png' });
    ws.addImage(img, { tl: { col: 0, row: rows.length + 0.4 }, ext: { width: 960, height: 600 } });
  } else {
    ws.getRow(rows.length + 1).getCell(2).value = 'Screenshot file missing.';
  }
  ws.getRow(rows.length + 1).getCell(1).value = { text: '← Summary', hyperlink: "#'Summary'!A1" };
  ws.getRow(rows.length + 1).getCell(1).font = { ...font, color: { argb: 'FF0563C1' }, underline: true };
  pdfReports.push({ id, bug, priority, rows: rows.filter(([k]) => k !== 'Screenshot'), shot: fs.existsSync(shot) ? shot : '' });
});

// ---------------------------------------------------------------- PDF: cover + summary, then one page per bug with its screenshot
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/** Value cell: line breaks kept; an "On screen: <Arabic>" line is shown right-to-left on its own line (evidence). */
function fmt(v) {
  return String(v ?? '').split('\n').map((line) => (line.startsWith('On screen: ')
    ? `<div class="ar"><span class="lbl">On screen:</span> <bdi dir="rtl">${esc(line.slice('On screen: '.length))}</bdi></div>`
    : esc(line))).join('<br>');
}
function pdfHtml() {
  const sev = { High: '#C00000', Medium: '#ED7D31', Low: '#2F75B5' };
  const logic = pdfReports.filter((r) => category(r.bug) === 'Logic').length;
  const count = (s) => pdfReports.filter((r) => r.bug.severity === s).length;
  const summaryRows = pdfReports.map((r) => `<tr><td><a href="#${r.id}">${r.id}</a></td><td class="${isNew(r.bug) ? 'nwt' : ''}">${isNew(r.bug) ? 'New' : 'Already reported'}</td><td class="${category(r.bug) === 'Logic' ? 'b' : ''}">${category(r.bug)}</td><td dir="ltr">${esc(r.bug.title)}</td>
    <td style="color:${sev[r.bug.severity]};font-weight:bold">${r.bug.severity}</td><td>${r.priority}</td><td dir="ltr">${esc(r.bug.uc)}</td></tr>`).join('');
  const pages = pdfReports.map((r) => `
    <section class="bug" id="${r.id}">
      <div class="head"><span class="id">${r.id}</span><span class="sev" style="background:${sev[r.bug.severity]}">${r.bug.severity} · ${r.priority}</span><span class="cat">${category(r.bug)}</span><span class="${isNew(r.bug) ? 'nw' : 'old'}">${isNew(r.bug) ? 'NEW' : 'Already reported'}</span><span class="st">New</span></div>
      <h2 dir="ltr">${esc(r.bug.title)}</h2>
      <table class="kv">${r.rows.filter(([k]) => !['Bug ID', 'Title', 'Status', 'Category', 'Severity', 'Priority'].includes(k))
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td dir="ltr" class="${/Expected|Actual/.test(k) ? 'em' : ''}">${fmt(v)}</td></tr>`).join('')}</table>
      ${r.shot ? `<div class="shot"><div class="cap">Screenshot — ${esc(path.basename(r.shot))} (offending element outlined in red)</div><img src="data:image/png;base64,${fs.readFileSync(r.shot).toString('base64')}"></div>` : '<p class="cap">Screenshot file missing.</p>'}
    </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm 11mm 14mm; }
    body { font-family: Arial, 'Segoe UI', Tahoma, sans-serif; font-size: 9.5pt; color: #222; }
    h1 { font-size: 17pt; margin: 0 0 4px; } .sub { color: #555; margin-bottom: 12px; }
    .stats { display: flex; gap: 8px; margin: 10px 0 14px; } .stats div { border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; } .stats b { font-size: 13pt; display: block; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #bfbfbf; padding: 4px 6px; vertical-align: top; text-align: left; }
    .sum th { background: #1F4E78; color: #fff; } .sum td { font-size: 8.5pt; } .b { font-weight: bold; } a { color: #0563C1; text-decoration: none; }
    .bug { page-break-before: always; } .head { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
    .id { font-weight: bold; font-size: 12pt; } .sev, .cat, .st { border-radius: 3px; padding: 1px 7px; font-size: 8.5pt; } .sev { color: #fff; font-weight: bold; }
    td { overflow-wrap: anywhere; word-break: break-word; } .ar { margin-top: 3px; color: #555; } .ar .lbl { font-size: 8pt; } .cat { background: #DDEBF7; } .nw { background: #00703C; color: #fff; font-weight: bold; border-radius: 3px; padding: 1px 7px; font-size: 8.5pt; } .old { background: #EDEDED; border-radius: 3px; padding: 1px 7px; font-size: 8.5pt; } .nwt { color: #00703C; font-weight: bold; } .st { background: #E2EFDA; } h2 { font-size: 12.5pt; margin: 4px 0 8px; }
    .kv th { width: 25%; background: #DDEBF7; } .kv td.em { background: #FFF8E5; }
    .shot { margin-top: 8px; page-break-inside: avoid; } .shot img { width: 100%; border: 1px solid #999; } .cap { color: #555; font-size: 8.5pt; margin-bottom: 3px; }
  </style></head><body>
    <h1>Bug report — Follow-up on Expired Licenses</h1>
    <div class="sub">Licence ${esc(licence)}${request ? ` · follow-up request ${esc(request)}` : ''} · TEST (platform-test.taadeen.dev, employee portal) · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · all bugs status New</div>
    <div class="stats"><div><b>${pdfReports.length}</b>bugs</div><div><b style="color:#00703C">${pdfReports.filter((r) => isNew(r.bug)).length}</b>new in this run</div><div><b>${logic}</b>logic</div><div><b>${pdfReports.length - logic}</b>UI / text</div>
      <div><b style="color:${sev.High}">${count('High')}</b>High</div><div><b style="color:${sev.Medium}">${count('Medium')}</b>Medium</div><div><b style="color:${sev.Low}">${count('Low')}</b>Low</div></div>
    <table class="sum"><tr><th>ID</th><th>First seen</th><th>Category</th><th>Title</th><th>Severity</th><th>Priority</th><th>User story</th></tr>${summaryRows}</table>
    ${pages}
  </body></html>`;
}

(async () => {
  const out = path.join(dir, `Bug-Report-${licence}.xlsx`);
  await wb.xlsx.writeFile(out);
  console.log(`Written ${out} — ${bugs.length} bug reports`);
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(pdfHtml(), { waitUntil: 'load' });
  if (process.env.PREVIEW) { await page.setViewportSize({ width: 794, height: 1123 }); await page.screenshot({ path: path.join(process.env.PREVIEW, 'cover.png') }); await page.locator('section.bug').first().screenshot({ path: path.join(process.env.PREVIEW, 'bug1.png') }); }
  const pdf = path.join(dir, `Bug-Report-${licence}.pdf`);
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:7pt;width:100%;text-align:center;color:#777">Follow-up on Expired License — licence ${licence} — page <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } });
  await browser.close();
  console.log(`Written ${pdf}`);
})();
