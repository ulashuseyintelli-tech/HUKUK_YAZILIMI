/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — Authority Snapshot kontratı.
 *
 * ## Neden var
 *
 * CPE gate kararı (Phase 1 / TX-0) ile `UyapOperation` evidence commit'i (TX-1) arasında
 * bir zaman penceresi vardır. Bu pencerede POA azledilebilir, avukat pasifleştirilebilir,
 * dosya kapatılabilir/arşivlenebilir, masraf bloğu açılabilir veya UYAP erişilebilirliği
 * kapatılabilir. Phase 1'in "allowed" sonucu bu değişiklikleri GÖREMEZ.
 *
 * Canonical kural:
 *
 * ```text
 * PHASE 1 allowed  ≠  TX-1 COMMIT AUTHORITY
 * ```
 *
 * Snapshot, Phase 1'de okunan bütün mutable authority kaynaklarının **deterministik,
 * server-side üretilmiş, PII taşımayan** özetidir. TX-1 içinde aynı kaynaklar yeniden
 * okunur ve digest karşılaştırılır.
 *
 * ## PII sınırı
 *
 * POA belge içeriği, `note`/`scopeDescription`/`resolutionNote` gibi serbest metinler,
 * kimlik numaraları ve müvekkil kişisel verileri snapshot'a **KOPYALANMAZ**
 * (`UYAP-CONST-007`). Yalnız kimlik (id) + yürürlük göstergeleri taşınır.
 *
 * ## Güven sınırı
 *
 * Snapshot **yalnız server-side üretilir**. İstemciden gelen bir snapshot veya digest
 * hiçbir koşulda kabul edilmez (FR-05/FR-06) — bu tipin hiçbir alanı request body'den
 * doldurulmaz ve HTTP yüzeyine çıkmaz.
 */

import { AuthorityEvidenceRef } from './uyap-send-authority.types';

/** Snapshot sözleşmesinin sürümü. Digest'in ilk bileşenidir (domain separation). */
export const UYAP_AUTHORITY_SNAPSHOT_VERSION = 'UYAP-AUTHORITY-SNAPSHOT/v1';

/** Digest'in domain separator'ı — başka bir alanın hash'i ile karıştırılamaz. */
export const UYAP_AUTHORITY_DIGEST_DOMAIN = 'UYAP-AUTHORITY-SNAPSHOT/v1';

/**
 * Tazelik ihlali sınıfları. Dış yanıt GENERIC kalır; bu kodlar yalnız
 * decision-log/evidence ve internal telemetri içindir.
 */
export type UyapAuthorityFreshnessFailureCode =
  /** Revalidation çalıştı, yetki hâlâ geçerli, ama snapshot ile kaynak DEĞİŞMİŞ. */
  | 'AUTHORITY_CONTEXT_STALE'
  /** Revalidation çalıştı ve yetki ARTIK GEÇERSİZ (POA azledildi, dosya kapandı, ...). */
  | 'AUTHORITY_REVALIDATION_FAILED'
  /** Operasyonel erişilebilirlik sinyali değişti veya yapılandırması kalktı. */
  | 'SYSTEM_AVAILABILITY_STALE'
  /** Aynı idempotency key materyal olarak farklı bir istekle yeniden kullanıldı. */
  | 'IDEMPOTENCY_CONFLICT';

/** Değişimin HANGİ kaynaktan geldiğini gösteren internal kanıt etiketi. */
export type UyapAuthorityChangedSource =
  | 'POA_CHANGED'
  | 'POA_LAWYER_RELATION_CHANGED'
  | 'CASE_STATE_CHANGED'
  | 'CASE_CLIENT_SET_CHANGED'
  | 'ACTING_LAWYER_CHANGED'
  | 'EXPENSE_STATE_CHANGED'
  | 'SYSTEM_AVAILABILITY_CHANGED'
  | 'AUTHORITY_EVIDENCE_CHANGED';

/** Dosya durumu — yalnız yetkiye etki eden alanlar. */
export interface CaseStateEvidence {
  readonly caseId: string;
  readonly tenantId: string;
  readonly caseStatus: string;
  readonly isArchived: boolean;
  readonly allowUyapActions: boolean;
  /** Optimistic sürüm göstergesi (`Case.updatedAt`). */
  readonly caseUpdatedAt: Date;
}

/** Acting lawyer — I01 tarafından server-side çözülür. */
export interface ActingLawyerEvidence {
  readonly actingLawyerId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly isActive: boolean;
  readonly lawyerUpdatedAt: Date;
}

/**
 * Masraf bloğu kanıtı. `ExpenseBlockReason` şemada `updatedAt` TAŞIMAZ; bu nedenle
 * karşılaştırma SEMANTİK alanlar üzerinden yapılır (owner §14: schema deltası
 * gerekmiyorsa eklenmez).
 */
export interface ExpenseBlockEvidence {
  readonly blockReasonId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly blockedActionCode: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly cancelledAt: Date | null;
}

/**
 * Operasyonel erişilebilirlik. Bu bir veritabanı satırı DEĞİLDİR (env sinyali), bu
 * yüzden snapshot'ta açık olarak taşınır ve TX-1 başında yeniden okunur.
 */
export interface SystemAvailabilityEvidence {
  readonly explicitlyConfigured: boolean;
  readonly available: boolean;
}

/**
 * Immutable authority snapshot. Alan sırası digest'i ETKİLEMEZ (canonical serialization),
 * ancak koleksiyonların sırası ANLAMLIDIR ve canonical ASC olarak üretilir:
 * `clientId ASC` · `poaId ASC` · `poaLawyerId ASC` · `expenseBlockReasonId ASC`.
 */
export interface UyapAuthoritySnapshot {
  readonly snapshotVersion: string;
  readonly evaluatedAt: Date;

  readonly tenantId: string;
  readonly authenticatedUserId: string;
  readonly actionCode: string;

  readonly actingLawyer: ActingLawyerEvidence;
  readonly caseState: CaseStateEvidence;
  /** `clientId` ASC. */
  readonly clientIds: readonly string[];
  /** `poaId` ASC (resolver'ın ürettiği deterministik set). */
  readonly authorityEvidence: readonly AuthorityEvidenceRef[];
  /** `blockReasonId` ASC. */
  readonly expenseBlocks: readonly ExpenseBlockEvidence[];
  readonly systemAvailability: SystemAvailabilityEvidence;

  readonly authorityVersion: string;
  /** Domain-separated sha256 (hex) — tenant/action/actor/case bound. */
  readonly authorityDigest: string;
}

/** Snapshot üretimi başarısız olduğunda dönen yapısal sonuç (exception fırlatılmaz). */
export interface UyapAuthoritySnapshotFailure {
  readonly ok: false;
  /** I03/I01 failure kodu veya tazelik kodu. */
  readonly failureCode: string;
}

export interface UyapAuthoritySnapshotSuccess {
  readonly ok: true;
  readonly snapshot: UyapAuthoritySnapshot;
}

export type UyapAuthoritySnapshotResult =
  | UyapAuthoritySnapshotSuccess
  | UyapAuthoritySnapshotFailure;

/** Snapshot üretimi için server-authoritative bağlam. İstemci alanı KABUL ETMEZ. */
export interface UyapAuthoritySnapshotContext {
  readonly tenantId: string;
  readonly authenticatedUserId: string;
  readonly caseId: string;
  readonly actionCode: string;
  /** Phase 1'de CPE ile AYNI an; TX-1'de commit anı (yeni blok görülebilsin diye). */
  readonly evaluatedAt: Date;
}

/**
 * Revalidation sonucu. `fresh: true` yalnız hem yetki hâlâ geçerli hem digest AYNI ise.
 */
export type UyapAuthorityRevalidationResult =
  | { readonly fresh: true; readonly snapshot: UyapAuthoritySnapshot }
  | {
      readonly fresh: false;
      readonly failureCode: UyapAuthorityFreshnessFailureCode;
      /** Hangi kaynakların değiştiği — internal evidence, dış yanıta ÇIKMAZ. */
      readonly changedSources: readonly UyapAuthorityChangedSource[];
      /** I03/I01 red kodu (yalnız `AUTHORITY_REVALIDATION_FAILED` halinde). */
      readonly revalidationFailureCode?: string;
    };
