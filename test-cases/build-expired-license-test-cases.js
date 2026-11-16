// Builds the "Follow-up on Expired License" test-case workbook (UC-001, UC-002).
// Usage: node build.js <output.xlsx>
const ExcelJS = require('exceljs');
const out = process.argv[2];
const EXEC_DATE = '2026-11-15';
const EV = 'test-results-probe/expired-search/';

// ---------------------------------------------------------------- UC-001
const UC1_PRE_JOB = 'You prepared the licence (see Test data) and ran the scheduled job manually.';
const uc1 = [
  // Happy path — creation
  ['Creation', 'Expired Mining licence without renewal creates a follow-up request', UC1_PRE_JOB,
    '1. Run the scheduled job.\n2. Employee → الطلبات → tab "متابعة رخص منتهية" → filter رقم الرخصة = licence.\n3. Employee → إدارة المهام → tab "متابعة رخص منتهية" → find the licence.',
    'Mining licence (إصدار رخصة تعدين), end date = previous working day, not renewed, no Rehabilitation & Closure (R&C) request',
    'Exactly ONE follow-up request exists for the licence. حالة الطلب = "قيد التنفيذ". In Task Management a row exists with نوع العملية = "مراجعة الرخصة المنتهية".',
    'Main path 1, 5, 9, 10', 'High', 'Positive', 'Auto (after timer)'],
  ['Creation', 'Expired Small Mine licence without renewal creates a follow-up request', UC1_PRE_JOB,
    'Same as TC-001-01.', 'Small Mine licence, end date = previous working day, not renewed, no R&C request',
    'Same as TC-001-01; نوع الرخصة shows the Small Mine type.', 'Main path 1', 'High', 'Positive', 'Auto (after timer)'],
  ['Creation', 'Expired Building Materials Quarry licence without renewal creates a follow-up request', UC1_PRE_JOB,
    'Same as TC-001-01.', 'BMQ licence (محجر مواد بناء), end date = previous working day, not renewed, no R&C request',
    'Same as TC-001-01; نوع الرخصة shows the Quarry type.', 'Main path 1', 'High', 'Positive', 'Auto (after timer)'],
  ['Creation', 'Follow-up request data matches the licence', 'TC-001-01 passed.',
    '1. Open the follow-up row in Request Management.\n2. Compare every column with the licence record.',
    'Licence from TC-001-01',
    'رقم الرخصة, نوع الرخصة, فئة الرخصة, تاريخ انتهاء الرخصة and اسم الشركة equal the licence data. تاريخ إنشاء الطلب = job run date. Request number is new and unique.',
    'Main path 2, 5', 'High', 'Positive', 'Auto (after timer)'],
  ['Creation', 'Remaining regulatory period starts correctly (day 1 = day after expiry)', 'TC-001-01 passed.',
    '1. Read "المهلة النظامية المتبقية" on the new request.',
    'Licence expired yesterday (or N days ago)',
    'Remaining = 180 − days elapsed since the expiry date (expiry yesterday → 179). تجاوز المهلة النظامية؟ = لا.',
    'BR-002; UC-002 BR-003', 'High', 'Boundary', 'Auto (after timer)'],
  ['Task', 'Expired License Review task is assigned to the Rehabilitation & Closure Manager', 'TC-001-01 passed.',
    '1. Task Management → tab "متابعة رخص منتهية" → open the task row / View.\n2. Check the assignee / assigned group.',
    'Licence from TC-001-01',
    'Task type = "مراجعة الرخصة المنتهية", assigned to the Rehabilitation & Closure Manager role (not to an individual reviewer or unassigned).',
    'Main path 9', 'High', 'Positive', 'Manual'],
  ['Task', 'Request creation is logged in Request History', 'TC-001-01 passed.',
    '1. Request Management → follow-up row → View (عرض) → history.',
    'Licence from TC-001-01',
    'History shows a creation entry by the system with the job date/time.',
    'Post-condition 4', 'Medium', 'Positive', 'Manual'],
  ['Task', 'Status "In Progress" is shown without the current stage', 'TC-001-01 passed.',
    '1. Read حالة الطلب in Request Management.', 'Licence from TC-001-01',
    'Status text is exactly "قيد التنفيذ" (no task/stage name appended).', 'Main path 10; UC-002 status table', 'Low', 'Positive', 'Auto (after timer)'],
  // R&C branch
  ['R&C check', 'Eligible R&C request (In Progress) → request completed, no task', UC1_PRE_JOB,
    '1. Run the job.\n2. Check the follow-up request in Request Management.\n3. Check Task Management.',
    'Expired licence that has an R&C request with status قيد التنفيذ, same licence number + start/end dates',
    'Follow-up request created with status "مكتمل – لا يتطلب إجراء". NO Expired License Review task in Task Management. عدد أيام اكتمال الطلب = 0. المهلة النظامية المتبقية = 0. تجاوز المهلة = لا.',
    'Main path 6–8; UC-002 BR-001..003', 'High', 'Positive', 'Auto (after timer)'],
  ['R&C check', 'Eligible R&C request in another non-rejected status (e.g. مرسل / مكتمل) → no task', UC1_PRE_JOB,
    'Same as TC-001-09.', 'Expired licence with an R&C request in status مرسل or مكتمل',
    'Same as TC-001-09 (any status other than Rejected/Withdrawn is eligible).', 'Main path 7', 'Medium', 'Positive', 'Auto (after timer)'],
  ['R&C check', 'Rejected R&C request is ignored → task created', UC1_PRE_JOB,
    'Same as TC-001-01.', 'Expired licence whose only R&C request is Rejected (مرفوض)',
    'Follow-up request "قيد التنفيذ" + Expired License Review task created.', 'Main path 7, 9', 'High', 'Negative', 'Auto (after timer)'],
  ['R&C check', 'Withdrawn R&C request is ignored → task created', UC1_PRE_JOB,
    'Same as TC-001-01.', 'Expired licence whose only R&C request is Withdrawn (مسحوب)',
    'Follow-up request "قيد التنفيذ" + Expired License Review task created.', 'Main path 7, 9', 'High', 'Negative', 'Auto (after timer)'],
  ['R&C check', 'R&C request for a previous licence term (different start/end dates) is ignored', UC1_PRE_JOB,
    'Same as TC-001-01.', 'Expired licence whose R&C request belongs to an older term of the same licence number',
    'Follow-up request "قيد التنفيذ" + task created (R&C must match number AND start/end dates).', 'Main path 7', 'High', 'Negative', 'Auto (after timer)'],
  ['R&C check', 'Several R&C requests: the most recent non-rejected one is used', UC1_PRE_JOB,
    'Same as TC-001-09.', 'Expired licence with an older In-Progress R&C request and a newer Rejected one',
    'Per spec: eligible request found → "مكتمل – لا يتطلب إجراء", no task. (See Open Question Q2.)', 'Main path 7', 'Medium', 'Boundary', 'Manual'],
  ['R&C check', 'Draft / Cancelled R&C request handling', UC1_PRE_JOB,
    'Same as TC-001-09.', 'Expired licence whose only R&C request is Draft (مسودة) or Cancelled (ملغي)',
    'Per literal spec Draft/Cancelled are "not rejected or withdrawn" → eligible → no task. Confirm business intent (Open Question Q1).', 'Main path 7', 'Medium', 'Boundary', 'Manual'],
  // Duplicates
  ['Duplicates', 'Running the job again does not create a duplicate request', 'TC-001-01 passed (request exists, In Progress).',
    '1. Run the job a second time.\n2. Filter Request Management by the licence.\n3. Check Task Management.',
    'Licence from TC-001-01',
    'Still exactly ONE follow-up request and ONE task for the licence/start/end combination.', 'Main path 3, 4, 11', 'High', 'Negative', 'Auto (after timer)'],
  ['Duplicates', 'Completed follow-up request also blocks a new one', UC1_PRE_JOB,
    '1. Run the job.', 'Expired licence that already has a follow-up request in a Completed status (e.g. from TC-001-09)',
    'No new request is created (pre-condition: "in any status").', 'Pre-condition 2; Main path 4', 'High', 'Negative', 'Auto (after timer)'],
  ['Duplicates', 'Migrated (UC-00) follow-up request blocks a new one', UC1_PRE_JOB,
    '1. Run the job.', 'Licence that has a migrated request "مكتمل – بيانات تاريخية مُرحّلة"',
    'No new request is created.', 'Pre-condition 2', 'Medium', 'Negative', 'Manual'],
  ['Duplicates', 'Same licence number with a new term creates a new request', UC1_PRE_JOB,
    '1. Run the job.', 'Licence number that already had a follow-up for an older term, and the new term (new start/end) has now expired',
    'A NEW follow-up request is created for the new start/end combination.', 'Main path 2, 11', 'Medium', 'Positive', 'Manual'],
  ['Duplicates', 'Several licences expiring the same day → one request each', UC1_PRE_JOB,
    '1. Run the job.', '2–3 qualifying licences with the same end date',
    'One request per licence, each with its own correct data; no mixing of licence data between rows.', 'Main path 1–5', 'Medium', 'Positive', 'Auto (after timer)'],
  // Eligibility — negative
  ['Eligibility', 'Renewed licence is not picked', UC1_PRE_JOB,
    '1. Run the job.', 'Mining licence that expired yesterday but was renewed (renewal completed)',
    'No follow-up request is created.', 'BR-001', 'High', 'Negative', 'Auto (after timer)'],
  ['Eligibility', 'Licence not yet expired is not picked (expiry = today)', UC1_PRE_JOB,
    '1. Run the job.', 'Licence whose end date is today (or in the future)',
    'No follow-up request is created (day of expiry itself is not counted).', 'BR-001, BR-002', 'High', 'Boundary', 'Auto (after timer)'],
  ['Eligibility', 'Out-of-scope licence types are not picked', UC1_PRE_JOB,
    '1. Run the job.', 'Expired Exploration licence (رخصة كشف) and expired Public-Projects building-materials licence',
    'No follow-up request is created for these types.', 'Main path 1', 'High', 'Negative', 'Auto (after timer)'],
  ['Eligibility', 'Licence with no expiry date is not picked', UC1_PRE_JOB,
    '1. Run the job.', 'Licence of an in-scope type with an empty end date',
    'No follow-up request is created and the job does not fail. (Request 77252 on TEST has an empty expiry date — see DEF-005.)', 'BR-001', 'High', 'Negative', 'Manual'],
  ['Eligibility', 'Licence with a renewal request still in progress at expiry', UC1_PRE_JOB,
    '1. Run the job.', 'Expired licence with a pending renewal request',
    'Behaviour to be confirmed (Open Question Q3).', 'BR-001', 'Medium', 'Boundary', 'Manual'],
  // Schedule
  ['Schedule', 'Sunday run picks licences that expired Thursday, Friday and Saturday', UC1_PRE_JOB,
    '1. Run the job as the Sunday run.', 'Three licences with end dates Thursday, Friday, Saturday',
    'All three get a follow-up request in the same run.', 'Scheduled job — Weekends', 'High', 'Boundary', 'Manual'],
  ['Schedule', 'Licence older than the lookback window is not picked', UC1_PRE_JOB,
    '1. Run the job.', 'Licence that expired e.g. 10 days ago with no follow-up request',
    'Per configured lookback (previous working day) no request is created. Confirm handling of missed runs (Open Question Q6).', 'Scheduled job — Purpose', 'Medium', 'Boundary', 'Manual'],
  ['Schedule', 'No qualifying licences → job ends without action', 'No licence meets the conditions for the run date.',
    '1. Run the job.\n2. Compare the request count before/after.', 'Run date with no expiries',
    'No requests or tasks created; no error logged.', 'ALT-001', 'Medium', 'Negative', 'Manual'],
  ['Schedule', 'Job parameters are configurable', 'Admin access to system configuration.',
    '1. Open the configuration settings.\n2. Check frequency, time, lookback, working days, licence types, eligibility.', '—',
    'All listed parameters are configurable without a deployment.', 'Scheduled job — Configuration', 'Low', 'Positive', 'Manual'],
];

// ---------------------------------------------------------------- UC-002
// [area, title, pre, steps, data, expected, ref, priority, type, exec, status, actual, defect, evidence]
const PRE2 = 'Employee logged in (employee1); follow-up requests exist.';
const NAV = 'Employee home → tile "الطلبات" → tab "متابعة رخص منتهية"';
const uc2 = [
  ['Navigation', 'Open the Follow-up on Expired Licenses list', PRE2,
    `1. ${NAV}.`, '—', 'The list opens with the filter panel and the results table.',
    'Main path 1–2', 'High', 'Positive', 'Auto', 'Pass',
    'Reached via home tile "الطلبات" (/Licenses/RequestsManagement) → tab "متابعة رخص منتهية". 23 requests listed.', '', EV + '1-filter-open.png'],
  ['Navigation', 'User without Licenses permission cannot open the list', 'Employee without Licenses permission.',
    '1. Log in.\n2. Try to open Request Management / the tab.', 'Restricted employee account',
    'Tab / page not available.', 'Pre-condition 1', 'Medium', 'Negative', 'Manual', 'Not Run', '', '', ''],
  ['Filters', 'All 9 search fields are displayed with correct labels', PRE2,
    `1. ${NAV}.\n2. Click "تصفية(0)".`, '—',
    'رقم الرخصة, رقم الطلب, نوع الرخصة, حالة الطلب, تاريخ الإنشاء (من/إلى), تاريخ انتهاء الرخصة (من/إلى), تجاوز المهلة النظامية؟ — correctly spelled.',
    'Forms — Search fields 1–9', 'Medium', 'UI', 'Auto', 'Fail',
    'All 9 fields present. Spelling: label "رقم الرخصه"; placeholders "أختار نوع الرخصة", "أختار حاله الطلب".', 'DEF-013', EV + '1-filter-open.png'],
  ['Filters', 'License Type dropdown lists BMQ / Mining / Small Mining', PRE2,
    '1. Open the filter.\n2. Open "نوع الرخصة".', '—', 'Exactly three licence types: Building Materials Quarry, Mining, Small Mining.',
    'Search field 3', 'High', 'Positive', 'Auto', 'Fail',
    'Options: "إصدار رخصة محجر مواد بناء" / "إصدار رخصة تعدين" / "تحويل رخصة منجم صغير" (service names; Small Mine shown as a transfer service).', 'DEF-002', ''],
  ['Filters', 'Request Status dropdown lists the 6 follow-up statuses', PRE2,
    '1. Open the filter.\n2. Open "حالة الطلب".', '—',
    'قيد التنفيذ; مكتمل – لا يتطلب إجراء; مكتمل – تم تقديم طلب/ شهادة إعادة التأهيل والإغلاق; مكتمل – تمت الموافقة على تسييل الضمان المالي; مكتمل – تم رفض تسييل الضمان المالي; مكتمل – بيانات تاريخية مُرحّلة.',
    'Search field 4; Status table', 'High', 'Positive', 'Auto', 'Fail',
    'Generic request statuses: مسودة / مسحوب / مرسل / محذوف / تمت الموافقة / ملغي / قيد التنفيذ / بإنتظار إجراء المستثمر / مكتمل / بإنتظار الدفع.', 'DEF-001', ''],
  ['Filters', '"Regulatory Period Exceeded?" offers Yes / No', PRE2,
    '1. Open the filter.\n2. Open "تجاوز المهلة النظامية؟".', '—', 'Options نعم / لا (plus empty).', 'Search field 9', 'Low', 'Positive', 'Auto', 'Pass',
    'Options: أختار .... / نعم / لا.', '', ''],
  ['Filters', 'Creation Date (From) cannot be after today', PRE2, '1. Open the date picker of تاريخ الإنشاء (من).', 'Tomorrow',
    'Future dates are disabled.', 'Search field 5', 'Medium', 'Boundary', 'Auto', 'Pass', 'Picker maxDate = today.', '', ''],
  ['Filters', 'Creation Date (To) cannot be after today', PRE2, '1. Open the date picker of تاريخ الإنشاء (إلى).', 'Tomorrow',
    'Future dates are disabled.', 'Search field 6', 'Medium', 'Boundary', 'Auto', 'Pass', 'Picker maxDate = today.', '', ''],
  ['Filters', 'License Expiry Date (From) cannot be after today', PRE2, '1. Open the date picker of تاريخ انتهاء الرخصة (من).', 'Tomorrow',
    'Future dates are disabled.', 'Search field 7', 'Medium', 'Boundary', 'Auto', 'Pass', 'Picker maxDate = today.', '', ''],
  ['Filters', 'License Expiry Date (To) cannot be after today', PRE2, '1. Open the date picker of تاريخ انتهاء الرخصة (إلى).', 'Tomorrow / next year',
    'Future dates are disabled.', 'Search field 8', 'Medium', 'Boundary', 'Auto', 'Fail', 'No maxDate on this picker — future dates can be selected.', 'DEF-007', ''],
  ['Filters', 'Date "From" later than "To"', PRE2, '1. Set تاريخ الإنشاء (من) = today, (إلى) = last month.\n2. Search.', 'From > To',
    'A validation message, or no results — never an error page. (Open Question Q9.)', 'Search fields 5–8', 'Medium', 'Negative', 'Manual', 'Not Run', '', '', ''],
  ['Filters', 'Number fields accept digits only', PRE2, '1. Type letters, symbols, a negative number and 30 digits in رقم الطلب and رقم الرخصة.\n2. Search.', 'abc, -5, 30 digits',
    'Invalid input rejected or ignored; no error page.', 'Search fields 1–2', 'Low', 'Negative', 'Manual', 'Not Run', '', '', ''],
  ['Search', 'Search with no criteria returns all requests', PRE2, '1. Open the filter.\n2. Click "البحث" with nothing entered.', '—',
    'All requests listed, unfiltered.', 'ALT-001', 'High', 'Positive', 'Auto', 'Pass', '23 requests (2 pages), same as the unfiltered list and the export.', '', EV + 'a-empty.png'],
  ['Search', 'No matching results shows the platform message and an empty table', PRE2, '1. رقم الطلب = 999999999.\n2. Click "البحث".', '999999999',
    'Standard no-data message and empty table.', 'ALT-002', 'Medium', 'Negative', 'Auto', 'Pass', '"لا توجد نتائج لعرضها", 0 rows.', '', EV + 'b-no-match.png'],
  ['Search', 'Search by Request Number', PRE2, '1. رقم الطلب = existing request.\n2. Click "البحث".', '77248',
    'Only that request is listed.', 'Search field 2', 'High', 'Positive', 'Auto', 'Pass', '1 row: 77248.', '', EV + 'c-request-77248.png'],
  ['Search', 'Search by License Number', PRE2, '1. رقم الرخصة = licence with a follow-up.\n2. Click "البحث".', 'Licence you provide',
    'Only that licence\'s follow-up request(s) — one per term.', 'Search field 1', 'High', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Search by each License Type', PRE2, '1. Select each نوع الرخصة value.\n2. Click "البحث".', 'Each type',
    'Only requests of that type are listed.', 'Search field 3', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Search by status "قيد التنفيذ"', PRE2, '1. حالة الطلب = قيد التنفيذ.\n2. Click "البحث".', 'قيد التنفيذ',
    'Only In Progress requests listed.', 'Search field 4', 'High', 'Positive', 'Auto', 'Pass', 'Rows returned are all قيد التنفيذ (first page checked).', '', EV + 'd-status-in-progress.png'],
  ['Search', 'Search by status "مكتمل – لا يتطلب إجراء"', 'A request completed with No Action Required exists (TC-001-09).', '1. حالة الطلب = مكتمل – لا يتطلب إجراء.\n2. Click "البحث".', '—',
    'Only those requests listed.', 'Search field 4', 'High', 'Positive', 'Auto', 'Blocked', 'Status not available in the dropdown.', 'DEF-001', ''],
  ['Search', 'Search by Creation Date range', PRE2, '1. Set تاريخ الإنشاء من/إلى.\n2. Click "البحث".', 'A range including / excluding known requests',
    'Only requests created inside the range (bounds inclusive).', 'Search fields 5–6', 'Medium', 'Boundary', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Search by License Expiry Date range', PRE2, '1. Set تاريخ انتهاء الرخصة من/إلى.\n2. Click "البحث".', 'A range including / excluding known expiries',
    'Only requests whose licence expired inside the range (bounds inclusive).', 'Search fields 7–8', 'Medium', 'Boundary', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Search "تجاوز المهلة النظامية؟" = نعم', PRE2, '1. Select نعم.\n2. Click "البحث".', 'نعم',
    'Only In Progress requests with remaining period = 0.', 'Search field 9; BR-001', 'High', 'Positive', 'Auto', 'Fail',
    '1 row: 77252, licence 44, expiry "-" (empty), remaining = -46159 days.', 'DEF-005', EV + 'e-exceeded-yes.png'],
  ['Search', 'Search "تجاوز المهلة النظامية؟" = لا', PRE2, '1. Select لا.\n2. Click "البحث".', 'لا',
    'Completed requests + In Progress requests with remaining > 0.', 'Search field 9; BR-001', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Several criteria are combined with AND', PRE2, '1. Enter licence type + status + creation date range.\n2. Search.', 'Combination',
    'Only rows meeting all criteria.', 'Main path 3', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Reset clears all criteria', PRE2, '1. Enter criteria and search.\n2. Click "إعادة تهيئة".', '—',
    'All fields cleared, counter back to "تصفية(0)", full list shown.', '—', 'Low', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Search', 'Filter counter shows the number of active criteria', PRE2, '1. Enter one criterion and search.', '—',
    'Button reads "تصفية(1)".', '—', 'Low', 'UI', 'Auto', 'Pass', '"تصفية(1)" after one criterion.', '', ''],
  ['Results', 'Results table columns and order follow the data dictionary', PRE2, `1. ${NAV}.`, '—',
    'رقم الطلب, رقم الرخصة, نوع الرخصة, فئة الرخصة, تاريخ انتهاء الرخصة, اسم الشركة, تاريخ إنشاء الطلب, حالة الطلب, تجاوز المهلة النظامية؟, عدد أيام اكتمال الطلب, المهلة النظامية المتبقية, الإجراء. No "نوع الطلب" column.',
    'Display fields 10–22', 'High', 'UI', 'Auto', 'Pass', 'Columns and order match; no Request Type column.', '', EV + 'a-empty.png'],
  ['Results', 'One row per request', PRE2, `1. ${NAV}.\n2. Check request numbers for repeats.`, '—',
    'Each request number appears once.', 'Display fields', 'High', 'Negative', 'Auto', 'Fail',
    'Request 77247 (licence 141841) shown 4 times (2× "إصدار رخصة تعدين", 2× "تجديد رخصة تعدين"); also 4× in the export.', 'DEF-004', EV + 'a-empty.png'],
  ['Results', 'License Type column shows the licence type', PRE2, `1. ${NAV}.`, '—',
    'BMQ / Mining / Small Mining.', 'Display field 13', 'Medium', 'Positive', 'Auto', 'Fail', 'Shows service names: "إصدار رخصة تعدين", "تجديد رخصة تعدين", "إصدار رخصة محجر مواد بناء".', 'DEF-003', ''],
  ['Results', 'License Category shows A / B / C', PRE2, `1. ${NAV}.`, '—',
    'Category A / B / C (أ / ب / ج).', 'Display field 14', 'Low', 'Positive', 'Auto', 'Fail', 'Requests 77248, 77252 show "أخرى".', 'DEF-009', ''],
  ['Results', '"Regulatory Period Exceeded?" shows Yes/No in the UI language', PRE2, `1. ${NAV}.`, '—',
    'نعم / لا on the Arabic UI.', 'Display field 19', 'Low', 'UI', 'Auto', 'Fail', 'Shows "Yes" / "No" in English (Task Management shows "لا").', 'DEF-008', ''],
  ['Results', 'Remaining regulatory period = 180 − days since expiry', PRE2, '1. For In Progress rows compute 180 − (today − expiry date).', 'Rows 77248, 77249, 77313, 77317',
    'Displayed value equals the calculation.', 'BR-003', 'High', 'Positive', 'Auto', 'Pass',
    `On ${EXEC_DATE}: 77248 (exp 2026-09-30) 134 ✓; 77249 (exp 2026-09-03) 107 ✓; 77313 (exp 2026-07-18) 60 ✓; 77317 (exp 2026-08-31) 104 ✓.`, '', ''],
  ['Results', 'Remaining regulatory period stays between 0 and 180', PRE2, `1. ${NAV}.\n2. Check المهلة النظامية المتبقية on all rows.`, '—',
    '0 ≤ value ≤ 180; never negative.', 'BR-003', 'High', 'Boundary', 'Auto', 'Fail',
    '77252: -46159. 77247: 519 (expiry 2027-10-20). 77320 (Task Mgmt): 1553 (expiry 2030-08-19).', 'DEF-005, DEF-006', ''],
  ['Results', 'Remaining period / completion days shown as "XX days"', PRE2, `1. ${NAV}.`, '—',
    'Text such as "134 يوم".', 'Display fields 20–21', 'Low', 'UI', 'Auto', 'Fail', 'Bare numbers ("134", "0").', 'DEF-012', ''],
  ['Results', 'Completed request: remaining frozen at 0, completion days counted', 'A request completed by UC-005/006/007/016 exists.', '1. Find the completed request.\n2. Wait a day and recheck.', '—',
    'المهلة النظامية المتبقية = 0 and does not change; عدد أيام اكتمال الطلب = creation → completion days; تجاوز = لا.', 'BR-001..003', 'Medium', 'Positive', 'Manual', 'Not Run', '', '', ''],
  ['Results', '"Completed – No Action Required" shows 0 completion days', 'TC-001-09 passed.', '1. Find the request from TC-001-09.', '—',
    'عدد أيام اكتمال الطلب = 0; تجاوز = لا.', 'BR-002', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Results', 'Exceeded = Yes when remaining reaches 0 while In Progress', 'In Progress request whose licence expired more than 180 days ago.', `1. ${NAV}.`, 'Old expired licence',
    'تجاوز المهلة = نعم and remaining = 0.', 'BR-001', 'High', 'Boundary', 'Manual', 'Not Run', '', '', ''],
  ['Results', 'Migrated requests appear with the historical status', 'UC-00 migration done.', `1. ${NAV}.\n2. Filter by a migrated request.`, 'Migrated request',
    'Status "مكتمل – بيانات تاريخية مُرحّلة".', 'Status table 6; Linked UC-00', 'Low', 'Positive', 'Manual', 'Not Run', '', '', ''],
  ['Results', 'Pagination texts are in Arabic', PRE2, `1. ${NAV}.\n2. Read the pager.`, '—', 'Arabic pager text.', '—', 'Low', 'UI', 'Auto', 'Fail', 'Pager reads "1 to 20 of 23 items".', 'DEF-014', ''],
  ['Results', 'View action opens request details, tasks and history', PRE2, '1. Row menu (⋮) → عرض.', 'Any row',
    'Details page with request data, tasks and action history (UC-002.1).', 'Display field 22', 'High', 'Positive', 'Manual', 'Not Run', '', '', ''],
  ['Export', 'Export produces Excel with the table columns in order', PRE2, '1. Click "تصدير".', '—',
    'Excel file with the same columns and order as the table (Action excluded).', 'ALT-003', 'High', 'Positive', 'Auto', 'Pass', '11 columns in table order.', '', ''],
  ['Export', 'Export file name is "Expired Licenses Monitoring"', PRE2, '1. Click "تصدير".', '—',
    'File name "Expired Licenses Monitoring.xlsx".', 'ALT-003', 'Low', 'Positive', 'Auto', 'Fail', 'File name "متابعة الرخصة المنتهية.xlsx".', 'DEF-010', ''],
  ['Export', 'Export includes all pages', PRE2, '1. With >20 results click "تصدير".', '—',
    'All rows exported, not only the visible page.', 'ALT-003', 'Medium', 'Positive', 'Auto', 'Pass', '23 rows exported while the table had 2 pages.', '', ''],
  ['Export', 'Export respects the active filters', PRE2, '1. Filter by a request number.\n2. Click "تصدير".', '77248',
    'Only the filtered rows are exported.', 'ALT-003', 'Medium', 'Positive', 'Auto', 'Not Run', '', '', ''],
  ['Export', 'Exported values are readable (Yes/No, numbers, dates)', PRE2, '1. Click "تصدير".\n2. Open the file.', '—',
    'Exceeded as نعم/لا (as in the table); dates yyyy-mm-dd; day counts numeric.', 'ALT-003', 'Low', 'UI', 'Auto', 'Fail',
    'Exceeded exported as Boolean TRUE/FALSE; remaining period stored as text; dates OK.', 'DEF-011', ''],
];

// ---------------------------------------------------------------- Defects
// [id, uc, title, steps, expected, actual, severity, priority, evidence, note]
const defects = [
  ['DEF-001', 'UC-002', 'Request Status filter lists generic request statuses instead of the follow-up statuses',
    `1. ${NAV}.\n2. تصفية → حالة الطلب.`, 'The 6 statuses of the UC-002 Status Table (قيد التنفيذ, مكتمل – لا يتطلب إجراء, …).',
    'مسودة / مسحوب / مرسل / محذوف / تمت الموافقة / ملغي / قيد التنفيذ / بإنتظار إجراء المستثمر / مكتمل / بإنتظار الدفع. The "مكتمل – …" statuses cannot be searched.',
    'High', 'P1', '', ''],
  ['DEF-002', 'UC-002', 'License Type filter shows service names; Small Mine appears as a transfer service',
    `1. ${NAV}.\n2. تصفية → نوع الرخصة.`, 'BMQ / Mining / Small Mining.',
    '"إصدار رخصة محجر مواد بناء" / "إصدار رخصة تعدين" / "تحويل رخصة منجم صغير".', 'Medium', 'P2', '', ''],
  ['DEF-003', 'UC-002', 'نوع الرخصة column shows the service (إصدار / تجديد) instead of the licence type',
    `1. ${NAV}.`, 'BMQ / Mining / Small Mining.', '"إصدار رخصة تعدين", "تجديد رخصة تعدين", "إصدار رخصة محجر مواد بناء".', 'Medium', 'P2', EV + 'a-empty.png', ''],
  ['DEF-004', 'UC-002', 'Same request listed several times in results and export',
    `1. ${NAV}.\n2. Look at request 77247.`, 'One row per request.',
    '77247 (licence 141841) shown 4 times — 2× إصدار رخصة تعدين, 2× تجديد رخصة تعدين. Same 4 rows in the export. Looks like a join on licence history/services.',
    'High', 'P1', EV + 'a-empty.png', 'Licence 141841 also has a renewal (تجديد) — see DEF-006.'],
  ['DEF-005', 'UC-001 / UC-002', 'Follow-up request with empty expiry date shows negative remaining period (-46159) and Exceeded = Yes',
    `1. ${NAV}.\n2. تصفية → تجاوز المهلة النظامية؟ = نعم → البحث.`, 'No follow-up for a licence without an expiry date; remaining always 0–180.',
    'Request 77252, licence 44: تاريخ انتهاء الرخصة "-", المهلة النظامية المتبقية = -46159, تجاوز = Yes.',
    'High', 'P1', EV + 'e-exceeded-yes.png', 'Licence 44 also has request 77317 (expiry 2026-08-31) in Task Management — 2 follow-ups for one licence number; confirm whether start/end differ.'],
  ['DEF-006', 'UC-001 / UC-002', 'Follow-up requests exist for licences that have not expired yet (remaining > 180)',
    `1. ${NAV}.\n2. Task Management → tab "متابعة رخص منتهية".`, 'Follow-ups only for genuinely expired, unrenewed licences (UC-001 BR-001); remaining ≤ 180.',
    '77247 licence 141841 expiry 2027-10-20, remaining 519 (licence has a renewal). 77320 licence 20260710137 expiry 2030-08-19, remaining 1553.',
    'High', 'P2', '', 'To confirm: may be data seeded manually on TEST. If created by the job → BR-001 broken.'],
  ['DEF-007', 'UC-002', 'License Expiry Date (To) picker allows future dates',
    `1. ${NAV}.\n2. تصفية → تاريخ انتهاء الرخصة (إلى).`, 'Dates after today disabled (≤ current search date).', 'No max date — any future date selectable. The other 3 date pickers are limited to today.', 'Medium', 'P3', '', ''],
  ['DEF-008', 'UC-002', '"تجاوز المهلة النظامية؟" displays English Yes/No on the Arabic UI',
    `1. ${NAV}.`, 'نعم / لا.', '"Yes" / "No". (Task Management tab shows "لا".)', 'Low', 'P3', '', ''],
  ['DEF-009', 'UC-002', 'License Category shows "أخرى"', `1. ${NAV}.`, 'A / B / C only.', '77248 and 77252 show "أخرى".', 'Low', 'P3', '', 'To confirm: could be licence data.'],
  ['DEF-010', 'UC-002', 'Export file name differs from spec', `1. ${NAV}.\n2. تصدير.`, '"Expired Licenses Monitoring".', '"متابعة الرخصة المنتهية.xlsx".', 'Low', 'P4', '', 'Confirm whether an Arabic name is accepted.'],
  ['DEF-011', 'UC-002', 'Export: Exceeded column is Boolean TRUE/FALSE; remaining period stored as text',
    `1. ${NAV}.\n2. تصدير → open file.`, 'Same values as on screen (نعم/لا); day counts numeric.', 'Exceeded = TRUE/FALSE cells; المهلة النظامية المتبقية = text cells.', 'Low', 'P4', '', ''],
  ['DEF-012', 'UC-002', 'Remaining period / completion days shown as bare numbers', `1. ${NAV}.`, '"XX days" (e.g. "134 يوم").', '"134", "0".', 'Low', 'P4', '', ''],
  ['DEF-013', 'UC-002', 'Spelling in filter panel', `1. ${NAV}.\n2. تصفية.`, '"رقم الرخصة", "اختر نوع الرخصة", "اختر حالة الطلب".', 'Label "رقم الرخصه"; placeholders "أختار نوع الرخصة", "أختار حاله الطلب".', 'Low', 'P4', EV + '1-filter-open.png', ''],
  ['DEF-014', 'UC-002', 'Pagination text in English', `1. ${NAV}.`, 'Arabic pager text.', '"1 to 20 of 23 items".', 'Low', 'P4', '', ''],
];

// ---------------------------------------------------------------- Questions
const questions = [
  ['Q1', 'UC-001 step 7', 'Should Draft (مسودة) or Cancelled (ملغي) R&C requests count as "eligible"? Literally they are not Rejected/Withdrawn.'],
  ['Q2', 'UC-001 step 7', 'If the most recent R&C request is Rejected but an older one is In Progress — is the older one used (eligible) or does "most recent" mean the rejected one (not eligible)?'],
  ['Q3', 'UC-001 BR-001', 'Licence with a renewal request still in progress on the expiry date — create a follow-up or not?'],
  ['Q4', 'UC-001', 'Licences terminated (إنهاء) or cancelled before their end date — in scope?'],
  ['Q5', 'UC-002 BR-002', 'What should "عدد أيام اكتمال الطلب" show while In Progress? (Currently 0.)'],
  ['Q6', 'UC-001 schedule', 'If the job does not run on a working day (outage), are those expiries picked up by the next run?'],
  ['Q7', 'UC-001 schedule', 'Are public holidays excluded from the working-day calculation, or only Friday/Saturday?'],
  ['Q8', 'UC-002 ALT-003', 'Is an Arabic export file name acceptable instead of "Expired Licenses Monitoring"?'],
  ['Q9', 'UC-002', 'Expected behaviour when a date "From" is later than "To".'],
  ['Q10', 'UC-001 step 9', 'Where is the task assignee (Rehabilitation & Closure Manager) visible? The Task Management tab has no assignee/status column. Which test account has this role?'],
];

// ---------------------------------------------------------------- Build
const wb = new ExcelJS.Workbook();
wb.creator = 'QA'; wb.created = new Date();
wb.calcProperties.fullCalcOnLoad = true;
const FONT = { name: 'Arial', size: 10 };
const HEAD = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const BORDER = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
const STATUS_COLORS = { Pass: 'FFC6EFCE', Fail: 'FFFFC7CE', Blocked: 'FFFFEB9C', 'Not Run': 'FFEDEDED' };
const SEV_COLORS = { High: 'FFFFC7CE', Medium: 'FFFFEB9C', Low: 'FFDDEBF7' };

function sheet(name, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: opts.xSplit ?? 0 }] });
  ws.columns = columns.map(([header, width]) => ({ header, width }));
  ws.getRow(1).eachCell((c) => { c.font = HEAD; c.fill = HEAD_FILL; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = BORDER; });
  ws.getRow(1).height = 30;
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell({ includeEmpty: true }, (c) => { c.font = FONT; c.alignment = { vertical: 'top', wrapText: true }; c.border = BORDER; });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const TC_COLS = [['TC ID', 12], ['User Story', 9], ['Area', 12], ['Title', 38], ['Pre-conditions', 28], ['Test Steps', 42], ['Test Data', 30],
  ['Expected Result', 48], ['Spec Reference', 18], ['Priority', 9], ['Type', 11], ['Execution', 14], ['Status', 10], ['Actual Result', 44],
  ['Defect ID', 12], ['Executed On', 12], ['Evidence', 30]];
const STATUS_COL = 13;

const more = require('./expired-license-cases-more.js');
const res = require('./expired-license-results.js');
const fs = require('fs');
const path = require('path');
const BUG_DIR = path.join(__dirname, 'bugs');
const bugShot = (id) => (fs.existsSync(path.join(BUG_DIR, `${id}.png`)) ? `bugs/${id}.png` : '');

function tcSheet(name, uc, data) {
  const ucLabel = uc === 'E2E' ? 'E2E' : `UC-${uc}`;
  const rows = data.map((d, i) => {
    const id = `${uc === 'E2E' ? 'E2E' : `TC-${uc}`}-${String(i + 1).padStart(2, '0')}`;
    let [area, title, pre, steps, tdata, exp, ref, pri, type, exec, status = 'Not Run', actual = '', defect = '', ev = ''] = d;
    const r = res.results[id];
    if (r) {
      [status, actual] = r;
      defect = [defect, r[2]].filter(Boolean).join(', ');
      const first = (r[2] || '').split(',')[0].trim();
      ev = bugShot(first) || ev;
    }
    return [id, ucLabel, area, title, pre, steps, tdata, exp, ref, pri, type, exec, status, actual, defect, status === 'Not Run' ? '' : EXEC_DATE, ev];
  });
  const ws = sheet(name, TC_COLS, rows, { xSplit: 4 });
  const last = rows.length + 1;
  ws.dataValidations.add(`M2:M${last + 200}`, { type: 'list', allowBlank: true, formulae: ['"Not Run,Pass,Fail,Blocked"'] });
  ws.dataValidations.add(`J2:J${last + 200}`, { type: 'list', allowBlank: true, formulae: ['"High,Medium,Low"'] });
  for (const [st, color] of Object.entries(STATUS_COLORS)) {
    ws.addConditionalFormatting({ ref: `M2:M${last + 200}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: [`"${st}"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: color } } } }] });
  }
  return ws;
}

// Read Me
const readme = wb.addWorksheet('Read Me');
readme.columns = [{ width: 26 }, { width: 110 }];
const info = [
  ['Follow-up on Expired License — Test Cases', ''],
  ['Scope', 'Follow-up on Expired License service: UC-001, UC-002, UC-002.1, UC-003, UC-003.1–003.3, UC-004 … UC-008, UC-010 … UC-017, the agreed change log (12 changes + action names table) and end-to-end scenarios.'],
  ['Roles', 'RCM = Rehabilitation & Closure Manager · TS = Technical Specialist · SGM = Sustainability General Manager · CCO = Chief Compliance Officer (ESNAD) · L1 = GM Sustainability & Community Affairs · L2 = Assistant Deputy Minister · L3 = Deputy · DM = Deputy Minister.'],
  ['Test accounts', 'employee1 = MIM_SuperUser; employee2 = InternalExplotration (Technical Specialist). Other roles: see Open Question Q16.'],
  ['Test licence', '20260710137 (Building Materials Quarry, category ج) — follow-up request 77320.'],
  ['Environment', 'TEST (platform-test.taadeen.dev), employee portal. Screens: الطلبات → tab "متابعة رخص منتهية"; إدارة المهام → tab "متابعة رخص منتهية".'],
  ['Executed so far', `${EXEC_DATE}: UC-002 cases marked Pass/Fail were executed during exploration on TEST data. UC-001 cases need a prepared licence and a manual run of the scheduled job.`],
  ['How to fill', 'Edit only: Status (Not Run / Pass / Fail / Blocked), Actual Result, Defect ID, Executed On, Evidence. The Summary sheet updates automatically.'],
  ['Execution column', 'Auto = covered by Playwright automation; Auto (after timer) = automated check after the job is run manually; Manual = needs manual setup or a judgement call.'],
  ['Evidence paths', 'Relative to the taadeen-automation repo (test-results-probe/...).'],
  ['Example row', 'TC-002-15 | UC-002 | Search | Search by Request Number | … | Pass | 1 row: 77248 | — | 2026-11-15'],
];
info.forEach((r, i) => {
  const row = readme.addRow(r);
  row.eachCell((c) => { c.font = i === 0 ? { name: 'Arial', size: 14, bold: true } : FONT; c.alignment = { vertical: 'top', wrapText: true }; });
  if (i > 0) row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
});

// Summary
const sum = wb.addWorksheet('Summary');
sum.columns = [{ width: 18 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }];
sum.addRow(['User Story', 'Total', 'Pass', 'Fail', 'Blocked', 'Not Run', 'Executed %']);
const sheetsForSum = [['UC-001', 'UC-001 Test Cases'], ['UC-002', 'UC-002 Test Cases'],
  ...more.sheets.map((s) => [s.uc === 'E2E' ? 'E2E' : `UC-${s.uc}`, s.name])];
sheetsForSum.forEach(([uc, sh], i) => {
  const r = i + 2; const ref = `'${sh}'!$M:$M`;
  sum.addRow([uc,
    { formula: `COUNTA('${sh}'!$A:$A)-1` },
    { formula: `COUNTIF(${ref},"Pass")` }, { formula: `COUNTIF(${ref},"Fail")` },
    { formula: `COUNTIF(${ref},"Blocked")` }, { formula: `COUNTIF(${ref},"Not Run")` },
    { formula: `IF(B${r}=0,0,(C${r}+D${r}+E${r})/B${r})` }]);
});
const tr = sheetsForSum.length + 2;
sum.addRow(['Total', ...['B', 'C', 'D', 'E', 'F'].map((c) => ({ formula: `SUM(${c}2:${c}${tr - 1})` })), { formula: `IF(B${tr}=0,0,(C${tr}+D${tr}+E${tr})/B${tr})` }]);
sum.addRow([]);
sum.addRow(['Defects by severity', 'Count']);
['High', 'Medium', 'Low'].forEach((s) => sum.addRow([s, { formula: `COUNTIF(Defects!$G:$G,"${s}")` }]));
sum.eachRow((row, n) => row.eachCell((c) => {
  c.font = (n === 1 || n === tr + 2) ? HEAD : (n === tr ? { ...FONT, bold: true } : FONT);
  if (n === 1 || n === tr + 2) c.fill = HEAD_FILL;
  c.border = BORDER;
}));
for (let r = 2; r <= tr; r++) sum.getCell(`G${r}`).numFmt = '0%';

tcSheet('UC-001 Test Cases', '001', uc1);
tcSheet('UC-002 Test Cases', '002', uc2);
more.sheets.forEach((s) => tcSheet(s.name, s.uc, s.cases));

// Merge defects: patch existing ones, then append the new ones, sorted by id.
const applyPatch = (d, p) => {
  if (!p) return d;
  const r = [...d];
  if (p.actual) r[5] = p.actual;
  if (p.note) r[9] = p.replaceNote ? p.note : [r[9], p.note].filter(Boolean).join(' ');
  return r;
};
const allDefects = defects.map((d) => applyPatch(applyPatch(d, more.defectPatches[d[0]]), res.defectPatches[d[0]]))
  .concat(more.extraDefects, res.e2eDefects).sort((a, b) => a[0].localeCompare(b[0]));
const dws = sheet('Defects', [['Defect ID', 10], ['User Story', 12], ['Title', 40], ['Steps to Reproduce', 36], ['Expected', 32], ['Actual', 40],
  ['Severity', 9], ['Priority', 8], ['Status', 9], ['Found On', 11], ['Environment', 10], ['Evidence file', 18], ['Notes', 30], ['Screenshot', 62]],
  allDefects.map(([id, uc, title, steps, exp, act, sev, pri, ev, note]) => {
    const shotPath = bugShot(id);
    return [id, uc, title, steps, exp, act, sev, pri, 'New', EXEC_DATE, 'TEST', shotPath ? { text: shotPath, hyperlink: shotPath } : ev, note, ''];
  }), { xSplit: 3 });
// Embed one screenshot per defect (row height fits a 440x250 thumbnail).
allDefects.forEach(([id], i) => {
  const p = path.join(BUG_DIR, `${id}.png`);
  if (!fs.existsSync(p)) return;
  const rowNo = i + 2;
  dws.getRow(rowNo).height = 195;
  const img = wb.addImage({ filename: p, extension: 'png' });
  dws.addImage(img, { tl: { col: 13.05, row: rowNo - 1 + 0.05 }, ext: { width: 440, height: 250 }, hyperlinks: { hyperlink: `bugs/${id}.png` } });
  const c = dws.getCell(rowNo, 12); c.font = { ...FONT, color: { argb: 'FF0563C1' }, underline: true };
});
dws.dataValidations.add('I2:I300', { type: 'list', allowBlank: true, formulae: ['"New,To confirm,Reported,Fixed,Retest passed,Rejected"'] });
for (const [s, color] of Object.entries(SEV_COLORS)) {
  dws.addConditionalFormatting({ ref: 'G2:G300', rules: [{ type: 'cellIs', operator: 'equal', formulae: [`"${s}"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: color } } } }] });
}

// Bugs logged by the automated suite (tests/expired-license-followup): one row + one screenshot per bug, per licence run.
const RUNS_DIR = path.join(BUG_DIR, 'runs');
const runBugs = fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).flatMap((lic) => {
  const f = path.join(RUNS_DIR, lic, 'bugs.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).map((b) => ({ ...b, licence: lic })) : [];
}) : [];
if (runBugs.length) {
  const rws = sheet('Run Bugs', [['Licence', 13], ['Test', 26], ['Bug key', 24], ['Known defect', 11], ['User Story', 18], ['Title', 36], ['Expected', 30], ['Actual', 36],
    ['Severity', 9], ['Found at', 18], ['Screenshot file', 22], ['Screenshot', 62]],
  runBugs.map((b) => {
    const rel = path.relative(__dirname, path.resolve(__dirname, '..', b.screenshot)).replace(/\\/g, '/');
    return [b.licence, b.test, b.key, b.defect ?? 'NEW', b.uc, b.title, b.expected, b.actual, b.severity, b.at.replace('T', ' ').slice(0, 16), { text: rel, hyperlink: rel }, ''];
  }), { xSplit: 3 });
  runBugs.forEach((b, i) => {
    const p = path.resolve(__dirname, '..', b.screenshot);
    if (!fs.existsSync(p)) return;
    rws.getRow(i + 2).height = 195;
    rws.addImage(wb.addImage({ filename: p, extension: 'png' }), { tl: { col: 11.05, row: i + 1.05 }, ext: { width: 440, height: 250 } });
  });
}

sheet('Open Questions', [['ID', 6], ['Reference', 18], ['Question', 100], ['Answer', 50]],
  [...questions, ...more.extraQuestions].map((q) => [...q, more.questionAnswers[q[0]] ?? '']));

sheet('Change Log', [['#', 5], ['Change (agreed)', 100], ['Affected stories', 40]], more.changeLog);
sheet('Action Names', [['Task', 44], ['Positive action', 30], ['Alternative action', 44], ['Negative action', 30]], more.actionTable);

wb.worksheets.forEach((ws) => { ws.properties.defaultRowHeight = 15; });
const total = uc1.length + uc2.length + more.sheets.reduce((n, s) => n + s.cases.length, 0);
wb.xlsx.writeFile(out).then(() => console.log('written', out, 'cases', total, 'sheets', wb.worksheets.length, 'defects', allDefects.length));
