import { expect, Locator } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * Dropdown wrapper that hides HOW a value is selected from page objects.
 *
 * Supports:
 *  - native <select> (OutSystems "Dropdown" widget in Reactive renders a real <select>)
 *  - OutSystems UI "Dropdown Search / Tags" (VirtualSelect based)
 *
 * ⚠ VERIFY: the VirtualSelect classes (.vscomp-*) are the OutSystems UI library defaults
 * and were not yet confirmed on a Taadeen form. Inspect one searchable dropdown and adjust
 * only the selectors in this file if they differ.
 *
 * Construct it with the dropdown's ROOT (ideally a data-testid on the widget container).
 */
export class Dropdown extends BaseComponent {
  private get nativeSelect(): Locator {
    return this.root.locator('select').first();
  }

  async select(optionText: string): Promise<void> {
    const isNative =
      (await this.root.evaluate((el) => el.tagName === 'SELECT')) || (await this.nativeSelect.count()) > 0;
    if (isNative) {
      const select = (await this.root.evaluate((el) => el.tagName === 'SELECT')) ? this.root : this.nativeSelect;
      // OutSystems may load options asynchronously: wait until the option exists.
      await expect(select.locator('option', { hasText: optionText }).first()).toBeAttached();
      await select.selectOption({ label: optionText });
      return;
    }
    await this.selectFromSearchDropdown(optionText);
  }

  private async selectFromSearchDropdown(optionText: string): Promise<void> {
    await this.root.locator('.vscomp-toggle-button').click();
    const dropbox = this.page.locator('.vscomp-dropbox-container:visible');
    const search = dropbox.locator('input.vscomp-search-input');
    if (await search.isVisible()) await search.fill(optionText);
    await dropbox.locator('.vscomp-option', { hasText: optionText }).first().click();
  }
}
