import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeRequestId } from '../../common/request-id.middleware';
import { AuditService } from '../audit/audit.service';
import type { EventActor } from '../icrabot/domain-event-ingest/domain-event-ingest.types';

export const COLLECTION_AUDIT_ACTION = {
  CREATE: 'COLLECTION_CREATE',
  UPDATE: 'COLLECTION_UPDATE',
  VOID_EXECUTED: 'COLLECTION_VOID_EXECUTED',
} as const;

export type CollectionCommandProducer =
  | 'COLLECTION_PUBLIC_API'
  | 'CASE_COLLECTION_COMPATIBILITY_API'
  | 'BANK_TRANSACTION_MATCH'
  | 'EXTERNAL_CASE_RECEIPT'
  | 'COLLECTION_SERVICE_COMPATIBILITY';

export interface CollectionRequestContext {
  correlationId?: string;
  causationId?: string;
  producer?: CollectionCommandProducer;
  actor?: EventActor;
}

export interface CollectionMutationTrace {
  correlationId: string;
  commandId: string;
  causationId?: string;
  producer?: CollectionCommandProducer;
}

export interface CollectionAuditEvidence {
  caseId: string;
  status: string;
  actor: EventActor;
  amount?: string;
  currency?: string;
  occurredAt?: string;
  confirmedAt?: string;
  changedFields?: string[];
  journalEntryIds?: string[];
  ledgerEntryIds?: string[];
  ledgerAllocationCount?: number;
  eventId?: string;
  outboxIdempotencyKey?: string;
  overpaymentId?: string;
  approvalRequestId?: string;
}

export function createCollectionMutationTrace(
  correlationId?: string,
  causationId?: string,
  producer?: CollectionCommandProducer,
): CollectionMutationTrace {
  return {
    correlationId: normalizeRequestId(correlationId) ?? randomUUID(),
    commandId: randomUUID(),
    ...(causationId ? { causationId } : {}),
    ...(producer ? { producer } : {}),
  };
}

export function changedCollectionFields(
  current: Record<string, unknown>,
  updateData: Record<string, unknown>,
): string[] {
  return Object.keys(updateData).filter((field) => !collectionValuesEqual(current[field], updateData[field]));
}

export async function logCollectionMutationInTransaction(
  auditService: AuditService,
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    collectionId: string;
    action: (typeof COLLECTION_AUDIT_ACTION)[keyof typeof COLLECTION_AUDIT_ACTION];
    trace: CollectionMutationTrace;
    evidence: CollectionAuditEvidence;
  },
): Promise<void> {
  const { evidence, trace } = input;
  const userId = evidence.actor.type === 'HUMAN' && evidence.actor.userId && evidence.actor.userId !== 'unknown'
    ? evidence.actor.userId
    : undefined;

  // COL/OD-05 allowlist: raw DTO, free text, account/bank/reference data and unrestricted
  // before/after snapshots must never enter Collection audit metadata.
  const metadata = compactRecord({
    caseId: evidence.caseId,
    correlationId: trace.correlationId,
    commandId: trace.commandId,
    causationId: trace.causationId,
    producer: trace.producer,
    actorType: evidence.actor.type,
    externalSystem: evidence.actor.externalSystem,
    status: evidence.status,
    amount: evidence.amount,
    currency: evidence.currency,
    occurredAt: evidence.occurredAt,
    confirmedAt: evidence.confirmedAt,
    changedFields: evidence.changedFields ? [...evidence.changedFields].sort() : undefined,
    journalEntryIds: evidence.journalEntryIds,
    ledgerEntryIds: evidence.ledgerEntryIds,
    ledgerAllocationCount: evidence.ledgerAllocationCount,
    eventId: evidence.eventId,
    outboxIdempotencyKey: evidence.outboxIdempotencyKey,
    overpaymentId: evidence.overpaymentId,
    approvalRequestId: evidence.approvalRequestId,
  });

  await auditService.logInTransaction(tx, {
    tenantId: input.tenantId,
    action: input.action,
    entityType: 'COLLECTION',
    entityId: input.collectionId,
    userId,
    description: collectionAuditDescription(input.action),
    metadata,
  });
}

function collectionAuditDescription(
  action: (typeof COLLECTION_AUDIT_ACTION)[keyof typeof COLLECTION_AUDIT_ACTION],
): string {
  switch (action) {
    case COLLECTION_AUDIT_ACTION.CREATE:
      return 'Collection created.';
    case COLLECTION_AUDIT_ACTION.UPDATE:
      return 'Collection metadata updated.';
    case COLLECTION_AUDIT_ACTION.VOID_EXECUTED:
      return 'Collection void executed.';
  }
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function collectionValuesEqual(current: unknown, next: unknown): boolean {
  if (current instanceof Date || next instanceof Date) {
    const currentTime = current instanceof Date ? current.getTime() : new Date(String(current)).getTime();
    const nextTime = next instanceof Date ? next.getTime() : new Date(String(next)).getTime();
    return Number.isFinite(currentTime) && currentTime === nextTime;
  }
  if (current instanceof Prisma.Decimal || next instanceof Prisma.Decimal) {
    return new Prisma.Decimal(current as Prisma.Decimal.Value).equals(next as Prisma.Decimal.Value);
  }
  return (current ?? null) === (next ?? null);
}
