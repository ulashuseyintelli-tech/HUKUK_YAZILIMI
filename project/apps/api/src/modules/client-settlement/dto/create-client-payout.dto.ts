/** Payout request/finalize payload. Bank/provider execution is outside this recording contract. */
export interface CreateClientPayoutDto {
  caseId: string;
  caseClientId: string;
  amount: string | number; // pozitif; Decimal(15,2)
  currency?: string;
  idempotencyKey: string; // zorunlu (tenant-scoped duplicate guard)
  note?: string;
  /** Explicit renewal only; never part of the financial idempotency identity or saved intent. */
  renewApprovalRequestId?: string;
}
