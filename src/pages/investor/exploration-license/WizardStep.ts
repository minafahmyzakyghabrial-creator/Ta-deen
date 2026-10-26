import { expect, Locator, Page } from '@playwright/test';
import { AddRowDialog, DialogValues } from '@components/AddRowDialog';
import { FillResult } from '@utils/field-helper';
import { createLogger } from '@utils/logger';
import { WizardValidationError } from '@utils/validation';

export const fieldLog = createLogger('Field');
export const validationLog = createLogger('Validation');

/** Records what a step changed vs. found already filled — attached to the report. */
export interface StepReport {
  step: string;
  filled: string[];
  kept: string[];
  notes: string[];
}

/**
 * Base class of one Exploration License wizard step.
 * Steps are located by their OutSystems block names (`data-block`), which are stable,
 * language-independent and unique per section (VERIFIED on TEST, 2026-10-26).
 */
export abstract class WizardStep<TData> {
  abstract readonly name: string;
  protected report!: StepReport;

  constructor(protected readonly page: Page) {}

  protected block(name: string): Locator {
    return this.page.locator(`[data-block="${name}"]`);
  }

  /** Waits until the step's main section is rendered. */
  abstract expectLoaded(): Promise<void>;

  protected abstract fillStep(data: TData): Promise<void>;

  async fill(data: TData): Promise<StepReport> {
    this.report = { step: this.name, filled: [], kept: [], notes: [] };
    await this.expectLoaded();
    await this.fillStep(data);
    return this.report;
  }

  protected record(field: string, result: FillResult): void {
    (result === 'filled' ? this.report.filled : this.report.kept).push(field);
    fieldLog.info(`${field}: ${result === 'filled' ? 'filled' : 'already set — kept'}`);
  }

  protected note(message: string): void {
    this.report.notes.push(message);
    fieldLog.info(message);
  }

  /**
   * Adds one row through a section's "إضافة" popup, unless the section already has rows.
   * A popup that refuses the data raises the application's own message.
   */
  protected async addRowIfEmpty(section: Locator, label: string, values: DialogValues): Promise<void> {
    if ((await section.locator('tbody tr').count()) > 0) return this.record(label, 'kept');
    await section.getByRole('button', { name: /إضافة/ }).first().click();
    const dialog = new AddRowDialog(this.page);
    await dialog.waitOpen();
    await dialog.fill(values);
    const errors = await dialog.save();
    if (errors.length) {
      errors.forEach((e) => validationLog.warn(`${label}: ${e}`));
      await dialog.close();
      throw new WizardValidationError(`${this.name} › ${label}`, errors);
    }
    await expect(section.locator('tbody tr').first()).toBeVisible();
    this.record(label, 'filled');
  }
}
