/** TM3 M3 — müvekkile ödeme kaydı (payout). Banka/dekont/IBAN/onay-workflow YOK. */
export interface CreateClientPayoutDto {
  caseId: string;
  caseClientId: string;
  amount: string | number; // pozitif; Decimal(15,2)
  currency?: string;
  idempotencyKey: string; // zorunlu (tenant-scoped duplicate guard)
  note?: string;
}
