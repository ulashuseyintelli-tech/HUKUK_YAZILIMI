/**
 * Domain Event Ingest — Types
 *
 * Phase 2 Sprint 1 — HR-23, HR-26, HR-29, HR-34, HR-39, HR-44, HR-45
 *
 * SCOPE: Minimal type definitions for domain event ingestion.
 * NOT a generic event framework. Just the contract for same-tx append.
 */

// ─── Event Header ────────────────────────────────────────────────────────────

export type OccurredAtConfidence =
  | 'SYSTEM_VERIFIED'
  | 'EXTERNAL_SIGNED'
  | 'USER_DECLARED';

export type ActorType = 'HUMAN' | 'SYSTEM' | 'EXTERNAL';

export interface EventActor {
  type: ActorType;
  userId?: string;
  externalSystem?: string;
  reason?: string;
}

export interface RetroactiveOverride {
  authorizedBy: string; // user UUID
  authorizationReason: string;
  references: string[]; // evidence links
}

export interface DomainEventHeader {
  eventId: string; // UUID, client-generated for idempotency
  aggregateType: 'Case' | 'Debtor' | 'Client' | 'Lawyer' | 'Tenant';
  aggregateId: string;
  eventType: string; // NOUN_PAST_PARTICIPLE format

  occurredAt: string; // ISO8601
  occurredAtConfidence: OccurredAtConfidence; // HR-34
  occurredAtEvidence?: string; // required when EXTERNAL_SIGNED

  effectiveFrom?: string; // ISO8601, defaults to occurredAt
  retroactiveOverride?: RetroactiveOverride; // HR-33

  actor: EventActor; // HR-26
  causedBy?: string; // eventId of causing event — HR-23

  tenantId: string;
}

// ─── Full Event ──────────────────────────────────────────────────────────────

export interface DomainEvent<TPayload = Record<string, unknown>> {
  header: DomainEventHeader;
  payload: TPayload;
}
