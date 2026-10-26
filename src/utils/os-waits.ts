import { expect, Locator, Page, Response } from '@playwright/test';

/**
 * OutSystems Reactive helpers for synchronising with the server.
 *
 * Taadeen is an OutSystems Reactive SPA: every data fetch / server action is a POST to
 *   <app>/screenservices/<Module>/<Flow>/<Screen>/<ActionName>
 * (observed on UAT, e.g. /screenservices/MiningPortal/MainFlow/Login/DataActionSetRequestDomainAndLang).
 *
 * Waiting for the specific server call is far more reliable than `networkidle` (the app
 * fires background calls such as GTM / Sentry) and never needs a hard-coded sleep.
 */
export interface ScreenServiceFilter {
  /** Substring of the action name, e.g. "ActionSubmitRequest" or "DataActionGetRequests". */
  action?: string;
  /** OutSystems module, e.g. "MiningPortal". Omit to match any module. */
  module?: string;
}

export function isScreenService(response: Response, filter: ScreenServiceFilter = {}): boolean {
  const url = response.url();
  if (!url.includes('/screenservices/')) return false;
  if (response.request().method() !== 'POST') return false;
  if (filter.module && !url.includes(`/screenservices/${filter.module}/`)) return false;
  if (filter.action && !url.includes(filter.action)) return false;
  return true;
}

/** Waits for the next matching screen-service response. Start it BEFORE triggering the action. */
export function waitForScreenService(page: Page, filter: ScreenServiceFilter = {}, timeout?: number): Promise<Response> {
  return page.waitForResponse((r) => isScreenService(r, filter), { timeout });
}

/**
 * Clicks a locator and waits for the matching server call to complete.
 * Returns the parsed OutSystems response body (`{ versionInfo, data }`) so callers can read
 * server-generated values (e.g. a Request ID) without scraping the UI.
 */
export async function clickAndWaitForServer<T = unknown>(
  locator: Locator,
  filter: ScreenServiceFilter = {},
): Promise<{ response: Response; body: OutSystemsResponse<T> | undefined }> {
  const responsePromise = waitForScreenService(locator.page(), filter);
  await locator.click();
  const response = await responsePromise;
  let body: OutSystemsResponse<T> | undefined;
  try {
    body = (await response.json()) as OutSystemsResponse<T>;
  } catch {
    body = undefined;
  }
  return { response, body };
}

/**
 * Tracks in-flight screen-service calls of a page, so callers can wait until the server
 * has gone quiet after an action that fires an unknown number of data actions (e.g. a wizard
 * step that loads ~20 blocks, some of them several times). Only /screenservices/ traffic is
 * counted, so analytics (GTM / Sentry) never delays it.
 *
 * Start tracking BEFORE the action:  const activity = trackServerActivity(page); await click; await activity.idle();
 */
/** Quiet period that counts as "server finished"; SERVER_QUIET_MS overrides (default 500 ms). */
const DEFAULT_QUIET_MS = Number(process.env.SERVER_QUIET_MS ?? 500);

export function trackServerActivity(page: Page) {
  let inFlight = 0;
  let lastChange = Date.now();
  const isService = (url: string) => url.includes('/screenservices/');
  const onStart = (r: { url(): string }) => {
    if (isService(r.url())) {
      inFlight++;
      lastChange = Date.now();
    }
  };
  const onEnd = (r: { url(): string }) => {
    if (isService(r.url())) {
      inFlight = Math.max(0, inFlight - 1);
      lastChange = Date.now();
    }
  };
  page.on('request', onStart);
  page.on('requestfinished', onEnd);
  page.on('requestfailed', onEnd);

  return {
    /** Resolves once no screen-service call has been in flight for `quietMs`. */
    async idle(quietMs = DEFAULT_QUIET_MS, timeout = 60_000): Promise<void> {
      try {
        await expect
          .poll(() => inFlight === 0 && Date.now() - lastChange >= quietMs, {
            timeout,
            intervals: [100],
            message: `Server did not go quiet within ${timeout} ms`,
          })
          .toBe(true);
      } finally {
        page.off('request', onStart);
        page.off('requestfinished', onEnd);
        page.off('requestfailed', onEnd);
      }
    },
  };
}

/** Standard OutSystems Reactive screen-service envelope (observed on UAT). */
export interface OutSystemsResponse<T> {
  versionInfo?: { hasModuleVersionChanged: boolean; hasApiVersionChanged: boolean };
  data?: T;
  exception?: { name?: string; message?: string };
}
