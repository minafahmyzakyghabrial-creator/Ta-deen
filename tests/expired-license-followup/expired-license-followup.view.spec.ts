import { expect, test } from '@fixtures/test';
import { ExpiredFollowUpRequestsPage } from '@pages/employee/expired-license/ExpiredFollowUpRequestsPage';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
import { expectedRemainingDays, expiredFollowUp as X } from '@data/expired-license-followup.data';
import { bugs, requestNumber, RUN } from './expired-license-followup.config';

/**
 * READ-ONLY checks of the follow-up request of RUN.licence: UC-001 result, UC-002 search & export, UC-002.1 details,
 * UC-003 task list. Nothing is assigned or submitted. Every failed check = one bug with its own screenshot.
 */
test.use({ employeeUser: RUN.rcm });
test.describe.configure({ mode: 'default' });

test.describe(`Expired licence follow-up — view (licence ${RUN.licence})`, () => {
  test('UC-001/UC-002 — request list row, filters and export', async ({ employee }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const page = employee.page;
    const rn = await requestNumber(page);
    const list = new ExpiredFollowUpRequestsPage(page);
    await list.open();
    const rows = await list.search({ licence: RUN.licence });
    console.log('REQUEST ROWS', JSON.stringify(rows));
    expect(rows.length, `follow-up request for licence ${RUN.licence}`).toBeGreaterThan(0);

    await b.check(rows.length === 1, page, { key: 'one-row-per-licence', title: 'More than one row for the licence / request', uc: 'UC-001 BR / UC-002', expected: 'One follow-up request (one row) per licence term.', severity: 'High', defect: 'DEF-004' },
      `${rows.length} rows: ${rows.map((r) => r['رقم الطلب']).join(', ')}`, [list.rows.nth(1)]);
    const row = rows[0];
    const expiry = row['تاريخ انتهاء الرخصة'];
    const today = new Date().toISOString().slice(0, 10);
    await b.check(expiry !== '-' && expiry <= today, page, { key: 'licence-not-expired', title: 'Follow-up created for a licence that has not expired', uc: 'UC-001 BR-001', expected: 'Only genuinely expired licences get a follow-up.', severity: 'High', defect: 'DEF-006' },
      `تاريخ انتهاء الرخصة = ${expiry} (today ${today})`, [list.cell(rn, 'تاريخ انتهاء الرخصة')]);
    const remaining = Number(row['المهلة النظامية المتبقية']);
    if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      const exp = expectedRemainingDays(expiry);
      await b.check(remaining === exp, page, { key: 'remaining-period-wrong', title: 'Remaining regulatory period is not 180 − days since expiry (0–180)', uc: 'UC-002 BR-003', expected: `${exp} days`, severity: 'High', defect: 'DEF-006' },
        `${row['المهلة النظامية المتبقية']}`, [list.cell(rn, 'المهلة النظامية المتبقية')]);
    }
    await b.check(/^(نعم|لا)$/.test(row['تجاوز المهلة النظامية؟'] ?? ''), page, { key: 'exceeded-english', title: '"تجاوز المهلة النظامية؟" not in Arabic', uc: 'UC-002 field 19', expected: 'نعم / لا', severity: 'Low', defect: 'DEF-008' },
      row['تجاوز المهلة النظامية؟'] ?? '', [list.cell(rn, 'تجاوز المهلة النظامية')]);
    await b.check(!/^(إصدار|تجديد|تحويل)/.test(row['نوع الرخصة'] ?? ''), page, { key: 'licence-type-service-name', title: 'نوع الرخصة shows the service name, not the licence type', uc: 'UC-002 field 13', expected: 'BMQ / Mining / Small Mining', severity: 'Medium', defect: 'DEF-003' },
      row['نوع الرخصة'] ?? '', [list.cell(rn, 'نوع الرخصة')]);
    await b.check(/^(أ|ب|ج|A|B|C)$/.test(row['فئة الرخصة'] ?? ''), page, { key: 'category-not-abc', title: 'فئة الرخصة is not A / B / C', uc: 'UC-002 field 14', expected: 'أ / ب / ج', severity: 'Low', defect: 'DEF-009' },
      row['فئة الرخصة'] ?? '', [list.cell(rn, 'فئة الرخصة')]);
    await b.check(/^\d+ يوم/.test(row['المهلة النظامية المتبقية'] ?? ''), page, { key: 'remaining-no-days-unit', title: 'Remaining period shown without "يوم"', uc: 'UC-002 field 21', expected: '"XX يوم"', severity: 'Low', defect: 'DEF-012' },
      row['المهلة النظامية المتبقية'] ?? '', [list.cell(rn, 'المهلة النظامية المتبقية')]);

    const statuses = await list.dropdownOptions(/حال[هة] الطلب/);
    await b.check(X.statuses.every((s) => statuses.includes(s)), page, { key: 'status-filter-values', title: 'Status filter does not list the follow-up statuses', uc: 'UC-002 field 4', expected: X.statuses.join(' / '), severity: 'High', defect: 'DEF-001' },
      statuses.join(' / '), [page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: /حال[هة] الطلب/ })]);
    const types = await list.dropdownOptions(/نوع الرخصة/);
    await b.check(!types.some((t) => /^(إصدار|تجديد|تحويل)/.test(t)), page, { key: 'licence-type-filter-values', title: 'Licence type filter lists service names', uc: 'UC-002 field 3', expected: 'BMQ / Mining / Small Mining', severity: 'Medium', defect: 'DEF-002' },
      types.join(' / '), [page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: /نوع الرخصة/ })]);
    const file = await list.exportFileName();
    await b.check(file.startsWith(X.exportFileName), page, { key: 'export-file-name-requests', title: 'Export file name (Request Management)', uc: 'UC-002 ALT-003; Change #2', expected: `${X.exportFileName}.xlsx`, severity: 'Low', defect: 'DEF-010' },
      file, [list.exportButton]);
  });

  test('UC-002.1 — request details (view-only)', async ({ employee }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const page = employee.page;
    const rn = await requestNumber(page);
    const list = new ExpiredFollowUpRequestsPage(page);
    await list.open();
    const [row] = await list.search({ request: rn });
    const d = await list.view(rn);
    const p = d.page;

    const title = await d.title();
    await b.check(title.includes(rn) && !title.includes(RUN.licence), p, { key: 'details-title', title: 'Details title without the request number', uc: 'UC-002.1 main path 2; Change #6', expected: `طلب متابعة رخصة منتهية — ${rn}`, severity: 'Medium', defect: 'DEF-015' },
      title, [p.locator('[class*="title"], h1').filter({ hasText: 'طلب متابعة رخصة منتهية' }).last()]);
    const company = await d.openTab('ملف الشركة');
    await b.check(/رقم الإقامة|الرقم الوطني/.test(company), p, { key: 'company-national-id', title: 'Company Profile lacks National ID / Iqama', uc: 'UC-002.1 field 4', expected: 'الرقم الوطني / رقم الإقامة', severity: 'Medium', defect: 'DEF-017' },
      'field not shown', [p.getByText('معلومات الشركة').first()]);

    const det = await d.requestDetails();
    console.log('DETAILS', JSON.stringify(det));
    await b.check('نوع العملية' in det, p, { key: 'details-process-type', title: '"نوع العملية" missing in Request Details', uc: 'UC-002.1 field 13.1; Change #5', expected: 'Current task name', severity: 'High', defect: 'DEF-016' },
      Object.keys(det).join(' | '), [p.getByText('حالة الطلب', { exact: true }).last()]);
    const detExpiry = det['تاريخ إنتهاء الرخصة'] ?? det['تاريخ انتهاء الرخصة'];
    await b.check(detExpiry === row['تاريخ انتهاء الرخصة'], p, { key: 'expiry-mismatch', title: 'Licence expiry date differs between list and details', uc: 'UC-002 / UC-002.1', expected: row['تاريخ انتهاء الرخصة'], severity: 'High', defect: 'DEF-034' },
      `details ${detExpiry} vs list ${row['تاريخ انتهاء الرخصة']}`, [p.getByText(detExpiry ?? '', { exact: true }).first()]);
    await b.check(det['حالة الطلب'] === X.status.inProgress || /^مكتمل/.test(det['حالة الطلب'] ?? ''), p, { key: 'details-status', title: 'Status is not a follow-up status', uc: 'UC-002.1 field 13; Change #4', expected: 'قيد التنفيذ / مكتمل – …', severity: 'Medium' },
      det['حالة الطلب'] ?? '', []);

    const cards = await d.linkedTasks();
    console.log('CARDS', JSON.stringify(cards));
    const keys = cards.map((c) => `${c.name}|${c.created}`);
    await b.check(new Set(keys).size === keys.length, p, { key: 'linked-task-duplicates', title: 'Duplicate linked-task cards', uc: 'UC-002.1 Linked Tasks', expected: 'One card per task', severity: 'High', defect: 'DEF-019' },
      keys.join(' ; '), []);
    await b.check(cards.some((c) => /لم يبدأ|Not Started/.test(c.status)), p, { key: 'linked-tasks-no-upcoming', title: 'Linked Tasks shows no upcoming (Not Started) steps', uc: 'UC-002.1; Change #7', expected: 'Completed + current + not-started steps', severity: 'High', defect: 'DEF-018' },
      cards.map((c) => `${c.name}: ${c.status}`).join(' ; '), [p.getByText(/مسندة إلى/).first()]);
    const wrongAssignee = cards.find((c) => /المراجعة النهائية والتحقق|غير مُسند/.test(c.assignedTo) || !c.assignedTo.includes(c.name));
    await b.check(!wrongAssignee, p, { key: 'linked-task-assignee', title: '"مسندة إلى" shows another / old task name or "غير مُسند"', uc: 'UC-002.1 field 17; UC-001 step 9; Change #10', expected: 'Assignee of the task', severity: 'Medium', defect: 'DEF-020' },
      wrongAssignee ? `${wrongAssignee.name} → ${wrongAssignee.assignedTo}` : '', [p.getByText(wrongAssignee?.assignedTo ?? '#none#').first()]);
    await b.check(cards.every((c) => /^(مكتمل|قيد التنفيذ|لم يبدأ)$/.test(c.status)), p, { key: 'linked-task-status-texts', title: 'Linked task card status texts', uc: 'UC-002.1 field 18', expected: 'مكتمل / قيد التنفيذ / لم يبدأ', severity: 'Low', defect: 'DEF-022' },
      [...new Set(cards.map((c) => c.status))].join(' / '), [p.getByText(/^(منتهي|جديد)$/).first()]);

    const h = await d.history();
    await b.check(/تم إنشاء طلب متابعة رخصة منتهية[\s\S]*المنصة/.test(h.text), p, { key: 'history-creation', title: 'Creation not logged by "المنصة"', uc: 'UC-001 post-condition; UC-002.1 field 20', expected: '"تم إنشاء طلب متابعة رخصة منتهية" by المنصة', severity: 'Medium' },
      'entry missing', []);
    await b.check(!/تاريخ تقديم الطلب\s*\n\s*\d{4}-\d{2}-\d{2}/.test(h.text), p, { key: 'history-date-format', title: 'History date not dd/mm/yyyy – hh:mm AM/PM', uc: 'UC-002.1 field 21', expected: 'dd/mm/yyyy – hh:mm AM/PM', severity: 'Low', defect: 'DEF-024' },
      (h.text.match(/تاريخ تقديم الطلب\s*\n\s*([^\n]+)/) ?? [])[1] ?? '', [p.getByText('تاريخ تقديم الطلب').first()]);
    await p.close();
  });

  test('UC-003 — task list row', async ({ employee }, testInfo) => {
    test.setTimeout(15 * 60_000);
    const b = bugs(testInfo);
    const page = employee.page;
    const rn = await requestNumber(page);
    const tasks = new ExpiredFollowUpTasksPage(page);
    await tasks.open();
    const headers = (await tasks.panel.locator('thead th').allInnerTexts()).map((h) => h.trim());
    await b.check(headers.indexOf('نوع الرخصة') < headers.indexOf('رقم الرخصة'), page, { key: 'task-columns-order', title: 'Task list column order', uc: 'UC-003 display fields', expected: 'رقم الطلب, نوع الرخصة, رقم الرخصة, …', severity: 'Low', defect: 'DEF-032' },
      headers.join(' | '), [tasks.panel.locator('thead th').nth(1)]);
    const rows = await tasks.search({ request: rn });
    console.log('TASK ROWS', JSON.stringify(rows));
    test.skip(!rows.length, `Task of ${rn} not visible to ${RUN.rcm} (assigned to another user).`);
    const menu = await tasks.menu(rn).actions();
    console.log('MENU', menu);
    if (menu.includes('إسناد إلى')) {
      await b.check(menu.some((m) => /آخر|لي/.test(m)), page, { key: 'assign-choices', title: 'No "Assign to Me" / "Assign to Another" choice', uc: 'UC-003 main path 5; UC-003.1', expected: 'Assign to Me + Assign to Another', severity: 'High', defect: 'DEF-036' },
        menu.join(' / '), [page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true })]);
    }
    await b.check(!menu.includes('إلغاء الإسناد'), page, { key: 'unassign-offered', title: '"إلغاء الإسناد" offered', uc: 'UC-003.1 BR-001; Change #9', expected: 'No Unassign', severity: 'High', defect: 'DEF-035' },
      menu.join(' / '), [page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true })]);
    await page.keyboard.press('Escape');
    const file = await tasks.exportFileName();
    await b.check(file.startsWith(X.exportFileName), page, { key: 'export-file-name-tasks', title: 'Export file name (Task Management)', uc: 'UC-003 ALT-003; Change #2', expected: `${X.exportFileName}.xlsx`, severity: 'Low', defect: 'DEF-010' },
      file, [tasks.exportButton]);
  });
});
