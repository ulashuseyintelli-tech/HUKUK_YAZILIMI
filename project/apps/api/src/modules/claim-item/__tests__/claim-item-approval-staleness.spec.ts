import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  CLAIM_ITEM_LIABILITY_INDEPENDENT_PATCH_FIELDS,
  evaluateClaimItemApprovalStaleness,
  isExplainableByLiabilitySelection,
} from '../claim-item-approval-staleness';
import { CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS, CLAIM_ITEM_LOW_IMPACT_USER_FIELDS } from '../claim-item-approval.constants';

/**
 * YÜKSEK ETKİLİ KALEM DEĞİŞİKLİĞİ ONAYINDA BAYATLIK KAPSAMI (owner talimatı 2026-11-18).
 *
 * Kanıtlanan: bayatlık kuralı körlemesine daraltılmadı. Tek istisna — faiz / vekâlet ücreti kaynağı / açıklayıcı alan talebi
 * beklerken talepten SONRA onaylanmış sorumluluk seçiminin yazdığı iki izdüşüm alanı — dışında her değişiklik bayatlıktır.
 * Değerler SENTETİKTİR.
 */
const snapshot = (over: Record<string, unknown> = {}) => ({
  id: 'ci-1',
  tenantId: 't-1',
  caseId: 'case-1',
  itemType: 'ATTORNEY_FEE',
  amount: '1000',
  originalAmount: '1000',
  demandedAmount: '1000',
  collectedAmount: '0',
  currency: 'TRY',
  interestType: 'YASAL',
  interestTypeCode: 'LEGAL_3095',
  interestRate: null,
  interestStartDate: null,
  interestEndDate: null,
  dueDate: '2025-01-01T00:00:00.000Z',
  interestAccrualStatus: 'UNKNOWN',
  interestStartDateProvenance: null,
  attorneyFeeBasis: 'JUDGMENT_AWARDED',
  noInterestReason: null,
  noInterestConfirmedById: null,
  noInterestConfirmedAt: null,
  isAllDebtorsLiable: true,
  liableDebtorIds: [] as string[],
  status: 'ACTIVE',
  description: 'Sentetik kalem',
  referenceNo: null,
  sortOrder: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const INTEREST_PATCH = { interestAccrualStatus: 'ACCRUES', interestStartDate: '2025-03-04', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' };
const SELECTION_APPLIED = { isAllDebtorsLiable: false, liableDebtorIds: [], updatedAt: '2026-01-02T00:00:00.000Z' };

const evaluate = (over: {
  operation?: 'UPDATE' | 'DELETE';
  patch?: Record<string, unknown>;
  current?: Record<string, unknown>;
  fromSelection?: boolean;
  request?: Record<string, unknown> | null;
  hash?: string | null;
}) => {
  const request = over.request === undefined ? snapshot() : over.request;
  return evaluateClaimItemApprovalStaleness({
    operation: over.operation ?? 'UPDATE',
    proposedPatch: over.patch ?? INTEREST_PATCH,
    requestSnapshot: request,
    requestSnapshotHash: over.hash === undefined ? (request ? stableJsonHash(request) : null) : over.hash,
    currentSnapshot: snapshot(over.current ?? {}),
    liabilityChangeFromApprovedSelection: over.fromSelection ?? false,
  });
};

describe('Kalem onayı bayatlık kapsamı — değişmeyen kural', () => {
  it('kalem değişmediyse talep geçerlidir', () => {
    expect(evaluate({})).toEqual({ stale: false, reason: 'UNCHANGED', changedFields: [] });
  });

  it.each([
    ['tutar', { amount: '1001', demandedAmount: '1001', updatedAt: 'x' }],
    ['tahsil edilen', { collectedAmount: '10', updatedAt: 'x' }],
    ['kalem türü', { itemType: 'EXPENSE', updatedAt: 'x' }],
    ['para birimi', { currency: 'USD', updatedAt: 'x' }],
    ['durum', { status: 'CANCELLED', updatedAt: 'x' }],
    ['vade', { dueDate: '2025-02-02T00:00:00.000Z', updatedAt: 'x' }],
    ['faiz alanı (talebin kendi grubu)', { interestTypeCode: 'COMMERCIAL', updatedAt: 'x' }],
    ['vekâlet ücreti kaynağı', { attorneyFeeBasis: 'ENFORCEMENT_TARIFF', updatedAt: 'x' }],
    ['açıklama', { description: 'Onay beklerken değişti', updatedAt: 'x' }],
  ])('%s değiştiyse faiz talebi bayattır — onaylı seçim uygulanmış olsa bile', (_ad, current) => {
    // Seçim de uygulanmış olsun: ortak / kendi grubundaki değişiklik yine bayatlıktır.
    const result = evaluate({ current: { ...SELECTION_APPLIED, ...current }, fromSelection: true });
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('CHANGED');
    // Seçim uygulanmamışken de bayattır.
    expect(evaluate({ current }).stale).toBe(true);
  });

  it('yalnız sürüm alanı değiştiyse (neyin değiştiği görülemiyor) ve kayıt bunu onaylı seçimlere bağlayamıyorsa bayattır', () => {
    expect(evaluate({ current: { updatedAt: 'x' }, fromSelection: false })).toMatchObject({ stale: true, reason: 'CHANGED', changedFields: ['updatedAt'] });
  });

  it('kayıtlı görüntü kendi özetiyle tutmuyorsa bayattır', () => {
    expect(evaluate({ hash: 'baska-ozet' })).toMatchObject({ stale: true, reason: 'SNAPSHOT_INTEGRITY' });
  });

  it('görüntü yok, yalnız özet var: bütün görüntü özeti karşılaştırılır', () => {
    expect(evaluate({ request: null, hash: stableJsonHash(snapshot()) })).toMatchObject({ stale: false, reason: 'UNCHANGED' });
    expect(evaluate({ request: null, hash: stableJsonHash(snapshot()), current: { description: 'değişti' } })).toMatchObject({ stale: true });
  });

  it('özet hiç yoksa denetim yapılmaz (eski kayıt biçimi; mevcut davranış)', () => {
    expect(evaluate({ request: snapshot(), hash: null, current: { amount: '5' } })).toMatchObject({ stale: false, reason: 'NO_BASELINE' });
  });
});

describe('Kalem onayı bayatlık kapsamı — tek istisna: talepten sonra onaylanmış sorumluluk seçimi', () => {
  it('yalnız iki izdüşüm alanı değişti ve değişiklik onaylı seçimden: faiz talebi geçerlidir', () => {
    expect(evaluate({ current: SELECTION_APPLIED, fromSelection: true })).toEqual({
      stale: false,
      reason: 'ONLY_APPROVED_LIABILITY_SELECTION_APPLIED',
      changedFields: ['isAllDebtorsLiable', 'updatedAt'],
    });
    expect(
      evaluate({ current: { isAllDebtorsLiable: false, liableDebtorIds: ['d-1'], updatedAt: 'x' }, fromSelection: true }),
    ).toMatchObject({ stale: false, changedFields: ['isAllDebtorsLiable', 'liableDebtorIds', 'updatedAt'] });
  });

  it('art arda seçimler izdüşümü başa döndürdüyse yalnız sürüm alanı değişir; kayıt zinciri doğruladıysa talep geçerlidir', () => {
    expect(evaluate({ current: { updatedAt: 'x' }, fromSelection: true })).toEqual({
      stale: false,
      reason: 'ONLY_APPROVED_LIABILITY_SELECTION_APPLIED',
      changedFields: ['updatedAt'],
    });
  });

  it('aynı değişiklik onaylı seçimden gelmiyorsa (kayıttan doğrulanamadı) bayattır', () => {
    expect(evaluate({ current: SELECTION_APPLIED, fromSelection: false })).toMatchObject({ stale: true, reason: 'CHANGED' });
  });

  it.each([
    ['vekâlet ücreti kaynağı talebi', { attorneyFeeBasis: 'ENFORCEMENT_TARIFF' }, false],
    ['açıklayıcı alan talebi', { description: 'Yeni açıklama' }, false],
    ['faizsizlik beyanı', { interestAccrualStatus: 'NO_INTEREST', noInterestReason: 'Sentetik gerekçe', noInterestConfirmedById: 'u-1' }, false],
    ['tutar talebi (ortak veri)', { amount: 1200 }, true],
    ['tür talebi (ortak veri)', { itemType: 'EXPENSE' }, true],
    ['durum talebi', { status: 'CANCELLED' }, true],
    ['vade talebi', { dueDate: '2025-05-05' }, true],
    ['sorumluluk alanı talebi (eski yol)', { isAllDebtorsLiable: false, liableDebtorIds: ['d-1'] }, true],
    ['faiz + tutar birlikte', { ...INTEREST_PATCH, amount: 1200 }, true],
    ['tanınmayan alan', { bilinmeyenAlan: 1 }, true],
    ['boş talep', {}, true],
  ])('istisna yalnız sorumluluktan bağımsız talepler içindir: %s', (_ad, patch, expectedStale) => {
    expect(evaluate({ patch, current: SELECTION_APPLIED, fromSelection: true }).stale).toBe(expectedStale);
  });

  it('silme talebinde istisna yoktur', () => {
    expect(evaluate({ operation: 'DELETE', patch: {}, current: SELECTION_APPLIED, fromSelection: true })).toMatchObject({ stale: true });
  });

  it('bağımsız alan listesi yalnız kullanıcı alanlarından oluşur; ortak veri ve sorumluluk alanı içermez', () => {
    const userFields = [...CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS, ...CLAIM_ITEM_LOW_IMPACT_USER_FIELDS] as readonly string[];
    for (const field of CLAIM_ITEM_LIABILITY_INDEPENDENT_PATCH_FIELDS) expect(userFields).toContain(field);
    for (const shared of ['amount', 'itemType', 'currency', 'status', 'dueDate', 'isAllDebtorsLiable', 'liableDebtorIds']) {
      expect(CLAIM_ITEM_LIABILITY_INDEPENDENT_PATCH_FIELDS as readonly string[]).not.toContain(shared);
    }
  });

  it('isExplainableByLiabilitySelection: yalnız izdüşüm alanları ve / veya sürüm alanı değiştiyse doğru', () => {
    expect(isExplainableByLiabilitySelection(['isAllDebtorsLiable', 'updatedAt'])).toBe(true);
    expect(isExplainableByLiabilitySelection(['liableDebtorIds'])).toBe(true);
    expect(isExplainableByLiabilitySelection(['updatedAt'])).toBe(true);
    expect(isExplainableByLiabilitySelection(['isAllDebtorsLiable', 'amount'])).toBe(false);
    expect(isExplainableByLiabilitySelection(['description', 'updatedAt'])).toBe(false);
    expect(isExplainableByLiabilitySelection([])).toBe(false);
  });
});
