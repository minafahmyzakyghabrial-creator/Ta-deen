import fs from 'fs';
import path from 'path';
import { expect, Frame, Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { Wizard } from '@components/Wizard';
import { AddRowDialog } from '@components/AddRowDialog';
import { MultiSelect } from '@components/MultiSelect';
import { PublicProjectLicenseData } from '@data/public-project-license.data';
import { pickDate } from '@utils/field-helper';
import { generateKml } from '@utils/kml-generator';
import { createLogger } from '@utils/logger';
import { trackServerActivity } from '@utils/os-waits';
import { splitRules, WizardValidationError } from '@utils/validation';

const log = createLogger('PublicProjects');

export interface LocationAttempt {
  readonly attempt: number;
  readonly projectCentre: string;
  readonly result: string;
}

export class NoLocationAcceptedError extends Error {}

/** "إرسال" refused a location the licence map had accepted. */
export class LocationRefusedAtSubmitError extends WizardValidationError {}
const SUBMIT_LOCATION_ERROR = /يتعلق بالموقع|إحداثيات الخريطة/;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Today ± months, day clamped to 28 so every month has it. */
const monthsFromToday = (months: number): string => {
  const t = new Date();
  return iso(new Date(t.getFullYear(), t.getMonth() + months, Math.min(t.getDate(), 28)));
};

/**
 * "إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" — investor wizard
 * (/Licenses_PublicProjects/New_PublicProjects_Request?…&LicenseTypeId=29). VERIFIED end to end on TEST 2026-11-05
 * (request 76846). Steps: معلومات الرخصة | موقع الرخصة | خطة العمل والإنفاق | دراسة الأثر البيئي | المرفقات |
 * الشروط والأحكام. Next shows "يجب تعبئة جميع الحقول الإلزامية بشكل صحيح للإنتقال للتالي" for any missing field.
 *
 * Traps handled here:
 *   - dates are picked through the calendar (see pickDate); the licence expiry unlocks only after the whole
 *     "معلومات المشروع" section is filled, and the contract start cannot be in the future;
 *   - Virtual-Select lists (minerals, extraction method) report aria-disabled="true" even when usable → forced click;
 *   - step 2 has TWO locations: the project (view-only map, view.html) and the licence (PublicProject.html map with
 *     "تأكيد", max 0.25 km², must lie OUTSIDE the project area — inside it is reported as "تقاطع المواقع");
 *   - "إضافة" popups: equipment is line-based (inner "إضافة " adds a line, exact "إضافة" saves); closing with X
 *     discards the line ("يجب إضافة معدة واحدة على الأقل");
 *   - ticking a water / energy source reveals its required monthly quantity;
 *   - the final button is "إرسال" (no "-Submit" id), enabled only after the terms checkbox.
 */
export class PublicProjectLicensePage extends BasePage {
  readonly wizard: Wizard;
  readonly attempts: LocationAttempt[] = [];

  constructor(page: Page) {
    super(page, 'investor');
    this.wizard = new Wizard(page);
  }

  protected block(name: string): Locator {
    return this.page.locator(`[data-block="${name}"]`);
  }

  protected step(name: string): Locator {
    return this.block(`PublicProjects_Steps.${name}`);
  }

  async expectNewLoaded(): Promise<void> {
    await this.page.waitForURL(/\/New_PublicProjects_Request\?/, { timeout: 60_000 });
    await expect(this.step('Step1_LicenseInformation').getByRole('textbox', { name: '*اسم المشروع' })).toBeVisible({ timeout: 60_000 });
    // The screen keeps loading its data after the fields appear; typing before that ends is wiped
    // (اسم المشروع came back empty on TEST 2026-11-05, which keeps the licence expiry locked).
    await trackServerActivity(this.page).idle();
  }

  /** Next; throws the app's own rules when it refuses. */
  async next(): Promise<string> {
    const change = await this.wizard.next(180_000);
    if (!change.moved) throw new WizardValidationError(change.from, splitRules(change.errors));
    log.info(`"${change.from}" → "${change.to}"`);
    return change.to;
  }

  /** Opens a Virtual-Select (forced: it reports aria-disabled even when usable) and picks one option by exact text. */
  private async chooseOption(combo: Locator, label: string): Promise<void> {
    await combo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await combo.click({ force: true });
    const option = this.page.locator('.vscomp-option').filter({ visible: true }).filter({ hasText: label }).first();
    await expect(option, `Option "${label}" is not offered`).toBeVisible({ timeout: 30_000 });
    const activity = trackServerActivity(this.page);
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.locator('body').click({ position: { x: 5, y: 300 } });
    await activity.idle();
  }

  /** Uploads `file` into every empty slot of an attachments block (each upload removes one file input). */
  private async uploadAllIn(block: Locator, file: string): Promise<number> {
    let uploaded = 0;
    for (;;) {
      const inputs = block.locator('input[type=file]');
      const before = await inputs.count();
      if (!before) return uploaded;
      const activity = trackServerActivity(this.page);
      await inputs.first().setInputFiles(path.resolve(file));
      await expect(inputs).toHaveCount(before - 1, { timeout: 60_000 });
      await activity.idle();
      uploaded++;
    }
  }

  /**
   * Ticks the "التعهدات" declarations of a step — only inside the accordion that has "تطبيق على الكل".
   * Not the whole step: step 4's water / energy source checkboxes each reveal another required quantity.
   */
  protected async tickDeclarations(step: Locator): Promise<void> {
    const applyAll = this.page.getByRole('button', { name: 'تطبيق على الكل', exact: true });
    const scope = step.locator('[role=tab]').filter({ has: applyAll }).last();
    const unticked = scope.getByRole('checkbox', { checked: false }).filter({ visible: true });
    if (await unticked.count()) await scope.getByRole('button', { name: 'تطبيق على الكل', exact: true }).first().click();
    while (await unticked.count()) await unticked.first().check();
  }

  /** Step 1 "معلومات الرخصة": project information, dates, mineral and quantity, declarations. */
  async fillLicenceInformation(d: PublicProjectLicenseData['step1']): Promise<void> {
    const s1 = this.step('Step1_LicenseInformation');
    const projectFields: [Locator, string][] = [
      [s1.getByRole('textbox', { name: '*اسم المشروع' }), d.projectName],
      [s1.getByRole('textbox', { name: '*رقم العقد' }), `AUTO-${Date.now()}`],
      [s1.getByRole('spinbutton', { name: '*قيمة العقد' }), d.contractValue],
    ];
    // Refill anything a late data load cleared; the licence expiry stays locked while one is empty.
    for (let pass = 0; pass < 3; pass++) {
      let refilled = false;
      for (const [field, value] of projectFields) {
        if ((await field.inputValue()).trim()) continue;
        await field.fill(value);
        await field.press('Tab');
        refilled = true;
      }
      if (!refilled) break;
      await trackServerActivity(this.page).idle();
    }
    const t = new Date();
    await pickDate(s1.locator('input[id$="Input_ContractStartDate"]'), iso(new Date(t.getFullYear(), t.getMonth() - d.contractStartMonthsAgo, 1)));
    const end = monthsFromToday(d.durationMonths);
    await pickDate(s1.locator('input[id$="Input_ContractExpiryDate"]'), end);
    await expect(s1.locator('input[id$="Input_LicenseExpiryDate2"]'), 'Licence expiry stays locked until the project section is complete').toBeEnabled({ timeout: 30_000 });
    await pickDate(s1.locator('input[id$="Input_LicenseExpiryDate2"]'), end);
    await this.chooseOption(this.block('LicenseInformation.MineralsClassC_DDL').locator('[role=combobox]').first(), d.mineral);
    const quantity = s1.locator('input[id$="Input_Wells_Amount"]').first();
    await expect(quantity).toBeVisible({ timeout: 30_000 });
    await quantity.fill(d.mineralQuantity);
    await quantity.press('Tab');
    await this.tickDeclarations(s1);
  }

  /**
   * Step 2 "موقع الرخصة": project KML (view-only map) + licence KML east of it (map with "تأكيد").
   * Retries new random locations while the licence map reports an error such as "تقاطع المواقع".
   */
  async fillLocation(d: PublicProjectLicenseData['location']): Promise<void> {
    const dir = path.resolve('test-data', 'kml', 'generated');
    fs.mkdirSync(dir, { recursive: true });
    for (let round = 1; round <= d.maxAttempts; round++) {
      // Numbered across calls, so a resubmit's locations follow the earlier ones in `attempts`.
      const attempt = this.attempts.length + 1;
      const fixed = d.projectCentres?.[attempt - 1];
      const project = generateKml({
        ...(fixed ? { center: fixed } : { region: 'saudi' }),
        widthKm: d.projectSideKm,
        heightKm: d.projectSideKm,
        name: `Automation project ${Date.now()}`,
      });
      const lonOffset = d.licenceOffsetKm / (111.32 * Math.cos((project.center.lat * Math.PI) / 180));
      const licence = generateKml({
        center: { lat: project.center.lat, lon: project.center.lon + lonOffset },
        widthKm: d.licenceSideKm,
        heightKm: d.licenceSideKm,
        name: `Automation licence ${Date.now()}`,
      });
      const files = [path.join(dir, `public-project-${attempt}.kml`), path.join(dir, `public-licence-${attempt}.kml`)];
      fs.writeFileSync(files[0], project.kml);
      fs.writeFileSync(files[1], licence.kml);
      const centre = `${project.center.lat}, ${project.center.lon}`;
      log.info(`Location attempt ${attempt}: project centre ${centre}`);

      await this.uploadKml(0, files[0]);
      await this.openMap(0, /MapComponent\/view\.html/, d.mapTimeoutMs);
      await this.uploadKml(1, files[1]);
      await this.openMap(1, /MapComponent\/PublicProject\.html/, d.mapTimeoutMs);
      // The map iframe can reload once after opening; always work on the newest licence map.
      await this.page.waitForTimeout(3_000);
      const map = this.page.frames().filter((f) => /MapComponent\/PublicProject\.html/.test(f.url())).pop()!;
      const result = await this.confirmMap(map, d.mapTimeoutMs);
      this.attempts.push({ attempt, projectCentre: centre, result });
      if (!/تقاطع|خطأ|غير مسموح|تجاوز/.test(result)) {
        log.info(`Licence location confirmed on attempt ${attempt} — ${result}`);
        return;
      }
      log.warn(`Licence map refused attempt ${attempt}: ${result}`);
      const close = map.getByRole('button', { name: 'إغلاق' });
      if (await close.isVisible().catch(() => false)) await close.dispatchEvent('click');
    }
    throw new NoLocationAcceptedError(`No location accepted in ${d.maxAttempts} attempts: ${this.attempts.map((a) => a.result).join(' | ')}`);
  }

  private async uploadKml(index: number, file: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    const parsed = this.page.waitForResponse((r) => r.url().includes('ActionBinaryDataToText'), { timeout: 60_000 });
    await this.page.locator('input[type=file][accept=".KML"]').nth(index).setInputFiles(file);
    await parsed;
    // The coordinate rows render after the parse; opening the map before that loads it without them.
    await activity.idle();
    await this.page.waitForTimeout(2_000);
  }

  private async openMap(index: number, mapPage: RegExp, timeout: number): Promise<Frame> {
    const before = new Set(this.page.frames().map((f) => f.url()));
    const button = this.page.getByRole('button', { name: 'انظر على الخريطة' }).nth(index);
    await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await button.click();
    let map: Frame | undefined;
    await expect
      .poll(() => (map = this.page.frames().find((f) => mapPage.test(f.url()) && !before.has(f.url()))) !== undefined, { timeout, message: `Map ${mapPage} did not load` })
      .toBe(true);
    return map!;
  }

  /** Waits for the licence map's verdict; clicks "تأكيد" when it stays enabled with no error. Returns the message. */
  private async confirmMap(map: Frame, timeout: number): Promise<string> {
    const confirm = map.locator('#btnSubmit');
    await expect(confirm).toBeAttached({ timeout });
    let verdict = '';
    let enabledSince = 0;
    await expect
      .poll(
        async () => {
          const errors = await map.getByRole('heading', { level: 2 }).allInnerTexts().catch(() => [] as string[]);
          if (errors.length) return (verdict = errors.join(' | '));
          if (!(await confirm.isEnabled().catch(() => false))) enabledSince = 0;
          else if (!enabledSince) enabledSince = Date.now();
          else if (Date.now() - enabledSince > 4_000) return (verdict = 'ok');
          return '';
        },
        { timeout, intervals: [500], message: 'The licence map neither confirmed nor reported an error' },
      )
      .not.toBe('');
    if (verdict !== 'ok') return verdict;
    const toastsBefore = await this.feedback.count();
    await confirm.dispatchEvent('click');
    let message = '';
    await expect
      .poll(async () => (message = [...(await this.feedback.textsSince(toastsBefore)), ...(await map.getByRole('heading').allInnerTexts().catch(() => [] as string[]))].join(' | ')), {
        timeout,
        intervals: [1000],
        message: 'The licence map showed no result after "تأكيد"',
      })
      .not.toBe('');
    return message;
  }

  /** Step 3 "خطة العمل والإنفاق". */
  async fillWorkPlan(d: PublicProjectLicenseData['workPlan'], attachment: string): Promise<void> {
    const s3 = this.step('Step3_WorkPlan');
    await pickDate(s3.locator('input[id$="Input_EstablishmentDate"]'), d.establishmentDate);
    const fields: Record<string, string> = {
      ...d.company,
      Input_QuarterOne2: d.quarterTonnes,
      Input_QuarterTwo2: d.quarterTonnes,
      Input_QuarterThree2: d.quarterTonnes,
      Input_QuarterFour2: d.quarterTonnes,
      Input_OperatingCost: d.operatingCost,
    };
    for (const [id, v] of Object.entries(fields)) {
      // Some ids repeat in a hidden copy of the section — fill the visible one.
      const input = s3.locator(`input[id$="${id}"]`).filter({ visible: true }).first();
      await input.fill(v);
      await input.press('Tab');
    }
    await this.chooseOption(this.block('WorkPlan.ProjectDetails').locator('[role=combobox]').first(), d.extractionMethod);

    const years = s3.locator('select[id$="Dropdown_StartYearId"]');
    for (let i = 0; i < (await years.count()); i++) {
      await years.nth(i).selectOption({ index: 1 });
      await s3.locator('select[id$="Dropdown_StartMonthId"]').nth(i).selectOption({ index: Math.min(i + 1, 12) });
      await s3.locator('input[id$="Input_Duration"]').nth(i).fill(d.developmentDurationMonths);
      const cost = s3.locator('input[id$="Input_Cost"]').nth(i);
      await cost.fill(d.developmentCost);
      await cost.press('Tab');
    }

    await this.addEquipment(s3, d.equipment);
    await this.uploadAllIn(this.block('WorkPlan.WorkPlanAttachment'), attachment);
  }

  private async addEquipment(s3: Locator, e: PublicProjectLicenseData['workPlan']['equipment']): Promise<void> {
    const add = s3.locator('button[id$="-Add"]').first();
    await add.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await add.click();
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).last();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.locator('select[id$="EquipmentType"]').selectOption({ index: 1 });
    await dialog.locator('input[id$="InputQuantity"]').fill(e.quantity);
    await dialog.locator('input[id$="Input_AgeEquipment"]').fill(e.age);
    await dialog.locator('select[id$="PropertyType"]').selectOption({ label: e.ownership });
    const value = dialog.locator('input[id$="InputExpectedPrice"]');
    await value.fill(e.value);
    await value.press('Tab');
    // Line-based popup: the first "إضافة" adds the line, the exact "إضافة" saves the popup.
    await dialog.getByRole('button', { name: /إضافة/ }).first().click();
    await expect(dialog.getByRole('row').filter({ hasText: e.ownership })).toBeVisible({ timeout: 15_000 });
    const activity = trackServerActivity(this.page);
    await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await activity.idle();
  }

  /** Step 4 "دراسة الأثر البيئي". */
  async fillEnvironmentalImpact(d: PublicProjectLicenseData['environmental'], attachment: string): Promise<void> {
    const s4 = this.step('Step4_EnvironmentalImpactStudy');
    // Ticking a source reveals its required monthly quantity.
    await s4.locator('input[id$="-Checkbox1"]').first().check();
    await s4.locator('input[id$="ElectricalGridCheckBox"]').check();
    for (const [blockName, value] of [['EnvironmentalImpact.WaterSources_WB', d.monthlyWater], ['EnvironmentalImpact.EnergySources', d.monthlyEnergy]] as const) {
      const quantity = this.block(blockName).locator('input[type=number]').filter({ visible: true }).first();
      await expect(quantity).toBeVisible({ timeout: 15_000 });
      await quantity.fill(value);
      await quantity.press('Tab');
    }
    const closure = s4.locator('input[id$="Input_TotalCost2"]');
    await closure.fill(d.closureCost);
    await closure.press('Tab');
    await this.uploadAllIn(this.block('EnvironmentalImpact.EnvironmentalAttachment'), attachment);

    // Impacts popup: every domain has 3 multi-selects and a "الرصد" select, all required.
    const impacts = this.block('EnvironmentalImpact.ImpactsCausedbyExploitationActivities');
    await impacts.getByRole('button', { name: /إضافة/ }).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await impacts.getByRole('button', { name: /إضافة/ }).first().click();
    const dialog = new AddRowDialog(this.page);
    await dialog.waitOpen();
    const multis = dialog.root.locator('[role=combobox][aria-haspopup=listbox]');
    const domains = await dialog.root.locator('select').count();
    for (let domain = 0; domain < domains; domain++) {
      for (let k = 0; k < 3; k++) await new MultiSelect(multis.nth(domain * 3 + k)).select();
      await dialog.root.locator('select').nth(domain).selectOption({ label: d.monitoring });
    }
    const errors = await dialog.save();
    if (errors.length) throw new WizardValidationError('دراسة الأثر البيئي › الآثار الناجمة عن أنشطة الاستغلال', errors);
    await this.tickDeclarations(s4);
  }

  /** Step 6 "الشروط والأحكام": accept the terms, "إرسال", read the request number from the success dialog. */
  async acceptTermsAndSubmit(): Promise<string> {
    const terms = this.step('Step6_TermsandConditions').getByRole('checkbox');
    for (const box of await terms.all()) if (!(await box.isChecked())) await box.check();
    const submit = this.page.getByRole('button', { name: 'إرسال', exact: true });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    const errorsBefore = await this.feedback.count();
    await submit.click();
    const success = this.page.getByRole('dialog').filter({ hasText: /رقم الطلب\s*#\s*\d+/ });
    let errors: string[] = [];
    await expect
      .poll(async () => (await success.isVisible()) || (errors = await this.feedback.textsSince(errorsBefore)).length > 0, {
        timeout: 120_000,
        message: '"إرسال" showed neither the success dialog nor an error',
      })
      .toBe(true);
    if (!(await success.isVisible())) {
      const rules = splitRules(errors);
      if (rules.some((r) => SUBMIT_LOCATION_ERROR.test(r))) throw new LocationRefusedAtSubmitError('إرسال (Submit)', rules);
      throw new WizardValidationError('إرسال (Submit)', rules);
    }
    const number = (await success.innerText()).match(/#\s*(\d+)/)?.[1] ?? '';
    log.info(`Submitted — request ${number}: ${(await success.innerText()).split('\n')[0]}`);
    // The success dialog stays over the page ("تتبع الطلب" / "العودة إلى الصفحة الرئيسية"); leave it.
    await success.getByText('العودة إلى الصفحة الرئيسية').click();
    await expect(success).toBeHidden({ timeout: 60_000 });
    return number;
  }

  /**
   * acceptTermsAndSubmit; when "إرسال" refuses the location, goes back to "موقع الرخصة", places a new
   * location, walks forward again (steps 3–5 keep their saved data) and resubmits — up to d.submitRetries times.
   */
  async submitRetryingLocation(d: PublicProjectLicenseData['location']): Promise<string> {
    for (let retry = 0; ; retry++) {
      try {
        return await this.acceptTermsAndSubmit();
      } catch (e) {
        if (!(e instanceof LocationRefusedAtSubmitError) || retry >= d.submitRetries) throw e;
        const last = this.attempts.length - 1;
        if (last >= 0) this.attempts[last] = { ...this.attempts[last], result: `${this.attempts[last].result} → refused at submit: ${e.rules.join(' | ')}` };
        log.warn(`"إرسال" refused the location (${e.rules.join(' | ')}) — new location, retry ${retry + 1}/${d.submitRetries}`);
        await this.feedback.closeAll(); // the refusal toast stays open over the step-2 map buttons
        await this.backTo('موقع الرخصة');
        await this.fillLocation(d);
        while ((await this.next()) !== 'الشروط والأحكام');
      }
    }
  }

  /** "السابق" until the named step is active. */
  async backTo(name: string): Promise<void> {
    const target = (await this.wizard.stepNames()).indexOf(name);
    if (target < 0) throw new Error(`The wizard has no step "${name}"`);
    const previous = this.page.getByRole('button', { name: /السابق/ });
    for (let from = await this.wizard.activeIndex(); from > target; from = await this.wizard.activeIndex()) {
      const activity = trackServerActivity(this.page);
      await previous.click();
      await expect
        .poll(async () => { const now = await this.wizard.activeIndex(); return now >= 0 && now < from; }, { timeout: 180_000, message: `"السابق" did not leave step ${from + 1}` })
        .toBe(true);
      await activity.idle();
    }
    log.info(`Back at "${name}"`);
  }
}
