/**
 * DEBTOR-OF01-HISTORY-P04-B — ServiceOccurrenceDeadlineCalculationService typed application
 * error'ları. `ServiceOccurrenceValidationError` ailesi emsali (P02): düz `Error` alt sınıfı,
 * HTTP semantiğine bağlanmaz (bu servisin public controller'ı yok — owner brief §20).
 * Raw Prisma/PostgreSQL error'ları bu servis sınırının dışına asla sızmaz (owner brief §14).
 */

export class OccurrenceNotFoundError extends Error {
  constructor() {
    super("Service occurrence not found");
    this.name = "OccurrenceNotFoundError";
  }
  readonly code = "OCCURRENCE_NOT_FOUND" as const;
}

export class OccurrenceTenantMismatchError extends Error {
  constructor() {
    super("Service occurrence tenant mismatch");
    this.name = "OccurrenceTenantMismatchError";
  }
  readonly code = "OCCURRENCE_TENANT_MISMATCH" as const;
}

export class OccurrenceSupersededError extends Error {
  constructor() {
    super("Service occurrence is SUPERSEDED and cannot be used for deadline calculation");
    this.name = "OccurrenceSupersededError";
  }
  readonly code = "OCCURRENCE_SUPERSEDED" as const;
}

export class DeadlineInputIncompleteError extends Error {
  constructor(reason: string) {
    super(`Deadline input incomplete: ${reason}`);
    this.name = "DeadlineInputIncompleteError";
  }
  readonly code = "DEADLINE_INPUT_INCOMPLETE" as const;
}

export class RuleVersionUnavailableError extends Error {
  constructor(requestedVersion: string) {
    super(`Requested calculationVersion is not supported: ${requestedVersion}`);
    this.name = "RuleVersionUnavailableError";
  }
  readonly code = "RULE_VERSION_UNAVAILABLE" as const;
}

export class SnapshotIdempotencyConflictError extends Error {
  constructor() {
    super(
      "Same occurrence + calculationVersion previously produced a different calculation output",
    );
    this.name = "SnapshotIdempotencyConflictError";
  }
  readonly code = "SNAPSHOT_IDEMPOTENCY_CONFLICT" as const;
}

export class ConcurrentRecalculationConflictError extends Error {
  constructor() {
    super("Concurrent recalculation conflict: transaction could not be serialized after retries");
    this.name = "ConcurrentRecalculationConflictError";
  }
  readonly code = "CONCURRENT_RECALCULATION_CONFLICT" as const;
}

export class SnapshotWriteFailedError extends Error {
  constructor() {
    super("Snapshot write failed");
    this.name = "SnapshotWriteFailedError";
  }
  readonly code = "SNAPSHOT_WRITE_FAILED" as const;
}
