import { Prisma } from '@prisma/client';

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — saf alan modülü (veritabanı erişimi YOK).
 *
 * Karar: decision-log 2026-11-15, DEBTOR-OD07-CLAIM-LIABILITY-SELECTION-SA01.
 *
 * Değişmezler:
 *  - Kalemin ne kadar tahsil edildiğini gösteren TEK sayaç `collectedAmount`'tır (C). Borçlu rakamları her okumada
 *    C + defter atıflarından TÜRETİLİR; hiçbir yerde saklanmaz. Dosya kalanı kalemlerin ortak kalanından (R = T − C)
 *    hesaplanır; borçlu rakamları ASLA toplanmaz.
 *  - Paylar her zaman kalemin TAM tutarından (T), kullanıcının girdiği ağırlıkla hesaplanır; hiçbir durumda yeniden
 *    ölçeklenmez. Geçmiş atıflar aynen sayılır; uzlaşmıyorsa kalem "uzlaşmıyor" durumuna düşer (hesaplanan sonuç).
 *  - Yazılım ilam metninden, rolden ya da borçlu sayısından sorumluluk türü ÇIKARMAZ. Seçim kaydı yoksa kalem
 *    "belirlenmedi"dir ve bugünkü kurallarla işler.
 *  - Para aritmetiği tam sayı kuruş (bigint) ile yapılır; kayan nokta kullanılmaz.
 *
 * Kimlik uzayı: seçim tarafı `CaseDebtor.id` ile saklanır; sorumluluk ve atıf KİŞİ düzeyinde (`Debtor.id`) okunur
 * (mevcut `ClaimItem.liableDebtorIds` ile aynı uzay — aynı kişi dosyada birden çok rolle yer alabilir).
 */

export const CLAIM_LIABILITY_MODES = ['JOINT_AND_SEVERAL', 'PROPORTIONAL', 'CAPPED', 'UNDETERMINED'] as const;
export type ClaimLiabilityModeValue = (typeof CLAIM_LIABILITY_MODES)[number];

export const CLAIM_LIABILITY_BASES = [
  'COURT_JUDGMENT',
  'CONTRACT',
  'STATUTE',
  'NEGOTIABLE_INSTRUMENT',
  'LAWYER_ASSESSMENT',
  'OTHER',
] as const;
export type ClaimLiabilityBasisValue = (typeof CLAIM_LIABILITY_BASES)[number];

/** Açıklama (basisNote) zorunlu dayanaklar. */
export const CLAIM_LIABILITY_BASES_REQUIRING_NOTE: readonly ClaimLiabilityBasisValue[] = ['LAWYER_ASSESSMENT', 'OTHER'];

export const CLAIM_LIABILITY_LIMIT_SCOPE = 'ITEM_AMOUNT' as const;

export const CLAIM_LIABILITY_MAX_PARTIES = 32;
export const CLAIM_LIABILITY_MAX_WEIGHT = 1_000_000;

/** Kalemin sorumluluk görünümü. İlk ikisi seçim kaydı OLMAYAN kalemlerdir. */
export type ItemLiabilityKind =
  | 'UNDETERMINED' // Belirlenmedi: seçim yok (ya da bilinçli geri dönüş), kalem tüm borçlulara açık
  | 'LEGACY_RESTRICTED' // Oluşum kaydından kısıtlı: seçim yok, eski liste dolu
  | 'JOINT_AND_SEVERAL'
  | 'PROPORTIONAL'
  | 'CAPPED';

export type MoneyInput = Prisma.Decimal | number | string | bigint | null | undefined;

// ─────────────────────────────────────────── para ───────────────────────────────────────────

/**
 * Tutarı tam sayı kuruşa çevirir (yarım kuruş yukarı). `bigint` girdi zaten kuruş sayılır.
 */
export function toKurus(value: MoneyInput): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  const decimal = new Prisma.Decimal(value as Prisma.Decimal.Value);
  if (!decimal.isFinite()) throw new RangeError('claim-liability: tutar sonlu olmalı');
  // Tam sayıya yuvarlanmış kuruş değeri metne çevrilir (kayan nokta ve ondalık biçimlendirme yok).
  const integerText = decimal.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString();
  if (!/^-?\d+$/.test(integerText)) throw new RangeError('claim-liability: tutar kuruşa çevrilemedi');
  return BigInt(integerText);
}

/** Kuruşu iki ondalıklı sayıya çevirir (yanıt alanları için). */
export function fromKurus(kurus: bigint): number {
  return new Prisma.Decimal(kurus.toString()).div(100).toNumber();
}

/** Kuruşu "1234.56" biçimli metne çevirir (özet / niyet kaydı için; kayan nokta yok). */
export function kurusToFixed(kurus: bigint): string {
  const negative = kurus < 0n;
  const absolute = negative ? -kurus : kurus;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

const minBig = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

// ─────────────────────────────────────────── pay ───────────────────────────────────────────

/**
 * Tutarı ağırlıklara göre kuruşu kuruşuna böler: önce aşağı yuvarlanır, artan kuruşlar EN BÜYÜK KALANA, eşitlikte
 * borçlu sırasına (dizin) verilir. Payların toplamı her zaman tutara eşittir.
 */
export function computeShares(totalKurus: bigint, weights: readonly number[]): bigint[] {
  if (totalKurus < 0n) throw new RangeError('claim-liability: pay tabanı negatif olamaz');
  if (weights.length === 0) return [];
  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight < 1 || weight > CLAIM_LIABILITY_MAX_WEIGHT) {
      throw new RangeError('claim-liability: ağırlık 1..1.000.000 tam sayı olmalı');
    }
  }
  const bigWeights = weights.map((weight) => BigInt(weight));
  const weightSum = bigWeights.reduce((sum, weight) => sum + weight, 0n);
  const shares = bigWeights.map((weight) => (totalKurus * weight) / weightSum);
  const remainders = bigWeights.map((weight, index) => ({ index, remainder: (totalKurus * weight) % weightSum }));
  let leftover = totalKurus - shares.reduce((sum, share) => sum + share, 0n);
  remainders.sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of remainders) {
    if (leftover <= 0n) break;
    shares[index] += 1n;
    leftover -= 1n;
  }
  return shares;
}

/**
 * İki ondalıklı yüzde metnini ("60", "33.33", "33,33") baz puana (×100 tam sayı) çevirir; geçersizse null.
 */
export function parsePercentToBasisPoints(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const basisPoints = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return basisPoints >= 1 && basisPoints <= 10_000 ? basisPoints : null;
}

// ─────────────────────────────────────────── atıf ───────────────────────────────────────────

/**
 * Bir tahsilatın HESABINA sayıldığı dosya borçlusu (tek kural, yeni defter sütunu yok):
 *  1) mahsup bekletilip sonradan tamamlandıysa tamamlamada seçilen borçlu;
 *  2) değilse tahsilat kaydındaki "hesabına ödeme yapılan borçlu";
 *  3) ikisi de yoksa ATIFSIZ (null).
 * İptalin ters kaydı aynı tahsilata bağlı olduğundan aynı kovada kendiliğinden netleşir.
 */
export function resolveAttributedCaseDebtorId(source: {
  readonly releasedOnBehalfCaseDebtorId?: string | null;
  readonly collectionCaseDebtorId?: string | null;
}): string | null {
  return source.releasedOnBehalfCaseDebtorId || source.collectionCaseDebtorId || null;
}

export interface AttributionSourceRow {
  readonly claimItemId: string;
  readonly amountKurus: bigint;
  /** Kişi anahtarı (Debtor.id); atıfsız satırda null. */
  readonly debtorId: string | null;
}

export interface ItemAttribution {
  readonly byDebtor: ReadonlyMap<string, bigint>;
  readonly unattributedKurus: bigint;
  readonly totalKurus: bigint;
}

export const EMPTY_ATTRIBUTION: ItemAttribution = Object.freeze({
  byDebtor: new Map<string, bigint>(),
  unattributedKurus: 0n,
  totalKurus: 0n,
});

/**
 * Dağıtım satırlarını kalem başına kovalara toplar. Her satır TAM OLARAK bir kovaya düşer; bu yüzden
 * `toplam = Σ borçlu + atıfsız` eşitliği yapısaldır.
 */
export function summarizeAttribution(rows: readonly AttributionSourceRow[]): Map<string, ItemAttribution> {
  const working = new Map<string, { byDebtor: Map<string, bigint>; unattributedKurus: bigint; totalKurus: bigint }>();
  for (const row of rows) {
    const entry = working.get(row.claimItemId) ?? { byDebtor: new Map<string, bigint>(), unattributedKurus: 0n, totalKurus: 0n };
    if (row.debtorId) entry.byDebtor.set(row.debtorId, (entry.byDebtor.get(row.debtorId) ?? 0n) + row.amountKurus);
    else entry.unattributedKurus += row.amountKurus;
    entry.totalKurus += row.amountKurus;
    working.set(row.claimItemId, entry);
  }
  return new Map([...working.entries()].map(([claimItemId, entry]) => [claimItemId, entry as ItemAttribution]));
}

// ─────────────────────────────────────────── seçim görünümü ───────────────────────────────────────────

export interface LiabilityPartyView {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly shareWeight: number | null;
  readonly limitKurus: bigint | null;
  readonly unlimited: boolean;
  readonly sortOrder: number;
}

export interface LiabilitySetView {
  readonly setId: string | null;
  readonly version: number;
  readonly mode: ClaimLiabilityModeValue;
  readonly parties: readonly LiabilityPartyView[];
}

export interface LiabilityItemFacts {
  readonly claimItemId: string;
  /** T — talep edilen tutar (kuruş). */
  readonly demandedKurus: bigint;
  /** C — kalemin tek tahsilat sayacı (kuruş). */
  readonly collectedKurus: bigint;
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[];
  /** Etkin seçim (yoksa null). UNDETERMINED modlu etkin kayıt hesap açısından "seçim yok" ile aynıdır. */
  readonly activeSet: LiabilitySetView | null;
  readonly attribution: ItemAttribution;
}

export type LiabilityReconcileBlockerCode =
  | 'UNATTRIBUTED_COLLECTION' // geçmiş tahsilatın hangi borçlu hesabına yapıldığı kayıtlı değil
  | 'ATTRIBUTED_TO_NON_PARTY' // geçmiş tahsilat seçimde olmayan borçlu hesabına
  | 'ATTRIBUTION_EXCEEDS_SHARE' // borçlu hesabına sayılan tutar payını aşıyor
  | 'ATTRIBUTION_EXCEEDS_LIMIT' // borçlu hesabına sayılan tutar tavanını aşıyor
  | 'NEGATIVE_ATTRIBUTION' // borçlu kovası eksiye düşmüş (ters kayıt uyumsuzluğu)
  | 'COUNTER_LEDGER_MISMATCH'; // kalem sayacı defter atıflarının toplamına eşit değil

export interface LiabilityReconcileBlocker {
  readonly code: LiabilityReconcileBlockerCode;
  readonly debtorId?: string;
  readonly amountKurus?: bigint;
  readonly boundKurus?: bigint;
}

export interface EvaluatedLiabilityParty {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly sortOrder: number;
  /** Paylıda borçlunun payı (T üzerinden); diğer türlerde null. */
  readonly shareKurus: bigint | null;
  readonly shareWeight: number | null;
  /** Tutarla sınırlıda tavan; sınırsızda / diğer türlerde null. */
  readonly limitKurus: bigint | null;
  readonly unlimited: boolean;
  /** A_i — bu borçlu hesabına bu kaleme yapılmış net mahsup. */
  readonly attributedKurus: bigint;
  /** L_i — kalan sorumluluk; kalem uzlaşmıyorsa null (kesin rakam üretilmez). */
  readonly remainingLiabilityKurus: bigint | null;
}

export interface EvaluatedItemLiability {
  readonly claimItemId: string;
  readonly kind: ItemLiabilityKind;
  readonly setId: string | null;
  readonly setVersion: number | null;
  readonly demandedKurus: bigint;
  readonly collectedKurus: bigint;
  /** R — ortak kalan (eksiye düşmez). */
  readonly remainingKurus: bigint;
  readonly reconciled: boolean;
  readonly blockers: readonly LiabilityReconcileBlocker[];
  readonly parties: readonly EvaluatedLiabilityParty[];
  /** Kısıtlı listede / seçimde yer alan kişi anahtarları (UNDETERMINED'da boş). */
  readonly liableDebtorIds: readonly string[];
  /** Bu kalem yüzünden tahsilatta "hesabına ödeme yapılan borçlu" zorunlu mu. */
  readonly requiresOnBehalfDebtor: boolean;
  readonly attribution: ItemAttribution;
}

/**
 * Bir kalemin sorumluluk durumunu değerlendirir: tür, ortak kalan, taraf rakamları ve uzlaşma şartı.
 *
 * Uzlaşma şartı (tasarım §4):
 *  - müteselsil / belirlenmedi / kayıttan kısıtlı: yok (atıf hesaba girmez);
 *  - paylı: atıfsız mahsup yok; seçimde olmayan borçluya atıf yok; her A_i ≤ pay_i;
 *  - tutarla sınırlı: atıfsız mahsup yok; seçimde olmayan borçluya atıf yok; tavanlı her borçluda A_i ≤ tavan_i.
 */
export function evaluateItemLiability(
  facts: LiabilityItemFacts,
  activePersonIds: ReadonlySet<string>,
): EvaluatedItemLiability {
  const remainingKurus = maxBig(facts.demandedKurus - facts.collectedKurus, 0n);
  const set = facts.activeSet && facts.activeSet.mode !== 'UNDETERMINED' ? facts.activeSet : null;
  const base = {
    claimItemId: facts.claimItemId,
    setId: facts.activeSet?.setId ?? null,
    setVersion: facts.activeSet?.version ?? null,
    demandedKurus: facts.demandedKurus,
    collectedKurus: facts.collectedKurus,
    remainingKurus,
    attribution: facts.attribution,
  };

  if (!set) {
    if (facts.isAllDebtorsLiable) {
      return { ...base, kind: 'UNDETERMINED', reconciled: true, blockers: [], parties: [], liableDebtorIds: [], requiresOnBehalfDebtor: false };
    }
    return {
      ...base,
      kind: 'LEGACY_RESTRICTED',
      reconciled: true,
      blockers: [],
      parties: [],
      liableDebtorIds: [...facts.liableDebtorIds],
      requiresOnBehalfDebtor: true,
    };
  }

  const ordered = [...set.parties].sort((a, b) => (a.sortOrder === b.sortOrder ? a.caseDebtorId.localeCompare(b.caseDebtorId) : a.sortOrder - b.sortOrder));
  const partyDebtorIds = ordered.map((party) => party.debtorId);
  const partySet = new Set(partyDebtorIds);
  const attributed = (debtorId: string): bigint => facts.attribution.byDebtor.get(debtorId) ?? 0n;

  if (set.mode === 'JOINT_AND_SEVERAL') {
    const coversAllActive = [...activePersonIds].every((debtorId) => partySet.has(debtorId));
    return {
      ...base,
      kind: 'JOINT_AND_SEVERAL',
      reconciled: true,
      blockers: [],
      parties: ordered.map((party) => ({
        caseDebtorId: party.caseDebtorId,
        debtorId: party.debtorId,
        sortOrder: party.sortOrder,
        shareKurus: null,
        shareWeight: null,
        limitKurus: null,
        unlimited: false,
        attributedKurus: attributed(party.debtorId),
        remainingLiabilityKurus: remainingKurus,
      })),
      liableDebtorIds: partyDebtorIds,
      // Liste dosyanın etkin borçlularının tamamını kapsıyorsa borçlu belirtmek gerekmez (ortak borç bir kez azalır).
      requiresOnBehalfDebtor: !coversAllActive,
    };
  }

  const blockers: LiabilityReconcileBlocker[] = [];
  if (facts.attribution.totalKurus !== facts.collectedKurus) {
    blockers.push({ code: 'COUNTER_LEDGER_MISMATCH', amountKurus: facts.collectedKurus, boundKurus: facts.attribution.totalKurus });
  }
  if (facts.attribution.unattributedKurus !== 0n) {
    blockers.push({ code: 'UNATTRIBUTED_COLLECTION', amountKurus: facts.attribution.unattributedKurus });
  }
  for (const [debtorId, amountKurus] of facts.attribution.byDebtor) {
    if (amountKurus < 0n) blockers.push({ code: 'NEGATIVE_ATTRIBUTION', debtorId, amountKurus });
    else if (amountKurus !== 0n && !partySet.has(debtorId)) blockers.push({ code: 'ATTRIBUTED_TO_NON_PARTY', debtorId, amountKurus });
  }

  if (set.mode === 'PROPORTIONAL') {
    const shares = computeShares(facts.demandedKurus, ordered.map((party) => party.shareWeight ?? 0));
    ordered.forEach((party, index) => {
      const amountKurus = attributed(party.debtorId);
      if (amountKurus > shares[index]) {
        blockers.push({ code: 'ATTRIBUTION_EXCEEDS_SHARE', debtorId: party.debtorId, amountKurus, boundKurus: shares[index] });
      }
    });
    const reconciled = blockers.length === 0;
    return {
      ...base,
      kind: 'PROPORTIONAL',
      reconciled,
      blockers,
      parties: ordered.map((party, index) => ({
        caseDebtorId: party.caseDebtorId,
        debtorId: party.debtorId,
        sortOrder: party.sortOrder,
        shareKurus: shares[index],
        shareWeight: party.shareWeight,
        limitKurus: null,
        unlimited: false,
        attributedKurus: attributed(party.debtorId),
        remainingLiabilityKurus: reconciled ? minBig(remainingKurus, shares[index] - attributed(party.debtorId)) : null,
      })),
      liableDebtorIds: partyDebtorIds,
      requiresOnBehalfDebtor: true,
    };
  }

  // CAPPED
  for (const party of ordered) {
    if (party.unlimited || party.limitKurus === null) continue;
    const amountKurus = attributed(party.debtorId);
    if (amountKurus > party.limitKurus) {
      blockers.push({ code: 'ATTRIBUTION_EXCEEDS_LIMIT', debtorId: party.debtorId, amountKurus, boundKurus: party.limitKurus });
    }
  }
  const reconciled = blockers.length === 0;
  return {
    ...base,
    kind: 'CAPPED',
    reconciled,
    blockers,
    parties: ordered.map((party) => {
      const amountKurus = attributed(party.debtorId);
      const bounded = party.unlimited || party.limitKurus === null ? remainingKurus : minBig(remainingKurus, party.limitKurus - amountKurus);
      return {
        caseDebtorId: party.caseDebtorId,
        debtorId: party.debtorId,
        sortOrder: party.sortOrder,
        shareKurus: null,
        shareWeight: null,
        limitKurus: party.unlimited ? null : party.limitKurus,
        unlimited: party.unlimited,
        attributedKurus: amountKurus,
        remainingLiabilityKurus: reconciled ? maxBig(bounded, 0n) : null,
      };
    }),
    liableDebtorIds: partyDebtorIds,
    requiresOnBehalfDebtor: true,
  };
}

/** Kişi bu kalemin sorumluları arasında mı (kapasitesi tükenmiş olsa bile). */
export function isLiableParty(evaluation: EvaluatedItemLiability, debtorId: string): boolean {
  if (evaluation.kind === 'UNDETERMINED') return true;
  return evaluation.liableDebtorIds.includes(debtorId);
}

/**
 * Borçlu hesabına yapılan tahsilatın bu kaleme en çok ne kadar düşebileceği (kapasite).
 *
 *  | Kalem                         | Kapasite                                   |
 *  | Belirlenmedi                  | R                                          |
 *  | Kayıttan kısıtlı              | listedeyse R, değilse 0                    |
 *  | Müteselsil                    | seçiliyse R (liste herkesi kapsıyorsa R)   |
 *  | Paylı                         | min(R, pay − A)                            |
 *  | Tutarla sınırlı               | min(R, tavan − A); sınırsızsa R            |
 *  | Uzlaşmayan paylı / tavanlı    | 0 (borçluya bağlı mahsup bu kalemde durur) |
 */
export function capacityForDebtor(evaluation: EvaluatedItemLiability, debtorId: string | null): bigint {
  switch (evaluation.kind) {
    case 'UNDETERMINED':
      return evaluation.remainingKurus;
    case 'LEGACY_RESTRICTED':
      return debtorId && evaluation.liableDebtorIds.includes(debtorId) ? evaluation.remainingKurus : 0n;
    case 'JOINT_AND_SEVERAL':
      if (!evaluation.requiresOnBehalfDebtor) return evaluation.remainingKurus;
      return debtorId && evaluation.liableDebtorIds.includes(debtorId) ? evaluation.remainingKurus : 0n;
    case 'PROPORTIONAL':
    case 'CAPPED': {
      if (!debtorId || !evaluation.reconciled) return 0n;
      const party = evaluation.parties.find((candidate) => candidate.debtorId === debtorId);
      return party?.remainingLiabilityKurus ?? 0n;
    }
  }
}

export type LiabilityAllocationHoldCode = 'ON_BEHALF_DEBTOR_REQUIRED' | 'ON_BEHALF_DEBTOR_NOT_LIABLE';

export interface LiabilityAllocationScope {
  /** Mahsup bekletilmeli mi (mevcut iki bekletme nedeni; anlamı değişmez). */
  readonly holdReason: LiabilityAllocationHoldCode | null;
  /** Kalem → kapasite (kuruş). Kapasitesi 0 olan kalem dağıtıcıya verilmez. */
  readonly capacityByItem: ReadonlyMap<string, bigint>;
  readonly totalCapacityKurus: bigint;
  /**
   * Dosyada etkin paylı ya da tutarla sınırlı kalem var VE ödeme bir borçlu hesabına yapılıyor: dar fazla ödeme
   * istisnasının ve eksiksiz uzlaştırma şartının devreye girdiği durum.
   */
  readonly shareOrCapBound: boolean;
}

/**
 * Tahsilatın mahsup kapsamı (etkin kalemler üzerinden). Seçimsiz dosyada çağrılmaz; mevcut yol aynen çalışır.
 */
export function resolveLiabilityAllocationScope(
  activeItemEvaluations: readonly EvaluatedItemLiability[],
  onBehalfDebtorId: string | null,
): LiabilityAllocationScope {
  const required = activeItemEvaluations.some((evaluation) => evaluation.requiresOnBehalfDebtor);
  const hasShareOrCap = activeItemEvaluations.some((evaluation) => evaluation.kind === 'PROPORTIONAL' || evaluation.kind === 'CAPPED');
  const capacityByItem = new Map<string, bigint>();
  let holdReason: LiabilityAllocationHoldCode | null = null;
  if (required && !onBehalfDebtorId) holdReason = 'ON_BEHALF_DEBTOR_REQUIRED';
  else if (required && onBehalfDebtorId && !activeItemEvaluations.some((evaluation) => isLiableParty(evaluation, onBehalfDebtorId))) {
    holdReason = 'ON_BEHALF_DEBTOR_NOT_LIABLE';
  }
  let totalCapacityKurus = 0n;
  if (!holdReason) {
    for (const evaluation of activeItemEvaluations) {
      const capacity = capacityForDebtor(evaluation, onBehalfDebtorId);
      if (capacity > 0n) {
        capacityByItem.set(evaluation.claimItemId, capacity);
        totalCapacityKurus += capacity;
      }
    }
  }
  return { holdReason, capacityByItem, totalCapacityKurus, shareOrCapBound: hasShareOrCap && Boolean(onBehalfDebtorId) };
}

/**
 * Dağıtıcıya verilecek "kalan = kapasite" görünümü. Dağıtıcı kalanı `demandedAmount − collectedAmount` ile okur;
 * görünümde talep = kapasite, tahsil = 0 verilir. Kalem kimliği ve türü DEĞİŞMEZ; sıra (masraf → fer'i → faiz →
 * anapara) dağıtıcıda aynen uygulanır. Kapasitesi 0 olan kalem listeden çıkar.
 */
export function buildCapacityViewItems<T extends { id: string }>(
  items: readonly T[],
  capacityByItem: ReadonlyMap<string, bigint>,
): Array<T & { demandedAmount: number; amount: number; collectedAmount: number }> {
  const view: Array<T & { demandedAmount: number; amount: number; collectedAmount: number }> = [];
  for (const item of items) {
    const capacity = capacityByItem.get(item.id) ?? 0n;
    if (capacity <= 0n) continue;
    const amount = fromKurus(capacity);
    view.push({ ...item, demandedAmount: amount, amount, collectedAmount: 0 });
  }
  return view;
}

// ─────────────────────────────────────────── izdüşüm ───────────────────────────────────────────

/**
 * Seçimin mevcut iki alana izdüşümü (mevcut okuyucular ve ESKİ sürüm kod güvenle okusun diye, aynı işlemde yazılır):
 *  - müteselsil → (false, seçilen kişiler): eski kod "listedeki herkes tamamından sorumlu" okur — eşdeğer;
 *  - paylı / tutarla sınırlı → (false, BOŞ liste): eski kod bu kaleme hiçbir borçlu adına mahsup YAPAMAZ, tahsilatı
 *    bekletir; sorumluluk sınırı eski kodla da aşılamaz;
 *  - bilinçli belirlenmedi → (true, boş): eski varsayılan.
 */
export function legacyProjection(
  mode: ClaimLiabilityModeValue,
  partyDebtorIds: readonly string[],
): { isAllDebtorsLiable: boolean; liableDebtorIds: string[] } {
  if (mode === 'UNDETERMINED') return { isAllDebtorsLiable: true, liableDebtorIds: [] };
  if (mode === 'JOINT_AND_SEVERAL') return { isAllDebtorsLiable: false, liableDebtorIds: [...new Set(partyDebtorIds)] };
  return { isAllDebtorsLiable: false, liableDebtorIds: [] };
}

// ─────────────────────────────────────────── seçim doğrulama ───────────────────────────────────────────

export interface SelectionPartyDraft {
  readonly caseDebtorId: string;
  /** Paylı: tam sayı ağırlık (1..1.000.000). */
  readonly shareWeight?: number | null;
  /** Paylı: iki ondalıklı yüzde; verilirse BÜTÜN taraflarda verilir ve toplam tam 100,00 olmalıdır. */
  readonly sharePercent?: string | number | null;
  /** Tutarla sınırlı: tavan (> 0). */
  readonly limitAmount?: string | number | null;
  /** Tutarla sınırlı: tavansız borçlu. */
  readonly unlimited?: boolean | null;
}

export interface SelectionDraft {
  readonly claimItemId: string;
  readonly mode: string;
  readonly parties?: readonly SelectionPartyDraft[] | null;
  readonly basis?: string | null;
  readonly basisNote?: string | null;
  readonly basisDocumentId?: string | null;
}

export type SelectionErrorCode =
  | 'MODE_INVALID'
  | 'BASIS_REQUIRED'
  | 'BASIS_INVALID'
  | 'BASIS_NOTE_REQUIRED'
  | 'PARTY_COUNT_INVALID'
  | 'PARTY_DUPLICATE'
  | 'PARTY_NOT_ACTIVE_CASE_DEBTOR'
  | 'UNDETERMINED_HAS_PARTIES'
  | 'SHARE_INPUT_INVALID'
  | 'SHARE_PERCENT_TOTAL_INVALID'
  | 'SHARE_AND_LIMIT_MIXED'
  | 'LIMIT_INVALID'
  | 'LIMIT_AND_UNLIMITED_CONFLICT'
  | 'ALL_PARTIES_UNLIMITED'
  | 'FIELD_NOT_ALLOWED_FOR_MODE'
  | 'CLAIM_ITEM_NOT_ACTIVE';

export interface SelectionError {
  readonly code: SelectionErrorCode;
  readonly caseDebtorId?: string;
}

export interface NormalizedSelection {
  readonly claimItemId: string;
  readonly mode: ClaimLiabilityModeValue;
  readonly limitScope: typeof CLAIM_LIABILITY_LIMIT_SCOPE | null;
  readonly basis: ClaimLiabilityBasisValue | null;
  readonly basisNote: string | null;
  readonly basisDocumentId: string | null;
  readonly parties: readonly LiabilityPartyView[];
}

export interface SelectionCaseDebtor {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly active: boolean;
}

const hasValue = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/**
 * Taslak seçimi doğrular ve saklanacak biçime indirger. Hata varsa `selection` null döner; hiçbir varsayılan
 * ATANMAZ (ön seçili tür, otomatik eşit pay ya da borçlu sayısından çıkarım yoktur).
 */
export function normalizeSelectionDraft(
  draft: SelectionDraft,
  context: { readonly caseDebtors: readonly SelectionCaseDebtor[]; readonly claimItemActive: boolean },
): { selection: NormalizedSelection | null; errors: SelectionError[] } {
  const errors: SelectionError[] = [];
  if (!context.claimItemActive) errors.push({ code: 'CLAIM_ITEM_NOT_ACTIVE' });
  if (!(CLAIM_LIABILITY_MODES as readonly string[]).includes(draft.mode)) {
    return { selection: null, errors: [...errors, { code: 'MODE_INVALID' }] };
  }
  const mode = draft.mode as ClaimLiabilityModeValue;
  const parties = draft.parties ?? [];
  const basisNote = typeof draft.basisNote === 'string' && draft.basisNote.trim() ? draft.basisNote.trim() : null;
  const basisDocumentId = typeof draft.basisDocumentId === 'string' && draft.basisDocumentId.trim() ? draft.basisDocumentId.trim() : null;

  let basis: ClaimLiabilityBasisValue | null = null;
  if (hasValue(draft.basis)) {
    if ((CLAIM_LIABILITY_BASES as readonly string[]).includes(String(draft.basis))) basis = draft.basis as ClaimLiabilityBasisValue;
    else errors.push({ code: 'BASIS_INVALID' });
  }

  if (mode === 'UNDETERMINED') {
    if (parties.length > 0) errors.push({ code: 'UNDETERMINED_HAS_PARTIES' });
    return errors.length > 0
      ? { selection: null, errors }
      : { selection: { claimItemId: draft.claimItemId, mode, limitScope: null, basis, basisNote, basisDocumentId, parties: [] }, errors };
  }

  if (!basis && !errors.some((error) => error.code === 'BASIS_INVALID')) errors.push({ code: 'BASIS_REQUIRED' });
  if (basis && CLAIM_LIABILITY_BASES_REQUIRING_NOTE.includes(basis) && !basisNote) errors.push({ code: 'BASIS_NOTE_REQUIRED' });

  const minParties = mode === 'PROPORTIONAL' ? 2 : 1;
  if (parties.length < minParties || parties.length > CLAIM_LIABILITY_MAX_PARTIES) errors.push({ code: 'PARTY_COUNT_INVALID' });

  const byCaseDebtor = new Map(context.caseDebtors.map((row) => [row.caseDebtorId, row]));
  const seenCaseDebtors = new Set<string>();
  const seenPersons = new Set<string>();
  const resolved: Array<{ draft: SelectionPartyDraft; debtorId: string }> = [];
  for (const party of parties) {
    const row = byCaseDebtor.get(party.caseDebtorId);
    if (!row || !row.active) {
      errors.push({ code: 'PARTY_NOT_ACTIVE_CASE_DEBTOR', caseDebtorId: party.caseDebtorId });
      continue;
    }
    if (seenCaseDebtors.has(row.caseDebtorId) || seenPersons.has(row.debtorId)) {
      errors.push({ code: 'PARTY_DUPLICATE', caseDebtorId: party.caseDebtorId });
      continue;
    }
    seenCaseDebtors.add(row.caseDebtorId);
    seenPersons.add(row.debtorId);
    resolved.push({ draft: party, debtorId: row.debtorId });
  }

  const anyShare = parties.some((party) => hasValue(party.shareWeight) || hasValue(party.sharePercent));
  const anyLimit = parties.some((party) => hasValue(party.limitAmount) || party.unlimited === true);
  if (anyShare && anyLimit) errors.push({ code: 'SHARE_AND_LIMIT_MIXED' });

  const views: LiabilityPartyView[] = [];
  if (mode === 'JOINT_AND_SEVERAL') {
    if (anyShare || anyLimit) errors.push({ code: 'FIELD_NOT_ALLOWED_FOR_MODE' });
    resolved.forEach(({ draft: party, debtorId }, index) =>
      views.push({ caseDebtorId: party.caseDebtorId, debtorId, shareWeight: null, limitKurus: null, unlimited: false, sortOrder: index }),
    );
  } else if (mode === 'PROPORTIONAL') {
    if (anyLimit && !anyShare) errors.push({ code: 'FIELD_NOT_ALLOWED_FOR_MODE' });
    const usesPercent = parties.some((party) => hasValue(party.sharePercent));
    const usesWeight = parties.some((party) => hasValue(party.shareWeight));
    if (usesPercent === usesWeight) {
      // ikisi birden ya da hiçbiri: pay girdisi belirsiz
      errors.push({ code: 'SHARE_INPUT_INVALID' });
    } else if (usesPercent) {
      const basisPoints = parties.map((party) => parsePercentToBasisPoints(party.sharePercent));
      if (basisPoints.some((value) => value === null)) errors.push({ code: 'SHARE_INPUT_INVALID' });
      else if ((basisPoints as number[]).reduce((sum, value) => sum + value, 0) !== 10_000) errors.push({ code: 'SHARE_PERCENT_TOTAL_INVALID' });
      else {
        resolved.forEach(({ draft: party, debtorId }, index) =>
          views.push({
            caseDebtorId: party.caseDebtorId,
            debtorId,
            shareWeight: parsePercentToBasisPoints(party.sharePercent) as number,
            limitKurus: null,
            unlimited: false,
            sortOrder: index,
          }),
        );
      }
    } else {
      const invalid = parties.some(
        (party) => !Number.isInteger(party.shareWeight) || (party.shareWeight as number) < 1 || (party.shareWeight as number) > CLAIM_LIABILITY_MAX_WEIGHT,
      );
      if (invalid) errors.push({ code: 'SHARE_INPUT_INVALID' });
      else {
        resolved.forEach(({ draft: party, debtorId }, index) =>
          views.push({ caseDebtorId: party.caseDebtorId, debtorId, shareWeight: party.shareWeight as number, limitKurus: null, unlimited: false, sortOrder: index }),
        );
      }
    }
  } else {
    // CAPPED
    if (anyShare && !anyLimit) errors.push({ code: 'FIELD_NOT_ALLOWED_FOR_MODE' });
    let limitError = false;
    for (const party of parties) {
      const unlimited = party.unlimited === true;
      const limited = hasValue(party.limitAmount);
      if (unlimited && limited) {
        errors.push({ code: 'LIMIT_AND_UNLIMITED_CONFLICT', caseDebtorId: party.caseDebtorId });
        limitError = true;
      } else if (!unlimited) {
        let kurus = 0n;
        try {
          kurus = limited ? toKurus(party.limitAmount as string | number) : 0n;
        } catch {
          kurus = 0n;
        }
        if (kurus <= 0n) {
          errors.push({ code: 'LIMIT_INVALID', caseDebtorId: party.caseDebtorId });
          limitError = true;
        }
      }
    }
    if (parties.length > 0 && parties.every((party) => party.unlimited === true)) {
      errors.push({ code: 'ALL_PARTIES_UNLIMITED' });
      limitError = true;
    }
    if (!limitError) {
      resolved.forEach(({ draft: party, debtorId }, index) =>
        views.push({
          caseDebtorId: party.caseDebtorId,
          debtorId,
          shareWeight: null,
          limitKurus: party.unlimited === true ? null : toKurus(party.limitAmount as string | number),
          unlimited: party.unlimited === true,
          sortOrder: index,
        }),
      );
    }
  }

  if (errors.length > 0) return { selection: null, errors };
  return {
    selection: {
      claimItemId: draft.claimItemId,
      mode,
      limitScope: mode === 'CAPPED' ? CLAIM_LIABILITY_LIMIT_SCOPE : null,
      basis,
      basisNote,
      basisDocumentId,
      parties: views,
    },
    errors,
  };
}
