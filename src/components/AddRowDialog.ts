import { expect, Locator, Page } from '@playwright/test';
import { fieldByLabel } from '@utils/field-helper';
import { inlineErrors } from '@utils/validation';
import { FeedbackMessage } from './FeedbackMessage';

/**
 * "Add" popup used by the table sections of the Exploration License wizard.
 *
 * VERIFIED on TEST (2026-10-26):
 *   - opens as `[role=dialog]`; fields are labelled ("*" marks mandatory ones);
 *   - two layouts exist:
 *       a) line-based (studies, surveys, lab analysis): an inner "إضافة" adds a line to the
 *          year's list, and the LAST "إضافة" saves the popup;
 *       b) single-form (drilling, other expenses, social plans): only one "إضافة" saves it;
 *   - saving is client-side; the table row appears and the popup closes. On a rule violation
 *     the popup stays open and shows the message inline (e.g. "الحد الادنى لعدد الحفر الماسي = 4").
 */
export type DialogValues = Readonly<Record<string, string>>;

export class AddRowDialog {
  private readonly feedback: FeedbackMessage;

  constructor(private readonly page: Page) {
    this.feedback = new FeedbackMessage(page);
  }

  get root(): Locator {
    return this.page.getByRole('dialog').last();
  }

  private get addButtons(): Locator {
    return this.root.getByRole('button', { name: 'إضافة', exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.addButtons.first()).toBeVisible();
  }

  /** Fills each labelled field; selects by option label, inputs by text. */
  async fill(values: DialogValues): Promise<void> {
    for (const [label, value] of Object.entries(values)) {
      const field = fieldByLabel(this.root, label);
      await expect(field.first(), `Popup field "${label}"`).toBeVisible();
      if ((await field.first().evaluate((el) => el.tagName)) === 'SELECT') {
        await field.first().selectOption({ label: value });
      } else {
        await field.first().fill(value);
        await field.first().blur();
      }
    }
  }

  /**
   * Saves the popup (clicking the inner "add line" first for line-based popups).
   * Returns the validation messages if the popup refused to close.
   */
  async save(): Promise<string[]> {
    const baseline = await this.feedback.count();
    if ((await this.addButtons.count()) > 1) {
      const rowsBefore = await this.root.locator('tbody tr').count();
      await this.addButtons.first().click();
      await expect
        .poll(async () => (await this.root.locator('tbody tr').count()) > rowsBefore || (await this.feedback.textsSince(baseline)).length > 0)
        .toBe(true);
    }
    await this.addButtons.last().click();
    const closed = await this.root
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (closed) return [];
    return [...(await inlineErrors(this.root)), ...(await this.feedback.textsSince(baseline))];
  }

  async close(): Promise<void> {
    await this.root.locator('[class*=close]').first().click();
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
  }
}
