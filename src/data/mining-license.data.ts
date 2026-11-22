import { defaultSmallMiningLicenseData, SmallMiningLicenseData } from './small-mining-license.data';
import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Test data for "إصدار رخصة تعدين" (mining licence, /Licenses_MSM/New_Mining_License?In_LicenseType=8).
 * Same 10-step wizard as the small mine licence, so it starts from the small mine defaults and changes only what differs.
 * Override any key in  test-data/common/mining-license.json  or  test-data/<env>/mining-license.json
 */
export type MiningLicenseData = SmallMiningLicenseData;

export function defaultMiningLicenseData(): MiningLicenseData {
  const small = defaultSmallMiningLicenseData();
  return {
    ...small,
    serviceType: 'إصدار رخصة تعدين',
    // "مدة الرخصة (سنوياً)" offers 1 … 30 (TEST 2026-11-16).
    licenceInformation: { ...small.licenceInformation, durationYears: '5' },
    // Step 2 opens on "استخدم نفس موقع رخصة الاستكشاف" (TEST 2026-11-16, licence 20260311392): try that first — it was
    // refused ("الموقع خارج المنطقة المرخصة") — then a part. Next accepts a mining licence area of 1–50 km² only
    // ("المساحة المسموحة حسب الكفاية الفنية يجب أن لاتقل عن 1 كيلو متر مربع ولا تزيد عن 50 كيلو متر مربع"):
    // 60 % of a 3 km² licence = 1.8 km², still above 1 km² after the smaller second round of attempts.
    location: { ...small.location, maxAreaKm2: 50, shareOfLicence: 0.6, preferWholeLicence: true },
  };
}

export function miningLicenseData(): MiningLicenseData {
  return deepMerge(defaultMiningLicenseData(), loadOptionalTestData<MiningLicenseData>('mining-license'));
}
