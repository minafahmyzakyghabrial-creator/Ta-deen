import fs from 'fs';
import path from 'path';
import { expect, Frame } from '@playwright/test';
import { FeedbackMessage } from '@components/FeedbackMessage';
import { NewExplorationRequestData } from '@data/new-exploration-request.data';
import { generateKml, RegionKey, SAUDI_REGIONS } from '@utils/kml-generator';
import { createLogger } from '@utils/logger';
import { WizardStep } from './WizardStep';

const gisLog = createLogger('GIS');

export interface LocationAttempt {
  readonly attempt: number;
  readonly region: string;
  readonly file: string;
  readonly result: string;
}

/**
 * Step 2 — "موقع الطلب": upload a generated KML, check it on the GIS map, confirm.
 *
 * VERIFIED on TEST (2026-10-26, draft 76111):
 *   - radios "تسجيل الإحداثيات" / "تحميل ملف"; upload = input[type=file][accept=".KML"] (max 1 MB),
 *     parsed by …/ActionBinaryDataToText into degree/minute/second rows;
 *   - "انظر على الخريطة" loads an iframe ugisw.taadeen.dev/MapComponent/<Outside|Inside>.html?object=…;
 *   - in the iframe: button #btnSubmit "تأكيد"; problems show as an <h2> + "إغلاق":
 *       "الإحداثيات عكس اتجاه عقارب الساعة غير مسموحة"  → ring must be clockwise (generator default)
 *       "تقاطع المواقع" / "يوجد موقع متقاطع"            → overlaps an existing site → new location
 *   - TRAP: "تأكيد" starts ENABLED and is disabled only when the async validation finishes, so it
 *     is clicked only after staying enabled with no error for a settle period.
 */
export class LocationStep extends WizardStep<NewExplorationRequestData['location']> {
  readonly name = 'موقع الطلب';
  readonly attempts: LocationAttempt[] = [];
  private static readonly SETTLE_MS = 4_000;

  private get feedback(): FeedbackMessage {
    return new FeedbackMessage(this.page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByRole('radio', { name: 'تحميل ملف' })).toBeVisible({ timeout: 60_000 });
  }

  private mapFrame(previousUrl?: string): Frame | undefined {
    return this.page.frames().find((f) => /MapComponent\//.test(f.url()) && f.url() !== previousUrl);
  }

  private async uploadKml(file: string): Promise<void> {
    const parsed = this.page.waitForResponse((r) => r.url().includes('ActionBinaryDataToText'), { timeout: 30_000 });
    await this.page.locator('input[type=file][accept=".KML"]').setInputFiles(file);
    await parsed;
    await expect(this.page.getByRole('button', { name: 'انظر على الخريطة' }).or(this.page.getByText('انظر على الخريطة', { exact: true })).first()).toBeVisible();
  }

  /** Waits until the map either reports an error (returned) or keeps "تأكيد" enabled for SETTLE_MS (undefined). */
  private async validate(map: Frame, timeout: number): Promise<string | undefined> {
    let verdict: string | undefined | null = null;
    let enabledSince = 0;
    await expect
      .poll(
        async () => {
          const errors = await map.getByRole('heading', { level: 2 }).allInnerTexts().catch(() => []);
          if (errors.length) return (verdict = errors.join(' | '));
          const enabled = await map.locator('#btnSubmit').isEnabled().catch(() => false);
          if (!enabled) enabledSince = 0;
          else if (!enabledSince) enabledSince = Date.now();
          else if (Date.now() - enabledSince >= LocationStep.SETTLE_MS) return (verdict = undefined);
          return null;
        },
        { timeout, intervals: [500], message: 'The GIS map neither confirmed nor reported an error' },
      )
      .not.toBeNull();
    return verdict ?? undefined;
  }

  protected async fillStep(d: NewExplorationRequestData['location']): Promise<void> {
    await this.page.locator('label').filter({ hasText: /^\s*تحميل ملف\s*$/ }).first().click();
    await expect(this.page.getByRole('radio', { name: 'تحميل ملف' })).toBeChecked();

    const outDir = path.resolve('test-data', 'kml', 'generated');
    fs.mkdirSync(outDir, { recursive: true });
    const allRegions = Object.keys(SAUDI_REGIONS) as RegionKey[];

    for (let attempt = 1; attempt <= d.maxAttempts; attempt++) {
      const region = d.regions[attempt - 1] ?? allRegions[Math.floor(Math.random() * allRegions.length)];
      const kml = generateKml({ region, widthKm: d.widthKm, heightKm: d.heightKm, name: `Automation ${Date.now()}` });
      const file = path.join(outDir, `attempt-${attempt}-${kml.center.lat}_${kml.center.lon}.kml`);
      fs.writeFileSync(file, kml.kml);
      gisLog.info(`Attempt ${attempt}: ${kml.region} — centre ${kml.center.lat}, ${kml.center.lon}`);

      // Close a previous error dialog on the map before uploading again.
      const previous = this.mapFrame();
      const close = previous?.getByRole('button', { name: 'إغلاق' });
      // The map often sits below the page viewport, where a real click fails ("outside of the viewport").
      if (close && (await close.isVisible().catch(() => false))) await close.dispatchEvent('click');

      await this.uploadKml(file);
      await this.page.getByText('انظر على الخريطة', { exact: true }).first().click();
      let map: Frame | undefined;
      await expect.poll(() => (map = this.mapFrame(previous?.url())) !== undefined, { timeout: d.mapTimeoutMs }).toBe(true);
      await expect(map!.locator('#btnSubmit')).toBeAttached({ timeout: d.mapTimeoutMs });

      const error = await this.validate(map!, d.mapTimeoutMs);
      if (error) {
        gisLog.warn(`Map rejected attempt ${attempt}: ${error}`);
        this.attempts.push({ attempt, region: kml.region, file, result: error });
        continue;
      }

      const toastsBefore = await this.feedback.count();
      await map!.locator('#btnSubmit').click();
      // "تأكيد" saves the location through several slow applyEdits calls (the first started ~11 s after the
      // click on TEST, 2026-10-26) and only then shows a message ("نجاح" on success, a heading inside the map).
      // Moving on before it appears leaves the location unsaved ("رجاءاً تحديد الموقع" on Next).
      const readMessage = async () =>
        [...(await this.feedback.textsSince(toastsBefore)), ...(await map!.getByRole('heading').allInnerTexts().catch(() => []))].join(' | ');
      let message = '';
      await expect
        .poll(async () => (message = await readMessage()), {
          timeout: d.mapTimeoutMs,
          intervals: [500],
          message: 'The GIS map showed no result after "تأكيد" — the location was not saved',
        })
        .not.toBe('');
      if (/تقاطع|عكس اتجاه|غير مسموح|خطأ/.test(message)) {
        gisLog.warn(`Map rejected attempt ${attempt} after "تأكيد": ${message}`);
        this.attempts.push({ attempt, region: kml.region, file, result: message });
        continue;
      }
      gisLog.info(`"تأكيد" accepted on attempt ${attempt} — ${message}`);
      this.attempts.push({ attempt, region: kml.region, file, result: message });
      this.record(`موقع الطلب = ${path.basename(file)} (attempt ${attempt})`, 'filled');
      return;
    }
    throw new Error(
      `No generated location was accepted in ${d.maxAttempts} attempts:\n` + this.attempts.map((a) => `  ${a.attempt}. ${a.region}: ${a.result}`).join('\n'),
    );
  }
}
