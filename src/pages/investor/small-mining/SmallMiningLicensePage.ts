import { expect, Frame, Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { Wizard } from '@components/Wizard';
import { MultiSelect } from '@components/MultiSelect';
import { SmallMiningLicenseData } from '@data/small-mining-license.data';
import { autoFill } from '@utils/auto-fill';
import { createLogger } from '@utils/logger';
import { trackServerActivity } from '@utils/os-waits';
import { inlineErrors, splitRules, WizardValidationError } from '@utils/validation';

const log = createLogger('SmallMining');

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface SmallMiningLocationAttempt {
  readonly attempt: number;
  readonly areaKm2: number;
  readonly corners: string;
  readonly result: string;
}

export interface SmallMiningSubmission {
  readonly requestNumber: string;
  /** SADAD reference ("الرقم المرجعي لنظام سداد") of the licence fee. */
  readonly billId: string;
  readonly amount: number;
  readonly description: string;
}

export class NoLocationAcceptedError extends Error {}

/** Wizard step label → its block (`data-block="MiningRequestSteps.<block>"`). VERIFIED on TEST 2026-11-15. */
export const SMALL_MINING_STEPS: Readonly<Record<string, string>> = {
  'معلومات الرخصة': 'LicenseInformation',
  'موقع الرخصة': 'LicenseLocation',
  'دراسة الجدوى الاقتصادية': 'FeasibilityStudy',
  'دراسة الأثر الاجتماعي': 'SocialImpactStudy',
  'دراسة الأثر البيئي': 'EnvironmentalImpactStudy',
  'إعادة التأهيل والإغلاق': 'RehabilitationandClosure',
  'إثبات القدرة المالية': 'ProofofFinancialCapability',
  'المرفقات': 'Attachments',
  'الشروط والأحكام': 'TermsandConditions',
  'الدفع': 'Payment',
};

/** Area (km²) of a closed lat/lon ring — local equirectangular projection, accurate for licence-sized areas. */
export function areaKm2(ring: readonly LatLon[]): number {
  const lat0 = ((ring.reduce((s, p) => s + p.lat, 0) / ring.length) * Math.PI) / 180;
  const x = (p: LatLon) => p.lon * 111.32 * Math.cos(lat0);
  const y = (p: LatLon) => p.lat * 110.57;
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) twice += x(ring[i]) * y(ring[i + 1]) - x(ring[i + 1]) * y(ring[i]);
  return Math.abs(twice / 2);
}

/** Degrees → [degrees, minutes, seconds (2 decimals)]. */
function dms(deg: number): [number, number, number] {
  let d = Math.floor(deg);
  let m = Math.floor((deg - d) * 60);
  let s = +(((deg - d) * 60 - m) * 60).toFixed(2);
  if (s >= 60) { s = 0; m++; }
  if (m >= 60) { m = 0; d++; }
  return [d, m, s];
}

/**
 * "إصدار رخصة منجم صغير" — investor wizard (/Licenses_MSM/New_Mining_License?In_LicenseType=13). VERIFIED end to end
 * on TEST 2026-11-15 (request 77270). 10 steps: معلومات الرخصة · موقع الرخصة · دراسة الجدوى الاقتصادية ·
 * دراسة الأثر الاجتماعي · دراسة الأثر البيئي · إعادة التأهيل والإغلاق · إثبات القدرة المالية · المرفقات ·
 * الشروط والأحكام · الدفع. Next refuses any missing field with "يجب تعبئة جميع الحقول الإلزامية بشكل صحيح للإنتقال للتالي".
 *
 * Rules learned on TEST:
 *   - step 1: the request is built on one of the investor's EXPLORATION licences ("رخصة الكشف"); the minerals list
 *     offers only that licence's minerals. Saving step 1 (Next) creates the request (ActionCreateOrUpdate_MiningLicenseRequest_BL);
 *   - step 2: the licence's own corners are pre-filled. "استخدم نفس موقع رخصة الاستكشاف" was refused by the map
 *     ("الموقع خارج المنطقة المرخصة", licences 20260311378 / 380), and a licence over the max area (1 km²) opens on
 *     "حدد جزءًا من الموقع". The part is a shrunken copy of the licence polygon (always inside it when the licence is
 *     convex), typed into the degree/minute/second inputs, then "انظر على الخريطة" → map SmallMines_Taadeen.html →
 *     "تأكيد" → "نجاح". Without the confirmation Next says "رجاء الضغط على زر تأكيد على الخريطة للاستمرار";
 *   - step 3: "الفريق الفني" needs members (one per position is used) and "المستشار الفني" at least 10 years;
 *   - popups: "إضافة" / "إضافة جديدة" open a dialog; in the rehabilitation programmes a grey "إضافة" first adds the
 *     equipment line, the primary "إضافة" saves;
 *   - step 10 "الدفع": tick the fee acknowledgement, "إرسال" → dialog "تم إرسال طلب رخصة منجم صغير بنجاح … رقم الطلب #n
 *     الرقم المرجعي لنظام سداد #bill". The request stays "بإنتظار الدفع" (no To-Do task) until that bill is paid.
 */
export class SmallMiningLicensePage extends BasePage {
  readonly wizard: Wizard;
  readonly attempts: SmallMiningLocationAttempt[] = [];

  constructor(page: Page) {
    super(page, 'investor');
    this.wizard = new Wizard(page);
  }

  private stepBlock(block: string): Locator {
    return this.page.locator(`[data-block="MiningRequestSteps.${block}"]`);
  }

  /** The wizard (new or an opened draft) is shown and its first data load has finished. */
  async expectLoaded(): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(/\/New_Mining_License\?/, { waitUntil: 'commit', timeout: 150_000 });
    await expect(this.wizard.steps.first()).toBeVisible({ timeout: 150_000 });
    await expect(this.wizard.nextButton).toBeVisible({ timeout: 150_000 });
    await activity.idle(1_000, 120_000);
  }

  /** Label of the active step, trimmed (the app adds a trailing space to some). */
  async activeStep(): Promise<string> {
    return (await this.wizard.activeName()).trim();
  }

  /** Next; throws the app's own rules when it refuses. Returns the new step's label. */
  async next(): Promise<string> {
    const change = await this.wizard.next(180_000);
    if (!change.moved) throw new WizardValidationError(change.from.trim(), splitRules(change.errors));
    log.info(`"${change.from.trim()}" → "${change.to.trim()}"`);
    return change.to.trim();
  }

  // ------------------------------------------------------------------ step 1

  /**
   * Step 1 "معلومات الرخصة": declarations, exploration licence, duration, minerals. Only what is missing or different
   * is changed, so an opened draft keeps its data. Returns the exploration licence and minerals used.
   */
  async fillLicenceInformation(explorationLicence: string, d: SmallMiningLicenseData['licenceInformation']): Promise<{ licence: string; minerals: string[] }> {
    const step = this.stepBlock('LicenseInformation');
    await expect(step).toBeVisible({ timeout: 150_000 });
    const applyAll = step.getByRole('button', { name: 'تطبيق على الكل', exact: true });
    // The declarations stay locked while the company fails an eligibility check ("التحقق من الأهلية").
    await expect(applyAll, 'Declarations are locked — the company fails an eligibility check').toBeEnabled({ timeout: 90_000 });
    if (await step.locator('[data-block$="Declaration"] input[type=checkbox]:not(:checked)').count()) await applyAll.click();
    await expect(step.locator('[data-block$="Declaration"] input[type=checkbox]:not(:checked)')).toHaveCount(0);

    const select = step.locator('select[id$="Dropdown_LicenseId"]');
    const offered = (await select.locator('option').allInnerTexts()).map((t) => t.trim()).slice(1);
    const licence = explorationLicence || offered[0];
    if (!licence) throw new Error('The investor has no exploration licence ("رخصة الكشف") to base a small mine licence on.');
    if (!offered.includes(licence)) {
      throw new Error(`Exploration licence ${licence} is not offered to this investor. Offered: ${offered.join(', ')}`);
    }
    const current = await select.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.text.trim() ?? '');
    if (current !== licence) {
      const activity = trackServerActivity(this.page);
      await select.selectOption({ label: licence });
      await activity.idle(1_000);
    }

    const duration = step.locator('select[id$="LicenseDurationDropdown"]');
    if (await duration.isEnabled()) {
      const chosen = await duration.evaluate((el: HTMLSelectElement) => (el.selectedIndex > 0 ? el.selectedOptions[0].text.trim() : ''));
      if (chosen !== d.durationYears) await duration.selectOption({ label: d.durationYears });
    }

    const minerals = new MultiSelect(step.locator('[data-block="Common.Minerals_DD"] [role=combobox]').first());
    let picked = await minerals.selected();
    if (d.minerals.length ? d.minerals.some((m) => !picked.includes(m)) : !picked.length) picked = await minerals.select(d.minerals);
    await trackServerActivity(this.page).idle(800);
    log.info(`Step 1: exploration licence ${licence} · ${d.durationYears} yr · ${picked.join(', ')}`);
    return { licence, minerals: picked };
  }

  /** Saves step 1 (Next) and returns the request number the server assigned. */
  async saveLicenceInformation(): Promise<string> {
    const saved = this.page.waitForResponse((r) => r.url().includes('/ActionCreateOrUpdate_MiningLicenseRequest_BL'), { timeout: 180_000 });
    await this.next();
    const body = await (await saved).json();
    const number = String(body?.data?.Out_NUM_LicenseRequestId ?? '');
    if (!/^\d+$/.test(number) || number === '0') throw new Error(`Step 1 was saved without a request number: ${JSON.stringify(body?.data)}`);
    return number;
  }

  // ------------------------------------------------------------------ step 2

  /** Corners shown in the coordinates table (X = longitude, Y = latitude; the last row closes the ring). */
  private async corners(): Promise<(LatLon & { prefix: string })[]> {
    return this.stepBlock('LicenseLocation')
      .locator('input[id$="-X_DG"]')
      .evaluateAll((els) =>
        els.map((x) => {
          const prefix = x.id.slice(0, -'X_DG'.length);
          const v = (s: string) => Number((document.getElementById(prefix + s) as HTMLInputElement | null)?.value ?? 'NaN');
          return { lon: v('X_DG') + v('X_MN') / 60 + v('X_SC') / 3600, lat: v('Y_DG') + v('Y_MN') / 60 + v('Y_SC') / 3600, prefix };
        }),
      );
  }

  private mapFrame(): Frame | undefined {
    return this.page.frames().find((f) => /MapComponent\/SmallMines/.test(f.url()));
  }

  /**
   * Step 2 "موقع الرخصة": requests a PART of the exploration licence below `maxAreaKm2` — the licence polygon shrunk
   * around its centre (first attempt) or one of its corners (next attempts, in case a part overlaps an existing
   * request), written as degrees/minutes/seconds, checked on the map and confirmed ("نجاح").
   */
  async fillLocation(d: SmallMiningLicenseData['location']): Promise<void> {
    const step = this.stepBlock('LicenseLocation');
    await expect(step).toBeVisible({ timeout: 150_000 });
    const ring = await this.corners();
    if (ring.length < 4 || ring.some((p) => Number.isNaN(p.lat) || Number.isNaN(p.lon))) {
      throw new Error(`The exploration licence corners could not be read: ${JSON.stringify(ring)}`);
    }
    const full = areaKm2(ring);
    const scale = Math.sqrt(Math.min(d.shareOfLicence, d.maxAreaKm2 / full, 1));
    log.info(`Exploration licence area ${full.toFixed(3)} km² → part ${(full * scale * scale).toFixed(3)} km² (scale ${scale.toFixed(3)})`);

    const part = step.locator('input[type=radio][id$="RadioButton2-input"]');
    if (!(await part.isChecked())) {
      const activity = trackServerActivity(this.page);
      await step.locator('label[for$="RadioButton2-input"]').click();
      await expect(part).toBeChecked();
      await activity.idle(1_000);
    }

    const vertices = ring.slice(0, -1);
    const centre = { lat: vertices.reduce((s, p) => s + p.lat, 0) / vertices.length, lon: vertices.reduce((s, p) => s + p.lon, 0) / vertices.length };
    // Shrinking around a point INSIDE a convex licence keeps the part inside it: the centre first, then each corner.
    const anchors: LatLon[] = [centre, ...vertices];
    for (let attempt = 1; attempt <= d.maxAttempts; attempt++) {
      const anchor = anchors[(attempt - 1) % anchors.length];
      const s = scale / Math.pow(1.25, Math.floor((attempt - 1) / anchors.length)); // smaller after a full round
      const target = ring.map((p) => ({ lat: anchor.lat + (p.lat - anchor.lat) * s, lon: anchor.lon + (p.lon - anchor.lon) * s }));
      const area = areaKm2(target);
      const corners = target.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(' ');
      await this.writeCorners(target);
      const result = await this.checkOnMap(d.mapTimeoutMs);
      this.attempts.push({ attempt, areaKm2: +area.toFixed(4), corners, result });
      if (/نجاح/.test(result) && !/تقاطع|خارج|غير صالح|خطأ|تجاوز/.test(result)) {
        log.info(`Location part ${area.toFixed(3)} km² confirmed on attempt ${attempt} — ${result}`);
        return;
      }
      log.warn(`Map refused attempt ${attempt} (${area.toFixed(3)} km²): ${result}`);
    }
    throw new NoLocationAcceptedError(`No licence part was accepted in ${d.maxAttempts} attempts: ${this.attempts.map((a) => a.result).join(' | ')}`);
  }

  private async writeCorners(target: readonly LatLon[]): Promise<void> {
    const rows = await this.corners();
    if (rows.length !== target.length) throw new Error(`Expected ${target.length} coordinate rows, found ${rows.length}`);
    for (let i = 0; i < rows.length; i++) {
      const [xd, xm, xs] = dms(target[i].lon);
      const [yd, ym, ys] = dms(target[i].lat);
      for (const [suffix, value] of [['X_DG', xd], ['X_MN', xm], ['X_SC', xs], ['Y_DG', yd], ['Y_MN', ym], ['Y_SC', ys]] as const) {
        const input = this.page.locator(`[id="${rows[i].prefix}${suffix}"]`);
        await input.fill(String(value));
        await input.press('Tab');
      }
    }
    await trackServerActivity(this.page).idle(1_000);
  }

  /** "انظر على الخريطة" → waits for the map's verdict → "تأكيد". Returns the messages shown. */
  private async checkOnMap(timeout: number): Promise<string> {
    const previous = this.mapFrame()?.url();
    const close = this.mapFrame()?.getByRole('button', { name: 'إغلاق' });
    if (close && (await close.isVisible().catch(() => false))) await close.dispatchEvent('click');
    const show = this.stepBlock('LicenseLocation').getByRole('button', { name: 'انظر على الخريطة' });
    await show.scrollIntoViewIfNeeded();
    const activity = trackServerActivity(this.page);
    await show.click();
    await activity.idle(1_000);
    let map: Frame | undefined;
    await expect
      .poll(() => (map = this.mapFrame()) !== undefined && map.url() !== previous, { timeout, message: 'The map did not reload with the new coordinates' })
      .toBe(true);
    await this.page.locator('iframe[id$="-iframe"]').scrollIntoViewIfNeeded().catch(() => undefined);
    const confirm = map!.locator('#btnSubmit');
    await expect(confirm).toBeAttached({ timeout });
    // "تأكيد" can start enabled and be disabled by the async validation: wait for an error or a stable enabled state.
    let verdict = '';
    let enabledSince = 0;
    await expect
      .poll(
        async () => {
          const errors = await map!.getByRole('heading').allInnerTexts().catch(() => [] as string[]);
          if (errors.length) return (verdict = errors.join(' | '));
          if (!(await confirm.isEnabled().catch(() => false))) enabledSince = 0;
          else if (!enabledSince) enabledSince = Date.now();
          else if (Date.now() - enabledSince > 4_000) return (verdict = 'ok');
          return '';
        },
        { timeout, intervals: [500], message: 'The map neither enabled "تأكيد" nor reported an error' },
      )
      .not.toBe('');
    if (verdict !== 'ok') return verdict;
    const toasts = await this.feedback.count();
    await confirm.dispatchEvent('click');
    let message = '';
    await expect
      .poll(async () => (message = [...(await this.feedback.textsSince(toasts)), ...(await map!.getByRole('heading').allInnerTexts().catch(() => [] as string[]))].join(' | ')), {
        timeout,
        intervals: [1_000],
        message: 'The map showed no result after "تأكيد"',
      })
      .not.toBe('');
    return message;
  }

  // ------------------------------------------------------------------ steps 3–9

  /**
   * Fills the active study step (3–9): every empty field (autoFill), then every "إضافة" section whose table is still
   * empty through its popup, and "الفريق الفني" with one member per position.
   */
  async fillCurrentStep(d: SmallMiningLicenseData): Promise<string[]> {
    const label = await this.activeStep();
    const block = SMALL_MINING_STEPS[label];
    if (!block) throw new Error(`Unknown small mine wizard step "${label}"`);
    const step = this.stepBlock(block);
    await expect(step).toBeVisible({ timeout: 150_000 });
    await trackServerActivity(this.page).idle(1_000, 120_000);
    const values = d.values[block] ?? {};
    const filled = await autoFill(step, { attachment: d.attachment, values });
    // "المرفقات" is optional; its "إضافة" adds an inline row (type + file), not a popup — nothing more to add.
    if (block === 'Attachments') return filled;

    // "تفاصيل الاعمال التطويرية" has fixed rows; its "إضافة" adds another (empty) row — not a popup.
    const openers = step.locator('button:not([data-block$="DevelopmentWork"] button)').filter({ hasText: /إضافة/ }).filter({ visible: true });
    const count = await openers.count();
    for (let i = 0; i < count; i++) {
      const opener = openers.nth(i);
      if (await opener.evaluate((el) => !!el.closest('[data-block$="TechnicalTeam"]'))) {
        filled.push(...(await this.addTechnicalTeam(opener, d)));
        continue;
      }
      const rows = await this.rowsOf(opener);
      if (rows > 0) continue;
      filled.push(`popup: ${await this.addRow(opener, d)}`);
    }
    filled.push(...(await autoFill(step, { attachment: d.attachment, values })));
    log.info(`"${label}": ${filled.length} change(s)`);
    return filled;
  }

  /** Rows of the table a "إضافة" button belongs to: the nearest table before it, unless another "إضافة" is in between. */
  private rowsOf(opener: Locator): Promise<number> {
    return opener.evaluate((el) => {
      const count = (t: Element) =>
        Array.from(t.querySelectorAll('tbody tr')).filter(
          (tr) => tr.getClientRects().length > 0 && tr.querySelectorAll('td').length > 1 && !/لا يوجد|لا توجد|No items/.test(tr.textContent ?? ''),
        ).length;
      const hasAdd = (e: Element) => Array.from(e.querySelectorAll('button')).some((b) => /إضافة/.test(b.textContent ?? ''));
      let node: Element | null = el;
      while (node && !node.matches('[data-block^="MiningRequestSteps."]')) {
        for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
          if (hasAdd(s)) return 0;
          const table = s.matches('table') ? s : s.querySelector('table');
          if (table) return count(table);
        }
        node = node.parentElement;
      }
      return 0;
    });
  }

  private async addTechnicalTeam(opener: Locator, d: SmallMiningLicenseData): Promise<string[]> {
    const team = this.page.locator('[data-block="BusinessFeasibility.TechnicalTeam"]');
    const have = (await team.locator('tbody tr td:first-child').allInnerTexts()).map((t) => t.trim());
    const added: string[] = [];
    for (const position of d.technicalTeam) {
      if (have.includes(position)) continue;
      await this.addRow(opener, d, { DropdownPosition: position });
      added.push(`الفريق الفني: ${position}`);
    }
    return added;
  }

  /** Opens a "إضافة" popup, fills it, saves it. Returns the popup title. */
  private async addRow(opener: Locator, d: SmallMiningLicenseData, extra: Record<string, string> = {}): Promise<string> {
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).last();
    // Some "إضافة" buttons add an inline row instead of opening a popup; the step's next autoFill fills that row.
    if (!(await dialog.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false))) return 'inline row';
    await trackServerActivity(this.page).idle(1_000);
    const title = (await dialog.innerText()).trim().split('\n')[0];
    await autoFill(dialog, { attachment: d.attachment, values: { ...d.popupValues, ...extra } });
    const lineAdd = dialog.locator('button:not(.btn-primary)').filter({ hasText: /^\s*إضافة\s*$/ });
    if (await lineAdd.count()) {
      // Line-based popup: the grey "إضافة" adds the line, the primary one saves.
      const rows = await dialog.locator('tbody tr').count();
      await lineAdd.first().click();
      await expect.poll(() => dialog.locator('tbody tr').count(), { message: `"${title}": the line was not added` }).toBeGreaterThan(rows);
    }
    const toasts = await this.feedback.count();
    await dialog.getByRole('button', { name: 'إضافة', exact: true }).last().click();
    if (!(await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => true, () => false))) {
      const errors = [...(await inlineErrors(dialog)), ...(await this.feedback.textsSince(toasts))];
      throw new WizardValidationError(`popup "${title}"`, errors.length ? errors : ['the popup stayed open after "إضافة"']);
    }
    await trackServerActivity(this.page).idle(800);
    return title;
  }

  // ------------------------------------------------------------------ step 10

  /**
   * Step 10 "الدفع": ticks the fee acknowledgement and presses "إرسال". Reads the request number and the SADAD bill
   * from the success dialog, then leaves it.
   */
  async submit(): Promise<SmallMiningSubmission> {
    const step = this.stepBlock('Payment');
    await expect(step).toBeVisible({ timeout: 150_000 });
    const text = (await step.innerText()).replace(/\s+/g, ' ');
    const fee = text.match(/(رسوم[^\d]{0,40}?)\s*([\d,]+)/);
    const box = step.locator('input[type=checkbox]');
    if (!(await box.isChecked())) await box.check({ force: true });
    const submit = this.wizard.submitButton;
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    const toasts = await this.feedback.count();
    await submit.click();
    const success = this.page.getByRole('dialog').filter({ hasText: /رقم الطلب\s*#\s*\d+/ });
    let errors: string[] = [];
    await expect
      .poll(async () => (await success.isVisible()) || (errors = await this.feedback.textsSince(toasts)).length > 0, {
        timeout: 300_000,
        intervals: [1_000],
        message: '"إرسال" showed neither the success dialog nor an error',
      })
      .toBe(true);
    if (!(await success.isVisible())) throw new WizardValidationError('الدفع › إرسال', splitRules(errors));
    const message = (await success.innerText()).replace(/\s+/g, ' ');
    const requestNumber = message.match(/رقم الطلب\s*#\s*(\d+)/)?.[1] ?? '';
    const billId = message.match(/سداد\s*#\s*(\d{6,})/)?.[1] ?? '';
    if (!billId) throw new Error(`No SADAD bill in the success dialog: "${message}"`);
    log.info(`Submitted — ${message.slice(0, 160)}`);
    const back = success.getByText('العودة إلى الصفحة الرئيسية');
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await expect(success).toBeHidden({ timeout: 60_000 });
    }
    return { requestNumber, billId, amount: fee ? Number(fee[2].replace(/,/g, '')) : 0, description: fee?.[1].trim() ?? 'رسوم تقديم الرخصة' };
  }
}
