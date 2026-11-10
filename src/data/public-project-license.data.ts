import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Test data for "إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" (public-projects building-materials
 * licence, investor wizard LicenseTypeId=29). Every default below was accepted on TEST on 2026-11-05
 * (request 76846 submitted). Override any key in
 *   test-data/common/public-project-license.json  or  test-data/<env>/public-project-license.json
 */
export interface PublicProjectLicenseData {
  readonly serviceType: string;
  readonly attachment: string;
  readonly step1: {
    readonly projectName: string;
    readonly contractValue: string;
    /** Contract start, in months before today — the picker refuses future start dates. */
    readonly contractStartMonthsAgo: number;
    /**
     * Contract end and licence expiry, in months from today. The licence expiry must be after today and not
     * after the contract end; both are set to the same date. Long periods (12+ months) were refused on TEST.
     */
    readonly durationMonths: number;
    /** Class-ج mineral (exact option label). */
    readonly mineral: string;
    /** Tonnes; must be at least the mineral's minimum capacity (10 000 was refused, 200 000 accepted). */
    readonly mineralQuantity: string;
  };
  readonly location: {
    /** Project area: square of this side (km), random point anywhere in Saudi Arabia. */
    readonly projectSideKm: number;
    /** Licence area: square of this side (km), max 0.25 km² ("تجاوز الحد الأقصى للمساحة"). */
    readonly licenceSideKm: number;
    /** Licence square is placed this far east of the project centre — it must lie OUTSIDE the project area. */
    readonly licenceOffsetKm: number;
    /** New random locations tried when the licence map reports an overlap ("تقاطع المواقع"). */
    readonly maxAttempts: number;
    readonly mapTimeoutMs: number;
    /**
     * The map can accept a location that "إرسال" later refuses ("حدث خطأ يتعلق بالموقع ، يرجى تحديث إحداثيات
     * الخريطة للمتابعة", TEST 2026-11-10). Times to go back to "موقع الرخصة" with a new location and submit again.
     */
    readonly submitRetries: number;
    /** Project centres to use first, in order, across all attempts (e.g. to reproduce a refusal); random after. */
    readonly projectCentres?: readonly { readonly lat: number; readonly lon: number }[];
  };
  readonly workPlan: {
    readonly establishmentDate: string;
    /** "معلومات الشركة الفنية" — field id suffix → value. */
    readonly company: Record<string, string>;
    /** Year-1 production per quarter (tonnes); the 4 quarters should add up to the mineral quantity. */
    readonly quarterTonnes: string;
    /** "طريقة الاستغلال المقترحة" (exact option label). */
    readonly extractionMethod: string;
    /** Every "تفاصيل الأعمال التطويرية" row: year 1, staggered start month, this duration and cost. */
    readonly developmentDurationMonths: string;
    readonly developmentCost: string;
    readonly equipment: { readonly quantity: string; readonly age: string; readonly ownership: string; readonly value: string };
    readonly operatingCost: string;
  };
  readonly environmental: {
    readonly monthlyWater: string;
    readonly monthlyEnergy: string;
    readonly closureCost: string;
    /** "الرصد" for every domain of the impacts popup. */
    readonly monitoring: string;
  };
}

export function defaultPublicProjectLicenseData(): PublicProjectLicenseData {
  return {
    serviceType: 'إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع',
    attachment: 'test-data/attachments/sample.pdf',
    step1: {
      projectName: 'مشروع اختبار آلي',
      contractValue: '1000000',
      contractStartMonthsAgo: 1,
      durationMonths: 1,
      mineral: 'البحص:(أي صخر ملائم للاستغلال كبحص)',
      mineralQuantity: '200000',
    },
    location: { projectSideKm: 2, licenceSideKm: 0.4, licenceOffsetKm: 3, maxAttempts: 10, mapTimeoutMs: 180_000, submitRetries: 3 },
    workPlan: {
      establishmentDate: '2020-01-01',
      company: {
        Input_NumberOfBranches: '1',
        Input_NumberOfFactories: '1',
        Input_NumberOfCurrentProjects: '1',
        Input_NumberOfEmployeesOfFacility: '50',
        Input_ForecastedTechnical: '10',
        Input_ForecastedNonTechnical: '20',
        Input_SaudisAtLicenseSite: '50',
      },
      quarterTonnes: '50000',
      extractionMethod: 'التعدين السطحي',
      developmentDurationMonths: '1',
      developmentCost: '10000',
      equipment: { quantity: '2', age: '3', ownership: 'مملوكة', value: '500000' },
      operatingCost: '100000',
    },
    environmental: { monthlyWater: '1000', monthlyEnergy: '1000', closureCost: '50000', monitoring: 'سنوي' },
  };
}

export function publicProjectLicenseData(): PublicProjectLicenseData {
  return deepMerge(defaultPublicProjectLicenseData(), loadOptionalTestData<PublicProjectLicenseData>('public-project-license'));
}
