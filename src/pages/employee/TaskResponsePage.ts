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
    return this.page.locator('a[id$="-Next2"]').isVisible();
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
      await this.page.locator('a[id$="-Next2"]').click();
      await activity.idle();
    }
    throw new Error(`The assessment wizard did not reach its submit button within ${maxParts} parts.`);
  }

  async expectLoaded(requestNumber: string): Promise<void> {
    await this.page.waitForURL(new RegExp(`Request_Response\\?.*In_RequestId=${requestNumber}(&|$)`), { timeout: 60_000 });
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
    await expect(this.submitButton.or(this.page.locator('a[id$="-Next2"]')).first()).toBeVisible({ timeout: 60_000 });
    await activity.idle();
  }

  /** Enabled, visible decision options (read-only groups showing an earlier decision are skipped). */
  async decisions(): Promise<string[]> {
    const labels = await this.page
      .getByRole('radio', { disabled: false })
      .filter({ visible: true })
      .evaluateAll((radios) => radios.map((r) => (r as HTMLInputElement).labels?.[0]?.innerText.trim() ?? ''));
    return [...new Set(labels.filter(Boolean))];
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
  async submit(): Promise<string[]> {
    const errorToasts = this.feedback.of('error').filter({ visible: true });
    const before = await errorToasts.count();
    await this.page.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
    const left = await this.page
      .waitForURL((u) => u.pathname.endsWith('/TaskManagement'), { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (left) return [];
    const toasts = (await errorToasts.allInnerTexts()).slice(before).map((t) => t.trim());
    const errors = [...(await inlineErrors(this.respondPanel)), ...toasts];
    return errors.length ? errors : ['"إرسال الرد" did not complete and no message was shown.'];
  }
}
