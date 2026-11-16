import fs from 'fs';
import path from 'path';
import { Page, TestInfo } from '@playwright/test';
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
 *   rcm         → user acting as Rehabilitation & Closure Manager (answers "مراجعة الرخصة المنتهية").
 *   specialist  → Technical Specialist user (answers the 3 Site Eligibility steps).
 *   bugsDir     → one screenshot + one entry per bug: <bugsDir>/<licence>/<key>.png + bugs.json (feeds the workbook).
 */
export const RUN: {
  env: EnvName;
  licence: string;
  request: string;
  rcm: UserKey;
  specialist: UserKey;
  bugsDir: string;
} = {
  env: 'test',
  licence: process.env.LICENCE ?? '20260610075',
  request: process.env.REQUEST ?? '',
  rcm: 'employee1',
  specialist: 'employee2',
  bugsDir: 'test-cases/bugs/runs',
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
