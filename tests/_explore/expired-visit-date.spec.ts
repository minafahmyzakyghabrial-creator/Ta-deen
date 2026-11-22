import fs from 'fs';
import { test } from '@fixtures/test';
import { Page } from '@playwright/test';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
process.env.TEST_ENV = 'test';

// Read-only probe (NO submit): how the UC-007 visit date picker works. REQUEST = request at the visit step.
const RN = process.env.REQUEST ?? '77433';
const OUT = `test-results-probe/visit-date/${RN}`;

async function state(p: Page, tag: string) {
  const s = await p.evaluate(() => {
    type FP = { config: Record<string, unknown>; input: HTMLInputElement; altInput?: HTMLInputElement; selectedDates: Date[]; isOpen: boolean };
    const fps = (Array.from(document.querySelectorAll('input')) as (HTMLInputElement & { _flatpickr?: FP })[]).filter((i) => i._flatpickr).map((i) => {
      const f = i._flatpickr!;
      return { id: i.id, value: i.value, alt: f.altInput ? { id: f.altInput.id, value: f.altInput.value } : null, selected: f.selectedDates.map(String),
        min: String(f.config.minDate), max: String(f.config.maxDate), fmt: f.config.dateFormat, altFmt: f.config.altFormat, disable: JSON.stringify(f.config.disable).slice(0, 200), visible: i.getClientRects().length > 0 };
    });
    const dateInputs = Array.from(document.querySelectorAll('input')).filter((i) => /date|Date|Visit/.test(i.id) || i.getAttribute('aria-describedby')?.includes('Datepicker'))
      .map((i) => ({ id: i.id, type: i.type, value: i.value, visible: i.getClientRects().length > 0, describedby: i.getAttribute('aria-describedby') }));
    const cal = Array.from(document.querySelectorAll('.flatpickr-calendar')).map((c) => ({ open: c.classList.contains('open'), cls: c.className.slice(0, 120),
      today: Array.from(c.querySelectorAll('.flatpickr-day.today')).map((d) => `${d.getAttribute('aria-label')} [${d.className}]`) }));
    return { fps, dateInputs, cal, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, now: new Date().toString() };
  });
  console.log(`\n===== ${tag}\n${JSON.stringify(s, null, 1)}`);
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
}

test('visit date probe (no submit)', async ({ sessions }) => {
  test.setTimeout(15 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });
  const { page } = await sessions.as('employee2');
  const tasks = new ExpiredFollowUpTasksPage(page);
  await tasks.open();
  await tasks.search({ request: RN });
  await tasks.assignToMe(RN);
  const d = await tasks.respond(RN);
  const p = d.page;
  console.log('TITLE', await d.title());
  await state(p, '1-initial');

  // A. Real click on the visible date input, then on the "today" cell.
  const input = d.visitDateInput;
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await p.waitForTimeout(2_000);
  await state(p, '2-calendar-open');
  const today = p.locator('.flatpickr-calendar.open .flatpickr-day.today');
  console.log('TODAY CELLS in open calendar', await today.count());
  if (await today.count()) {
    await today.first().click();
    await p.waitForTimeout(2_000);
    await state(p, '3-after-today-click');
  }

  // B. Every calendar's today cell (in case the open one is another picker).
  const anyToday = p.locator('.flatpickr-day.today').filter({ visible: true });
  console.log('VISIBLE TODAY CELLS anywhere', await anyToday.count());

  // C. Type the date into the visible input (dd/mm/yyyy and yyyy-mm-dd) + Enter.
  for (const v of ['16/11/2026', '2026-11-16']) {
    await input.click();
    await input.fill(v).catch((e) => console.log('FILL FAILED', v, String(e).slice(0, 120)));
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1_500);
    await state(p, `4-typed-${v.replace(/\//g, '-')}`);
  }
});
