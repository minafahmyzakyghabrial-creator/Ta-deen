import fs from 'fs';
import path from 'path';
import { Locator, Page, TestInfo } from '@playwright/test';
import { EnvName, UserKey } from '@config/index';
import { BugRecorder } from '@utils/bug-recorder';
import { ExpiredFollowUpRequestsPage } from '@pages/employee/expired-license/ExpiredFollowUpRequestsPage';

/**
 * Run settings shared by the "متابعة رخص منتهية" (Follow-up on Expired License) suite.
 *
 *   env         → environment (overrides TEST_ENV). Only AUTHORISED_ENVS; never prod.
 *   licence     → licence under test. Its follow-up request must already exist (the scheduled job is run MANUALLY by QA).
 *                 LICENCE overrides it per run.
 *   request     → '' = find the request by licence in Request Management; or force a number (REQUEST overrides it).
 *   rcm           → user holding every role EXCEPT the specialist: RCM, SGM, CCO, Levels 1–3, final approval
 *                   (TEST 2026-11-17: Internal1_Preprod = employee3; before that MIM_SuperUser = employee1).
 *   specialist    → Technical Specialist user (Site Eligibility steps) — InternalExplotration = employee2.
 *   finalDecision → what the final approval (UC-016) does: 'approve' → "مكتمل – تمت الموافقة…" or 'reject' → "مكتمل – تم رفض…".
 *                   77433 (2026-11-16) was approved; 20260411420 rejects to cover the other branch. FINAL_DECISION overrides it.
 *   bugsDir       → one screenshot + one entry per bug: <bugsDir>/<licence>/<key>.png + bugs.json (feeds the bug report).
 */
export const RUN: {
  env: EnvName;
  licence: string;
  request: string;
  rcm: UserKey;
  specialist: UserKey;
  superuser: UserKey;
  finalDecision: 'approve' | 'reject';
  bugsDir: string;
} = {
  env: 'test',
  licence: process.env.LICENCE ?? '20260411420',
  request: process.env.REQUEST ?? '',
  // User's call 2026-11-17: "use mim user" (MIM_SuperUser) for every non-specialist role — Internal1_Preprod (employee3)
  // could not take the RCM decision nor see the Request Management tab. RCM_USER overrides it (e.g. RCM_USER=employee3).
  rcm: (process.env.RCM_USER as UserKey) ?? 'employee1',
  specialist: 'employee2',
  // Fallback when the role holder cannot take a task (each fallback is logged as a roles bug): MIM_SuperUser.
  superuser: 'employee1',
  finalDecision: (process.env.FINAL_DECISION as 'approve' | 'reject') ?? 'reject',
  // User's folder for this service's bugs (2026-11-16): one screenshot + one bugs.json entry per bug, per licence.
  bugsDir: process.env.BUGS_DIR ?? 'follow up bugs',
};

export const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];
if (RUN.env === 'prod' || !AUTHORISED_ENVS.includes(RUN.env)) throw new Error(`expired-license-followup must not run on ${RUN.env}.`);
process.env.TEST_ENV = RUN.env;

export function bugs(testInfo: TestInfo): BugRecorder {
  return new BugRecorder(path.join(RUN.bugsDir, RUN.licence), testInfo);
}

const stateFile = () => path.resolve('.workflow-state', `expired-followup-${RUN.licence}.json`);

/** Follow-up request number for RUN.licence (cached in .workflow-state). */
export async function requestNumber(page: Page): Promise<string> {
  if (RUN.request) return RUN.request;
  if (fs.existsSync(stateFile())) return (JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as { request: string }).request;
  const list = new ExpiredFollowUpRequestsPage(page);
  await list.open();
  const rows = await list.search({ licence: RUN.licence });
  if (!rows.length) throw new Error(`No follow-up request found for licence ${RUN.licence} — run the scheduled job first.`);
  const request = rows[0]['رقم الطلب'];
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify({ licence: RUN.licence, request }, null, 2));
  return request;
}

// ---------------------------------------------------------------- comments (user's request 2026-11-17)
// "write comments in description fields" + "check this comment in responses in history tab": every comment submitted with
// a response is logged here and looked up in "سجل الطلب" by the history test.
export interface WrittenComment { readonly task: string; readonly text: string; readonly at: string }
const commentsFile = () => path.resolve('.workflow-state', `expired-followup-${RUN.licence}-comments.json`);
export function writtenComments(): WrittenComment[] {
  return fs.existsSync(commentsFile()) ? JSON.parse(fs.readFileSync(commentsFile(), 'utf8')) : [];
}
/**
 * Writes a comment into every empty description / notes field of the respond panel and logs it (only when a field was
 * filled) so the history test can find it in the response of `task`.
 */
export async function addComment(d: { fillEmptyComments(c: string): Promise<number> }, task: string, what: string): Promise<string> {
  const text = `تعليق آلي — ${what} — ${new Date().toISOString().slice(0, 16)}`;
  if (await d.fillEmptyComments(text)) {
    fs.mkdirSync(path.dirname(commentsFile()), { recursive: true });
    fs.writeFileSync(commentsFile(), JSON.stringify([...writtenComments(), { task, text, at: new Date().toISOString() }], null, 2));
  }
  return text;
}

// ---------------------------------------------------------------- task names (user's request 2026-11-17: "compare also tasks name")

/** Task names as written in the user stories + change log (#10 RCM decision rename, #11 descriptive Site Eligibility steps). */
export const TASK_NAMES = {
  review: 'مراجعة الرخصة المنتهية',
  check: 'التحقق من أهلية الموقع - التحقق من وجود طلب إعادة التأهيل والإغلاق',
  email: 'التحقق من أهلية الموقع - إرسال بريد تذكيري للمستثمر',
  visit: 'التحقق من أهلية الموقع - توثيق الزيارة الميدانية والإفادة',
  rcmDecision: 'قرار مدير التأهيل والإغلاق',
  sgm: 'مراجعة مدير عام الاستدامة',
  cco: 'مراجعة رئيس الامتثال بإسناد',
  level1: 'مراجعة قرار تسييل الضمان المالي – المستوى الأول',
  level2: 'مراجعة قرار تسييل الضمان المالي – المستوى الثاني',
  level3: 'مراجعة قرار تسييل الضمان المالي – المستوى الثالث',
  finalApproval: 'الاعتماد النهائي لتسييل الضمان المالي',
  feedback: 'طلب الإفادة',
} as const;
export type TaskId = keyof typeof TASK_NAMES;

/** Who must answer each task (roles): the specialist for Site Eligibility, the "all other roles" user for the rest. */
export const TASK_OWNER: Record<TaskId, 'specialist' | 'rcm' | 'any'> = {
  review: 'rcm', check: 'specialist', email: 'specialist', visit: 'specialist', rcmDecision: 'rcm', sgm: 'rcm', cco: 'rcm',
  level1: 'rcm', level2: 'rcm', level3: 'rcm', finalApproval: 'rcm', feedback: 'any',
};

const norm = (s: string) => s.replace(/[ىي]/g, 'ي').replace(/[أإآ]/g, 'ا').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Which task a displayed name refers to (tolerates ى/ي, hamza, dashes, the old RCM-decision name). */
export function identifyTask(name: string): TaskId | undefined {
  const n = norm(name);
  const table: [RegExp, TaskId][] = [
    [/قرار مدير التاهيل|المراجعة النهاييه والتحقق|المراجعة النهائيه والتحقق|المراجعه النهاييه/, 'rcmDecision'], [/مراجعة الرخصة المنتهية|مراجعه الرخصه المنتهيه/, 'review'],
    [/التحقق من وجود طلب/, 'check'], [/بريد تذكيري/, 'email'], [/الزيارة الميدانية|الزياره الميدانيه/, 'visit'],
    [/مدير عام الاستدامة|مدير عام الاستدامه/, 'sgm'], [/رييس الامتثال|رئيس الامتثال/, 'cco'],
    [/المستوي الاول/, 'level1'], [/المستوي الثاني/, 'level2'], [/المستوي الثالث/, 'level3'],
    [/الاعتماد النهايي|الاعتماد النهائي/, 'finalApproval'], [/طلب الافادة|طلب الافاده/, 'feedback'],
  ];
  if (/المراجعة النهائية والتحقق/.test(name)) return 'rcmDecision';
  return table.find(([re]) => re.test(n))?.[1];
}

const WHERE: Record<string, string> = {
  title: 'the respond page title', list: 'Task Management "نوع العملية" column', card: 'the "المهام المرتبطة" card',
  'assignee-label': 'the "مسندة إلى" label of its "المهام المرتبطة" card', history: 'the "سجل الطلب" response entry',
};

/**
 * One bug per task × place where its displayed name differs from the user stories. `list` values are truncated by the
 * app ("…توثيق..."), so only their visible prefix is compared.
 */
export async function checkTaskName(b: BugRecorder, page: Page, where: keyof typeof WHERE, shown: string, highlight: Locator[] = [], expectedId?: TaskId): Promise<void> {
  const id = expectedId ?? identifyTask(shown);
  if (!id) return;
  const expected = TASK_NAMES[id];
  const text = shown.replace(/\s+/g, ' ').trim();
  const ok = where === 'list' ? expected.startsWith(text.replace(/(\.{3}|…)$/, '').trim()) : text === expected;
  await b.check(ok, page, { key: `taskname-${id}-${where}`, title: `Task name on ${WHERE[where]} — shows "${text}" instead of "${expected}"`, uc: 'User stories task names; Change #10 / #11', expected, severity: 'Low' },
    text, highlight);
}
