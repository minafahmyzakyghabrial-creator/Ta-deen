/**
 * npm run record                -> records a scenario starting at the Investor login page
 * npm run record -- employee    -> starts at the Employee (LDAP) login page
 *
 * Like `playwright codegen`, but the browser opens MAXIMIZED (codegen can only set a fixed
 * viewport) and any cookie-consent banner is accepted automatically. The Playwright Inspector
 * opens next to the browser: press "Record", click through the scenario, then copy the code.
 */
import { chromium, type Page } from '@playwright/test';
import { getEnvName, getPortalUrls, PORTAL_KEYS, type PortalKey } from '../src/config';

const portal = (process.argv[2] ?? 'investor') as PortalKey;
if (!PORTAL_KEYS.includes(portal)) {
  console.error(`Unknown portal "${portal}". Use one of: ${PORTAL_KEYS.join(', ')}.`);
  process.exit(1);
}

/**
 * Clicks an "accept" button only when it sits inside a cookie notice, so a generic
 * "قبول" (accept) button of the application itself is never pressed by accident.
 * Runs in the page; the click is synthetic, so the recorder does not capture it.
 */
function acceptCookieBanner(): boolean {
  const ACCEPT = /accept|allow|agree|قبول|موافق|السماح/i;
  const COOKIE = /cookie|ملفات تعريف الارتباط|الكوكيز/i;
  // Start from the cookie text and look for the button in its own (small) container,
  // never from a button upwards — that would eventually reach <body> and match anything.
  const notices = Array.from(document.querySelectorAll<HTMLElement>('p, span, div, section, aside, [role="dialog"]'))
    .filter((el) => COOKIE.test(el.textContent ?? '') && !Array.from(el.children).some((c) => COOKIE.test(c.textContent ?? '')));
  for (const notice of notices) {
    let container: HTMLElement | null = notice;
    for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
      if (container === document.body || (container.textContent ?? '').length > 2000) break;
      const button = Array.from(
        container.querySelectorAll<HTMLElement>('button, a, [role="button"], input[type="button"]'),
      ).find((b) => b.offsetParent !== null && ACCEPT.test(b.textContent || (b as HTMLInputElement).value || ''));
      if (button) {
        button.click();
        return true;
      }
    }
  }
  return false;
}

function autoAcceptCookies(page: Page): void {
  const timer = setInterval(async () => {
    try {
      if (await page.evaluate(acceptCookieBanner)) console.log('Accepted the cookie banner.');
    } catch {
      // Page is navigating or closed; try again on the next tick.
    }
  }, 1_000);
  page.on('close', () => clearInterval(timer));
}

(async () => {
  const { loginUrl } = getPortalUrls(portal);
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  // viewport: null -> the page follows the real (maximized) window size.
  const context = await browser.newContext({
    viewport: null,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    ignoreHTTPSErrors: true,
  });
  context.on('page', autoAcceptCookies);

  const page = await context.newPage();
  await page.goto(loginUrl);
  console.log(`Recording ${portal} portal in ${getEnvName().toUpperCase()}: ${loginUrl}`);
  console.log('Press "Record" in the Playwright Inspector, run the scenario, then copy the generated code.');
  await page.pause();
  await browser.close();
})();
