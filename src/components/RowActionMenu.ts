import { expect, Locator } from '@playwright/test';

/**
 * The "⋯" action menu of a table row (OutSystems UI Tooltip used as a menu).
 *
 * VERIFIED on TEST (Requests, Task Management, To-Do list — 2026-10-26): the row's action cell
 * holds `[role=tooltip][aria-describedby=<balloon id>]`; clicking it shows the balloon, whose
 * entries are links (disabled entries are plain text, not links).
 */
export class RowActionMenu {
  constructor(private readonly actionCell: Locator) {}

  private async balloon(): Promise<Locator> {
    const trigger = this.actionCell.locator('[aria-describedby]').first();
    const id = await trigger.getAttribute('aria-describedby');
    if (!id) throw new Error('Row action menu: no aria-describedby on the action cell.');
    const balloon = this.actionCell.page().locator(`[id="${id}"]`);
    if (!(await balloon.isVisible())) await trigger.click();
    await expect(balloon).toBeVisible();
    return balloon;
  }

  /** Names of the enabled actions (links). */
  async actions(): Promise<string[]> {
    return (await (await this.balloon()).getByRole('link').allInnerTexts()).map((t) => t.trim());
  }

  async has(action: string): Promise<boolean> {
    return (await (await this.balloon()).getByRole('link', { name: action, exact: true }).count()) > 0;
  }

  async click(action: string): Promise<void> {
    const link = (await this.balloon()).getByRole('link', { name: action, exact: true });
    if ((await link.count()) === 0) {
      throw new Error(`Row action "${action}" is not available. Available: ${(await this.actions()).join(' | ') || 'none'}.`);
    }
    await link.click();
  }
}
