import {
  buildCanonicalWriteEnvelopeV1,
  type CanonicalWriteActor,
} from '../../../common/canonical-write-envelope';
import {
  buildClaimItemSourceProvenanceV1,
  claimItemIngressForSystemRoute,
  CLAIM_ITEM_INGRESS_MAPPING,
  CLAIM_ITEM_INGRESS_SOURCES,
  ClaimItemSourceProvenanceValidationError,
  type ConcreteClaimItemIngressSource,
} from '../claim-item-source-provenance';
import {
  CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
  CLAIM_ITEM_SYSTEM_WRITER_ROUTES,
  type ClaimItemSystemWriterRoute,
} from '../claim-item-writer-routes';

const occurredAt = '2026-07-15T08:00:00.000Z';

function envelope(input: {
  actor: CanonicalWriteActor;
  sourceType: string;
  sourceId: string;
  policyRef: string;
  approvalRequestId?: string;
  correlationId?: string;
  causationId?: string;
}) {
  return buildCanonicalWriteEnvelopeV1({
    tenantId: 'tenant-1',
    caseId: 'case-1',
    target: { aggregateType: 'ClaimItem' as const },
    actor: input.actor,
    correlationId: input.correlationId ?? 'claim-item-source:test-correlation',
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    idempotencyKey: 'claim-item-create:test-idempotency',
    occurredAt,
    effectiveAt: occurredAt,
    source: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      evidenceRefs: ['evidence:test'],
    },
    authority: {
      policyRef: input.policyRef,
      ...(input.approvalRequestId === undefined
        ? {}
        : { approvalRequestId: input.approvalRequestId }),
    },
  });
}

describe('RCV-P2-WS02-P01 ClaimItem source identity and provenance contract', () => {
  const systemRoutes = Object.keys(CLAIM_ITEM_SYSTEM_WRITER_ROUTES) as ClaimItemSystemWriterRoute[];

  it('materializes the exact eight-source ingress inventory without authorizing a generic writer', () => {
    expect(Object.keys(CLAIM_ITEM_INGRESS_MAPPING)).toEqual(CLAIM_ITEM_INGRESS_SOURCES);
    expect(CLAIM_ITEM_INGRESS_MAPPING.SYSTEM_GENERATED_CLAIM_ITEM).toEqual({
      canonicalSourceType: 'SYSTEM_GENERATED_CLAIM_ITEM',
      envelopeSourceType: null,
      actorType: 'SYSTEM',
      policyRef: null,
      writerRoute: null,
      executionBoundary: 'CLASSIFICATION_ONLY',
    });
    expect(Object.isFrozen(CLAIM_ITEM_INGRESS_MAPPING)).toBe(true);
    expect(Object.isFrozen(CLAIM_ITEM_INGRESS_MAPPING.DUE)).toBe(true);
  });

  it.each(systemRoutes)('%s projects the P01 envelope through the unchanged P03 route', (route) => {
    const routeConfig = CLAIM_ITEM_SYSTEM_WRITER_ROUTES[route];
    const ingress = claimItemIngressForSystemRoute(route);
    const result = buildClaimItemSourceProvenanceV1({
      ingress,
      envelope: envelope({
        actor: { type: 'SYSTEM', system: route },
        sourceType: routeConfig.sourceType,
        sourceId: route === 'RULE_ENGINE_GENERATOR' ? 'case-1' : `source:${route}`,
        policyRef: routeConfig.policyRef,
      }),
      sourceSlot: 'PRIMARY',
    });

    expect(result.provenance.ingress).toBe(ingress);
    expect(result.provenance.generationClass).toBe('SYSTEM_GENERATED_CLAIM_ITEM');
    expect(result.canonicalSourceMetadata).toEqual(expect.objectContaining({
      executionBoundary: 'P03_ROUTER',
      writerRoute: route,
      sourceSlot: 'PRIMARY',
    }));
    expect(result.createdByAuthority).toEqual(expect.objectContaining({
      actorType: 'SYSTEM',
      actorRef: `system:${route}`,
      policyRef: routeConfig.policyRef,
    }));
    expect(result.createdAt).toBe(occurredAt);
    expect(result.correlationId).toBe('claim-item-source:test-correlation');
    expect(result.causationId).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sourceIdentity)).toBe(true);
    expect(Object.isFrozen(result.provenance.evidenceRefs)).toBe(true);
    expect(Object.isFrozen(result.canonicalSourceMetadata)).toBe(true);
  });

  it('binds an approved CaseDocument to requester, approver, correlation and causation evidence', () => {
    const result = buildClaimItemSourceProvenanceV1({
      ingress: 'CASE_DOCUMENT',
      envelope: envelope({
        actor: { type: 'HUMAN', userId: 'requester-1' },
        sourceType: 'USER_DOCUMENT',
        sourceId: 'document-1',
        policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
        approvalRequestId: 'approval-1',
        correlationId: 'claim-item-approval:approval-1',
        causationId: 'office-approval:approval-1',
      }),
      sourceSlot: 'SOZLESME:PRINCIPAL',
    });

    expect(result.sourceIdentity).toEqual(expect.objectContaining({
      sourceType: 'CASE_DOCUMENT',
      sourceId: 'document-1',
      sourceSlot: 'SOZLESME:PRINCIPAL',
    }));
    expect(result.provenance.generationClass).toBe('HUMAN_GENERATED_CLAIM_ITEM');
    expect(result.createdByAuthority).toEqual({
      actorType: 'HUMAN',
      actorRef: 'user:requester-1',
      policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
      legalBasisRef: null,
      approvalRequestId: 'approval-1',
    });
    expect(result.correlationId).toBe('claim-item-approval:approval-1');
    expect(result.causationId).toBe('office-approval:approval-1');
    expect(result.canonicalSourceMetadata.executionBoundary).toBe(
      'OFFICE_APPROVAL_EXECUTOR',
    );
  });

  it('normalizes routed Due and authorized backfill to one immutable source identity', () => {
    const routed = buildClaimItemSourceProvenanceV1({
      ingress: 'DUE',
      envelope: envelope({
        actor: { type: 'SYSTEM', system: 'DUE_BRIDGE' },
        sourceType: 'DUE_BRIDGE',
        sourceId: 'due-1',
        policyRef: 'REC-AUTH-008',
      }),
    });
    const backfill = buildClaimItemSourceProvenanceV1({
      ingress: 'BACKFILL',
      envelope: envelope({
        actor: { type: 'SYSTEM', system: 'DUE_BACKFILL' },
        sourceType: 'DUE_BACKFILL',
        sourceId: 'due-1',
        policyRef: 'REC-AUTH-008',
      }),
    });

    expect(backfill.sourceIdentity.sourceType).toBe('DUE');
    expect(backfill.sourceIdentity.identityHash).toBe(routed.sourceIdentity.identityHash);
    expect(backfill.canonicalSourceMetadata.executionBoundary).toBe(
      'AUTHORIZED_BACKFILL_SCRIPT',
    );
    expect(backfill.canonicalSourceMetadata.writerRoute).toBeNull();
  });

  it.each([
    ['source type', 'DUE' as ConcreteClaimItemIngressSource, envelope({
      actor: { type: 'SYSTEM', system: 'DUE_BRIDGE' },
      sourceType: 'WRONG_SOURCE',
      sourceId: 'due-1',
      policyRef: 'REC-AUTH-008',
    })],
    ['actor route', 'DUE' as ConcreteClaimItemIngressSource, envelope({
      actor: { type: 'SYSTEM', system: 'RULE_ENGINE_GENERATOR' },
      sourceType: 'DUE_BRIDGE',
      sourceId: 'due-1',
      policyRef: 'REC-AUTH-008',
    })],
    ['approval authority', 'CASE_DOCUMENT' as ConcreteClaimItemIngressSource, envelope({
      actor: { type: 'HUMAN', userId: 'requester-1' },
      sourceType: 'USER_DOCUMENT',
      sourceId: 'document-1',
      policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
    })],
  ])('rejects mismatched %s fail-closed', (_case, ingress, invalidEnvelope) => {
    expect(() => buildClaimItemSourceProvenanceV1({
      ingress,
      envelope: invalidEnvelope,
    })).toThrow(ClaimItemSourceProvenanceValidationError);
  });
});
