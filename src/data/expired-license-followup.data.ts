/**
 * Test data and expected texts for the "متابعة رخص منتهية" (Follow-up on Expired License) service — UC-001 … UC-017.
 * Expected texts come from the user stories + the agreed change log (2026-11-15).
 */
export const expiredFollowUp = {
  /** Specialist chosen by the RCM in "مراجعة الرخصة المنتهية" (display name of employee2 / InternalExplotration). */
  specialistName: 'Explotration Demo',
  attachment: 'test-data/attachments/sample.pdf',
  visitDescription: 'زيارة ميدانية آلية - الموقع مؤهل. Automated field visit.',

  processType: {
    review: 'مراجعة الرخصة المنتهية',
    check: 'التحقق من أهلية الموقع - التحقق من وجود طلب إعادة التأهيل والإغلاق',
    email: 'التحقق من أهلية الموقع - إرسال بريد تذكيري للمستثمر',
    visit: 'التحقق من أهلية الموقع - توثيق الزيارة الميدانية والإفادة',
    rcmDecision: 'قرار مدير التأهيل والإغلاق',
  },

  status: { inProgress: 'قيد التنفيذ' },

  messages: {
    noRcRequest: 'لا يوجد طلب إعادة تأهيل وإغلاق مرتبط بهذه الرخصة، أو أن الطلب لم يكتمل بعد. يرجى استكمال إجراءات المهمة وفقًا لسير العمل.',
    emailSent: 'تم إرسال البريد الإلكتروني التذكيري للمستثمر بنجاح.',
    rcNumberRequired: 'يرجى إدخال رقم طلب إعادة التأهيل والإغلاق.',
    certificateRequired: 'يرجى إرفاق شهادة الإغلاق لإنهاء الطلب.',
    requiredFields: 'يرجى تعبئة جميع الحقول الإلزامية.',
    noResults: 'لا توجد نتائج لعرضها',
    /** UC-007 field 13 error. */
    visitDateRule: 'يجب أن يكون تاريخ الزيارة في تاريخ اليوم أو قبله، وألا يسبق تاريخ إنشاء الطلب.',
  },
  /** Non-existent R&C request number for the UC-005 close-request validation (Q27). */
  unknownRcNumber: '99999999',

  /** UC-002 Status Table (search filter values). */
  statuses: ['قيد التنفيذ', 'مكتمل – لا يتطلب إجراء', 'مكتمل – تم تقديم طلب/ شهادة إعادة التأهيل والإغلاق',
    'مكتمل – تمت الموافقة على تسييل الضمان المالي', 'مكتمل – تم رفض تسييل الضمان المالي', 'مكتمل – بيانات تاريخية مُرحّلة'],

  exportFileName: 'Expired Licenses Monitoring',
  regulatoryPeriodDays: 180,
} as const;

/** Remaining regulatory period per UC-002 BR-003: 180 − days elapsed since expiry (expiry day not counted), never below 0. */
export function expectedRemainingDays(expiry: string, today = new Date()): number {
  const [y, m, d] = expiry.split('-').map(Number);
  const exp = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsed = Math.floor((now - exp) / 86_400_000);
  return Math.max(0, Math.min(expiredFollowUp.regulatoryPeriodDays, expiredFollowUp.regulatoryPeriodDays - elapsed));
}
