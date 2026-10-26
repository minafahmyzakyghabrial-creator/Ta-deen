import { Locator } from '@playwright/test';

/**
 * Validation reporting.
 *
 * The wizard reports problems in two places (VERIFIED on TEST):
 *   - an error toast listing every failed rule of the step, separated by "-" or "|";
 *   - inline messages under fields (`.validation-message`), refreshed only on Next / save.
 */

/** Visible inline validation messages inside a scope. */
export async function inlineErrors(scope: Locator): Promise<string[]> {
  return scope
    .locator('.validation-message, span[class*="validation"]')
    .filter({ visible: true })
    .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? '').filter(Boolean));
}

/** Splits a toast like "- rule A- rule B" or "rule A | rule B |" into individual rules. */
export function splitRules(toasts: readonly string[]): string[] {
  return toasts
    .flatMap((t) => t.split(/\s*[|-]\s*/))
    .map((r) => r.trim())
    .filter(Boolean);
}

/** Thrown when the application refuses to move on — carries the app's own reasons. */
export class WizardValidationError extends Error {
  constructor(
    readonly step: string,
    readonly rules: string[],
  ) {
    super(
      `The application refused to continue at "${step}". Reasons reported by the app:\n` +
        rules.map((r) => `   - ${r}`).join('\n'),
    );
    this.name = 'WizardValidationError';
  }
}
