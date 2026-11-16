import path from 'path';
import { expect, Locator } from '@playwright/test';
import { createLogger } from './logger';
import { trackServerActivity } from './os-waits';

const log = createLogger('AutoFill');

/**
 * Fills every EMPTY visible control of a form section with plausible test values — for long screens where
 * almost every field is mandatory and any valid value will do (small-mining feasibility / impact studies).
 * Fields that are already filled are never touched, so a resumed draft keeps its data.
 *
 *   - text / number inputs and textareas: `values[<id suffix>]` when given, else a number for number-like
 *     fields (type=number, or an id that reads like a quantity) and `text` otherwise; a text written into a
 *     numbers-only input is stripped by the app, so an input that is still empty gets the number instead;
 *   - <select>: the first real option (index 1) when the placeholder ("اختر" …) is selected;
 *   - radio groups with nothing checked: the first option (through its label — the input is covered);
 *   - unchecked checkboxes: ticked (declarations);
 *   - attachment slots (input[type=file]): `attachment` uploaded one by one (each upload removes its input).
 *
 * Several passes, because a filled control can reveal more (a radio, a checkbox, a year that adds rows).
 */
export interface AutoFillOptions {
  /** Value per element-id suffix (exact, case-sensitive), e.g. { Input_YearsExperience4: '5' }. */
  values?: Readonly<Record<string, string>>;
  /** Value for free-text fields. */
  text?: string;
  /** Value for numeric fields. */
  number?: string;
  /** File for every empty attachment slot; omit to leave attachments alone. */
  attachment?: string;
  /** Leave these controls alone (CSS, matched against each control). */
  skip?: string;
  /** Do not tick checkboxes (some reveal more required fields). */
  noCheckboxes?: boolean;
}

const NUMBER_LIKE = /year|duration|experience|life|period|rate|quantity|number|capacity|count|cost|value|amount|ratio|percent|total|price|revenue|investment|expense|npv|irr|ebitda|payback|cashflow|contingenc|capital|ore|_mr|_or|area|age|salary|jobs|budget|hours|equity|asset|liabilit|profit|debt|balance/i;

export async function autoFill(scope: Locator, o: AutoFillOptions = {}): Promise<string[]> {
  const page = scope.page();
  const filled: string[] = [];
  const text = o.text ?? 'اختبار آلي';
  const number = o.number ?? '10';
  const skip = o.skip ? `:not(${o.skip})` : '';

  for (let pass = 1; pass <= 3; pass++) {
    const before = filled.length;

    // Inputs and textareas
    const fields = scope.locator(`input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])${skip}, textarea${skip}`).filter({ visible: true });
    for (const field of await fields.all()) {
      if (!(await field.isEditable().catch(() => false))) continue;
      if ((await field.inputValue().catch(() => 'x')).trim() !== '') continue;
      const { id, type, cls } = await field.evaluate((el: HTMLInputElement) => ({ id: el.id, type: el.type, cls: el.className }));
      if (/flatpickr|date/i.test(cls) || type === 'date') continue; // dates need the calendar — left to the caller
      const key = Object.keys(o.values ?? {}).find((k) => id.endsWith(k));
      const numeric = type === 'number' || NUMBER_LIKE.test(id.replace(/^.*-/, ''));
      const value = key ? o.values![key] : numeric ? number : text;
      await field.fill(value).catch(() => undefined);
      await field.press('Tab').catch(() => undefined);
      if (!key && !numeric && !(await field.inputValue().catch(() => '')).trim()) {
        await field.fill(number).catch(() => undefined);
        await field.press('Tab').catch(() => undefined);
      }
      filled.push(`${id.replace(/^.*-/, '')}=${await field.inputValue().catch(() => '?')}`);
    }

    // Selects showing their placeholder
    for (const select of await scope.locator(`select${skip}`).filter({ visible: true }).all()) {
      if (!(await select.isEnabled().catch(() => false))) continue;
      const state = await select.evaluate((el: HTMLSelectElement) => ({
        id: el.id,
        placeholder: el.selectedIndex <= 0 && (el.value === '' || /اختر|إختر|الرجاء|برجاء|select/i.test(el.selectedOptions[0]?.text ?? '')),
        options: el.options.length,
      }));
      if (!state.placeholder || state.options < 2) continue;
      const key = Object.keys(o.values ?? {}).find((k) => state.id.endsWith(k));
      const activity = trackServerActivity(page);
      if (key) await select.selectOption({ label: o.values![key] });
      else await select.selectOption({ index: 1 });
      await activity.idle();
      filled.push(`${state.id.replace(/^.*-/, '')}=#${key ? o.values![key] : 1}`);
    }

    // Radio groups with nothing checked
    const radios = scope.locator(`input[type=radio]${skip}`);
    const groups = [...new Set(await radios.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name)))];
    for (const name of groups) {
      const group = scope.locator(`input[type=radio][name="${name}"]`);
      if (await group.evaluateAll((els) => els.some((e) => (e as HTMLInputElement).checked))) continue;
      const first = group.first();
      if (!(await first.isEnabled().catch(() => false))) continue;
      const id = await first.getAttribute('id');
      const label = scope.locator(`label[for="${id}"]`);
      if (!(await label.isVisible().catch(() => false)) && !(await first.isVisible().catch(() => false))) continue;
      const activity = trackServerActivity(page);
      if (await label.count()) await label.first().click();
      else await first.check({ force: true });
      await activity.idle();
      filled.push(`radio ${name}=${(await label.first().innerText().catch(() => '1')).trim()}`);
    }

    // Checkboxes
    if (!o.noCheckboxes) {
      for (const box of await scope.locator(`input[type=checkbox]${skip}`).all()) {
        if (await box.isChecked().catch(() => true)) continue;
        if (!(await box.isEnabled().catch(() => false))) continue;
        const id = (await box.getAttribute('id')) ?? '';
        const visible = (await box.isVisible().catch(() => false)) || (await scope.locator(`label[for="${id}"]`).isVisible().catch(() => false));
        if (!visible) continue;
        const activity = trackServerActivity(page);
        await box.check({ force: true }).catch(async () => scope.locator(`label[for="${id}"]`).first().click());
        await activity.idle();
        filled.push(`checkbox ${id.replace(/^.*-/, '')}`);
      }
    }

    // Attachment slots
    if (o.attachment) {
      for (let guard = 0; guard < 40; guard++) {
        const inputs = scope.locator('input[type=file]');
        const count = await inputs.count();
        if (!count) break;
        // Only slots whose "إضافة مرفق" label is on screen (hidden copies of a section also hold inputs).
        let target: Locator | undefined;
        for (let i = 0; i < count && !target; i++) {
          const input = inputs.nth(i);
          const shown = await input.evaluate((el) => {
            const host = (el.closest('label') ?? el.parentElement) as HTMLElement | null;
            return !!host && host.getClientRects().length > 0 && getComputedStyle(host).visibility !== 'hidden';
          });
          if (shown) target = input;
        }
        if (!target) break;
        const id = (await target.getAttribute('id')) ?? `file ${guard + 1}`;
        const activity = trackServerActivity(page);
        await target.setInputFiles(path.resolve(o.attachment));
        await activity.idle(1_000, 90_000);
        await expect.poll(() => inputs.count(), { timeout: 60_000, message: `Attachment ${id} was not taken` }).toBeLessThan(count);
        filled.push(`attachment ${id.replace(/^.*-/, '')}`);
      }
    }

    if (filled.length === before) break;
    await trackServerActivity(page).idle(800);
  }
  log.info(`${filled.length} control(s) filled`);
  return filled;
}
