/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — writer command/result tipleri + branded idempotency key.
 *
 * `tebligat/service-occurrence` emsali: dormant internal writer; controller/DTO/HTTP semantiği YOK.
 *
 * IDEMPOTENCY KEY SINIRI (owner-ratified P-E5B):
 *   format  : "UYAP-OP/v1:" + server-generated UUID
 *   nitelik : opaque · versioned · PII içermez · raw payload hash DEĞİL · clientRequestId DEĞİL
 *
 * TypeScript sınırında zorlama (araştırma sorusu P-E5B-R0 §8): brand `unique symbol` ile
 * tanımlanır ve DIŞARI EXPORT EDİLMEZ. Modül dışındaki hiçbir kod bu marka ile bir string
 * üretemez; `string` tipli bir client DTO alanı `UyapOperationIdempotencyKey` bekleyen bir
 * parametreye ATANAMAZ (nominal typing). Anahtar yalnız iki yoldan elde edilir:
 *   1. `newUyapOperationIdempotencyKey()` — yeni logical create için üretir.
 *   2. `rehydrateUyapOperationIdempotencyKey(row)` — YALNIZ persist edilmiş bir operation
 *      satırından geri kazanır (keyfi string kabul etmez), böylece replay'de aynı key
 *      yeniden kullanılabilir ama client string'i "aklanamaz".
 */
import { createHash, randomUUID } from 'crypto';
import { UyapAttempt, UyapOperation } from '@prisma/client';
import { UyapOperationWriterValidationError } from './uyap-operation-writer.errors';

/** Marka taşıyıcısı — bilinçli olarak EXPORT EDİLMEZ (dışarıda forge edilemez). */
declare const UYAP_OPERATION_IDEMPOTENCY_KEY_BRAND: unique symbol;

/** Server-controlled, opaque idempotency key. Düz `string` bu tipe atanamaz. */
export type UyapOperationIdempotencyKey = string & {
  readonly [UYAP_OPERATION_IDEMPOTENCY_KEY_BRAND]: 'UYAP-OP/v1';
};

export const UYAP_OPERATION_IDEMPOTENCY_KEY_PREFIX = 'UYAP-OP/v1:';

/** Prefix + RFC-4122 UUID. */
const UYAP_OPERATION_IDEMPOTENCY_KEY_UUID_PATTERN =
  /^UYAP-OP\/v1:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** P05C-P04 (OPTION B): opaque HTTP retry-token'ının server-side canonical digest'i. */
const UYAP_OPERATION_IDEMPOTENCY_KEY_HTTP_PATTERN = /^UYAP-OP\/v1:HTTP:[0-9a-f]{64}$/;

/** Her iki kanonik biçim (UUID veya HTTP-digest) kabul edilir; başka hiçbir biçim kabul edilmez. */
const UYAP_OPERATION_IDEMPOTENCY_KEY_PATTERN = new RegExp(
  `(${UYAP_OPERATION_IDEMPOTENCY_KEY_UUID_PATTERN.source})|(${UYAP_OPERATION_IDEMPOTENCY_KEY_HTTP_PATTERN.source})`,
);

/** Yeni logical create için anahtar üretir. Aynı logical create'in replay'inde AYNI değer taşınmalıdır. */
export function newUyapOperationIdempotencyKey(): UyapOperationIdempotencyKey {
  return `${UYAP_OPERATION_IDEMPOTENCY_KEY_PREFIX}${randomUUID()}` as UyapOperationIdempotencyKey;
}

/** HTTP retry-token izinli aralığı: trim sonrası 8..200, yalnız görünür ASCII (whitespace/control yok). */
const HTTP_TOKEN_MIN_LEN = 8;
const HTTP_TOKEN_MAX_LEN = 200;
const HTTP_TOKEN_CHARSET = /^[\x21-\x7E]+$/;

/**
 * P05C-P04 (OPTION B + BOUNDED A): doğrulanmış opaque HTTP `Idempotency-Key` header'ından
 * versioned/branded, deterministik, sabit-uzunluklu key üretir.
 *
 * - `namespace`: tenant + action izolasyonu (ör. `<tenantId>:<action>`) — aynı token farklı
 *   tenant/action için FARKLI key üretir.
 * - Yalnız çevresel whitespace normalize edilir; case-sensitive (lowercase YOK).
 * - Trim sonrası boş / aralık-dışı / yasak-karakter reddedilir (typed hata; RAW TOKEN mesaja YAZILMAZ).
 * - `sha256(namespace + "\n" + normalizedToken)` — RAW TOKEN persist/log EDİLMEZ; payload hash'i
 *   DEĞİL, opaque retry-token'ının server-side canonicalizasyonudur. Secret/HMAC YOK.
 */
export function deriveUyapOperationIdempotencyKeyFromHttpToken(
  namespace: string,
  rawToken: string,
): UyapOperationIdempotencyKey {
  if (typeof namespace !== 'string' || !namespace.trim()) {
    throw new UyapOperationWriterValidationError('idempotency namespace zorunludur');
  }
  if (typeof rawToken !== 'string') {
    throw new UyapOperationWriterValidationError('Idempotency-Key header zorunludur');
  }
  const normalized = rawToken.trim();
  if (!normalized) {
    throw new UyapOperationWriterValidationError('Idempotency-Key boş olamaz');
  }
  if (normalized.length < HTTP_TOKEN_MIN_LEN || normalized.length > HTTP_TOKEN_MAX_LEN) {
    // RAW TOKEN mesaja yazılmaz; yalnız uzunluk sınırı bildirilir.
    throw new UyapOperationWriterValidationError(
      `Idempotency-Key uzunluğu ${HTTP_TOKEN_MIN_LEN}..${HTTP_TOKEN_MAX_LEN} olmalıdır`,
    );
  }
  if (!HTTP_TOKEN_CHARSET.test(normalized)) {
    throw new UyapOperationWriterValidationError('Idempotency-Key yalnız görünür ASCII içerebilir');
  }
  // newline ayraç: token charset [\x21-\x7E] newline'ı DIŞLAR → ("a","bc") ile ("ab","c")
  // gibi namespace/token karışmaları imkânsızdır.
  const digest = createHash('sha256').update(`${namespace}\n${normalized}`, 'utf8').digest('hex');
  return `${UYAP_OPERATION_IDEMPOTENCY_KEY_PREFIX}HTTP:${digest}` as UyapOperationIdempotencyKey;
}

/**
 * Persist edilmiş operation satırından anahtarı geri kazanır (replay taşıması).
 * Girdi bilinçli olarak `string` DEĞİL, operation satırıdır — keyfi/client string aklanamaz.
 */
export function rehydrateUyapOperationIdempotencyKey(
  operation: Pick<UyapOperation, 'idempotencyKey'>,
): UyapOperationIdempotencyKey {
  if (!UYAP_OPERATION_IDEMPOTENCY_KEY_PATTERN.test(operation.idempotencyKey)) {
    throw new UyapOperationWriterValidationError(
      'persist edilmiş idempotencyKey kanonik "UYAP-OP/v1:<uuid>" biçiminde değil',
    );
  }
  return operation.idempotencyKey as UyapOperationIdempotencyKey;
}

/** Yalnız test/guard amaçlı biçim kontrolü — marka VERMEZ. */
export function isCanonicalUyapOperationIdempotencyKey(value: string): boolean {
  return UYAP_OPERATION_IDEMPOTENCY_KEY_PATTERN.test(value);
}

/**
 * Idempotent reuse karşılaştırmasının TEK dayanağı — immutable operation envelope
 * (owner-ratified 8 alan). P-E5B capability payload'ı SAKLAMAZ; payload-digest veya
 * payload-equality İCAT EDİLMEZ (capability-specific fingerprint ileride wiring sözleşmesinde).
 */
export interface UyapOperationEnvelope {
  tenantId: string;
  caseId: string | null;
  operationType: string;
  actorUserId: string;
  actingLawyerId: string | null;
  representedPartyId: string | null;
  approverId: string | null;
  signatureOwnerId: string | null;
}

export interface CreateUyapOperationCommand {
  idempotencyKey: UyapOperationIdempotencyKey;
  envelope: UyapOperationEnvelope;
  /** correlation-only — authority/idempotency DEĞİL (UYAP-CONST-004). */
  clientRequestId?: string | null;
  /** trusted middleware correlation — authority DEĞİL. */
  httpCorrelationId?: string | null;
}

export interface CreateUyapOperationResult {
  operation: UyapOperation;
  firstAttempt: UyapAttempt;
  created: boolean;
  reason?: 'IDEMPOTENT_REUSE';
}

export interface AppendRetryAttemptCommand {
  tenantId: string;
  operationId: string;
}

export interface AppendRetryAttemptResult {
  attempt: UyapAttempt;
  attemptNumber: number;
  previousAttemptId: string;
}

export interface CompareAndBumpVersionCommand {
  id: string;
  tenantId: string;
  expectedVersion: number;
}

export interface CompareAndBumpVersionResult {
  /** bump sonrası yeni version (expectedVersion + 1). */
  version: number;
}
