import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Test data for "إصدار رخصة منجم صغير" (small mine licence, /Licenses_MSM/New_Mining_License?In_LicenseType=13).
 * Every default below was accepted on TEST on 2026-11-15 (request 77270 submitted, exploration licence 20260311381).
 * Override any key in  test-data/common/small-mining-license.json  or  test-data/<env>/small-mining-license.json
 *
 * Values for the long study steps (3–9) are filled by autoFill (src/utils/auto-fill.ts): every EMPTY visible field gets
 * a number / text / first option / attachment. `values` maps an element-id suffix to the value it must get instead.
 */
export interface SmallMiningLicenseData {
  readonly serviceType: string;
  readonly attachment: string;
  readonly licenceInformation: {
    /** "مدة الرخصة (سنوياً)": '1' … '20'. */
    readonly durationYears: string;
    /** "المعادن": empty = the first mineral the exploration licence offers. */
    readonly minerals: readonly string[];
  };
  readonly location: {
    /** The licence part must stay under the map's max area (the map is opened with dblMaxArea=1 km²). */
    readonly maxAreaKm2: number;
    /** Part of the exploration licence area to request (0–1), capped by maxAreaKm2. */
    readonly shareOfLicence: number;
    /** Sub-areas tried (centre, then each corner of the licence) before giving up. */
    readonly maxAttempts: number;
    readonly mapTimeoutMs: number;
    /**
     * When the step opens on "استخدم نفس موقع رخصة الاستكشاف" (licence within the map's max area — mining licence,
     * TEST 2026-11-16), try the whole exploration licence first; a part is requested only if the map refuses it.
     */
    readonly preferWholeLicence?: boolean;
  };
  /** Per step block (data-block name after "MiningRequestSteps.") — element-id suffix → value. */
  readonly values: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** "الفريق الفني" (step 3): one member per position. */
  readonly technicalTeam: readonly string[];
  /** Values used inside the "إضافة" popups (element-id suffix → value). */
  readonly popupValues: Readonly<Record<string, string>>;
}

export function defaultSmallMiningLicenseData(): SmallMiningLicenseData {
  return {
    serviceType: 'إصدار رخصة منجم صغير',
    attachment: 'test-data/attachments/sample.pdf',
    licenceInformation: { durationYears: '5', minerals: [] },
    location: { maxAreaKm2: 0.9, shareOfLicence: 0.5, maxAttempts: 8, mapTimeoutMs: 5 * 60_000 },
    values: {
      FeasibilityStudy: {
        // "المستشار الفني" → سنوات الخبرة: 5 was refused, 10 accepted (TEST 2026-11-15).
        Input_YearsExperience4: '10',
        LifeofMine: '5',
        Input_Duration: '3',
      },
    },
    technicalTeam: ['مدير المناجم', 'مهندس تعدين', 'كبير الجيولوجيين', 'جيولوجي', 'مدير البيئة', 'مسؤول العلاقات المجتمعية', 'مساح الألغام (تحت الأرض)'],
    popupValues: { YearsExperience: '5' },
  };
}

export function smallMiningLicenseData(): SmallMiningLicenseData {
  return deepMerge(defaultSmallMiningLicenseData(), loadOptionalTestData<SmallMiningLicenseData>('small-mining-license'));
}
