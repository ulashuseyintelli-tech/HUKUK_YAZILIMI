/**
 * Domain Event Ingest — Error Types
 *
 * Phase 2 Sprint 1
 * Each error maps to a specific Hard Rule violation.
 */

export class DomainEventValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly hardRule: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainEventValidationError';
  }
}

/** HR-23: caused_by required for PAYMENT_REVERSED, CASE_RESUMED, CASE_REOPENED */
export class CausedByRequiredError extends DomainEventValidationError {
  constructor(eventType: string) {
    super(
      'CAUSED_BY_REQUIRED',
      'HR-23',
      `Event type "${eventType}" requires caused_by field`,
    );
  }
}

/** HR-26: Human actor required for closure, reopen, policy override, etc. */
export class HumanActorRequiredError extends DomainEventValidationError {
  constructor(eventType: string) {
    super(
      'HUMAN_ACTOR_REQUIRED',
      'HR-26',
      `Event type "${eventType}" requires actor.type = HUMAN`,
    );
  }
}

/** HR-34: occurred_at_confidence is mandatory */
export class ConfidenceMissingError extends DomainEventValidationError {
  constructor() {
    super(
      'CONFIDENCE_MISSING',
      'HR-34',
      'Event header must include occurredAtConfidence',
    );
  }
}

/** HR-34: EXTERNAL_SIGNED requires evidence */
export class EvidenceMissingError extends DomainEventValidationError {
  constructor() {
    super(
      'EVIDENCE_MISSING',
      'HR-34',
      'occurredAtConfidence=EXTERNAL_SIGNED requires occurredAtEvidence',
    );
  }
}

/** HR-33: retroactive_override required when effective_from < earliest event */
export class RetroactiveOverrideRequiredError extends DomainEventValidationError {
  constructor(effectiveFrom: string, earliestEvent: string) {
    super(
      'RETROACTIVE_OVERRIDE_REQUIRED',
      'HR-33',
      `effective_from (${effectiveFrom}) precedes earliest event (${earliestEvent}). retroactiveOverride required.`,
    );
  }
}

/** HR-11: aggregate_version gap detected */
export class AggregateVersionGapError extends DomainEventValidationError {
  constructor(expected: number, got: number) {
    super(
      'AGGREGATE_VERSION_GAP',
      'HR-11',
      `Expected aggregateVersion ${expected}, got ${got}`,
    );
  }
}
