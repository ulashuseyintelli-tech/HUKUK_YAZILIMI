/**
 * G4a assembler testleri — ClaimItem → ClaimBucket saf çekirdek.
 * Kilitli: Q1 (her PRINCIPAL=bucket) · Q3 (demandedAmount??amount, collected düşülmez) ·
 * Q4 (costs/ancillaries ayrı projeksiyon) · Q6 (INTEREST dışla) · Q2/Gb/Gc (diagnostic, tahmin yok) ·
 * E-G2b (interestRate%→fixedRate0-1, yalnız requiresFixedRate).
 */

import { assembleClaimBuckets, ClaimItemInput } from '../claim-bucket-assembler';
import { InterestTypeCode, AncillaryType } from '../../types/domain.types';

function item(p: Partial<ClaimItemInput> & { id: string; itemType: string }): ClaimItemInput {
  return {
    amount: 1000,
    currency: 'TRY',
    status: 'ACTIVE',
    ...p,
  };
}

describe('claim-bucket-assembler (G4a)', () => {
  describe('Q1/Q3 PRINCIPAL → bucket', () => {
    it('principal kendi konfigi ile → 1 bucket; amount=demandedAmount, collected düşülmez', () => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', amount: 10000, demandedAmount: 8000,
          interestType: 'YASAL', interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({
        id: 'p1', amount: 8000, currency: 'TRY', startDate: '2025-01-01',
        interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365,
      });
      expect(res.buckets[0].fixedRate).toBeUndefined();
      expect(res.diagnostics).toHaveLength(0);
    });

    it('demandedAmount yoksa amount baz alınır', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 5000, interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets[0].amount).toBe(5000);
    });

    it('base <= 0 → ZERO_OR_NEGATIVE_AMOUNT + bucket yok', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 0, interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual([{ code: 'ZERO_OR_NEGATIVE_AMOUNT', claimItemId: 'p1', detail: 'base=0' }]);
    });

    it('çok-principal farklı tür/tarih/currency → çok bucket', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, currency: 'TRY', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
        item({ id: 'p2', itemType: 'PRINCIPAL', amount: 2000, currency: 'USD', interestType: 'TICARI', interestStartDate: '2025-02-01' }),
      ]);
      expect(res.buckets).toHaveLength(2);
      expect(res.buckets.map((b) => b.id).sort()).toEqual(['p1', 'p2']);
    });
  });

  describe('E-G2b fixedRate wiring', () => {
    it('SABIT (→COMMERCIAL_FIXED) + interestRate=%48 → fixedRate=0.48', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestType: 'SABIT', interestRate: 48, interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets[0].interestType).toBe(InterestTypeCode.COMMERCIAL_FIXED);
      expect(res.buckets[0].fixedRate).toBe(0.48);
    });

    it('COMMERCIAL_FIXED + interestRate YOK → FIXED_RATE_REQUIRED + bucket yok', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestType: 'SABIT', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics[0]).toMatchObject({ code: 'FIXED_RATE_REQUIRED', claimItemId: 'p1' });
    });

    it('değişken tür (YASAL) → fixedRate set edilmez', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestRate: 24, interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets[0].fixedRate).toBeUndefined();
    });
  });

  describe('Q6 INTEREST dışlama', () => {
    it('INTEREST/PRE/POST → excluded, bucket olmaz', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
        item({ id: 'i1', itemType: 'INTEREST', amount: 500 }),
        item({ id: 'i2', itemType: 'PRE_INTEREST', amount: 200 }),
        item({ id: 'i3', itemType: 'POST_INTEREST', amount: 300 }),
      ]);
      expect(res.buckets).toHaveLength(1);
      expect(res.excluded.interestItemIds.sort()).toEqual(['i1', 'i2', 'i3']);
    });

    it('principal kendi faiz configine sahipse explicit INTEREST amount bucket veya double-count olmaz', () => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1',
          itemType: 'PRINCIPAL',
          amount: 1000,
          interestType: 'SABIT',
          interestRate: 48,
          interestStartDate: '2025-01-01',
        }),
        item({
          id: 'i1',
          itemType: 'INTEREST',
          amount: 500,
          interestType: 'YASAL',
          interestStartDate: '2024-01-01',
        }),
      ]);

      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({
        id: 'p1',
        amount: 1000,
        interestType: InterestTypeCode.COMMERCIAL_FIXED,
        startDate: '2025-01-01',
        fixedRate: 0.48,
      });
      expect(res.excluded.interestItemIds).toEqual(['i1']);
    });
  });

  describe('Q4 costs/ancillaries ayrı projeksiyon (dağıtılmaz)', () => {
    it('FEE/EXPENSE/COMMISSION → costs; ATTORNEY_FEE/CHECK_PENALTY/PENALTY/OTHER → ancillaries', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
        item({ id: 'c1', itemType: 'FEE', amount: 100 }),
        item({ id: 'c2', itemType: 'EXPENSE', amount: 50 }),
        item({ id: 'a1', itemType: 'ATTORNEY_FEE', amount: 300 }),
        item({ id: 'a2', itemType: 'PENALTY', amount: 70 }),
      ]);
      expect(res.costs).toEqual({ [AncillaryType.HARC]: 100, [AncillaryType.TEBLIGAT_MASRAFI]: 50 });
      expect(res.ancillaries).toEqual({ [AncillaryType.VEKALET_UCRETI]: 300, [AncillaryType.DIGER]: 70 });
      // buckets'a dağıtılmadı
      expect(res.buckets[0].costs).toBeUndefined();
      expect(res.buckets[0].ancillaries).toBeUndefined();
    });

    it('aynı AncillaryType\'a çoklu kalem toplanır', () => {
      const res = assembleClaimBuckets([
        item({ id: 'a1', itemType: 'PENALTY', amount: 70 }),
        item({ id: 'a2', itemType: 'OTHER', amount: 30 }),
      ]);
      expect(res.ancillaries).toEqual({ [AncillaryType.DIGER]: 100 });
    });
  });

  describe('TAX yönlendirme', () => {
    it('parent COST/ANCILLARY → projeksiyon; PRINCIPAL/INTEREST → TAX_TIER_DEFERRED; yok → TAX_WITHOUT_PARENT', () => {
      const res = assembleClaimBuckets([
        item({ id: 't1', itemType: 'TAX_KDV', amount: 18, metadata: { taxParentCategory: 'COST' } }),
        item({ id: 't2', itemType: 'TAX_KDV', amount: 9, metadata: { taxParentCategory: 'ANCILLARY' } }),
        item({ id: 't3', itemType: 'TAX_KDV', amount: 5, metadata: { taxParentCategory: 'PRINCIPAL' } }),
        item({ id: 't4', itemType: 'TAX_KDV', amount: 5 }),
      ]);
      expect(res.costs).toEqual({ [AncillaryType.DIGER]: 18 });
      expect(res.ancillaries).toEqual({ [AncillaryType.DIGER]: 9 });
      expect(res.diagnostics).toEqual([
        { code: 'TAX_TIER_DEFERRED', claimItemId: 't3', detail: 'parent=PRINCIPAL' },
        { code: 'TAX_WITHOUT_PARENT', claimItemId: 't4', detail: 'parent=none' },
      ]);
    });
  });

  describe('Q2 faiz konfig zinciri (diagnostic, tahmin yok)', () => {
    it('tek principal + ayrı tek INTEREST config → config principal\'a uygulanır', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 }),
        item({ id: 'i1', itemType: 'INTEREST', amount: 100, interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({
        id: 'p1',
        amount: 1000,
        interestType: InterestTypeCode.LEGAL_3095,
        startDate: '2025-01-01',
      });
      expect(res.excluded.interestItemIds).toEqual(['i1']);
    });

    it('çok principal + ayrı INTEREST config → AMBIGUOUS_INTEREST_CONFIG, bucket yok', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 }),
        item({ id: 'p2', itemType: 'PRINCIPAL', amount: 2000 }),
        item({ id: 'i1', itemType: 'INTEREST', amount: 100, interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics.filter((d) => d.code === 'AMBIGUOUS_INTEREST_CONFIG')).toHaveLength(2);
    });

    it('Case-level fallback (yalnız tür+başlangıç) — değişken tür çalışır', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
        { interestType: 'YASAL', interestStartDate: '2025-03-01' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.LEGAL_3095, startDate: '2025-03-01' });
    });

    it('Case-level fallback + fixed tür → rate yok → FIXED_RATE_REQUIRED', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
        { interestType: 'SABIT', interestStartDate: '2025-03-01' },
      );
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics[0]).toMatchObject({ code: 'FIXED_RATE_REQUIRED', claimItemId: 'p1' });
    });

    it('hiçbir faiz konfig yok → MISSING_INTEREST_CONFIG + bucket yok (Gc)', () => {
      const res = assembleClaimBuckets([item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual([{ code: 'MISSING_INTEREST_CONFIG', claimItemId: 'p1' }]);
    });
  });

  describe('Gb start date / E-G1 tür', () => {
    it('startDate çözülemez → MISSING_START_DATE (issueDate fallback yok)', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual([{ code: 'MISSING_START_DATE', claimItemId: 'p1' }]);
    });

    it('YOKSUN interestType → UNSUPPORTED_INTEREST_TYPE + bucket yok', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YOKSUN', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics[0]).toMatchObject({ code: 'UNSUPPORTED_INTEREST_TYPE', claimItemId: 'p1' });
    });
  });

  describe('status filtreleme', () => {
    it('CANCELLED/WAIVED hariç tutulur', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
        item({ id: 'p2', itemType: 'PRINCIPAL', status: 'CANCELLED', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
        item({ id: 'p3', itemType: 'PRINCIPAL', status: 'WAIVED', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets.map((b) => b.id)).toEqual(['p1']);
    });
  });
});
