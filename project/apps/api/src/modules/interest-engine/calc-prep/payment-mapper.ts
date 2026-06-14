/**
 * G4b-1: SAF Payment mapper — Collection/LedgerEntry satırları → engine Payment[].
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Q5: ledger-varsa-ledger / yoksa-Collection. Confirmed PAYMENT ledger VARSA Collection TAMAMEN
 *        yok sayılır. Ledger filtre: entryType=PAYMENT & status=CONFIRMED. Collection filtre:
 *        status=CONFIRMED & cancelledAt=null.
 *  - LedgerAllocation KESİN taşınmaz; Payment yalnız {id,date,amount,currency,source}. Motor TBK100'ü
 *    YENİDEN dağıtır (kanonik = computeBalance).
 *  - date: LEDGER = effectiveDate ?? entryDate; COLLECTION = date (valueDate DEĞİL).
 *  - amount<=0 → drop + ZERO_OR_NEGATIVE_PAYMENT diagnostic.
 *
 * SAF: DB/prisma yok. Girdi = zaten çekilmiş plain satırlar (tek-tenant/tek-case; okuma G4c).
 *
 * <remarks>Çağrıldığı yerler: (G4b-1'de canlı çağıran YOK; ileride G4c orkestrasyon).</remarks>
 */

import { Payment } from '../types/domain.types';

/** Decimal (prisma) | string | number kabul; SAF kalmak için @prisma/client import edilmez. */
type DecimalLike = number | string | { toString(): string };
type DateLike = Date | string;

export interface LedgerPaymentRow {
  id: string;
  entryType: string;
  status: string;
  amount: DecimalLike;
  currency: string;
  entryDate: DateLike;
  effectiveDate?: DateLike | null;
  sourceType?: string | null;
}

export interface CollectionRow {
  id: string;
  status: string;
  cancelledAt?: DateLike | null;
  amount: DecimalLike;
  currency: string;
  date: DateLike;
  sourceType?: string | null;
  channel?: string | null;
}

export type PaymentSource = 'LEDGER' | 'COLLECTION' | 'NONE';
export type PaymentMapDiagnosticCode = 'ZERO_OR_NEGATIVE_PAYMENT';

export interface PaymentMapDiagnostic {
  code: PaymentMapDiagnosticCode;
  paymentId: string;
  detail?: string;
}

export interface PaymentMapResult {
  payments: Payment[];
  source: PaymentSource;
  diagnostics: PaymentMapDiagnostic[];
}

function toNumber(v: DecimalLike): number {
  return typeof v === 'object' && v !== null ? Number(v.toString()) : Number(v);
}

/** Date|string → ISO gün (YYYY-MM-DD; PaymentSchema beklentisi). */
function toISODate(d: DateLike): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

interface RawPayment {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source?: string | null;
}

function ledgerToRaw(e: LedgerPaymentRow): RawPayment {
  return {
    id: e.id,
    date: toISODate(e.effectiveDate ?? e.entryDate),
    amount: toNumber(e.amount),
    currency: e.currency,
    source: e.sourceType ?? null,
  };
}

function collectionToRaw(c: CollectionRow): RawPayment {
  return {
    id: c.id,
    date: toISODate(c.date),
    amount: toNumber(c.amount),
    currency: c.currency,
    source: c.sourceType ?? c.channel ?? null,
  };
}

function finalize(raws: RawPayment[], source: PaymentSource): PaymentMapResult {
  const payments: Payment[] = [];
  const diagnostics: PaymentMapDiagnostic[] = [];
  for (const r of raws) {
    if (!(r.amount > 0)) {
      diagnostics.push({ code: 'ZERO_OR_NEGATIVE_PAYMENT', paymentId: r.id, detail: `amount=${r.amount}` });
      continue;
    }
    payments.push({
      id: r.id,
      date: r.date,
      amount: r.amount,
      currency: r.currency as Payment['currency'],
      ...(r.source != null ? { source: r.source } : {}),
    });
  }
  return { payments, source, diagnostics };
}

/**
 * ledger-varsa-ledger / yoksa-Collection seçici + Payment[] eşleme.
 * SAF: girdi-dışı yan etki yok.
 */
export function mapPayments(
  ledger: LedgerPaymentRow[],
  collections: CollectionRow[],
): PaymentMapResult {
  // 1) KANONİK: confirmed PAYMENT ledger entry'leri
  const confirmedLedger = ledger.filter((e) => e.entryType === 'PAYMENT' && e.status === 'CONFIRMED');
  if (confirmedLedger.length > 0) {
    return finalize(confirmedLedger.map(ledgerToRaw), 'LEDGER');
  }

  // 2) FALLBACK: confirmed, iptal-edilmemiş collections
  const confirmedCollections = collections.filter((c) => c.status === 'CONFIRMED' && c.cancelledAt == null);
  if (confirmedCollections.length > 0) {
    return finalize(confirmedCollections.map(collectionToRaw), 'COLLECTION');
  }

  return { payments: [], source: 'NONE', diagnostics: [] };
}
