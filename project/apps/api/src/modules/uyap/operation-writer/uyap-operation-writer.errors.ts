/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — typed application error'ları.
 * `service-occurrence.errors.ts` emsali: düz `Error` alt sınıfı, HTTP semantiğine BAĞLANMAZ —
 * bu servisin P05B'de public controller'ı yoktur; HTTP mapping'i ileride wiring sınırında yapılır.
 */

export class UyapOperationWriterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UyapOperationWriterValidationError';
  }
}

/**
 * Aynı (tenantId, idempotencyKey) farklı immutable envelope ile görüldü.
 * Owner-ratified: karşılaştırma YALNIZ envelope üzerinden yapılır, payload fingerprint YOK.
 */
export class UyapOperationIdempotencyConflictError extends Error {
  constructor(message = 'aynı idempotencyKey farklı operation envelope ile kullanıldı') {
    super(message);
    this.name = 'UyapOperationIdempotencyConflictError';
  }
}

export class UyapOperationNotFoundError extends Error {
  constructor(message = 'operation bulunamadı (tenant-scoped)') {
    super(message);
    this.name = 'UyapOperationNotFoundError';
  }
}

/**
 * compareAndBumpVersion: (id, tenantId, expectedVersion) eşleşmedi — başka bir yazar
 * version'ı ilerletmiş ya da satır yok. `count !== 1` semantiği.
 */
export class UyapOperationClaimLostError extends Error {
  constructor(message = 'optimistic claim kaybedildi: beklenen version eşleşmedi') {
    super(message);
    this.name = 'UyapOperationClaimLostError';
  }
}

/** Advisory lock'a rağmen DB seviyesinde eşzamanlı yazım çakışması (belt+suspenders). */
export class UyapOperationConcurrentWriteConflictError extends Error {
  constructor(message = 'eşzamanlı yazım çakışması') {
    super(message);
    this.name = 'UyapOperationConcurrentWriteConflictError';
  }
}
