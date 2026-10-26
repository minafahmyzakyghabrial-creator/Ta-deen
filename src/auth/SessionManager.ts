import fs from 'fs';
import { Browser, BrowserContext, BrowserContextOptions, Page, TestInfo } from '@playwright/test';
import {
  assertProdRunAllowed,
  getCredentials,
  getPortalUrls,
  getUser,
  PortalKey,
  UserDefinition,
  UserKey,
} from '@config/index';
import { isAnyLoginPage } from '@pages/login-paths';
import { createLogger } from '@utils/logger';
import { AuthStateStore } from './AuthStateStore';
import { strategyForPortal } from './strategies';

const log = createLogger('session');

/** One authenticated (or anonymous) user, fully isolated in its own BrowserContext. */
export interface UserSession {
  readonly label: string;
  readonly user?: UserDefinition & { key: UserKey };
  readonly portal: PortalKey;
  readonly context: BrowserContext;
  readonly page: Page;
}

/**
 * Creates and tracks isolated sessions for a single test.
 *
 * KEY DESIGN DECISION — one BrowserContext per user:
 * On UAT both portals are the same OutSystems app on the same domain. Two logins in the
 * same context would share (and overwrite) the same session cookies, so "investor submits,
 * employee approves" would silently run as one user. Each context has its own cookie jar
 * and storage, so any number of users can be active in one test with zero conflicts.
 *
 * Contexts are created from the worker's browser, so they inherit all `use` options from
 * playwright.config.ts (locale, timeouts, tracing, failure screenshots). Video is the one
 * artifact Playwright only records for its own `context` fixture, so it is added here.
 */
export class SessionManager {
  private readonly sessions = new Map<string, UserSession>();
  private readonly store = new AuthStateStore();

  constructor(
    private readonly browser: Browser,
    private readonly testInfo: TestInfo,
  ) {}

  /**
   * Returns an authenticated session for a registered user (e.g. 'investor1').
   * Calling it twice in the same test returns the same session.
   */
  async as(userKey: UserKey): Promise<UserSession> {
    const existing = this.sessions.get(userKey);
    if (existing) return existing;

    assertProdRunAllowed();
    const user = getUser(userKey);

    const session = (await this.tryReuse(user)) ?? (await this.freshLogin(user));
    this.sessions.set(userKey, session);
    return session;
  }

  /** A clean, NOT logged-in session on a portal — for login-page tests. */
  async anonymous(portal: PortalKey, label = `anonymous-${portal}`): Promise<UserSession> {
    assertProdRunAllowed();
    const key = `${label}#${this.sessions.size}`;
    const context = await this.newContext(label);
    const session: UserSession = { label, portal, context, page: await context.newPage() };
    this.sessions.set(key, session);
    return session;
  }

  private async tryReuse(user: UserDefinition & { key: UserKey }): Promise<UserSession | undefined> {
    const meta = this.store.getFresh(user.key);
    if (!meta) return undefined;

    const context = await this.newContext(user.key, { storageState: this.store.statePath(user.key) });
    const page = await context.newPage();
    try {
      // The landing page seen right after login requires authentication: if the saved
      // session expired server-side, OutSystems redirects to a login screen.
      await page.goto(meta.landingUrl);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      if (!isAnyLoginPage(page.url())) {
        log.info(`Reused saved session for ${user.key}`);
        return { label: user.key, user, portal: user.portal, context, page };
      }
    } catch (e) {
      log.warn(`Saved session for ${user.key} could not be validated: ${(e as Error).message}`);
    }
    log.info(`Saved session for ${user.key} is no longer valid — logging in again`);
    this.store.invalidate(user.key);
    await context.close();
    return undefined;
  }

  private async freshLogin(user: UserDefinition & { key: UserKey }): Promise<UserSession> {
    const credentials = getCredentials(user.key); // throws a clear ConfigError if missing
    getPortalUrls(user.portal); // validates the portal URL before opening a browser
    const context = await this.newContext(user.key);
    const page = await context.newPage();
    log.info(`Logging in ${user.key} via ${user.portal} portal`);
    const landingUrl = await strategyForPortal(user.portal).login(page, credentials);
    this.store.save(user.key, await context.storageState(), { landingUrl });
    return { label: user.key, user, portal: user.portal, context, page };
  }

  private videoMode(): string {
    const v = this.testInfo.project.use.video as unknown;
    if (!v) return 'off';
    return typeof v === 'string' ? v : ((v as { mode?: string }).mode ?? 'off');
  }

  private async newContext(label: string, options: BrowserContextOptions = {}): Promise<BrowserContext> {
    const mode = this.videoMode();
    const recordVideo = mode !== 'off' ? { dir: this.testInfo.outputPath(`videos-${label}`) } : undefined;
    return this.browser.newContext({ ...(recordVideo ? { recordVideo } : {}), ...options });
  }

  /** Closes every context; on failure attaches a final screenshot + video per user. */
  async dispose(): Promise<void> {
    const failed = this.testInfo.status !== this.testInfo.expectedStatus;
    const keepVideo = failed ? this.videoMode() !== 'off' : this.videoMode() === 'on';

    for (const session of this.sessions.values()) {
      if (failed && !session.page.isClosed()) {
        const shot = await session.page.screenshot({ fullPage: true, timeout: 5_000 }).catch(() => undefined);
        if (shot) await this.testInfo.attach(`${session.label} — final screen`, { body: shot, contentType: 'image/png' });
      }
      const video = session.page.video();
      await session.context.close();
      if (video) {
        const videoPath = await video.path().catch(() => undefined);
        if (videoPath && keepVideo) {
          await this.testInfo.attach(`${session.label} — video`, { path: videoPath, contentType: 'video/webm' });
        } else if (videoPath) {
          fs.rmSync(videoPath, { force: true });
        }
      }
    }
    this.sessions.clear();
  }
}
