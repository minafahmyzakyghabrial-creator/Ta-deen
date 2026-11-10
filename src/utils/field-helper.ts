import { expect, Locator } from '@playwright/test';
import path from 'path';
import { trackServerActivity } from './os-waits';

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Field-level helpers shared by the wizard step page objects.
 *
 * Principle: never overwrite what the request already contains. Every helper fills a field
 * only when it is empty and reports whether it changed anything, so the same test can be
 * re-run on a partially completed request.
 */

/** A form control by its visible label, ignoring the "*" mandatory marker and spacing. */
export function fieldByLabel(scope: Locator, label: string): Locator {
  return scope.getByLabel(new RegExp(`^\\s*\\*?\\s*${escapeRegExp(label)}\\s*$`));
}

export type FillResult = 'filled' | 'kept';

/** Fills a text/number input only if it is empty. */
export async function fillIfEmpty(input: Locator, value: string): Promise<FillResult> {
  if ((await input.inputValue()).trim() !== '') return 'kept';
  await input.fill(value);
  await input.blur();
  return 'filled';
}

/** Selects an option of a native <select> only if nothing is selected yet. */
export async function selectIfEmpty(select: Locator, label: string): Promise<FillResult> {
  const current = await select.evaluate((el: HTMLSelectElement) => el.selectedIndex);
  if (current > 0) return 'kept';
  await select.selectOption({ label });
  return 'filled';
}

/**
 * Checks an OutSystems radio button. The styled <label> covers the real input, so the
 * label must be clicked (input.check() reports "did not change its state").
 */
export async function checkRadioByLabel(scope: Locator, labelText: string | RegExp): Promise<FillResult> {
  const radio = scope.getByRole('radio', { name: labelText });
  if (await radio.isChecked()) return 'kept';
  // A radio can redraw the controls under it (e.g. the field-report slot of "نتائج أعمال المسح الميداني");
  // wait for that so the next helper does not read the half-rendered section.
  const activity = trackServerActivity(scope.page());
  await scope.locator('label').filter({ hasText: labelText }).first().click();
  await expect(radio).toBeChecked();
  await activity.idle();
  return 'filled';
}

/** Checks every checkbox in scope that is not checked yet. Returns how many were changed. */
export async function checkAll(scope: Locator): Promise<number> {
  const boxes = scope.getByRole('checkbox');
  let changed = 0;
  for (let i = 0; i < (await boxes.count()); i++) {
    if (await boxes.nth(i).isChecked()) continue;
    await boxes.nth(i).check();
    changed++;
  }
  return changed;
}

/**
 * Uploads a file into an attachment slot unless one is already uploaded.
 * VERIFIED on TEST: an empty slot renders a hidden <input type=file>; a filled slot renders
 * `.dga-uploaded-file` with the file name instead. The upload is validated and stored by the
 * server immediately (…/ActionAttachment_Validate_And_Save).
 * Since 2026-11-03 the empty slot's "إضافة" button is ALSO a `label.dga-uploaded-file` (wrapping the input),
 * so only a `.dga-uploaded-file` without a file input counts as an uploaded file.
 */
export async function uploadIfEmpty(slot: Locator, relativeFile: string): Promise<FillResult> {
  const uploaded = slot.locator('.dga-uploaded-file:not(:has(input[type=file]))');
  const input = slot.locator('input[type=file]').first();
  // Wait until the slot shows one or the other — right after a radio redraws the section it can be empty.
  await expect(uploaded.or(input).first()).toBeAttached({ timeout: 30_000 });
  if ((await uploaded.count()) > 0) return 'kept';
  const activity = trackServerActivity(slot.page());
  await input.setInputFiles(path.resolve(process.cwd(), relativeFile));
  await expect(uploaded.first()).toBeVisible({ timeout: 30_000 });
  await activity.idle();
  return 'filled';
}

/**
 * Picks a date in an OutSystems DatePicker (flatpickr) through its calendar, like a user, unless it already
 * holds that date. VERIFIED on TEST (2026-11-05, public-projects licences):
 *   - the visible input is flatpickr's altInput (read-only, right after the original `input.flatpickr-input`);
 *   - setting the date through the flatpickr API is NOT enough: OutSystems ignores it (dependent fields stay
 *     disabled) and out-of-range dates are dropped silently — the calendar pick is what the screen reacts to;
 *   - the sticky wizard footer and a `span.input-date` wrapper cover the input, so it is scrolled to the middle
 *     of the screen and clicked at its centre with the mouse.
 * `original` is the `input.flatpickr-input` (e.g. `input[id$="Input_ContractStartDate"]`); `isoDate` YYYY-MM-DD.
 */
export async function pickDate(original: Locator, isoDate: string): Promise<FillResult> {
  if ((await original.inputValue()) === isoDate) return 'kept';
  const page = original.page();
  const [y, m, d] = isoDate.split('-').map(Number);
  const alt = original.locator('xpath=following-sibling::input[1]');
  await alt.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await alt.boundingBox();
  if (!box) throw new Error(`Date field for ${isoDate} is not visible.`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const calendar = page.locator('.flatpickr-calendar.open');
  await expect(calendar).toBeVisible();
  await calendar.locator('input.cur-year').fill(String(y));
  await calendar.locator('input.cur-year').press('Enter');
  await calendar.locator('select.flatpickr-monthDropdown-months').selectOption(String(m - 1));
  const activity = trackServerActivity(page);
  await calendar
    .locator('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay):not(.flatpickr-disabled)', { hasText: new RegExp(`^${d}$`) })
    .first()
    .click();
  await expect(original, `Date ${isoDate} was not accepted (outside the allowed range?)`).toHaveValue(isoDate);
  await activity.idle();
  return 'filled';
}
