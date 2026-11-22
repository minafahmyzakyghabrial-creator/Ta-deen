import { Page } from '@playwright/test';
import { expect, test } from '@fixtures/test';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
import { ExpiredRequestDetailsPage } from '@pages/employee/expired-license/ExpiredRequestDetailsPage';
import { expiredFollowUp as X } from '@data/expired-license-followup.data';
import { BugRecorder } from '@utils/bug-recorder';
import { addComment, bugs, checkTaskName, requestNumber, RUN } from './expired-license-followup.config';

/**
 * END-TO-END workflow of the follow-up request of RUN.licence — CHANGES DATA (assigns tasks, submits responses).
 *
 *   UC-004  RCM (RUN.rcm) assigns the review to themselves and sends it to the specialist
 *   UC-005  specialist (RUN.specialist): closure-field validations (never confirms a closure) → R&C check → complete step
 *   UC-006  specialist: send reminder email → complete step
 *   UC-007  specialist: visit validations → valid visit → save
 *
 * RESUMABLE: every test reads where the request is (title of the task page) and skips itself when the request is not at
 * its step, so the file can be re-run at any time. After UC-007 the flow waits for the day-181 escalation (UC-008).
 * Every failed check = one bug with its own screenshot ("follow up bugs/<licence>/").
 */
test.describe.configure({ mode: 'default' });

/** Comment written into description / notes fields (user's request 2026-11-17). */
const COMMENT = (step: string) => `تعليق آلي — ${step} — ${new Date().toISOString().slice(0, 16)}`;

/** Opens the task as `page`'s user (assigning it when unassigned). Returns undefined when the user cannot see the task. */
async function openTask(page: Page, rn: string, b?: BugRecorder): Promise<{ tasks: ExpiredFollowUpTasksPage; details?: ExpiredRequestDetailsPage; menu: { before: string[]; after: string[] } }> {
  const tasks = new ExpiredFollowUpTasksPage(page);
  await tasks.open();
  const rows = await tasks.search({ request: rn });
  if (!rows.length) return { tasks, menu: { before: [], after: [] } };
  // Task name in the task list's "نوع العملية" column (compared with the user stories — user's request 2026-11-17).
  const listName = rows.find((r) => r['رقم الطلب'] === rn)?.['نوع العملية'];
  if (b && listName) await checkTaskName(b, page, 'list', listName, [tasks.row(rn)]);
  const menu = await tasks.assignToMe(rn);
  const details = await tasks.respond(rn);
  if (b) await checkTaskName(b, details.page, 'title', await details.title());
  return { tasks, details, menu };
}

test.describe(`Expired licence follow-up — workflow (licence ${RUN.licence})`, () => {
  test('UC-004 — RCM routes "مراجعة الرخصة المنتهية" to the specialist', async ({ sessions }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    let { page } = await sessions.as(RUN.rcm);
    const rn = await requestNumber(page);

    // Access (UC-004 pre-conditions): the specialist must not be able to respond to the review. Read-only — nothing is assigned.
    const sp = new ExpiredFollowUpTasksPage((await sessions.as(RUN.specialist)).page);
    await sp.open();
    const spRows = await sp.search({ request: rn });
    // Only while the request is still at the review: later the specialist's row is their own Site Eligibility task.
    if (spRows.length && /مراجعة الرخصة المنتهية/.test(spRows.find((r) => r['رقم الطلب'] === rn)?.['نوع العملية'] ?? '')) {
      const spMenu = await sp.menu(rn).actions().catch(() => [] as string[]);
      await sp.page.keyboard.press('Escape');
      await b.check(!spMenu.some((m) => /^الرد عل[ىي] الطلب$|^إسناد/.test(m.trim())), sp.page,
        { key: 'specialist-can-take-review', title: 'Technical Specialist can take / respond to "مراجعة الرخصة المنتهية"', uc: 'UC-004 pre-conditions (access)', expected: 'Only the RCM can respond to the review', severity: 'High' },
        `specialist menu: ${spMenu.join(' / ')}`, [sp.row(rn)]);
    }

    // Roles: the RCM account must be able to take the review; otherwise log it and continue as the Super user.
    {
      const t = new ExpiredFollowUpTasksPage(page);
      await t.open();
      const tr = (await t.search({ request: rn })).find((r) => r['رقم الطلب'] === rn);
      // Past the review (e.g. at a Site Eligibility step) → nothing for the RCM to do here.
      test.skip(!!tr && !/مراجعة الرخصة المنتهية/.test(tr['نوع العملية'] ?? ''), `Request ${rn} is at "${tr?.['نوع العملية']}".`);
      if (tr) {
        const m0 = await t.menu(rn).actions();
        await page.keyboard.press('Escape');
        const canTake = m0.some((m) => /^إسناد إلى$|^الرد عل[ىي] الطلب$/.test(m.trim()));
        await b.check(canTake, page, { key: 'role-review-wrong-owner', title: 'Roles — the RCM account (Internal1_Preprod, all roles except specialist) cannot take "مراجعة الرخصة المنتهية": the row menu offers only the read-only respond', uc: 'UC-004 pre-conditions (RCM responds to the review); roles & permissions', expected: '"إسناد إلى" / "الرد على الطلب" for the RCM', severity: 'High' },
          `RCM (${RUN.rcm}) menu: ${m0.join(' / ')}`, [t.row(rn)]);
        // The Super user stands in only when FALLBACK=1 (user's call, 2026-11-17: use Internal1_Preprod).
        if (!canTake && process.env.FALLBACK !== '1') throw new Error(`${RUN.rcm} cannot take the review of ${rn} — menu: ${m0.join(' / ')}`);
        if (!canTake) page = (await sessions.as(RUN.superuser)).page;
      }
    }
    let { tasks, details: d, menu } = await openTask(page, rn, b);
    test.skip(!d, `Request ${rn} has no task visible to ${RUN.rcm} — already past the review.`);
    const title = await d!.title();
    test.skip(title !== X.processType.review, `Request ${rn} is at "${title}".`);
    let p = d!.page;

    // Cancel saves nothing (UC-004 field 12): choose a specialist, "إلغاء", reopen → still the review, nothing logged.
    if (await d!.cancelButton.isVisible().catch(() => false)) {
      await d!.selectSpecialist(X.specialistName);
      await d!.cancelButton.click();
      await p.waitForTimeout(5_000);
      await p.close().catch(() => {});
      ({ tasks, details: d, menu } = await openTask(page, rn, b));
      p = d!.page;
      const reopened = await d!.title();
      const hist = await d!.history();
      await b.check(reopened === X.processType.review && !hist.responses.some((r) => r.task === X.processType.review), p,
        { key: 'review-cancel-saved', title: '"إلغاء" on the review saved / routed the task', uc: 'UC-004 field 12', expected: 'Task stays with the RCM, nothing created', severity: 'High' },
        `title "${reopened}"; responses: ${hist.responses.map((r) => r.task).join(', ') || 'none'}`, []);
      await d!.openRespondTab();
    } else {
      await b.check(false, p, { key: 'review-no-cancel', title: 'No "إلغاء" button on the review panel', uc: 'UC-004 field 12', expected: '"إلغاء" button', severity: 'Low' }, 'button missing', [d!.stepSend]);
    }

    await b.check(!menu.after.includes('إلغاء الإسناد'), page, { key: 'unassign-offered', title: '"إلغاء الإسناد" offered after assignment', uc: 'UC-003.1 BR-001; Change #9', expected: 'No Unassign', severity: 'High', defect: 'DEF-035' },
      menu.after.join(' / '), [tasks.row(rn)]);
    await b.check(!/الرد علي الطلب/.test(await d!.bodyLines()), p, { key: 'respond-tab-typo', title: 'Tab label "الرد علي الطلب"', uc: 'UC-003.2', expected: 'الرد على الطلب', severity: 'Low', defect: 'DEF-056' },
      'الرد علي الطلب', [d!.tab(/الرد علي الطلب/)]);
    await b.check(await d!.stepSend.isDisabled(), p, { key: 'review-send-enabled-empty', title: '"إرسال" enabled before a specialist is chosen', uc: 'UC-004 field 11', expected: 'Disabled', severity: 'Medium' }, 'enabled', [d!.stepSend]);
    const options = await d!.specialistOptions();
    console.log('SPECIALISTS', options);
    expect(options.length, 'specialists offered').toBeGreaterThan(0);
    await b.check(!options.some((o) => /\(\s*\)/.test(o)), p, { key: 'specialist-empty-brackets', title: 'Specialist option shows "()"', uc: 'UC-004 field 11', expected: 'Specialist name', severity: 'Low', defect: 'DEF-055' },
      options.join(' / '), [d!.specialistDropdown]);
    const chosen = await d!.selectSpecialist(X.specialistName);
    await expect(d!.stepSend).toBeEnabled();
    await d!.stepSend.click();
    const msgs = await d!.messages();
    expect(await d!.waitForSubmitted(), 'review submitted').toBe(true);
    await b.check(msgs.length > 0, p, { key: 'no-success-message-review', title: 'No success message after submitting the review', uc: 'UC-003.2', expected: 'Confirmation message', severity: 'Low', defect: 'DEF-058' }, 'none', []);

    // Result (UC-004 post-conditions): Site Eligibility task for the specialist + history entry.
    const st = new ExpiredFollowUpTasksPage((await sessions.as(RUN.specialist)).page);
    await st.open();
    const sRows = await st.search({ request: rn });
    expect(sRows.length, `task visible to the specialist (${chosen})`).toBe(1);
    const view = await st.view(rn);
    const cards = await view.linkedTasks();
    console.log('CARDS AFTER REVIEW', JSON.stringify(cards));
    expect(cards[0]?.name, 'new current task').toBe(X.processType.check);
    expect(cards[0]?.assignedTo).toContain(X.specialistName);
    const h = await view.history();
    expect(h.responses.some((r) => r.task === X.processType.review && r.status === 'مكتمل'), 'review response in history').toBe(true);
    await view.page.close();
  });

  test('UC-005 — specialist: closure-field rules and R&C check', async ({ sessions }, testInfo) => {
    test.setTimeout(25 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.specialist);
    const rn = await requestNumber(page);
    let d = (await openTask(page, rn, b)).details;
    test.skip(!d, `No task of ${rn} for ${RUN.specialist}.`);
    test.skip((await d!.title()) !== X.processType.check, `Request ${rn} is at "${await d!.title()}".`);
    let p = d!.page;

    await b.check(await d!.closeRequestButton.isDisabled(), p, { key: 'close-enabled-no-option', title: '"إنهاء الطلب" enabled before an option is selected', uc: 'UC-005 C6', expected: 'Disabled', severity: 'Medium', defect: 'DEF-037' }, 'enabled', [d!.closeRequestButton]);
    await b.check(await d!.stepSend.isDisabled(), p, { key: 'check-step-send-before-check', title: 'Step "إرسال" enabled before the check is run', uc: 'UC-005 field 1', expected: 'Disabled until checked', severity: 'Medium', defect: 'DEF-054' }, 'enabled', [d!.stepSend]);
    const closeText = (await d!.bodyLines()).split('هل ترغب في إغلاق الطلب').pop() ?? '';
    await b.check(!/^\s*الوصف\s*$/m.test(closeText), p, { key: 'close-notes-label', title: 'Close-request notes labelled "الوصف"', uc: 'UC-005 C4', expected: 'ملاحظات', severity: 'Low', defect: 'DEF-042' }, 'الوصف', [p.locator('label', { hasText: /^\s*الوصف\s*$/ }).last()]);

    await d!.chooseCloseOption('تقدم المستثمر بطلب إعادة تأهيل وإغلاق');
    await d!.closeDescription.fill(COMMENT('إغلاق الطلب – تقدم المستثمر بطلب إعادة تأهيل وإغلاق (اختبار، لن يتم التأكيد)')).catch(() => {});
    await expect(d!.closeRequestNumberInput).toBeVisible();
    await b.check(await d!.closeSectionHasUpload(), p, { key: 'close-option1-no-certificate', title: 'No certificate upload for "تقدم المستثمر بطلب…"', uc: 'UC-005 C3', expected: 'Optional certificate upload', severity: 'Medium', defect: 'DEF-040' }, 'no upload field', [d!.closeRequestNumberInput]);
    // A disabled "إنهاء الطلب" while the R&C number is empty is an accepted way of refusing (story: "confirm disabled or message").
    if (!(await d!.closeRequestButton.isEnabled().catch(() => false))) {
      console.log('CLOSE option 1, empty number → "إنهاء الطلب" disabled (refused — OK)');
    } else {
      await d!.closeRequestButton.click();
      await p.waitForTimeout(3_000);
      if (await d!.dialog.isVisible().catch(() => false)) {
        await b.check(false, p, { key: 'close-empty-number-confirm', title: 'Confirm dialog shown although the R&C number is empty', uc: 'UC-005 ERR-LIC-005-002', expected: X.messages.rcNumberRequired, severity: 'High' }, (await d!.dialog.innerText()).replace(/\s+/g, ' '), [d!.dialog]);
        await d!.dialog.getByRole('button', { name: /إلغاء|لا/ }).first().click().catch(() => {});
      } else {
        const m = await d!.messages();
        await b.check(m.some((t) => t.includes(X.messages.rcNumberRequired)), p, { key: 'close-empty-number-message', title: 'Empty R&C number message', uc: 'UC-005 ERR-LIC-005-002', expected: X.messages.rcNumberRequired, severity: 'Low', defect: 'DEF-038' }, m.join(' | ') || 'none', [d!.closeRequestNumberInput]);
      }
    }
    // Non-existent R&C request number (Q27): must be refused before any closure confirmation. NEVER confirmed here.
    // Safety net: should the app close the request without a confirm dialog, the closing server call is aborted.
    const calls: string[] = [];
    const guard = async (route: import('@playwright/test').Route) => {
      const action = route.request().url().split('?')[0].split('/').pop() ?? '';
      calls.push(action);
      if (/close|terminat|finish|complete|end_?request|endrequest/i.test(action)) return route.abort();
      return route.continue();
    };
    await p.route('**/screenservices/**', guard);
    await d!.closeRequestNumberInput.fill(X.unknownRcNumber);
    await d!.closeRequestNumberInput.press('Tab');
    await p.waitForTimeout(2_000);
    const closeEnabled = await d!.closeRequestButton.isEnabled().catch(() => false);
    if (closeEnabled) await d!.closeRequestButton.click();
    await p.waitForTimeout(4_000);
    console.log('CLOSE (unknown R&C) enabled', closeEnabled, 'SERVER CALLS', calls);
    if (!closeEnabled) {
      console.log('CLOSE with a non-existent R&C number → "إنهاء الطلب" stays disabled (refused — OK)');
    } else if (await d!.dialog.isVisible().catch(() => false)) {
      const text = (await d!.dialog.innerText()).replace(/\s+/g, ' ');
      await b.check(false, p, { key: 'close-unknown-rc-number', title: 'A non-existent R&C request number goes straight to the closure confirmation', uc: 'UC-005 C2 (Q27)', expected: 'R&C number validated (exists, belongs to the licence) before closing', severity: 'High' },
        `number ${X.unknownRcNumber} → dialog "${text.slice(0, 200)}"`, [d!.dialog]);
      await d!.dialog.getByRole('button', { name: /إلغاء|لا|إغلاق/ }).first().click().catch(() => {});
      await p.waitForTimeout(2_000);
    } else {
      const m = await d!.messages();
      console.log('UNKNOWN R&C NUMBER →', m);
      await b.check(m.length > 0, p, { key: 'close-unknown-rc-silent', title: 'No message for a non-existent R&C request number', uc: 'UC-005 C2 (Q27)', expected: 'Validation message', severity: 'Medium' },
        'nothing shown', [d!.closeRequestNumberInput]);
    }
    await p.unroute('**/screenservices/**', guard);
    await d!.closeRequestNumberInput.fill('');

    await d!.chooseCloseOption('صدور شهادة الإغلاق');
    await d!.closeDescription.fill(COMMENT('إغلاق الطلب – صدور شهادة الإغلاق (اختبار، لن يتم التأكيد)')).catch(() => {});
    await b.check(await d!.closeSectionHasUpload(), p, { key: 'close-option2-no-upload', title: '"صدور شهادة الإغلاق" has no certificate upload — closure by certificate impossible', uc: 'UC-005 C3', expected: 'Required certificate upload', severity: 'High', defect: 'DEF-041' }, 'no upload field', [p.locator('label', { hasText: 'صدور شهادة الإغلاق' })]);
    const certEnabled = await d!.closeRequestButton.isEnabled().catch(() => false);
    if (certEnabled) await d!.closeRequestButton.click();
    await p.waitForTimeout(3_000);
    if (!certEnabled) {
      console.log('CLOSE option 2 without a certificate → "إنهاء الطلب" disabled (refused — OK)');
    } else if (await d!.dialog.isVisible().catch(() => false)) {
      await b.check(false, p, { key: 'close-no-certificate-confirm', title: 'Confirm dialog shown without a certificate', uc: 'UC-005 ERR-LIC-005-001', expected: X.messages.certificateRequired, severity: 'High' }, (await d!.dialog.innerText()).replace(/\s+/g, ' '), [d!.dialog]);
      await d!.dialog.getByRole('button', { name: /إلغاء|لا/ }).first().click().catch(() => {});
    } else {
      const m = await d!.messages();
      await b.check(m.some((t) => t.includes(X.messages.certificateRequired)), p, { key: 'close-no-certificate-message', title: 'No message when closing without a certificate', uc: 'UC-005 ERR-LIC-005-001', expected: X.messages.certificateRequired, severity: 'High', defect: 'DEF-041' }, m.join(' | ') || 'none', [d!.closeRequestButton]);
    }

    // Reload (clears the radio), run the check.
    await p.close();
    d = (await openTask(page, rn, b)).details;
    p = d!.page;
    const result = await d!.runCheck();
    console.log('CHECK RESULT', result);
    if (/^يوجد/.test(result)) test.skip(true, `Completed R&C request found: ${result} — closure branch not automated here.`);
    await b.check(result === X.messages.noRcRequest, p, { key: 'check-message', title: 'Check result message', uc: 'UC-005 notifications', expected: X.messages.noRcRequest, severity: 'Medium' }, result, [p.getByText(result || '#none#').first()]);
    const h = await d!.history();
    // The step is not completed yet, so any entry about it can only be the check itself.
    await b.check(h.responses.some((r) => r.task.includes('التحقق من وجود طلب')), p,
      { key: 'check-not-logged', title: 'The R&C check is not logged in Request History', uc: 'UC-005 main path 5', expected: 'History entry for the check', severity: 'Medium', defect: 'DEF-043' }, h.responses.map((r) => `${r.task}: ${r.status}`).join(' ; ') || 'no responses', [p.getByText('سجل الردود').first()]);
    await d!.openRespondTab();
    await addComment(d!, X.processType.check, 'التحقق من وجود طلب إعادة التأهيل والإغلاق');
    await d!.stepSend.click();
    expect(await d!.waitForSubmitted(), 'check step submitted').toBe(true);
  });

  test('UC-006 — specialist: reminder email', async ({ sessions }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.specialist);
    const rn = await requestNumber(page);
    const { details: d } = await openTask(page, rn, b);
    test.skip(!d, `No task of ${rn} for ${RUN.specialist}.`);
    test.skip((await d!.title()) !== X.processType.email, `Request ${rn} is at "${await d!.title()}".`);
    const p = d!.page;
    await expect(d!.stepSend, 'step send disabled until the email is sent').toBeDisabled();
    await d!.emailSend.click();
    await p.waitForTimeout(8_000);
    const body = await d!.bodyLines();
    await b.check(body.includes(X.messages.emailSent), p, { key: 'email-confirmation', title: 'No email confirmation message', uc: 'UC-006 notifications', expected: X.messages.emailSent, severity: 'Medium' }, 'not shown', []);
    const emailButtonStillThere = (await d!.button('إرسال').count()) >= 2;
    await b.check(!emailButtonStillThere || await d!.emailSend.isDisabled(), p,
      { key: 'email-button-still-enabled', title: 'Email button stays enabled after sending', uc: 'UC-006 (Q28)', expected: 'Disabled / shows "Sent"', severity: 'Low', defect: 'DEF-053' }, 'enabled', [d!.emailSend]);
    await expect(d!.stepSend).toBeEnabled();
    await addComment(d!, X.processType.email, 'إرسال بريد تذكيري للمستثمر');
    await d!.stepSend.click();
    expect(await d!.waitForSubmitted(), 'email step submitted').toBe(true);
  });

  test('UC-007 — specialist: field visit', async ({ sessions }, testInfo) => {
    test.setTimeout(25 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.specialist);
    const rn = await requestNumber(page);
    let { details: d } = await openTask(page, rn, b);
    test.skip(!d, `No task of ${rn} for ${RUN.specialist}.`);
    test.skip((await d!.title()) !== X.processType.visit, `Request ${rn} is at "${await d!.title()}".`);
    let p = d!.page;
    const body = await d!.bodyLines();
    const follow = await d!.followUpSection();
    await b.check(!follow.includes('المراجعة النهائية والتحقق'), p, { key: 'followup-old-task-name', title: 'Follow-up section uses the old name "المراجعة النهائية والتحقق"', uc: 'UC-007/008; Change #10', expected: 'قرار مدير التأهيل والإغلاق', severity: 'Low', defect: 'DEF-045' }, follow.replace(/\s+/g, ' ').slice(0, 200), [p.getByText(/المراجعة النهائية والتحقق/).first()]);
    await b.check(!follow.includes('قيد المراجعة'), p, { key: 'reminder-status-text', title: 'Reminder status "قيد المراجعة"', uc: 'UC-007 fields 3–4', expected: 'In Progress / قيد التنفيذ', severity: 'Low', defect: 'DEF-050' }, 'قيد المراجعة', [p.getByText('قيد المراجعة').first()]);
    await b.check(!body.includes('وقت الزيارة'), p, { key: 'visit-date-label', title: 'Visit date labelled "وقت الزيارة"', uc: 'UC-007 field 13', expected: 'تاريخ الزيارة', severity: 'Low', defect: 'DEF-046' }, 'وقت الزيارة', [p.getByText(/وقت الزيارة/).first()]);
    await b.check(!body.includes('اسم المنشأه'), p, { key: 'facility-typo', title: 'Typo "اسم المنشأه"', uc: 'UC-007 field 7', expected: 'اسم المنشأة', severity: 'Low', defect: 'DEF-049' }, 'اسم المنشأه', [p.getByText('اسم المنشأه').first()]);

    await d!.stepSend.click();
    await p.waitForTimeout(3_000);
    expect((await d!.messages()).length, 'empty visit is rejected').toBeGreaterThan(0);
    // Fresh page for the date work: the validation re-render leaves the date picker unusable for automation
    // (a person reopening the task gets the same clean state).
    await p.close().catch(() => {});
    ({ details: d } = await openTask(page, rn, b));
    p = d!.page;

    // Date rule (field 13): tomorrow must not be selectable, today must be (verified by hand by QA, 2026-11-16).
    console.log('VISIT DATE RANGE', await d!.visitDateRange());
    const tomorrow = await d!.visitCalendarDay(1);
    console.log('TOMORROW CELL', tomorrow);
    await b.check(/flatpickr-disabled|not in this month/.test(tomorrow), p,
      { key: 'visit-date-future-accepted', title: 'A future visit date (tomorrow) can be picked', uc: 'UC-007 field 13; Errors', expected: X.messages.visitDateRule, severity: 'Medium' },
      tomorrow, [d!.visitDateInput]);

    // Valid date the user's way: open the calendar → click today.
    const picked = await d!.pickVisitDateToday();
    console.log('VISIT DATE (calendar)', picked);
    if (!picked.bound) {
      await b.check(false, p, { key: 'visit-date-not-bound', title: 'Visit date picked in the calendar is not captured', uc: 'UC-007 field 13', expected: 'Picked date saved with the visit', severity: 'High', defect: 'DEF-047' }, `shown "${picked.shown}", bound value ""`, [d!.visitDateInput]);
    }
    await d!.uploadObservation(X.attachment);
    expect(await d!.selectFindingEligible(), 'finding selected').toBe(true);

    // Description required when a finding is selected (fields 15–16).
    await d!.visitDescription.fill('');
    await d!.stepSend.click();
    await p.waitForTimeout(5_000);
    const noDesc = await d!.messages();
    // The respond page URL carries "TaskManagement" in its query string — test the path, not the whole URL.
    const stillHere = !p.isClosed() && /RequestDetails/.test(new URL(p.url()).pathname);
    await b.check(stillHere && noDesc.length > 0, p, { key: 'visit-description-not-required', title: 'Visit saved / no message without a description', uc: 'UC-007 fields 15–16', expected: X.messages.requiredFields, severity: 'Medium' },
      `messages: ${noDesc.join(' | ') || 'none'}; still on the visit: ${stillHere}`, [d!.visitDescription]);
    if (!stillHere) ({ details: d } = await openTask(page, rn, b)), (p = d!.page);

    await d!.visitDescription.fill(X.visitDescription);
    await addComment(d!, X.processType.visit, 'توثيق الزيارة الميدانية والإفادة');
    await d!.stepSend.click();
    await p.waitForTimeout(8_000);
    const after = await d!.messages();
    console.log('VISIT SUBMIT MESSAGES', after);

    await p.close().catch(() => {});
    // The visit task may be gone (escalated at once) — then reopening fails; the decisions spec checks the outcome.
    const reopened = await openTask(page, rn, b).catch(() => ({ details: undefined }));
    d = reopened.details;
    // TEST 2026-11-16 (77433): a valid visit save closes the step and creates "قرار مدير التأهيل والإغلاق" at once —
    // the specialist's visit task is gone. That outcome is checked in the decisions spec ("UC-007 post-conditions").
    if (!d || (await d.title()) !== X.processType.visit) return;
    p = d!.page;
    const saved = { date: await d!.visitDateBound.inputValue(), desc: await d!.visitDescription.inputValue(), finding: await d!.findingEligible.isChecked() };
    console.log('SAVED VISIT', saved);
    if (!saved.date && !saved.desc) {
      await b.blocker(p, { key: 'visit-not-saved', title: 'Visit is not saved after a valid submit', uc: 'UC-007 main path', expected: 'Visit saved + history entry; task stays with the specialist', severity: 'High', defect: 'DEF-051' },
        `messages after submit: ${after.join(' | ') || 'none'}; reopened visit is empty`, [d!.visitDateInput]);
    }
    await b.check(saved.finding && saved.desc === X.visitDescription, p, { key: 'visit-partially-saved', title: 'Saved visit lost the finding or the description', uc: 'UC-007 main path', expected: `finding مؤهل + "${X.visitDescription}"`, severity: 'High' },
      JSON.stringify(saved), [d!.visitDescription]);
    const h = await d!.history();
    await b.check(h.responses.some((r) => r.task === X.processType.visit) || /زيارة/.test(h.text), p, { key: 'visit-not-logged', title: 'Saved visit not in Request History', uc: 'UC-007 post-conditions', expected: 'History entry with the visit and attachments', severity: 'Medium' },
      h.responses.map((r) => `${r.task}: ${r.status}`).join(' ; ') || 'no responses', [p.getByText('سجل الردود').first()]);
    expect(await d!.title(), 'task stays with the specialist at the visit step (UC-007 post-condition)').toBe(X.processType.visit);

    // A saved visit can be reopened and edited (UC-007 field 6).
    await d!.openRespondTab();
    const edited = `${X.visitDescription} — تعديل`;
    await d!.visitDescription.fill(edited);
    await d!.stepSend.click();
    await p.waitForTimeout(8_000);
    await p.close().catch(() => {});
    ({ details: d } = await openTask(page, rn, b));
    p = d!.page;
    const desc2 = await d!.visitDescription.inputValue();
    await b.check(desc2 === edited, p, { key: 'visit-edit-not-saved', title: 'Editing a saved visit is not saved', uc: 'UC-007 field 6', expected: edited, severity: 'Medium' }, desc2, [d!.visitDescription]);
  });
});
