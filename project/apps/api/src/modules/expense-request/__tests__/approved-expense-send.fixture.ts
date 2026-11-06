import type { ExpenseSendApprovalService } from '../../client-notification/expense-send-approval.service';

/** Pre-approved adapter ONLY for older transport characterization fixtures.
 * Real 3a authorization is exercised without this double in expense-send-approval.http.db-gated.integration.spec.ts.
 * The historical transport dedupe bucket stays 1 so those tests still measure their original claim/retry invariants.
 */
export function approvedExpenseSendFixture(): ExpenseSendApprovalService {
  return {
    prepare: async (_tenant: string, _user: string, expenseRequestId: string) => ({ allowed: true, context: { expenseRequestId, approvalRequestId: '1' } }),
    begin: async () => undefined,
    reconcile: async () => undefined,
    assertRecordedSend: async () => undefined,
  } as unknown as ExpenseSendApprovalService;
}
