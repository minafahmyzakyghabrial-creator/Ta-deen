import { Page } from '@playwright/test';
import { expect, test } from '@fixtures/test';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
import { ExpiredRequestDetailsPage } from '@pages/employee/expired-license/ExpiredRequestDetailsPage';
import { expiredFollowUp as X } from '@data/expired-license-followup.data';
import { bugs, requestNumber, RUN } from './expired-license-followup.config';

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
 * Every failed check = one bug with its own screenshot (test-cases/bugs/runs/<licence>/).
 */
test.describe.configure({ mode: 'default' });

/** Opens the task as `page`'s user (assigning it when unassigned). Returns undefined when the user cannot see the task. */
async function openTask(page: Page, rn: string): Promise<{ tasks: ExpiredFollowUpTasksPage; details?: ExpiredRequestDetailsPage; menu: { before: string[]; after: string[] } }> {
  const tasks = new ExpiredFollowUpTasksPage(page);
  await tasks.open();
  const rows = await tasks.search({ request: rn });
  if (!rows.length) return { tasks, menu: { before: [], after: [] } };
  const menu = await tasks.assignToMe(rn);
  return { tasks, details: await tasks.respond(rn), menu };
}

test.describe(`Expired licence follow-up — workflow (licence ${RUN.licence})`, () => {
  test('UC-004 — RCM routes "مراجعة الرخصة المنتهية" to the specialist', async ({ sessions }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.rcm);
    const rn = await requestNumber(page);
    const { tasks, details: d, menu } = await openTask(page, rn);
    test.skip(!d, `Request ${rn} has no task visible to ${RUN.rcm} — already past the review.`);
    const title = await d!.title();
    test.skip(title !== X.processType.review, `Request ${rn} is at "${title}".`);
    const p = d!.page;

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
    let d = (await openTask(page, rn)).details;
    test.skip(!d, `No task of ${rn} for ${RUN.specialist}.`);
    test.skip((await d!.title()) !== X.processType.check, `Request ${rn} is at "${await d!.title()}".`);
    let p = d!.page;

    await b.check(await d!.closeRequestButton.isDisabled(), p, { key: 'close-enabled-no-option', title: '"إنهاء الطلب" enabled before an option is selected', uc: 'UC-005 C6', expected: 'Disabled', severity: 'Medium', defect: 'DEF-037' }, 'enabled', [d!.closeRequestButton]);
    await b.check(await d!.stepSend.isDisabled(), p, { key: 'check-step-send-before-check', title: 'Step "إرسال" enabled before the check is run', uc: 'UC-005 field 1', expected: 'Disabled until checked', severity: 'Medium', defect: 'DEF-054' }, 'enabled', [d!.stepSend]);
    const closeText = (await d!.bodyLines()).split('هل ترغب في إغلاق الطلب').pop() ?? '';
    await b.check(!/^\s*الوصف\s*$/m.test(closeText), p, { key: 'close-notes-label', title: 'Close-request notes labelled "الوصف"', uc: 'UC-005 C4', expected: 'ملاحظات', severity: 'Low', defect: 'DEF-042' }, 'الوصف', [p.locator('label', { hasText: /^\s*الوصف\s*$/ }).last()]);

    await d!.chooseCloseOption('تقدم المستثمر بطلب إعادة تأهيل وإغلاق');
    await expect(d!.closeRequestNumberInput).toBeVisible();
    await b.check(await d!.closeSectionHasUpload(), p, { key: 'close-option1-no-certificate', title: 'No certificate upload for "تقدم المستثمر بطلب…"', uc: 'UC-005 C3', expected: 'Optional certificate upload', severity: 'Medium', defect: 'DEF-040' }, 'no upload field', [d!.closeRequestNumberInput]);
    await d!.closeRequestButton.click();
    await p.waitForTimeout(3_000);
    if (await d!.dialog.isVisible().catch(() => false)) {
      await b.check(false, p, { key: 'close-empty-number-confirm', title: 'Confirm dialog shown although the R&C number is empty', uc: 'UC-005 ERR-LIC-005-002', expected: X.messages.rcNumberRequired, severity: 'High' }, (await d!.dialog.innerText()).replace(/\s+/g, ' '), [d!.dialog]);
      await d!.dialog.getByRole('button', { name: /إلغاء|لا/ }).first().click().catch(() => {});
    } else {
      const m = await d!.messages();
      await b.check(m.some((t) => t.includes(X.messages.rcNumberRequired)), p, { key: 'close-empty-number-message', title: 'Empty R&C number message', uc: 'UC-005 ERR-LIC-005-002', expected: X.messages.rcNumberRequired, severity: 'Low', defect: 'DEF-038' }, m.join(' | ') || 'none', [d!.closeRequestNumberInput]);
    }
    await d!.chooseCloseOption('صدور شهادة الإغلاق');
    await b.check(await d!.closeSectionHasUpload(), p, { key: 'close-option2-no-upload', title: '"صدور شهادة الإغلاق" has no certificate upload — closure by certificate impossible', uc: 'UC-005 C3', expected: 'Required certificate upload', severity: 'High', defect: 'DEF-041' }, 'no upload field', [p.locator('label', { hasText: 'صدور شهادة الإغلاق' })]);
    await d!.closeRequestButton.click();
    await p.waitForTimeout(3_000);
    if (await d!.dialog.isVisible().catch(() => false)) {
      await b.check(false, p, { key: 'close-no-certificate-confirm', title: 'Confirm dialog shown without a certificate', uc: 'UC-005 ERR-LIC-005-001', expected: X.messages.certificateRequired, severity: 'High' }, (await d!.dialog.innerText()).replace(/\s+/g, ' '), [d!.dialog]);
      await d!.dialog.getByRole('button', { name: /إلغاء|لا/ }).first().click().catch(() => {});
    } else {
      const m = await d!.messages();
      await b.check(m.some((t) => t.includes(X.messages.certificateRequired)), p, { key: 'close-no-certificate-message', title: 'No message when closing without a certificate', uc: 'UC-005 ERR-LIC-005-001', expected: X.messages.certificateRequired, severity: 'High', defect: 'DEF-041' }, m.join(' | ') || 'none', [d!.closeRequestButton]);
    }

    // Reload (clears the radio), run the check.
    await p.close();
    d = (await openTask(page, rn)).details;
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
    await d!.stepSend.click();
    expect(await d!.waitForSubmitted(), 'check step submitted').toBe(true);
  });

  test('UC-006 — specialist: reminder email', async ({ sessions }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.specialist);
    const rn = await requestNumber(page);
    const { details: d } = await openTask(page, rn);
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
    await d!.stepSend.click();
    expect(await d!.waitForSubmitted(), 'email step submitted').toBe(true);
  });

  test('UC-007 — specialist: field visit', async ({ sessions }, testInfo) => {
    test.setTimeout(25 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.specialist);
    const rn = await requestNumber(page);
    let { details: d } = await openTask(page, rn);
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

    const picked = await d!.pickVisitDateToday();
    console.log('VISIT DATE', picked);
    if (!picked.bound) {
      await b.check(false, p, { key: 'visit-date-not-bound', title: 'Visit date picked in the calendar is not captured', uc: 'UC-007 field 13', expected: 'Picked date saved with the visit', severity: 'High', defect: 'DEF-047' }, `shown "${picked.shown}", bound value ""`, [d!.visitDateInput]);
      // Work-around so the rest of the visit can be exercised.
      const iso = new Date().toISOString().slice(0, 10);
      await d!.visitDateBound.evaluate((e, v) => { (e as HTMLInputElement).value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, iso);
    }
    await d!.uploadObservation(X.attachment);
    expect(await d!.selectFindingEligible(), 'finding selected').toBe(true);
    await d!.visitDescription.fill(X.visitDescription);
    await d!.stepSend.click();
    await p.waitForTimeout(8_000);
    const after = await d!.messages();
    console.log('VISIT SUBMIT MESSAGES', after);

    await p.close();
    ({ details: d } = await openTask(page, rn));
    p = d!.page;
    const saved = { date: await d!.visitDateBound.inputValue(), desc: await d!.visitDescription.inputValue(), finding: await d!.findingEligible.isChecked() };
    console.log('SAVED VISIT', saved);
    if (!saved.date && !saved.desc) {
      await b.blocker(p, { key: 'visit-not-saved', title: 'Visit is not saved after a valid submit', uc: 'UC-007 main path', expected: 'Visit saved + history entry; task stays with the specialist', severity: 'High', defect: 'DEF-051' },
        `messages after submit: ${after.join(' | ') || 'none'}; reopened visit is empty`, [d!.visitDateInput]);
    }
    const h = await d!.history();
    expect(h.responses.some((r) => r.task === X.processType.visit) || /زيارة/.test(h.text), 'visit logged in history').toBe(true);
    expect(await d!.title(), 'task stays with the specialist at the visit step (UC-007 post-condition)').toBe(X.processType.visit);
  });
});
