/**
 * G4b-1 rate-requirements testleri — fixed-rate hariç; (interestType,currency) merge; startDate=min.
 */

import { deriveRateRequirements } from '../rate-requirements';
import { ClaimBucket, InterestTypeCode } from '../../types/domain.types';

function bucket(p: Partial<ClaimBucket> & { id: string }): ClaimBucket {
  return {
    amount: 1000, currency: 'TRY', startDate: '2025-01-01',
    interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365, ...p,
  };
}

describe('rate-requirements (G4b-1)', () => {
  it('değişken bucket → requirement (endDate=asOfDate)', () => {
    const reqs = deriveRateRequirements([bucket({ id: 'b1', interestType: InterestTypeCode.LEGAL_3095, startDate: '2025-02-01' })], '2025-06-01');
    expect(reqs).toEqual([
      { interestType: InterestTypeCode.LEGAL_3095, currency: 'TRY', startDate: '2025-02-01', endDate: '2025-06-01' },
    ]);
  });

  it('fixed-rate bucket (COMMERCIAL_FIXED/CONTRACTUAL) → requirement ÜRETİLMEZ', () => {
    const reqs = deriveRateRequirements([
      bucket({ id: 'b1', interestType: InterestTypeCode.COMMERCIAL_FIXED, fixedRate: 0.48 }),
      bucket({ id: 'b2', interestType: InterestTypeCode.CONTRACTUAL, fixedRate: 0.3 }),
    ], '2025-06-01');
    expect(reqs).toEqual([]);
  });

  it('aynı (interestType,currency) çoklu bucket → tek requirement, startDate=min', () => {
    const reqs = deriveRateRequirements([
      bucket({ id: 'b1', interestType: InterestTypeCode.LEGAL_3095, currency: 'TRY', startDate: '2025-03-01' }),
      bucket({ id: 'b2', interestType: InterestTypeCode.LEGAL_3095, currency: 'TRY', startDate: '2025-01-15' }),
    ], '2025-06-01');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].startDate).toBe('2025-01-15');
  });

  it('farklı interestType/currency → ayrı requirement', () => {
    const reqs = deriveRateRequirements([
      bucket({ id: 'b1', interestType: InterestTypeCode.LEGAL_3095, currency: 'TRY' }),
      bucket({ id: 'b2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, currency: 'TRY' }),
      bucket({ id: 'b3', interestType: InterestTypeCode.LEGAL_3095, currency: 'USD' }),
    ], '2025-06-01');
    expect(reqs).toHaveLength(3);
  });
});
