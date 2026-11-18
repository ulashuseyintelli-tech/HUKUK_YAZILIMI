import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import type { ClaimItemOperation } from './claim-item-approval.constants';

/**
 * YÜKSEK ETKİLİ KALEM DEĞİŞİKLİĞİ ONAYINDA BAYATLIK KAPSAMI (owner talimatı 2026-11-18).
 *
 * Kural değişmedi: talep açıldıktan sonra kalem değiştiyse onay UYGULANMAZ ("stale-state conflict"). Tek ve dar istisna,
 * talepten BAĞIMSIZ ve KAYITLI değişikliklerdir:
 *  - onaylı borçlu sorumluluğu seçiminin kaleme yazdığı iki izdüşüm alanı,
 *  - açıklayıcı alanlar (açıklama, referans no, sıra) — yalnız talep bu alanlara dokunmuyorsa.
 * Bu alanlar ne talebin değiştirdiği alanlardır ne de hesabın bağlı olduğu ortak veridir: seçim kalemin tutarına ve
 * tahsilatına bakar (kendi durum özetiyle korunur); faiz / vekâlet kaynağı beyanı borçlu sorumluluğuna ya da açıklamaya
 * bakmaz. İstisna, talep faiz / vekâlet ücreti kaynağı / açıklayıcı alanlar DIŞINDA bir alana dokunuyorsa uygulanmaz.
 *
 * İstisna KÖRLEMESİNE daraltma DEĞİLDİR; aşağıdakilerin HEPSİ bugünkü gibi bayatlıktır:
 *  - ortak veri değişti (tutar, tahsil edilen, tür, para birimi, durum, vade),
 *  - talebin kendi alanlarından biri değişti (faiz alanları, vekâlet ücreti kaynağı ya da talepteki açıklayıcı alan),
 *  - değişiklik KAYITSIZ yapıldı ya da araya başka bir yazım girdi — görüntüde olmayan alan olsa bile (çağıran bunu
 *    denetim kaydındaki tam satır özetleri zinciriyle doğrular; zincir kurulamıyorsa talep bayattır),
 *  - talep ortak veriye ya da sorumluluk alanlarına dokunuyor, kalemi siliyor ya da tanınmayan alan taşıyor.
 *
 * <remarks>
 * Cagrildigi yerler:
 * - OfficeApprovalDomainSyncService.applyClaimItemUpdateOrDelete() → onay kararı transaction'ı (dosya kilidi altında)
 * </remarks>
 */

/** Seçimin kaleme yazdığı iki izdüşüm alanı (mevcut okuyucular için). */
export const CLAIM_ITEM_LIABILITY_PROJECTION_FIELDS = ['isAllDebtorsLiable', 'liableDebtorIds'] as const;

/** Açıklayıcı (düşük etkili) alanlar: hesaba girmez. */
export const CLAIM_ITEM_DESCRIPTIVE_FIELDS = ['description', 'referenceNo', 'sortOrder'] as const;

/** Sorumluluktan ve ortak veriden BAĞIMSIZ talep alanları: faiz grubu, vekâlet ücreti kaynağı ve açıklayıcı alanlar. */
export const CLAIM_ITEM_LIABILITY_INDEPENDENT_PATCH_FIELDS = [
  'interestType',
  'interestTypeCode',
  'interestRate',
  'interestStartDate',
  'interestEndDate',
  'interestAccrualStatus',
  'interestStartDateProvenance',
  'noInterestReason',
  'noInterestConfirmedById',
  'attorneyFeeBasis',
  ...CLAIM_ITEM_DESCRIPTIVE_FIELDS,
] as const;

const VERSION_FIELD = 'updatedAt';

/**
 * Talepten bağımsız sayılabilecek değişiklik alanları: iki izdüşüm alanı + açıklayıcı alanlar. Çağıran, talep anındaki
 * satırı bu alanları (ve sürüm alanını) talep görüntüsündeki değerlere çevirerek yeniden kurar (zincir doğrulaması).
 */
export const CLAIM_ITEM_INDEPENDENT_CHANGE_FIELDS = [...CLAIM_ITEM_LIABILITY_PROJECTION_FIELDS, ...CLAIM_ITEM_DESCRIPTIVE_FIELDS] as const;

export type ClaimItemApprovalStalenessReason =
  /** Karşılaştırılacak görüntü / özet yok (eski kayıt biçimi): denetim yapılmaz — mevcut davranış. */
  | 'NO_BASELINE'
  | 'UNCHANGED'
  /** Yalnız talepten bağımsız, kayıtlı değişiklikler (onaylı seçim izdüşümü / açıklayıcı alan) yapılmış: talep geçerli. */
  | 'ONLY_INDEPENDENT_RECORDED_CHANGES'
  /** Kayıtlı görüntü kendi özetiyle tutmuyor. */
  | 'SNAPSHOT_INTEGRITY'
  | 'CHANGED';

export interface ClaimItemApprovalStaleness {
  readonly stale: boolean;
  readonly reason: ClaimItemApprovalStalenessReason;
  /** Talep görüntüsüne göre değişen alanlar (ad sırasıyla). */
  readonly changedFields: readonly string[];
}

export interface ClaimItemApprovalStalenessInput {
  readonly operation: ClaimItemOperation;
  readonly proposedPatch: Record<string, unknown>;
  /** Talep açılırken alınan kalem görüntüsü ve özeti (kayıtlı niyetten). */
  readonly requestSnapshot: Record<string, unknown> | null | undefined;
  readonly requestSnapshotHash: string | null | undefined;
  /** Kalemin şimdiki görüntüsü (aynı görüntü işleviyle). */
  readonly currentSnapshot: Record<string, unknown>;
  /**
   * Çağıranın KAYITTAN doğruladığı olgu: talep anındaki satırdan şimdiki satıra giden bütün yazımlar denetim kaydında
   * kesintisiz zincir oluşturuyor ve iki satır arasındaki fark yalnız bağımsız değişiklik alanlarında (görüntüde olmayan
   * alanlar dahil başka hiçbir fark yok). Doğrulanamıyorsa `false`.
   */
  readonly independentChangesVerifiedByRecord: boolean;
}

/**
 * Değişen alanlar yalnız bağımsız değişiklik alanları ve / veya sürüm alanı mı? Yalnız bu durumda değişiklik talepten
 * bağımsız OLABİLİR ve kayıt (zincir) doğrulamasına gidilir. Yalnız sürüm alanının değişmesi de buraya girer: art arda
 * yazımlar alanları başa döndürmüş olabilir. Zincir doğrulanamazsa talep bayat kalır.
 */
export function isExplainableByIndependentChange(changedFields: readonly string[]): boolean {
  const allowed = [...(CLAIM_ITEM_INDEPENDENT_CHANGE_FIELDS as readonly string[]), VERSION_FIELD];
  return changedFields.length > 0 && changedFields.every((field) => allowed.includes(field));
}

const sameValue = (a: unknown, b: unknown): boolean => stableJsonHash({ v: a ?? null }) === stableJsonHash({ v: b ?? null });

export function evaluateClaimItemApprovalStaleness(input: ClaimItemApprovalStalenessInput): ClaimItemApprovalStaleness {
  const { requestSnapshot, requestSnapshotHash, currentSnapshot } = input;
  if (!requestSnapshotHash) return { stale: false, reason: 'NO_BASELINE', changedFields: [] };
  if (!requestSnapshot) {
    // Yalnız özet kayıtlı: bütün görüntü özeti karşılaştırılır (alan düzeyi karar verilemez).
    const same = stableJsonHash(currentSnapshot) === requestSnapshotHash;
    return { stale: !same, reason: same ? 'UNCHANGED' : 'CHANGED', changedFields: [] };
  }
  if (stableJsonHash(requestSnapshot) !== requestSnapshotHash) {
    return { stale: true, reason: 'SNAPSHOT_INTEGRITY', changedFields: [] };
  }

  // Yalnız talep görüntüsünde bulunan alanlar karşılaştırılır (görüntüye sonradan eklenen alan eski talebi bayatlatmaz).
  const changedFields = Object.keys(requestSnapshot)
    .filter((field) => !sameValue(requestSnapshot[field], currentSnapshot[field]))
    .sort();
  if (changedFields.length === 0) return { stale: false, reason: 'UNCHANGED', changedFields };

  const stale: ClaimItemApprovalStaleness = { stale: true, reason: 'CHANGED', changedFields };
  if (input.operation !== 'UPDATE') return stale;

  const patchFields = Object.keys(input.proposedPatch ?? {});
  const independentPatch =
    patchFields.length > 0 &&
    patchFields.every((field) => (CLAIM_ITEM_LIABILITY_INDEPENDENT_PATCH_FIELDS as readonly string[]).includes(field));
  if (!independentPatch) return stale;

  // Bağımsız alanlar ve sürüm alanı dışında bir alan değiştiyse: bayat.
  if (!isExplainableByIndependentChange(changedFields)) return stale;
  // Talebin KENDİ alanı değiştiyse (ör. talep açıklamayı da değiştiriyor ve açıklama arada değişmiş): bayat.
  if (changedFields.some((field) => patchFields.includes(field))) return stale;
  // Aksi hâlde karar kayıt (zincir) doğrulamasınındır.
  if (!input.independentChangesVerifiedByRecord) return stale;

  return { stale: false, reason: 'ONLY_INDEPENDENT_RECORDED_CHANGES', changedFields };
}
