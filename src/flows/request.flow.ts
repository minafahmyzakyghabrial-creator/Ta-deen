import { assertMutationsAllowed } from '@config/index';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { EmployeePortal } from '@pages/employee/EmployeePortal';

/**
 * CONTRACT for the first cross-portal business workflow (investor submits → employee acts).
 *
 * NOT IMPLEMENTED YET on purpose: the application/request screens have not been inspected,
 * and this framework does not invent selectors or business behaviour. Implement each method
 * once the screens are known (add their page objects under src/pages/<portal>/ and expose
 * them as getters on InvestorPortal / EmployeePortal).
 *
 * Tip for submitApplication(): read the Request ID from the submit server response with
 * `clickAndWaitForServer(..., { action: '<SubmitActionName>' })` instead of scraping the UI.
 */
export type EmployeeDecision = 'approve' | 'reject' | 'return';

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet — see src/flows/request.flow.ts`);
    this.name = 'NotImplementedError';
  }
}

export class RequestFlow {
  /** Investor: create + submit a new application. Returns the generated Request ID. */
  static async submitApplication(_investor: InvestorPortal, _data: Record<string, unknown>): Promise<string> {
    assertMutationsAllowed('Submit application');
    throw new NotImplementedError('RequestFlow.submitApplication');
  }

  /** Employee: find the request by ID and open it. */
  static async openRequest(_employee: EmployeePortal, _requestId: string): Promise<void> {
    throw new NotImplementedError('RequestFlow.openRequest');
  }

  /** Employee: perform the decision on the opened request. */
  static async decide(_employee: EmployeePortal, _requestId: string, _decision: EmployeeDecision): Promise<void> {
    assertMutationsAllowed('Employee decision');
    throw new NotImplementedError('RequestFlow.decide');
  }

  /** Investor: read the current status of a request. */
  static async getStatus(_investor: InvestorPortal, _requestId: string): Promise<string> {
    throw new NotImplementedError('RequestFlow.getStatus');
  }
}
