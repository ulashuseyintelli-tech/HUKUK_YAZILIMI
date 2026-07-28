import { ConflictException } from '@nestjs/common';

/**
 * CLIENT-P2-U03-TRACK-B-I02 — DISCLOSURE SERVICE FOUNDATION AND INVARIANT ENFORCEMENT
 *
 * Canonical sözleşme: `CLIENT-GOVERNANCE-CHARTER.md` §35 (mimari) + §38 (I02 contract).
 * Bu dosya yalnız tip/sözleşme taşır; IO yoktur.
 *
 * SINIRLAR (§38.4):
 *   I02 SERVICE EXISTS       != DISCLOSURE IS CLIENT-VISIBLE
 *   DISCLOSURE RECORD EXISTS != DISCLOSURE MAY BE PUBLISHED
 *   CONTENT HASH EXISTS      != CONTENT IS APPROVED
 */

/** Snapshot canonical serialization sözleşmesinin sürümü (hash domain separator'ı). */
export const CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION =
  'ClientFinancialDisclosureSnapshotV1';

/** Kaynak-durumu parmak izi sözleşmesinin sürümü (TOCTOU yeniden-okuma karşılaştırması). */
export const CLIENT_FINANCIAL_DISCLOSURE_SOURCE_FINGERPRINT_CONTRACT_VERSION =
  'ClientFinancialDisclosureSourceFingerprintV1';

/** İlk versiyon numarası (§35.13 versiyonlama). */
export const CLIENT_FINANCIAL_DISCLOSURE_FIRST_VERSION = 1;

export const CLIENT_FINANCIAL_DISCLOSURE_ERROR_CODES = [
  'DISCLOSURE_TENANT_MISMATCH',
  'DISCLOSURE_CASE_CLIENT_MISMATCH',
  'DISCLOSURE_SOURCE_SCOPE_MISMATCH',
  'DISCLOSURE_SOURCE_NOT_FOUND',
  'DISCLOSURE_SOURCE_STATE_INVALID',
  'DISCLOSURE_RECONCILIATION_MISMATCH',
  'DISCLOSURE_DUPLICATE',
  'DISCLOSURE_VERSION_CONFLICT',
  'DISCLOSURE_IDEMPOTENCY_CONFLICT',
  'DISCLOSURE_HASH_MISMATCH',
  'DISCLOSURE_IMMUTABLE',
  'DISCLOSURE_CONCURRENT_MODIFICATION',
] as const;

export type ClientFinancialDisclosureErrorCode =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_ERROR_CODES)[number];

/**
 * Tiplenmiş domain hatası. Ham Prisma hatası, SQLSTATE veya stack trace ASLA
 * consumer'a sızdırılmaz; finansal payload hata gövdesine YAZILMAZ (§24).
 */
export class ClientFinancialDisclosureError extends ConflictException {
  constructor(readonly code: ClientFinancialDisclosureErrorCode) {
    super({
      statusCode: 409,
      error: 'Client Financial Disclosure Invariant Violation',
      code,
      message: disclosureMessage(code),
    });
    this.name = 'ClientFinancialDisclosureError';
  }
}

/** Snapshot hash payload'ına giren tek bir disclosure satırı (§35.4: type+amount KOPYALANIR). */
export interface DisclosureLineSnapshotV1 {
  readonly type: string;
  /** Decimal canonical string — locale-bağımsız (§35.16). */
  readonly amount: string;
  readonly sourceDispositionLineId: string;
  readonly sortOrder: number;
}

/**
 * Hash'lenen canonical finansal snapshot. Yaşam döngüsü damgaları, gönderim/yayın
 * alanları, `id`, `createdAt`/`updatedAt` ve içerik-onayı alanları BU PAYLOAD'A GİRMEZ
 * (§37.6: satır DB seviyesinde tam immutable değildir; hash yalnız finansal içeriği bağlar).
 */
export interface DisclosureSnapshotPayloadV1 {
  readonly contractVersion: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseClientId: string;
  readonly clientId: string;
  readonly collectionDispositionId: string;
  readonly version: number;
  readonly currency: string;
  readonly sourceCollectionId: string;
  readonly sourceCollectionAmount: string;
  readonly sourceCollectionDate: string;
  readonly dispositionTotalAmount: string;
  readonly dispositionPostedAt: string;
  readonly totalCollected: string;
  readonly clientNetAmount: string;
  readonly lines: readonly DisclosureLineSnapshotV1[];
}

/**
 * Kaynak durumunun parmak izi. Snapshot payload'ından AYRIDIR: versiyon numarası ve
 * türetilmiş tutarlar içermez, yalnız okunan kaynak kayıtların durumunu bağlar.
 * TOCTOU yeniden-okumasında karşılaştırılır (§22).
 */
export interface DisclosureSourceFingerprintPayloadV1 {
  readonly contractVersion: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseClientId: string;
  readonly clientId: string;
  readonly dispositionId: string;
  readonly dispositionStatus: string;
  readonly dispositionBeneficiaryScope: string;
  readonly dispositionTotalAmount: string;
  readonly dispositionCurrency: string;
  readonly dispositionPostedAt: string;
  readonly collectionId: string;
  readonly collectionStatus: string;
  readonly collectionAmount: string;
  readonly collectionCurrency: string;
  readonly collectionDate: string;
  readonly lines: readonly DisclosureLineSnapshotV1[];
}

export interface CreateDisclosureVersionInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseClientId: string;
  readonly collectionDispositionId: string;
  /**
   * Tenant-scoped gönderim idempotency anahtarı (§35.12 `@@unique([tenantId, sendIdempotencyKey])`).
   * Caller versiyon numarası VEREMEZ — sequence transaction içinde hesaplanır (§19).
   */
  readonly sendIdempotencyKey: string;
}

export interface CreateDisclosureVersionResult {
  readonly disclosureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly snapshotHash: string;
  readonly sourceFingerprint: string;
  /** Aynı dispozisyon + aynı kaynak durumu için canonical mevcut sonuç döndürüldü. */
  readonly replayed: boolean;
}

export type DisclosureIntegrityVerdict = 'MATCH' | 'MISMATCH';

export interface VerifyDisclosureSnapshotResult {
  readonly verdict: DisclosureIntegrityVerdict;
  readonly versionId: string;
  readonly expectedSnapshotHash: string;
  readonly recomputedSnapshotHash: string;
}

function disclosureMessage(code: ClientFinancialDisclosureErrorCode): string {
  const messages: Record<ClientFinancialDisclosureErrorCode, string> = {
    DISCLOSURE_TENANT_MISMATCH: 'Disclosure tenant binding is inconsistent.',
    DISCLOSURE_CASE_CLIENT_MISMATCH:
      'Case client does not belong to the requested case within the tenant.',
    DISCLOSURE_SOURCE_SCOPE_MISMATCH:
      'Source disposition scope is outside the authorised V1 disclosure scope.',
    DISCLOSURE_SOURCE_NOT_FOUND: 'Authorised disclosure source was not found in the tenant scope.',
    DISCLOSURE_SOURCE_STATE_INVALID:
      'Authorised disclosure source is not in a state that may produce a disclosure.',
    DISCLOSURE_RECONCILIATION_MISMATCH:
      'Disclosure line reconciliation failed; no tolerance is permitted.',
    DISCLOSURE_DUPLICATE: 'A disclosure already exists for this source disposition.',
    DISCLOSURE_VERSION_CONFLICT: 'Concurrent disclosure version creation was rejected.',
    DISCLOSURE_IDEMPOTENCY_CONFLICT:
      'Idempotency key was already used with a different disclosure payload.',
    DISCLOSURE_HASH_MISMATCH: 'Persisted disclosure snapshot failed hash re-verification.',
    DISCLOSURE_IMMUTABLE: 'Disclosure version is immutable in its current lifecycle state.',
    DISCLOSURE_CONCURRENT_MODIFICATION:
      'Disclosure source changed while the snapshot was being prepared.',
  };
  return messages[code];
}
