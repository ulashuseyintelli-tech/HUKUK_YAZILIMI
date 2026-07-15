import { buildCanonicalWriteEnvelopeV1 } from '../../../common/canonical-write-envelope';
import {
  ClaimItemSourceIntegrityException,
  ClaimItemSourceIntegrityGuard,
} from '../claim-item-source-integrity.guard';
import {
  CLAIM_ITEM_SYSTEM_WRITER_ROUTES,
  type ClaimItemSystemWriterRoute,
} from '../claim-item-writer-routes';

describe('RCV-P2-WS01-P04 ClaimItem source integrity guard', () => {
  function systemEnvelope(route: ClaimItemSystemWriterRoute, sourceId: string) {
    const routeConfig = CLAIM_ITEM_SYSTEM_WRITER_ROUTES[route];
    return buildCanonicalWriteEnvelopeV1({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      target: { aggregateType: 'ClaimItem' as const },
      actor: { type: 'SYSTEM', system: route },
      correlationId: `test-correlation:${route}:${sourceId}`,
      idempotencyKey: `test-idempotency:${route}:${sourceId}`,
      occurredAt: '2026-07-15T00:00:00.000Z',
      effectiveAt: '2026-07-15T00:00:00.000Z',
      source: {
        sourceType: routeConfig.sourceType,
        sourceId,
        evidenceRefs: ['user:test-requester'],
      },
      authority: { policyRef: routeConfig.policyRef },
    });
  }

  function setup() {
    const database: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
      due: { findFirst: jest.fn().mockResolvedValue({ id: 'due-1', caseId: 'case-1' }) },
      caseInstrument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'instrument-1' }),
      },
      caseDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'document-1' }),
      },
      precautionaryCost: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cost-1',
          claimItemId: null,
          precautionaryOrder: {
            id: 'order-1',
            tenantId: 'tenant-1',
            caseId: 'case-1',
          },
        }),
      },
      claimItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return { guard: new ClaimItemSourceIntegrityGuard(), database };
  }

  const dueData = {
    tenantId: 'tenant-1',
    caseId: 'case-1',
    itemType: 'PRINCIPAL',
    amount: 100,
    metadata: { dueSync: { sourceDueId: 'due-1' } },
  };

  it('locks the canonical identity and preserves existing metadata while adding provenance', async () => {
    const { guard, database } = setup();

    const data = await guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: dueData,
      },
      database,
    );

    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
    expect(data.metadata).toEqual(expect.objectContaining({
      dueSync: { sourceDueId: 'due-1' },
      canonicalWriterSource: expect.objectContaining({
        version: 1,
        authority: 'DUE_BRIDGE',
        sourceId: 'due-1',
        sourceSlot: 'PRIMARY',
      }),
      canonicalSourceProvenance: expect.objectContaining({
        version: 1,
        sourceIdentity: expect.objectContaining({
          sourceType: 'DUE',
          sourceId: 'due-1',
          sourceSlot: 'PRIMARY',
        }),
        provenance: expect.objectContaining({
          ingress: 'DUE',
          generationClass: 'SYSTEM_GENERATED_CLAIM_ITEM',
        }),
      }),
    }));
  });

  it('fails closed when the source record is outside the command case', async () => {
    const { guard, database } = setup();
    database.due.findFirst.mockResolvedValue(null);

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-other-case',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-other-case'),
        data: {
          ...dueData,
          metadata: { dueSync: { sourceDueId: 'due-other-case' } },
        },
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'SOURCE_SCOPE_MISMATCH',
    });
  });

  it('rejects a source id that is not bound by the ClaimItem payload', async () => {
    const { guard, database } = setup();

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: {
          ...dueData,
          metadata: { dueSync: { sourceDueId: 'due-2' } },
        },
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'SOURCE_PAYLOAD_MISMATCH',
    });
  });

  it('rejects a second legacy Due marker for the same source', async () => {
    const { guard, database } = setup();
    database.claimItem.findMany.mockResolvedValue([{ id: 'claim-existing' }]);

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: dueData,
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUPLICATE_SOURCE_IDENTITY',
    });
  });

  it('fails closed when a Due source has multiple live markers', async () => {
    const { guard, database } = setup();
    database.claimItem.findMany.mockResolvedValue([
      { id: 'claim-existing-1' },
      { id: 'claim-existing-2' },
    ]);

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: dueData,
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MULTIPLE_LIVE_MARKERS',
    });
  });

  it('distinguishes a Due retry from a changed payload conflict', async () => {
    const { guard, database } = setup();
    const first = await guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: dueData,
      },
      database,
    );
    database.claimItem.findMany.mockResolvedValue([{ id: 'claim-existing' }]);
    database.claimItem.findFirst.mockResolvedValue({
      id: 'claim-existing',
      metadata: first.metadata,
    });

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: dueData,
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUPLICATE_SOURCE_IDENTITY',
    });

    await expect(guard.prepareSystemCreate(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        envelope: systemEnvelope('DUE_BRIDGE', 'due-1'),
        data: { ...dueData, amount: 200 },
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'SOURCE_PAYLOAD_CONFLICT',
    });
  });

  it('distinguishes a retry from a changed payload conflict for a canonical marker', async () => {
    const { guard, database } = setup();
    const first = await guard.prepareSystemCreate(
      {
        route: 'RULE_ENGINE_GENERATOR',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'case-1',
        sourceSlot: 'ILAMSIZ_GENEL:0:PRINCIPAL',
        envelope: systemEnvelope('RULE_ENGINE_GENERATOR', 'case-1'),
        data: { tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100 },
      },
      database,
    );
    database.claimItem.findFirst.mockResolvedValue({ id: 'claim-existing', metadata: first.metadata });

    await expect(guard.prepareSystemCreate(
      {
        route: 'RULE_ENGINE_GENERATOR',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'case-1',
        sourceSlot: 'ILAMSIZ_GENEL:0:PRINCIPAL',
        envelope: systemEnvelope('RULE_ENGINE_GENERATOR', 'case-1'),
        data: { tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100 },
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUPLICATE_SOURCE_IDENTITY',
    });

    await expect(guard.prepareSystemCreate(
      {
        route: 'RULE_ENGINE_GENERATOR',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'case-1',
        sourceSlot: 'ILAMSIZ_GENEL:0:PRINCIPAL',
        envelope: systemEnvelope('RULE_ENGINE_GENERATOR', 'case-1'),
        data: { tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 200 },
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'SOURCE_PAYLOAD_CONFLICT',
    });
  });

  it('classifies equivalent rule retries as duplicate despite a new calculatedAt timestamp', async () => {
    const { guard, database } = setup();
    const input = {
      route: 'RULE_ENGINE_GENERATOR' as const,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      sourceId: 'case-1',
      sourceSlot: 'ILAMSIZ_GENEL:0:PRINCIPAL',
      envelope: systemEnvelope('RULE_ENGINE_GENERATOR', 'case-1'),
    };
    const first = await guard.prepareSystemCreate({
      ...input,
      data: {
        tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100,
        calculatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    }, database);
    database.claimItem.findFirst.mockResolvedValue({ id: 'claim-existing', metadata: first.metadata });

    await expect(guard.prepareSystemCreate({
      ...input,
      data: {
        tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100,
        calculatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    }, database)).rejects.toMatchObject({ conflictCode: 'DUPLICATE_SOURCE_IDENTITY' });
  });

  it('rejects a Due update when the target ClaimItem is bound to another source', async () => {
    const { guard, database } = setup();
    database.claimItem.findFirst.mockResolvedValue({
      id: 'claim-1',
      metadata: { dueSync: { sourceDueId: 'due-2' } },
    });

    await expect(guard.assertSystemMutation(
      {
        route: 'DUE_BRIDGE',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'due-1',
        claimItemId: 'claim-1',
      },
      database,
    )).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'SOURCE_BINDING_MISMATCH',
    });
  });

  it('validates instrument, document and precautionary source ownership and payload binding', async () => {
    const { guard, database } = setup();

    await expect(guard.prepareSystemCreate({
      route: 'CASE_INSTRUMENT_GENERATOR', tenantId: 'tenant-1', caseId: 'case-1',
      sourceId: 'instrument-1', envelope: systemEnvelope('CASE_INSTRUMENT_GENERATOR', 'instrument-1'),
      data: { tenantId: 'tenant-1', caseId: 'case-1', instrumentId: 'other' },
    }, database)).rejects.toMatchObject({ conflictCode: 'SOURCE_PAYLOAD_MISMATCH' });

    await expect(guard.prepareSystemCreate({
      route: 'DOCUMENT_AUTO_GENERATOR', tenantId: 'tenant-1', caseId: 'case-1',
      sourceId: 'document-1', sourceSlot: 'CEK:0:PRINCIPAL',
      envelope: systemEnvelope('DOCUMENT_AUTO_GENERATOR', 'document-1'),
      data: { tenantId: 'tenant-1', caseId: 'case-1', sourceDocumentId: 'other', itemType: 'PRINCIPAL' },
    }, database)).rejects.toMatchObject({ conflictCode: 'SOURCE_PAYLOAD_MISMATCH' });

    await expect(guard.prepareSystemCreate({
      route: 'PRECAUTIONARY_COST_WRITER', tenantId: 'tenant-1', caseId: 'case-1',
      sourceId: 'cost-1',
      envelope: systemEnvelope('PRECAUTIONARY_COST_WRITER', 'cost-1'),
      data: { tenantId: 'tenant-1', caseId: 'case-1', sourceProcess: 'PRECAUTIONARY', sourceProcessId: 'other' },
    }, database)).rejects.toMatchObject({ conflictCode: 'SOURCE_PAYLOAD_MISMATCH' });
  });
});
