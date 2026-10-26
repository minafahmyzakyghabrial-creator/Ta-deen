import { test } from '@fixtures/test';
import { DEFAULT_USERS, getCredentials } from '@config/index';
import { EmployeePortal } from '@pages/employee/EmployeePortal';

test('Employee login', async ({ sessions }) => {
  const credentials = getCredentials(DEFAULT_USERS.employee); // fail fast if not configured
  const { page } = await sessions.anonymous('employee');
  const employee = new EmployeePortal(page);

  await test.step('Log in through the employee LDAP login form', async () => {
    await employee.login.login(credentials);
  });
  await test.step('Employee lands on an authenticated page', async () => {
    await employee.home.expectLoaded();
  });
});
