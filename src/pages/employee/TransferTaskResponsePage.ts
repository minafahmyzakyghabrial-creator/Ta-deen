import { expect, Response } from '@playwright/test';
import { Wizard } from '@components/Wizard';
import { escapeRegExp } from '@utils/field-helper';
import { inlineErrors } from '@utils/validation';
import { trackServerActivity } from '@utils/os-waits';
import { EmployeeTask, TaskManagementPage } from './TaskManagementPage';
import { TaskResponsePage } from './TaskResponsePage';

/**
 * Employee task page of the Exploration License TRANSFER service, opened by "الرد على الطلب" in Task Management —
 * /Licenses_Exploration_Transfer/ExplorationTransferReview?LicenseRequest_Id=<n>&Is_View=false&TaskId=<t>&ProcessTypeId=<p>.
 *
 * VERIFIED on TEST (2026-10-30, request 76352): same layout as the issuance task page (tabs ملف الشركة ·
 * تفاصيل الطلب · المخالفات و الغرامات · سجل الطلب · respond), but the respond tab is spelled
 * "الرد علي الطلب" (ي, not ى). Decisions, description and "إرسال الرد" are handled by TaskResponsePage.
 */
export class TransferTaskResponsePage extends TaskResponsePage {
  private get respondTab() {
    return this.page.getByRole('tab', { name: /^الرد عل[يى] الطلب$/ });
  }

  override async expectLoaded(requestNumber: string): Promise<void> {
    await this.page.waitForURL(new RegExp(`ExplorationTransferReview\\?.*LicenseRequest_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.respondTab).toBeVisible({ timeout: 60_000 });
  }

  /** ProcessTypeId from the URL — logged for traceability. */
  override taskTypeId(): string {
    return new URL(this.page.url()).searchParams.get('ProcessTypeId') ?? '?';
  }

  /**
   * Chooses `decision` in EVERY enabled group that offers it — "مهمة الرقابة" / technical compliance carry one
   * "ممتثل / غير ممتثل" group for the transferor and one for the transferee (VERIFIED on TEST). Returns the count.
   */
  async chooseInEveryGroup(decision: string): Promise<number> {
    const groups = this.page
      .getByRole('radiogroup')
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('radio', { name: decision, exact: true, disabled: false }) });
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
      const radio = groups.nth(i).getByRole('radio', { name: decision, exact: true });
      if (await radio.isChecked()) continue;
      await groups.nth(i).locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(decision)}\\s*$`) }).first().click();
      await expect(radio).toBeChecked();
    }
    return count;
  }

  /**
   * "إرسال الرد" as in TaskResponsePage, but transfer tasks can take well over 30 s to save and return to Task
   * Management (VERIFIED on TEST: "تقييم القدرة المالية" completed after the 30 s window), so this waits 120 s.
   */
  override async submit(): Promise<string[]> {
    const errorToasts = this.feedback.of('error').filter({ visible: true });
    const before = await errorToasts.count();
    // Server calls made while the submit is pending — evidence when it never completes.
    this.submitCalls = [];
    const onResponse = async (r: Response) => {
      if (!r.url().includes('/screenservices/')) return;
      const body = await r.text().catch(() => '');
      const failed = r.status() >= 400 || /"exception"|"Is_Success":false|errorMessage/i.test(body);
      this.submitCalls.push(`${r.status()} ${r.url().split('/').pop()}${failed ? ` — ${body.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
    };
    const onFailed = (r: { url(): string; failure(): { errorText: string } | null }) => {
      if (r.url().includes('/screenservices/')) this.submitCalls.push(`FAILED ${r.url().split('/').pop()} — ${r.failure()?.errorText ?? ''}`);
    };
    this.page.on('response', onResponse);
    this.page.on('requestfailed', onFailed);
    try {
      // A centred Virtual-Select list can stay drawn over the button (see TransfereeLicenseInfoStep) — then press it
      // with the keyboard, as a user would.
      const clicked = await this.finalButton.click({ timeout: 10_000 }).then(() => true, () => false);
      if (!clicked) {
        await this.finalButton.focus();
        await this.page.keyboard.press('Enter');
      }
      const left = await this.page
        .waitForURL((u) => u.pathname.endsWith('/TaskManagement'), { timeout: 120_000 })
        .then(() => true)
        .catch(() => false);
      if (left) return [];
    } finally {
      this.page.off('response', onResponse);
      this.page.off('requestfailed', onFailed);
    }
    const toasts = (await errorToasts.allInnerTexts()).slice(before).map((t) => t.trim());
    // The mandatory-fields refusal is a feedback message that may not carry the error style (VERIFIED on 76386).
    const feedback = (await this.page.locator('#feedbackMessageContainer').filter({ visible: true }).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const errors = [...new Set([...(await inlineErrors(this.respondPanel)), ...toasts, ...feedback])];
    if (errors.length) return errors;
    return [
      '"إرسال الرد" did not complete within 120 s and no message was shown.',
      `Server calls after the click: ${this.submitCalls.length ? this.submitCalls.join(' | ') : 'NONE (the click sent nothing to the server)'}`,
    ];
  }

  /** Employee-response comments written by completeSectionWizard (their steps leave the DOM after Next). */
  wizardComments = 0;

  /** Screen-service calls observed during the last submit() (see submit). */
  submitCalls: string[] = [];

  /**
   * Writes `comment` into the first `limit` empty, editable description fields of the respond tab (placeholder
   * "اكتب هنا…", e.g. "الوصف" / "إفادة الموظف"). Read-only fields, popups and condition clauses are skipped.
   * Returns how many fields were written.
   * ⚠ VERIFIED on TEST (request 76358): with a comment in BOTH party descriptions of "مهمة الرقابة", "إرسال الرد"
   * never completed (no message, task stayed open); with the first one only it completes — so callers pass limit 1.
   */
  async commentEverywhere(comment: string, limit = Number.POSITIVE_INFINITY): Promise<number> {
    // Any editable response textarea — some have the "اكتب هنا" placeholder, others none (e.g. "إفادة الموظف"
    // [id$=TextArea_Description] on المراجعة العامة). Clause, Not-Met and transferee-data textareas are not comments.
    const notComment = '[id$="TextArea_Clause"], [id$="TextArea_TermsConditions"], [id$="TextArea_Evaluation_Comment"], [id$="TextArea_TransferJustifications"]';
    const fields = this.page
      .locator('textarea')
      .filter({ visible: true })
      .and(this.page.locator(`:not([disabled]):not([readonly]):not(${notComment.replace(/, /g, '):not(')})`));
    let written = 0;
    for (let i = 0; i < (await fields.count()) && written < limit; i++) {
      const field = fields.nth(i);
      if (await field.evaluate((el) => !!el.closest('[role=dialog], [id$="FormPopUp"]'))) continue;
      if ((await field.inputValue()).trim()) continue;
      await field.fill(comment);
      written++;
    }
    return written;
  }

  /**
   * Text of the "سجل الطلب" (request history) tab — every task page has it (service documentation §10). Call it
   * before openRespondTab(), which switches back to the response.
   * VERIFIED on TEST (2026-11-01, request 76386): block RequestHistory.RequestHistory holds two COLLAPSED accordions,
   * "سجل الأحداث" and "سجل الردود" — their content is only rendered once expanded.
   */
  async requestHistory(): Promise<string> {
    const tab = this.page.getByRole('tab', { name: 'سجل الطلب', exact: true });
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
      const activity = trackServerActivity(this.page);
      await tab.click();
      await activity.idle();
    }
    const history = this.page.locator('[data-block="RequestHistory.RequestHistory"]').filter({ visible: true }).first();
    await history.waitFor({ timeout: 30_000 });
    const closed = history.locator('.osui-accordion-item__title[aria-expanded="false"]');
    for (let guard = 0; guard < 5 && (await closed.count()) > 0; guard++) {
      const activity = trackServerActivity(this.page);
      await closed.first().click();
      await activity.idle();
    }
    return history.innerText();
  }

  /**
   * "سجل الردود" of the request history, newest first: one entry per employee response — VERIFIED on TEST (76386):
   * "رد <task>" · decision · user · date · time · "إفادة الموظف" · comment (empty when none was written).
   * Consolidated "إعادة للمحال إليه" is listed as "معاد للمستثمر".
   */
  async responseLog(): Promise<{ task: string; decision: string; comment: string }[]> {
    const text = await this.requestHistory();
    const lines = text.slice(text.indexOf('سجل الردود') + 'سجل الردود'.length).split('\n').map((l) => l.trim()).filter(Boolean);
    const entries: { task: string; decision: string; comment: string }[] = [];
    lines.forEach((line, i) => {
      if (line.startsWith('رد ')) entries.push({ task: line.slice(3).trim(), decision: lines[i + 1] ?? '', comment: '' });
      else if (line === 'إفادة الموظف' && entries.length && lines[i + 1] && !lines[i + 1].startsWith('رد ')) entries.at(-1)!.comment = lines[i + 1];
    });
    return entries;
  }

  /**
   * Returns the request to the previous employee on a review / approval task: chooses `decision` (e.g. "إعادة للموظف
   * السابق", "إعادة لموظف موافقة مستوى الأول") and writes `description` into the first empty editable description —
   * mandatory on a return (documentation §7.1, §9.1, §10). Throws when no description field is shown.
   */
  async returnWithDescription(decision: string, description: string): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    const radio = this.page.getByRole('radio', { name: decision, exact: true, disabled: false }).filter({ visible: true }).first();
    // A choice made before the page's data load settles is reset (VERIFIED on "المراجعة العامة") — re-check it.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.choose(decision);
      await this.page.waitForTimeout(2_000);
      if (await radio.isChecked()) break;
    }
    await expect(radio).toBeChecked();
    const written = await this.commentEverywhere(description, 1);
    if (!written) throw new Error(`"${decision}": no empty description field to write the mandatory return description into.`);
  }

  /**
   * Consolidated Feedback "إعادة للمحال إليه" with "طلب بيانات إضافية" (TP-16316) — VERIFIED on TEST (2026-11-01, 76386):
   * with every section Met, the radio ticks [id$=additinal] itself and locks it (documentation: "special behavior when
   * all branches Met"). Revealed: "وصف المعلومات الإضافية" [id$=TextArea_AdditionalDescription] (≤ 2,000), "اسم المرفق"
   * [id$=AttachmentName_Input] (≤ 100) + "اضافة +" adding a row to the table "اسم المرفق / الإجراء", and "إفادة الموظف"
   * [id$=TextArea_Description] (≤ 2,000). Each requested name must then be listed in the table.
   */
  async returnForAdditionalInfo(info: { description: string; attachmentNames: readonly string[]; employeeDescription: string }): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    const radio = this.page.getByRole('radio', { name: 'إعادة للمحال إليه', exact: true, disabled: false }).first();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.choose('إعادة للمحال إليه');
      await this.page.waitForTimeout(2_000);
      if (await radio.isChecked()) break;
    }
    await expect(radio).toBeChecked();
    const additional = this.page.locator('input[type=checkbox][id$="additinal"]');
    if (!(await additional.isChecked())) await additional.check();
    await expect(additional, '"طلب بيانات إضافية" ticked').toBeChecked();
    await this.page.locator('textarea[id$="TextArea_AdditionalDescription"]').fill(info.description);
    const name = this.page.locator('input[id$="AttachmentName_Input"]');
    for (const attachment of info.attachmentNames) {
      await name.fill(attachment);
      // Matched by visible text: the button's accessible name is not "اضافة +" (an icon is part of it).
      await this.page.locator('button').filter({ hasText: /اضافة/ }).filter({ visible: true }).first().click();
      // The table is an ARIA grid (VERIFIED on 76386): rows hold gridcells, not cells.
      await expect(this.page.getByRole('gridcell', { name: attachment, exact: true }).first(), `Requested attachment "${attachment}" listed`).toBeVisible();
    }
    await this.page.locator('textarea[id$="TextArea_Description"]').filter({ visible: true }).first().fill(info.employeeDescription);
  }

  /**
   * A task the request was RETURNED to shows the returning employee's description ("أدناه هو رد موظف …") and a
   * MANDATORY "رد الموظف" [id$=TextArea_EmployeeResponse] (≤ 2,000) — VERIFIED on TEST (76386, "الامتثال الفني" after
   * "المراجعة العامة" returned it): left empty, "إرسال الرد" is refused client-side with "يجب تعبئة جميع الحقول الإلزامية
   * بشكل صحيح للإنتقال للتالي" and nothing reaches the server. Fills every empty one; returns how many.
   * Not the BUG-001 trigger (that is the party "الوصف" remarks of inspection / compliance).
   */
  async fillEmployeeResponse(text: string): Promise<number> {
    const fields = this.page.locator('textarea[id$="TextArea_EmployeeResponse"]:not([disabled]):not([readonly])').filter({ visible: true });
    let filled = 0;
    for (let i = 0; i < (await fields.count()); i++) {
      if ((await fields.nth(i).inputValue()).trim()) continue;
      await fields.nth(i).fill(text);
      filled++;
    }
    return filled;
  }

  /** Submit of a single-page task ("إرسال الرد") or of the last section-wizard step ("إرسال الرد" / "إرسال"). */
  private get finalButton() {
    return this.page.getByRole('button', { name: /^\s*إرسال( الرد)?\s*$/ }).filter({ visible: true }).first();
  }

  override async openRespondTab(): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.respondTab.click();
    const ready = this.submitButton.or(this.page.locator('a[id$="-Next2"]')).or(this.sectionWizard.nextButton);
    await expect(ready.first()).toBeVisible({ timeout: 60_000 });
    await activity.idle();
  }

  private get sectionWizard(): Wizard {
    return new Wizard(this.page);
  }

  /**
   * "تقييم القدرة الفنية" (technical assessment, TP-16309) is a 3-step wizard inside the respond tab — VERIFIED on TEST
   * (request 76352): 1 تقييم خطة العمل والانفاق · 2 تقييم خطة الأثر الإجتماعي · 3 مرفقات إضافية; every section has a
   * "تحققت المتطلبات / لم تتحقق المتطلبات" group (Evaluation.Evaluation_Section_Block); footer "حفظ وإغلاق" / "التالي".
   */
  async isSectionWizard(): Promise<boolean> {
    return (await this.sectionWizard.nextButton.filter({ visible: true }).count()) > 0;
  }

  /**
   * Rates every section of every step. `onStep` runs on each step BEFORE the remaining groups are marked met,
   * so a caller can rate one section "لم تتحقق المتطلبات" (rework). Stops on the last step; returns items per step.
   */
  async completeSectionWizard(onStep?: (step: string) => Promise<void>, comment?: string): Promise<{ step: string; items: number }[]> {
    const wizard = this.sectionWizard;
    const done: { step: string; items: number }[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const step = await wizard.activeName();
      if (onStep) await onStep(step);
      done.push({ step, items: await this.markAllUnratedMet() });
      // Reassessment after a return shows a MANDATORY employee response [id$=TextArea_EmployeeResponse] (≤ 2,000) —
      // empty, Next is refused with "يجب تعبئة جميع الحقول الإلزامية…" (VERIFIED on TEST, request 76362).
      const response = this.page.locator('textarea[id$="TextArea_EmployeeResponse"]').filter({ visible: true });
      for (let i = 0; i < (await response.count()); i++) {
        if ((await response.nth(i).inputValue()).trim()) continue;
        await response.nth(i).fill(comment ?? 'تمت المراجعة');
        this.wizardComments++;
      }
      if ((await wizard.activeIndex()) === (await wizard.stepNames()).length - 1) return done;
      const change = await wizard.next();
      if (!change.moved) throw new Error(`Technical assessment step "${change.from}" was refused: ${change.errors.join(' | ')}`);
    }
    throw new Error('The technical assessment wizard did not reach its last step.');
  }

  /**
   * Rates the first unrated section of the current step "لم تتحقق المتطلبات" and fills its mandatory comment
   * [id$=TextArea_Evaluation_Comment] (≤ 5,000; VERIFIED on TEST, request 76362 — without it Next is blocked silently).
   */
  async rateNotMet(description: string): Promise<void> {
    const group = this.page
      .getByRole('radiogroup')
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('radio', { name: 'لم تتحقق المتطلبات', exact: true, disabled: false }) })
      .first();
    const id = await group.getAttribute('id');
    if (id) this.notMetThisAnswer.add(id);
    if (!(await group.getByRole('radio', { name: 'لم تتحقق المتطلبات', exact: true }).isChecked())) {
      await group.locator('label').filter({ hasText: /^\s*لم تتحقق المتطلبات\s*$/ }).first().click();
    }
    await expect(group.getByRole('radio', { name: 'لم تتحقق المتطلبات', exact: true })).toBeChecked();
    // Technical sections use [id$=TextArea_Evaluation_Comment]; other checklists (financial) may use another box —
    // then the first empty editable textarea next to the group is used.
    const comment = this.page.locator('textarea[id$="TextArea_Evaluation_Comment"]').filter({ visible: true }).first();
    if (await comment.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await comment.fill(description);
      return;
    }
    const near = group.locator('xpath=ancestor::*[.//textarea][1]').locator('textarea:not([disabled]):not([readonly])').filter({ visible: true }).first();
    await expect(near, 'Not-Met comment box').toBeVisible();
    await near.fill(description);
  }

  /**
   * Consolidated Feedback "إعادة للموظف السابق" — VERIFIED on TEST (request 76362): after the page has settled (a
   * choice made earlier is reset by its data load), the radio reveals a multi-select "أختر" (centred Virtual-Select:
   * تقييم القدرة المالية · تقييم القدرة الفنية · الامتثال الفني) and the description [id$=TextArea_Description] (≤ 2,000).
   */
  async returnToPreviousEmployee(branches: readonly string[], description: string): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.choose('إعادة للموظف السابق');
      await this.page.waitForTimeout(2_000); // let a late data load reset it if it is going to
      if (await this.page.getByRole('radio', { name: 'إعادة للموظف السابق', exact: true }).isChecked()) break;
    }
    await expect(this.page.getByRole('radio', { name: 'إعادة للموظف السابق', exact: true })).toBeChecked();
    const combo = this.page.getByRole('combobox', { name: 'Select one or more options' }).filter({ visible: true }).first();
    const openList = this.page.locator('.vscomp-dropbox-wrapper.popup-position-center:not(.closed)');
    for (let attempt = 1; attempt <= 5 && (await openList.count()) === 0; attempt++) {
      await combo.click();
      await openList.first().waitFor({ timeout: 3_000 }).catch(() => undefined);
    }
    for (const branch of branches) {
      const option = openList.locator('.vscomp-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(branch)}\\s*$`) });
      if ((await option.count()) === 0) {
        throw new Error(`Branch "${branch}" is not offered. Offered: ${(await openList.locator('.vscomp-option').allInnerTexts()).join(' | ')}`);
      }
      if (!((await option.first().getAttribute('class')) ?? '').includes('selected')) await option.first().click();
    }
    await this.page.keyboard.press('Escape').catch(() => undefined);
    for (const branch of branches) await expect(combo, `Branch "${branch}" selected`).toContainText(branch);
    await this.page.locator('textarea[id$="TextArea_Description"]').filter({ visible: true }).first().fill(description);
  }

  /** Marks "تحققت المتطلبات" in every visible group that has no rating yet (keeps a deliberate "Not Met"). */
  /** GIS task: "إضافة" [id$=AddFTermsConditions]; Inspection & GIS Evaluation: "إضافة" [id$=-Add] in its block. */
  private get clauseButton() {
    return this.page
      .locator('button[id$="AddFTermsConditions"]')
      .or(this.page.locator('[data-block="EmployeeTasks_Flow.InspectionAndGISEvaluation"] button[id$="-Add"]'))
      .filter({ visible: true })
      .first();
  }

  /** True when the respond tab offers a condition-clause button (shown after choosing "أرض مشروطة"). */
  async hasConditionClauses(): Promise<boolean> {
    return this.clauseButton.isVisible();
  }

  /**
   * Conditioned land — at least one clause (VERIFIED on TEST, request 76354; limits per the service documentation):
   *   GIS task (TP-17056, ≤ 5,000): popup [id$=FormPopUp] "الشروط والأحكام" — textarea [id$=TextArea_TermsConditions],
   *     inner "إضافة" [id$=PopUpAddButton] adds the clause to the list, "حفظ" [id$=PopUpSaveButton] saves;
   *   Inspection & GIS Evaluation (TP-16304, ≤ 2,000): dialog "إضافة الشروط والأحكام" ("…إضافة البيانات إلى الجدول قبل
   *     الحفظ") — textarea "البند" [id$=TextArea_Clause] (0/5000), "إضافة" [id$=-Add2]; "حفظ" when the dialog shows it.
   * Each clause must then be shown on the task.
   */
  async addConditionClauses(clauses: readonly string[]): Promise<void> {
    if (!clauses.length) throw new Error('Conditioned land needs at least one condition clause (gisClauses).');
    await this.clauseButton.click();
    const popup = this.page.locator('[id$="FormPopUp"]').or(this.page.getByRole('dialog')).filter({ visible: true }).last();
    await expect(popup).toBeVisible();
    const text = popup.locator('textarea[id$="TextArea_TermsConditions"], textarea[id$="TextArea_Clause"]').first();
    const add = popup.locator('button[id$="PopUpAddButton"], button[id$="-Add2"]').first();
    for (const clause of clauses) {
      await text.fill(clause);
      await add.click();
      await expect(popup.getByText(clause, { exact: false }).first(), `Clause added to the popup list: ${clause}`).toBeVisible();
    }
    const save = popup.locator('button[id$="PopUpSaveButton"]').or(popup.getByRole('button', { name: 'حفظ', exact: true })).first();
    if (await save.isVisible()) await save.click();
    await expect(popup).toBeHidden();
    for (const clause of clauses) {
      await expect(this.page.getByText(clause, { exact: false }).filter({ visible: true }).first(), `Clause shown on the task: ${clause}`).toBeVisible();
    }
  }

  async markAllUnratedMet(): Promise<number> {
    const groups = this.page
      .getByRole('radiogroup')
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('radio', { name: 'تحققت المتطلبات', exact: true, disabled: false }) });
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
      const group = groups.nth(i);
      if (await group.getByRole('radio', { name: 'تحققت المتطلبات', exact: true }).isChecked()) continue;
      // A "Not Met" set deliberately in THIS answer is kept. A "Not Met" carried over from an earlier round
      // (reassessment pre-selects the previous rating — VERIFIED on TEST, request 76362) is changed to Met:
      // Consolidated Feedback only enables "توصية بالقبول" when every section is Met.
      const id = await group.getAttribute('id');
      if (id && this.notMetThisAnswer.has(id)) continue;
      await group.locator('label').filter({ hasText: /^\s*تحققت المتطلبات\s*$/ }).first().click();
      await expect(group.getByRole('radio', { name: 'تحققت المتطلبات', exact: true })).toBeChecked();
    }
    // Proof, not a count: every section of this step is now Met unless deliberately rated Not Met.
    const notMet = await groups.evaluateAll((gs, keep) => gs.filter((g) => !keep.includes(g.id) && !(g.querySelector('input[type=radio]:checked') as HTMLInputElement | null)?.labels?.[0]?.innerText.includes('تحققت')).length, [...this.notMetThisAnswer]);
    expect(notMet, 'Every section of this step is rated "تحققت المتطلبات"').toBe(0);
    return count;
  }

  /** Radio groups rated "لم تتحقق المتطلبات" deliberately in the current answer (rateNotMet). */
  private readonly notMetThisAnswer = new Set<string>();
}

/** Task Management for transfer requests: identical, except tasks open in TransferTaskResponsePage. */
export class TransferTaskManagementPage extends TaskManagementPage {
  override async openResponse(task: EmployeeTask): Promise<TransferTaskResponsePage> {
    const popup = this.page.context().waitForEvent('page', { timeout: 60_000 });
    await this.menu(task).click('الرد على الطلب');
    const response = new TransferTaskResponsePage(await popup);
    await response.expectLoaded(task.requestNumber);
    return response;
  }

  /** "الرد على الطلب (للقراءة فقط)" — the task page in view mode (Is_View=true), offered on open and closed tasks. */
  async openReadOnly(task: EmployeeTask): Promise<TransferTaskResponsePage> {
    const popup = this.page.context().waitForEvent('page', { timeout: 60_000 });
    await this.menu(task).click('الرد على الطلب (للقراءة فقط)');
    const response = new TransferTaskResponsePage(await popup);
    await response.expectLoaded(task.requestNumber);
    return response;
  }
}
