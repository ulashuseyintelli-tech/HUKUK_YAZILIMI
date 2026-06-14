/**
 * G4b-1 currency-grouper testleri — cross-currency yok; payment-var-bucket-yok → MISMATCH.
 */

import { groupByCurrency } from '../currency-grouper';
import { ClaimBucket, Payment, InterestTypeCode } from '../../types/domain.types';

function bucket(id: string, currency: string): ClaimBucket {
  return { id, amount: 1000, currency: currency as ClaimBucket['currency'], startDate: '2025-01-01', interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365 };
}
function payment(id: string, currency: string): Payment {
  return { id, date: '2025-03-01', amount: 100, currency: currency as Payment['currency'] };
}

describe('currency-grouper (G4b-1)', () => {
  it('tek currency → tek grup, diagnostic yok', () => {
    const res = groupByCurrency([bucket('b1', 'TRY')], [payment('p1', 'TRY')]);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]).toMatchObject({ currency: 'TRY' });
    expect(res.groups[0].buckets.map((b) => b.id)).toEqual(['b1']);
    expect(res.groups[0].payments.map((p) => p.id)).toEqual(['p1']);
    expect(res.diagnostics).toEqual([]);
  });

  it('çok currency → ayrı gruplar (cross-currency birleştirilmez)', () => {
    const res = groupByCurrency(
      [bucket('b1', 'TRY'), bucket('b2', 'USD')],
      [payment('p1', 'TRY'), payment('p2', 'USD')],
    );
    expect(res.groups).toHaveLength(2);
    const tl = res.groups.find((g) => g.currency === 'TRY')!;
    const usd = res.groups.find((g) => g.currency === 'USD')!;
    expect(tl.buckets.map((b) => b.id)).toEqual(['b1']);
    expect(usd.payments.map((p) => p.id)).toEqual(['p2']);
    expect(res.diagnostics).toEqual([]);
  });

  it('payment var, o currency\'de bucket YOK → CURRENCY_MISMATCH', () => {
    const res = groupByCurrency([bucket('b1', 'TRY')], [payment('p1', 'TRY'), payment('p2', 'USD')]);
    expect(res.diagnostics).toEqual([{ code: 'CURRENCY_MISMATCH', currency: 'USD', detail: '1 payment(s), 0 bucket' }]);
  });

  it('bucket var, payment YOK → diagnostic ÜRETME (normal ödenmemiş alacak)', () => {
    const res = groupByCurrency([bucket('b1', 'TRY'), bucket('b2', 'USD')], [payment('p1', 'TRY')]);
    expect(res.diagnostics).toEqual([]);
    expect(res.groups.find((g) => g.currency === 'USD')!.payments).toEqual([]);
  });
});
