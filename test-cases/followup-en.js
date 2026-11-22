/**
 * English wording of the "Follow-up on Expired Licenses" bug report (user's request 2026-11-17: "write test bugs and
 * its steps in English"). Used by build-followup-bug-report.js for the PDF and the Excel report.
 *
 *   tr(text)         Arabic UI names / statuses / messages → English; when the text changed, the original on-screen
 *                    Arabic is kept as evidence: "Completed [on screen: مكتمل]".
 *   bugTitle(key)    English title per bug key (level keys built from the level name).
 *   steps(key, ctx)  [user, preconditions, steps[]] in English.
 */

// ---------------------------------------------------------------- glossary (longest phrases are replaced first)
const G = {
  // task names (user stories + change log #10 / #11)
  'التحقق من أهلية الموقع - التحقق من وجود طلب إعادة التأهيل والإغلاق': 'Site Eligibility Verification – Check for a Rehabilitation & Closure Request',
  'التحقق من أهلية الموقع – التحقق من وجود طلب إعادة التأهيل والإغلاق': 'Site Eligibility Verification – Check for a Rehabilitation & Closure Request',
  'التحقق من أهلية الموقع - إرسال بريد تذكيري للمستثمر': 'Site Eligibility Verification – Send Reminder Email to the Investor',
  'التحقق من أهلية الموقع – إرسال بريد تذكيري للمستثمر': 'Site Eligibility Verification – Send Reminder Email to the Investor',
  'التحقق من أهلية الموقع - توثيق الزيارة الميدانية والإفادة': 'Site Eligibility Verification – Field Visit and Finding',
  'التحقق من أهلية الموقع – توثيق الزيارة الميدانية والإفادة': 'Site Eligibility Verification – Field Visit and Finding',
  'التحقق من وجود طلب إعادة التأهيل والإغلاق': 'Check for a Rehabilitation & Closure Request',
  'إرسال بريد تذكيري للمستثمر': 'Send Reminder Email to the Investor',
  'توثيق الزيارة الميدانية والإفادة': 'Field Visit and Finding',
  'التحقق من أهلية الموقع': 'Site Eligibility Verification',
  'مراجعة الرخصة المنتهية': 'Expired License Review',
  'قرار مدير التأهيل والإغلاق': "Rehabilitation & Closure Manager's Decision",
  'المراجعة النهائية والتحقق': 'Final Review and Verification (old task name)',
  'مراجعة مدير عام الاستدامة': 'Sustainability General Manager Review',
  'مراجعة رئيس الامتثال بإسناد': 'Chief Compliance Officer Review',
  'مراجعة قرار تسييل الضمان المالي – المستوى الأول': 'Guarantee Liquidation Decision Review – Level 1',
  'مراجعة قرار تسييل الضمان المالي – المستوى الثاني': 'Guarantee Liquidation Decision Review – Level 2',
  'مراجعة قرار تسييل الضمان المالي – المستوى الثالث': 'Guarantee Liquidation Decision Review – Level 3',
  'مراجعة قرار تسييل الضمان المالي المستوي الأول': 'Guarantee Liquidation Decision Review – Level 1',
  'مراجعة قرار تسييل الضمان المالي المستوي الاول': 'Guarantee Liquidation Decision Review – Level 1',
  'مراجعة قرار تسييل الضمان المالي المستوي الثاني': 'Guarantee Liquidation Decision Review – Level 2',
  'مراجعة قرار تسييل الضمان المالي المستوي الثالث': 'Guarantee Liquidation Decision Review – Level 3',
  'الاعتماد النهائي لتسييل الضمان المالي': 'Final Guarantee Liquidation Approval',
  'طلب الإفادة': 'Feedback Request',
  // screens, tabs, buttons
  'إدارة الطلبات': 'Request Management', 'إدارة المهام': 'Task Management', 'متابعة رخص منتهية': 'Follow-up on Expired Licenses',
  'ملف الشركة': 'Company Profile', 'تفاصيل الطلب': 'Request Details', 'المهام المرتبطة': 'Linked Tasks', 'سجل الطلب': 'Request History',
  'سجل الردود': 'Responses', 'الرد على الطلب (للقراءة فقط)': 'Respond to Request (read-only)', 'الرد علي الطلب': 'Respond to Request (misspelt "الرد علي")',
  'الرد على الطلب': 'Respond to Request', 'إسناد إلى': 'Assign to', 'إلغاء الإسناد': 'Unassign', 'إنهاء الطلب': 'Terminate Request',
  'إعادة للموظف السابق': 'Return to Previous Employee', 'طلب إفادة': 'Request Feedback', 'إعادة تهيئة': 'Reset', 'مسند إلى': 'Assigned to',
  'عرض': 'View', 'إرسال': 'Send', 'إلغاء': 'Cancel', 'تحقق': 'Check', 'اعتماد': 'Approve', 'رفض': 'Reject', 'تصدير': 'Export',
  'تصفية': 'Filter', 'البحث': 'Search', 'حفظ': 'Save', 'لي': 'Me', 'آخرون': 'Others',
  // fields
  'رقم الطلب': 'Request No.', 'رقم الرخصة': 'Licence No.', 'نوع الرخصة': 'Licence Type', 'فئة الرخصة': 'Licence Category',
  'تاريخ انتهاء الرخصة': 'Licence Expiry Date', 'تاريخ إنتهاء الرخصة': 'Licence Expiry Date', 'تاريخ إنشاء الطلب': 'Request Creation Date',
  'حالة الطلب': 'Request Status', 'نوع العملية': 'Process Type', 'تجاوز المهلة النظامية؟': 'Regulatory Period Exceeded?',
  'المهلة النظامية المتبقية': 'Remaining Regulatory Period', 'عدد الأيام المتبقية': 'Remaining Days', 'مسندة إلى': 'Assigned to',
  'اختيار الأخصائي': 'Select Specialist', 'هل ترغب في إغلاق الطلب؟': 'Do you want to close the request?',
  'تقدم المستثمر بطلب إعادة تأهيل وإغلاق': 'The investor submitted a Rehabilitation & Closure request', 'صدور شهادة الإغلاق': 'Closure certificate issued',
  'ملاحظات القرار': 'Decision Notes', 'الوصف': 'Description', 'ملاحظات': 'Notes', 'القرار': 'Decision', 'وقت الزيارة': 'Visit Time',
  'تاريخ الزيارة': 'Visit Date', 'اسم المنشأه': 'Facility Name (misspelt "المنشأه")', 'اسم المنشأة': 'Facility Name', 'الإفادة': 'Finding',
  'غير مؤهل': 'Not Eligible', 'مؤهل': 'Eligible', 'المتابعة التنظيمية': 'Regulatory Follow-up', 'التذكير الأول للمستثمر': 'First reminder to the investor',
  'التذكير الثاني للمستثمر': 'Second reminder to the investor', 'التذكير الأول': 'First reminder', 'التذكير الثاني': 'Second reminder', 'الدور الوظيفي المطلوب إفادته': 'Requested Role (feedback)', 'إفادة الموظف': 'Employee response',
  'تاريخ تقديم الطلب': 'Request submission date', 'تم إنشاء طلب متابعة رخصة منتهية': 'Expired licence follow-up request created', 'المنصة': 'Platform',
  'الرقم الوطني': 'National ID', 'رقم الإقامة': 'Iqama No.', 'معلومات الشركة': 'Company Information', 'غير مُسند': 'Unassigned', 'الأخصائي': 'Specialist',
  'طلب متابعة رخصة منتهية': 'Expired Licence Follow-up Request', 'متابعة الرخصة المنتهية': 'Expired licence follow-up', 'متابعة الرخص المنتهية': 'Expired licences follow-up',
  'يوم': 'day(s)',
  // statuses
  'مكتمل – تمت الموافقة على تسييل الضمان المالي': 'Completed – Guarantee liquidation approved', 'مكتمل – تم رفض تسييل الضمان المالي': 'Completed – Guarantee liquidation rejected',
  'مكتمل – لا يتطلب إجراء': 'Completed – No action required', 'مكتمل – تم تقديم طلب/ شهادة إعادة التأهيل والإغلاق': 'Completed – R&C request / certificate submitted',
  'مكتمل – بيانات تاريخية مُرحّلة': 'Completed – Migrated historical data', 'قيد التنفيذ': 'In Progress', 'قيد المراجعة': 'Under Review', 'تمت الموافقة': 'Approved',
  'تحققت المتطلبات': 'Requirements met', 'لم يبدأ': 'Not Started', 'مكتمل': 'Completed', 'جديد': 'New', 'منتهي': 'Closed', 'نعم': 'Yes', 'لا': 'No',
  'مسودة': 'Draft', 'مسحوب': 'Withdrawn', 'مرسل': 'Submitted', 'محذوف': 'Deleted', 'ملغي': 'Cancelled', 'مرفوض': 'Rejected', 'بإنتظار الدفع': 'Awaiting payment',
  'بإنتظار إجراء المستثمر': 'Awaiting investor action',
  // licence types (shown where the licence type is expected)
  'إصدار رخصة تعدين': 'Issue Mining Licence (service name)', 'إصدار رخصة منجم صغير': 'Issue Small Mine Licence (service name)',
  'إصدار رخصة محجر مواد بناء': 'Issue Building Materials Quarry Licence (service name)',
  // messages
  'لا يوجد طلب إعادة تأهيل وإغلاق مرتبط بهذه الرخصة، أو أن الطلب لم يكتمل بعد. يرجى استكمال إجراءات المهمة وفقًا لسير العمل.': 'There is no Rehabilitation & Closure request linked to this licence, or it is not completed yet. Please continue the task according to the workflow.',
  'يرجى تعبئة جميع الحقول الإلزامية.': 'Please fill in all mandatory fields.', 'هذا الحقل مطلوب': 'This field is required', 'حقل مطلوب': 'Required field',
  'يرجى إدخال رقم طلب إعادة التأهيل والإغلاق.': 'Please enter the Rehabilitation & Closure request number.', 'يرجى إرفاق شهادة الإغلاق لإنهاء الطلب.': 'Please attach the closure certificate to close the request.',
  'يجب أن يكون تاريخ الزيارة في تاريخ اليوم أو قبله، وألا يسبق تاريخ إنشاء الطلب.': 'The visit date must be today or earlier and not before the request creation date.',
  'تم إرسال البريد الإلكتروني التذكيري للمستثمر بنجاح.': 'The reminder email was sent to the investor successfully.',
  'لا توجد نتائج لعرضها': 'No results to display', 'تعليق آلي': 'automated comment', 'زيارة ميدانية آلية - الموقع مؤهل.': 'Automated field visit – site eligible.',
  'إعادة آلية للموظف السابق من': 'automated return to previous employee from', 'طلب إفادة آلي من': 'automated feedback request from', 'إفادة آلية على طلب الإفادة': 'automated answer to the feedback request',
  'اعتماد آلي': 'automated approval', 'رفض آلي لتسييل الضمان المالي': 'automated rejection of the guarantee liquidation',
  'شركة يوسف حمدي': 'Youssef Hamdi Company', 'أ': 'A', 'ب': 'B', 'ج': 'C',
};
const KEYS = Object.keys(G).sort((a, b) => b.length - a.length);
const AR = /[؀-ۿ]/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = KEYS.map((k) => [new RegExp(`(?<![\\u0600-\\u06FF])${esc(k)}(?![\\u0600-\\u06FF])`, 'g'), G[k]]);

/** Arabic → English; keeps the original on-screen Arabic as evidence when anything was translated. */
function tr(text) {
  const src = String(text ?? '');
  if (!AR.test(src)) return src;
  let out = src;
  for (const [re, en] of RE) out = out.replace(re, en);
  // The on-screen Arabic goes on its own line so English and Arabic do not mix in one (bidi) line.
  return out === src ? src : `${out}\nOn screen: ${src}`;
}
/** Arabic → English without the evidence suffix (names inside titles / steps). */
function en(text) {
  let out = String(text ?? '');
  for (const [re, e] of RE) out = out.replace(re, e);
  return out;
}

// ---------------------------------------------------------------- titles
const LEVEL = {
  'rcm-decision': "Rehabilitation & Closure Manager's Decision (UC-010)", sgm: 'Sustainability General Manager Review (UC-011)', cco: 'Chief Compliance Officer Review (UC-012)',
  level1: 'Guarantee Liquidation Decision Review – Level 1 (UC-013)', level2: 'Guarantee Liquidation Decision Review – Level 2 (UC-014)',
  level3: 'Guarantee Liquidation Decision Review – Level 3 (UC-015)', 'final-approval': 'Final Guarantee Liquidation Approval (UC-016)',
  visit: 'Site Eligibility – Field Visit step (UC-007)', feedback: 'Feedback Request (UC-017)',
};
const RETURNED_FROM = { visit: "the RCM's Decision", 'rcm-decision': 'the SGM Review', sgm: 'the CCO Review', cco: 'Level 1', level1: 'Level 2', level2: 'Level 3' };
const PLACE = { title: 'the respond page title', list: 'the Task Management "Process Type" column', card: 'its Linked Tasks card', 'assignee-label': 'the "Assigned to" label of its Linked Tasks card', history: 'its Request History entry' };
const TASK_ID_EN = { review: 'Expired License Review', check: 'Site Eligibility – Check for R&C Request', email: 'Site Eligibility – Send Reminder Email', visit: 'Site Eligibility – Field Visit and Finding',
  rcmDecision: "Rehabilitation & Closure Manager's Decision", sgm: 'Sustainability General Manager Review', cco: 'Chief Compliance Officer Review', level1: 'Guarantee Liquidation Decision Review – Level 1',
  level2: 'Guarantee Liquidation Decision Review – Level 2', level3: 'Guarantee Liquidation Decision Review – Level 3', finalApproval: 'Final Guarantee Liquidation Approval', feedback: 'Feedback Request' };

const TITLES = {
  'licence-not-expired': 'Request Management list – a follow-up request is shown for a licence whose expiry date is in the future (only expired licences may get a follow-up)',
  'remaining-period-wrong': 'Request Management list – "Remaining Regulatory Period" is not 180 minus the days elapsed since expiry',
  'exceeded-english': 'Request Management list – "Regulatory Period Exceeded?" is shown in English ("No") instead of Arabic',
  'licence-type-service-name': 'Request Management list – "Licence Type" shows the service name (e.g. "Issue Mining Licence") instead of the licence type',
  'remaining-no-days-unit': 'Request Management list – the remaining regulatory period is shown as a bare number without the "days" unit',
  'status-filter-values': 'Request Management filter – "Request Status" lists the generic request statuses instead of the follow-up statuses',
  'licence-type-filter-values': 'Request Management filter – "Licence Type" lists service names instead of licence types',
  'export-file-name-requests': 'Request Management – "Export" downloads a file with an Arabic name instead of "Expired Licenses Monitoring.xlsx" (Change #2)',
  'export-file-name-tasks': 'Task Management – "Export" downloads a file with an Arabic name instead of "Expired Licenses Monitoring.xlsx" (Change #2)',
  'search-no-results-message': 'Request Management search – no "No results to display" message for an empty result',
  'reset-keeps-filters': 'Request Management search – "Reset" does not clear the filter fields',
  'search-by-request': 'Request Management search – filtering by request number does not return exactly that request',
  'search-unknown-licence': 'Request Management search – a non-existent licence number still returns rows',
  'task-search-by-licence': 'Task Management search – filtering by licence number does not find the follow-up task',
  'details-title': 'Request Details page – the title does not include the request number (Change #6)',
  'company-national-id': 'Request Details › Company Profile – the National ID / Iqama number is not displayed',
  'details-process-type': 'Request Details › Request Details tab – the "Process Type" (current task) field is missing (Change #5)',
  'expiry-mismatch': 'Licence expiry date differs between the Request Details tab and the lists',
  'details-status': 'Request Details – "Request Status" is not one of the follow-up statuses',
  'linked-task-duplicates': 'Request Details › Linked Tasks – the same task is shown on more than one card',
  'linked-tasks-no-upcoming': 'Request Details › Linked Tasks – only the current task is listed; the upcoming (Not Started) workflow steps are missing (Change #7)',
  'linked-task-assignee': 'Request Details › Linked Tasks – "Assigned to" shows a task name and "Unassigned" instead of the assigned employee',
  'linked-task-status-texts': 'Request Details › Linked Tasks – card statuses use "New" / "Closed" instead of "In Progress" / "Completed" / "Not Started"',
  'history-creation': 'Request History – the creation entry by "Platform" is missing',
  'history-date-format': 'Request History – dates are shown as yyyy-mm-dd hh:mm:ss instead of dd/mm/yyyy – hh:mm AM/PM',
  'task-columns-order': 'Task Management list – columns are in the wrong order ("Licence No." before "Licence Type")',
  'assign-choices': 'Task Management – the row menu offers only "Assign to" (assigns to me at once); no "Assign to Me" / "Assign to Another" choice',
  'unassign-offered': 'Task Management – "Unassign" is still offered after assignment although it was removed (Change #9)',
  'specialist-can-take-review': 'Access – the Technical Specialist can take or respond to the "Expired License Review" task (RCM only)',
  'review-cancel-saved': 'Expired License Review – "Cancel" after selecting a specialist still saves / routes the task',
  'review-no-cancel': 'Expired License Review – the respond panel has no "Cancel" button',
  'respond-tab-typo': 'Respond tab label is misspelt ("الرد علي الطلب" instead of "الرد على الطلب")',
  'review-send-enabled-empty': 'Expired License Review – "Send" is enabled before a specialist is selected',
  'specialist-empty-brackets': 'Expired License Review – specialist options are shown with empty brackets, e.g. "Explotration Demo ()"',
  'no-success-message-review': 'Expired License Review – no confirmation message after "Send"; the page just returns to Task Management',
  'close-enabled-no-option': 'Site Eligibility – Check step – "Terminate Request" is enabled before a close option is selected',
  'check-step-send-before-check': 'Site Eligibility – Check step – the step "Send" is enabled before the R&C check is run',
  'close-notes-label': 'Close-request section – the notes field is labelled "Description" instead of "Notes"',
  'close-option1-no-certificate': 'Close request – option "The investor submitted a Rehabilitation & Closure request" has no optional certificate upload',
  'close-empty-number-confirm': 'Close request – the confirmation dialog is shown although the R&C request number is empty',
  'close-empty-number-message': 'Close request – an empty R&C number shows a generic "Required field" instead of the story message',
  'close-unknown-rc-number': 'Close request – a non-existent R&C request number goes straight to the closure confirmation (number not validated)',
  'close-unknown-rc-silent': 'Close request – a non-existent R&C request number (99999999) is silently ignored: no validation, no message, no server call',
  'close-option2-no-upload': 'Close request – option "Closure certificate issued" has no certificate upload, so closure by certificate is impossible',
  'close-no-certificate-confirm': 'Close request – option "Closure certificate issued" without a certificate still opens the closure confirmation (the certificate is mandatory)',
  'close-no-certificate-message': 'Close request – no "Please attach the closure certificate" message when closing without a certificate',
  'check-message': 'Site Eligibility – Check step – the R&C check result message differs from the story text',
  'check-not-logged': 'Site Eligibility – Check step – running the R&C check is not recorded in Request History',
  'email-confirmation': 'Reminder Email step – no confirmation message after sending the email',
  'email-button-still-enabled': 'Reminder Email step – the email "Send" button stays enabled after the email was sent',
  'followup-old-task-name': 'Field Visit step › Regulatory Follow-up – still uses the old task name "Final Review and Verification" (Change #10)',
  'reminder-status-text': 'Field Visit step › Regulatory Follow-up – the reminder status is "Under Review" instead of "In Progress"',
  'visit-date-label': 'Field Visit step – the date field is labelled "Visit Time" instead of "Visit Date"',
  'facility-typo': 'Field Visit step – label typo "اسم المنشأه" (should be "اسم المنشأة", Facility Name)',
  'visit-date-future-accepted': 'Field Visit step – a future visit date (tomorrow) can be selected',
  'visit-date-not-bound': 'Field Visit step – the date picked in the calendar is displayed but not captured by the form',
  'visit-not-saved': 'Field Visit step – a complete visit is not saved after "Send"',
  'visit-partially-saved': 'Field Visit step – the saved visit loses the finding or the description',
  'visit-not-logged': 'Field Visit step – the saved visit is not recorded in Request History',
  'visit-edit-not-saved': 'Field Visit step – editing a saved visit is not saved',
  'visit-escalates-immediately': "Workflow – saving the field visit immediately closes Site Eligibility and creates the RCM's Decision task (it must stay with the specialist until the day-181 escalation)",
  'visit-date-not-persisted': "Field visit – the visit date is not saved: when the visit is reopened (re-verification / RCM's Decision panel) the date is empty while finding and description are kept",
  'decision-assigned-to-specialist': "Workflow / roles – the RCM's Decision task is assigned to the Technical Specialist instead of the Rehabilitation & Closure Manager (check role / permission setup)",
  'feedback-role-is-person': 'Request Feedback – "Requested Role" lists people instead of job roles, so every feedback task goes to a named user',
  'final-status': 'Final approval – after "Approve" the request status is "Approved" instead of "Completed – Guarantee liquidation approved"',
  'final-status-rejected': 'Final approval – after "Reject" the status is only "Completed" instead of "Completed – Guarantee liquidation rejected" (approved and rejected requests cannot be told apart)',
  'final-approval-reject-no-notes': 'Final approval – "Reject" without notes is not refused / shows no message',
  'final-remaining-not-zero': 'Final approval – the completed request still shows a remaining regulatory period (178 days after "Approve") instead of 0',
  'specialist-list-non-specialist': 'Expired License Review – "Select Specialist" offers Internal1_Preprod (a user without the specialist role), shown with an e-mail address',
  'reminder-schedule-days': 'Regulatory Follow-up – reminders are scheduled at day 1 and day 3 instead of day 31 and day 61 (decision at day 180)',
  'history-missing-responses': 'Request History – completed tasks have no response entry',
  'history-no-employee': 'Request History – response entries do not show which employee answered',
  'history-decision-missing': "Request History – 3 responses of the RCM's Decision show no decision: the decision line holds the employee name (\"Super user\")",
  'history-unexpected-status': 'Request History – the field-visit response is logged as "Requirements met" instead of the action name "Completed"',
  'history-response-date-format': 'Request History – response date / time is not dd/mm/yyyy – hh:mm AM/PM',
  'history-notes-missing': 'Request History – decision / return / feedback notes are not recorded',
  'history-wrong-decision': 'Request History – the logged decision differs from the decision taken',
  'history-comment-check': 'Request History – the comment typed in the "Description" field of the R&C Check step is not recorded in its response',
  'history-comment-email': 'Request History – the comment typed in the "Description" field of the Reminder Email step is not recorded in its response',
  'history-comment-visit': 'Request History – the comments typed in the "Description" field of the Field Visit step (visit + re-verification) are not recorded in its response',
  'feedback-empty-accepted': 'Feedback Request – an empty feedback answer is accepted',
};

function bugTitle(key, fallback) {
  if (TITLES[key]) return TITLES[key];
  let m = key.match(/^taskname-([a-zA-Z0-9]+)-(title|list|card|assignee-label|history)$/);
  if (m) return `Task name – "${TASK_ID_EN[m[1]] ?? m[1]}" is spelt differently from the user stories on ${PLACE[m[2]]}`;
  m = key.match(/^role-([a-zA-Z0-9]+)-wrong-owner$/);
  if (m) return `Roles – "${TASK_ID_EN[m[1]] ?? m[1]}" cannot be taken by the account holding its role`;
  m = key.match(/^data-(.+)$/);
  if (m) return `Data – "${m[1]}" differs between Request Management, Task Management, Request Details and Request History`;
  m = key.match(/^(rcm-decision|sgm|cco|level1|level2|level3|final-approval|visit|feedback)-(.+)$/);
  if (m) {
    const lvl = LEVEL[m[1]];
    switch (m[2]) {
      case 'no-decision-accepted': return `${lvl} – "Send" without choosing a decision is accepted / shows no message`;
      case 'return-no-notes': return `${lvl} – "Return to Previous Employee" with empty Decision Notes shows no validation message (nothing is submitted)`;
      case 'return-not-routed': return `${lvl} – "Return to Previous Employee" does not send the request back to the previous step`;
      case 'return-notes-not-visible': return `Return to Previous Employee – the return notes written on ${RETURNED_FROM[m[1]] ?? 'the next level'} are not shown to the receiver on ${lvl}`;
      case 'feedback-no-role-notes': return `${lvl} – "Request Feedback" without role and notes is accepted`;
      case 'feedback-flow': return `Request Feedback on ${lvl} – the level task is closed when feedback is requested and a NEW level task is created after the answer (it must stay open with its owner)`;
      case 'feedback-role-is-person': return `${lvl} – "Requested Role" lists people (names / e-mail) instead of job roles`;
      case 'previous-decisions-missing': return `${lvl} – the respond panel does not show the decisions and notes of the earlier levels (read-only approval trail missing)`;
      default: break;
    }
  }
  return en(fallback);
}

// ---------------------------------------------------------------- steps
function steps(key, { licence, request }) {
  const RCM = 'Super user / MIM_SuperUser (Rehabilitation & Closure Manager and all other non-specialist roles)';
  const TS = 'InternalExplotration – "Explotration Demo" (Technical Specialist)';
  const REQ = 'Employee portal → Request Management → tab "Follow-up on Expired Licenses"';
  const TASKS = 'Employee portal → Task Management → tab "Follow-up on Expired Licenses"';
  const F = (what) => `Open "Filter" → ${what} → "Search".`;
  const RESPOND = (step) => [`${TASKS}.`, F(`Request No. = ${request}`), 'Row menu (⋮) → "Assign to" → "Me" → "Save" (if unassigned) → "Respond to Request".', `Open the "Respond to Request" tab (current step: ${step}).`];
  const VIEW = [`${REQ}.`, F(`Request No. = ${request}`), 'Row menu (⋮) → "View" (opens the request details in a new tab).'];
  const REVIEW = 'Expired License Review', CHECK = 'Site Eligibility – Check for R&C Request', EMAIL = 'Site Eligibility – Send Reminder Email', VISIT = 'Site Eligibility – Field Visit and Finding';
  const LIST = (field) => [`${REQ}.`, F(`Licence No. = ${licence}`), `Read "${field}" in the result row.`];
  const S = {
    'licence-not-expired': [RCM, 'Follow-up request created by the scheduled job.', [...LIST('Licence Expiry Date'), 'Compare it with today.']],
    'remaining-period-wrong': [RCM, 'Follow-up request created by the scheduled job.', [...LIST('Remaining Regulatory Period'), 'Compute 180 − days elapsed since the expiry date (expiry day not counted) and compare.']],
    'exceeded-english': [RCM, '—', LIST('Regulatory Period Exceeded?')],
    'licence-type-service-name': [RCM, '—', LIST('Licence Type')],
    'remaining-no-days-unit': [RCM, '—', LIST('Remaining Regulatory Period')],
    'status-filter-values': [RCM, '—', [`${REQ}.`, 'Open "Filter".', 'Open the "Request Status" dropdown and read its values.']],
    'licence-type-filter-values': [RCM, '—', [`${REQ}.`, 'Open "Filter".', 'Open the "Licence Type" dropdown and read its values.']],
    'export-file-name-requests': [RCM, '—', [`${REQ}.`, 'Click "Export".', 'Read the name of the downloaded file.']],
    'export-file-name-tasks': [RCM, '—', [`${TASKS}.`, 'Click "Export".', 'Read the name of the downloaded file.']],
    'search-no-results-message': [RCM, '—', [`${REQ}.`, F('Licence No. = 99999999999'), 'Look for the empty-result message.']],
    'reset-keeps-filters': [RCM, '—', [`${REQ}.`, F(`Request No. = ${request}, Licence No. = ${licence}`), 'Click "Reset".', 'Open "Filter" and read the filter fields.']],
    'details-title': [RCM, '—', [...VIEW, 'Read the page title.']],
    'company-national-id': [RCM, '—', [...VIEW, 'Open the "Company Profile" tab and look for National ID / Iqama No.']],
    'details-process-type': [RCM, '—', [...VIEW, 'Open the "Request Details" tab and look for "Process Type".']],
    'expiry-mismatch': [RCM, '—', [`${REQ}: note the "Licence Expiry Date" of the row.`, ...VIEW.slice(1), 'Open the "Request Details" tab and compare "Licence Expiry Date".']],
    'linked-tasks-no-upcoming': [RCM, '—', [...VIEW, 'Open the "Linked Tasks" tab and look for the upcoming (not started) steps.']],
    'linked-task-assignee': [RCM, '—', [...VIEW, 'Open the "Linked Tasks" tab and read "Assigned to" on each card.']],
    'linked-task-status-texts': [RCM, '—', [...VIEW, 'Open the "Linked Tasks" tab and read the status of each card.']],
    'history-date-format': [RCM, '—', [...VIEW, 'Open the "Request History" tab and read "Request submission date".']],
    'task-columns-order': [RCM, '—', [`${TASKS}.`, 'Read the column headers.']],
    'assign-choices': [RCM, 'Task unassigned.', [`${TASKS}.`, F(`Request No. = ${request}`), 'Open the row menu (⋮).']],
    'unassign-offered': [RCM, '—', [`${TASKS}.`, F(`Request No. = ${request}`), 'Row menu (⋮) → "Assign to".', 'Open the row menu (⋮) again.']],
    'respond-tab-typo': [RCM, '—', [...RESPOND(REVIEW).slice(0, 3), 'Read the label of the respond tab.']],
    'specialist-empty-brackets': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Open "Select Specialist" and read the options.']],
    'no-success-message-review': [RCM, `Request at "${REVIEW}".`, [...RESPOND(REVIEW), 'Select "Explotration Demo" → "Send".', 'Watch for a confirmation message.']],
    'close-notes-label': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Read the label of the notes field under "Do you want to close the request?".']],
    'close-option1-no-certificate': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Select "The investor submitted a Rehabilitation & Closure request".', 'Look for the optional certificate upload.']],
    'close-unknown-rc-silent': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Select "The investor submitted a Rehabilitation & Closure request".', 'Enter R&C request number 99999999 (does not exist).', 'Click "Terminate Request".']],
    'close-no-certificate-confirm': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Select "Closure certificate issued"; attach no file.', 'Click "Terminate Request".']],
    'close-empty-number-message': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Select "The investor submitted a Rehabilitation & Closure request"; leave the number empty.', 'Click "Terminate Request".']],
    'check-not-logged': [TS, `Request at "${CHECK}".`, [...RESPOND(CHECK), 'Click "Check".', 'Open the "Request History" tab → "Responses".']],
    'followup-old-task-name': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the "Regulatory Follow-up" section.']],
    'reminder-status-text': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the reminder status fields.']],
    'visit-date-label': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the label of the visit date field.']],
    'facility-typo': [TS, `Request at "${VISIT}".`, [...RESPOND(VISIT), 'Read the label of the facility name.']],
    'visit-escalates-immediately': [TS, `Request at "${VISIT}"; the licence is far from day 181.`, [...RESPOND(VISIT), 'Pick today in the calendar, upload an observation, select finding "Eligible", fill the description → "Send".', `${REQ} → row menu (⋮) → "View" → tabs "Request Details" and "Linked Tasks".`]],
    'visit-date-not-persisted': [TS, "Visit saved with a date, then returned from the RCM's Decision.", [...RESPOND(VISIT), 'Read the visit date (finding and description are still filled).']],
    'decision-assigned-to-specialist': [RCM, "Visit saved (the RCM's Decision task was created).", [...VIEW, 'Open the "Linked Tasks" tab and read "Assigned to" of the RCM\'s Decision.']],
    'feedback-role-is-person': [RCM, 'Any level with "Request Feedback".', [...RESPOND('Guarantee Liquidation Decision Review – Level 1'), 'Decision = "Request Feedback".', 'Open "Requested Role" and read the options.']],
    'final-status': [RCM, 'All levels approved; final approval "Approve".', [`${REQ}.`, F(`Request No. = ${request}`), 'Read "Request Status".']],
    'final-status-rejected': [RCM, 'Final approval answered with "Reject" + notes.', [`${REQ}.`, F(`Request No. = ${request}`), 'Read "Request Status".']],
    'final-approval-reject-no-notes': [RCM, 'Request at "Final Guarantee Liquidation Approval".', [...RESPOND('Final Guarantee Liquidation Approval'), 'Decision = "Reject"; leave the notes empty → "Send".']],
    'reminder-schedule-days': [RCM, 'Request at the Field Visit step or at any decision level.', [...RESPOND("Rehabilitation & Closure Manager's Decision"), 'Read the "Regulatory Follow-up" section: first reminder, second reminder and final review days.']],
  };
  if (S[key]) return S[key];
  if (/^history-/.test(key)) return [RCM, 'Workflow run to the end.', [...VIEW, 'Open the "Request History" tab → "Responses".', 'Check every response entry (task, decision, employee, date/time, notes and comments) against the Linked Tasks.']];
  if (/^data-/.test(key)) return [RCM, '—', [`${REQ}: ${F(`Request No. = ${request}`)} Note the row.`, `${TASKS}: same request → note the row.`, ...VIEW.slice(1), 'Compare the field on "Request Details" / "Company Profile" / "Request History" with both lists.']];
  if (/^taskname-/.test(key)) return [RCM, 'Request at (or past) the task.', ['Open the place named in the title (respond page / Task Management list / Linked Tasks / Request History).', 'Read the task name and compare it with the user stories and change log (#10, #11).']];
  if (/^role-/.test(key)) return [RCM, 'Request at the task.', ['Log in with the account that holds the role of the task.', `${TASKS} → ${F(`Request No. = ${request}`)}`, 'Check whether the row menu offers "Assign to" / "Respond to Request".']];
  const m = key.match(/^(rcm-decision|sgm|cco|level1|level2|level3|final-approval|visit|feedback)-(.+)$/);
  if (m) {
    const task = { 'rcm-decision': "Rehabilitation & Closure Manager's Decision", sgm: 'Sustainability General Manager Review', cco: 'Chief Compliance Officer Review', level1: 'Guarantee Liquidation Decision Review – Level 1',
      level2: 'Guarantee Liquidation Decision Review – Level 2', level3: 'Guarantee Liquidation Decision Review – Level 3', 'final-approval': 'Final Guarantee Liquidation Approval', visit: VISIT, feedback: 'Feedback Request' }[m[1]];
    const user = m[1] === 'visit' ? TS : RCM;
    const NEXT = { visit: "the RCM's Decision", 'rcm-decision': 'the SGM Review', sgm: 'the CCO Review', cco: 'Level 1', level1: 'Level 2', level2: 'Level 3' }[m[1]] ?? 'the next level';
    const R = RESPOND(task);
    const s = {
      'no-decision-accepted': [...R, 'Do not choose a decision → "Send".'],
      'return-no-notes': [...R, 'Decision = "Return to Previous Employee".', 'Leave "Decision Notes" empty → "Send".'],
      'return-not-routed': [...R, 'Decision = "Return to Previous Employee" + notes → "Send".', `${REQ} → row menu (⋮) → "View" → "Linked Tasks".`],
      'return-notes-not-visible': [`On ${NEXT}: Decision = "Return to Previous Employee" + notes → "Send" (the request goes back to "${task}").`, ...R, 'Look for the return notes on the respond panel.'],
      'feedback-no-role-notes': [...R, 'Decision = "Request Feedback"; leave the role and the notes empty → "Send".'],
      'feedback-flow': [...R, 'Decision = "Request Feedback", choose a "Requested Role", write notes → "Send".', `${REQ} → row menu (⋮) → "View" → "Linked Tasks": check the level task and the Feedback Request task.`],
      'feedback-role-is-person': [...R, 'Decision = "Request Feedback".', 'Open "Requested Role" and read the options.'],
      'previous-decisions-missing': [`Approve the earlier levels with decision notes (RCM's Decision → … → the level before "${task}").`, ...R, 'Look for the earlier decisions and their notes on the respond panel.'],
    }[m[2]];
    if (s) return [user, `Request at "${task}".`, s];
  }
  return undefined;
}

module.exports = { tr, en, bugTitle, steps };
