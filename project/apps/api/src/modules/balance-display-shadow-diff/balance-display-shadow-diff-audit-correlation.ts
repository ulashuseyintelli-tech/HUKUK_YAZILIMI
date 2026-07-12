import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ADR014_OPERATIONAL_EVENT_COMPONENTS,
  ADR014_OPERATIONAL_EVENT_FAILURE_CODES,
  ADR014_OPERATIONAL_EVENT_OPERATIONS,
  ADR014_OPERATIONAL_EVENT_RESULTS,
  ADR014_OPERATIONAL_EVENT_SEVERITIES,
  ADR014_OPERATIONAL_EVENT_TYPES,
  ADR014_OPERATIONAL_EVENT_VERSION,
  type Adr014OperationalEvent,
} from './balance-display-shadow-diff.events';

export const ADR014_AUDIT_CORRELATION_CONTRACT = 'ADR014_AUDIT_CORRELATION_PREPARATION' as const;
export const ADR014_AUDIT_CORRELATION_CONTRACT_VERSION = '1' as const;
export const ADR014_AUDIT_CORRELATION_DURABILITY = 'NON_DURABLE' as const;
export const ADR014_AUDIT_CORRELATION_PERSISTENCE = 'NOT_CONFIGURED' as const;

export type Adr014AuditCorrelationReference = `adr014-correlation:v1:${string}`;

export interface Adr014AuditCorrelationCandidate {
  readonly correlation_contract: typeof ADR014_AUDIT_CORRELATION_CONTRACT;
  readonly correlation_contract_version: typeof ADR014_AUDIT_CORRELATION_CONTRACT_VERSION;
  /** Opaque preparation reference. It is never a metric label or a domain/entity identifier. */
  readonly correlation_reference: Adr014AuditCorrelationReference;
  readonly durability: typeof ADR014_AUDIT_CORRELATION_DURABILITY;
  readonly persistence: typeof ADR014_AUDIT_CORRELATION_PERSISTENCE;
  /** Exact defensive copy of the immutable PE-05A2 allowlist envelope. */
  readonly source_event: Readonly<Adr014OperationalEvent>;
}

const REQUIRED_EVENT_KEYS = [
  'event_type',
  'event_version',
  'timestamp',
  'severity',
  'component',
  'operation',
  'result',
  'failure_code',
  'canonical_sha_reference',
  'environment_reference',
] as const;

const OPTIONAL_EVENT_KEYS = [
  'session_reference',
  'manifest_reference',
  'trace_reference',
  'evidence_reference',
] as const;

const ALLOWED_EVENT_KEYS = new Set<string>([...REQUIRED_EVENT_KEYS, ...OPTIONAL_EVENT_KEYS]);
const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

function hasValue<T>(values: readonly T[], candidate: unknown): candidate is T {
  return values.includes(candidate as T);
}

function assertCanonicalEvent(event: Adr014OperationalEvent): void {
  if (!event || typeof event !== 'object') throw new TypeError('ADR-014 operational event is required');

  const keys = Object.keys(event);
  if (REQUIRED_EVENT_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(event, key))) {
    throw new TypeError('ADR-014 operational event is missing a required allowlist field');
  }
  if (keys.some((key) => !ALLOWED_EVENT_KEYS.has(key))) {
    throw new TypeError('ADR-014 operational event contains a non-allowlisted field');
  }
  if (!hasValue(ADR014_OPERATIONAL_EVENT_TYPES, event.event_type)) throw new TypeError('Invalid event type');
  if (event.event_version !== ADR014_OPERATIONAL_EVENT_VERSION) throw new TypeError('Invalid event version');
  if (!hasValue(ADR014_OPERATIONAL_EVENT_SEVERITIES, event.severity)) throw new TypeError('Invalid severity');
  if (!hasValue(ADR014_OPERATIONAL_EVENT_COMPONENTS, event.component)) throw new TypeError('Invalid component');
  if (!hasValue(ADR014_OPERATIONAL_EVENT_OPERATIONS, event.operation)) throw new TypeError('Invalid operation');
  if (!hasValue(ADR014_OPERATIONAL_EVENT_RESULTS, event.result)) throw new TypeError('Invalid result');
  if (!hasValue(ADR014_OPERATIONAL_EVENT_FAILURE_CODES, event.failure_code)) throw new TypeError('Invalid failure code');
  if (!['PRODUCTION', 'DEVELOPMENT', 'TEST', 'UNKNOWN'].includes(event.environment_reference)) {
    throw new TypeError('Invalid environment reference');
  }
  if (event.canonical_sha_reference !== 'UNKNOWN' && !FULL_GIT_SHA.test(event.canonical_sha_reference)) {
    throw new TypeError('Invalid canonical SHA reference');
  }
  const parsedTimestamp = Date.parse(event.timestamp);
  if (Number.isNaN(parsedTimestamp) || new Date(parsedTimestamp).toISOString() !== event.timestamp) {
    throw new TypeError('Invalid event timestamp');
  }

  for (const key of OPTIONAL_EVENT_KEYS) {
    const reference = event[key];
    if (reference !== undefined && (typeof reference !== 'string' || !OPAQUE_REFERENCE.test(reference))) {
      throw new TypeError(`Invalid ${key}`);
    }
  }
}

function copyCanonicalEvent(event: Adr014OperationalEvent): Readonly<Adr014OperationalEvent> {
  return Object.freeze({
    event_type: event.event_type,
    event_version: event.event_version,
    timestamp: event.timestamp,
    severity: event.severity,
    component: event.component,
    operation: event.operation,
    result: event.result,
    failure_code: event.failure_code,
    canonical_sha_reference: event.canonical_sha_reference,
    environment_reference: event.environment_reference,
    ...(event.session_reference === undefined ? {} : { session_reference: event.session_reference }),
    ...(event.manifest_reference === undefined ? {} : { manifest_reference: event.manifest_reference }),
    ...(event.trace_reference === undefined ? {} : { trace_reference: event.trace_reference }),
    ...(event.evidence_reference === undefined ? {} : { evidence_reference: event.evidence_reference }),
  });
}

/**
 * Prepares a PII-safe correlation candidate for a future separately authorized durable audit writer.
 * It performs no persistence, AuditLog write, network call, logging, metric emission or business mutation.
 */
@Injectable()
export class BalanceDisplayShadowDiffAuditCorrelationPreparation {
  prepare(event: Adr014OperationalEvent): Adr014AuditCorrelationCandidate {
    assertCanonicalEvent(event);
    const sourceEvent = copyCanonicalEvent(event);

    return Object.freeze({
      correlation_contract: ADR014_AUDIT_CORRELATION_CONTRACT,
      correlation_contract_version: ADR014_AUDIT_CORRELATION_CONTRACT_VERSION,
      correlation_reference: `adr014-correlation:v1:${randomUUID()}`,
      durability: ADR014_AUDIT_CORRELATION_DURABILITY,
      persistence: ADR014_AUDIT_CORRELATION_PERSISTENCE,
      source_event: sourceEvent,
    });
  }
}
