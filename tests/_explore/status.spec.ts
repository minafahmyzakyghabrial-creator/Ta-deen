import { test } from '@fixtures/test';
import { ToDoListPage } from '@pages/investor/ToDoListPage';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor3', employeeUser: 'employee1' });
test('status', async ({ investor, employee }) => {
  test.setTimeout(10 * 60_000);
  for (const rn of ['76900', '76915']) {
    await investor.requests.open();
    await investor.requests.find(rn);
    console.log('STATUS', rn, await investor.requests.cell(rn, 'الحالة'));
    const todo = new ToDoListPage(investor.page);
    await todo.open();
    console.log('TODO', rn, JSON.stringify(await todo.search(rn)));
    console.log('EMP', rn, JSON.stringify(await new TaskManagementPage(employee.page).search(rn)));
  }
});
