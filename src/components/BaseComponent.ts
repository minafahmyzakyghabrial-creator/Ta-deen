import { Locator, Page } from '@playwright/test';

/**
 * A component wraps one reusable UI widget, scoped to a root locator.
 * Page objects compose components; tests never touch raw selectors.
 */
export abstract class BaseComponent {
  constructor(protected readonly root: Locator) {}

  protected get page(): Page {
    return this.root.page();
  }

  locator(selector: string): Locator {
    return this.root.locator(selector);
  }
}
