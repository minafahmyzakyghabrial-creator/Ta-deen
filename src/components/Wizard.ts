import { expect, Locator, Page } from '@playwright/test';
import { FeedbackMessage } from './FeedbackMessage';
import { trackServerActivity } from '@utils/os-waits';

/**
 * OutSystems UI "Wizard" (vertical step list) + the Previous / Next / Submit footer.
 *
 * VERIFIED on TEST (Exploration License, 2026-10-26):
 *   - steps are `[role=tab].wizard-wrapper-item` inside a `[role=tablist]`, label in aria-label;
 *     the current step has class `active`, finished ones `past`, hidden ones `hideContainer`;
 *   - clicking a step does NOT jump forward — only Next moves on;
 *   - Next runs client-side validation first: on failure no server call is made and the
 *     reasons appear as an error toast; on success the step is SAVED server-side.
 *   - footer buttons are OutSystems widgets named Next / Previous / Submit / SaveDraft, so
 *     their ids end with "-Next" etc. (the block prefix such as "b6-" is not stable).
 */
export interface StepChange {
  readonly moved: boolean;
  readonly from: string;
  readonly to: string;
  /** Error toasts raised by this Next click (empty when it moved on). */
  readonly errors: string[];
}

export class Wizard {
  private readonly feedback: FeedbackMessage;

  constructor(private readonly page: Page) {
    this.feedback = new FeedbackMessage(page);
  }

  get steps(): Locator {
    return this.page
      .getByRole('tablist')
      .filter({ has: this.page.locator('.wizard-wrapper-item') })
      .first()
      .locator('[role=tab].wizard-wrapper-item:not(.hideContainer)');
  }

  get nextButton(): Locator {
    return this.page.locator('button[id$="-Next"]');
  }

  get submitButton(): Locator {
    return this.page.locator('button[id$="-Submit"]');
  }

  async stepNames(): Promise<string[]> {
    return this.steps.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  }

  async activeIndex(): Promise<number> {
    return this.steps.evaluateAll((els) => els.findIndex((e) => e.classList.contains('active')));
  }

  async activeName(): Promise<string> {
    const names = await this.stepNames();
    return names[await this.activeIndex()] ?? '';
  }

  async expectActive(index: number): Promise<void> {
    await expect.poll(() => this.activeIndex(), { message: `Wizard step ${index + 1} should be active` }).toBe(index);
  }

  /**
   * Clicks Next and resolves when EITHER the next step is active and its data has loaded,
   * OR the click produced validation errors (then `moved` is false and `errors` lists them).
   */
  async next(timeout = 90_000): Promise<StepChange> {
    const from = await this.activeIndex();
    const names = await this.stepNames();
    // Only ERROR toasts block; a success toast ("تم حفظ البيانات بنجاح") can appear mid-transition.
    const errorToasts = this.feedback.of('error').filter({ visible: true });
    const baseline = await errorToasts.count();
    const activity = trackServerActivity(this.page);

    await this.nextButton.click();

    let errors: string[] = [];
    let outcome = 'waiting';
    await expect
      .poll(
        async () => {
          // During the transition no step is marked active (index -1) — that is not a move yet.
          const now = await this.activeIndex();
          if (now >= 0 && now !== from) return (outcome = 'moved');
          errors = (await errorToasts.allInnerTexts()).slice(baseline).map((t) => t.trim()).filter(Boolean);
          return (outcome = errors.length ? 'blocked' : 'waiting');
        },
        { timeout, message: `Next on "${names[from]}" neither moved on nor showed an error` },
      )
      .not.toBe('waiting');

    // The new step fires its data actions after it becomes active; let them finish so
    // "does this section already have rows?" checks see the real server state.
    await activity.idle();
    const moved = outcome === 'moved';
    const to = await this.activeIndex();
    return { moved, from: names[from] ?? `#${from + 1}`, to: names[to] ?? `#${to + 1}`, errors: moved ? [] : errors };
  }
}
