import { test } from '@fixtures/test';
import * as fs from 'fs';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee1' });
// Read-only probe: open the respond tab of an employee task (PROBE_REQUEST / PROBE_TASK) and dump it. Nothing is submitted.
test('task', async ({ employee }) => {
  test.setTimeout(15 * 60_000);
  const rn = process.env.PROBE_REQUEST!;
  const tm = new TaskManagementPage(employee.page);
  const tasks = await tm.search(rn);
  console.log('TASKS', JSON.stringify(tasks));
  const task = tasks.find((t) => new RegExp(process.env.PROBE_TASK ?? '.').test(t.taskType))!;
  const response = await tm.openResponse(task);
  await response.openRespondTab();
  await response.page.waitForTimeout(15_000);
  fs.mkdirSync('test-results-probe/task', { recursive: true });
  const body = response.page.locator('body');
  fs.writeFileSync('test-results-probe/task/respond.txt', await body.innerText());
  fs.writeFileSync('test-results-probe/task/respond.html', await response.page.content());
  await response.page.screenshot({ path: 'test-results-probe/task/respond.png', fullPage: true });
  const controls = await response.page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button, iframe'))
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => `${e.tagName} ${(e as HTMLInputElement).type ?? ''} ${e.id} ${(e as HTMLInputElement).disabled ? 'disabled' : ''} ${e.tagName === 'IFRAME' ? (e as HTMLIFrameElement).src.slice(0, 80) : (e.textContent ?? '').trim().slice(0, 40)} ${(e as HTMLInputElement).labels?.[0]?.innerText.trim() ?? ''}`));
  console.log('CONTROLS\n  ' + controls.join('\n  '));
  console.log('FRAMES', response.page.frames().map((f) => f.url().slice(0, 100)).join(' | '));
});
