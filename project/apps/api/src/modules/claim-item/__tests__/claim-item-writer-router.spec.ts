import { ForbiddenException } from '@nestjs/common';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';
import { CLAIM_ITEM_SYSTEM_WRITER_ROUTES } from '../claim-item-writer-routes';

describe('RCV-P2-WS01-P03 ClaimItemWriterRouterService', () => {
  const routes = Object.keys(CLAIM_ITEM_SYSTEM_WRITER_ROUTES) as Array<
    keyof typeof CLAIM_ITEM_SYSTEM_WRITER_ROUTES
  >;

  function setup(outcome: 'DIRECT_ALLOWED' | 'DENIED') {
    const transaction: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
      due: { findFirst: jest.fn().mockResolvedValue({ id: 'due-1' }) },
      caseInstrument: { findFirst: jest.fn().mockResolvedValue({ id: 'instrument-1' }) },
      caseDocument: { findFirst: jest.fn().mockResolvedValue({ id: 'document-1' }) },
      precautionaryCost: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cost-1',
          claimItemId: null,
          precautionaryOrder: { id: 'order-1', tenantId: 'tenant-1', caseId: 'case-1' },
        }),
      },
      claimItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      },
    };
    const prisma: any = {
      ...transaction,
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(transaction)),
    };
    const gate: any = {
      evaluate: jest.fn().mockResolvedValue(
        outcome === 'DIRECT_ALLOWED'
          ? {
              outcome: 'DIRECT_ALLOWED',
              actorType: 'SYSTEM',
              permission: 'SYSTEM_ROUTE',
              permissionSource: 'DUE_BRIDGE',
              approvalRequired: false,
              scope: { tenantId: 'tenant-1', caseId: 'case-1' },
            }
          : {
              outcome: 'DENIED',
              actorType: 'SYSTEM',
              reasonCode: 'TENANT_CASE_SCOPE_MISMATCH',
              approvalRequired: false,
              scope: { tenantId: 'tenant-1', caseId: 'case-1' },
            },
      ),
    };
    return { router: new ClaimItemWriterRouterService(prisma, gate), prisma, transaction, gate };
  }

  function createInput(route: keyof typeof CLAIM_ITEM_SYSTEM_WRITER_ROUTES) {
    const base = {
      route,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      initiatedByUserId: 'requester-1',
      currency: 'TRY',
    };
    switch (route) {
      case 'DUE_BRIDGE':
        return {
          ...base,
          sourceId: 'due-1',
          data: {
            tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100,
            metadata: { dueSync: { sourceDueId: 'due-1' } },
          },
        };
      case 'CASE_INSTRUMENT_GENERATOR':
        return {
          ...base,
          sourceId: 'instrument-1',
          data: {
            tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100,
            instrumentId: 'instrument-1',
          },
        };
      case 'DOCUMENT_AUTO_GENERATOR':
        return {
          ...base,
          sourceId: 'document-1',
          sourceSlot: 'CEK:0:PRINCIPAL',
          data: {
            tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100,
            sourceDocumentId: 'document-1',
          },
        };
      case 'RULE_ENGINE_GENERATOR':
        return {
          ...base,
          sourceId: 'case-1',
          sourceSlot: 'ILAMSIZ_GENEL:0:PRINCIPAL',
          data: { tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100 },
        };
      case 'PRECAUTIONARY_COST_WRITER':
        return {
          ...base,
          sourceId: 'cost-1',
          data: {
            tenantId: 'tenant-1', caseId: 'case-1', itemType: 'EXPENSE', amount: 100,
            sourceProcess: 'PRECAUTIONARY', sourceProcessId: 'order-1',
          },
        };
    }
  }

  it.each(routes)('%s persists only after an explicit system direct-allow', async (route) => {
    const { router, prisma, gate } = setup('DIRECT_ALLOWED');

    await router.createSystemClaimItem(createInput(route));

    expect(gate.evaluate).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.claimItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.claimItem.create.mock.calls[0][0].data.metadata).toEqual(
      expect.objectContaining({
        canonicalSourceProvenance: expect.objectContaining({
          version: 1,
          provenance: expect.objectContaining({
            ingress: expect.any(String),
            generationClass: 'SYSTEM_GENERATED_CLAIM_ITEM',
          }),
          createdByAuthority: expect.objectContaining({
            actorType: 'SYSTEM',
            actorRef: `system:${route}`,
          }),
          correlationId: expect.stringMatching(/^claim-item-source:/),
          causationId: null,
        }),
      }),
    );
  });

  it.each(routes)('%s performs no write when authorization is denied', async (route) => {
    const { router, prisma } = setup('DENIED');

    await expect(router.createSystemClaimItem({
      route,
      tenantId: 'tenant-other',
      caseId: 'case-1',
      sourceId: `source:${route}`,
      initiatedByUserId: 'requester-1',
      data: { tenantId: 'tenant-other', caseId: 'case-1', itemType: 'PRINCIPAL', amount: 100 },
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.claimItem.create).not.toHaveBeenCalled();
  });

  it('includes serialized temporal payload values in the idempotency fingerprint', async () => {
    const { router, gate } = setup('DIRECT_ALLOWED');
    const base = {
      route: 'DUE_BRIDGE' as const,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      sourceId: 'due-1',
      initiatedByUserId: 'requester-1',
      currency: 'TRY',
    };

    await router.createSystemClaimItem({
      ...base,
      data: {
        tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL',
        dueDate: new Date('2026-01-01'), metadata: { dueSync: { sourceDueId: 'due-1' } },
      },
    });
    await router.createSystemClaimItem({
      ...base,
      data: {
        tenantId: 'tenant-1', caseId: 'case-1', itemType: 'PRINCIPAL',
        dueDate: new Date('2026-02-01'), metadata: { dueSync: { sourceDueId: 'due-1' } },
      },
    });

    const first = gate.evaluate.mock.calls[0][0].envelope.idempotencyKey;
    const second = gate.evaluate.mock.calls[1][0].envelope.idempotencyKey;
    expect(first).not.toBe(second);
    expect(gate.evaluate.mock.calls[0][0].envelope.correlationId).toBe(
      gate.evaluate.mock.calls[1][0].envelope.correlationId,
    );
  });

  it('preserves an explicit causation reference in the persisted provenance contract', async () => {
    const { router, prisma } = setup('DIRECT_ALLOWED');

    await router.createSystemClaimItem({
      ...createInput('DUE_BRIDGE'),
      causationId: 'event:due-created-1',
    });

    expect(
      prisma.claimItem.create.mock.calls[0][0].data.metadata.canonicalSourceProvenance
        .causationId,
    ).toBe('event:due-created-1');
  });
});
