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

  describe('Kademe 1.5 mixed-source (ALC-P0-3B3, owner-locked 2026-07-04)', () => {
    it('item kendi başlangıç tarihini taşıyor + item.interestType YOK + case.interestType VAR (2026/9502 senaryosu) → bucket üretilir, case türü + item tarihi kullanılır', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 200000, interestStartDate: '2026-06-24' })],
        { interestType: 'AVANS' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ startDate: '2026-06-24' });
      expect(res.diagnostics).toHaveLength(0);
    });

    it('item hem kendi tarihini hem case kendi tarihini taşıyor → item tarihi öncelikli (case tarihi sessizce üzerine yazmaz)', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestStartDate: '2026-06-24' })],
        { interestType: 'YASAL', interestStartDate: '2025-01-01' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.LEGAL_3095, startDate: '2026-06-24' });
    });

    it('item kendi TAM konfigini taşıyorsa (kademe 1) mixed-source devreye girmez — item türü case türünü ezmez', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestType: 'YASAL', interestStartDate: '2026-06-24' })],
        { interestType: 'AVANS', interestStartDate: '2025-01-01' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.LEGAL_3095, startDate: '2026-06-24' });
    });

    it('mixed-source + fixed tür + item.interestRate mevcut → fixedRate item oranından set edilir', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestStartDate: '2026-06-24', interestRate: 48 })],
        { interestType: 'SABIT' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ fixedRate: 0.48, startDate: '2026-06-24' });
    });

    it('mixed-source + fixed tür + item.interestRate YOK → FIXED_RATE_REQUIRED (rate hâlâ hiçbir yerden gelmiyor)', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestStartDate: '2026-06-24' })],
        { interestType: 'SABIT' },
      );
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics[0]).toMatchObject({ code: 'FIXED_RATE_REQUIRED', claimItemId: 'p1' });
    });

    it('item.interestStartDate YOK, yalnız case.interestType var → mixed-source tetiklenmez, kademe 3 (case tam fallback) çalışmaya devam eder', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
        { interestType: 'YASAL', interestStartDate: '2025-03-01' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ startDate: '2025-03-01' });
    });

    it('item.interestStartDate var ama case.interestType YOK (2026/9604 ve 9605 senaryosu) → mixed-source tetiklenmez, MISSING_INTEREST_CONFIG ile biter', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
      );
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

  describe('PR-A3 rich-first ClaimItem read authority', () => {
    const allRichCodes = Object.values(InterestTypeCode);
    const richOnlyHighRiskCodes = [
      InterestTypeCode.TTK_1530,
      InterestTypeCode.CONTRACTUAL,
      InterestTypeCode.MEVDUAT_TL_BANKALARCA,
      InterestTypeCode.MEVDUAT_USD_BANKALARCA,
      InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
      InterestTypeCode.MEVDUAT_TL_KAMU,
      InterestTypeCode.MEVDUAT_USD_KAMU,
      InterestTypeCode.MEVDUAT_EUR_KAMU,
    ];

    it.each(allRichCodes)('%s doğrudan canonical bucket authority olur', (interestTypeCode) => {
      const fixed = interestTypeCode === InterestTypeCode.COMMERCIAL_FIXED || interestTypeCode === InterestTypeCode.CONTRACTUAL;
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestTypeCode,
          interestRate: fixed ? 18.5 : 999,
          interestStartDate: '2025-01-01',
        }),
      ], { interestType: 'YASAL', interestStartDate: '2024-01-01' });

      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0].interestType).toBe(interestTypeCode);
      expect(res.buckets[0].startDate).toBe('2025-01-01');
      expect(res.buckets[0].fixedRate).toBe(fixed ? 0.185 : undefined);
    });

    it.each(richOnlyHighRiskCodes)('%s legacy null iken Case.YASAL tarafından overwrite edilmez', (interestTypeCode) => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestTypeCode, interestType: null,
          interestRate: interestTypeCode === InterestTypeCode.CONTRACTUAL ? 24 : null,
          interestStartDate: '2025-01-01',
        }),
      ], { interestType: 'YASAL', interestStartDate: '2024-01-01' });

      expect(res.buckets[0].interestType).toBe(interestTypeCode);
      expect(res.buckets[0].interestType).not.toBe(InterestTypeCode.LEGAL_3095);
    });

    it('rich/legacy mirror uyumsuzluğunda rich wins ve diagnostic üretilir', () => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestTypeCode: InterestTypeCode.CONTRACTUAL,
          interestType: 'YASAL', interestRate: 30, interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.CONTRACTUAL, fixedRate: 0.3 });
      expect(res.diagnostics).toContainEqual(expect.objectContaining({
        code: 'INTEREST_TYPE_MIRROR_DRIFT', claimItemId: 'p1',
        detail: expect.stringContaining('rich=CONTRACTUAL;legacy=YASAL'),
      }));
    });

    it.each([
      [InterestTypeCode.LEGAL_3095, 'YASAL'],
      [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 'TICARI'],
      [InterestTypeCode.COMMERCIAL_FIXED, 'SABIT'],
    ] as const)('%s + %s uyumlu mirror rich authority olarak kalır', (interestTypeCode, interestType) => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestTypeCode, interestType,
          interestRate: interestTypeCode === InterestTypeCode.COMMERCIAL_FIXED ? 22 : null,
          interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets[0].interestType).toBe(interestTypeCode);
      expect(res.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'INTEREST_TYPE_MIRROR_DRIFT' }));
    });

    it.each([
      ['YASAL', InterestTypeCode.LEGAL_3095, null],
      ['TICARI', InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, null],
      ['SABIT', InterestTypeCode.COMMERCIAL_FIXED, 0.48],
    ] as const)('legacy-only %s strict compatibility ile %s olur', (legacy, code, fixedRate) => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestType: legacy,
          interestRate: legacy === 'SABIT' ? 48 : null, interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets[0]).toMatchObject({ interestType: code });
      expect(res.buckets[0].fixedRate ?? null).toBe(fixedRate);
    });

    it.each(['YOKSUN', 'AVANS', 'TEMERRUT', 'OZEL', 'UNKNOWN'])('%s legacy-only iken Case fallback yapmadan fail-closed olur', (legacy) => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: legacy, interestStartDate: '2025-01-01' }),
      ], { interestType: 'YASAL', interestStartDate: '2024-01-01' });
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toContainEqual(expect.objectContaining({
        code: 'UNSUPPORTED_INTEREST_TYPE', claimItemId: 'p1', detail: legacy,
      }));
    });

    it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('fixed rich code rate=%s için fail-closed olur', (interestRate) => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestTypeCode: InterestTypeCode.CONTRACTUAL,
          interestRate, interestStartDate: '2025-01-01',
        }),
      ], { interestType: 'YASAL', interestStartDate: '2024-01-01' });
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'FIXED_RATE_REQUIRED', claimItemId: 'p1' }));
    });

    it.each([
      [{ interestTypeCode: InterestTypeCode.LEGAL_3095 }, 'interestTypeCode'],
      [{ interestType: 'YASAL' }, 'interestType'],
      [{ interestTypeCode: InterestTypeCode.LEGAL_3095, interestType: 'YASAL' }, 'interestTypeCode,interestType'],
    ] as const)('NO_INTEREST %j alanını bastırır ve %s diagnostic detayı üretir', (authority, fields) => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST',
          ...authority,
          interestStartDate: '2025-01-01',
        }),
      ], { interestType: 'YASAL', interestStartDate: '2024-01-01' });
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toContainEqual(expect.objectContaining({
        code: 'NO_INTEREST_AUTHORITY_CONFLICT', claimItemId: 'p1', detail: `fields=${fields}`,
      }));
    });

    it('NO_INTEREST INTEREST-config principal fallback kaynağı olamaz', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL' }),
        item({
          id: 'i1', itemType: 'INTEREST', interestAccrualStatus: 'NO_INTEREST',
          interestTypeCode: InterestTypeCode.LEGAL_3095, interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'NO_INTEREST_AUTHORITY_CONFLICT', claimItemId: 'i1' }),
        expect.objectContaining({ code: 'MISSING_INTEREST_CONFIG', claimItemId: 'p1' }),
      ]));
    });

    it('aynı semantik rich/legacy INTEREST config canonical key ile tekilleşir', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestStartDate: null }),
        item({
          id: 'i-rich', itemType: 'INTEREST', interestTypeCode: InterestTypeCode.LEGAL_3095,
          interestStartDate: '2025-01-01',
        }),
        item({
          id: 'i-legacy', itemType: 'INTEREST', interestType: 'YASAL',
          interestStartDate: '2025-01-01',
        }),
      ]);
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.LEGAL_3095 });
      expect(res.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_INTEREST_CONFIG' }));
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

  describe('TBK100 Interest Accrual Contract v1 — interestAccrualStatus', () => {
    it('NO_INTEREST PRINCIPAL → bucket üretilmez, diagnostic YOK (bilinçli faizsiz, hata değil)', () => {
      const res = assembleClaimBuckets([
        item({
          id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST',
          // interestType/interestStartDate boş olsa BİLE case-level fallback'e düşmemeli.
        }),
      ], { interestType: 'YASAL', interestStartDate: '2025-01-01' });
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toHaveLength(0);
    });

    it('UNKNOWN (veya alan hiç yoksa) mevcut davranış AYNEN devam eder — regresyon yok', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'UNKNOWN', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      ]);
      expect(res.buckets).toHaveLength(1);
      expect(res.diagnostics).toHaveLength(0);
    });

    it('COST kalemi ACCRUES işaretli ama motor desteği yok → ACCRUAL_ENGINE_UNSUPPORTED, kalem yine costs projeksiyonuna eklenir (davranış değişmez)', () => {
      const res = assembleClaimBuckets([
        item({ id: 'e1', itemType: 'EXPENSE', amount: 500, interestAccrualStatus: 'ACCRUES' }),
      ]);
      expect(res.diagnostics).toEqual([{ code: 'ACCRUAL_ENGINE_UNSUPPORTED', claimItemId: 'e1', detail: 'EXPENSE' }]);
      expect(res.costs[AncillaryType.TEBLIGAT_MASRAFI]).toBe(500);
    });

    it('ANCILLARY (ATTORNEY_FEE) NO_INTEREST işaretli → diagnostic YOK, mevcut davranış (sabit tutar) değişmez', () => {
      const res = assembleClaimBuckets([
        item({ id: 'a1', itemType: 'ATTORNEY_FEE', amount: 300, interestAccrualStatus: 'NO_INTEREST' }),
      ]);
      expect(res.diagnostics).toHaveLength(0);
      expect(res.ancillaries[AncillaryType.VEKALET_UCRETI]).toBe(300);
    });

    it('provenance=ENFORCEMENT_PROCEEDING_DATE + Case.caseDate mevcut → mekanik çözülür, bucket üretilir', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' })],
        { enforcementProceedingDate: '2025-03-15' },
      );
      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0].startDate).toBe('2025-03-15');
      expect(res.diagnostics).toHaveLength(0);
    });

    it('provenance=ENFORCEMENT_PROCEEDING_DATE ama Case.caseDate de yok → MISSING_START_DATE_SOURCE_VALUE (genel MISSING_START_DATE DEĞİL)', () => {
      const res = assembleClaimBuckets(
        [item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' })],
        {},
      );
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual([
        { code: 'MISSING_START_DATE_SOURCE_VALUE', claimItemId: 'p1', detail: 'ENFORCEMENT_PROCEEDING_DATE' },
      ]);
    });

    it('sessiz dueDate/issueDate fallback KESİNLİKLE yok — provenance farklı olsa da interestStartDate hâlâ çözülmezse MISSING_START_DATE', () => {
      const res = assembleClaimBuckets([
        item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDateProvenance: 'DOCUMENT_DUE_DATE' }),
      ]);
      expect(res.buckets).toHaveLength(0);
      expect(res.diagnostics).toEqual([{ code: 'MISSING_START_DATE', claimItemId: 'p1' }]);
    });
  });
});
