/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrence typed application error'ları.
 * `break-glass` modülü emsali (bkz. circuit-breaker.service.ts CircuitBreakerTrippedException):
 * düz `Error` alt sınıfı, HTTP semantiğine bağlanmaz — bu servisin P02'de public controller'ı
 * yok; HTTP mapping'i ileride P03 controller sınırında yapılacaktır.
 */

export class ServiceOccurrenceParentNotFoundError extends Error {
  constructor() {
    super("Service occurrence parent tebligat not found");
    this.name = "ServiceOccurrenceParentNotFoundError";
  }
  readonly code = "SERVICE_OCCURRENCE_PARENT_NOT_FOUND" as const;
}

export class ServiceOccurrenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceOccurrenceValidationError";
  }
  readonly code = "SERVICE_OCCURRENCE_VALIDATION_ERROR" as const;
}

export class ServiceOccurrenceIdempotencyConflictError extends Error {
  constructor() {
    super("Service occurrence idempotency conflict: same scope, different factual payload");
    this.name = "ServiceOccurrenceIdempotencyConflictError";
  }
  readonly code = "SERVICE_OCCURRENCE_IDEMPOTENCY_CONFLICT" as const;
}

export class ServiceOccurrenceNotActiveError extends Error {
  constructor() {
    super("Service occurrence is not ACTIVE and cannot be superseded");
    this.name = "ServiceOccurrenceNotActiveError";
  }
  readonly code = "SERVICE_OCCURRENCE_NOT_ACTIVE" as const;
}

export class ServiceOccurrenceAlreadySupersededError extends Error {
  constructor() {
    super("Service occurrence was already superseded by a concurrent request");
    this.name = "ServiceOccurrenceAlreadySupersededError";
  }
  readonly code = "SERVICE_OCCURRENCE_ALREADY_SUPERSEDED" as const;
}

export class ServiceOccurrenceConcurrentWriteConflictError extends Error {
  constructor() {
    super("Service occurrence concurrent write conflict");
    this.name = "ServiceOccurrenceConcurrentWriteConflictError";
  }
  readonly code = "SERVICE_OCCURRENCE_CONCURRENT_WRITE_CONFLICT" as const;
}

export class ServiceOccurrenceTenantScopeViolationError extends Error {
  constructor() {
    super("Service occurrence tenant scope violation");
    this.name = "ServiceOccurrenceTenantScopeViolationError";
  }
  readonly code = "SERVICE_OCCURRENCE_TENANT_SCOPE_VIOLATION" as const;
}
