import { test } from '@fixtures/test';
import { ToDoListPage } from '@pages/investor/ToDoListPage';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor2', employeeUser: 'employee1' });
// Read-only probe: status, investor To-Do tasks and employee tasks of the requests in PROBE_REQUESTS.
test('status', async ({ investor, employee }) => {
  test.setTimeout(10 * 60_000);
  if (!process.env.PROBE_REQUESTS) {
    await investor.requests.open();
    console.log('LATEST', JSON.stringify(await investor.requests.latestRequest()));
  }
  for (const rn of (process.env.PROBE_REQUESTS ?? '').split(',').filter(Boolean)) {
    await investor.requests.open();
    await investor.requests.find(rn);
    console.log('STATUS', rn, await investor.requests.cell(rn, 'الحالة'));
    const todo = new ToDoListPage(investor.page);
    await todo.open();
    console.log('TODO', rn, JSON.stringify(await todo.search(rn)));
    console.log('EMP', rn, JSON.stringify(await new TaskManagementPage(employee.page).search(rn)));
  }
});
