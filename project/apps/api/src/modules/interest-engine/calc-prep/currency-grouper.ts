/**
 * G4b-1: SAF currency grouper — ClaimBucket[] + Payment[] → currency bazlı gruplar.
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Cross-currency dağıtım YOK; aynı currency'deki bucket+payment birlikte (G4c'de ayrı computeBalance).
 *  - Tek-currency VARSAYIMI yapılmaz.
 *  - Diagnostic (Gb1-b): payment-var-bucket-yok → CURRENCY_MISMATCH; bucket-var-payment-yok →
 *    diagnostic ÜRETME (normal ödenmemiş alacak).
 *
 * SAF: yan etki yok.
 *
 * <remarks>Çağrıldığı yerler: (G4b-1'de canlı çağıran YOK; ileride G4c orkestrasyon).</remarks>
 */

import { ClaimBucket, Payment } from '../types/domain.types';

export interface CurrencyGroup {
  currency: string;
  buckets: ClaimBucket[];
  payments: Payment[];
}

export type CurrencyGroupDiagnosticCode = 'CURRENCY_MISMATCH';

export interface CurrencyGroupDiagnostic {
  code: CurrencyGroupDiagnosticCode;
  currency: string;
  detail?: string;
}

export interface CurrencyGroupResult {
  groups: CurrencyGroup[];
  diagnostics: CurrencyGroupDiagnostic[];
}

export function groupByCurrency(buckets: ClaimBucket[], payments: Payment[]): CurrencyGroupResult {
  const map = new Map<string, CurrencyGroup>();
  const groupFor = (currency: string): CurrencyGroup => {
    let g = map.get(currency);
    if (!g) {
      g = { currency, buckets: [], payments: [] };
      map.set(currency, g);
    }
    return g;
  };

  for (const b of buckets) groupFor(b.currency).buckets.push(b);
  for (const p of payments) groupFor(p.currency).payments.push(p);

  const diagnostics: CurrencyGroupDiagnostic[] = [];
  for (const g of map.values()) {
    // payment var ama o currency'de bucket yok → ödeme hangi alacağa? (mismatch)
    if (g.buckets.length === 0 && g.payments.length > 0) {
      diagnostics.push({
        code: 'CURRENCY_MISMATCH',
        currency: g.currency,
        detail: `${g.payments.length} payment(s), 0 bucket`,
      });
    }
    // bucket var payment yok → normal (ödenmemiş alacak), diagnostic YOK.
  }

  return { groups: [...map.values()], diagnostics };
}
