import { Injectable } from '@nestjs/common';
import type { Adr014AuditCorrelationCandidate } from './balance-display-shadow-diff-audit-correlation';

/**
 * Injection token for a future separately authorized durable ADR-014 audit writer.
 * The canonical provider remains disabled and performs no persistence.
 */
export const ADR014_DURABLE_AUDIT_WRITER = Symbol('ADR014_DURABLE_AUDIT_WRITER');

export interface Adr014DurableAuditWriter {
  readonly enabled: boolean;
  write(candidate: Readonly<Adr014AuditCorrelationCandidate>): Promise<void>;
}

/**
 * Safe default until durable audit persistence receives separate authority.
 * It intentionally does not inspect, serialize, log, emit or persist the candidate.
 */
@Injectable()
export class NoopAdr014DurableAuditWriter implements Adr014DurableAuditWriter {
  readonly enabled = false;

  constructor() {
    Object.freeze(this);
  }

  write(_candidate: Readonly<Adr014AuditCorrelationCandidate>): Promise<void> {
    return Promise.resolve();
  }
}
