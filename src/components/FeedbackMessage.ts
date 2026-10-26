import { expect, Locator, Page } from '@playwright/test';

/**
 * OutSystems UI "Feedback Message" (toast) shown after server actions.
 *
 * VERIFIED on TEST (2026-10-26, Exploration License wizard): toasts are
 * `.feedback-message.feedback-message-<type>` with the text in `.feedback-message-text`.
 * Toasts STACK and stay visible until closed, so "is an error toast visible" is not a reliable
 * signal of a NEW error. Use `count()` before an action and `textsSince()` after it.
 */
export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export class FeedbackMessage {
  constructor(private readonly page: Page) {}

  of(type: FeedbackType): Locator {
    return this.page.locator(`.feedback-message-${type}`);
  }

  async expectVisible(type: FeedbackType, text?: string | RegExp): Promise<void> {
    const toast = this.of(type).first();
    await expect(toast).toBeVisible();
    if (text) await expect(toast).toContainText(text);
  }

  async textOf(type: FeedbackType): Promise<string> {
    return (await this.of(type).first().innerText()).trim();
  }

  private get texts(): Locator {
    return this.page.locator('.feedback-message-text').filter({ visible: true });
  }

  /** Number of toasts currently shown — take it BEFORE an action, pass it to textsSince(). */
  count(): Promise<number> {
    return this.texts.count();
  }

  /** Texts of the toasts that appeared after `baseline` was taken. */
  async textsSince(baseline: number): Promise<string[]> {
    const all = await this.texts.allInnerTexts();
    return all.slice(baseline).map((t) => t.trim()).filter(Boolean);
  }
}
