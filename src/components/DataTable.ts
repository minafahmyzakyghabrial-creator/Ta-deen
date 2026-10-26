import { expect, Locator } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * Generic table helper (OutSystems "Table" widget renders a semantic <table>).
 * Row lookups are text-based, so they survive column re-ordering and dynamic IDs.
 *
 * Pagination controls differ per screen/theme, so the "next page" locator is injected by
 * the page object that owns the table rather than guessed here.
 */
export class DataTable extends BaseComponent {
  constructor(root: Locator, private readonly nextPageButton?: Locator) {
    super(root);
  }

  get rows(): Locator {
    return this.root.locator('tbody tr');
  }

  rowContaining(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text });
  }

  async expectRowVisible(text: string | RegExp): Promise<void> {
    await expect(this.rowContaining(text).first()).toBeVisible();
  }

  /**
   * Searches page by page until a row with the text is found.
   * Requires the owning page object to pass `nextPageButton`.
   */
  async findRowAcrossPages(text: string | RegExp, maxPages = 20): Promise<Locator> {
    for (let i = 0; i < maxPages; i++) {
      const row = this.rowContaining(text).first();
      if (await row.isVisible()) return row;
      if (!this.nextPageButton || !(await this.nextPageButton.isEnabled())) break;
      const firstRowBefore = await this.rows.first().innerText();
      await this.nextPageButton.click();
      // Wait for the table content to actually change (no fixed sleep).
      await expect(this.rows.first()).not.toHaveText(firstRowBefore);
    }
    throw new Error(`Row containing "${text}" not found in table (searched up to ${maxPages} pages).`);
  }
}
