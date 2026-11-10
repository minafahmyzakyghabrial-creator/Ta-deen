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

  /**
   * Closes every visible toast. They stay open and sit over the page's lower-left corner, intercepting clicks
   * (a refused "إرسال" toast blocked "انظر على الخريطة" on the public-projects wizard, TEST 2026-11-10).
   */
  async closeAll(): Promise<void> {
    const toasts = this.page.locator('.feedback-message').filter({ visible: true });
    for (let n = await toasts.count(); n > 0; n--) {
      const toast = toasts.first();
      const close = toast.locator('.feedback-message-close, [class*=close], button').first();
      await ((await close.count()) ? close : toast).click({ timeout: 5_000 }).catch(() => undefined);
      await expect(toast).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
    }
    // Last resort: a toast that ignores clicks is hidden so it cannot cover the controls under it.
    await toasts.evaluateAll((els) => els.forEach((e) => ((e as HTMLElement).style.display = 'none')));
  }

  /** Texts of the toasts that appeared after `baseline` was taken. */
  async textsSince(baseline: number): Promise<string[]> {
    const all = await this.texts.allInnerTexts();
    return all.slice(baseline).map((t) => t.trim()).filter(Boolean);
  }
}
