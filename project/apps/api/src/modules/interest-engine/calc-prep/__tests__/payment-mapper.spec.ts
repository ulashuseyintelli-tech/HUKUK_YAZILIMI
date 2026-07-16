/**
 * G4b-1 payment-mapper testleri — ledger-varsa-ledger/yoksa-Collection; LedgerAllocation düşer.
 */

import { mapPayments, LedgerPaymentRow, CollectionRow } from '../payment-mapper';

function ledger(p: Partial<LedgerPaymentRow> & { id: string }): LedgerPaymentRow {
  return {
    tenantId: 't1',
    caseId: 'case1',
    entryType: 'PAYMENT',
    status: 'CONFIRMED',
    amount: 100,
    currency: 'TRY',
    entryDate: '2025-03-10',
    ...p,
  };
}
function reversal(paymentId: string | null, p: Partial<LedgerPaymentRow> & { id: string }): LedgerPaymentRow {
  return ledger({
    entryType: 'REVERSAL',
    amount: -100,
    reversesLedgerEntryId: paymentId,
    ...p,
  });
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

  it('COLLECTION provenance tarihleri canonical effective-date authority olmaz', () => {
    const row = {
      ...collection({ id: 'C1', date: '2025-05-02' }),
      valueDate: '2025-05-10',
      confirmedAt: '2025-05-11',
    };

    const res = mapPayments([], [row]);

    expect(res.payments[0].date).toBe('2025-05-02');
    expect(res.payments[0]).not.toHaveProperty('valueDate');
    expect(res.payments[0]).not.toHaveProperty('confirmedAt');
  });

  it.each([
    ['LEDGER effectiveDate', () => mapPayments([ledger({ id: 'L1', effectiveDate: 'invalid-date' })], [])],
    ['LEDGER entryDate fallback', () => mapPayments([ledger({ id: 'L1', entryDate: 'invalid-date', effectiveDate: null })], [])],
    ['COLLECTION date fallback', () => mapPayments([], [collection({ id: 'C1', date: 'invalid-date' })])],
  ])('%s geçersizse legal-balance girdisi üretmek yerine fail-closed olur', (_label, map) => {
    expect(map).toThrow(RangeError);
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

  it('tam PAYMENT + bağlı REVERSAL net-sıfır olur; LEDGER kaynağı korunur ve Collection fallback yapılmaz', () => {
    const res = mapPayments(
      [ledger({ id: 'P1' }), reversal('P1', { id: 'R1' })],
      [collection({ id: 'C1', amount: 999 })],
    );

    expect(res).toEqual({ payments: [], source: 'LEDGER', diagnostics: [] });
  });

  it('birden çok PAYMENT içinde yalnız açıkça bağlı PAYMENT netlenir; ilgisiz PAYMENT etkili kalır', () => {
    const res = mapPayments(
      [ledger({ id: 'P1', amount: 100 }), ledger({ id: 'P2', amount: 250 }), reversal('P1', { id: 'R1', amount: -100 })],
      [],
    );

    expect(res.payments).toEqual([expect.objectContaining({ id: 'P2', amount: 250 })]);
  });

  it('girdi sırası netting sonucunu değiştirmez', () => {
    const rows = [
      ledger({ id: 'P1', amount: 100 }),
      ledger({ id: 'P2', amount: 250 }),
      reversal('P1', { id: 'R1', amount: -100 }),
    ];

    const forward = mapPayments(rows, []);
    const reversed = mapPayments([...rows].reverse(), []);

    expect(forward.source).toBe('LEDGER');
    expect(reversed.source).toBe('LEDGER');
    expect(forward.diagnostics).toEqual([]);
    expect(reversed.diagnostics).toEqual([]);
    expect(forward.payments.map((payment) => [payment.id, payment.amount]).sort()).toEqual(
      reversed.payments.map((payment) => [payment.id, payment.amount]).sort(),
    );
  });

  it('non-CONFIRMED REVERSAL balance üzerinde etkisizdir', () => {
    const res = mapPayments(
      [ledger({ id: 'P1' }), reversal('P1', { id: 'R1', status: 'PENDING' })],
      [],
    );

    expect(res.payments.map((payment) => payment.id)).toEqual(['P1']);
    expect(res.diagnostics).toEqual([]);
  });

  it('reversesLedgerEntryId eksikliği fail-closed olur', () => {
    const res = mapPayments([ledger({ id: 'P1' }), reversal(null, { id: 'R1' })], []);

    expect(res).toMatchObject({ payments: [], source: 'LEDGER' });
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_REFERENCE_MISSING', paymentId: 'R1' }),
    ]);
  });

  it('bulunmayan PAYMENT ilişkisi fail-closed olur', () => {
    const res = mapPayments([reversal('missing', { id: 'R1' })], [collection({ id: 'C1' })]);

    expect(res).toMatchObject({ payments: [], source: 'LEDGER' });
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_PAYMENT_NOT_FOUND', paymentId: 'R1' }),
    ]);
  });

  it.each([
    ['tenant', { tenantId: 't2' }, 'REVERSAL_TENANT_MISMATCH'],
    ['case', { caseId: 'case2' }, 'REVERSAL_CASE_MISMATCH'],
  ])('%s bağlamı farklı REVERSAL fail-closed olur', (_label, overrides, code) => {
    const res = mapPayments([ledger({ id: 'P1' }), reversal('P1', { id: 'R1', ...overrides })], []);

    expect(res.payments).toEqual([]);
    expect(res.diagnostics).toEqual([expect.objectContaining({ code, paymentId: 'R1' })]);
  });

  it('non-negative REVERSAL işareti fail-closed olur', () => {
    const res = mapPayments([ledger({ id: 'P1' }), reversal('P1', { id: 'R1', amount: 100 })], []);

    expect(res.payments).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_SIGN_INVALID', paymentId: 'R1' }),
    ]);
  });

  it('farklı para birimli REVERSAL fail-closed olur', () => {
    const res = mapPayments([ledger({ id: 'P1' }), reversal('P1', { id: 'R1', currency: 'USD' })], []);

    expect(res.payments).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_CURRENCY_MISMATCH', paymentId: 'R1' }),
    ]);
  });

  it('kısmi veya tam zıt olmayan REVERSAL tutarı fail-closed olur', () => {
    const res = mapPayments([ledger({ id: 'P1', amount: 100 }), reversal('P1', { id: 'R1', amount: -40 })], []);

    expect(res.payments).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_AMOUNT_MISMATCH', paymentId: 'R1' }),
    ]);
  });

  it('aynı PAYMENT için ikinci CONFIRMED REVERSAL fail-closed olur', () => {
    const res = mapPayments(
      [ledger({ id: 'P1' }), reversal('P1', { id: 'R1' }), reversal('P1', { id: 'R2' })],
      [],
    );

    expect(res.payments).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ code: 'REVERSAL_DUPLICATE', paymentId: 'R2' }),
    ]);
  });
});
