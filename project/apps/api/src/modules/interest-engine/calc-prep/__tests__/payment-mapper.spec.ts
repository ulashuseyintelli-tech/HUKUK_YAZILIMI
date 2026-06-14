/**
 * G4b-1 payment-mapper testleri — ledger-varsa-ledger/yoksa-Collection; LedgerAllocation düşer.
 */

import { mapPayments, LedgerPaymentRow, CollectionRow } from '../payment-mapper';

function ledger(p: Partial<LedgerPaymentRow> & { id: string }): LedgerPaymentRow {
  return { entryType: 'PAYMENT', status: 'CONFIRMED', amount: 100, currency: 'TRY', entryDate: '2025-03-10', ...p };
}
function collection(p: Partial<CollectionRow> & { id: string }): CollectionRow {
  return { status: 'CONFIRMED', amount: 100, currency: 'TRY', date: '2025-03-10', ...p };
}

describe('payment-mapper (G4b-1)', () => {
  it('confirmed PAYMENT ledger VARSA → kaynak LEDGER; collections YOK SAYILIR', () => {
    const res = mapPayments(
      [ledger({ id: 'L1', amount: 500, effectiveDate: '2025-04-01' })],
      [collection({ id: 'C1', amount: 999 })],
    );
    expect(res.source).toBe('LEDGER');
    expect(res.payments).toHaveLength(1);
    expect(res.payments[0].id).toBe('L1');
    expect(res.payments[0].amount).toBe(500);
  });

  it('ledger yoksa → COLLECTION fallback (CONFIRMED, cancelledAt=null)', () => {
    const res = mapPayments([], [collection({ id: 'C1', amount: 250 })]);
    expect(res.source).toBe('COLLECTION');
    expect(res.payments[0]).toMatchObject({ id: 'C1', amount: 250, currency: 'TRY' });
  });

  it('ledger var ama hepsi non-PAYMENT/non-CONFIRMED → COLLECTION fallback', () => {
    const res = mapPayments(
      [ledger({ id: 'L1', entryType: 'REFUND' }), ledger({ id: 'L2', status: 'CANCELLED' })],
      [collection({ id: 'C1' })],
    );
    expect(res.source).toBe('COLLECTION');
    expect(res.payments.map((p) => p.id)).toEqual(['C1']);
  });

  it('iptal edilmiş/onaysız collection dışlanır', () => {
    const res = mapPayments([], [
      collection({ id: 'C1', cancelledAt: '2025-03-11' }),
      collection({ id: 'C2', status: 'PENDING' }),
      collection({ id: 'C3' }),
    ]);
    expect(res.payments.map((p) => p.id)).toEqual(['C3']);
  });

  it('ikisi de boş → NONE', () => {
    const res = mapPayments([], []);
    expect(res).toEqual({ payments: [], source: 'NONE', diagnostics: [] });
  });

  it('LEDGER date = effectiveDate ?? entryDate; source = sourceType', () => {
    const withEff = mapPayments([ledger({ id: 'L1', entryDate: '2025-03-10', effectiveDate: '2025-04-01', sourceType: 'BANKA' })], []);
    expect(withEff.payments[0].date).toBe('2025-04-01');
    expect(withEff.payments[0].source).toBe('BANKA');
    const noEff = mapPayments([ledger({ id: 'L2', entryDate: '2025-03-10', effectiveDate: null })], []);
    expect(noEff.payments[0].date).toBe('2025-03-10');
  });

  it('COLLECTION date = date; source = sourceType ?? channel', () => {
    const res = mapPayments([], [collection({ id: 'C1', date: '2025-05-02', sourceType: null, channel: 'BANKA' })]);
    expect(res.payments[0].date).toBe('2025-05-02');
    expect(res.payments[0].source).toBe('BANKA');
  });

  it('Decimal-string amount → number', () => {
    const res = mapPayments([ledger({ id: 'L1', amount: '1234.56' })], []);
    expect(res.payments[0].amount).toBe(1234.56);
  });

  it('amount <= 0 → drop + ZERO_OR_NEGATIVE_PAYMENT', () => {
    const res = mapPayments([ledger({ id: 'L1', amount: 0 }), ledger({ id: 'L2', amount: 100 })], []);
    expect(res.payments.map((p) => p.id)).toEqual(['L2']);
    expect(res.diagnostics).toEqual([{ code: 'ZERO_OR_NEGATIVE_PAYMENT', paymentId: 'L1', detail: 'amount=0' }]);
  });

  it('Payment yalnız {id,date,amount,currency,source} taşır (LedgerAllocation/extra alan YOK)', () => {
    const res = mapPayments([ledger({ id: 'L1', amount: 100, sourceType: 'KASA' })], []);
    expect(Object.keys(res.payments[0]).sort()).toEqual(['amount', 'currency', 'date', 'id', 'source']);
  });
});
