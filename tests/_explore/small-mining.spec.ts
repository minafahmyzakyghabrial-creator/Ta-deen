import { expect, test } from '@fixtures/test';
import { Locator, Page } from '@playwright/test';
import { autoFill } from '@utils/auto-fill';
import * as fs from 'fs';
import { MultiSelect } from '@components/MultiSelect';
import { Wizard } from '@components/Wizard';
import { FeedbackMessage } from '@components/FeedbackMessage';
import { trackServerActivity } from '@utils/os-waits';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor2' });

const OUT = 'test-results-probe/msm';
const REQUEST = process.env.PROBE_REQUEST ?? '';
const LICENCE = process.env.PROBE_LICENCE ?? '';

async function dump(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(2_000);
  fs.writeFileSync(`${OUT}/${name}.txt`, await page.locator('body').innerText());
  fs.writeFileSync(`${OUT}/${name}.html`, await page.content());
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('DUMPED', name, page.url());
}

function logActions(page: Page) {
  page.on('response', async (r) => {
    if (!r.url().includes('/screenservices/') || r.request().method() !== 'POST') return;
    const action = r.url().split('/').pop();
    if (/^DataAction|^ActionGet/.test(action ?? '') && !/Save|Submit|Check|Valid/i.test(action ?? '')) return;
    let body = '';
    try { body = JSON.stringify((await r.json()).data).slice(0, 400); } catch { /* */ }
    console.log('ACTION', r.status(), action, body);
  });
}

// Probe (creates a draft on TEST): small mining licence wizard, step by step, dumping each new step.
test('small-mining probe', async ({ investor }) => {
  test.setTimeout(40 * 60_000);
  const page = investor.page;
  const wizard = new Wizard(page);
  logActions(page);
  await investor.requests.open();
  if (REQUEST) {
    await investor.requests.find(REQUEST);
    await investor.requests.rowAction(REQUEST, 'تعديل');
  } else {
    await investor.requests.startNewRequest('إصدار رخصة منجم صغير');
  }
  await page.waitForURL(/New_Mining_License/, { timeout: 150_000 });
  await expect(wizard.nextButton).toBeVisible({ timeout: 150_000 });
  await trackServerActivity(page).idle(1_000, 120_000);
  console.log('STEPS', JSON.stringify(await wizard.stepNames()), 'ACTIVE', await wizard.activeIndex());

  if (!REQUEST || (LICENCE && !process.env.PROBE_SCAN)) {
    const applyAll = page.getByRole('button', { name: 'تطبيق على الكل', exact: true });
    await expect(applyAll).toBeEnabled({ timeout: 60_000 });
    if (await page.locator('[data-block="LicenseInformation.LicenseInformation_Declaration"] input[type=checkbox]:not(:checked)').count()) await applyAll.click();
    const licence = page.locator('select[id$="Dropdown_LicenseId"]');
    const options = (await licence.locator('option').allInnerTexts()).map((t) => t.trim());
    const chosen = LICENCE || options[1];
    let activity = trackServerActivity(page);
    const current = await licence.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.text.trim() ?? '');
    console.log('LICENCE current', JSON.stringify(current));
    if (current !== chosen) await licence.selectOption({ label: chosen });
    await activity.idle(1_000);
    console.log('LICENCE', chosen);
    await dump(page, 's1-after-licence');
    const duration = page.locator('select[id$="LicenseDurationDropdown"]');
    console.log('DURATION disabled', await duration.isDisabled(), 'options', (await duration.locator('option').allInnerTexts()).join(','));
    if (await duration.isEnabled()) await duration.selectOption({ label: '5' });
    const minerals = new MultiSelect(page.locator('[data-block="Common.Minerals_DD"] [role=combobox]').first());
    console.log('MINERAL OPTIONS', JSON.stringify((await minerals.options()).slice(0, 40)), 'SELECTED', await minerals.selected());
    if (!(await minerals.selected()).length) console.log('MINERAL PICKED', await minerals.select());
    activity = trackServerActivity(page);
    await activity.idle(1_000);
    await dump(page, 's1-filled');
  }

  const ATT = 'test-data/attachments/sample.pdf';
  const TEAM_POSITIONS = ['مدير المناجم', 'مهندس تعدين', 'كبير الجيولوجيين', 'جيولوجي', 'مدير البيئة', 'مسؤول العلاقات المجتمعية', 'مساح الألغام (تحت الأرض)'];
  const popup = async (opener: Locator, label: string, extra: Record<string, string> = {}) => {
    if (!(await opener.isVisible().catch(() => false))) return console.log('POPUP', label, 'no opener');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = page.getByRole('dialog').filter({ visible: true }).last();
    if (!(await dialog.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false))) return console.log("POPUP", label, "no dialog opened (inline add?)");
    await trackServerActivity(page).idle(1_000);
    console.log('POPUP', label, 'TEXT', (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 1200));
    fs.writeFileSync(`${OUT}/popup-${label}.html`, await dialog.evaluate((e) => e.outerHTML));
    console.log('POPUP', label, 'FILLED', JSON.stringify(await autoFill(dialog, { attachment: ATT, values: { YearsExperience: '5', ...extra } })));
    const add = dialog.getByRole('button', { name: 'إضافة', exact: true });
    console.log('POPUP', label, 'add buttons', await add.count(), JSON.stringify(await dialog.getByRole('button').allInnerTexts()));
    const before = await new FeedbackMessage(page).count();
    const lineAdds = dialog.locator('button:not(.btn-primary)').filter({ hasText: /^\s*إضافة\s*$/ });
    if (await lineAdds.count()) {
      // Line-based popup: the grey "إضافة" adds the line, the primary one saves.
      await lineAdds.first().click();
      await trackServerActivity(page).idle(1_000);
      console.log('POPUP', label, 'after line add:', (await dialog.locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' / '));
    }
    await add.last().click();
    const closed = await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true, () => false);
    console.log('POPUP', label, closed ? 'SAVED' : 'STILL OPEN', JSON.stringify(await new FeedbackMessage(page).textsSince(before)), closed ? '' : (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 600));
    if (!closed) { await page.screenshot({ path: `${OUT}/popup-${label}-open.png` }); await dialog.locator('[class*=close]').first().click().catch(() => {}); }
  };

  const stepFill = (block: string, values: Record<string, string> = {}) => async () => {
    const scope = page.locator(`[data-block="${block}"]`);
    await expect(scope).toBeVisible({ timeout: 120_000 });
    await trackServerActivity(page).idle(1_000);
    const filled = await autoFill(scope, { attachment: ATT, values });
    console.log('AUTOFILL', block, filled.length, JSON.stringify(filled));
    // Every "إضافة" opener in the step whose table is still empty
    const openers = scope.locator("button:not([data-block$=DevelopmentWork] button)").filter({ hasText: /إضافة/ }).filter({ visible: true });
    console.log("OPENERS", JSON.stringify(await openers.allInnerTexts()));
    const n = await openers.count();
    const openerBlocks = await openers.evaluateAll((els) => els.map((e) => e.closest("[data-block]")?.getAttribute("data-block") ?? ""));
    console.log("OPENER BLOCKS", JSON.stringify(openerBlocks));
    for (let i = 0; i < n; i++) {
      const opener = openers.nth(i);
      const inTeam = await opener.evaluate((el) => !!el.closest('[data-block$="TechnicalTeam"]'));
      if (!inTeam) {
        // Rows of the table that belongs to this button: the nearest table BEFORE it, unless another
        // "إضافة" button sits in between (then that table belongs to the other section).
        const rows = await opener.evaluate((el) => {
          const count = (t: Element) => Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr.getClientRects().length > 0 && tr.querySelectorAll('td').length > 1 && !/لا يوجد|لا توجد|No items/.test(tr.textContent ?? '')).length;
          const hasAdd = (e: Element) => Array.from(e.querySelectorAll('button')).some((b) => /إضافة/.test(b.textContent ?? ''));
          let node: Element | null = el;
          while (node && !node.matches('[data-block^="MiningRequestSteps."]')) {
            for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
              if (hasAdd(s)) return 0;
              const t = s.matches('table') ? s : s.querySelector('table');
              if (t) return count(t);
            }
            node = node.parentElement;
          }
          return 0;
        });
        if (rows > 0) { console.log('POPUP', i, 'section', await opener.evaluate((el) => el.closest('[data-block]')?.getAttribute('data-block')), 'already has', rows, 'rows — skipped'); continue; }
        await popup(opener, `${block.split('.').pop()}-${i}`);
        continue;
      }
      // الفريق الفني: one member per position (except "أخرى")
      const team = page.locator('[data-block="BusinessFeasibility.TechnicalTeam"]');
      const have = (await team.locator('tbody tr td:first-child').allInnerTexts()).map((t) => t.trim());
      for (const position of TEAM_POSITIONS) {
        if (have.includes(position)) continue;
        await popup(team.locator('button').filter({ hasText: /إضافة/ }).first(), `team-${position}`, { DropdownPosition: position });
      }
    }
    const after = await autoFill(scope, { attachment: ATT, values });
    if (after.length) console.log('AUTOFILL again', JSON.stringify(after));
    await dump(page, `filled-${block.split('.').pop()}`);
  };

  const handlers: Record<string, () => Promise<void>> = {
    'دراسة الجدوى الاقتصادية': stepFill('MiningRequestSteps.FeasibilityStudy', { LifeofMine: '5', Input_YearsExperience4: '10', Input_Duration: '3' }),
    'موقع الرخصة': async () => {
      const radio = page.locator('input[type=radio]:checked');
      console.log('RADIO checked', await radio.getAttribute('id'));
      // Read the licence corners (rows of degree/minute/second inputs; X = longitude, Y = latitude).
      const readCorners = () => page.locator('input[id$="-X_DG"]').evaluateAll((els) => els.map((x) => {
        const p = x.id.slice(0, -'X_DG'.length);
        const v = (s: string) => Number((document.getElementById(p + s) as HTMLInputElement | null)?.value ?? 'NaN');
        return { lon: v('X_DG') + v('X_MN') / 60 + v('X_SC') / 3600, lat: v('Y_DG') + v('Y_MN') / 60 + v('Y_SC') / 3600, prefix: p };
      }));
      const corners = await readCorners();
      console.log('CORNERS', JSON.stringify(corners.map((c) => [c.lat.toFixed(6), c.lon.toFixed(6)])));
      const area = (pts: { lat: number; lon: number }[]) => {
        const lat0 = (pts.reduce((s, p) => s + p.lat, 0) / pts.length) * Math.PI / 180;
        let a = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1, x2, y2] = [pts[i].lon * 111.32 * Math.cos(lat0), pts[i].lat * 110.57, pts[i + 1].lon * 111.32 * Math.cos(lat0), pts[i + 1].lat * 110.57];
          a += x1 * y2 - x2 * y1;
        }
        return Math.abs(a / 2);
      };
      const full = area(corners);
      console.log('LICENCE AREA km2', full.toFixed(4));
      // Second radio, then see what the screen offers.
      await page.locator('label[for$="RadioButton2-input"]').click();
      await trackServerActivity(page).idle(1_000);
      await dump(page, 's2-part-radio');
      const editable = await page.locator('input[id$="-X_DG"]').first().isEditable();
      console.log('EDITABLE after radio 2', editable, 'BUTTONS', JSON.stringify(await page.locator('[data-block="MiningRequestSteps.LicenseLocation"] button, [data-block="MiningRequestSteps.LicenseLocation"] a').allInnerTexts()));
      // Shrink towards the centroid: target 0.5 × licence area, and below 0.9 km².
      const ring = corners.slice(0, -1);
      const c = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
      const k = Math.sqrt(Math.min(0.5, 0.9 / full));
      const small = corners.map((p) => ({ ...p, lat: c.lat + (p.lat - c.lat) * k, lon: c.lon + (p.lon - c.lon) * k }));
      console.log('NEW AREA km2', area(small).toFixed(4), 'scale', k.toFixed(3));
      const dms = (deg: number) => { const d = Math.floor(deg); const mF = (deg - d) * 60; const m = Math.floor(mF); return [d, m, +((mF - m) * 60).toFixed(2)]; };
      const rows = await readCorners();
      for (let i = 0; i < rows.length; i++) {
        const [xd, xm, xs] = dms(small[i].lon); const [yd, ym, ys] = dms(small[i].lat);
        for (const [s, v] of [['X_DG', xd], ['X_MN', xm], ['X_SC', xs], ['Y_DG', yd], ['Y_MN', ym], ['Y_SC', ys]] as const) {
          const input = page.locator(`[id="${rows[i].prefix}${s}"]`);
          if (!(await input.isEditable())) { console.log('NOT EDITABLE', rows[i].prefix + s); continue; }
          await input.fill(String(v));
          await input.press('Tab');
        }
      }
      await trackServerActivity(page).idle(1_000);
      console.log('AFTER FILL', JSON.stringify((await readCorners()).map((c) => [c.lat.toFixed(6), c.lon.toFixed(6)])));
      await dump(page, 's2-part-filled');
      const show = page.getByRole('button', { name: /الخريطة|تحديث|عرض/ }).or(page.getByText('انظر على الخريطة', { exact: true }));
      if (await show.count()) { console.log('CLICK', await show.first().innerText()); await show.first().click(); await trackServerActivity(page).idle(1_000); }
      let map = page.frames().find((f) => /SmallMines/.test(f.url()));
      await expect.poll(() => (map = page.frames().find((f) => /SmallMines/.test(f.url()))) !== undefined, { timeout: 120_000 }).toBe(true);
      await page.locator('iframe[id$="-iframe"]').scrollIntoViewIfNeeded();
      const t0 = Date.now();
      await map!.locator('button').first().waitFor({ state: 'attached', timeout: 300_000 }).catch(() => console.log('NO MAP BUTTON after 5 min'));
      console.log('MAP buttons after', (Date.now() - t0) / 1000, 's; frames:', page.frames().map((f) => f.url().slice(0, 80)).join(' || '));
      await page.waitForTimeout(10_000);
      map = page.frames().find((f) => /SmallMines/.test(f.url()));
      const mapUrl = decodeURIComponent(map!.url());
      console.log('MAP URL', mapUrl.slice(mapUrl.indexOf('{')));
      console.log('MAP TEXT', (await map!.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800));
      console.log('MAP BUTTONS', JSON.stringify(await map!.locator('button').evaluateAll((b) => b.map((x) => `${x.id}|${x.textContent?.trim()}|${(x as HTMLButtonElement).disabled}|${(x as HTMLElement).offsetParent !== null}`))));
      const confirm = map!.locator('#btnSubmit');
      if (await confirm.count()) {
        const before = await new FeedbackMessage(page).count();
        await confirm.dispatchEvent('click');
        for (let i = 0; i < 60; i++) {
          await page.waitForTimeout(2_000);
          const msgs = [...(await new FeedbackMessage(page).textsSince(before)), ...(await map!.getByRole('heading').allInnerTexts().catch(() => []))];
          if (msgs.length) { console.log('MAP RESULT', JSON.stringify(msgs)); break; }
        }
      }
      await dump(page, 's2-after-confirm');
    },
  };

  if (process.env.PROBE_SCAN) {
    // From step 2: back to step 1, choose each licence in turn, Next, read the map verdict for "same location".
    const licence = page.locator('select[id$="Dropdown_LicenseId"]');
    const from = Number(process.env.PROBE_SCAN);
    await wizard.next();
    const only = LICENCE ? [LICENCE] : undefined;
    for (let k = from; k < from + (only ? 1 : 12); k++) {
      await wizard.previous();
      const options = only ? ['', ...only] : (await licence.locator('option').allInnerTexts()).map((t) => t.trim());
      if (only) k = 1;
      if (k >= options.length) break;
      const act = trackServerActivity(page);
      await licence.selectOption({ label: options[k] });
      await act.idle(1_000);
      const minerals = new MultiSelect(page.locator('[data-block="Common.Minerals_DD"] [role=combobox]').first());
      if (!(await minerals.selected()).length) await minerals.select().catch((e) => console.log('MINERALS', String(e).slice(0, 200)));
      const change = await wizard.next();
      if (!change.moved) { console.log('SCAN', options[k], 'step1 blocked', change.errors.join(' | ')); await wizard.next().catch(() => {}); continue; }
      const map = page.frames().find((f) => /SmallMines/.test(f.url()));
      let verdict = '';
      if (map) {
        await page.locator('iframe[id$="-iframe"]').scrollIntoViewIfNeeded().catch(() => {});
        await map.locator('#btnSubmit').waitFor({ state: 'attached', timeout: 300_000 }).catch(() => {});
        for (let i = 0; i < 30 && !verdict; i++) {
          await page.waitForTimeout(1_000);
          const h = await map.getByRole('heading').allInnerTexts().catch(() => []);
          if (h.length) verdict = h.join(' | ');
          else if (i > 12 && (await map.locator('#btnSubmit').isEnabled().catch(() => false))) verdict = 'ENABLED (no error)';
        }
        const url = decodeURIComponent(map.url());
        console.log('SCAN', options[k], '→', verdict || '(none)', url.slice(url.indexOf('{'), url.indexOf('{') + 120));
      } else console.log('SCAN', options[k], 'no map frame');
      if (verdict.startsWith('ENABLED')) break;
    }
    return;
  }

  // Walk forward; run the handler of each step when one exists; stop on the first refusal and dump it.
  const visited = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const name = (await wizard.activeName()).trim();
    // A resumed draft: try steps that were already completed (location) without redoing them.
    const tryFirst = REQUEST && name === 'موقع الرخصة' && !visited.has(name);
    if (name === "الدفع") {
      await dump(page, "step-10-payment");
      if (!process.env.PROBE_SUBMIT) break;
      const box = page.locator('[data-block="MiningRequestSteps.Payment"] input[type=checkbox]');
      if (!(await box.isChecked())) await box.check({ force: true });
      const submit = page.locator('button[id$="-Submit"]');
      await expect(submit).toBeEnabled({ timeout: 30_000 });
      const before = await new FeedbackMessage(page).count();
      await submit.click();
      for (let s = 0; s < 90; s++) {
        await page.waitForTimeout(2_000);
        const dlg = page.getByRole('dialog').filter({ visible: true });
        const toasts = await new FeedbackMessage(page).textsSince(before);
        if ((await dlg.count()) || toasts.length || !/New_Mining_License/.test(page.url())) {
          console.log('AFTER SUBMIT url', page.url(), 'toasts', JSON.stringify(toasts), 'dialog', (await dlg.allInnerTexts()).join(' / ').replace(/\s+/g, ' ').slice(0, 800));
          break;
        }
      }
      await page.waitForTimeout(5_000);
      await dump(page, 'after-submit');
      console.log('AFTER SUBMIT TEXT', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
      break;
    }
    if (!handlers[name] && !/الدفع|معلومات الرخصة/.test(name)) {
      const blk = await page.locator("[data-block^=\"MiningRequestSteps.\"]").filter({ visible: true }).first().getAttribute("data-block");
      console.log("GENERIC step", name, blk);
      if (blk) handlers[name] = stepFill(blk);
    }
    if (!tryFirst && handlers[name] && !visited.has(name)) { visited.add(name); await handlers[name](); }
    else if (i > 0 && !tryFirst) await dump(page, `step-${await wizard.activeIndex() + 1}-${name}`);
    let change = await wizard.next();
    console.log('NEXT', JSON.stringify(change));
    if (tryFirst && !change.moved) {
      await new FeedbackMessage(page).closeAll();
      visited.add(name);
      await handlers[name]();
      change = await wizard.next();
      console.log('NEXT', JSON.stringify(change));
    }
    if (!change.moved) {
      await dump(page, `blocked-${change.from}`);
      const diag = await page.evaluate(() => {
        const out: string[] = [];
        const shown = (el: Element) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        for (const el of document.querySelectorAll('.not-valid, [aria-invalid=true]')) if (shown(el)) out.push(`INVALID ${el.tagName} ${el.id}`);
        for (const el of document.querySelectorAll('.validation-message, span[id$="ValidationMessage"]')) if (shown(el) && el.textContent?.trim()) out.push(`MSG ${el.textContent.trim()}`);
        for (const el of document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]), textarea')) if (shown(el) && !el.value && !el.disabled) out.push(`EMPTY ${el.id} ph=${el.placeholder}`);
        for (const el of document.querySelectorAll<HTMLSelectElement>('select')) if (shown(el) && el.selectedIndex <= 0 && !el.disabled) out.push(`EMPTY-SELECT ${el.id}`);
        for (const el of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) if (!el.checked) out.push(`UNCHECKED ${el.id} shown=${shown(el)}`);
        for (const el of document.querySelectorAll('input[type=file]')) out.push(`FILE-SLOT ${el.id} shown=${shown(el.closest('label') ?? el.parentElement!)}`);
        for (const b of document.querySelectorAll('[data-block]')) {
          const t = b.querySelector(':scope table tbody');
          if (t && shown(t) && t.querySelectorAll('tr').length === 0) out.push(`EMPTY-TABLE ${b.getAttribute('data-block')}`);
        }
        return out;
      });
      console.log('DIAG\n  ' + diag.join('\n  '));
      const stepBlk = (await page.locator("[data-block^=\"MiningRequestSteps.\"]").filter({ visible: true }).first().getAttribute("data-block"))?.split(".").pop();
      for (const sub of await page.locator(`[data-block^="${stepBlk}."]`).filter({ visible: true }).all()) {
        const nm = await sub.getAttribute("data-block");
        console.log("SUB", nm, (await sub.innerText()).replace(/\s+/g, " ").slice(0, 500));
        await sub.screenshot({ path: `${OUT}/sub-${nm}.png` }).catch(() => {});
      }
      break;
    }
  }
  await new FeedbackMessage(page).closeAll().catch(() => {});
});
