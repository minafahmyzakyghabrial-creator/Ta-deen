import { test } from '@fixtures/test';
import * as fs from 'fs';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee2' });
// Read-only probe: Technical Specialist (employee2) — login, Task Management → tab "متابعة رخص منتهية", list visible tasks.
test('expired-specialist', async ({ employee }) => {
  test.setTimeout(10 * 60_000);
  const page = employee.page;
  const out = 'test-results-probe/expired-specialist';
  fs.mkdirSync(out, { recursive: true });
  console.log('HOME', page.url());
  await new TaskManagementPage(page).open();
  await page.waitForTimeout(10_000);
  const tab = page.locator('[role="tab"], button').filter({ visible: true }).filter({ hasText: /^\s*متابعة رخص منتهية\s*$/ }).first();
  console.log('TAB VISIBLE', await tab.isVisible().catch(() => false));
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(12_000);
    const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b23-b6"]') }).first();
    const rows = await panel.locator('table tbody tr').filter({ visible: true }).allInnerTexts();
    console.log('ROWS', rows.length);
    rows.forEach((r) => console.log('   ' + r.replace(/\s+/g, ' | ')));
  }
  await page.screenshot({ path: `${out}/tasks.png`, fullPage: true });
});
