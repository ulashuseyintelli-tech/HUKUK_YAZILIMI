import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * CLIENT-P2-U03-TRACK-B-I05 — CLIENT AUTHORIZATION PROJECTION AND READ API
 *
 * Canonical sözleşme: `CLIENT-GOVERNANCE-CHARTER.md` §35.7 (yalnız `PUBLISHED` client-görünür)
 * ve §35.14 (izinli/yasak alan kümesi, iki AYRI yüzey). Bu dosya yalnız tip taşır; IO yoktur.
 *
 * SINIRLAR:
 *   PUBLISHED                 != EVERY CLIENT MAY VIEW
 *   CLIENT-VISIBLE DATA        = ONLY SERVER-AUTHORIZED PROJECTION
 *   PROJECTION EXISTS         != PROJECTION IS ROUTED   (HTTP yüzeyi I06)
 */

/**
 * §35.14 İZİNLİ client alanları. Bu dizi projeksiyonun TEK kaynağıdır: `assertProjectionShape`
 * ve test suite'i bunu kullanır, dolayısıyla yeni bir alan sessizce sızamaz.
 */
export const CLIENT_DISCLOSURE_ALLOWED_FIELDS = [
  'disclosureId',
  'version',
  'currency',
  'totalCollected',
  'clientNetAmount',
  'lines',
  'approvedAt',
  'notifiedAt',
  'publishedAt',
  'isCurrentEffective',
  'supersedesDisclosureId',
  'supersededByDisclosureId',
  'isReversed',
  'correctionReason',
  'remittanceStatus',
] as const;

/** §35.14 İZİNLİ satır alanları — kaynak satır kimliği ve sıralama anahtarı DIŞARIDA. */
export const CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS = ['type', 'amount'] as const;

/**
 * §35.14 YASAK alanlar — projeksiyon çıktısında bu anahtarlar ASLA bulunmaz. Test suite'i
 * çıktıyı bu listeye karşı tarar (whitelist + blacklist birlikte).
 */
export const CLIENT_DISCLOSURE_FORBIDDEN_FIELDS = [
  'officeApprovedById',
  'contentApprovedById',
  'officeApprovalRequestId',
  'decisionNote',
  'sendFailureDetail',
  'sendFailureCode',
  'sendIdempotencyKey',
  'snapshotHash',
  'sourceFingerprint',
  'notificationContentHash',
  'notificationContent',
  'approvedRecipientEmail',
  'approvedRecipientPortalUserId',
  'providerMessageId',
  'providerAcceptedAt',
  'sourceCollectionId',
  'collectionDispositionId',
  'sourceDispositionLineId',
  'caseClientId',
  'tenantId',
  'clientId',
  'status',
  'sortOrder',
] as const;

/**
 * §35.14 "kanıt-desteklenen remittance durumu". Yayınlanmış bir disclosure için client'a
 * gösterilebilecek TEK durum kümesi; internal workflow durumları (DRAFT, *_PENDING, SEND_*)
 * client'a ASLA sızmaz.
 */
export type ClientDisclosureRemittanceStatus = 'PUBLISHED' | 'CORRECTED' | 'REVERSED';

export const CLIENT_DISCLOSURE_PROJECTION_ERROR_CODES = [
  'DISCLOSURE_PROJECTION_PORTAL_USER_INACTIVE',
  'DISCLOSURE_PROJECTION_OUT_OF_SCOPE',
  'DISCLOSURE_PROJECTION_NOT_PUBLISHED',
] as const;

export type ClientDisclosureProjectionErrorCode =
  (typeof CLIENT_DISCLOSURE_PROJECTION_ERROR_CODES)[number];

/**
 * Yetki reddi (403). Kapsam dışı bir kaydın VARLIĞI bile sızdırılmaz: bulunmayan ve
 * yetkisiz durumlar `DISCLOSURE_PROJECTION_OUT_OF_SCOPE` ile AYNI cevabı üretir.
 */
export class ClientDisclosureProjectionForbiddenError extends ForbiddenException {
  constructor(readonly code: ClientDisclosureProjectionErrorCode) {
    super({
      statusCode: 403,
      error: 'Client Financial Disclosure Projection Denied',
      code,
      message: 'Requested financial disclosure is not available for this portal user.',
    });
    this.name = 'ClientDisclosureProjectionForbiddenError';
  }
}

/** Yayınlanmamış veya var olmayan kayıt — 404, ayrım YAPILMADAN. */
export class ClientDisclosureProjectionNotFoundError extends NotFoundException {
  constructor(readonly code: ClientDisclosureProjectionErrorCode) {
    super({
      statusCode: 404,
      error: 'Client Financial Disclosure Not Available',
      code,
      message: 'Requested financial disclosure is not available for this portal user.',
    });
    this.name = 'ClientDisclosureProjectionNotFoundError';
  }
}

/** §35.14 curated satır — yalnız `type` + canonical string `amount`. */
export interface ClientDisclosureLineProjection {
  readonly type: string;
  /** Locale-bağımsız canonical Decimal string; `toFixed()` KULLANILMAZ (repo lint kuralı). */
  readonly amount: string;
}

export interface ClientDisclosureProjection {
  /** §35.14: opaque disclosure ID — ham ledger/kaynak kimliği DEĞİL. */
  readonly disclosureId: string;
  readonly version: number;
  readonly currency: string;
  readonly totalCollected: string;
  readonly clientNetAmount: string;
  readonly lines: readonly ClientDisclosureLineProjection[];
  readonly approvedAt: string | null;
  readonly notifiedAt: string | null;
  readonly publishedAt: string | null;
  readonly isCurrentEffective: boolean;
  readonly supersedesDisclosureId: string | null;
  readonly supersededByDisclosureId: string | null;
  readonly isReversed: boolean;
  readonly correctionReason: string | null;
  readonly remittanceStatus: ClientDisclosureRemittanceStatus;
}

/**
 * §35.14 OWNER KARARI: varsayılan yüzey current-effective disclosure'ı gösterir; düzeltme /
 * reversal geçmişi AYRI bir "Bildirim Geçmişi" yüzeyinde sunulur — tek, birleşik bir liste
 * DEĞİL. Bu ayrım tip düzeyinde zorlanır.
 */
export interface ClientDisclosureCurrentSurface {
  readonly surface: 'CURRENT';
  readonly items: readonly ClientDisclosureProjection[];
}

export interface ClientDisclosureHistorySurface {
  readonly surface: 'HISTORY';
  readonly items: readonly ClientDisclosureProjection[];
}

export interface ClientDisclosureReadScope {
  readonly tenantId: string;
  readonly portalUserId: string;
  /** Verilirse yüzey tek bir dosyaya daraltılır; yine de client scope'u ile kesişir. */
  readonly caseId?: string;
}
