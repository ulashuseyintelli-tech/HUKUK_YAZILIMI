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
import { isSupportedCurrency } from '../types/common.types';

export type CurrencyGroupBlockerCode = 'CURRENCY_MISSING' | 'CURRENCY_UNSUPPORTED';

export interface CurrencyGroup {
  currency: string;
  buckets: ClaimBucket[];
  payments: Payment[];
  blockedReason?: CurrencyGroupBlockerCode;
}

export type CurrencyGroupDiagnosticCode = CurrencyGroupBlockerCode | 'CURRENCY_MISMATCH';

export interface CurrencyGroupDiagnostic {
  code: CurrencyGroupDiagnosticCode;
  currency: string;
  source?: 'CLAIM_BUCKET' | 'PAYMENT';
  sourceId?: string;
  detail?: string;
}

export interface CurrencyGroupResult {
  groups: CurrencyGroup[];
  diagnostics: CurrencyGroupDiagnostic[];
}

function classifyCurrency(currency: unknown): {
  currency: string;
  blockedReason?: CurrencyGroupBlockerCode;
} {
  if (typeof currency !== 'string' || currency.trim().length === 0) {
    return { currency: 'UNKNOWN', blockedReason: 'CURRENCY_MISSING' };
  }
  if (!isSupportedCurrency(currency)) {
    return { currency, blockedReason: 'CURRENCY_UNSUPPORTED' };
  }
  return { currency };
}

export function groupByCurrency(buckets: ClaimBucket[], payments: Payment[]): CurrencyGroupResult {
  const map = new Map<string, CurrencyGroup>();
  const diagnostics: CurrencyGroupDiagnostic[] = [];
  const groupFor = (currency: string, blockedReason?: CurrencyGroupBlockerCode): CurrencyGroup => {
    let g = map.get(currency);
    if (!g) {
      g = { currency, buckets: [], payments: [], ...(blockedReason ? { blockedReason } : {}) };
      map.set(currency, g);
    }
    return g;
  };

  for (const b of buckets) {
    const classified = classifyCurrency(b.currency);
    groupFor(classified.currency, classified.blockedReason).buckets.push(b);
    if (classified.blockedReason) {
      diagnostics.push({
        code: classified.blockedReason,
        currency: classified.currency,
        source: 'CLAIM_BUCKET',
        sourceId: b.id,
        detail: `claimBucketId=${b.id}`,
      });
    }
  }
  for (const p of payments) {
    const classified = classifyCurrency(p.currency);
    groupFor(classified.currency, classified.blockedReason).payments.push(p);
    if (classified.blockedReason) {
      diagnostics.push({
        code: classified.blockedReason,
        currency: classified.currency,
        source: 'PAYMENT',
        sourceId: p.id,
        detail: `paymentId=${p.id}`,
      });
    }
  }

  for (const g of map.values()) {
    if (g.blockedReason) continue;
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
