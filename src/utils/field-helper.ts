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
  await scope.locator('label').filter({ hasText: labelText }).first().click();
  await expect(radio).toBeChecked();
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
 */
export async function uploadIfEmpty(slot: Locator, relativeFile: string): Promise<FillResult> {
  if ((await slot.locator('.dga-uploaded-file').count()) > 0) return 'kept';
  const input = slot.locator('input[type=file]').first();
  const activity = trackServerActivity(slot.page());
  await input.setInputFiles(path.resolve(process.cwd(), relativeFile));
  await expect(slot.locator('.dga-uploaded-file').first()).toBeVisible({ timeout: 30_000 });
  await activity.idle();
  return 'filled';
}
