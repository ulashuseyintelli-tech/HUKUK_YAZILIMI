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
import { randomUUID } from 'crypto';
import { UyapAttempt, UyapOperation } from '@prisma/client';
import { UyapOperationWriterValidationError } from './uyap-operation-writer.errors';

/** Marka taşıyıcısı — bilinçli olarak EXPORT EDİLMEZ (dışarıda forge edilemez). */
declare const UYAP_OPERATION_IDEMPOTENCY_KEY_BRAND: unique symbol;

/** Server-controlled, opaque idempotency key. Düz `string` bu tipe atanamaz. */
export type UyapOperationIdempotencyKey = string & {
  readonly [UYAP_OPERATION_IDEMPOTENCY_KEY_BRAND]: 'UYAP-OP/v1';
};

export const UYAP_OPERATION_IDEMPOTENCY_KEY_PREFIX = 'UYAP-OP/v1:';

/** Prefix + RFC-4122 UUID; başka hiçbir biçim kabul edilmez. */
const UYAP_OPERATION_IDEMPOTENCY_KEY_PATTERN =
  /^UYAP-OP\/v1:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Yeni logical create için anahtar üretir. Aynı logical create'in replay'inde AYNI değer taşınmalıdır. */
export function newUyapOperationIdempotencyKey(): UyapOperationIdempotencyKey {
  return `${UYAP_OPERATION_IDEMPOTENCY_KEY_PREFIX}${randomUUID()}` as UyapOperationIdempotencyKey;
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
