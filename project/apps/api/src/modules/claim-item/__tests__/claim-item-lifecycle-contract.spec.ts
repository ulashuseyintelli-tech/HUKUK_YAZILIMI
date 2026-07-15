import { ClaimItemStatus } from '@prisma/client';
import { buildCanonicalWriteEnvelopeV1 } from '../../../common/canonical-write-envelope';
import {
  appendClaimItemContinuity,
  assertBackfillRollbackCandidate,
  assertClaimItemCreateStatus,
  assertClaimItemHardDeleteForbidden,
  assertClaimItemLifecycleMutation,
  ClaimItemLifecycleException,
} from '../claim-item-lifecycle-contract';

describe('RCV-P2-WS02-P04 ClaimItem lifecycle contract', () => {
  it.each([
    ClaimItemStatus.CANCELLED,
    ClaimItemStatus.WAIVED,
    ClaimItemStatus.COLLECTED,
  ])('ACTIVE -> %s geçişini kabul eder', (status) => {
    expect(assertClaimItemLifecycleMutation(ClaimItemStatus.ACTIVE, { status })).toEqual({
      currentStatus: ClaimItemStatus.ACTIVE,
      nextStatus: status,
      noOp: false,
    });
  });

  it.each([
    [ClaimItemStatus.CANCELLED, ClaimItemStatus.ACTIVE],
    [ClaimItemStatus.WAIVED, ClaimItemStatus.CANCELLED],
    [ClaimItemStatus.COLLECTED, ClaimItemStatus.WAIVED],
  ])('%s -> %s terminal geçişini fail-closed reddeder', (from, to) => {
    expect(() => assertClaimItemLifecycleMutation(from, { status: to }))
      .toThrow(ClaimItemLifecycleException);
  });

  it('terminal kayıtta status dışı mutationı reddeder; aynı status retry no-op kalır', () => {
    expect(() =>
      assertClaimItemLifecycleMutation(ClaimItemStatus.CANCELLED, {
        status: ClaimItemStatus.CANCELLED,
        description: 'drift',
      }),
    ).toThrow(ClaimItemLifecycleException);
    expect(
      assertClaimItemLifecycleMutation(ClaimItemStatus.CANCELLED, {
        status: ClaimItemStatus.CANCELLED,
      }),
    ).toEqual({
      currentStatus: ClaimItemStatus.CANCELLED,
      nextStatus: ClaimItemStatus.CANCELLED,
      noOp: true,
    });
  });

  it('create yalnız ACTIVE başlatır ve genel hard-delete fail-closed kalır', () => {
    expect(assertClaimItemCreateStatus(undefined)).toBe(ClaimItemStatus.ACTIVE);
    expect(() => assertClaimItemCreateStatus(ClaimItemStatus.WAIVED))
      .toThrow(ClaimItemLifecycleException);
    expect(() => assertClaimItemHardDeleteForbidden())
      .toThrow(ClaimItemLifecycleException);
  });

  it('operational rollback için exact backfill provenance ve allocation absence ister', () => {
    const candidate = backfillCandidate();
    expect(() => assertBackfillRollbackCandidate(candidate as any, 'run-1')).not.toThrow();
    expect(() =>
      assertBackfillRollbackCandidate(
        {
          ...candidate,
          metadata: {
            ...candidate.metadata,
            canonicalSourceProvenance: {
              ...(candidate.metadata as any).canonicalSourceProvenance,
              provenance: { ingress: 'DUE' },
            },
          },
        } as any,
        'run-1',
      ),
    ).toThrow(ClaimItemLifecycleException);
    expect(() =>
      assertBackfillRollbackCandidate(
        { ...candidate, _count: { ledgerAllocations: 1 } } as any,
        'run-1',
      ),
    ).toThrow(ClaimItemLifecycleException);
  });

  it('audit ve domain event/outbox continuity aynı tx dependency üzerinden append edilir', async () => {
    const tx: any = { auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } };
    const domainEventIngest: any = {
      appendInTransaction: jest.fn().mockResolvedValue({ aggregateVersion: 1n }),
    };
    const envelope = envelopeFor('claim-1');
    const before = lifecycleRecord(ClaimItemStatus.ACTIVE);
    const after = lifecycleRecord(ClaimItemStatus.CANCELLED);

    await appendClaimItemContinuity({
      tx,
      domainEventIngest,
      envelope,
      operation: 'CANCEL',
      before,
      after,
      auditAction: 'CLAIM_ITEM_SYSTEM_CANCELLED',
      auditUserId: 'user-1',
      auditSource: 'DUE_BRIDGE',
      approvalRequired: false,
      retentionDisposition: 'TOMBSTONE_RETAINED',
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLAIM_ITEM_SYSTEM_CANCELLED',
        entityType: 'ClaimItem',
        entityId: 'claim-1',
        metadata: expect.objectContaining({
          commandId: envelope.commandId,
          correlationId: envelope.correlationId,
          causationId: envelope.causationId,
          retentionDisposition: 'TOMBSTONE_RETAINED',
        }),
      }),
    });
    expect(domainEventIngest.appendInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        header: expect.objectContaining({
          eventId: envelope.commandId,
          aggregateType: 'Case',
          aggregateId: 'case-1',
          eventType: 'CLAIM_ITEM_CANCELLED',
          correlationId: envelope.correlationId,
          causationId: envelope.causationId,
        }),
        payload: expect.objectContaining({
          claimItemId: 'claim-1',
          previousStatus: ClaimItemStatus.ACTIVE,
          status: ClaimItemStatus.CANCELLED,
        }),
      }),
    );
  });

  it('event boundary yoksa audit/event sürekliliğini fail-closed reddeder', async () => {
    await expect(
      appendClaimItemContinuity({
        tx: { auditLog: { create: jest.fn() } } as any,
        domainEventIngest: undefined,
        envelope: envelopeFor('claim-1'),
        operation: 'CREATE',
        before: null,
        after: lifecycleRecord(ClaimItemStatus.ACTIVE),
        auditAction: 'CLAIM_ITEM_CREATED',
        auditSource: 'TEST',
        approvalRequired: false,
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({
      code: 'CLAIM_ITEM_LIFECYCLE_CONTINUITY_UNAVAILABLE',
    }) });
  });
});

function lifecycleRecord(status: ClaimItemStatus) {
  return {
    id: 'claim-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    status,
    amount: '100',
    metadata: {},
  };
}

function envelopeFor(claimItemId: string) {
  return buildCanonicalWriteEnvelopeV1({
    tenantId: 'tenant-1',
    caseId: 'case-1',
    target: { aggregateType: 'ClaimItem' as const, aggregateId: claimItemId },
    actor: { type: 'SYSTEM', system: 'DUE_BRIDGE' },
    correlationId: 'claim-item-source:correlation-1',
    causationId: 'due:event-1',
    idempotencyKey: 'claim-item:cancel:idempotency-1',
    occurredAt: '2026-07-15T00:00:00.000Z',
    effectiveAt: '2026-07-15T00:00:00.000Z',
    source: {
      sourceType: 'DUE_BRIDGE',
      sourceId: 'due-1',
      evidenceRefs: ['user:user-1'],
    },
    authority: { policyRef: 'REC-AUTH-008' },
    currency: 'TRY',
  });
}

function backfillCandidate() {
  return {
    id: 'claim-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    status: ClaimItemStatus.ACTIVE,
    metadata: {
      backfill: { runId: 'run-1', sourceDueId: 'due-1' },
      canonicalWriterSource: {
        authority: 'DUE_BACKFILL',
        sourceId: 'due-1',
      },
      canonicalSourceProvenance: {
        provenance: { ingress: 'BACKFILL' },
        createdByAuthority: {
          actorType: 'SYSTEM',
          actorRef: 'system:DUE_BACKFILL',
        },
        sourceIdentity: {
          tenantId: 'tenant-1',
          caseId: 'case-1',
          sourceId: 'due-1',
        },
      },
    },
    _count: { ledgerAllocations: 0 },
  };
}
