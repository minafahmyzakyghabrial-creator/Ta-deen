import fs from 'fs';
import path from 'path';
import { expect, Locator, Page, TestInfo } from '@playwright/test';

/** One bug found by a check. `defect` links it to a known workbook defect (e.g. 'DEF-034'). */
export interface BugSpec {
  /** Stable key, unique per check — the screenshot file name and the de-duplication key. */
  readonly key: string;
  readonly title: string;
  /** User story / requirement, e.g. 'UC-002.1 field 13.1'. */
  readonly uc: string;
  readonly expected: string;
  readonly severity: 'High' | 'Medium' | 'Low';
  readonly defect?: string;
}

export interface RecordedBug extends BugSpec {
  readonly actual: string;
  readonly screenshot: string;
  readonly url: string;
  readonly test: string;
  readonly at: string;
}

/**
 * Logs every failed check as its OWN bug with its OWN screenshot (offending element outlined in red):
 *   <dir>/<key>.png  +  <dir>/bugs.json  (read by test-cases/build-expired-license-test-cases.js)
 * and attaches the screenshot to the Playwright report. Checks are SOFT (the test goes on and is marked failed at the
 * end); use `blocker` when the flow cannot continue.
 */
export class BugRecorder {
  private readonly file: string;

  constructor(
    readonly dir: string,
    private readonly testInfo: TestInfo,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'bugs.json');
  }

  all(): RecordedBug[] {
    return fs.existsSync(this.file) ? (JSON.parse(fs.readFileSync(this.file, 'utf8')) as RecordedBug[]) : [];
  }

  /** Records the bug when `ok` is false. Returns `ok`. */
  async check(ok: boolean, page: Page, bug: BugSpec, actual: string, highlight: Locator[] = []): Promise<boolean> {
    if (!ok) await this.record(page, bug, actual, highlight);
    expect.soft(ok, `${bug.key}: ${bug.title} — expected: ${bug.expected} — actual: ${actual}`).toBe(true);
    return ok;
  }

  /** Records the bug and stops the test (the flow cannot go on). */
  async blocker(page: Page, bug: BugSpec, actual: string, highlight: Locator[] = []): Promise<never> {
    await this.record(page, bug, actual, highlight);
    throw new Error(`BLOCKED by ${bug.key}: ${bug.title} — ${actual}`);
  }

  private async record(page: Page, bug: BugSpec, actual: string, highlight: Locator[]): Promise<void> {
    const shot = path.join(this.dir, `${bug.key}.png`);
    const marked: Locator[] = [];
    for (const l of highlight) {
      const el = l.first();
      if (await el.isVisible().catch(() => false)) {
        await el.evaluate((e) => {
          const h = e as HTMLElement;
          h.dataset.bugOutline = h.style.outline;
          h.style.outline = '4px solid red';
          h.style.outlineOffset = '2px';
          h.scrollIntoView({ block: 'center' });
        }).catch(() => {});
        marked.push(el);
      }
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot }).catch(() => {});
    for (const el of marked) await el.evaluate((e) => { const h = e as HTMLElement; h.style.outline = h.dataset.bugOutline ?? ''; }).catch(() => {});
    await this.testInfo.attach(`BUG ${bug.key}`, { path: shot, contentType: 'image/png' }).catch(() => {});
    const entry: RecordedBug = { ...bug, actual, screenshot: shot.replace(/\\/g, '/'), url: page.url(), test: this.testInfo.title, at: new Date().toISOString() };
    const list = this.all().filter((b) => b.key !== bug.key);
    list.push(entry);
    fs.writeFileSync(this.file, JSON.stringify(list, null, 2));
    console.log(`BUG ${bug.key}${bug.defect ? ` (${bug.defect})` : ''}: ${bug.title} — ${actual}`);
  }
}
