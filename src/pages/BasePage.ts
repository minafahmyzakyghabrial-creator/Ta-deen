import { Page } from '@playwright/test';
import { getPortalUrls, PortalKey, PortalUrls } from '@config/index';
import { FeedbackMessage } from '@components/FeedbackMessage';
import { clickAndWaitForServer, ScreenServiceFilter, waitForScreenService } from '@utils/os-waits';
import { isAnyLoginPage } from './login-paths';

/**
 * Base class for every page object.
 *
 * - Knows which portal it belongs to, so URLs always come from central config.
 * - Exposes OutSystems sync helpers (server-call waits) and the shared feedback toast.
 * - Contains NO assertions about business data; page objects expose actions + locators,
 *   tests/flows own the assertions.
 */
export abstract class BasePage {
  readonly feedback: FeedbackMessage;

  constructor(
    readonly page: Page,
    readonly portal: PortalKey,
  ) {
    this.feedback = new FeedbackMessage(page);
  }

  /** Resolved lazily so constructing a page object never requires configuration. */
  get urls(): PortalUrls {
    return getPortalUrls(this.portal);
  }

  /** Navigates to a path relative to the portal's application root (e.g. "Requests"). */
  async gotoPath(relativePath = ''): Promise<void> {
    await this.page.goto(new URL(relativePath, this.urls.appBaseUrl).toString());
  }

  /** True when the current URL is ANY configured portal's login screen. */
  isOnLoginPage(): boolean {
    return isAnyLoginPage(this.page.url());
  }

  waitForServer(filter: ScreenServiceFilter = {}) {
    return waitForScreenService(this.page, filter);
  }

  clickAndWaitForServer = clickAndWaitForServer;
}
