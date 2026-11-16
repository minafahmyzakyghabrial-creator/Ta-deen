import { test } from '@fixtures/test';
import * as fs from 'fs';
import { ToDoListPage } from '@pages/investor/ToDoListPage';
import { trackServerActivity } from '@utils/os-waits';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor2' });
// Read-only probe: open an investor To-Do task (PROBE_REQUEST / PROBE_TASK) and dump the page. Nothing is submitted.
test('investor task', async ({ investor }) => {
  test.setTimeout(15 * 60_000);
  const rn = process.env.PROBE_REQUEST!;
  const todo = new ToDoListPage(investor.page);
  await todo.open();
  const tasks = await todo.search(rn);
  console.log('TODO', JSON.stringify(tasks));
  const task = tasks.find((t) => new RegExp(process.env.PROBE_TASK ?? '.').test(t.taskType))!;
  await todo.openTask(task);
  const page = investor.page;
  await page.waitForURL((u) => !/ToDoList/.test(u.toString()), { timeout: 120_000 });
  await page.waitForLoadState('load').catch(() => {});
  await trackServerActivity(page).idle(2_000, 120_000).catch(() => {});
  await page.waitForTimeout(10_000);
  console.log('URL', page.url());
  for (const pair of (process.env.PROBE_SELECT ?? '').split(';').filter(Boolean)) {
    const [id, label] = pair.split('=');
    const activity = trackServerActivity(page);
    await page.locator(`select[id$="${id}"]`).selectOption({ label });
    await activity.idle(1_500);
    console.log('SELECTED', id, label);
  }
  if (process.env.PROBE_RADIO) await page.locator(`label[for$="${process.env.PROBE_RADIO}"]`).click();
  await page.waitForTimeout(3_000);
  fs.mkdirSync('test-results-probe/itask', { recursive: true });
  fs.writeFileSync('test-results-probe/itask/page.txt', await page.locator('body').innerText());
  fs.writeFileSync('test-results-probe/itask/page.html', await page.content());
  await page.screenshot({ path: 'test-results-probe/itask/page.png', fullPage: true });
  const controls = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button'))
    .filter((e) => e.getClientRects().length > 0 || (e as HTMLInputElement).type === 'file')
    .map((e) => `${e.tagName} ${(e as HTMLInputElement).type ?? ''} ${e.id} ${(e as HTMLInputElement).disabled ? 'disabled' : ''} ${e.tagName === 'SELECT' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).slice(0, 8).join('|') : (e.textContent ?? '').trim().slice(0, 40)} ${(e as HTMLInputElement).labels?.[0]?.innerText.trim() ?? ''}`));
  console.log('CONTROLS\n  ' + controls.join('\n  '));
});
