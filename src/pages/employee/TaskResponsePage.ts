import { expect, Locator, Page } from '@playwright/test';
import { escapeRegExp } from '@utils/field-helper';
import { inlineErrors } from '@utils/validation';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../BasePage';

/**
 * Employee task page opened by "الرد على الطلب" —
 * /Licenses_Explorations/Request_Response?In_TaskManagementId=…&In_RequestId=<n>&In_TaskTypeId=<t>…
 *
 * VERIFIED on TEST (2026-10-26, request 76103):
 *   - tabs: ملف الشركة · تفاصيل الطلب · المخالفات و الغرامات · سجل الطلب · الرد على الطلب;
 *   - the respond tab holds the decision as a radio group (labels cover the inputs → click the
 *     label), a "الوصف" textarea (placeholder "اكتب هنا"; REQUIRED on some tasks only),
 *     optional attachments, and the buttons "إرسال الرد" / "إلغاء";
 *   - a successful "إرسال الرد" navigates this tab back to Task Management (no toast);
 *     a refused one stays and shows inline messages ("هذا الحقل مطلوب").
 */
export class TaskResponsePage extends BasePage {
  constructor(page: Page) {
    super(page, 'employee');
  }

  get respondPanel(): Locator {
    // Page-level on purpose: the respond tab nests accordions with their own tabpanels, so
    // "last visible tabpanel" can be a single table (VERIFIED trap on 76106). Other top tabs
    // are hidden, so every lookup below filters to visible elements.
    return this.page.locator('body');
  }

  private get requirementGroups(): Locator {
    return this.page
      .getByRole('radiogroup')
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('radio', { name: 'تحققت المتطلبات', exact: true, disabled: false }) });
  }

  /**
   * Checklist tasks (e.g. تقييم القدرة المالية) carry one "تحققت المتطلبات / لم تتحقق المتطلبات"
   * group per item. Marks every enabled item on the visible part as met; returns how many items.
   */
  async markAllRequirementsMet(): Promise<number> {
    const groups = this.requirementGroups;
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
      const group = groups.nth(i);
      if (await group.getByRole('radio', { name: 'تحققت المتطلبات', exact: true }).isChecked()) continue;
      await group.locator('label').filter({ hasText: /^\s*تحققت المتطلبات\s*$/ }).first().click();
      await expect(group.getByRole('radio', { name: 'تحققت المتطلبات', exact: true })).toBeChecked();
    }
    return count;
  }

  /**
   * Some tasks (مهمة تقييم المتطلبات الفنية, 4 parts) are a wizard inside the respond tab:
   * arrows a[id$="-Next2"] / a[id$="-Previous2"]; "إرسال الرد" appears only on the last part.
   */
  async isPartWizard(): Promise<boolean> {
    return this.partNext.isVisible();
  }

  /** Part arrow: -Next2 (exploration) or -Next (public projects "تقييم القدرة الفنية", VERIFIED on TEST 76900). */
  private get partNext(): Locator {
    return this.page.locator('a[id$="-Next2"], a[id$="-Next"]').filter({ visible: true }).first();
  }

  get submitButton(): Locator {
    return this.page.getByRole('button', { name: 'إرسال الرد', exact: true });
  }

  /** Marks every part's items as met, moving on until the submit button shows. Returns items per part. */
  async completePartWizard(maxParts = 10): Promise<number[]> {
    const perPart: number[] = [];
    for (let part = 1; part <= maxParts; part++) {
      perPart.push(await this.markAllRequirementsMet());
      if (await this.submitButton.isVisible()) return perPart;
      const activity = trackServerActivity(this.page);
      await this.partNext.click();
      await activity.idle();
    }
    throw new Error(`The assessment wizard did not reach its submit button within ${maxParts} parts.`);
  }

  /** Exploration: /Request_Response; public projects: /Request_PublicProjects_Response (VERIFIED on TEST 76900). */
  async expectLoaded(requestNumber: string): Promise<void> {
    await this.page.waitForURL(new RegExp(`Request(_PublicProjects)?_Response\\?.*In_RequestId=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.page.getByRole('tab', { name: 'الرد على الطلب' })).toBeVisible({ timeout: 60_000 });
  }

  /** Task type id from the URL (e.g. 169 = GIS, 140 = GIS review) — logged for traceability. */
  taskTypeId(): string {
    return new URL(this.page.url()).searchParams.get('In_TaskTypeId') ?? '?';
  }

  async openRespondTab(): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.getByRole('tab', { name: 'الرد على الطلب' }).click();
    // Either the submit button (single-page task) or the part-wizard arrows show once it rendered.
    await expect(this.submitButton.or(this.page.locator('a[id$="-Next2"], a[id$="-Next"]')).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
    await activity.idle();
  }

  /**
   * Enabled, visible decision options (read-only groups showing an earlier decision are skipped).
   * The radios can render after "إرسال الرد" (تقييم الامتثال الفني showed none on the first read,
   * TEST 76659), so this waits up to `timeout` for at least one before returning an empty list.
   */
  async decisions(timeout = 20_000): Promise<string[]> {
    const read = async () => {
      const labels = await this.page
        .getByRole('radio', { disabled: false })
        .filter({ visible: true })
        .evaluateAll((radios) => radios.map((r) => (r as HTMLInputElement).labels?.[0]?.innerText.trim() ?? ''));
      return [...new Set(labels.filter(Boolean))];
    };
    let options: string[] = [];
    await expect
      .poll(async () => (options = await read()).length, { timeout, intervals: [500] })
      .toBeGreaterThan(0)
      .catch(() => undefined);
    return options;
  }

  async choose(decision: string): Promise<void> {
    const group = this.page
      .getByRole('radiogroup')
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('radio', { name: decision, exact: true, disabled: false }) })
      .first();
    const radio = group.getByRole('radio', { name: decision, exact: true });
    if (await radio.isChecked()) return;
    await group.locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(decision)}\\s*$`) }).first().click();
    await expect(radio).toBeChecked();
  }

  /** A required multi-select such as "الجهات الحكومية" — returns its label if present. */
  async requiredMultiSelect(): Promise<Locator | undefined> {
    const select = this.page.getByRole('combobox', { name: 'Select one or more options' }).filter({ visible: true });
    return (await select.count()) ? select.first() : undefined;
  }

  /** The checkbox labelled by `text` (e.g. "الأرض بحاجة إلى الموافقات الحكومية"); unchecks it only if checked. */
  async ensureUnchecked(text: string | RegExp): Promise<'unchecked' | 'was unchecked' | 'not present'> {
    const pattern = typeof text === 'string' ? text : text.source;
    // The label text sits in a sibling container, so match the closest ancestor that contains it.
    const boxes = this.respondPanel.getByRole('checkbox').filter({ visible: true });
    for (let i = 0; i < (await boxes.count()); i++) {
      const box = boxes.nth(i);
      const labelled = await box.evaluate((el, src) => {
        const re = new RegExp(src);
        for (let n = el.parentElement, k = 0; n && k < 4; n = n.parentElement, k++) if (re.test(n.innerText ?? '')) return true;
        return false;
      }, pattern);
      if (!labelled) continue;
      if (!(await box.isChecked())) return 'was unchecked';
      await box.uncheck();
      await expect(box).not.toBeChecked();
      return 'unchecked';
    }
    return 'not present';
  }

  /** Fills the employee description if the field is present and empty. */
  async fillDescriptionIfEmpty(text: string): Promise<boolean> {
    const field = this.respondPanel.getByRole('textbox', { name: 'اكتب هنا' }).filter({ visible: true });
    if ((await field.count()) === 0 || (await field.first().inputValue()).trim()) return false;
    await field.first().fill(text);
    return true;
  }

  /** "إرسال الرد": resolves [] when the page returns to Task Management, else the inline errors. */
  /**
   * "تقييم الامتثال الفني" (type 282) — VERIFIED on TEST 2026-11-03 (request 76659): the old ممتثل / غير ممتثل
   * radios were replaced by two required tables, each filled through an "إضافة" popup with one block per
   * requirement ([id$=-NoOutstandingFinancialObligations]):
   *   المتطلبات الإلزامية لتقييم الامتثال … → select التقييم [id$=-Assessment]: "0" | the weight (e.g. 11);
   *                                          optional ملاحظات textarea (since 2026-11-05, left empty)
   *   متطلبات تقييم الامتثال …            → radios برنامج العمل نعم/لا + text التقييم [id$=-Input_AssessmentWeight]
   * "التوصية" below is read-only (calculated). Closing a popup asks "هل تريد إغلاق النافذة دون حفظ؟".
   */
  private static readonly COMPLIANCE_SECTIONS = [/^\s*المتطلبات الإلزامية لتقييم الامتثال/, /^\s*متطلبات تقييم الامتثال/];

  private complianceSection(title: RegExp): Locator {
    return this.page.locator('form').filter({ has: this.page.locator('span', { hasText: title }) }).filter({ visible: true }).first();
  }

  async isComplianceAssessment(): Promise<boolean> {
    return this.complianceSection(TaskResponsePage.COMPLIANCE_SECTIONS[0]).isVisible();
  }

  /** Adds both compliance tables with full marks on every requirement. Returns the requirements rated per table. */
  async completeComplianceAssessment(): Promise<number[]> {
    const rated: number[] = [];
    for (const title of TaskResponsePage.COMPLIANCE_SECTIONS) {
      const section = this.complianceSection(title);
      if ((await section.locator('tbody tr').count()) > 0) {
        rated.push(0);
        continue;
      }
      await section.getByRole('button', { name: 'إضافة', exact: true }).click();
      const dialog = this.page.getByRole('dialog').filter({ visible: true }).last();
      const items = dialog.locator('[id$="-NoOutstandingFinancialObligations"]');
      await expect(items.first()).toBeVisible({ timeout: 30_000 });
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        const select = item.locator('select[id$="-Assessment"]');
        if (await select.count()) {
          // Options are "الرجاء الاختيار", "0" and the full weight — take the highest number.
          const values = await select.locator('option').allInnerTexts();
          const best = values.map((v) => v.trim()).filter((v) => /^\d+(\.\d+)?$/.test(v)).sort((a, b) => Number(b) - Number(a))[0];
          await select.selectOption({ label: best });
        }
        const yes = item.getByRole('radio', { name: 'نعم', exact: true });
        if (await yes.count()) {
          await item.locator('label').filter({ hasText: /^\s*نعم\s*$/ }).first().click();
          await expect(yes).toBeChecked();
        }
        const rating = item.locator('input[id$="-Input_AssessmentWeight"]');
        if (await rating.count()) await rating.fill(await item.locator('input[id$="-OriginalWeight"]').inputValue());
      }
      const activity = trackServerActivity(this.page);
      // The popup's save button was "إضافة" until TEST 2026-11-05, then "حفظ".
      await dialog.getByRole('button', { name: /^\s*(حفظ|إضافة)\s*$/ }).click();
      await expect(dialog, `"${title.source}" popup did not save — ${(await inlineErrors(dialog)).join(' | ')}`).toBeHidden({ timeout: 30_000 });
      await activity.idle();
      rated.push(count);
    }
    return rated;
  }

  async submit(): Promise<string[]> {
    const errorToasts = this.feedback.of('error').filter({ visible: true });
    const before = await errorToasts.count();
    await this.page.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
    // Most tasks return to the task list. تقييم الامتثال الفني (TEST 2026-11-03) may first ask "تأكيد البيانات قبل
    // الإرسال" (nothing is sent until "تأكيد الإرسال"), then stays on the page with "تم حفظ التقييم بنجاح".
    const confirm = this.page.getByRole('button', { name: 'تأكيد الإرسال', exact: true });
    const saved = this.page.getByText('تم حفظ التقييم بنجاح', { exact: true });
    let outcome = 'pending' as 'pending' | 'done';
    await expect
      .poll(
        async () => {
          if (new URL(this.page.url()).pathname.endsWith('/TaskManagement') || (await saved.isVisible())) return (outcome = 'done');
          if (await confirm.isVisible()) await confirm.click();
          return outcome;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBe('done')
      .catch(() => undefined);
    if (outcome === 'done') return [];
    const toasts = (await errorToasts.allInnerTexts()).slice(before).map((t) => t.trim());
    const errors = [...(await inlineErrors(this.respondPanel)), ...toasts];
    return errors.length ? errors : ['"إرسال الرد" did not complete and no message was shown.'];
  }
}
