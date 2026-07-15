import { ForbiddenException } from '@nestjs/common';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';
import { CLAIM_ITEM_SYSTEM_WRITER_ROUTES } from '../claim-item-writer-routes';

describe('RCV-P2-WS01-P03 ClaimItemWriterRouterService', () => {
  const routes = Object.keys(CLAIM_ITEM_SYSTEM_WRITER_ROUTES) as Array<
    keyof typeof CLAIM_ITEM_SYSTEM_WRITER_ROUTES
  >;

  function setup(outcome: 'DIRECT_ALLOWED' | 'DENIED') {
    const prisma: any = {
      claimItem: {
        create: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      },
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
    return { router: new ClaimItemWriterRouterService(prisma, gate), prisma, gate };
  }

  it.each(routes)('%s persists only after an explicit system direct-allow', async (route) => {
    const { router, prisma, gate } = setup('DIRECT_ALLOWED');

    await router.createSystemClaimItem({
      route,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      sourceId: `source:${route}`,
      initiatedByUserId: 'requester-1',
      data: { tenantId: 'tenant-1', caseId: 'case-1', amount: 100 },
      currency: 'TRY',
    });

    expect(gate.evaluate).toHaveBeenCalledTimes(1);
    expect(prisma.claimItem.create).toHaveBeenCalledTimes(1);
  });

  it.each(routes)('%s performs no write when authorization is denied', async (route) => {
    const { router, prisma } = setup('DENIED');

    await expect(router.createSystemClaimItem({
      route,
      tenantId: 'tenant-other',
      caseId: 'case-1',
      sourceId: `source:${route}`,
      initiatedByUserId: 'requester-1',
      data: { tenantId: 'tenant-other', caseId: 'case-1', amount: 100 },
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
      data: { tenantId: 'tenant-1', caseId: 'case-1', dueDate: new Date('2026-01-01') },
    });
    await router.createSystemClaimItem({
      ...base,
      data: { tenantId: 'tenant-1', caseId: 'case-1', dueDate: new Date('2026-02-01') },
    });

    const first = gate.evaluate.mock.calls[0][0].envelope.idempotencyKey;
    const second = gate.evaluate.mock.calls[1][0].envelope.idempotencyKey;
    expect(first).not.toBe(second);
  });
});
