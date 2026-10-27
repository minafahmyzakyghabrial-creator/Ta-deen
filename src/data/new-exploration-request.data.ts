import { RegionKey } from '@utils/kml-generator';
import { saudiNationalId } from '@utils/data-generator';
import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Configuration for creating a NEW Exploration License (wizard steps 1–2).
 * Every value below was accepted on TEST (2026-10-26, draft 76111). Override any key in
 *   test-data/common/new-exploration-request.json  or  test-data/<env>/new-exploration-request.json
 */
export interface NewExplorationRequestData {
  /** "نوع الخدمة" in the "إنشاء طلب جديد" dialog. */
  readonly serviceType: string;
  readonly requestInfo: {
    /** فئة الرخصة: أ | ب | ج — choosing it reveals القدرة الفنية. */
    readonly category: string;
    /** مدة الرخصة (سنوياً): 1–5. */
    readonly durationYears: string;
    /** المعادن — option labels (list depends on the category, e.g. ذهب, نحاس, فضة). */
    readonly minerals: string[];
    /** المجمع التعديني: "داخل المجمعات التعدينية" | "خارج المجمعات التعدينية" ("خارج" → map Outside.html). */
    readonly miningComplex: string;
    /** At least one geologist is mandatory. Field labels as shown in the "إضافة خبير جيولوجي جديد" popup. */
    readonly geologist: Record<string, string>;
  };
  readonly location: {
    /** Regions tried in order for the generated KML; on overlap the next region is used (then random). */
    readonly regions: RegionKey[];
    readonly widthKm: number;
    readonly heightKm: number;
    /** Maximum KML attempts before giving up. */
    readonly maxAttempts: number;
    /** How long to wait for the GIS map (iframe load, "تأكيد" button, validation result) per attempt. */
    readonly mapTimeoutMs: number;
  };
}

export function defaultNewExplorationRequestData(): NewExplorationRequestData {
  return {
    serviceType: 'إصدار رخصة كشف',
    requestInfo: {
      category: 'أ',
      durationYears: '1',
      minerals: ['ذهب'],
      miningComplex: 'خارج المجمعات التعدينية',
      geologist: {
        'نوع الجيولوجي': 'جيولوجي',
        'الاسم': 'خبير اختبار',
        'الجامعة': 'جامعة الملك سعود',
        'سنوات الخبرة': '10', // max 2 digits
        'عدد المشاريع': '5',
        'الجنسية': 'سعودي',
        'التخصص': 'جيولوجيا',
        'رقم الهوية': saudiNationalId('1'), // 10 digits
      },
    },
    location: {
      // Hail passed twice on TEST; Najran overlapped twice, Riyadh and Al-Qassim always ("تقاطع المواقع").
      regions: ['hail', 'tabuk', 'najran', 'makkah', 'madinah'],
      widthKm: 1,
      heightKm: 1,
      maxAttempts: 10,
      mapTimeoutMs: 90_000,
    },
  };
}

export function newExplorationRequestData(): NewExplorationRequestData {
  return deepMerge(defaultNewExplorationRequestData(), loadOptionalTestData<NewExplorationRequestData>('new-exploration-request'));
}
