import { Locator, Page } from '@playwright/test';
import { test } from '@fixtures/test';
import * as fs from 'fs';
import { RowActionMenu } from '@components/RowActionMenu';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
// Evidence pass: one screenshot per defect in test-cases/bugs/<DEF-id>.png with the faulty element outlined in red.
// Read-only except two visit-step submits that fail validation (no state change).
const DIR = 'test-cases/bugs';
fs.mkdirSync(DIR, { recursive: true });

async function shot(page: Page, id: string, targets: Locator[]) {
  try {
    for (const t of targets) await t.first().evaluate((e) => { const h = e as HTMLElement; h.style.outline = '4px solid red'; h.style.outlineOffset = '2px'; h.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/${id}.png` });
    for (const t of targets) await t.first().evaluate((e) => { (e as HTMLElement).style.outline = ''; });
    console.log('SAVED', id);
  } catch (e) { console.log('FAILED', id, String(e).slice(0, 150)); }
}
async function safe(id: string, fn: () => Promise<void>) { try { await fn(); } catch (e) { console.log('FAILED', id, String(e).slice(0, 200)); } }

async function requestTab(page: Page) {
  await page.goto(new URL('/Licenses/RequestsManagement', page.url()).toString());
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
  await page.waitForTimeout(10_000);
  return page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b3-b13-"]') }).first();
}
async function taskTab(page: Page) {
  await new TaskManagementPage(page).open();
  await page.locator('[role="tab"], button').filter({ visible: true }).filter({ hasText: /^\s*متابعة رخص منتهية\s*$/ }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(8_000);
  return page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b23-b6"]') }).first();
}
const row = (panel: Locator, rn: string) => panel.locator('table tbody tr').filter({ visible: true }).filter({ has: panel.page().locator('td', { hasText: new RegExp(`^\\s*${rn}\\s*$`) }) });
const cell = (r: Locator, header: string) => r.locator(`td[data-header^="${header}"]`).first();

async function openView(page: Page, panel: Locator, rn: string): Promise<Page> {
  await row(panel, rn).first().locator('td').last().locator('.osui-tooltip__content, i').first().click();
  const popup = page.context().waitForEvent('page', { timeout: 60_000 });
  await page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true }).locator('a').filter({ hasText: /عرض|استعراض/ }).first().click();
  const v = await popup;
  await v.waitForLoadState('networkidle').catch(() => {});
  await v.waitForTimeout(12_000);
  return v;
}

test('evidence: Request Management + details', async ({ employee }) => {
  test.setTimeout(30 * 60_000);
  const page = employee.page;
  const panel = await requestTab(page);
  await safe('DEF-004', async () => shot(page, 'DEF-004', [row(panel, '77247').nth(0), row(panel, '77247').nth(3)]));
  await safe('DEF-003', async () => shot(page, 'DEF-003', [cell(row(panel, '77247').nth(2), 'نوع الرخصة')]));
  await safe('DEF-006', async () => shot(page, 'DEF-006', [cell(row(panel, '77247').first(), 'المهلة النظامية المتبقية'), cell(row(panel, '77247').first(), 'تاريخ انتهاء الرخصة')]));
  await safe('DEF-008', async () => shot(page, 'DEF-008', [cell(row(panel, '77248').first(), 'تجاوز المهلة النظامية')]));
  await safe('DEF-009', async () => shot(page, 'DEF-009', [cell(row(panel, '77248').first(), 'فئة الرخصة')]));
  await safe('DEF-012', async () => shot(page, 'DEF-012', [cell(row(panel, '77248').first(), 'المهلة النظامية المتبقية')]));
  await safe('DEF-014', async () => shot(page, 'DEF-014', [panel.locator('[class*="pagination"]').first()]));
  // Filters
  await panel.getByText(/تصفية\s*\(\d+\)/).first().click();
  await page.waitForTimeout(3_000);
  await safe('DEF-013', async () => shot(page, 'DEF-013', [page.locator('label', { hasText: 'رقم الرخصه' }).first(), page.locator('.vscomp-toggle-button', { hasText: 'أختار' }).first()]));
  await safe('DEF-002', async () => {
    await page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: 'نوع الرخصة' }).first().click();
    await page.waitForTimeout(1_500);
    await shot(page, 'DEF-002', [page.locator('.vscomp-options-container, .vscomp-dropbox').filter({ visible: true }).first()]);
    await page.keyboard.press('Escape');
  });
  await safe('DEF-001', async () => {
    await page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: 'حاله الطلب' }).first().click();
    await page.waitForTimeout(1_500);
    await shot(page, 'DEF-001', [page.locator('.vscomp-options-container, .vscomp-dropbox').filter({ visible: true }).first()]);
    await page.keyboard.press('Escape');
  });
  await safe('DEF-007', async () => {
    const inputs = page.locator('[id^="b3-b13-b2"] input[aria-describedby$="DatepickerAccessibilityInfo"]').filter({ visible: true });
    await inputs.nth(3).click();
    await page.waitForTimeout(1_500);
    const cal = page.locator('.flatpickr-calendar.open').first();
    await cal.locator('.flatpickr-next-month').click().catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, 'DEF-007', [cal]);
    await page.keyboard.press('Escape');
  });
  await safe('DEF-005', async () => {
    await page.locator('#b3-b13-b2-Input_RequestNumber').fill('77252');
    await page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first().click();
    await page.waitForTimeout(8_000);
    await shot(page, 'DEF-005', [cell(row(panel, '77252').first(), 'المهلة النظامية المتبقية'), cell(row(panel, '77252').first(), 'تاريخ انتهاء الرخصة')]);
  });
  // Details of 77248 (later stages) and 77320 (our licence).
  const p2 = await requestTab(page);
  const v = await openView(page, p2, '77248');
  await safe('DEF-015', async () => shot(v, 'DEF-015', [v.locator('h1, [class*="title"]').filter({ hasText: 'طلب متابعة رخصة منتهية' }).last()]));
  await safe('DEF-033', async () => shot(v, 'DEF-033', [v.locator('[class*="breadcrumb"]').filter({ visible: true }).first()]));
  await safe('DEF-017', async () => shot(v, 'DEF-017', [v.getByText('active', { exact: true }).first(), v.getByText('معلومات الشركة').first()]));
  await v.locator('button', { hasText: 'تفاصيل الطلب' }).first().click(); await v.waitForTimeout(5_000);
  await safe('DEF-016', async () => shot(v, 'DEF-016', [v.getByText('حالة الطلب', { exact: true }).last()]));
  await v.locator('button', { hasText: 'المهام المرتبطة' }).first().click(); await v.waitForTimeout(5_000);
  await safe('DEF-018', async () => shot(v, 'DEF-018', [v.getByText('طلب الإفادة', { exact: true }).first()]));
  await safe('DEF-019', async () => shot(v, 'DEF-019', [v.getByText('2026-11-15 14:02:16').nth(0), v.getByText('2026-11-15 14:02:16').nth(1)]));
  await safe('DEF-020', async () => shot(v, 'DEF-020', [v.getByText(/مسندة إلى : المراجعة النهائية والتحقق/).first(), v.getByText(/مسندة إلى : قرار مدير التأهيل والإغلاق/).first()]));
  await safe('DEF-021', async () => shot(v, 'DEF-021', [v.getByText('2026-11-15 14:39:40').first(), v.getByText('2026-11-15 14:40:13').first()]));
  await safe('DEF-022', async () => shot(v, 'DEF-022', [v.getByText('منتهي', { exact: true }).first(), v.getByText(/تاريخ انشاء المهمة/).first()]));
  await safe('DEF-023', async () => shot(v, 'DEF-023', [v.getByText(/المستوي/).first()]));
  await v.locator('button', { hasText: 'سجل الطلب' }).first().click(); await v.waitForTimeout(5_000);
  await safe('DEF-024', async () => shot(v, 'DEF-024', [v.getByText('تاريخ تقديم الطلب').first()]));
  await v.close();
});

test('evidence: Task Management', async ({ employee }) => {
  test.setTimeout(20 * 60_000);
  const page = employee.page;
  const panel = await taskTab(page);
  await safe('DEF-032', async () => shot(page, 'DEF-032', [panel.locator('thead th').nth(1), panel.locator('thead th').nth(2)]));
  await safe('DEF-029', async () => shot(page, 'DEF-029', [page.getByRole('button', { name: 'تعيين جميع المهام لي' }).filter({ visible: true }).first()]));
  await safe('DEF-036', async () => {
    const m = new RowActionMenu(row(panel, '77325').first().locator('td').last());
    console.log('77325 MENU', await m.actions());
    await shot(page, 'DEF-036', [page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true }).first()]);
    await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
  });
  await safe('DEF-035', async () => {
    const m = new RowActionMenu(row(panel, '77249').first().locator('td').last());
    console.log('77249 MENU', await m.actions());
    await shot(page, 'DEF-035', [page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true }).first()]);
    await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
  });
  await panel.getByText(/تصفية\s*\(\d+\)/).first().click();
  await page.waitForTimeout(3_000);
  await safe('DEF-028', async () => {
    await page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: 'نوع العملية' }).first().click();
    await page.waitForTimeout(1_500);
    await shot(page, 'DEF-028', [page.locator('.vscomp-option', { hasText: 'إنهاء المهمة' }).first()]);
    await page.keyboard.press('Escape');
  });
});

test('evidence: specialist visit step (validation-only submits)', async ({ sessions }) => {
  test.setTimeout(20 * 60_000);
  const { page } = await sessions.as('employee2');
  const panel = await taskTab(page);
  const m = new RowActionMenu(row(panel, '77320').first().locator('td').last());
  const popup = page.context().waitForEvent('page', { timeout: 60_000 });
  await m.click('الرد على الطلب');
  const r = await popup;
  await r.waitForLoadState('networkidle').catch(() => {});
  await r.waitForTimeout(12_000);
  await r.locator('button', { hasText: /الرد عل[ىي] الطلب/ }).filter({ visible: true }).first().click();
  await r.waitForTimeout(6_000);
  await safe('DEF-048', async () => {
    await r.locator('label[for$="b7-Complaint-input"]').click();
    await r.waitForTimeout(1_000);
    console.log('finding before date', await r.locator('[id$="b7-Complaint-input"]').isChecked());
    await r.locator('input[aria-describedby$="DatepickerAccessibilityInfo"]').filter({ visible: true }).first().click();
    await r.waitForTimeout(1_000);
    await r.locator('.flatpickr-calendar.open .flatpickr-day.today').first().click();
    await r.waitForTimeout(2_000);
    console.log('finding after date', await r.locator('[id$="b7-Complaint-input"]').isChecked());
    await shot(r, 'DEF-048', [r.locator('[id$="b7-Complaint"]').first().locator('xpath=..')]);
  });
  await safe('DEF-052', async () => {
    await r.locator('label[for$="b7-Complaint-input"]').click();
    await r.locator('[id$="b7-TextArea_Description"]').first().fill('evidence');
    await r.locator('button', { hasText: /^\s*إرسال\s*$/ }).filter({ visible: true }).last().click();
    await r.waitForTimeout(2_500);
    await shot(r, 'DEF-052', [r.locator('[class*="feedback-message"], [role="alert"]').filter({ visible: true }).first()]);
  });
});
