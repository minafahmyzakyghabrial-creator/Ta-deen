import { AuthStrategyName, getPortal, PortalKey } from '@config/index';
import { InvestorLoginPage } from '@pages/investor/InvestorLoginPage';
import { EmployeeLoginPage } from '@pages/employee/EmployeeLoginPage';
import { FormLoginStrategy } from './FormLoginStrategy';
import { LoginStrategy } from './LoginStrategy';

export * from './LoginStrategy';
export * from './FormLoginStrategy';

/** Registry: strategy name (from src/config/portals.ts) -> implementation. */
const STRATEGIES: Record<AuthStrategyName, LoginStrategy> = {
  'investor-form': new FormLoginStrategy('investor-form', (page) => new InvestorLoginPage(page)),
  'employee-ldap-form': new FormLoginStrategy('employee-ldap-form', (page) => new EmployeeLoginPage(page)),
};

export function strategyForPortal(portal: PortalKey): LoginStrategy {
  return STRATEGIES[getPortal(portal).authStrategy];
}
