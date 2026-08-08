import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * CLIENT-P2-U03-TRACK-B-I04 — SEND, PUBLICATION AND REVERSAL RUNTIME
 *
 * Canonical sözleşme: `CLIENT-GOVERNANCE-CHARTER.md` §35.7 / §35.10 / §35.11 / §35.13.
 * Bu dosya yalnız tip/sözleşme taşır; IO yoktur.
 *
 * SINIRLAR:
 *   PROVIDER ACCEPTED != DELIVERED TO INBOX
 *   SENT              != PUBLISHED
 *   PUBLISHED         != EVERY CLIENT MAY VIEW   (I05 yetki projeksiyonu)
 */

/**
 * §35.10 ZORUNLU PRODUCTION INVARIANT'I: "Mock provider production yayınlamayı ASLA
 * yetkilendiremez." Yayınlama yalnız bu onaylı gerçek provider'larla mümkündür; `mock`,
 * boş değer veya listede olmayan herhangi bir değer fail-closed reddedilir. Sessiz mock
 * fallback'i Financial Disclosure gate'ini tatmin EDEMEZ.
 */
export const CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS = ['smtp', 'sendgrid', 'ses'] as const;

export type ClientFinancialDisclosureApprovedProvider =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS)[number];

/**
 * Provider kimligi EXACT eslesir. Case-folding veya whitespace normalizasyonu yapilmaz:
 * `EmailProviderService` de yalniz bu exact degerleri gercek adapter'a yonlendirir; yaklasik
 * eslesmenin composition'da kabul edilip altta mock fallback'e dusmesi engellenir.
 */
export function isClientFinancialDisclosureApprovedProvider(
  value: unknown,
): value is ClientFinancialDisclosureApprovedProvider {
  return (
    typeof value === 'string' &&
    (CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS as readonly string[]).includes(value)
  );
}

/** Gercek provider kabul kaniti, yapilandirilan exact provider ile ayni kimligi tasimalidir. */
export function isClientFinancialDisclosureApprovedDispatchReceipt(
  configuredProvider: unknown,
  reportedProvider: unknown,
): boolean {
  return (
    isClientFinancialDisclosureApprovedProvider(configuredProvider) &&
    reportedProvider === configuredProvider
  );
}

/** §35.11 (6): provider kabulü ve yayınlama olayları ayrı ayrı kaydedilir. */
export const CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY = 'ClientFinancialDisclosureVersion';
export const CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS = {
  SENT: 'CLIENT_FINANCIAL_DISCLOSURE_SENT',
  SEND_FAILED: 'CLIENT_FINANCIAL_DISCLOSURE_SEND_FAILED',
  PUBLISHED: 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED',
  REVERSED: 'CLIENT_FINANCIAL_DISCLOSURE_REVERSED',
  SUPERSEDED: 'CLIENT_FINANCIAL_DISCLOSURE_SUPERSEDED',
} as const;

/** 403 — yetkilendirme / production-hazırlık reddi. */
export const CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_AUTHORIZATION_ERROR_CODES = [
  'DISCLOSURE_PUBLICATION_NOT_ELIGIBLE',
  'DISCLOSURE_PUBLICATION_TENANT_MISMATCH',
  'DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION',
] as const;

/** 409 — yaşam döngüsü / bütünlük / gönderim kanıtı ihlali. */
export const CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_INVARIANT_ERROR_CODES = [
  'DISCLOSURE_PUBLICATION_VERSION_NOT_FOUND',
  'DISCLOSURE_PUBLICATION_STATUS_INVALID',
  'DISCLOSURE_PUBLICATION_VERSION_TERMINAL',
  'DISCLOSURE_PUBLICATION_STALE_SNAPSHOT',
  'DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH',
  'DISCLOSURE_PUBLICATION_RECIPIENT_CHANGED',
  'DISCLOSURE_PUBLICATION_RECIPIENT_MISSING',
  'DISCLOSURE_PUBLICATION_SEND_ALREADY_CLAIMED',
  'DISCLOSURE_PUBLICATION_SEND_PROOF_MISSING',
  'DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED',
  'DISCLOSURE_PUBLICATION_SUPERSESSION_INVALID',
  'DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION',
] as const;

export type ClientFinancialDisclosurePublicationAuthorizationErrorCode =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_AUTHORIZATION_ERROR_CODES)[number];

export type ClientFinancialDisclosurePublicationInvariantErrorCode =
  (typeof CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_INVARIANT_ERROR_CODES)[number];

export type ClientFinancialDisclosurePublicationErrorCode =
  | ClientFinancialDisclosurePublicationAuthorizationErrorCode
  | ClientFinancialDisclosurePublicationInvariantErrorCode;

/**
 * 403. Ham provider hatası, SQLSTATE, stack trace, finansal payload ve alıcı e-postası
 * ASLA hata gövdesine YAZILMAZ (§35.14).
 */
export class ClientFinancialDisclosurePublicationAuthorizationError extends ForbiddenException {
  constructor(readonly code: ClientFinancialDisclosurePublicationAuthorizationErrorCode) {
    super({
      statusCode: 403,
      error: 'Client Financial Disclosure Publication Authorization Denied',
      code,
      message: publicationMessage(code),
    });
    this.name = 'ClientFinancialDisclosurePublicationAuthorizationError';
  }
}

/** 409. Sızıntı sınırı yukarıdakiyle aynıdır. */
export class ClientFinancialDisclosurePublicationError extends ConflictException {
  constructor(readonly code: ClientFinancialDisclosurePublicationInvariantErrorCode) {
    super({
      statusCode: 409,
      error: 'Client Financial Disclosure Publication Invariant Violation',
      code,
      message: publicationMessage(code),
    });
    this.name = 'ClientFinancialDisclosurePublicationError';
  }
}

/** Provider sonucu — repository'nin `EmailResult` şekliyle yapısal olarak uyumludur. */
export interface DisclosureDispatchResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly provider: string;
  /**
   * CLIENT-FD-ACT-R01-I04 — OPSIYONEL basarisizlik siniflandirmasi (geriye donuk uyumlu).
   * `true`  : gecici hata, ayni versiyon icin `retrySend()` anlamlidir.
   * `false` : kalici hata, yeniden deneme AYNI sonucu verir (alici gecersiz, kimlik reddi vb.).
   * `undefined`: siniflandirma yok (eski adaptorler). Publication state machine bu alani
   * TUKETMEZ — kalici durum yine `SEND_FAILED`'dir; alan operatore ve teleme tri icindir.
   */
  readonly retryable?: boolean;
}

/**
 * Gönderim portu (hexagonal sınır). Dormant servis Nest'in `EmailProviderService`'ine
 * DOĞRUDAN bağlanmaz; ileride owner-gated bir adaptör bu portu sağlar. `providerName`
 * §35.10 production guard'ı için ZORUNLUDUR.
 */
export interface DisclosureNotificationDispatcher {
  readonly providerName: string;
  send(input: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
  }): Promise<DisclosureDispatchResult>;
}

export interface BeginDisclosureSendInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly actorUserId: string;
}

export interface DispatchDisclosureInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly actorUserId: string;
}

export interface RetryDisclosureSendInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly actorUserId: string;
}

export interface ReverseDisclosureInput {
  readonly tenantId: string;
  readonly disclosureVersionId: string;
  readonly actorUserId: string;
  /** §35.14 izinli client-safe alan. */
  readonly correctionReason: string;
}

export interface SupersedeDisclosureInput {
  readonly tenantId: string;
  /** Yayınlanmış, yerine geçilecek versiyon. */
  readonly supersededVersionId: string;
  /** Yeni, içerik onayı tamamlanmış versiyon. */
  readonly supersedingVersionId: string;
  readonly actorUserId: string;
  readonly correctionReason: string;
}

export interface DisclosurePublicationTransitionResult {
  readonly disclosureVersionId: string;
  readonly previousStatus: string;
  readonly status: string;
  readonly replayed: boolean;
  /** Yalnız başarılı gönderimde dolu — §35.10 kalıcı provider kanıtı. */
  readonly providerMessageId?: string;
  /** Gönderim başarısızsa provider'ın KOD'u (detay client'a ASLA gitmez). */
  readonly sendFailureCode?: string;
}

function publicationMessage(code: ClientFinancialDisclosurePublicationErrorCode): string {
  const messages: Record<ClientFinancialDisclosurePublicationErrorCode, string> = {
    DISCLOSURE_PUBLICATION_NOT_ELIGIBLE:
      'Actor is not eligible to send or publish a client financial disclosure.',
    DISCLOSURE_PUBLICATION_TENANT_MISMATCH:
      'Publication actor is outside the disclosure tenant scope.',
    DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION:
      'Configured notification provider is not an approved production provider.',
    DISCLOSURE_PUBLICATION_VERSION_NOT_FOUND:
      'Disclosure version was not found in the requested tenant scope.',
    DISCLOSURE_PUBLICATION_STATUS_INVALID:
      'Disclosure version is not in the exact lifecycle state this transition requires.',
    DISCLOSURE_PUBLICATION_VERSION_TERMINAL:
      'Disclosure version is superseded, cancelled or reversed and may not be published.',
    DISCLOSURE_PUBLICATION_STALE_SNAPSHOT:
      'Disclosure snapshot changed after approval; publication is refused.',
    DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH:
      'Persisted notification content failed hash re-verification.',
    DISCLOSURE_PUBLICATION_RECIPIENT_CHANGED:
      'Approved recipient binding changed after approval; publication is refused.',
    DISCLOSURE_PUBLICATION_RECIPIENT_MISSING:
      'Approved recipient binding is absent; nothing may be dispatched.',
    DISCLOSURE_PUBLICATION_SEND_ALREADY_CLAIMED:
      'Another dispatcher already claimed the send for this disclosure version.',
    DISCLOSURE_PUBLICATION_SEND_PROOF_MISSING:
      'Publication requires a persistent provider message id; none is present.',
    DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED:
      'Disclosure version is already published; a second publication is refused.',
    DISCLOSURE_PUBLICATION_SUPERSESSION_INVALID:
      'Supersession pair is not a valid published-to-approved succession within one disclosure.',
    DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION:
      'A concurrent lifecycle transition already advanced this disclosure version.',
  };
  return messages[code];
}
