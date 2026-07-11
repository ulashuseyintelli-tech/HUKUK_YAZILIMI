/**
 * G4b-1: SAF Payment mapper — Collection/LedgerEntry satırları → engine Payment[].
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Q5: ledger-varsa-ledger / yoksa-Collection. Confirmed PAYMENT/REVERSAL ledger VARSA Collection
 *        TAMAMEN yok sayılır. REVERSAL yalnız reversesLedgerEntryId ile bağlı, tam ve aynı bağlamdaki
 *        PAYMENT'ı netler. Collection filtre: status=CONFIRMED & cancelledAt=null.
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
  tenantId: string;
  caseId: string;
  entryType: string;
  status: string;
  amount: DecimalLike;
  currency: string;
  entryDate: DateLike;
  effectiveDate?: DateLike | null;
  sourceType?: string | null;
  reversesLedgerEntryId?: string | null;
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
export type PaymentMapDiagnosticCode =
  | 'ZERO_OR_NEGATIVE_PAYMENT'
  | 'REVERSAL_REFERENCE_MISSING'
  | 'REVERSAL_PAYMENT_NOT_FOUND'
  | 'REVERSAL_TENANT_MISMATCH'
  | 'REVERSAL_CASE_MISMATCH'
  | 'REVERSAL_CURRENCY_MISMATCH'
  | 'REVERSAL_SIGN_INVALID'
  | 'REVERSAL_AMOUNT_MISMATCH'
  | 'REVERSAL_DUPLICATE';

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

const FATAL_REVERSAL_DIAGNOSTICS = new Set<PaymentMapDiagnosticCode>([
  'REVERSAL_REFERENCE_MISSING',
  'REVERSAL_PAYMENT_NOT_FOUND',
  'REVERSAL_TENANT_MISMATCH',
  'REVERSAL_CASE_MISMATCH',
  'REVERSAL_CURRENCY_MISMATCH',
  'REVERSAL_SIGN_INVALID',
  'REVERSAL_AMOUNT_MISMATCH',
  'REVERSAL_DUPLICATE',
]);

export function hasFatalPaymentMapDiagnostic(diagnostics: PaymentMapDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => FATAL_REVERSAL_DIAGNOSTICS.has(diagnostic.code));
}

function reversalDiagnostic(
  code: PaymentMapDiagnosticCode,
  reversal: LedgerPaymentRow,
  detail: string,
): PaymentMapDiagnostic {
  return { code, paymentId: reversal.id, detail };
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
  // 1) KANONİK: confirmed PAYMENT + yalnız açık ilişkiyle bağlı tam REVERSAL ledger entry'leri.
  const confirmedPayments = ledger.filter((e) => e.entryType === 'PAYMENT' && e.status === 'CONFIRMED');
  const confirmedReversals = ledger.filter((e) => e.entryType === 'REVERSAL' && e.status === 'CONFIRMED');
  if (confirmedPayments.length > 0 || confirmedReversals.length > 0) {
    const paymentsById = new Map(confirmedPayments.map((payment) => [payment.id, payment]));
    const reversedPaymentIds = new Set<string>();
    const diagnostics: PaymentMapDiagnostic[] = [];

    for (const reversal of confirmedReversals) {
      const referencedPaymentId = reversal.reversesLedgerEntryId;
      if (!referencedPaymentId) {
        diagnostics.push(reversalDiagnostic('REVERSAL_REFERENCE_MISSING', reversal, 'reversesLedgerEntryId is required'));
        continue;
      }

      const payment = paymentsById.get(referencedPaymentId);
      if (!payment) {
        diagnostics.push(reversalDiagnostic('REVERSAL_PAYMENT_NOT_FOUND', reversal, `paymentId=${referencedPaymentId}`));
        continue;
      }
      if (reversedPaymentIds.has(referencedPaymentId)) {
        diagnostics.push(reversalDiagnostic('REVERSAL_DUPLICATE', reversal, `paymentId=${referencedPaymentId}`));
        continue;
      }
      if (reversal.tenantId !== payment.tenantId) {
        diagnostics.push(reversalDiagnostic('REVERSAL_TENANT_MISMATCH', reversal, `paymentId=${referencedPaymentId}`));
        continue;
      }
      if (reversal.caseId !== payment.caseId) {
        diagnostics.push(reversalDiagnostic('REVERSAL_CASE_MISMATCH', reversal, `paymentId=${referencedPaymentId}`));
        continue;
      }
      if (reversal.currency !== payment.currency) {
        diagnostics.push(reversalDiagnostic('REVERSAL_CURRENCY_MISMATCH', reversal, `paymentId=${referencedPaymentId}`));
        continue;
      }

      const reversalAmount = toNumber(reversal.amount);
      const paymentAmount = toNumber(payment.amount);
      if (!(reversalAmount < 0)) {
        diagnostics.push(reversalDiagnostic('REVERSAL_SIGN_INVALID', reversal, `amount=${reversalAmount}`));
        continue;
      }
      if (reversalAmount !== -paymentAmount) {
        diagnostics.push(
          reversalDiagnostic(
            'REVERSAL_AMOUNT_MISMATCH',
            reversal,
            `paymentAmount=${paymentAmount};reversalAmount=${reversalAmount}`,
          ),
        );
        continue;
      }

      reversedPaymentIds.add(referencedPaymentId);
    }

    if (hasFatalPaymentMapDiagnostic(diagnostics)) {
      return { payments: [], source: 'LEDGER', diagnostics };
    }

    const effectivePayments = confirmedPayments.filter((payment) => !reversedPaymentIds.has(payment.id));
    const finalized = finalize(effectivePayments.map(ledgerToRaw), 'LEDGER');
    return { ...finalized, diagnostics: [...diagnostics, ...finalized.diagnostics] };
  }

  // 2) FALLBACK: confirmed, iptal-edilmemiş collections
  const confirmedCollections = collections.filter((c) => c.status === 'CONFIRMED' && c.cancelledAt == null);
  if (confirmedCollections.length > 0) {
    return finalize(confirmedCollections.map(collectionToRaw), 'COLLECTION');
  }

  return { payments: [], source: 'NONE', diagnostics: [] };
}
