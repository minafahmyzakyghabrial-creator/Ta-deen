import fs from 'fs';
import path from 'path';
import { Page } from '@playwright/test';
import { expect, test } from '@fixtures/test';
import { UserKey } from '@config/index';
import { ExpiredFollowUpRequestsPage } from '@pages/employee/expired-license/ExpiredFollowUpRequestsPage';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
import { ExpiredRequestDetailsPage, LinkedTaskCard } from '@pages/employee/expired-license/ExpiredRequestDetailsPage';
import { expiredFollowUp as X } from '@data/expired-license-followup.data';
import { addComment, bugs, checkTaskName, identifyTask, requestNumber, RUN, TASK_OWNER, writtenComments } from './expired-license-followup.config';

/**
 * AFTER THE VISIT — CHANGES DATA. From "قرار مدير التأهيل والإغلاق" (UC-010) through SGM (UC-011), CCO (UC-012),
 * the guarantee-liquidation levels 1–3 (UC-013…015), the final approval (UC-016) and the feedback task (UC-017):
 *
 *   every level, first time : "إرسال" without a decision, and a return without notes, must be refused;
 *                             then "إعادة للموظف السابق" with notes → the task goes back; the previous owner must see the notes
 *   a level with "طلب إفادة" : feedback without role / notes refused; then feedback with role + notes → the level task stays
 *                             open and a feedback task appears; the feedback is answered (UC-017)
 *   then                    : "اعتماد" → next level … until the request is "مكتمل".
 *
 * Who answers a task is not configured per role (accounts for SGM / CCO / L1 / L2 / L3 / DM are unknown): each task is
 * taken by the first of RUN.rcm / RUN.specialist that can respond to it or assign it to themselves.
 * RESUMABLE through .workflow-state/expired-followup-<licence>-decisions.json. One bug = one screenshot ("follow up bugs/").
 */
test.describe.configure({ mode: 'default' });

// Role holder first, then the specialist, then the Super user as a fallback (every fallback is logged as a roles bug).
// Internal1_Preprod (employee3) is offered as a feedback recipient ("الدور الوظيفي المطلوب إفادته" lists people) → it may hold a
// "طلب الإفادة" task, so it is tried last (feedback tasks have no fixed owner — no roles bug).
const CANDIDATES: UserKey[] = [...new Set<UserKey>([RUN.rcm, RUN.specialist, ...(process.env.FALLBACK === '1' ? [RUN.superuser] : []), 'employee3'])];
const DECISION = X.processType.rcmDecision;

/** notes: every note this test typed (checked in "سجل الطلب"); approvals: latest approve note per level (shown on later levels). */
interface Note { task: string; decision: string; text: string }
interface State { visits: Record<string, number>; returned: string[]; feedback: string[]; pendingNote?: { from: string; notes: string }; log: string[]; notes: Note[]; approvals: Note[] }
const stateFile = path.resolve('.workflow-state', `expired-followup-${RUN.licence}-decisions.json`);
const load = (): State => ({ visits: {}, returned: [], feedback: [], log: [], notes: [], approvals: [], ...(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}) });
const save = (s: State) => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(s, null, 2)); };
/** Short, distinct bug-key prefix per task (the three level names only differ in their last word). */
const slug = (task: string): string => {
  const known: [RegExp, string][] = [
    [/قرار مدير التأهيل/, 'rcm-decision'], [/مدير عام الاستدامة/, 'sgm'], [/رئيس الامتثال/, 'cco'],
    [/المستو[ىي] الأول|المستو[ىي] الاول/, 'level1'], [/المستو[ىي] الثاني/, 'level2'], [/المستو[ىي] الثالث/, 'level3'],
    [/الاعتماد النهائي|نائب الوزير/, 'final-approval'], [/الزيارة/, 'visit'], [/^طلب الإفادة/, 'feedback'],
  ];
  return known.find(([re]) => re.test(task))?.[1] ?? task.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
};
const onRespondPage = (p: Page) => !p.isClosed() && /RequestDetails/.test(new URL(p.url()).pathname);

/** Opens the request view as RUN.rcm and returns its linked-task cards (the view page is left open for screenshots). */
async function view(page: Page, rn: string): Promise<{ d: ExpiredRequestDetailsPage; cards: LinkedTaskCard[] }> {
  const list = new ExpiredFollowUpRequestsPage(page);
  await list.open();
  await list.search({ request: rn });
  const d = await list.view(rn);
  return { d, cards: await d.linkedTasks() };
}
const open = (c: LinkedTaskCard) => /قيد التنفيذ|جديد|لم يبدأ/.test(c.status);

test.describe(`Expired licence follow-up — decisions (licence ${RUN.licence})`, () => {
  test('UC-007 post-conditions — what saving the visit did', async ({ sessions }, testInfo) => {
    test.setTimeout(15 * 60_000);
    const b = bugs(testInfo);
    const { page } = await sessions.as(RUN.rcm);
    const rn = await requestNumber(page);
    const { d, cards } = await view(page, rn);
    const visit = cards.find((c) => c.name === X.processType.visit);
    const decision = cards.find((c) => c.name === DECISION && open(c));
    test.skip(!visit || open(visit), 'The visit has not been saved yet.');
    const det = await d.requestDetails();
    await d.openTab('المهام المرتبطة');
    const p = d.page;
    await b.check(!(decision && det['تجاوز المهلة النظامية؟'] !== 'نعم'), p,
      { key: 'visit-escalates-immediately', title: 'Saving the visit closes Site Eligibility and creates "قرار مدير التأهيل والإغلاق" at once (no 180-day wait)', uc: 'UC-007 post-conditions; UC-008 main path 4', expected: 'Task stays with the Technical Specialist; the RCM decision is created only by the day-181 escalation', severity: 'High' },
      `visit card "${visit!.status}", decision card "${decision?.status}" created ${decision?.created}; تجاوز المهلة النظامية؟ = ${det['تجاوز المهلة النظامية؟']}, remaining ${det['عدد الأيام المتبقية']}`, [p.getByText(DECISION).first()]);
    if (decision) {
      await b.check(!decision.assignedTo.includes(X.specialistName), p,
        { key: 'decision-assigned-to-specialist', title: '"قرار مدير التأهيل والإغلاق" is assigned to the Technical Specialist', uc: 'UC-008 main path 4; UC-010 pre-conditions', expected: 'Assigned to the Rehabilitation & Closure Manager', severity: 'High' },
        decision.assignedTo, [p.getByText(decision.assignedTo).first()]);
    }
    await p.close();
  });

  test('UC-010…UC-017 — decisions, returns to the previous employee, feedback, until "مكتمل"', async ({ sessions }, testInfo) => {
    test.setTimeout(150 * 60_000);
    const b = bugs(testInfo);
    const st = load();
    const { page: rcmPage } = await sessions.as(RUN.rcm);
    const rn = await requestNumber(rcmPage);

    for (let round = 1; round <= 40; round++) {
      const { d: v, cards } = await view(rcmPage, rn);
      const current = cards.filter(open);
      console.log(`ROUND ${round}: ${current.map((c) => `${c.name} [${c.status}] ${c.assignedTo}`).join(' ; ') || 'no open task'}`);
      if (!current.length) { await v.page.close(); break; }
      // A feedback task first (its level waits for it), otherwise the open level task.
      const card = current.find((c) => /^طلب الإفادة/.test(c.name)) ?? current[0];
      const task = card.name;
      const id = identifyTask(task);
      // Task names on the linked-task card and its "مسندة إلى" label (the label names the task / group, then [employee]).
      await checkTaskName(b, v.page, 'card', task, [v.page.getByText(task, { exact: true }).first()], id);
      const label = (card.assignedTo.match(/مسندة إلى\s*:\s*(.*?)\s*—/) ?? [])[1] ?? '';
      if (label) await checkTaskName(b, v.page, 'assignee-label', label, [v.page.getByText(card.assignedTo).first()], id);
      await v.page.close();

      // Who can take it?
      let tasks: ExpiredFollowUpTasksPage | undefined;
      let who: UserKey | undefined;
      for (const u of CANDIDATES) {
        const t = new ExpiredFollowUpTasksPage((await sessions.as(u)).page);
        // Slow TEST: a page that does not load for one account must not stop the run — try the next account.
        const ok = await (async () => { await t.open(); return t.take(rn, task); })().catch((e) => { console.log(`  ${u}: task list failed — ${String(e).slice(0, 120)}`); return false; });
        if (ok) { tasks = t; who = u; break; }
      }
      if (!tasks) throw new Error(`None of ${CANDIDATES.join(', ')} can take "${task}" (assigned: ${card.assignedTo}) — the account for this role is needed.`);
      // Roles: the specialist answers Site Eligibility, the "all other roles" user answers the rest (TEST 2026-11-17 accounts).
      const owner = id ? TASK_OWNER[id] : 'any';
      const whoRole = who === RUN.specialist ? 'specialist' : who === RUN.rcm ? 'rcm' : 'superuser';
      if (owner !== 'any') {
        await b.check(owner === whoRole, tasks.page, { key: `role-${id}-wrong-owner`, title: `Roles — "${task}" can only be taken by the ${whoRole === 'specialist' ? 'Technical Specialist' : whoRole === 'superuser' ? 'Super user (MIM_SuperUser) — not by Internal1_Preprod' : 'non-specialist user'} (should be the ${owner === 'specialist' ? 'Technical Specialist' : 'role holder (RCM / SGM / CCO / L1–L3 / DM)'})`, uc: 'Roles & permissions per task (UC-004…016 pre-conditions)', expected: owner === 'specialist' ? 'InternalExplotration (Technical Specialist)' : 'Internal1_Preprod (all roles except specialist)', severity: 'High' },
          `taken by ${who} (${whoRole}); card: ${card.assignedTo}`, [tasks.taskRow(rn, task)]);
      }
      const listName = (await tasks.readRows()).find((r) => r['رقم الطلب'] === rn && (!id || identifyTask(r['نوع العملية'] ?? '') === id || (r['نوع العملية'] ?? '').startsWith(task.slice(0, 20))))?.['نوع العملية'];
      if (listName) await checkTaskName(b, tasks.page, 'list', listName, [tasks.taskRow(rn, task)], id);
      const d = await tasks.respond(rn, task);
      const p = d.page;
      await checkTaskName(b, p, 'title', await d.title(), [], id);
      st.visits[task] = (st.visits[task] ?? 0) + 1;
      st.log.push(`${new Date().toISOString()} ${who} at "${task}" (visit ${st.visits[task]})`);
      save(st);
      const k = slug(task);
      const body = await d.bodyLines();

      // The owner of a returned task must see the returning level's notes (ALT-001 of each level).
      if (st.pendingNote) {
        await b.check(body.includes(st.pendingNote.notes), p,
          { key: `${k}-return-notes-not-visible`, title: `Notes of the return from "${st.pendingNote.from}" not shown on "${task}"`, uc: 'UC-010…015 ALT-001 (return)', expected: `"${st.pendingNote.notes}" visible to the owner`, severity: 'Medium' },
          'notes not found on the respond panel', [d.notes]);
        st.pendingNote = undefined;
        save(st);
      }

      // ---------------- re-verification at the visit (after a return from the RCM decision)
      if (task === X.processType.visit) {
        const keptDate = await d.visitDateInput.inputValue().catch(() => '');
        const keptDesc = await d.visitDescription.inputValue().catch(() => '');
        await b.check(!!keptDate || !keptDesc, p, { key: 'visit-date-not-persisted', title: 'The saved visit has no visit date (finding and description kept, date empty)', uc: 'UC-007 field 13; UC-010 panel (visit details)', expected: 'The visit date picked when the visit was saved', severity: 'High', defect: 'DEF-047' },
          `returned visit: date "", description "${keptDesc.slice(0, 60)}"`, [d.visitDateInput]);
        await d.pickVisitDateToday();
        if (!(await d.findingEligible.isChecked())) await d.selectFindingEligible();
        if (!(await d.visitDescription.inputValue())) await d.visitDescription.fill(X.visitDescription);
        await addComment(d, task, 'إعادة التحقق من الموقع');
        await d.stepSend.click();
        await d.confirmDialogIfAny();
        expect(await d.waitForSubmitted(), 're-verified visit submitted').toBe(true);
        continue;
      }

      const opts = await d.decisionOptions();
      console.log(`  ${who} → "${task}" options: ${opts.join(' / ')}`);

      // Logic: reminder / escalation schedule in "المتابعة التنظيمية" (UC-008: reminder 1 day 31, reminder 2 day 61, decision day 181).
      if (/المتابعة التنظيمية/.test(body)) {
        const day = (re: RegExp) => Number((body.replace(/\s+/g, ' ').match(re) ?? [])[1] ?? NaN);
        const r1 = day(/التذكير الأول للمستثمر\s*\((\d+)\)\s*يوم/);
        const r2 = day(/التذكير الثاني للمستثمر\s*\((\d+)\)\s*يوم/);
        const fin = day(/(?:المراجعة النهائية والتحقق|قرار مدير التأهيل والإغلاق)\s*\((\d+)\)\s*يوم/);
        await b.check([30, 31].includes(r1) && [60, 61].includes(r2) && [180, 181].includes(fin), p,
          { key: 'reminder-schedule-days', title: 'Regulatory follow-up — reminder schedule shows day 1 / day 3 instead of day 31 / day 61 (decision at 180)', uc: 'UC-008 BR-003 (reminder 1 on day 31, reminder 2 on day 61, escalation on day 181)', expected: 'التذكير الأول (31) يوم · التذكير الثاني (61) يوم · قرار مدير التأهيل والإغلاق (180/181) يوم', severity: 'High' },
          `التذكير الأول (${r1}) يوم · التذكير الثاني (${r2}) يوم · final (${fin}) يوم`, [p.getByText(/التذكير الأول للمستثمر/).first()]);
      }

      // Data: a level shows the decisions of the levels before it (read-only history, UC-011…016 fields).
      const earlier = st.approvals.filter((a) => a.task !== task && !/^طلب الإفادة/.test(task));
      if (earlier.length) {
        const missing = earlier.filter((a) => !body.includes(a.text));
        await b.check(!missing.length, p, { key: `${k}-previous-decisions-missing`, title: `"${task}" does not show the earlier levels' decisions`, uc: 'UC-011…016 read-only fields (previous decisions)', expected: `Decisions + notes of: ${earlier.map((a) => a.task).join(', ')}`, severity: 'Medium' },
          `missing on the panel: ${missing.map((a) => a.task).join(', ')}`, [d.notes]);
      }

      // ---------------- feedback task (UC-017)
      if (/^طلب الإفادة/.test(task)) {
        await d.stepSend.click();
        await p.waitForTimeout(4_000);
        const empty = await d.messages();
        await b.check(onRespondPage(p) && empty.length > 0, p, { key: 'feedback-empty-accepted', title: 'Empty feedback is accepted', uc: 'UC-017 field 11', expected: X.messages.requiredFields, severity: 'High' },
          `messages: ${empty.join(' | ') || 'none'}`, [d.notes]);
        if (!onRespondPage(p)) continue;
        if (opts.some((o) => /مكتمل|اعتماد|إرسال/.test(o))) await d.chooseDecision(/مكتمل|اعتماد|إرسال/);
        const answer = `إفادة آلية على طلب الإفادة — ${new Date().toISOString().slice(0, 16)}`;
        await d.notes.fill(answer);
        await addComment(d, task, 'طلب الإفادة — إفادة');
        st.notes.push({ task, decision: 'إفادة', text: answer });
        save(st);
        await d.stepSend.click();
        await d.confirmDialogIfAny();
        expect(await d.waitForSubmitted(), 'feedback submitted').toBe(true);
        continue;
      }

      // ---------------- level task
      const hasReturn = opts.some((o) => /إعادة/.test(o));
      const hasFeedback = opts.some((o) => /إفادة/.test(o));
      if (st.visits[task] === 1) {
        await d.stepSend.click();
        await p.waitForTimeout(4_000);
        const m = await d.messages();
        const stayed = onRespondPage(p);
        await b.check(stayed && m.length > 0, p, { key: `${k}-no-decision-accepted`, title: stayed ? `"${task}": no validation message for "إرسال" without a decision` : `"${task}": "إرسال" without a decision is accepted`, uc: 'UC-010…016 (القرار required)', expected: X.messages.requiredFields, severity: 'High' },
          `messages: ${m.join(' | ') || 'none'}; stayed on the task: ${stayed}`, [d.stepSend]);
        if (!stayed) continue;
        if (hasReturn) {
          await d.chooseDecision(/إعادة/);
          await d.notes.fill('');
          await d.stepSend.click();
          await p.waitForTimeout(4_000);
          const r = await d.messages();
          const stayed2 = onRespondPage(p);
          await b.check(stayed2 && r.length > 0, p, { key: `${k}-return-no-notes`, title: stayed2 ? `"${task}": no validation message for a return without notes` : `"${task}": return without notes is accepted`, uc: 'UC-010…015 BR (notes required for a return)', expected: X.messages.requiredFields, severity: 'High' },
            `messages: ${r.join(' | ') || 'none'}; stayed on the task: ${stayed2}`, [d.notes]);
          if (!stayed2) { st.returned.push(task); save(st); continue; }
        }
      }

      if (hasReturn && !st.returned.includes(task)) {
        await d.chooseDecision(/إعادة/);
        await d.fillEmptyDropdowns(X.specialistName);
        const notes = `إعادة آلية للموظف السابق من "${task}" — ${new Date().toISOString().slice(0, 16)}`;
        await d.notes.fill(notes);
        await addComment(d, task, `${task} — إعادة للموظف السابق`);
        await d.stepSend.click();
        const dlg = await d.confirmDialogIfAny();
        const ok = await d.waitForSubmitted();
        console.log(`  RETURN from "${task}" → submitted ${ok}; dialog "${dlg}"`);
        expect(ok, `return from "${task}" submitted`).toBe(true);
        st.returned.push(task);
        st.pendingNote = { from: task, notes };
        st.notes.push({ task, decision: 'إعادة للموظف السابق', text: notes });
        save(st);
        const after = (await view(rcmPage, rn));
        const nowOpen = after.cards.filter(open).map((c) => c.name);
        await b.check(!nowOpen.includes(task) && nowOpen.length > 0, after.d.page,
          { key: `${k}-return-not-routed`, title: `"إعادة للموظف السابق" on "${task}" did not send the request back`, uc: 'UC-010…015 (return)', expected: 'Level task closed, previous step reopened for its owner', severity: 'High' },
          `open tasks after the return: ${nowOpen.join(', ') || 'none'}`, [after.d.page.getByText(task).first()]);
        await after.d.page.close();
        continue;
      }

      if (hasFeedback && !st.feedback.includes(task)) {
        await d.chooseDecision(/إفادة/);
        await d.notes.fill('');
        await d.stepSend.click();
        await p.waitForTimeout(4_000);
        const fm = await d.messages();
        await b.check(onRespondPage(p) && fm.length > 0, p, { key: `${k}-feedback-no-role-notes`, title: `"${task}": feedback request without role / notes is accepted`, uc: 'UC-013…016 (Request Feedback fields)', expected: '"الدور الوظيفي المطلوب إفادته" and notes required', severity: 'High' },
          `messages: ${fm.join(' | ') || 'none'}`, [d.notes]);
        if (onRespondPage(p)) {
          // "الدور الوظيفي المطلوب إفادته" must list job roles of the workflow, not people (TEST 2026-11-16: "Explotration Demo()").
          const roleOptions = await p.evaluate(() => Array.from(document.querySelectorAll('.vscomp-ele, select'))
            .filter((e) => e.getClientRects().length > 0)
            .flatMap((e) => (e.tagName === 'SELECT' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).slice(1)
              : ((e as unknown as { virtualSelect?: { options: { label: string }[] } }).virtualSelect?.options ?? []).map((o) => o.label.trim()))));
          await b.check(!roleOptions.some((o) => o.includes(X.specialistName) || /\(\s*\)$/.test(o)), p,
            { key: `${k}-feedback-role-is-person`, title: `"${task}": "الدور الوظيفي المطلوب إفادته" lists people, not job roles`, uc: 'UC-013…016 field "Requested Role"', expected: 'Job roles of the workflow (e.g. أخصائي فني, مدير التأهيل والإغلاق …)', severity: 'Medium' },
            roleOptions.join(' / ') || 'no options', [p.locator('.vscomp-toggle-button, select').filter({ visible: true }).last()]);
          // Feedback to the specialist (an account this run uses) rather than the first person listed.
          const roles = await d.fillEmptyDropdowns(X.specialistName);
          const ask = `طلب إفادة آلي من "${task}" — ${new Date().toISOString().slice(0, 16)}`;
          await d.notes.fill(ask);
          await addComment(d, task, `${task} — طلب إفادة`);
          st.notes.push({ task, decision: 'طلب إفادة', text: ask });
          await d.stepSend.click();
          await d.confirmDialogIfAny();
          await d.waitForSubmitted();
          console.log(`  FEEDBACK requested from "${task}" (role ${roles.join(', ')})`);
        }
        st.feedback.push(task);
        save(st);
        const after = await view(rcmPage, rn);
        const level = after.cards.find((c) => c.name === task && open(c));
        const fb = after.cards.find((c) => /^طلب الإفادة/.test(c.name) && open(c));
        await b.check(!!level && !!fb, after.d.page,
          { key: `${k}-feedback-flow`, title: `"طلب إفادة" on "${task}": level task not kept open and/or no feedback task`, uc: 'UC-013…016 ALT-001; UC-017', expected: 'Level task still open with its owner + a "طلب الإفادة" task for the selected role', severity: 'High' },
          `open tasks: ${after.cards.filter(open).map((c) => `${c.name} [${c.status}]`).join(', ') || 'none'}`, [after.d.page.getByText(/إفادة/).first()]);
        await after.d.page.close();
        continue;
      }

      // Final approval: reject this time (RUN.finalDecision) — "رفض" without notes must be refused first (UC-016 ERR-LIC-016-001).
      if (id === 'finalApproval' && RUN.finalDecision === 'reject' && opts.some((o) => /رفض/.test(o))) {
        await d.chooseDecision(/رفض/);
        await d.notes.fill('');
        await d.stepSend.click();
        await p.waitForTimeout(4_000);
        const rm = await d.messages();
        const stayed = onRespondPage(p);
        await b.check(stayed && rm.length > 0, p, { key: 'final-approval-reject-no-notes', title: stayed ? 'Final approval: no validation message for "رفض" without notes' : 'Final approval: "رفض" without notes is accepted', uc: 'UC-016 BR-003; ERR-LIC-016-001', expected: X.messages.requiredFields, severity: 'High' },
          `messages: ${rm.join(' | ') || 'none'}; stayed on the task: ${stayed}`, [d.notes]);
        if (stayed) {
          const why = `رفض آلي لتسييل الضمان المالي — ${new Date().toISOString().slice(0, 16)}`;
          await d.notes.fill(why);
          await addComment(d, task, `${task} — رفض`);
          st.notes.push({ task, decision: 'رفض', text: why });
          save(st);
          await d.stepSend.click();
          await d.confirmDialogIfAny();
          expect(await d.waitForSubmitted(), 'final approval rejected').toBe(true);
        }
        continue;
      }

      // Approve.
      const approve = opts.find((o) => /اعتماد|قبول|موافق/.test(o)) ?? opts.find((o) => !/إعادة|إفادة|رفض/.test(o));
      if (!approve) throw new Error(`"${task}": no approve option among ${opts.join(' / ')}`);
      await d.chooseDecision(new RegExp(approve.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await d.fillEmptyDropdowns();
      const ok = `اعتماد آلي "${task}" — ${new Date().toISOString().slice(0, 16)}`;
      await d.notes.fill(ok).catch(() => {});
      await addComment(d, task, `${task} — اعتماد`);
      st.notes.push({ task, decision: 'اعتماد', text: ok });
      st.approvals = [...st.approvals.filter((a) => a.task !== task), { task, decision: 'اعتماد', text: ok }];
      save(st);
      await d.stepSend.click();
      await d.confirmDialogIfAny();
      expect(await d.waitForSubmitted(), `"${task}" approved`).toBe(true);
    }

    // End state (UC-016): completed — guarantee liquidation approved / rejected (RUN.finalDecision).
    const list = new ExpiredFollowUpRequestsPage(rcmPage);
    await list.open();
    const [row] = await list.search({ request: rn });
    console.log('FINAL ROW', JSON.stringify(row));
    const expectedStatus = RUN.finalDecision === 'reject' ? 'مكتمل – تم رفض تسييل الضمان المالي' : 'مكتمل – تمت الموافقة على تسييل الضمان المالي';
    await b.check((row?.['حالة الطلب'] ?? '').replace(/\s+/g, ' ') === expectedStatus, rcmPage,
      { key: RUN.finalDecision === 'reject' ? 'final-status-rejected' : 'final-status', title: `Final status after "${RUN.finalDecision === 'reject' ? 'رفض' : 'اعتماد'}" on the final approval`, uc: 'UC-016 main path', expected: expectedStatus, severity: 'High' },
      row?.['حالة الطلب'] ?? 'no row', [list.cell(rn, 'حالة الطلب')]);
    // UC-016: on completion the remaining regulatory period is frozen at 0 (77497 showed 0 after "رفض"; 77669 kept 178 after "اعتماد").
    await b.check((row?.['المهلة النظامية المتبقية'] ?? '').replace(/\D/g, '') === '0', rcmPage,
      { key: 'final-remaining-not-zero', title: `Completed request (after "${RUN.finalDecision === 'reject' ? 'رفض' : 'اعتماد'}") still shows a remaining regulatory period`, uc: 'UC-016 main path (remaining frozen at 0)', expected: '0', severity: 'Medium' },
      `${row?.['المهلة النظامية المتبقية'] ?? 'no row'} (status "${row?.['حالة الطلب'] ?? ''}")`, [list.cell(rn, 'المهلة النظامية المتبقية')]);
  });

  test('سجل الطلب (Request History) — every task logged with its name, decision, employee, date and notes', async ({ sessions }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const b = bugs(testInfo);
    const st = load();
    const { page } = await sessions.as(RUN.rcm);
    const rn = await requestNumber(page);
    const { d, cards } = await view(page, rn);
    const p = d.page;
    // Every linked-task card (all tasks of the run) — names + "مسندة إلى" labels.
    for (const c of cards) {
      await checkTaskName(b, p, 'card', c.name, [p.getByText(c.name, { exact: true }).first()]);
      const label = (c.assignedTo.match(/مسندة إلى\s*:\s*(.*?)\s*—/) ?? [])[1] ?? '';
      if (label) await checkTaskName(b, p, 'assignee-label', label, [p.getByText(c.assignedTo).first()], identifyTask(c.name));
    }
    const h = await d.history();
    console.log('HISTORY', JSON.stringify(h.responses, null, 1));
    const hl = p.getByText('سجل الردود').first();

    for (const r of h.responses) await checkTaskName(b, p, 'history', r.task, [p.getByText(`رد ${r.task}`).first()]);

    // Every closed task has a response entry (same count per task name).
    const closed = cards.filter((c) => !open(c));
    const missing: string[] = [];
    for (const name of [...new Set(closed.map((c) => c.name))]) {
      const nCards = closed.filter((c) => c.name === name).length;
      const nResp = h.responses.filter((r) => r.task === name).length;
      if (nResp < nCards) missing.push(`${name}: ${nCards} closed card(s), ${nResp} history entr${nResp === 1 ? 'y' : 'ies'}`);
    }
    await b.check(!missing.length, p, { key: 'history-missing-responses', title: 'سجل الطلب — completed tasks without a response entry', uc: 'UC-002.1 Request History (every action logged)', expected: 'One "رد …" entry per completed task', severity: 'High' },
      missing.join(' · '), [hl]);

    // Who answered — every entry must name the employee.
    const noUser = h.responses.filter((r) => !r.by);
    await b.check(!noUser.length, p, { key: 'history-no-employee', title: 'سجل الطلب — response entries do not show which employee answered', uc: 'UC-002.1 field 20 (performed by)', expected: 'Employee name on every entry', severity: 'Medium' },
      `${noUser.length} of ${h.responses.length} entries without a name: ${[...new Set(noUser.map((r) => r.task))].join(', ')}`, [p.getByText(`رد ${noUser[0]?.task ?? '#none#'}`).first()]);

    // Decision / status wording must be one of the actions of the story (change table).
    const allowed = /^(مكتمل|اعتماد|إعادة للموظف السابق|طلب إفادة|رفض|إنهاء الطلب)$/;
    const odd = h.responses.filter((r) => !allowed.test(r.status));
    await b.check(!odd.length, p, { key: 'history-unexpected-status', title: 'سجل الطلب — response status not one of the story actions (e.g. "تحققت المتطلبات")', uc: 'Action names table (Completed / Approve / Return / Request Feedback / Reject / Terminate)', expected: 'مكتمل / اعتماد / إعادة للموظف السابق / طلب إفادة / رفض / إنهاء الطلب', severity: 'Low' },
      [...new Set(odd.map((r) => `${r.task}: "${r.status}"`))].join(' · '), [p.getByText(odd[0]?.status ?? '#none#', { exact: true }).first()]);

    // Date / time format dd/mm/yyyy – hh:mm AM/PM.
    const badDate = h.responses.filter((r) => !/^\d{2}\/\d{2}\/\d{4}$/.test(r.date) || !/^\d{1,2}:\d{2}(:\d{2})? ?(AM|PM|ص|م)$/i.test(r.time));
    await b.check(!badDate.length, p, { key: 'history-response-date-format', title: 'سجل الطلب — response date / time not dd/mm/yyyy – hh:mm AM/PM', uc: 'UC-002.1 field 21', expected: 'dd/mm/yyyy – hh:mm AM/PM', severity: 'Low' },
      badDate.slice(0, 3).map((r) => `${r.task}: "${r.date} ${r.time}"`).join(' · '), [hl]);

    // Every note typed by the test appears in the history (decision notes, return notes, feedback request + answer).
    const lostNotes = st.notes.filter((n) => !h.text.includes(n.text));
    await b.check(!lostNotes.length, p, { key: 'history-notes-missing', title: 'سجل الطلب — decision / return / feedback notes are not recorded', uc: 'UC-010…017 post-conditions (decision logged with notes)', expected: 'Each decision with its notes in سجل الطلب', severity: 'Medium' },
      `${lostNotes.length} of ${st.notes.length} notes missing: ${lostNotes.slice(0, 4).map((n) => `${n.task} / ${n.decision}`).join(' · ')}`, [hl]);

    // Comments written in the description fields must appear in the response entry of their task (user's request 2026-11-17).
    const comments = writtenComments();
    console.log('COMMENTS WRITTEN', comments.length);
    for (const tid of [...new Set(comments.map((c) => identifyTask(c.task) ?? c.task))]) {
      const mine = comments.filter((c) => (identifyTask(c.task) ?? c.task) === tid);
      const lost = mine.filter((c) => !h.responses.some((r) => (identifyTask(r.task) ?? r.task) === tid && r.notes.includes(c.text)));
      const anywhere = lost.filter((c) => h.text.includes(c.text));
      await b.check(!lost.length, p, { key: `history-comment-${tid}`, title: `سجل الطلب — the comment written in the description field of "${mine[0].task}" is not shown in its response entry`, uc: 'UC-002.1 Request History (response with notes); user request: comments in description fields', expected: 'Each submitted comment visible under "إفادة الموظف" of the response of that task', severity: 'Medium' },
        `${lost.length} of ${mine.length} comment(s) missing${anywhere.length ? ` (${anywhere.length} found elsewhere in the history)` : ''}: "${lost[0]?.text ?? ''}"`, [p.getByText(`رد ${mine[0].task}`).first()]);
    }

    // The decision recorded must be the decision taken (e.g. a return logged as a return).
    const wrong = st.notes.filter((n) => {
      const r = h.responses.find((x) => x.notes.includes(n.text));
      return r && n.decision !== 'إفادة' && !r.status.includes(n.decision.replace('إعادة للموظف السابق', 'إعادة'));
    });
    await b.check(!wrong.length, p, { key: 'history-wrong-decision', title: 'سجل الطلب — the logged decision differs from the decision taken', uc: 'UC-010…016 post-conditions', expected: 'Logged status = decision taken', severity: 'High' },
      wrong.slice(0, 4).map((n) => `${n.task}: took "${n.decision}", logged "${h.responses.find((x) => x.notes.includes(n.text))?.status}"`).join(' · '), [hl]);
    await p.close();
  });
});
