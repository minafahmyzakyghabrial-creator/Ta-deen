import { test } from '@fixtures/test';
import { ExpiredFollowUpRequestsPage } from '@pages/employee/expired-license/ExpiredFollowUpRequestsPage';
import { bugs, requestNumber, RUN } from '../expired-license-followup/expired-license-followup.config';

// One-off evidence (read-only) for a bug seen during the 77433 run whose panel is gone now: every "طلب الإفادة" task went to
// a PERSON chosen in "الدور الوظيفي المطلوب إفادته" (the list offered "Explotration Demo()"), not to a job role.
test.use({ employeeUser: RUN.rcm });
test('evidence: feedback role list = people (linked tasks)', async ({ employee }, testInfo) => {
  test.setTimeout(10 * 60_000);
  const b = bugs(testInfo);
  const rn = await requestNumber(employee.page);
  const list = new ExpiredFollowUpRequestsPage(employee.page);
  await list.open();
  await list.search({ request: rn });
  const d = await list.view(rn);
  const cards = await d.linkedTasks();
  const fb = cards.filter((c) => /إفادة/.test(c.name));
  await b.check(false, d.page, { key: 'feedback-role-is-person', title: '"الدور الوظيفي المطلوب إفادته" lists people ("Explotration Demo()"), not job roles — feedback goes to a named user', uc: 'UC-013…016 field "Requested Role"; UC-017 main path 1', expected: 'Job roles of the workflow; the feedback task goes to the selected ROLE', severity: 'Medium' },
    `Role list offered "Explotration Demo()" at Level 1, 2, 3 and final approval; feedback tasks: ${fb.map((c) => `${c.assignedTo} (${c.created})`).join(' ; ')}`,
    [d.page.getByText(/طلب الإفادة — \[/).first()]);
  await d.page.close();
});
