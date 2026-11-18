import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import type { ClaimItemOperation } from './claim-item-approval.constants';

/**
 * YÜKSEK ETKİLİ KALEM DEĞİŞİKLİĞİ ONAYINDA BAYATLIK KAPSAMI (owner talimatı 2026-11-18).
 *
 * Kural değişmedi: talep açıldıktan sonra kalem değiştiyse onay UYGULANMAZ ("stale-state conflict"). Tek ve dar istisna:
 * faiz / vekâlet ücreti kaynağı / açıklayıcı alan talebi beklerken AYNI kalemde ONAYLI bir borçlu sorumluluğu seçimi
 * uygulanmışsa ve kalemde değişen alanlar YALNIZ o seçimin yazdığı iki izdüşüm alanıysa talep bayat sayılmaz. Bu iki
 * değişiklik birbirinden bağımsızdır: seçim kalemin tutarına ve tahsilatına bakar (kendi durum özetiyle korunur), faiz
 * beyanı borçlu sorumluluğuna bakmaz.
 *
 * İstisna KÖRLEMESİNE daraltma DEĞİLDİR; aşağıdakilerin HEPSİ bugünkü gibi bayatlıktır:
 *  - ortak veri değişti (tutar, tahsil edilen, tür, para birimi, durum, vade),
 *  - talebin kendi alan grubu değişti (faiz alanları, vekâlet ücreti kaynağı, açıklayıcı alanlar),
 *  - sorumluluk alanları ONAYLI seçim dışında bir yoldan değişti,
 *  - seçimle birlikte ya da ondan önce / sonra kaleme BAŞKA bir yazım yapıldı — görüntüde olmayan alan olsa bile
 *    (çağıran bunu denetim kaydındaki tam satır özetleri zinciriyle doğrular),
 *  - neyin değiştiği GÖRÜLEMİYOR (yalnız `updatedAt` değişmiş) ve zincir bunu onaylı seçimlere bağlayamıyor,
 *  - talep ortak veriye ya da sorumluluk alanlarına dokunuyor, kalemi siliyor ya da tanınmayan alan taşıyor.
 *
 * <remarks>
 * Cagrildigi yerler:
 * - OfficeApprovalDomainSyncService.applyClaimItemUpdateOrDelete() → onay kararı transaction'ı (dosya kilidi altında)
 * </remarks>
 */

/** Seçimin kaleme yazdığı iki izdüşüm alanı (mevcut okuyucular için). */
export const CLAIM_ITEM_LIABILITY_PROJECTION_FIELDS = ['isAllDebtorsLiable', 'liableDebtorIds'] as const;

/** Sorumluluktan BAĞIMSIZ talep alanları: faiz grubu, vekâlet ücreti kaynağı ve açıklayıcı alanlar. */
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
  'description',
  'referenceNo',
  'sortOrder',
] as const;

const VERSION_FIELD = 'updatedAt';

export type ClaimItemApprovalStalenessReason =
  /** Karşılaştırılacak görüntü / özet yok (eski kayıt biçimi): denetim yapılmaz — mevcut davranış. */
  | 'NO_BASELINE'
  | 'UNCHANGED'
  /** Yalnız talepten sonra onaylanmış sorumluluk seçiminin yazdığı alanlar değişmiş: talep geçerli. */
  | 'ONLY_APPROVED_LIABILITY_SELECTION_APPLIED'
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
   * Çağıranın KAYITTAN doğruladığı olgu: talep açıldıktan sonra bu kaleme YALNIZ onaylı sorumluluk seçimi yazdı (denetim
   * kaydındaki tam satır özetleri zinciri; görüntüde olmayan alanlar dahil başka hiçbir yazım yok). Doğrulanamıyorsa `false`.
   */
  readonly liabilityChangeFromApprovedSelection: boolean;
}

/**
 * Değişen alanlar yalnız iki izdüşüm alanı ve / veya sürüm alanı mı? Yalnız bu durumda değişiklik onaylı sorumluluk
 * seçimiyle AÇIKLANABİLİR ve kayıt (zincir) doğrulamasına gidilir. Yalnız sürüm alanının değişmesi de buraya girer:
 * art arda uygulanan iki seçim izdüşümü başa döndürmüş olabilir. Zincir doğrulanamazsa (seçim kaydı yok ya da araya
 * başka yazım girmiş) talep bayat kalır.
 */
export function isExplainableByLiabilitySelection(changedFields: readonly string[]): boolean {
  const allowed = [...(CLAIM_ITEM_LIABILITY_PROJECTION_FIELDS as readonly string[]), VERSION_FIELD];
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

  // İzdüşüm ve sürüm alanı dışında bir alan değiştiyse: bayat. Aksi hâlde karar kayıt (zincir) doğrulamasınındır.
  if (!isExplainableByLiabilitySelection(changedFields)) return stale;
  if (!input.liabilityChangeFromApprovedSelection) return stale;

  return { stale: false, reason: 'ONLY_APPROVED_LIABILITY_SELECTION_APPLIED', changedFields };
}
