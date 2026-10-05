// Müvekkile ödeme talebinin savedIntent şekli (CLIENT_PAYOUT_POST) — kart ve onay kutusu çekmecesi ortak kullanır.
export interface PayoutIntent {
  caseId: string;
  caseClientId: string;
  amount: string;
  currency: string;
  note: string | null;
  idempotencyKey: string;
}

export function isPayoutIntent(value: unknown): value is PayoutIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.caseId === 'string' &&
    typeof v.caseClientId === 'string' &&
    typeof v.amount === 'string' &&
    typeof v.currency === 'string' &&
    typeof v.idempotencyKey === 'string'
  );
}
