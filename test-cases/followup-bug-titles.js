/**
 * Descriptive bug titles for the "متابعة رخص منتهية" bug report, keyed by the BugRecorder key.
 * Pattern: <screen / step> — <what happens> (<what should happen>). Used by build-followup-bug-report.js;
 * a key that is not listed keeps the title recorded by the test.
 */
const LEVEL_NAME = {
  'rcm-decision': 'RCM decision "قرار مدير التأهيل والإغلاق"', sgm: 'SGM review "مراجعة مدير عام الاستدامة"', cco: 'CCO review "مراجعة رئيس الامتثال بإسناد"',
  level1: 'Level 1 "مراجعة قرار تسييل الضمان المالي – المستوى الأول"', level2: 'Level 2 "مراجعة قرار تسييل الضمان المالي – المستوى الثاني"',
  level3: 'Level 3 "مراجعة قرار تسييل الضمان المالي – المستوى الثالث"', 'final-approval': 'Final approval "الاعتماد النهائي لتسييل الضمان المالي"',
  visit: 'Site Eligibility – visit step "توثيق الزيارة الميدانية والإفادة"',
};
const RETURNED_FROM = { visit: 'the RCM decision', 'rcm-decision': 'SGM review', sgm: 'CCO review', cco: 'Level 1', level1: 'Level 2', level2: 'Level 3' };

const TITLES = {
  // ---------------- UC-001 / UC-002 Request Management list
  'licence-not-expired': 'Request Management list — follow-up request shown for a licence whose expiry date (2031-11-15) is in the future (only expired licences should get a follow-up)',
  'remaining-period-wrong': 'Request Management list — "المهلة النظامية المتبقية" shows 2005 days instead of 180 − days since expiry (175 for expiry 2026-11-11)',
  'exceeded-english': 'Request Management list — "تجاوز المهلة النظامية؟" shows English "No" instead of Arabic "لا"',
  'licence-type-service-name': 'Request Management list — "نوع الرخصة" shows the service name "إصدار رخصة منجم صغير" instead of the licence type (منجم صغير)',
  'remaining-no-days-unit': 'Request Management list — remaining regulatory period shown as a bare number, without the unit "يوم"',
  'status-filter-values': 'Request Management filter — "حالة الطلب" lists the generic request statuses (مسودة، مرسل، ملغي…) instead of the follow-up statuses (قيد التنفيذ / مكتمل – …)',
  'licence-type-filter-values': 'Request Management filter — "نوع الرخصة" lists service names (إصدار رخصة …) instead of licence types',
  'export-file-name-requests': 'Request Management — "تصدير" downloads "متابعة الرخصة المنتهية.xlsx" instead of "Expired Licenses Monitoring.xlsx" (Change #2)',
  'search-by-request': 'Request Management search — filtering by request number does not return exactly that request',
  'search-unknown-licence': 'Request Management search — a non-existent licence number still returns rows',
  'search-no-results-message': 'Request Management search — no "لا توجد نتائج لعرضها" message when the search returns nothing',
  'reset-keeps-filters': 'Request Management search — "إعادة تهيئة" does not clear the filter fields',
  'task-search-by-licence': 'Task Management search — filtering by licence number does not find the follow-up task',
  // ---------------- UC-002.1 request details
  'details-title': 'Request details page — title "طلب متابعة رخصة منتهية" does not include the request number (Change #6)',
  'company-national-id': 'Request details › "ملف الشركة" — National ID / Iqama number of the investor is not displayed',
  'details-process-type': 'Request details › "تفاصيل الطلب" — field "نوع العملية" (current task) is missing (Change #5)',
  'expiry-mismatch': 'Licence expiry date inconsistent — Request details shows 2026-11-11 while the lists show 2031-11-15 for the same licence',
  'details-status': 'Request details › "تفاصيل الطلب" — "حالة الطلب" is not one of the follow-up statuses',
  'linked-task-duplicates': 'Request details › "المهام المرتبطة" — the same task is shown on more than one card',
  'linked-tasks-no-upcoming': 'Request details › "المهام المرتبطة" — only the current task is listed; upcoming (not started) workflow steps are missing (Change #7)',
  'linked-task-assignee': 'Request details › "المهام المرتبطة" — "مسندة إلى" shows a task name (and "[غير مُسند]") instead of the assigned employee',
  'linked-task-status-texts': 'Request details › "المهام المرتبطة" — card statuses use "جديد" / "منتهي" instead of "قيد التنفيذ" / "مكتمل" / "لم يبدأ"',
  'history-creation': 'Request details › "سجل الطلب" — creation entry "تم إنشاء طلب متابعة رخصة منتهية" by "المنصة" is missing',
  'history-date-format': 'Request details › "سجل الطلب" — dates shown as "2026-11-16 18:38:55" instead of dd/mm/yyyy – hh:mm AM/PM',
  // ---------------- UC-003 Task Management
  'task-columns-order': 'Task Management list — columns in the wrong order ("رقم الرخصة" before "نوع الرخصة")',
  'assign-choices': 'Task Management — row menu offers only "إسناد إلى" (assigns to me at once); no "Assign to Me" / "Assign to Another" choice',
  'unassign-offered': 'Task Management — "إلغاء الإسناد" is still offered after assignment although Unassign was removed (Change #9)',
  'export-file-name-tasks': 'Task Management — "تصدير" downloads "متابعة الرخص المنتهية.xlsx" instead of "Expired Licenses Monitoring.xlsx" (Change #2)',
  // ---------------- UC-004 RCM review
  'specialist-can-take-review': 'Access — the Technical Specialist can assign himself "مراجعة الرخصة المنتهية" (only the RCM may take and answer the review)',
  'review-cancel-saved': 'RCM review — "إلغاء" after choosing a specialist still routes / saves the review (cancel must save nothing)',
  'review-no-cancel': 'RCM review — respond panel has no "إلغاء" button',
  'respond-tab-typo': 'Respond tab label misspelt "الرد علي الطلب" (should be "الرد على الطلب")',
  'review-send-enabled-empty': 'RCM review — "إرسال" is enabled before a specialist is selected',
  'specialist-empty-brackets': 'RCM review — specialist option shown as "Explotration Demo ()" with empty brackets',
  'no-success-message-review': 'RCM review — no confirmation message after "إرسال"; the page just returns to Task Management',
  // ---------------- UC-005 check step + close request
  'close-enabled-no-option': 'Site Eligibility – check step — "إنهاء الطلب" is enabled before any close option is selected',
  'check-step-send-before-check': 'Site Eligibility – check step — step "إرسال" is enabled before the R&C check ("تحقق") is run',
  'close-notes-label': 'Close request section — notes field labelled "الوصف" instead of "ملاحظات"',
  'close-option1-no-certificate': 'Close request — option "تقدم المستثمر بطلب إعادة تأهيل وإغلاق" has no optional certificate upload',
  'close-empty-number-confirm': 'Close request — confirmation dialog shown although the R&C request number is empty',
  'close-empty-number-message': 'Close request — empty R&C number shows the generic "حقل مطلوب" instead of "يرجى إدخال رقم طلب إعادة التأهيل والإغلاق."',
  'close-unknown-rc-number': 'Close request — a non-existent R&C request number goes straight to the closure confirmation (number not validated)',
  'close-unknown-rc-silent': 'Close request — a non-existent R&C request number (99999999) is silently ignored: no validation, no message, no server call',
  'close-option2-no-upload': 'Close request — option "صدور شهادة الإغلاق" has no certificate upload, so closure by certificate is impossible',
  'close-no-certificate-confirm': 'Close request — option "صدور شهادة الإغلاق" without any certificate still opens the closure confirmation "هل أنت متأكد أنك تريد الإنهاء؟" (certificate is mandatory)',
  'close-no-certificate-message': 'Close request — no "يرجى إرفاق شهادة الإغلاق لإنهاء الطلب." message when closing without a certificate',
  'check-message': 'Site Eligibility – check step — R&C check result message differs from the story text',
  'check-not-logged': 'Site Eligibility – check step — running the R&C check ("تحقق") is not recorded in "سجل الطلب"',
  // ---------------- UC-006 email
  'email-confirmation': 'Reminder email step — no "تم إرسال البريد الإلكتروني التذكيري للمستثمر بنجاح." confirmation after sending',
  'email-button-still-enabled': 'Reminder email step — the email "إرسال" button stays enabled after the email was sent',
  // ---------------- UC-007 visit
  'followup-old-task-name': 'Visit step › "المتابعة التنظيمية" — still uses the old task name "المراجعة النهائية والتحقق" instead of "قرار مدير التأهيل والإغلاق" (Change #10)',
  'reminder-status-text': 'Visit step › "المتابعة التنظيمية" — reminder status shown as "قيد المراجعة" instead of "قيد التنفيذ"',
  'visit-date-label': 'Visit step — date field labelled "وقت الزيارة" instead of "تاريخ الزيارة"',
  'facility-typo': 'Visit step — label typo "اسم المنشأه" (should be "اسم المنشأة")',
  'visit-date-future-accepted': 'Visit step — a future visit date (tomorrow) can be selected',
  'visit-date-not-bound': 'Visit step — date picked in the calendar is displayed but not captured by the form',
  'visit-not-saved': 'Visit step — a complete visit is not saved after "إرسال"',
  'visit-partially-saved': 'Visit step — saved visit loses the finding or the description',
  'visit-not-logged': 'Visit step — saved visit is not recorded in "سجل الطلب"',
  'visit-edit-not-saved': 'Visit step — editing a saved visit is not saved',
  'visit-escalates-immediately': 'Workflow — saving the field visit immediately closes Site Eligibility and creates "قرار مدير التأهيل والإغلاق" (must stay with the specialist until the day-181 escalation; "تجاوز المهلة" still "لا", 2005 days left)',
  'visit-date-not-persisted': 'Visit — the visit date is not saved: when the visit is reopened (re-verification / RCM decision panel) the date is empty while the finding and description are kept',
  // ---------------- UC-008 / UC-010 … UC-017
  'decision-assigned-to-specialist': 'Workflow / roles — "قرار مدير التأهيل والإغلاق" is assigned to the Technical Specialist (Explotration Demo) instead of the Rehabilitation & Closure Manager (check role / permission setup)',
  'feedback-role-is-person': 'Request Feedback — "الدور الوظيفي المطلوب إفادته" lists a person ("Explotration Demo()") instead of job roles, so every feedback task goes to a named user',
  'final-status': 'Final approval — after "اعتماد" the request status is "تمت الموافقة" instead of "مكتمل – تمت الموافقة على تسييل الضمان المالي"',
  'final-status-rejected': 'Final approval — after "رفض" the request status is only "مكتمل" instead of "مكتمل – تم رفض تسييل الضمان المالي" (approved and rejected requests cannot be told apart)',
  'reminder-schedule-days': 'Regulatory follow-up ("المتابعة التنظيمية") — reminders scheduled at day 1 and day 3 instead of day 31 and day 61 (decision at day 180)',
  'history-unexpected-status': 'سجل الطلب — the visit response is logged as "تحققت المتطلبات" instead of the action name "مكتمل"',
  'history-comment-check': 'سجل الطلب — the comment typed in the "الوصف" field of the R&C check step is not recorded in its response',
  'history-comment-email': 'سجل الطلب — the comment typed in the "الوصف" field of the reminder-email step is not recorded in its response',
  'history-comment-visit': 'سجل الطلب — the comments typed in the "الوصف" field of the visit step (visit + re-verification) are not recorded in its response',
  'final-approval-reject-no-notes': 'Final approval — "رفض" without notes is not refused / shows no message',
};

/** Descriptive title for a bug key; level keys ("<level>-<check>") are built from the level name. */
function bugTitle(key, fallback) {
  if (TITLES[key]) return TITLES[key];
  const m = key.match(/^(rcm-decision|sgm|cco|level1|level2|level3|final-approval|visit)-(.+)$/);
  if (!m) return fallback;
  const lvl = LEVEL_NAME[m[1]];
  switch (m[2]) {
    case 'no-decision-accepted': return `${lvl} — "إرسال" without choosing a decision is accepted / shows no message`;
    case 'return-no-notes': return `${lvl} — "إعادة للموظف السابق" with empty "ملاحظات القرار" shows no validation message (nothing is submitted)`;
    case 'return-not-routed': return `${lvl} — "إعادة للموظف السابق" does not send the request back to the previous step`;
    case 'return-notes-not-visible': return `Return to previous employee — the return notes written on ${RETURNED_FROM[m[1]] ?? 'the next level'} are not shown to the receiver on ${lvl}`;
    case 'feedback-no-role-notes': return `${lvl} — "طلب إفادة" without role and notes is accepted`;
    case 'feedback-flow': return `Request Feedback on ${lvl} — the level task is closed when feedback is requested and a NEW level task is created after the answer (the task must stay open with its owner)`;
    case 'feedback-role-is-person': return `${lvl} — "الدور الوظيفي المطلوب إفادته" lists people (names / e-mail) instead of job roles`;
    case 'previous-decisions-missing': return `${lvl} — the respond panel does not show the decisions and notes of the earlier levels (read-only approval trail missing)`;
    default: return fallback;
  }
}

module.exports = { bugTitle };
