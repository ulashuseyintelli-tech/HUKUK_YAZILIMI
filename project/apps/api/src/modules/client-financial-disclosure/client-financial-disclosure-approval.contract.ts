import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * CLIENT-P2-U03-TRACK-B-I03 — APPROVAL WORKFLOW AND INTEGRITY GATES
 *
 * Canonical sözleşme: `CLIENT-GOVERNANCE-CHARTER.md` §35 (mimari) + §41 (owner approval
 * policy kararları, PR #1761 ile ratifiye). Bu dosya yalnız tip/sözleşme taşır; IO yoktur.
 *
 * SINIRLAR (§41.9):
 *   POLICY RATIFIED   != POLICY IMPLEMENTED
 *   APPROVAL ELIGIBLE != APPROVAL GRANTED
 *   APPROVED          != PUBLISHED
 */

/** Ofis onay talebinin `savedIntent` sözleşmesinin sürümü (payloadHash domain'i). */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION =
  'ClientFinancialDisclosureApprovalIntentV1';

/** Bildirim içeriği canonical hash sözleşmesinin sürümü (§35.9 içerik bağlaması). */
export const CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION =
  'ClientFinancialDisclosureNotificationContentV1';

/**
 * §41.2 KARAR 5 — ofis onayı `OfficeApprovalRequest` substrate'i üzerinden yürür.
 * Değer `ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE` ile BİREBİR aynı olmalıdır;
 * dormant servis policy-engine'e bağımlı olmasın diye burada sabit olarak tutulur ve
 * `client-financial-disclosure-approval.policy.ts` içindeki compile-time eşitlik
 * kontrolü ikisinin ayrışmasını engeller.
 */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE =
  'CLIENT_FINANCIAL_DISCLOSURE_APPROVE' as const;

/** `OfficeApprovalRequest.targetType` — hedef, disclosure aggregate'i değil VERSİYONUDUR (§35.8). */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE =
  'ClientFinancialDisclosureVersion';

/** 403 — yetkilendirme reddi (§41.2 KARAR 1/2/3/4). */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_AUTHORIZATION_ERROR_CODES = [
  'DISCLOSURE_APPROVAL_NOT_ELIGIBLE',
  'DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN',
  'DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION',
  'DISCLOSURE_APPROVAL_TENANT_MISMATCH',
] as const;

/** 409 — yaşam döngüsü / bütünlük ihlali (§41.4/§41.5). */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INVARIANT_ERROR_CODES = [
  'DISCLOSURE_APPROVAL_VERSION_NOT_FOUND',
  'DISCLOSURE_APPROVAL_STATUS_INVALID',
  'DISCLOSURE_APPROVAL_VERSION_TERMINAL',
  'DISCLOSURE_APPROVAL_STALE_SNAPSHOT',
  'DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND',
  'DISCLOSURE_APPROVAL_REQUEST_MISMATCH',
  'DISCLOSURE_APPROVAL_REQUEST_CONSUMED',
  'DISCLOSURE_APPROVAL_CONTENT_REQUIRED',
  'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH',
  'DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION',
] as const;

export type ClientFinancialDisclosureApprovalAuthorizationErrorCode =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_AUTHORIZATION_ERROR_CODES)[number];

export type ClientFinancialDisclosureApprovalInvariantErrorCode =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INVARIANT_ERROR_CODES)[number];

export type ClientFinancialDisclosureApprovalErrorCode =
  | ClientFinancialDisclosureApprovalAuthorizationErrorCode
  | ClientFinancialDisclosureApprovalInvariantErrorCode;

/**
 * Yetkilendirme reddi (403). Ham Prisma hatası, SQLSTATE veya stack trace ASLA sızdırılmaz;
 * finansal payload, alıcı e-postası veya bildirim içeriği hata gövdesine YAZILMAZ.
 */
export class ClientFinancialDisclosureApprovalAuthorizationError extends ForbiddenException {
  constructor(readonly code: ClientFinancialDisclosureApprovalAuthorizationErrorCode) {
    super({
      statusCode: 403,
      error: 'Client Financial Disclosure Approval Authorization Denied',
      code,
      message: approvalMessage(code),
    });
    this.name = 'ClientFinancialDisclosureApprovalAuthorizationError';
  }
}

/** Yaşam döngüsü / bütünlük ihlali (409). Sızıntı sınırı yukarıdakiyle aynıdır. */
export class ClientFinancialDisclosureApprovalError extends ConflictException {
  constructor(readonly code: ClientFinancialDisclosureApprovalInvariantErrorCode) {
    super({
      statusCode: 409,
      error: 'Client Financial Disclosure Approval Invariant Violation',
      code,
      message: approvalMessage(code),
    });
    this.name = 'ClientFinancialDisclosureApprovalError';
  }
}

/**
 * §41.3 canonical rol eşlemesi için gereken MİNİMUM okuma şekli. Yeni role enum'u veya
 * paralel yetki modeli ÜRETİLMEZ — mevcut `User` + `Lawyer` alanları okunur.
 */
export interface DisclosureApproverCandidate {
  readonly id: string;
  readonly isActive: boolean;
  readonly tenantId: string | null;
  readonly lawyer: {
    readonly lawyerRank: string | null;
    readonly canApproveOfficeActions: boolean | null;
  } | null;
}

/** Ofis onay talebinin `savedIntent`i — finansal tutar TAŞIMAZ (§35.14 sızıntı sınırı). */
export interface DisclosureApprovalIntentV1 {
  readonly contractVersion: string;
  readonly tenantId: string;
  readonly disclosureId: string;
  readonly disclosureVersionId: string;
  readonly version: number;
  readonly snapshotHash: string;
}

/** §35.9 bildirim içeriği canonical hash payload'ı. */
export interface DisclosureNotificationContentPayloadV1 {
  readonly contractVersion: string;
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly snapshotHash: string;
  readonly notificationContent: string;
  readonly approvedRecipientEmail: string;
  readonly approvedRecipientPortalUserId: string | null;
}

export interface RequestOfficeApprovalInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly requesterUserId: string;
}

export interface CompleteOfficeApprovalInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly approvalRequestId: string;
  readonly approverUserId: string;
}

export interface RequestContentApprovalInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly requesterUserId: string;
  readonly approvedRecipientEmail: string;
  readonly approvedRecipientPortalUserId?: string | null;
}

export interface CompleteContentApprovalInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly contentApproverUserId: string;
}

export interface DisclosureApprovalTransitionResult {
  readonly disclosureVersionId: string;
  /** Geçiş öncesi canonical statü. */
  readonly previousStatus: string;
  /** Geçiş sonrası canonical statü. */
  readonly status: string;
  /** Bu çağrı canonical geçişi ÜRETTİ mi, yoksa mevcut canonical sonucu mu döndürdü. */
  readonly replayed: boolean;
  /** Yalnız ofis onayı adımlarında dolu. */
  readonly approvalRequestId?: string;
}

function approvalMessage(code: ClientFinancialDisclosureApprovalErrorCode): string {
  const messages: Record<ClientFinancialDisclosureApprovalErrorCode, string> = {
    DISCLOSURE_APPROVAL_NOT_ELIGIBLE:
      'Actor is not eligible to approve a client financial disclosure.',
    DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN:
      'The requester of a disclosure may not approve any of its approval stages.',
    DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION:
      'Office approver and content approver must be two distinct actors.',
    DISCLOSURE_APPROVAL_TENANT_MISMATCH: 'Approval actor is outside the disclosure tenant scope.',
    DISCLOSURE_APPROVAL_VERSION_NOT_FOUND:
      'Disclosure version was not found in the requested tenant scope.',
    DISCLOSURE_APPROVAL_STATUS_INVALID:
      'Disclosure version is not in the exact lifecycle state this transition requires.',
    DISCLOSURE_APPROVAL_VERSION_TERMINAL:
      'Disclosure version is superseded, cancelled or reversed and may not be approved.',
    DISCLOSURE_APPROVAL_STALE_SNAPSHOT:
      'Disclosure snapshot changed after the approval was requested; the approval is stale.',
    DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND: 'Office approval request was not found.',
    DISCLOSURE_APPROVAL_REQUEST_MISMATCH:
      'Office approval request does not belong to this disclosure version.',
    DISCLOSURE_APPROVAL_REQUEST_CONSUMED: 'Office approval request was already decided.',
    DISCLOSURE_APPROVAL_CONTENT_REQUIRED:
      'Notification content and approved recipient binding are required.',
    DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH:
      'Persisted notification content failed hash re-verification.',
    DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION:
      'A concurrent lifecycle transition already advanced this disclosure version.',
  };
  return messages[code];
}
