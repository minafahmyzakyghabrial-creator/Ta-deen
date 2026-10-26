import { saudiMobile, saudiNationalId, testEmail } from '@utils/data-generator';
import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Test data for the Exploration License wizard (steps 3–8).
 *
 * Every default below was accepted by the TEST environment on 2026-10-26 (request 76092,
 * 1-year licence, category أ). Comments name the rule each value respects.
 *
 * Popup sections are `{ "<field label without *>": "<value>" }` maps; select fields take
 * the option label. To override any value, create
 *   test-data/common/exploration-license.json   (all environments) or
 *   test-data/<env>/exploration-license.json    (one environment)
 * containing only the keys to change, e.g.  { "financial": { "availableBalance": "250000" } }
 */
export interface ExplorationLicenseData {
  readonly attachment: string;
  readonly workPlan: {
    /** "المبررات الفنية" type — required on new requests (options: الموقع يقع داخل المجمعات التعدينية | دراسات رخصة الاستطلاع | دراسات وأبحاث البعثات الجيولوجية | الموقع بالقرب من رخص كشف للشركة | تواجد بعض أعمال التعدين القديمة). */
    readonly technicalJustification: string;
    /** Multi-select "طبيعة عمليات الكشف" — at least one option. */
    readonly explorationNature: string[];
    /** Unique part of the "نتائج أعمال المسح الميداني" radio label. */
    readonly fieldSurveyResult: string;
    /** "ملكية عامة" needs no extra data; full/partial ownership adds owners + deeds. */
    readonly landOwnership: string;
    readonly deskStudy: Record<string, string>;
    readonly technicalStudy: Record<string, string>;
    readonly geochemicalSurvey: Record<string, string>;
    readonly geophysicalSurvey: Record<string, string>;
    readonly physicalLabAnalysis: Record<string, string>;
    readonly otherExpenses: Record<string, string>;
    /** At least one of reverse-circulation or diamond drilling is mandatory. */
    readonly drilling: { readonly heading: string; readonly fields: Record<string, string> };
    readonly rehabilitationCostPerYear: string;
    readonly timeline: { readonly startYear: string; readonly startMonth: string; readonly durationMonths: string };
  };
  readonly financial: {
    /** One of: الشهادة البنكية | كشف الحساب البنكي | خطاب تسهيلات */
    readonly proofType: string;
    /** Rule (tooltip): total must be ≥ the minimum annual exploration spend. */
    readonly availableBalance: string;
  };
  readonly socialImpact: {
    readonly employee: { name: string; nationalId: string; position: string; mobile: string; email: string };
    /** Multi-selects; an empty list means "pick the first option". */
    readonly grievanceMechanisms: string[];
    readonly stakeholders: string[];
    readonly stakeholderEngagementPlan: string[];
    readonly socialImpacts: string[];
    readonly localPrograms: string[];
    readonly localCommunity: Record<string, string>;
    readonly employmentPlan: Record<string, string>;
    readonly purchasePlan: Record<string, string>;
  };
  readonly environmentalImpact: {
    /** One of: الهواء | النفايات والمواد الخطرة | التنوع البيولوجي | المياه والمياه الجوفية | التربة والمناظر الطبيعية */
    readonly domain: string;
    readonly monitoring: string;
  };
}

export function defaultExplorationLicenseData(): ExplorationLicenseData {
  return {
    attachment: 'test-data/attachments/sample.pdf',
    workPlan: {
      technicalJustification: 'دراسات وأبحاث البعثات الجيولوجية',
      explorationNature: ['الدراسات المكتبية'],
      fieldSurveyResult: 'وتبين عدم وجود',
      landOwnership: 'ملكية عامة',
      // Quantity fields: maxLength 7.
      deskStudy: { 'نوع البيانات': 'الخرائط الجيولوجية', 'التكلفة/الوحدة': '1000', 'العدد': '1' },
      technicalStudy: { 'نوع الدراسات الفنية': 'الدراسات الجيولوجية', 'التكلفة/الدراسة': '5000', 'عدد الدراسات': '1' },
      geochemicalSurvey: {
        'نوع التحليل الجيوكيميائي': '(XRF) تحليل العناصر الكيميائية الرئيسية',
        'عدد العناصر الكيميائية': '10',
        'مجموع التكاليف/العينة': '200',
        'عدد العينات': '20',
      },
      geophysicalSurvey: {
        'الطرق': 'المسح الجيوفيزيائي المغناطيسي',
        'المساحة المستهدفة': '1',
        'التكلفة/المساحة': '1000',
        'متوسط أطوال الخطوط': '1',
      },
      physicalLabAnalysis: { 'نوع التحليل الفيزيائي': 'الكثافة', 'التكلفة/العينة': '100', 'عدد العينات': '10' },
      otherExpenses: { 'المصاريف الإدارية': '1000', 'الرواتب والأجور والبدلات': '1000', 'الاستشارات': '1000' },
      // Diamond: min 4 holes ("الحد الادنى لعدد الحفر الماسي = 4"), cost/m 300–700, depth 20–1000.
      // (Reverse circulation alternative: cost/m 120–350, depth 12–300.)
      drilling: {
        heading: 'الحفر الماسي',
        fields: { 'عدد الحفر الماسي': '4', 'متوسط التكلفة/المتر': '400', 'متوسط الاعماق': '50' },
      },
      rehabilitationCostPerYear: '5000',
      // Duration input (maxLength 3) unlocks after year + month; 1 + 3 months stays inside a 1-year licence.
      timeline: { startYear: 'السنه الاولي', startMonth: 'الشهر الأول', durationMonths: '3' },
    },
    financial: { proofType: 'كشف الحساب البنكي', availableBalance: '150000' },
    socialImpact: {
      // Name/position: Arabic text accepted; ID: 10 digits starting 1|2; mobile: 9 digits starting 5.
      employee: {
        name: 'محمد أحمد',
        nationalId: saudiNationalId('1'),
        position: 'مدير المجتمع',
        mobile: saudiMobile(),
        email: testEmail('community.manager'),
      },
      grievanceMechanisms: [],
      stakeholders: [],
      stakeholderEngagementPlan: [],
      socialImpacts: [],
      localPrograms: [],
      localCommunity: { 'المجتمعات المحلية': 'قرية الاختبار', 'المسافة': '10' },
      // Local jobs must not exceed total jobs. "بالتساوي" spreads 100% over the licence years.
      employmentPlan: {
        'المسمي الوظيفي': 'فني استكشاف',
        'فئة الوظيفة': 'العمل',
        'عدد الوظائف': '2',
        'عدد الوظائف من المجتمع المحلي': '1',
        'الراتب': '5000',
        'النسبة على السنوات %': 'بالتساوي',
      },
      purchasePlan: {
        'السلع والخدمات': 'ديزل (لتر)',
        'الكمية': '100',
        'إجمالي المشتريات السنوية': '10000',
        'النسبة على السنوات %': 'بالتساوي',
      },
    },
    environmentalImpact: { domain: 'الهواء', monitoring: 'سنوي' },
  };
}

/** Defaults merged with the optional JSON overrides for the active environment. */
export function explorationLicenseData(): ExplorationLicenseData {
  return deepMerge(defaultExplorationLicenseData(), loadOptionalTestData<ExplorationLicenseData>('exploration-license'));
}
