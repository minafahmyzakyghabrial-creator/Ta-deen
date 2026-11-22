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
  /** Decision / status line ("مكتمل", "اعتماد", "إعادة للموظف السابق", "طلب إفادة", "تحققت المتطلبات" …). */
  readonly status: string;
  /** Employee who answered — '' when the entry shows none. */
  readonly by: string;
  readonly date: string;
  readonly time: string;
  /** Text under "إفادة الموظف" (decision notes / feedback / visit description). */
  readonly notes: string;
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
    // Entries under "سجل الردود", newest first. Block: "رد <task>" · status · [employee] · dd/mm/yyyy · hh:mm:ss AM/PM ·
    // "إفادة الموظف" · [notes]. The employee line is missing on some entries (TEST 2026-11-16), so parse by content.
    const lines = text.slice(Math.max(0, text.indexOf('سجل الردود'))).split('\n').map((l) => l.trim()).filter(Boolean);
    const responses: HistoryResponse[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^رد /.test(lines[i])) continue;
      let j = i + 1;
      const block: string[] = [];
      while (j < lines.length && !/^رد /.test(lines[j])) block.push(lines[j++]);
      const di = block.findIndex((l) => /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}/.test(l));
      const status = block[0] ?? '';
      const by = di > 1 ? block.slice(1, di).join(' ') : '';
      const fi = block.indexOf('إفادة الموظف');
      responses.push({ task: lines[i].replace(/^رد /, ''), status, by, date: di >= 0 ? block[di] : '', time: di >= 0 ? block[di + 1] ?? '' : '',
        notes: fi >= 0 ? block.slice(fi + 1).join(' ') : '' });
      i = j - 1;
    }
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

  /** "إلغاء" of the respond panel (UC-004 field 12 / UC-005 field 2). */
  get cancelButton(): Locator {
    return this.button('إلغاء').first();
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
    // Path only: the respond page itself carries "TaskManagement" in its query string.
    return this.page.waitForURL((u) => /TaskManagement/.test(u.pathname), { timeout: 90_000 }).then(() => true).catch(() => false);
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

  // ---------------------------------------------------------------- decision levels (UC-010 … UC-016) and feedback (UC-017)
  // VERIFIED on TEST 2026-11-16 (77433, 493 "قرار مدير التأهيل والإغلاق"): "القرار" radios "اعتماد" / "إعادة للموظف السابق",
  // textarea "ملاحظات القرار" (#…TextArea_TextVar), "إلغاء", "إرسال". Other levels are read generically.

  /** Enabled radio choices of the respond panel ("القرار" and similar), by label text. */
  async decisionOptions(): Promise<string[]> {
    return this.page.evaluate(() => Array.from(document.querySelectorAll('input[type=radio]'))
      .filter((r) => !(r as HTMLInputElement).disabled && r.getClientRects().length > 0)
      .map((r) => (document.querySelector(`label[for="${r.id}"]`)?.textContent ?? r.closest('label')?.textContent ?? r.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean));
  }

  async chooseDecision(label: RegExp): Promise<string> {
    const id = await this.page.evaluate((src) => {
      const re = new RegExp(src);
      const r = Array.from(document.querySelectorAll('input[type=radio]')).find((x) => !(x as HTMLInputElement).disabled && x.getClientRects().length > 0
        && re.test((document.querySelector(`label[for="${x.id}"]`)?.textContent ?? x.parentElement?.textContent ?? '').trim()));
      return r?.id ?? '';
    }, label.source);
    if (!id) throw new Error(`Decision ${label} not offered: ${(await this.decisionOptions()).join(' / ')}`);
    const lbl = this.page.locator(`label[for="${id}"]`);
    if (await lbl.isVisible().catch(() => false)) await lbl.click(); else await this.page.locator(`[id="${id}"]`).check({ force: true });
    await this.page.waitForTimeout(2_500);
    return (await lbl.innerText().catch(() => label.source)).trim();
  }

  /**
   * Writes `comment` into every visible, editable, EMPTY description / notes field (textareas) — user's request
   * 2026-11-17: "write comments in description fields". Returns how many were filled. Never used before a check that an
   * empty field is refused.
   */
  async fillEmptyComments(comment: string): Promise<number> {
    let n = 0;
    for (const t of await this.page.locator('textarea:not([disabled]):not([readonly])').filter({ visible: true }).all()) {
      if ((await t.inputValue().catch(() => 'x')).trim()) continue;
      await t.fill(comment).catch(() => {});
      n++;
    }
    return n;
  }

  /** "الوصف" of the close-request section (below "هل ترغب في إغلاق الطلب؟"). */
  get closeDescription(): Locator {
    return this.page.locator('textarea[id*="b5-TextArea_Description"], textarea[id$="TextArea_Description"]').filter({ visible: true }).last();
  }

  /** Last enabled visible textarea = the decision / feedback notes. */
  get notes(): Locator {
    return this.page.locator('textarea:not([disabled])').filter({ visible: true }).last();
  }

  /** Visible, enabled dropdowns that are still empty (e.g. "الدور الوظيفي المطلوب إفادته", "تعيين الأخصائي"): picks an option in each. */
  async fillEmptyDropdowns(prefer?: string): Promise<string[]> {
    const picked: string[] = [];
    for (const sel of await this.page.locator('select:not([disabled])').filter({ visible: true }).all()) {
      if (await sel.evaluate((s: HTMLSelectElement) => s.selectedIndex > 0)) continue;
      const opts = (await sel.locator('option').allInnerTexts()).map((t) => t.trim()).slice(1);
      const choice = opts.find((o) => prefer && o.includes(prefer)) ?? opts[0];
      if (choice) { await sel.selectOption({ label: choice }); picked.push(choice); }
    }
    for (const toggle of await this.page.locator('.vscomp-ele:not(.disabled) .vscomp-toggle-button').filter({ visible: true }).all()) {
      const empty = await toggle.evaluate((t) => !(t.closest('.vscomp-ele') as unknown as { value?: string })?.value);
      if (!empty) continue;
      await toggle.click();
      await this.page.waitForTimeout(1_200);
      const opts = this.page.locator('.vscomp-option:not(.disabled)').filter({ visible: true });
      const opt = prefer ? opts.filter({ hasText: prefer }).first() : opts.first();
      const target = (await opt.count()) ? opt : opts.first();
      if (await target.count()) { picked.push((await target.innerText()).trim()); await target.click(); }
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(800);
    }
    return picked;
  }

  /** Confirms a confirmation dialog when one is shown (never a cancel button). Returns its text. */
  async confirmDialogIfAny(): Promise<string> {
    await this.page.waitForTimeout(2_500);
    if (!(await this.dialog.isVisible().catch(() => false))) return '';
    const text = (await this.dialog.innerText()).replace(/\s+/g, ' ').trim();
    const yes = this.dialog.locator('button').filter({ hasText: /تأكيد|اعتماد|نعم|موافق|إرسال|متابعة/ }).filter({ hasNotText: /إلغاء|لا$|مراجعة/ }).first();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    return text;
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

  /**
   * Opens the visit calendar and returns the classes of the day `offsetDays` from today (e.g. +1 = tomorrow);
   * "flatpickr-disabled" means the day cannot be picked. The calendar is closed again.
   */
  async visitCalendarDay(offsetDays: number): Promise<string> {
    await this.visitDateInput.scrollIntoViewIfNeeded();
    await this.visitDateInput.click();
    await this.page.waitForTimeout(1_200);
    const cls = await this.page.evaluate((off) => {
      const cal = document.querySelector('.flatpickr-calendar.open');
      if (!cal) return 'no calendar';
      const days = Array.from(cal.querySelectorAll('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)'));
      const i = days.findIndex((d) => d.classList.contains('today'));
      const day = days[i + off];
      return day ? `${day.getAttribute('aria-label')} [${day.className}]` : 'day not in this month';
    }, offsetDays);
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(800);
    return cls;
  }

  /** Visit date picker range as configured by the screen (flatpickr minDate / maxDate). */
  async visitDateRange(): Promise<{ min: string; max: string }> {
    return this.page.evaluate(() => {
      type FP = { config: { minDate?: Date; maxDate?: Date } };
      const el = (Array.from(document.querySelectorAll('input')) as (HTMLInputElement & { _flatpickr?: FP })[]).find((i) => i._flatpickr && /VisitDate/.test(i.id));
      const fmt = (d?: Date) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().replace('T', ' ').slice(0, 19) : '');
      return { min: fmt(el?._flatpickr?.config.minDate), max: fmt(el?._flatpickr?.config.maxDate) };
    });
  }

  /**
   * Sets the visit date through the date picker's own API (flatpickr setDate with triggerChange), i.e. the same events a
   * calendar click fires — a second route when the calendar click does not reach the bound input (DEF-047).
   */
  async setVisitDateViaPicker(iso: string): Promise<{ shown: string; bound: string; api: boolean }> {
    const api = await this.page.evaluate((v) => {
      type FP = { setDate: (d: string, triggerChange: boolean) => void };
      const inputs = Array.from(document.querySelectorAll('input')) as (HTMLInputElement & { _flatpickr?: FP })[];
      const el = inputs.find((i) => i._flatpickr && /VisitDate/.test(i.id)) ?? inputs.find((i) => i._flatpickr);
      if (!el?._flatpickr) return false;
      el._flatpickr.setDate(v, true);
      return true;
    }, iso);
    await this.page.waitForTimeout(1_500);
    return { shown: await this.visitDateInput.inputValue().catch(() => ''), bound: await this.visitDateBound.inputValue().catch(() => ''), api };
  }

  /** Visible messages that mention the visit date (inline validation or toast). */
  async visitDateErrors(): Promise<string[]> {
    const all = await this.page.locator('.validation-message, [class*="feedback-message"], [role="alert"], span.error, .input-error').filter({ visible: true }).allInnerTexts().catch(() => []);
    return all.map((t) => t.trim()).filter((t) => /الزيارة|التاريخ|تاريخ/.test(t));
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
