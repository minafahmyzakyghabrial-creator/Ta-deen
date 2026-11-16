import { expect, Page } from '@playwright/test';
import { test } from '@fixtures/test';
import * as fs from 'fs';
import { RowActionMenu } from '@components/RowActionMenu';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
// Staged exploration of the expired-licence follow-up flow on ONE request (FLOW_REQUEST, licence FLOW_LICENCE).
// STAGE (comma list): inspect = read-only checks · review-open = assign Expired License Review to employee1 and dump the
// respond panel (NO submit). Later stages are added once each panel is known.
const RN = process.env.FLOW_REQUEST ?? '77320';
const LIC = process.env.FLOW_LICENCE ?? '20260710137';
const STAGES = (process.env.STAGE ?? 'inspect').split(',');
const OUT = `test-results-probe/expired-flow/${RN}`;
fs.mkdirSync(OUT, { recursive: true });

async function dump(page: Page, tag: string) {
  fs.writeFileSync(`${OUT}/${tag}.txt`, await page.locator('body').innerText());
  fs.writeFileSync(`${OUT}/${tag}.html`, await page.content());
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  const controls = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button, .vscomp-ele'))
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => {
      let lbl = ''; let p: Element | null = e.parentElement;
      for (let k = 0; k < 5 && p && !lbl; k++, p = p.parentElement) lbl = p.querySelector('label')?.textContent?.trim() ?? '';
      const vs = (e as unknown as { virtualSelect?: { options: { label: string }[] } }).virtualSelect;
      const opts = e.tagName === 'SELECT' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).join(' / ')
        : vs ? vs.options.map((o) => o.label).join(' / ') : '';
      const st = `${(e as HTMLInputElement).disabled ? ' DISABLED' : ''}${(e as HTMLInputElement).readOnly ? ' RO' : ''}${(e as HTMLInputElement).checked ? ' CHECKED' : ''}`;
      return `${e.tagName} type=${(e as HTMLInputElement).type ?? ''} #${e.id} label="${lbl.slice(0, 50)}" "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"${st}${opts ? ' OPTIONS: ' + opts : ''}`;
    }));
  console.log(`\n===== ${tag} URL ${page.url()}\nCONTROLS\n  ${controls.join('\n  ')}`);
}

/** One screenshot per bug: outlines the offending element(s) in red and saves test-cases/bugs/<id>.png. */
async function bug(page: Page, id: string, title: string, targets: import('@playwright/test').Locator[] = []) {
  fs.mkdirSync('test-cases/bugs', { recursive: true });
  for (const t of targets) {
    await t.first().evaluate((e) => { (e as HTMLElement).style.outline = '4px solid red'; (e as HTMLElement).style.outlineOffset = '2px'; e.scrollIntoView({ block: 'center' }); }).catch(() => {});
  }
  await page.screenshot({ path: `test-cases/bugs/${id}.png`, fullPage: false });
  for (const t of targets) await t.first().evaluate((e) => { (e as HTMLElement).style.outline = ''; }).catch(() => {});
  console.log(`BUG ${id}: ${title}`);
}

async function expiredTasks(page: Page) {
  await new TaskManagementPage(page).open();
  await page.locator('[role="tab"], button').filter({ visible: true }).filter({ hasText: /^\s*متابعة رخص منتهية\s*$/ }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(8_000);
  const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b23-b6"]') }).first();
  const input = page.locator('#b23-b6-b2-Input_RequestNumber');
  if (!(await input.isVisible().catch(() => false))) await panel.getByText(/تصفية\s*\(\d+\)/).first().click();
  await input.fill(RN);
  await page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(8_000);
  const rows = panel.locator('table tbody tr').filter({ visible: true });
  console.log('TASK ROWS', (await rows.allInnerTexts()).map((r) => r.replace(/\s+/g, ' | ')).join('\n   '));
  return { panel, rows };
}

async function openRespond(page: Page, tag: string): Promise<Page> {
  const { rows } = await expiredTasks(page);
  const menu = new RowActionMenu(rows.first().locator('td').last());
  console.log(`MENU (${tag})`, await menu.actions());
  if (await menu.has('إسناد إلى')) {
    await menu.click('إسناد إلى');
    await page.waitForTimeout(8_000);
    console.log('ASSIGNED (no dialog expected)');
    await expiredTasks(page);
  }
  const m = new RowActionMenu((await expiredTasks(page)).rows.first().locator('td').last());
  console.log(`MENU after assign (${tag})`, await m.actions());
  const popup = page.context().waitForEvent('page', { timeout: 60_000 });
  await m.click('الرد على الطلب');
  const resp = await popup;
  await resp.waitForLoadState('networkidle').catch(() => {});
  await resp.waitForTimeout(15_000);
  console.log('RESP URL', resp.url(), 'TITLE', await resp.title());
  await resp.locator('button', { hasText: /الرد عل[ىي] الطلب/ }).filter({ visible: true }).first().click();
  await resp.waitForTimeout(6_000);
  return resp;
}

async function viewTabs(page: Page, tag: string) {
  for (const tab of ['تفاصيل الطلب', 'المهام المرتبطة', 'سجل الطلب']) {
    await page.locator('button', { hasText: tab }).filter({ visible: true }).first().click();
    await page.waitForTimeout(5_000);
    if (tab === 'سجل الطلب') {
      const acc = page.getByText('سجل الردود').first();
      if (await acc.isVisible().catch(() => false)) { await acc.click(); await page.waitForTimeout(4_000); }
    }
    const t = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n');
    const i = t.lastIndexOf(tab);
    console.log(`\n----- ${tag} ${tab}\n${t.slice(i).slice(0, 2200)}`);
    await page.screenshot({ path: `${OUT}/${tag}-${tab.replace(/\s+/g, '_')}.png`, fullPage: true });
  }
}

test.describe('expired-flow', () => {
  test('review-submit (RCM assigns the specialist)', async ({ employee }) => {
    test.skip(!STAGES.includes('review-submit'));
    test.setTimeout(20 * 60_000);
    const resp = await openRespond(employee.page, 'review');
    await resp.locator('#b3-b17-b1-b3-DropdownSearch .vscomp-toggle-button, [id$="DropdownSearch"] .vscomp-toggle-button').first().click();
    await resp.waitForTimeout(1_500);
    const opts = resp.locator('.vscomp-option').filter({ visible: true });
    console.log('SPECIALISTS', await opts.allInnerTexts());
    await opts.first().click();
    await resp.keyboard.press('Escape');
    const send = resp.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true }).first();
    await expect(send).toBeEnabled();
    await dump(resp, 'e-review-before-send');
    await send.click();
    await resp.waitForTimeout(4_000);
    await dump(resp, 'e-review-after-send-click');
    const confirm = resp.getByRole('button', { name: /تأكيد|نعم/ }).filter({ visible: true }).first();
    if (await confirm.isVisible().catch(() => false)) { console.log('CONFIRM DIALOG', await confirm.innerText()); await confirm.click(); }
    await resp.waitForTimeout(12_000);
    console.log('AFTER SEND URL', resp.url());
    console.log('AFTER SEND TEXT', (await resp.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800));
    const page = employee.page;
    await expiredTasks(page);
    // Read-only view of the result.
    const { rows } = await expiredTasks(page);
    const popup = page.context().waitForEvent('page', { timeout: 60_000 });
    await new RowActionMenu(rows.first().locator('td').last()).click('عرض');
    const view = await popup;
    await view.waitForLoadState('networkidle').catch(() => {});
    await view.waitForTimeout(12_000);
    await viewTabs(view, 'f-after-review');
  });

  test('ts-check (specialist: validations, check, closure-field rules — never confirms a closure)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-check'));
    test.setTimeout(25 * 60_000);
    const { page } = await sessions.as('employee2');
    let resp = await openRespond(page, 'ts');
    const closeBtn = resp.getByRole('button', { name: 'إنهاء الطلب', exact: true }).filter({ visible: true }).first();
    const sendBtn = resp.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true }).first();
    const notes = resp.locator('[id$="TextArea_Description"]').first();
    console.log('BEFORE CHECK: close enabled', await closeBtn.isEnabled(), '| send enabled', await sendBtn.isEnabled(), '| notes maxlength', await notes.getAttribute('maxlength'));
    if (await closeBtn.isEnabled()) await bug(resp, 'DEF-037', '"إنهاء الطلب" enabled with no closure option selected', [closeBtn]);
    // C1 option 1 → fields shown.
    await resp.locator('label', { hasText: 'تقدم المستثمر بطلب إعادة تأهيل وإغلاق' }).first().click();
    await resp.waitForTimeout(3_000);
    await dump(resp, 'h-ts-option1');
    await closeBtn.click();
    await resp.waitForTimeout(4_000);
    const msg1 = await resp.locator('[class*="feedback-message"], [role="alert"], .validation-message, [class*="error"]').filter({ visible: true }).allInnerTexts();
    console.log('OPTION1 EMPTY → MESSAGES', msg1);
    await dump(resp, 'h-ts-option1-empty-close');
    const dlg1 = resp.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true });
    if (await dlg1.count()) {
      console.log('DIALOG AFTER OPTION1 EMPTY', (await dlg1.last().innerText()).replace(/\s+/g, ' '));
      await bug(resp, 'DEF-038', 'Close request with empty R&C number shows the confirm dialog instead of the required-field error', [dlg1.last()]);
      await dlg1.last().getByRole('button', { name: /إلغاء|لا|cancel/i }).first().click().catch(() => {});
      await resp.waitForTimeout(3_000);
    }
    // C1 option 2 → certificate required.
    await resp.locator('label', { hasText: 'صدور شهادة الإغلاق' }).first().click();
    await resp.waitForTimeout(3_000);
    await dump(resp, 'h-ts-option2');
    await closeBtn.click();
    await resp.waitForTimeout(4_000);
    const msg2 = await resp.locator('[class*="feedback-message"], [role="alert"], .validation-message, [class*="error"]').filter({ visible: true }).allInnerTexts();
    console.log('OPTION2 NO FILE → MESSAGES', msg2);
    await dump(resp, 'h-ts-option2-empty-close');
    const dlg2 = resp.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true });
    if (await dlg2.count()) {
      console.log('DIALOG AFTER OPTION2 NO FILE', (await dlg2.last().innerText()).replace(/\s+/g, ' '));
      await bug(resp, 'DEF-039', 'Close request without closure certificate shows the confirm dialog instead of the required-file error', [dlg2.last()]);
      await dlg2.last().getByRole('button', { name: /إلغاء|لا|cancel/i }).first().click().catch(() => {});
      await resp.waitForTimeout(3_000);
    }
    // Reload to clear the radio, then run the check.
    await resp.close();
    resp = await openRespond(page, 'ts-2');
    await resp.getByRole('button', { name: 'تحقق', exact: true }).filter({ visible: true }).first().click();
    await resp.waitForTimeout(10_000);
    const after = (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n');
    console.log('AFTER CHECK\n' + after.slice(after.lastIndexOf('تفاصيل الطلب')).slice(0, 2500));
    await dump(resp, 'i-ts-after-check');
  });

  test('ts-step (specialist: screenshot pre-state, submit "إرسال" of the current step, open the next step)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-step'));
    test.setTimeout(25 * 60_000);
    const { page } = await sessions.as('employee2');
    const resp = await openRespond(page, 'ts-step');
    const title = await resp.title();
    const tag = `j-${title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(-40)}`;
    const sendBtn = resp.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true }).first();
    if (process.env.SEND_BUG) await bug(resp, process.env.SEND_BUG, '"إرسال" enabled before the step action was done', [sendBtn]);
    await dump(resp, `${tag}-before`);
    await sendBtn.click();
    await resp.waitForTimeout(4_000);
    const dlg = resp.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true });
    if (await dlg.count()) { console.log('DIALOG', (await dlg.last().innerText()).replace(/\s+/g, ' ')); await dump(resp, `${tag}-dialog`); }
    console.log('MESSAGES', await resp.locator('[class*="feedback-message"], [role="alert"], [class*="error"]').filter({ visible: true }).allInnerTexts().catch(() => []));
    await resp.waitForTimeout(10_000);
    console.log('AFTER SEND URL', resp.isClosed() ? 'closed' : resp.url());
    const next = await openRespond(page, 'ts-next');
    await dump(next, 'k-next-step');
    console.log('NEXT STEP TEXT\n' + (await next.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(-2500));
    await viewTabs(next, 'k-next');
  });

  test('ts-email (specialist sends the reminder email, completes step 2, opens step 3)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-email'));
    test.setTimeout(25 * 60_000);
    const { page } = await sessions.as('employee2');
    const resp = await openRespond(page, 'ts-email');
    const sends = resp.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true });
    const emailBtn = sends.first();
    const stepBtn = sends.last();
    console.log('BEFORE EMAIL: step send enabled', await stepBtn.isEnabled());
    await emailBtn.click();
    await resp.waitForTimeout(3_000);
    const msgs = await resp.locator('[class*="feedback-message"], [role="alert"], .toast, [class*="toast"]').filter({ visible: true }).allInnerTexts().catch(() => []);
    console.log('EMAIL MESSAGES', msgs);
    await dump(resp, 'l-after-email');
    await resp.waitForTimeout(6_000);
    console.log('AFTER EMAIL TEXT\n' + (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(-1500));
    console.log('AFTER EMAIL: step send enabled', await stepBtn.isEnabled(), '| email button enabled', await emailBtn.isEnabled().catch(() => 'n/a'));
    await stepBtn.click();
    await resp.waitForTimeout(12_000);
    console.log('AFTER STEP SEND URL', resp.isClosed() ? 'closed' : resp.url());
    const next = await openRespond(page, 'ts-visit');
    await dump(next, 'm-visit-step');
    console.log('VISIT STEP TEXT\n' + (await next.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(-2500));
  });

  test('ts-visit (specialist: visit validations, then a valid visit + submit)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-visit'));
    test.setTimeout(25 * 60_000);
    const { page } = await sessions.as('employee2');
    const resp = await openRespond(page, 'ts-visit');
    const msgs = () => resp.locator('[class*="feedback-message"], [role="alert"], .validation-message, [class*="error"], [class*="invalid"]').filter({ visible: true }).allInnerTexts().catch(() => []);
    const fp = await resp.evaluate(() => Array.from(document.querySelectorAll('input')).map((e) => (e as unknown as { _flatpickr?: { config: { maxDate?: Date; minDate?: Date; dateFormat: string; enableTime: boolean } } })._flatpickr)
      .filter(Boolean).map((f) => `max=${f!.config.maxDate} min=${f!.config.minDate} fmt=${f!.config.dateFormat} time=${f!.config.enableTime}`));
    console.log('VISIT DATE PICKERS', fp);
    const send = resp.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true }).last();
    // 1. Empty submit.
    await send.click(); await resp.waitForTimeout(4_000);
    console.log('EMPTY SUBMIT → MESSAGES', await msgs());
    await dump(resp, 'n-visit-empty-submit');
    if (resp.isClosed() || !/RequestDetails/.test(resp.url())) { console.log('!!! EMPTY SUBMIT LEFT THE PAGE', resp.isClosed() ? '' : resp.url()); return; }
    // 2. Finding without description.
    await resp.locator('label', { hasText: /^\s*مؤهل\s*$/ }).first().click();
    await send.click(); await resp.waitForTimeout(4_000);
    console.log('FINDING NO DESCRIPTION → MESSAGES', await msgs());
    await dump(resp, 'n-visit-finding-no-desc');
    if (resp.isClosed() || !/RequestDetails/.test(resp.url())) { console.log('!!! SUBMIT LEFT THE PAGE'); return; }
    // 3. Valid visit.
    const dateInput = resp.locator('input[aria-describedby$="DatepickerAccessibilityInfo"]').filter({ visible: true }).first();
    await dateInput.click();
    await resp.waitForTimeout(1_500);
    const today = resp.locator('.flatpickr-calendar.open .flatpickr-day.today, .flatpickr-calendar.open .flatpickr-day.selected').first();
    console.log('CALENDAR OPEN', await resp.locator('.flatpickr-calendar.open').count(), 'today cells', await today.count());
    await today.click();
    await resp.waitForTimeout(2_000);
    console.log('DATE VALUE', await dateInput.inputValue());
    const hidden = resp.locator('[id$="Input_VisitDate"]').first();
    console.log('HIDDEN DATE VALUE', JSON.stringify(await hidden.inputValue()), 'class', await hidden.getAttribute('class'));
    if (!(await hidden.inputValue())) {
      const iso = await resp.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
      await hidden.evaluate((e, v) => { (e as HTMLInputElement).value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, iso);
      await resp.waitForTimeout(1_500);
      console.log('HIDDEN DATE AFTER DISPATCH', await hidden.inputValue());
    }
    console.log('FINDING CHECKED AFTER DATE PICK', await resp.locator('[id$="b7-Complaint-input"]').isChecked());
    console.log('FILE INPUTS', await resp.locator('input[type="file"]').evaluateAll((els) => els.map((e) => `#${e.id} accept=${e.getAttribute('accept')} multiple=${(e as HTMLInputElement).multiple} parent=${e.closest('[id]')?.id}`)));
    const fileInput = resp.locator('[id^="b3-b20"] input[type="file"]').first();
    await fileInput.setInputFiles('test-data/attachments/sample.pdf');
    await resp.waitForLoadState('networkidle').catch(() => {});
    await resp.waitForTimeout(10_000);
    const obs = (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n');
    console.log('OBSERVATIONS AREA\n' + obs.slice(obs.indexOf('المشاهدات'), obs.indexOf('المشاهدات') + 400));
    const radioHtml = await resp.locator('[id$="b7-Complaint-input"]').evaluate((e) => e.parentElement?.parentElement?.outerHTML.slice(0, 600));
    console.log('RADIO HTML', radioHtml);
    await resp.locator('[id$="b7-Complaint-input"]').evaluate((e) => (e.closest('label') ?? e.parentElement)?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await resp.waitForTimeout(1_000);
    if (!(await resp.locator('[id$="b7-Complaint-input"]').isChecked())) await resp.getByText('مؤهل', { exact: true }).first().click();
    await resp.locator('[id$="b7-TextArea_Description"]').first().fill('زيارة ميدانية آلية - الموقع مؤهل. Automated field visit.');
    console.log('FINDING CHECKED BEFORE SUBMIT', await resp.locator('[id$="b7-Complaint-input"]').isChecked());
    await dump(resp, 'o-visit-filled');
    await send.click(); await resp.waitForTimeout(4_000);
    await dump(resp, 'o-visit-after-submit');
    const req = await resp.locator('[class*="feedback-message"], [role="alert"], .validation-message, [class*="error"], [class*="invalid"]').filter({ visible: true })
      .evaluateAll((els) => els.map((e) => { let p: Element | null = e; for (let k = 0; k < 6 && p; k++) { p = p.parentElement; const l = p?.querySelector('label'); if (l) return `${e.textContent?.trim()} ← ${l.textContent?.trim()}`; } return e.textContent?.trim(); }));
    console.log('REQUIRED MESSAGES WITH LABELS', req);
    const dlg = resp.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true });
    if (await dlg.count()) console.log('DIALOG', (await dlg.last().innerText()).replace(/\s+/g, ' '));
    console.log('VALID SUBMIT → MESSAGES', await msgs());
    await resp.waitForTimeout(10_000);
    console.log('AFTER VISIT SUBMIT URL', resp.isClosed() ? 'closed' : resp.url());
    const { rows } = await expiredTasks(page);
    console.log('TS MENU NOW', await new RowActionMenu(rows.first().locator('td').last()).actions().catch(() => 'no row'));
    const popup = page.context().waitForEvent('page', { timeout: 60_000 });
    await new RowActionMenu(rows.first().locator('td').last()).click('عرض').catch(() => {});
    const view = await popup.catch(() => null);
    if (view) { await view.waitForLoadState('networkidle').catch(() => {}); await view.waitForTimeout(12_000); await viewTabs(view, 'p-after-visit'); }
  });

  test('ts-reopen (specialist: read the saved visit, NO action)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-reopen'));
    test.setTimeout(15 * 60_000);
    const { page } = await sessions.as('employee2');
    const resp = await openRespond(page, 'ts-reopen');
    const hidden = resp.locator('[id$="Input_VisitDate"]').first();
    console.log('SAVED VISIT DATE', JSON.stringify(await hidden.inputValue().catch(() => 'n/a')),
      '| FINDING مؤهل', await resp.locator('[id$="b7-Complaint-input"]').isChecked().catch(() => 'n/a'),
      '| DESCRIPTION', JSON.stringify(await resp.locator('[id$="b7-TextArea_Description"]').first().inputValue().catch(() => 'n/a')));
    const t = (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n');
    console.log('VISIT SECTION\n' + t.slice(t.indexOf('تسجيل بيانات الزيارة'), t.indexOf('هل ترغب في إغلاق الطلب')));
    await dump(resp, 'q-ts-reopen');
  });

  test('ts-open (specialist opens Site Eligibility, NO action)', async ({ sessions }) => {
    test.skip(!STAGES.includes('ts-open'));
    test.setTimeout(20 * 60_000);
    const { page } = await sessions.as('employee2');
    const resp = await openRespond(page, 'ts');
    await dump(resp, 'g-ts-respond');
    console.log('TS RESPOND TEXT\n' + (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(-3000));
  });

  test('inspect (read-only)', async ({ employee }) => {
    test.skip(!STAGES.includes('inspect'));
    test.setTimeout(20 * 60_000);
    const page = employee.page;
    // Request Management: filter by licence number.
    await page.goto(new URL('/Licenses/RequestsManagement', page.url()).toString());
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
    await page.waitForTimeout(10_000);
    const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b3-b13-"]') }).first();
    await panel.getByText(/تصفية\s*\(\d+\)/).first().click();
    await page.locator('#b3-b13-b2-Input_LicenseNumber3').fill(LIC);
    await page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(8_000);
    const rows = panel.locator('table tbody tr').filter({ visible: true });
    console.log('REQUESTS FOR LICENCE', LIC, '\n   ' + (await rows.allInnerTexts()).map((r) => r.replace(/\s+/g, ' | ')).join('\n   '));
    await page.screenshot({ path: `${OUT}/a-requests-by-licence.png`, fullPage: true });
    // View details.
    await rows.first().locator('td').last().locator('.osui-tooltip__content, i').first().click();
    const popup = page.context().waitForEvent('page', { timeout: 30_000 });
    await page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true }).locator('a').filter({ hasText: /عرض|استعراض/ }).first().click();
    const view = await popup;
    await view.waitForLoadState('networkidle').catch(() => {});
    await view.waitForTimeout(15_000);
    for (const tab of ['ملف الشركة', 'تفاصيل الطلب', 'المهام المرتبطة', 'سجل الطلب']) {
      await view.locator('button', { hasText: tab }).filter({ visible: true }).first().click();
      await view.waitForTimeout(6_000);
      if (tab === 'سجل الطلب') {
        const acc = view.getByText('سجل الردود').first();
        if (await acc.isVisible().catch(() => false)) { await acc.click(); await view.waitForTimeout(4_000); }
      }
      const main = (await view.locator('body').innerText()).replace(/\n{2,}/g, '\n');
      console.log(`\n----- VIEW ${tab}\n${main.slice(main.indexOf(tab, 200) > 0 ? main.indexOf(tab, 200) : 0).slice(0, 1800)}`);
      await view.screenshot({ path: `${OUT}/b-view-${tab.replace(/\s+/g, '_')}.png`, fullPage: true });
    }
    await view.close();
    // Task Management row + menu.
    const t = await expiredTasks(page);
    console.log('MENU', await new RowActionMenu(t.rows.first().locator('td').last()).actions().catch((e) => `ERR ${e}`));
  });

  test('review-open (assign to me, dump respond panel, NO submit)', async ({ employee }) => {
    test.skip(!STAGES.includes('review-open'));
    test.setTimeout(20 * 60_000);
    const page = employee.page;
    const { rows } = await expiredTasks(page);
    const menu = new RowActionMenu(rows.first().locator('td').last());
    console.log('MENU BEFORE', await menu.actions());
    if (await menu.has('إسناد إلى')) {
      await menu.click('إسناد إلى');
      await page.waitForTimeout(5_000);
      await dump(page, 'c-assign-dialog');
      console.log('POPUPS', await page.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"], [class*="popup"]').evaluateAll((els) =>
        els.filter((e) => e.getClientRects().length > 0).map((e) => `${e.tagName}.${e.className.toString().slice(0, 60)} :: ${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)}`)));
      const dialog = page.locator('[role="dialog"], .popup-dialog, .osui-popup').filter({ visible: true }).last();
      await expect(dialog).toBeVisible();
      await dialog.locator('label').filter({ hasText: /^\s*لي\s*$/ }).first().click();
      await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.waitForTimeout(8_000);
      console.log('TOASTS', await page.locator('[class*="feedback-message"], [role="alert"]').allInnerTexts().catch(() => []));
      await expiredTasks(page);
    }
    const menu2 = new RowActionMenu((await expiredTasks(page)).rows.first().locator('td').last());
    console.log('MENU AFTER ASSIGN', await menu2.actions());
    const popup = page.context().waitForEvent('page', { timeout: 60_000 });
    await menu2.click('الرد على الطلب');
    const resp = await popup;
    await resp.waitForLoadState('networkidle').catch(() => {});
    await resp.waitForTimeout(15_000);
    console.log('RESP URL', resp.url(), 'TITLE', await resp.title());
    const tabs = await resp.locator('button').filter({ visible: true }).allInnerTexts();
    console.log('RESP BUTTONS', tabs.map((t) => t.trim()).filter(Boolean).join(' / '));
    const respondTab = resp.locator('button', { hasText: /الرد عل[ىي] الطلب/ }).filter({ visible: true }).first();
    if (await respondTab.isVisible().catch(() => false)) { await respondTab.click(); await resp.waitForTimeout(6_000); }
    await dump(resp, 'd-review-respond');
    console.log('RESPOND TEXT\n' + (await resp.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(-2500));
  });
});
