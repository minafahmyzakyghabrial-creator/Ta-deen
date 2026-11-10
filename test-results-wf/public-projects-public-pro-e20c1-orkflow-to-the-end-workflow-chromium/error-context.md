# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-projects\public-project-workflow.spec.ts >> Public projects building-materials licence: employee workflow to the end @workflow
- Location: tests\public-projects\public-project-workflow.spec.ts:43:5

# Error details

```
Error: page.waitForResponse: Target page, context or browser has been closed
```

# Test source

```ts
  1   | import { expect, Locator, Page, Response } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * OutSystems Reactive helpers for synchronising with the server.
  5   |  *
  6   |  * Taadeen is an OutSystems Reactive SPA: every data fetch / server action is a POST to
  7   |  *   <app>/screenservices/<Module>/<Flow>/<Screen>/<ActionName>
  8   |  * (observed on UAT, e.g. /screenservices/MiningPortal/MainFlow/Login/DataActionSetRequestDomainAndLang).
  9   |  *
  10  |  * Waiting for the specific server call is far more reliable than `networkidle` (the app
  11  |  * fires background calls such as GTM / Sentry) and never needs a hard-coded sleep.
  12  |  */
  13  | export interface ScreenServiceFilter {
  14  |   /** Substring of the action name, e.g. "ActionSubmitRequest" or "DataActionGetRequests". */
  15  |   action?: string;
  16  |   /** OutSystems module, e.g. "MiningPortal". Omit to match any module. */
  17  |   module?: string;
  18  | }
  19  | 
  20  | export function isScreenService(response: Response, filter: ScreenServiceFilter = {}): boolean {
  21  |   const url = response.url();
  22  |   if (!url.includes('/screenservices/')) return false;
  23  |   if (response.request().method() !== 'POST') return false;
  24  |   if (filter.module && !url.includes(`/screenservices/${filter.module}/`)) return false;
  25  |   if (filter.action && !url.includes(filter.action)) return false;
  26  |   return true;
  27  | }
  28  | 
  29  | /** Waits for the next matching screen-service response. Start it BEFORE triggering the action. */
  30  | export function waitForScreenService(page: Page, filter: ScreenServiceFilter = {}, timeout?: number): Promise<Response> {
> 31  |   return page.waitForResponse((r) => isScreenService(r, filter), { timeout });
      |               ^ Error: page.waitForResponse: Target page, context or browser has been closed
  32  | }
  33  | 
  34  | /**
  35  |  * Clicks a locator and waits for the matching server call to complete.
  36  |  * Returns the parsed OutSystems response body (`{ versionInfo, data }`) so callers can read
  37  |  * server-generated values (e.g. a Request ID) without scraping the UI.
  38  |  */
  39  | export async function clickAndWaitForServer<T = unknown>(
  40  |   locator: Locator,
  41  |   filter: ScreenServiceFilter = {},
  42  | ): Promise<{ response: Response; body: OutSystemsResponse<T> | undefined }> {
  43  |   const responsePromise = waitForScreenService(locator.page(), filter);
  44  |   await locator.click();
  45  |   const response = await responsePromise;
  46  |   let body: OutSystemsResponse<T> | undefined;
  47  |   try {
  48  |     body = (await response.json()) as OutSystemsResponse<T>;
  49  |   } catch {
  50  |     body = undefined;
  51  |   }
  52  |   return { response, body };
  53  | }
  54  | 
  55  | /**
  56  |  * Tracks in-flight screen-service calls of a page, so callers can wait until the server
  57  |  * has gone quiet after an action that fires an unknown number of data actions (e.g. a wizard
  58  |  * step that loads ~20 blocks, some of them several times). Only /screenservices/ traffic is
  59  |  * counted, so analytics (GTM / Sentry) never delays it.
  60  |  *
  61  |  * Start tracking BEFORE the action:  const activity = trackServerActivity(page); await click; await activity.idle();
  62  |  */
  63  | /** Quiet period that counts as "server finished"; SERVER_QUIET_MS overrides (default 500 ms). */
  64  | const DEFAULT_QUIET_MS = Number(process.env.SERVER_QUIET_MS ?? 500);
  65  | 
  66  | export function trackServerActivity(page: Page) {
  67  |   let inFlight = 0;
  68  |   let lastChange = Date.now();
  69  |   const isService = (url: string) => url.includes('/screenservices/');
  70  |   const onStart = (r: { url(): string }) => {
  71  |     if (isService(r.url())) {
  72  |       inFlight++;
  73  |       lastChange = Date.now();
  74  |     }
  75  |   };
  76  |   const onEnd = (r: { url(): string }) => {
  77  |     if (isService(r.url())) {
  78  |       inFlight = Math.max(0, inFlight - 1);
  79  |       lastChange = Date.now();
  80  |     }
  81  |   };
  82  |   page.on('request', onStart);
  83  |   page.on('requestfinished', onEnd);
  84  |   page.on('requestfailed', onEnd);
  85  | 
  86  |   return {
  87  |     /** Resolves once no screen-service call has been in flight for `quietMs`. */
  88  |     async idle(quietMs = DEFAULT_QUIET_MS, timeout = 60_000): Promise<void> {
  89  |       try {
  90  |         await expect
  91  |           .poll(() => inFlight === 0 && Date.now() - lastChange >= quietMs, {
  92  |             timeout,
  93  |             intervals: [100],
  94  |             message: `Server did not go quiet within ${timeout} ms`,
  95  |           })
  96  |           .toBe(true);
  97  |       } finally {
  98  |         page.off('request', onStart);
  99  |         page.off('requestfinished', onEnd);
  100 |         page.off('requestfailed', onEnd);
  101 |       }
  102 |     },
  103 |   };
  104 | }
  105 | 
  106 | /** Standard OutSystems Reactive screen-service envelope (observed on UAT). */
  107 | export interface OutSystemsResponse<T> {
  108 |   versionInfo?: { hasModuleVersionChanged: boolean; hasApiVersionChanged: boolean };
  109 |   data?: T;
  110 |   exception?: { name?: string; message?: string };
  111 | }
  112 | 
```