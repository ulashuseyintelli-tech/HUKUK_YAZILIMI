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

/**
 * K3-L TK-9: geçerli açık faizsizlik beyanı PR-A0 A2 gereği aktör/gerekçe/zaman denetimini taşır. Açık NO_INTEREST
 * yolunu (NON_ACCRUING) sınayan kurgular bu alanları taşır; eksik denetim ayrı testte (TK-9 bloğu).
 */
const NO_INTEREST_AUDIT = {
  noInterestReason: 'Sözleşmede faiz kararlaştırılmadı',
  noInterestConfirmedById: 'user-1',
  noInterestConfirmedAt: '2026-07-10T09:00:00.000Z',
} as const;

describe('K3-L D2-b1: kovası üretilmeyen principal principalCarry ile taşınır (sessiz düşme yok)', () => {
  it('açık NO_INTEREST → NON_ACCRUING; faiz türü alanı taşınmaz; kova ve tanılar DEĞİŞMEZ', () => {
    const res = assembleClaimBuckets([
      item({
        id: 'p1', itemType: 'PRINCIPAL', amount: 5000, demandedAmount: 4000, interestAccrualStatus: 'NO_INTEREST',
        ...NO_INTEREST_AUDIT,
      }),
    ]);
    expect(res.buckets).toEqual([]);
    expect(res.diagnostics).toEqual([]);
    expect(res.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 4000, currency: 'TRY', kind: 'NON_ACCRUING', reasonCode: 'NO_INTEREST_DECLARED' },
    ]);
    expect(JSON.stringify(res.principalCarry)).not.toContain('interestType');
  });

  it.each([
    ['MISSING_INTEREST_CONFIG', item({ id: 'p1', itemType: 'PRINCIPAL' }), undefined],
    ['MISSING_START_DATE', item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL' }), undefined],
    ['FIXED_RATE_REQUIRED', item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'SABIT', interestStartDate: '2025-01-01' }), undefined],
    ['UNSUPPORTED_INTEREST_TYPE', item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'UYDURMA_TUR', interestStartDate: '2025-01-01' }), undefined],
    [
      'MISSING_START_DATE_SOURCE_VALUE',
      item({ id: 'p1', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' }),
      undefined,
    ],
    [
      'NO_INTEREST_AUTHORITY_CONFLICT',
      item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      undefined,
    ],
  ])('çözülemeyen faiz (%s) → UNRESOLVED, neden = terminal tanı', (code, principalItem, caseInterest) => {
    const res = assembleClaimBuckets([principalItem], caseInterest);
    expect(res.buckets).toEqual([]);
    expect(res.diagnostics.map((d) => d.code)).toContain(code);
    expect(res.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 1000, currency: 'TRY', kind: 'UNRESOLVED', reasonCode: code },
    ]);
  });

  it('belirsiz faiz ayarı (çok anapara + tek faiz kalemi) → her iki anapara UNRESOLVED/AMBIGUOUS', () => {
    const res = assembleClaimBuckets([
      item({ id: 'p1', itemType: 'PRINCIPAL' }),
      item({ id: 'p2', itemType: 'PRINCIPAL' }),
      item({ id: 'i1', itemType: 'INTEREST', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
    ]);
    expect(res.principalCarry.map((c) => [c.claimItemId, c.kind, c.reasonCode])).toEqual([
      ['p1', 'UNRESOLVED', 'AMBIGUOUS_INTEREST_CONFIG'],
      ['p2', 'UNRESOLVED', 'AMBIGUOUS_INTEREST_CONFIG'],
    ]);
  });

  it('kovası üretilen, iptal/feragat edilen, sıfır tutarlı ya da anapara dışı kalem taşınmaz', () => {
    const res = assembleClaimBuckets([
      item({ id: 'ok', itemType: 'PRINCIPAL', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
      item({ id: 'w', itemType: 'PRINCIPAL', status: 'WAIVED', interestAccrualStatus: 'NO_INTEREST' }),
      item({ id: 'c', itemType: 'PRINCIPAL', status: 'CANCELLED', interestAccrualStatus: 'NO_INTEREST' }),
      item({ id: 'z', itemType: 'PRINCIPAL', amount: 0, interestAccrualStatus: 'NO_INTEREST' }),
      item({ id: 'f', itemType: 'FEE', interestAccrualStatus: 'NO_INTEREST' }),
    ]);
    expect(res.buckets.map((b) => b.id)).toEqual(['ok']);
    expect(res.principalCarry).toEqual([]);
  });

  it('ayna uyarısı (INTEREST_TYPE_MIRROR_DRIFT) terminal değildir: kova üretilir, taşınmaz', () => {
    const res = assembleClaimBuckets([
      item({
        id: 'p1', itemType: 'PRINCIPAL', interestTypeCode: InterestTypeCode.LEGAL_3095, interestType: 'TICARI',
        interestStartDate: '2025-01-01',
      }),
    ]);
    expect(res.buckets).toHaveLength(1);
    expect(res.principalCarry).toEqual([]);
  });
});

describe('K3-L TK-9: denetimi eksik ya da çelişkili faizsizlik beyanı bilinen sıfır sayılmaz (PR-A0 A2, PR-A5)', () => {
  it.each([
    [{ noInterestConfirmedById: 'user-1', noInterestConfirmedAt: '2026-07-10T09:00:00.000Z' }, 'noInterestReason'],
    [{ noInterestReason: 'Faizsiz', noInterestConfirmedAt: '2026-07-10T09:00:00.000Z' }, 'noInterestConfirmedById'],
    [{ noInterestReason: 'Faizsiz', noInterestConfirmedById: 'user-1' }, 'noInterestConfirmedAt'],
    [{}, 'noInterestReason,noInterestConfirmedById,noInterestConfirmedAt'],
    [{ noInterestReason: '   ', noInterestConfirmedById: 'user-1', noInterestConfirmedAt: '2026-07-10T09:00:00.000Z' }, 'noInterestReason'],
  ])('denetim eksik (%j) → UNRESOLVED / NO_INTEREST_AUDIT_INCOMPLETE (missing=%s); dosya yedeğine de düşmez', (audit, missing) => {
    const res = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST', ...audit })],
      { interestType: 'YASAL', interestStartDate: '2025-01-01' },
    );
    expect(res.buckets).toEqual([]);
    expect(res.diagnostics).toEqual([
      { code: 'NO_INTEREST_AUDIT_INCOMPLETE', claimItemId: 'p1', detail: `missing=${missing}` },
    ]);
    expect(res.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 1000, currency: 'TRY', kind: 'UNRESOLVED', reasonCode: 'NO_INTEREST_AUDIT_INCOMPLETE' },
    ]);
  });

  it.each([
    [{ interestRate: 36.5 }, 'interestRate'],
    [{ interestRate: 0 }, 'interestRate'],
    [{ interestStartDate: '2025-01-01' }, 'interestStartDate'],
    [{ interestStartDateProvenance: 'DOCUMENT_DUE_DATE' }, 'interestStartDateProvenance'],
  ])('yazma sözleşmesine aykırı alan (%j) → UNRESOLVED / NO_INTEREST_AUTHORITY_CONFLICT (fields=%s)', (extra, fields) => {
    const res = assembleClaimBuckets([
      item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST', ...NO_INTEREST_AUDIT, ...extra }),
    ]);
    expect(res.buckets).toEqual([]);
    expect(res.diagnostics).toEqual([
      { code: 'NO_INTEREST_AUTHORITY_CONFLICT', claimItemId: 'p1', detail: `fields=${fields}` },
    ]);
    expect(res.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 1000, currency: 'TRY', kind: 'UNRESOLVED', reasonCode: 'NO_INTEREST_AUTHORITY_CONFLICT' },
    ]);
  });

  it('çelişki ve eksik denetim birlikte → neden çelişki (önce); iki tanı da raporlanır', () => {
    const res = assembleClaimBuckets([
      item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'NO_INTEREST', interestType: 'YASAL' }),
    ]);
    expect(res.diagnostics.map((d) => d.code)).toEqual(['NO_INTEREST_AUTHORITY_CONFLICT', 'NO_INTEREST_AUDIT_INCOMPLETE']);
    expect(res.principalCarry[0]).toMatchObject({ kind: 'UNRESOLVED', reasonCode: 'NO_INTEREST_AUTHORITY_CONFLICT' });
  });
});

describe('K3-L TK-10: politika bekletmeli oluşum kalemi kendi faiz otoritesi olmadan faiz almaz, faizsiz de sayılmaz (23.7.8)', () => {
  const caseYasal = { interestType: 'YASAL', interestStartDate: '2025-01-01' };

  it('kademe 3 (dosya YASAL + dosya faiz başlangıcı) bekletmeli kaleme BAĞLANMAZ → UNRESOLVED / INTEREST_POLICY_HOLD', () => {
    const held = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'UNKNOWN', interestPolicyHold: true })],
      caseYasal,
    );
    expect(held.buckets).toEqual([]);
    expect(held.diagnostics).toEqual([
      { code: 'INTEREST_POLICY_HOLD', claimItemId: 'p1', detail: 'admissionResult=ALLOWED_WITH_POLICY_HOLD' },
    ]);
    expect(held.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 1000, currency: 'TRY', kind: 'UNRESOLVED', reasonCode: 'INTEREST_POLICY_HOLD' },
    ]);

    // Bekletmesiz aynı kalem bugünkü gibi dosya düzeyi faizle kova alır (davranış yalnız bekletmede değişir)
    const free = assembleClaimBuckets([item({ id: 'p1', itemType: 'PRINCIPAL', interestAccrualStatus: 'UNKNOWN' })], caseYasal);
    expect(free.buckets.map((b) => [b.id, b.interestType])).toEqual([['p1', InterestTypeCode.LEGAL_3095]]);
  });

  it('kademe 2 (tek faiz ayar kalemi) ve kademe 1.5 (kalem tarihi + dosya türü) da bağlanmaz', () => {
    const tier2 = assembleClaimBuckets([
      item({ id: 'p1', itemType: 'PRINCIPAL', interestPolicyHold: true }),
      item({ id: 'i1', itemType: 'INTEREST', interestType: 'YASAL', interestStartDate: '2025-01-01' }),
    ]);
    expect(tier2.buckets).toEqual([]);
    expect(tier2.principalCarry).toEqual([expect.objectContaining({ claimItemId: 'p1', reasonCode: 'INTEREST_POLICY_HOLD' })]);

    const tier15 = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', interestPolicyHold: true, interestStartDate: '2025-03-01' })],
      caseYasal,
    );
    expect(tier15.buckets).toEqual([]);
    expect(tier15.principalCarry).toEqual([expect.objectContaining({ claimItemId: 'p1', reasonCode: 'INTEREST_POLICY_HOLD' })]);
  });

  it('ayrı onaylı güncellemeyle kalemin KENDİ faiz ayarı geldiyse bekletme engel değildir → kova', () => {
    const res = assembleClaimBuckets([
      item({
        id: 'p1', itemType: 'PRINCIPAL', interestPolicyHold: true, interestAccrualStatus: 'ACCRUES',
        interestTypeCode: InterestTypeCode.LEGAL_3095, interestStartDate: '2025-02-01',
      }),
    ], caseYasal);
    expect(res.buckets.map((b) => [b.id, b.startDate])).toEqual([['p1', '2025-02-01']]);
    expect(res.principalCarry).toEqual([]);
  });

  it('ayrı onaylı güncellemeyle denetimi tam açık faizsizlik geldiyse → NON_ACCRUING', () => {
    const res = assembleClaimBuckets([
      item({ id: 'p1', itemType: 'PRINCIPAL', interestPolicyHold: true, interestAccrualStatus: 'NO_INTEREST', ...NO_INTEREST_AUDIT }),
    ], caseYasal);
    expect(res.principalCarry).toEqual([
      { claimItemId: 'p1', amount: 1000, currency: 'TRY', kind: 'NON_ACCRUING', reasonCode: 'NO_INTEREST_DECLARED' },
    ]);
  });
});

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
        item({ id: 'c2', itemType: 'EXPENSE', amount: 50, currency: 'USD' }),
        item({ id: 'a1', itemType: 'ATTORNEY_FEE', amount: 300 }),
        item({ id: 'a2', itemType: 'PENALTY', amount: 70 }),
      ]);
      expect(res.costs).toEqual({ [AncillaryType.HARC]: 100, [AncillaryType.TEBLIGAT_MASRAFI]: 50 });
      expect(res.ancillaries).toEqual({ [AncillaryType.VEKALET_UCRETI]: 300, [AncillaryType.DIGER]: 70 });
      expect(res.projectionItems).toEqual([
        expect.objectContaining({ sourceItemId: 'c1', category: 'COST', code: AncillaryType.HARC, amount: 100, currency: 'TRY', sourceStatus: 'AVAILABLE' }),
        expect.objectContaining({ sourceItemId: 'c2', category: 'COST', code: AncillaryType.TEBLIGAT_MASRAFI, amount: 50, currency: 'USD', sourceStatus: 'AVAILABLE' }),
        expect.objectContaining({ sourceItemId: 'a1', category: 'ANCILLARY', code: AncillaryType.VEKALET_UCRETI, amount: 300, currency: 'TRY', sourceStatus: 'AVAILABLE' }),
        expect.objectContaining({ sourceItemId: 'a2', category: 'ANCILLARY', code: AncillaryType.DIGER, amount: 70, currency: 'TRY', sourceStatus: 'AVAILABLE' }),
      ]);
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

    it('geçersiz projection tutarını sıfır üretmeden source evidence olarak korur', () => {
      const res = assembleClaimBuckets([
        item({ id: 'fee-zero', itemType: 'FEE', amount: 0, demandedAmount: 0 }),
      ]);
      expect(res.costs).toEqual({});
      expect(res.projectionItems).toEqual([
        expect.objectContaining({
          sourceItemId: 'fee-zero',
          amount: 0,
          sourceStatus: 'INVALID_AMOUNT',
        }),
      ]);
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

    // K3-L TK-9: çelişki tanımı yazma sözleşmesiyle (validateInterestAccrualState) hizalı — başlangıç tarihi de çelişki alanı
    it.each([
      [{ interestTypeCode: InterestTypeCode.LEGAL_3095 }, 'interestTypeCode,interestStartDate'],
      [{ interestType: 'YASAL' }, 'interestType,interestStartDate'],
      [
        { interestTypeCode: InterestTypeCode.LEGAL_3095, interestType: 'YASAL' },
        'interestTypeCode,interestType,interestStartDate',
      ],
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
          // K3-L TK-9: "bilinçli" = PR-A0 A2 denetimi tam (eksik denetim ayrı testte)
          ...NO_INTEREST_AUDIT,
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

describe('K3-L KP-2: dosya düzeyi YASAL faiz türünün kaynağı doğrulanamıyorsa uyarı (engel değil)', () => {
  const only = (res: ReturnType<typeof assembleClaimBuckets>) =>
    res.diagnostics.filter((d) => d.code === 'CASE_INTEREST_TYPE_UNCONFIRMED');

  it('kademe 3 (dosya türü + dosya tarihi), kaynak bilinmiyor → kova ÜRETİLİR + uyarı', () => {
    const res = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
      { interestType: 'YASAL', interestStartDate: '2025-03-01' },
    );
    expect(res.buckets).toHaveLength(1);
    expect(res.buckets[0]).toMatchObject({ interestType: InterestTypeCode.LEGAL_3095, startDate: '2025-03-01' });
    expect(res.principalCarry).toEqual([]);
    expect(only(res)).toEqual([
      { code: 'CASE_INTEREST_TYPE_UNCONFIRMED', claimItemId: 'p1', detail: 'caseInterestType=YASAL;source=UNKNOWN' },
    ]);
  });

  it('kaynak SYSTEM_DEFAULT → uyarı; REQUEST_EXPLICIT → uyarı yok (aynı kova)', () => {
    const items = [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })];
    const dflt = assembleClaimBuckets(items, { interestType: 'YASAL', interestStartDate: '2025-03-01', interestTypeSource: 'SYSTEM_DEFAULT' });
    const explicit = assembleClaimBuckets(items, { interestType: 'YASAL', interestStartDate: '2025-03-01', interestTypeSource: 'REQUEST_EXPLICIT' });

    expect(only(dflt)).toEqual([
      { code: 'CASE_INTEREST_TYPE_UNCONFIRMED', claimItemId: 'p1', detail: 'caseInterestType=YASAL;source=SYSTEM_DEFAULT' },
    ]);
    expect(only(explicit)).toEqual([]);
    expect(explicit.buckets).toEqual(dflt.buckets);
  });

  it('kademe 1.5 (kalem tarihi + dosya türü) de dosya türüne dayanır → uyarı', () => {
    const res = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestStartDate: '2025-06-01' })],
      { interestType: 'YASAL' },
    );
    expect(res.buckets).toHaveLength(1);
    expect(only(res)).toHaveLength(1);
  });

  it('kalemin kendi faiz ayarı varsa ya da dosya türü YASAL değilse uyarı yok', () => {
    const own = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000, interestType: 'YASAL', interestStartDate: '2025-01-01' })],
      { interestType: 'YASAL', interestStartDate: '2025-03-01' },
    );
    const avans = assembleClaimBuckets(
      [item({ id: 'p1', itemType: 'PRINCIPAL', amount: 1000 })],
      { interestType: 'AVANS', interestStartDate: '2025-03-01' },
    );
    expect(only(own)).toEqual([]);
    expect(only(avans)).toEqual([]);
  });
});
