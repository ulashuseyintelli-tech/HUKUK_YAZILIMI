import {
  EMPTY_ATTRIBUTION,
  buildCapacityViewItems,
  capacityForDebtor,
  computeShares,
  evaluateItemLiability,
  fromKurus,
  legacyProjection,
  normalizeSelectionDraft,
  parsePercentToBasisPoints,
  resolveAttributedCaseDebtorId,
  resolveLiabilityAllocationScope,
  summarizeAttribution,
  toKurus,
  type ItemAttribution,
  type LiabilityItemFacts,
  type LiabilityPartyView,
  type SelectionCaseDebtor,
} from '../claim-liability.domain';
import { buildDebtorLedgerBalances } from '../../case/debtor-ledger-balance';

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — saf alan modülü (karar günlüğü 2026-11-15).
 * Tutarlar SENTETİKTİR (tasarım örnekleri); gerçek dosya değeri yoktur.
 */
const party = (debtorId: string, extra: Partial<LiabilityPartyView> = {}, sortOrder = 0): LiabilityPartyView => ({
  caseDebtorId: `cd-${debtorId}`,
  debtorId,
  shareWeight: null,
  limitKurus: null,
  unlimited: false,
  sortOrder,
  ...extra,
});

const attribution = (byDebtor: Record<string, number>, unattributed = 0): ItemAttribution => {
  const map = new Map(Object.entries(byDebtor).map(([debtorId, amount]) => [debtorId, toKurus(amount)]));
  const total = [...map.values()].reduce((sum, value) => sum + value, 0n) + toKurus(unattributed);
  return { byDebtor: map, unattributedKurus: toKurus(unattributed), totalKurus: total };
};

const facts = (overrides: Partial<LiabilityItemFacts> & { demanded: number; collected?: number }): LiabilityItemFacts => ({
  claimItemId: 'K1',
  demandedKurus: toKurus(overrides.demanded),
  collectedKurus: toKurus(overrides.collected ?? 0),
  isAllDebtorsLiable: true,
  liableDebtorIds: [],
  activeSet: null,
  attribution: EMPTY_ATTRIBUTION,
  ...overrides,
});

const ACTIVE = new Set(['B1', 'B2']);
const money = (kurus: bigint | null) => (kurus === null ? null : fromKurus(kurus));

describe('claim-liability — pay yuvarlama (AT-1)', () => {
  it('10.000,01 üç eşit paya 3.333,34 / 3.333,34 / 3.333,33 bölünür', () => {
    expect(computeShares(toKurus('10000.01'), [1, 1, 1]).map(fromKurus)).toEqual([3333.34, 3333.34, 3333.33]);
  });

  it('%60 / %40: 9.000,00 → 5.400,00 / 3.600,00', () => {
    expect(computeShares(toKurus(9000), [6000, 4000]).map(fromKurus)).toEqual([5400, 3600]);
  });

  it('artan kuruş en büyük kalana, eşitlikte borçlu sırasına verilir', () => {
    // 0,05 → 2:1:1 ağırlık: 0,025 / 0,0125 / 0,0125 → aşağı 2 / 1 / 1 kuruş, artan 1 kuruş en büyük kalana (ilk).
    expect(computeShares(5n, [2, 1, 1])).toEqual([3n, 1n, 1n]);
    // 0,01 → üç eşit: kalanlar eşit → sıra: ilk borçlu.
    expect(computeShares(1n, [1, 1, 1])).toEqual([1n, 0n, 0n]);
  });

  it('özellik: rastgele tutar ve ağırlıklarda payların toplamı tutara kuruşu kuruşuna eşittir', () => {
    let seed = 20261115;
    const next = (bound: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % bound;
    };
    for (let round = 0; round < 500; round += 1) {
      const total = BigInt(next(2_000_000_000)) * BigInt(1 + next(5000));
      const weights = Array.from({ length: 2 + next(31) }, () => 1 + next(1_000_000));
      const shares = computeShares(total, weights);
      expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(total);
      expect(shares.every((share) => share >= 0n)).toBe(true);
    }
  });

  it('geçersiz ağırlık reddedilir', () => {
    expect(() => computeShares(100n, [0, 1])).toThrow(RangeError);
    expect(() => computeShares(100n, [1.5, 1])).toThrow(RangeError);
    expect(() => computeShares(100n, [1_000_001])).toThrow(RangeError);
  });

  it('yüzde metni baz puana çevrilir; biçimsiz girdi null', () => {
    expect(parsePercentToBasisPoints('60')).toBe(6000);
    expect(parsePercentToBasisPoints('33,33')).toBe(3333);
    expect(parsePercentToBasisPoints('33.3')).toBe(3330);
    expect(parsePercentToBasisPoints('100')).toBe(10_000);
    expect(parsePercentToBasisPoints('100.01')).toBeNull();
    expect(parsePercentToBasisPoints('0')).toBeNull();
    expect(parsePercentToBasisPoints('12.345')).toBeNull();
    expect(parsePercentToBasisPoints('abc')).toBeNull();
  });
});

describe('claim-liability — atıf çözümleme (AT-2)', () => {
  it('tahsilat borçlusu; bekletme tamamlamada seçilen borçlu ÖNCELİKLİ; ikisi de yoksa atıfsız', () => {
    expect(resolveAttributedCaseDebtorId({ collectionCaseDebtorId: 'cd-1' })).toBe('cd-1');
    expect(resolveAttributedCaseDebtorId({ releasedOnBehalfCaseDebtorId: 'cd-2', collectionCaseDebtorId: 'cd-1' })).toBe('cd-2');
    expect(resolveAttributedCaseDebtorId({ releasedOnBehalfCaseDebtorId: 'cd-2', collectionCaseDebtorId: null })).toBe('cd-2');
    expect(resolveAttributedCaseDebtorId({})).toBeNull();
  });

  it('iptalin ters kaydı aynı kovada netleşir; her satır tam bir kovaya düşer', () => {
    const summary = summarizeAttribution([
      { claimItemId: 'K1', debtorId: 'B1', amountKurus: toKurus(5400) },
      { claimItemId: 'K1', debtorId: 'B2', amountKurus: toKurus(1000) },
      { claimItemId: 'K1', debtorId: 'B1', amountKurus: toKurus(-5400) }, // iptal ters kaydı
      { claimItemId: 'K1', debtorId: null, amountKurus: toKurus(250) },
      { claimItemId: 'K2', debtorId: null, amountKurus: toKurus(70) },
    ]);
    const k1 = summary.get('K1')!;
    expect(money(k1.byDebtor.get('B1')!)).toBe(0);
    expect(money(k1.byDebtor.get('B2')!)).toBe(1000);
    expect(money(k1.unattributedKurus)).toBe(250);
    // Uzlaştırma eşitliği yapısaldır: toplam = Σ borçlu + atıfsız
    expect(k1.totalKurus).toBe([...k1.byDebtor.values()].reduce((sum, value) => sum + value, 0n) + k1.unattributedKurus);
    expect(money(summary.get('K2')!.unattributedKurus)).toBe(70);
  });
});

describe('claim-liability — tür değerlendirmesi ve kapasite (tasarım örnekleri)', () => {
  const proportional = { setId: 's1', version: 1, mode: 'PROPORTIONAL' as const, parties: [party('B1', { shareWeight: 6000 }, 0), party('B2', { shareWeight: 4000 }, 1)] };

  it('seçim yoksa kalem BELİRLENMEDİ: kesin borçlu rakamı üretilmez, kapasite ortak kalandır, borçlu gerekmez', () => {
    const evaluation = evaluateItemLiability(facts({ demanded: 9000, collected: 1000, attribution: attribution({}, 1000) }), ACTIVE);
    expect(evaluation).toMatchObject({ kind: 'UNDETERMINED', reconciled: true, requiresOnBehalfDebtor: false, parties: [] });
    expect(money(capacityForDebtor(evaluation, null))).toBe(8000);
    expect(money(capacityForDebtor(evaluation, 'B1'))).toBe(8000);
  });

  it('bilinçli "belirlenmedi" seçim kaydı hesap açısından seçim yokluğuyla aynıdır', () => {
    const evaluation = evaluateItemLiability(
      facts({ demanded: 9000, activeSet: { setId: 's9', version: 3, mode: 'UNDETERMINED', parties: [] } }),
      ACTIVE,
    );
    expect(evaluation).toMatchObject({ kind: 'UNDETERMINED', setVersion: 3, requiresOnBehalfDebtor: false });
  });

  it('Örnek 1 — paylı: kalanlar paydan düşer, toplamı ortak kalana eşittir; pay tükenince kapasite sıfırdır', () => {
    // B2 hesabına 1.000,00
    let evaluation = evaluateItemLiability(facts({ demanded: 9000, collected: 1000, activeSet: proportional, attribution: attribution({ B2: 1000 }) }), ACTIVE);
    expect(evaluation.reconciled).toBe(true);
    expect(evaluation.parties.map((p) => money(p.remainingLiabilityKurus))).toEqual([5400, 2600]);
    expect(evaluation.parties.reduce((sum, p) => sum + (p.remainingLiabilityKurus ?? 0n), 0n)).toBe(evaluation.remainingKurus);
    expect(money(capacityForDebtor(evaluation, 'B1'))).toBe(5400); // 6.000,00 ödese 600,00 aşan olur
    // B1 hesabına 5.400,00 mahsup edildikten sonra
    evaluation = evaluateItemLiability(facts({ demanded: 9000, collected: 6400, activeSet: proportional, attribution: attribution({ B1: 5400, B2: 1000 }) }), ACTIVE);
    expect(evaluation.parties.map((p) => money(p.remainingLiabilityKurus))).toEqual([0, 2600]);
    expect(money(capacityForDebtor(evaluation, 'B1'))).toBe(0);
    expect(money(capacityForDebtor(evaluation, 'B2'))).toBe(2600);
    // Seçimde olmayan borçlu ya da borçlusuz ödeme bu kaleme düşemez
    expect(money(capacityForDebtor(evaluation, 'B3'))).toBe(0);
    expect(money(capacityForDebtor(evaluation, null))).toBe(0);
  });

  it('Örnek 2 — müteselsil: her borçlu ortak kalandan sorumludur; rakamlar toplanmaz', () => {
    const joint = { setId: 's2', version: 1, mode: 'JOINT_AND_SEVERAL' as const, parties: [party('B1'), party('B2', {}, 1)] };
    const evaluation = evaluateItemLiability(facts({ demanded: 12000, collected: 5000, activeSet: joint, attribution: attribution({ B1: 5000 }) }), ACTIVE);
    expect(evaluation.parties.map((p) => money(p.remainingLiabilityKurus))).toEqual([7000, 7000]);
    expect(money(evaluation.remainingKurus)).toBe(7000); // dosya kalanı; 14.000,00 DEĞİL
    // Liste etkin borçluların tamamını kapsıyor → borçlu belirtmek gerekmez
    expect(evaluation.requiresOnBehalfDebtor).toBe(false);
    expect(money(capacityForDebtor(evaluation, null))).toBe(7000);
  });

  it('müteselsil liste herkesi kapsamıyorsa borçlu gerekir; listede olmayanın kapasitesi sıfırdır', () => {
    const joint = { setId: 's2', version: 1, mode: 'JOINT_AND_SEVERAL' as const, parties: [party('B1')] };
    const evaluation = evaluateItemLiability(facts({ demanded: 12000, activeSet: joint }), ACTIVE);
    expect(evaluation.requiresOnBehalfDebtor).toBe(true);
    expect(money(capacityForDebtor(evaluation, 'B1'))).toBe(12000);
    expect(money(capacityForDebtor(evaluation, 'B2'))).toBe(0);
    expect(money(capacityForDebtor(evaluation, null))).toBe(0);
  });

  it('Örnek 3 — tutarla sınırlı: tavanlar aynı ortak borcun üzerine biner; her kalan ortak kalanı aşamaz', () => {
    const capped = { setId: 's3', version: 1, mode: 'CAPPED' as const, parties: [party('B1', { unlimited: true }), party('B2', { limitKurus: toKurus(8000) }, 1)] };
    let evaluation = evaluateItemLiability(facts({ demanded: 20000, collected: 3000, activeSet: capped, attribution: attribution({ B2: 3000 }) }), ACTIVE);
    expect(evaluation.parties.map((p) => money(p.remainingLiabilityKurus))).toEqual([17000, 5000]);
    evaluation = evaluateItemLiability(facts({ demanded: 20000, collected: 17000, activeSet: capped, attribution: attribution({ B1: 14000, B2: 3000 }) }), ACTIVE);
    expect(evaluation.parties.map((p) => money(p.remainingLiabilityKurus))).toEqual([3000, 3000]);
    expect(money(capacityForDebtor(evaluation, 'B2'))).toBe(3000); // 6.000,00 ödese 3.000,00 mahsup, 3.000,00 aşan
  });

  it('uzlaşmayan paylı kalem: kesin rakam üretilmez, borçluya bağlı mahsup bu kalemde durur', () => {
    const cases: Array<[ItemAttribution, string]> = [
      [attribution({}, 4000), 'UNATTRIBUTED_COLLECTION'],
      [attribution({ B3: 4000 }), 'ATTRIBUTED_TO_NON_PARTY'],
      [attribution({ B1: 5401, B2: 0 }), 'ATTRIBUTION_EXCEEDS_SHARE'],
    ];
    for (const [itemAttribution, code] of cases) {
      const evaluation = evaluateItemLiability(
        facts({ demanded: 9000, collected: fromKurus(itemAttribution.totalKurus), activeSet: proportional, attribution: itemAttribution }),
        ACTIVE,
      );
      expect(evaluation.reconciled).toBe(false);
      expect(evaluation.blockers.map((blocker) => blocker.code)).toContain(code);
      expect(evaluation.parties.every((p) => p.remainingLiabilityKurus === null)).toBe(true);
      expect(capacityForDebtor(evaluation, 'B1')).toBe(0n);
      expect(capacityForDebtor(evaluation, 'B2')).toBe(0n);
    }
  });

  it('kalem sayacı defter atıflarının toplamına eşit değilse paylı kalem uzlaşmaz', () => {
    const evaluation = evaluateItemLiability(facts({ demanded: 9000, collected: 1500, activeSet: proportional, attribution: attribution({ B2: 1000 }) }), ACTIVE);
    expect(evaluation.blockers.map((blocker) => blocker.code)).toContain('COUNTER_LEDGER_MISMATCH');
  });

  it('tavanı aşan atıf tutarla sınırlı kalemi uzlaşmaz kılar', () => {
    const capped = { setId: 's3', version: 1, mode: 'CAPPED' as const, parties: [party('B1', { unlimited: true }), party('B2', { limitKurus: toKurus(8000) }, 1)] };
    const evaluation = evaluateItemLiability(facts({ demanded: 20000, collected: 9000, activeSet: capped, attribution: attribution({ B2: 9000 }) }), ACTIVE);
    expect(evaluation.blockers).toEqual([expect.objectContaining({ code: 'ATTRIBUTION_EXCEEDS_LIMIT', debtorId: 'B2' })]);
  });
});

describe('claim-liability — mahsup kapsamı', () => {
  const p = evaluateItemLiability(
    facts({ claimItemId: 'ANAPARA', demanded: 10000, activeSet: { setId: 's', version: 1, mode: 'PROPORTIONAL', parties: [party('B1', { shareWeight: 1 }), party('B2', { shareWeight: 1 }, 1)] } }),
    ACTIVE,
  );
  const joint = evaluateItemLiability(
    facts({ claimItemId: 'MASRAF', demanded: 1000, activeSet: { setId: 'j', version: 1, mode: 'JOINT_AND_SEVERAL', parties: [party('B1'), party('B2', {}, 1)] } }),
    ACTIVE,
  );
  const open = evaluateItemLiability(facts({ claimItemId: 'FERI', demanded: 2000 }), ACTIVE);

  it('paylı kalem varken borçlusuz ödeme bekletilir (mevcut neden)', () => {
    expect(resolveLiabilityAllocationScope([p, joint, open], null)).toMatchObject({ holdReason: 'ON_BEHALF_DEBTOR_REQUIRED', shareOrCapBound: false });
  });

  it('borçlu verilince kapasiteler türe göre çözülür (AT-11 sayıları): 1.000 + 2.000 + pay 5.000', () => {
    const scope = resolveLiabilityAllocationScope([p, joint, open], 'B1');
    expect(scope.holdReason).toBeNull();
    expect(scope.shareOrCapBound).toBe(true);
    expect(Object.fromEntries([...scope.capacityByItem].map(([id, kurus]) => [id, fromKurus(kurus)]))).toEqual({ ANAPARA: 5000, MASRAF: 1000, FERI: 2000 });
    expect(money(scope.totalCapacityKurus)).toBe(8000);
  });

  it('hiçbir kalemin sorumlusu olmayan borçluda mahsup bekletilir', () => {
    const onlyP = resolveLiabilityAllocationScope([p], 'B3');
    expect(onlyP.holdReason).toBe('ON_BEHALF_DEBTOR_NOT_LIABLE');
  });

  it('kapasite görünümü: kalan = kapasite, kapasitesi sıfır kalem çıkar, kimlik ve tür korunur', () => {
    const view = buildCapacityViewItems(
      [
        { id: 'ANAPARA', itemType: 'PRINCIPAL', demandedAmount: 10000, collectedAmount: 0 },
        { id: 'X', itemType: 'FEE', demandedAmount: 50, collectedAmount: 0 },
      ],
      new Map([['ANAPARA', toKurus(5000)]]),
    );
    expect(view).toEqual([{ id: 'ANAPARA', itemType: 'PRINCIPAL', demandedAmount: 5000, amount: 5000, collectedAmount: 0 }]);
  });
});

describe('claim-liability — izdüşüm (eski kod güvenliği)', () => {
  it('müteselsil → listedeki kişiler; paylı / tutarla sınırlı → BOŞ liste; belirlenmedi → eski varsayılan', () => {
    expect(legacyProjection('JOINT_AND_SEVERAL', ['B1', 'B2', 'B1'])).toEqual({ isAllDebtorsLiable: false, liableDebtorIds: ['B1', 'B2'] });
    expect(legacyProjection('PROPORTIONAL', ['B1', 'B2'])).toEqual({ isAllDebtorsLiable: false, liableDebtorIds: [] });
    expect(legacyProjection('CAPPED', ['B1'])).toEqual({ isAllDebtorsLiable: false, liableDebtorIds: [] });
    expect(legacyProjection('UNDETERMINED', [])).toEqual({ isAllDebtorsLiable: true, liableDebtorIds: [] });
  });
});

describe('claim-liability — reddedilen girdiler (AT-22)', () => {
  const caseDebtors: SelectionCaseDebtor[] = [
    { caseDebtorId: 'cd-1', debtorId: 'B1', active: true },
    { caseDebtorId: 'cd-2', debtorId: 'B2', active: true },
    { caseDebtorId: 'cd-3', debtorId: 'B3', active: false },
    { caseDebtorId: 'cd-1b', debtorId: 'B1', active: true }, // aynı kişi, ikinci rol
  ];
  const context = { caseDebtors, claimItemActive: true };
  const codes = (draft: Parameters<typeof normalizeSelectionDraft>[0], ctx = context) =>
    normalizeSelectionDraft(draft, ctx).errors.map((error) => error.code);
  const base = { claimItemId: 'K1', basis: 'COURT_JUDGMENT' };

  it('yüzde toplamı 99,99 reddedilir; tam 100,00 kabul edilir', () => {
    expect(codes({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1', sharePercent: '60' }, { caseDebtorId: 'cd-2', sharePercent: '39.99' }] })).toEqual(['SHARE_PERCENT_TOTAL_INVALID']);
    const ok = normalizeSelectionDraft({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1', sharePercent: '60' }, { caseDebtorId: 'cd-2', sharePercent: '40,00' }] }, context);
    expect(ok.errors).toEqual([]);
    expect(ok.selection?.parties.map((p) => p.shareWeight)).toEqual([6000, 4000]);
  });

  it('hepsi sınırsız tavan reddedilir', () => {
    expect(codes({ ...base, mode: 'CAPPED', parties: [{ caseDebtorId: 'cd-1', unlimited: true }, { caseDebtorId: 'cd-2', unlimited: true }] })).toContain('ALL_PARTIES_UNLIMITED');
  });

  it('edilgen borçlu ve dosyada olmayan borçlu reddedilir', () => {
    expect(codes({ ...base, mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'cd-1' }, { caseDebtorId: 'cd-3' }] })).toEqual(['PARTY_NOT_ACTIVE_CASE_DEBTOR']);
    expect(codes({ ...base, mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'yok' }] })).toEqual(['PARTY_NOT_ACTIVE_CASE_DEBTOR']);
  });

  it('aynı kalemde pay ve tavan birlikte reddedilir', () => {
    expect(codes({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1', shareWeight: 1, limitAmount: '100' }, { caseDebtorId: 'cd-2', shareWeight: 1 }] })).toContain('SHARE_AND_LIMIT_MIXED');
  });

  it('dayanaksız seçim reddedilir; açıklama isteyen dayanakta not zorunludur; "belirlenmedi" dayanak istemez', () => {
    expect(codes({ claimItemId: 'K1', mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'cd-1' }] })).toEqual(['BASIS_REQUIRED']);
    expect(codes({ claimItemId: 'K1', mode: 'JOINT_AND_SEVERAL', basis: 'OTHER', parties: [{ caseDebtorId: 'cd-1' }] })).toEqual(['BASIS_NOTE_REQUIRED']);
    expect(codes({ claimItemId: 'K1', mode: 'JOINT_AND_SEVERAL', basis: 'UYDURMA', parties: [{ caseDebtorId: 'cd-1' }] })).toEqual(['BASIS_INVALID']);
    expect(normalizeSelectionDraft({ claimItemId: 'K1', mode: 'UNDETERMINED' }, context)).toMatchObject({ errors: [], selection: { mode: 'UNDETERMINED', parties: [], limitScope: null } });
  });

  it('diğer kurallar: tür, taraf sayısı, yinelenen kişi, pay girdisi, tavan, etkin olmayan kalem', () => {
    expect(codes({ ...base, mode: 'ZINCIRLEME', parties: [] })).toEqual(['MODE_INVALID']);
    expect(codes({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1', shareWeight: 1 }] })).toContain('PARTY_COUNT_INVALID');
    expect(codes({ ...base, mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'cd-1' }, { caseDebtorId: 'cd-1b' }] })).toEqual(['PARTY_DUPLICATE']);
    expect(codes({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1' }, { caseDebtorId: 'cd-2' }] })).toEqual(['SHARE_INPUT_INVALID']);
    expect(codes({ ...base, mode: 'PROPORTIONAL', parties: [{ caseDebtorId: 'cd-1', shareWeight: 1 }, { caseDebtorId: 'cd-2', sharePercent: '50' }] })).toEqual(['SHARE_INPUT_INVALID']);
    expect(codes({ ...base, mode: 'CAPPED', parties: [{ caseDebtorId: 'cd-1', limitAmount: '0' }] })).toEqual(['LIMIT_INVALID']);
    expect(codes({ ...base, mode: 'CAPPED', parties: [{ caseDebtorId: 'cd-1', limitAmount: '10', unlimited: true }, { caseDebtorId: 'cd-2', limitAmount: '5' }] })).toEqual(['LIMIT_AND_UNLIMITED_CONFLICT']);
    expect(codes({ ...base, mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'cd-1', shareWeight: 2 }] })).toContain('FIELD_NOT_ALLOWED_FOR_MODE');
    expect(codes({ claimItemId: 'K1', mode: 'UNDETERMINED', parties: [{ caseDebtorId: 'cd-1' }] })).toEqual(['UNDETERMINED_HAS_PARTIES']);
    expect(codes({ ...base, mode: 'JOINT_AND_SEVERAL', parties: [{ caseDebtorId: 'cd-1' }] }, { caseDebtors, claimItemActive: false })).toEqual(['CLAIM_ITEM_NOT_ACTIVE']);
  });

  it('tutarla sınırlı seçim tavan kapsamını açık alanla taşır (yalnız kalem tutarı)', () => {
    const result = normalizeSelectionDraft({ ...base, mode: 'CAPPED', parties: [{ caseDebtorId: 'cd-1', unlimited: true }, { caseDebtorId: 'cd-2', limitAmount: '8000.00' }] }, context);
    expect(result.errors).toEqual([]);
    expect(result.selection).toMatchObject({ mode: 'CAPPED', limitScope: 'ITEM_AMOUNT' });
    expect(result.selection?.parties.map((p) => [p.unlimited, money(p.limitKurus)])).toEqual([[true, null], [false, 8000]]);
  });
});

describe('borçlu bakiyesi — seçimlik sorumluluk alanları', () => {
  const caseDebtors = [
    { id: 'cd-1', debtorId: 'B1', role: 'ASIL_BORCLU', lifecycleStatus: 'ACTIVE', name: 'Borçlu Bir' },
    { id: 'cd-2', debtorId: 'B2', role: 'ASIL_BORCLU', lifecycleStatus: 'ACTIVE', name: 'Borçlu İki' },
  ];
  const item = (id: string, demanded: number, collected: number, restrictedTo: string[] | null = null) => ({
    id,
    itemType: 'PRINCIPAL',
    description: null,
    currency: 'TRY',
    amount: demanded,
    demandedAmount: demanded,
    collectedAmount: collected,
    isAllDebtorsLiable: restrictedTo === null,
    liableDebtorIds: restrictedTo ?? [],
  });

  it('seçimsiz dosyada mevcut alanlar değişiklik öncesiyle BİREBİR aynıdır (bağlam verilse de)', () => {
    const items = [item('K1', 10000, 800), item('K2', 1000, 300, ['B1'])];
    const legacy = buildDebtorLedgerBalances({ caseDebtors, items });
    const evaluations = new Map(
      items.map((row) => [
        row.id,
        evaluateItemLiability(
          facts({ claimItemId: row.id, demanded: row.demandedAmount, collected: row.collectedAmount, isAllDebtorsLiable: row.isAllDebtorsLiable, liableDebtorIds: row.liableDebtorIds }),
          ACTIVE,
        ),
      ]),
    );
    const extended = buildDebtorLedgerBalances({ caseDebtors, items, liability: { evaluations } });
    const legacyFields = (result: typeof extended) => ({
      kaynak: result.kaynak,
      isleyenFaizDahil: result.isleyenFaizDahil,
      not: result.not,
      sorumlusuBulunamayanKalemler: result.sorumlusuBulunamayanKalemler,
      mahsubuBekleyenTahsilatlar: result.mahsubuBekleyenTahsilatlar,
      borclular: result.borclular.map((b) => ({
        caseDebtorId: b.caseDebtorId,
        debtorId: b.debtorId,
        ad: b.ad,
        rol: b.rol,
        toplamlar: b.toplamlar,
        kalemler: b.kalemler.map(({ sorumluluk: _sorumluluk, ...rest }) => rest),
      })),
    });
    expect(legacyFields(extended)).toEqual(legacyFields(legacy));
    // Ek alanlar: seçimsiz kalem "BELİRLENMEDİ"; kesin toplam ile belirlenmemiş toplam AYRI; dosya kalanı ayrı alan
    const b2 = extended.borclular.find((b) => b.debtorId === 'B2')!;
    expect(b2.kalemler.map((l) => l.sorumluluk?.tur)).toEqual(['BELIRLENMEDI']);
    expect(b2.kalemler[0].sorumluluk?.kalanSorumluluk).toBeNull();
    expect(b2.sorumlulukOzeti).toEqual({
      kesinSorumluluk: { durum: 'HESAPLANDI', neden: null, toplamlar: [] },
      belirlenmemisOrtakKalan: [{ paraBirimi: 'TRY', kalan: 9200 }],
    });
    const b1 = extended.borclular.find((b) => b.debtorId === 'B1')!;
    expect(b1.kalemler.map((l) => l.sorumluluk?.tur)).toEqual(['BELIRLENMEDI', 'KAYITTAN_KISITLI']);
    expect(b1.sorumlulukOzeti?.kesinSorumluluk.toplamlar).toEqual([{ paraBirimi: 'TRY', kalan: 700 }]);
    // Dosya kalanı kalemlerden: 9.200 + 700 = 9.900 — borçlu satırlarından toplanmaz (toplansa 9.200 + 9.900 olurdu)
    expect(extended.dosyaKalani).toEqual([{ paraBirimi: 'TRY', kalan: 9900 }]);
  });

  it('paylı kalemde borçlu toplamına payı ve kendi hesabına sayılan mahsup girer', () => {
    const items = [item('K1', 9000, 1000)];
    const evaluations = new Map([
      [
        'K1',
        evaluateItemLiability(
          facts({
            demanded: 9000,
            collected: 1000,
            isAllDebtorsLiable: false,
            activeSet: { setId: 's', version: 1, mode: 'PROPORTIONAL', parties: [party('B1', { shareWeight: 6000 }), party('B2', { shareWeight: 4000 }, 1)] },
            attribution: attribution({ B2: 1000 }),
          }),
          ACTIVE,
        ),
      ],
    ]);
    const result = buildDebtorLedgerBalances({ caseDebtors, items: [{ ...items[0], isAllDebtorsLiable: false }], liability: { evaluations } });
    expect(result.sorumlusuBulunamayanKalemler).toEqual([]);
    const byDebtor = Object.fromEntries(result.borclular.map((b) => [b.debtorId, b]));
    expect(byDebtor.B1.toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 5400, tahsilEdilen: 0, kalan: 5400 }]);
    expect(byDebtor.B2.toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 3600, tahsilEdilen: 1000, kalan: 2600 }]);
    expect(byDebtor.B2.kalemler[0].sorumluluk).toMatchObject({ tur: 'PAYLI', pay: 3600, borcluHesabinaMahsup: 1000, kalanSorumluluk: 2600, ortakKalan: 8000, uzlasiyor: true });
    expect(result.dosyaKalani).toEqual([{ paraBirimi: 'TRY', kalan: 8000 }]);
  });

  it('tavanlı kalemi olan borçluda borçlu toplamı BELİRLENEMEDİ; kalem satırı yine görünür', () => {
    const evaluations = new Map([
      [
        'K1',
        evaluateItemLiability(
          facts({
            demanded: 20000,
            collected: 3000,
            isAllDebtorsLiable: false,
            activeSet: { setId: 's', version: 1, mode: 'CAPPED', parties: [party('B1', { unlimited: true }), party('B2', { limitKurus: toKurus(8000) }, 1)] },
            attribution: attribution({ B2: 3000 }),
          }),
          ACTIVE,
        ),
      ],
    ]);
    const result = buildDebtorLedgerBalances({ caseDebtors, items: [{ ...item('K1', 20000, 3000), isAllDebtorsLiable: false }], liability: { evaluations } });
    for (const debtor of result.borclular) {
      expect(debtor.toplamDurumu).toBe('BELIRLENEMEDI');
      expect(debtor.toplamlar).toEqual([]);
      expect(debtor.sorumlulukOzeti?.kesinSorumluluk).toEqual({ durum: 'BELIRLENEMEDI', neden: 'TAVANLI_KALEM', toplamlar: [] });
      expect(debtor.kalemler).toHaveLength(1);
    }
    const b2 = result.borclular.find((b) => b.debtorId === 'B2')!;
    expect(b2.kalemler[0].sorumluluk).toMatchObject({ tur: 'TUTARLA_SINIRLI', tavan: 8000, tavanKapsami: 'ITEM_AMOUNT', kalanSorumluluk: 5000 });
    expect(result.sorumlulukNotu).toContain('tavan yalnız kalemin kayıtlı tutarını kapsar');
  });
});
