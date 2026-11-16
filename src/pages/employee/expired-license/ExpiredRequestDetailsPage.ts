import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

export interface LinkedTaskCard {
  readonly name: string;
  readonly assignedTo: string;
  readonly created: string;
  readonly status: string;
}

export interface HistoryResponse {
  readonly task: string;
  readonly status: string;
  readonly by: string;
  readonly date: string;
  readonly time: string;
}

const DETAIL_LABELS = ['رقم الطلب', 'رقم الرخصة', 'نوع الرخصة', 'فئة الرخصة', 'تاريخ إنتهاء الرخصة', 'تاريخ انتهاء الرخصة', 'تاريخ إنشاء الطلب',
  'حالة الطلب', 'نوع العملية', 'تجاوز المهلة النظامية؟', 'عدد الأيام المتبقية', 'المسند اليه'];

/**
 * UC-002.1 / UC-003.2 / UC-003.3 — request details page (/Licenses_Monitoring_Expired/RequestDetails), opened in a new tab
 * from either list. Tabs are BUTTONS: ملف الشركة · تفاصيل الطلب · المهام المرتبطة · سجل الطلب · "الرد علي الطلب" (respond, only
 * for the assignee; label spelled with ي).
 *
 * Respond panels VERIFIED on TEST (2026-11-15, request 77320):
 *   496 Expired License Review    — dropdown [id$=DropdownSearch] "اختيار الأخصائي", "إلغاء", "إرسال" (disabled until chosen)
 *   495 Site Eligibility – check  — "تحقق" → message; close section; "إلغاء" / "إنهاء الطلب" / "إرسال"
 *   488 Site Eligibility – email  — "إرسال" (email) + step "إرسال" (disabled until the email is sent)
 *   487 Site Eligibility – visit  — date (visible input[aria-describedby$=DatepickerAccessibilityInfo], bound input
 *                                   [id$=Input_VisitDate]), observations upload, finding مؤهل/غير مؤهل, الوصف, "إرسال"
 *   Close section (495/488/487): radios "تقدم المستثمر بطلب إعادة تأهيل وإغلاق" / "صدور شهادة الإغلاق", R&C number
 *   input[id$=Input_DecimalVar], textarea "الوصف".
 */
export class ExpiredRequestDetailsPage extends BasePage {
  constructor(page: Page) {
    super(page, 'employee');
  }

  async waitLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.tab('ملف الشركة')).toBeVisible({ timeout: 150_000 });
    await this.page.waitForTimeout(4_000);
  }

  tab(name: string | RegExp): Locator {
    return this.page.locator('button', { hasText: name }).filter({ visible: true }).first();
  }

  async openTab(name: 'ملف الشركة' | 'تفاصيل الطلب' | 'المهام المرتبطة' | 'سجل الطلب'): Promise<string> {
    await this.tab(name).click();
    await this.page.waitForTimeout(4_000);
    if (name === 'سجل الطلب') {
      const responses = this.page.getByText('سجل الردود', { exact: true }).first();
      if (await responses.isVisible().catch(() => false)) { await responses.click(); await this.page.waitForTimeout(3_000); }
    }
    return this.bodyLines();
  }

  async openRespondTab(): Promise<void> {
    await this.tab(/الرد عل[ىي] الطلب/).click();
    await this.page.waitForTimeout(5_000);
  }

  async bodyLines(): Promise<string> {
    return (await this.page.locator('body').innerText()).replace(/\n{2,}/g, '\n');
  }

  title(): Promise<string> {
    return this.page.title();
  }

  async breadcrumb(): Promise<string> {
    return ((await this.page.locator('[class*="breadcrumb"]').filter({ visible: true }).first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' / ');
  }

  /** "تفاصيل الطلب" as label → value (labels missing on the page are absent from the result). */
  async requestDetails(): Promise<Record<string, string>> {
    const text = await this.openTab('تفاصيل الطلب');
    const lines = text.slice(text.lastIndexOf('تفاصيل الطلب')).split('\n').map((l) => l.trim()).filter(Boolean);
    const out: Record<string, string> = {};
    lines.forEach((l, i) => { if (DETAIL_LABELS.includes(l) && !(l in out) && lines[i + 1]) out[l] = lines[i + 1]; });
    return out;
  }

  async linkedTasks(): Promise<LinkedTaskCard[]> {
    const lines = (await this.openTab('المهام المرتبطة')).split('\n').map((l) => l.trim()).filter(Boolean);
    const cards: LinkedTaskCard[] = [];
    lines.forEach((l, i) => {
      if (l.startsWith('مسندة إلى')) cards.push({ name: lines[i - 1], assignedTo: l, created: lines[i + 1] ?? '', status: lines[i + 2] ?? '' });
    });
    return cards;
  }

  async history(): Promise<{ text: string; responses: HistoryResponse[] }> {
    const text = await this.openTab('سجل الطلب');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const responses: HistoryResponse[] = [];
    lines.forEach((l, i) => {
      if (/^رد /.test(l)) responses.push({ task: l.replace(/^رد /, ''), status: lines[i + 1], by: lines[i + 2], date: lines[i + 3], time: lines[i + 4] });
    });
    return { text, responses };
  }

  // ---------------------------------------------------------------- respond panels
  button(text: string): Locator {
    return this.page.locator('button', { hasText: new RegExp(`^\\s*${text}\\s*$`) }).filter({ visible: true });
  }

  /** Bottom "إرسال" that completes the current task / step. */
  get stepSend(): Locator {
    return this.button('إرسال').last();
  }

  get closeRequestButton(): Locator {
    return this.button('إنهاء الطلب').first();
  }

  async messages(): Promise<string[]> {
    return (await this.page.locator('[class*="feedback-message"], [role="alert"], .validation-message, [class*="error"]').filter({ visible: true })
      .allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  }

  /** Waits for the page to leave the respond screen (submits redirect to Task Management). */
  async waitForSubmitted(): Promise<boolean> {
    return this.page.waitForURL(/TaskManagement/, { timeout: 90_000 }).then(() => true).catch(() => false);
  }

  // 496 Expired License Review
  get specialistDropdown(): Locator {
    return this.page.locator('[id$="DropdownSearch"] .vscomp-toggle-button').filter({ visible: true }).first();
  }

  async specialistOptions(): Promise<string[]> {
    await this.specialistDropdown.click();
    await this.page.waitForTimeout(1_500);
    const opts = (await this.page.locator('.vscomp-option').filter({ visible: true }).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return opts;
  }

  async selectSpecialist(name?: string): Promise<string> {
    await this.specialistDropdown.click();
    await this.page.waitForTimeout(1_500);
    const opts = this.page.locator('.vscomp-option').filter({ visible: true });
    const option = name ? opts.filter({ hasText: name }).first() : opts.first();
    const label = (await option.innerText()).trim();
    await option.click();
    await this.page.keyboard.press('Escape');
    return label;
  }

  // 495 check
  async runCheck(): Promise<string> {
    await this.button('تحقق').first().click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(6_000);
    const t = await this.bodyLines();
    return t.split('\n').map((l) => l.trim()).find((l) => /^(لا يوجد|يوجد) طلب إعادة تأهيل وإغلاق/.test(l)) ?? '';
  }

  // Close section
  async chooseCloseOption(option: 'تقدم المستثمر بطلب إعادة تأهيل وإغلاق' | 'صدور شهادة الإغلاق'): Promise<void> {
    await this.page.locator('label', { hasText: option }).first().click();
    await this.page.waitForTimeout(2_500);
  }

  get closeRequestNumberInput(): Locator {
    return this.page.locator('input[id$="Input_DecimalVar"]').filter({ visible: true }).first();
  }

  /** True when the close-request section (below "هل ترغب في إغلاق الطلب؟") contains a file upload. */
  async closeSectionHasUpload(): Promise<boolean> {
    return this.page.evaluate(() => {
      const anchor = Array.from(document.querySelectorAll('*')).find((e) => e.childElementCount === 0 && /هل ترغب في إغلاق الطلب/.test(e.textContent ?? ''));
      if (!anchor) return false;
      return Array.from(document.querySelectorAll('input[type="file"]'))
        .some((f) => (anchor.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    });
  }

  /** Visible dialog (confirm / cancel) if any. */
  get dialog(): Locator {
    return this.page.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true }).last();
  }

  // 488 email
  get emailSend(): Locator {
    return this.button('إرسال').first();
  }

  // 487 visit
  get visitDateInput(): Locator {
    return this.page.locator('input[aria-describedby$="DatepickerAccessibilityInfo"]').filter({ visible: true }).first();
  }

  get visitDateBound(): Locator {
    return this.page.locator('input[id$="Input_VisitDate"]').first();
  }

  get findingEligible(): Locator {
    return this.page.locator('input[id$="-Complaint-input"]').first();
  }

  get visitDescription(): Locator {
    return this.page.locator('textarea[id$="TextArea_Description"]').first();
  }

  async pickVisitDateToday(): Promise<{ shown: string; bound: string }> {
    await this.visitDateInput.click();
    await this.page.waitForTimeout(1_200);
    await this.page.locator('.flatpickr-calendar.open .flatpickr-day.today').first().click();
    await this.page.waitForTimeout(1_500);
    return { shown: await this.visitDateInput.inputValue(), bound: await this.visitDateBound.inputValue() };
  }

  async uploadObservation(file: string): Promise<void> {
    await this.page.locator('input[type="file"]').first().setInputFiles(file);
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(6_000);
  }

  async selectFindingEligible(): Promise<boolean> {
    await this.page.locator('label[for$="-Complaint-input"]').first().click();
    await this.page.waitForTimeout(800);
    return this.findingEligible.isChecked();
  }

  /** Reminder / follow-up section text ("المتابعة التنظيمية"). */
  async followUpSection(): Promise<string> {
    const t = await this.bodyLines();
    const i = t.indexOf('المتابعة التنظيمية');
    return i < 0 ? '' : t.slice(i, t.indexOf('هل ترغب في إغلاق الطلب', i) > 0 ? t.indexOf('هل ترغب في إغلاق الطلب', i) : i + 400);
  }
}
