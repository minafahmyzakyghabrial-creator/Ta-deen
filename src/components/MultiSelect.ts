import { expect, Locator } from '@playwright/test';
import { escapeRegExp } from '@utils/field-helper';
import { BaseComponent } from './BaseComponent';

/**
 * OutSystems UI "Dropdown Tags" (Virtual-Select) multi-select.
 *
 * VERIFIED on TEST (2026-10-26): root is `[role=combobox][aria-haspopup=listbox]` (.vscomp-ele-wrapper);
 * its options live in the element referenced by `aria-controls` (rendered elsewhere in the DOM);
 * Escape does NOT close it — clicking `.vscomp-toggle-button` again does.
 *
 * Construct it with the combobox element itself.
 */
export class MultiSelect extends BaseComponent {
  private async dropbox(): Promise<Locator> {
    const id = await this.root.getAttribute('aria-controls');
    if (!id) throw new Error('Multi-select has no aria-controls attribute.');
    return this.page.locator(`#${id}`);
  }

  private async setOpen(open: boolean): Promise<void> {
    // In fast/headless runs a toggle click can land while the list re-renders after a search and be
    // ignored: retry it, and when closing fall back to a click on an empty page corner (outside click).
    for (let attempt = 1; attempt <= 3; attempt++) {
      if ((await this.root.getAttribute('aria-expanded')) === String(open)) return;
      if (attempt === 3 && !open) await this.page.mouse.click(1, 1);
      else await this.root.locator('.vscomp-toggle-button').click();
      const done = await expect(this.root)
        .toHaveAttribute('aria-expanded', String(open), { timeout: 3_000 })
        .then(() => true, () => false);
      if (done) return;
    }
    await expect(this.root).toHaveAttribute('aria-expanded', String(open));
  }

  /** Values currently selected (empty when the placeholder is shown). */
  async selected(): Promise<string[]> {
    return this.root.evaluate((el) => {
      // The hidden input carries the selected value(s); empty means only the placeholder is shown.
      if (!el.querySelector<HTMLInputElement>('input.vscomp-hidden-input')?.value) return [];
      const shown = el.querySelector('.vscomp-value')?.textContent ?? '';
      return shown.split(',').map((t) => t.trim()).filter(Boolean);
    });
  }

  async options(): Promise<string[]> {
    await this.setOpen(true);
    const box = await this.dropbox();
    await box.locator('.vscomp-option').first().waitFor();
    const texts = (await box.locator('.vscomp-option').allInnerTexts()).map((t) => t.trim());
    await this.setOpen(false);
    return texts;
  }

  /** Selects the given options; with no labels, selects the first available option. */
  async select(labels: readonly string[] = []): Promise<string[]> {
    await this.setOpen(true);
    const box = await this.dropbox();
    // Options can arrive after the list opens (e.g. minerals load per category): reopen once if empty.
    const hasOptions = await box.locator('.vscomp-option').first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
    if (!hasOptions) {
      await this.setOpen(false);
      await this.setOpen(true);
      await box.locator('.vscomp-option').first().waitFor({ timeout: 20_000 });
    }
    const picked: string[] = [];
    if (labels.length === 0) {
      const first = box.locator('.vscomp-option').first();
      picked.push((await first.innerText()).trim());
      await first.click();
    }
    const search = box.locator('input.vscomp-search-input');
    for (const label of labels) {
      const option = box.locator('.vscomp-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) });
      // The list is virtualized (~10 options rendered at a time): filter by search when not rendered.
      if ((await option.count()) === 0 && (await search.isVisible())) {
        await search.fill(label);
        await option.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
      }
      if ((await option.count()) === 0) {
        const available = (await box.locator('.vscomp-option').allInnerTexts()).map((t) => t.trim());
        await this.setOpen(false);
        throw new Error(`Option "${label}" not found. Available: ${available.join(' | ')}`);
      }
      if (!((await option.first().getAttribute('class')) ?? '').includes('selected')) await option.first().click();
      picked.push(label);
      if (await search.isVisible()) await search.fill('');
    }
    await this.setOpen(false);
    return picked;
  }
}
