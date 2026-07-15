import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { type CanonicalWriteActor } from '../../../common/canonical-write-envelope';
import { CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE } from '../claim-item-approval.constants';
import { buildClaimItemWriteCommand } from '../claim-item-write-command';
import { ClaimItemWriteGateService } from '../claim-item-write-gate.service';
import { CLAIM_ITEM_SYSTEM_WRITER_ROUTES } from '../claim-item-writer-routes';

const occurredAt = '2026-07-15T08:00:00.000Z';

function command(input: {
  operation?: 'CREATE' | 'UPDATE' | 'CANCEL';
  tenantId?: string;
  caseId?: string;
  actor?: CanonicalWriteActor;
  payload?: Record<string, unknown>;
  sourceType?: string;
  policyRef?: string;
} = {}) {
  const operation = input.operation ?? 'UPDATE';
  const caseId = input.caseId ?? 'case-1';
  return buildClaimItemWriteCommand({
    operation,
    ...(operation === 'CREATE' ? {} : { claimItemId: 'claim-1' }),
    envelope: {
      tenantId: input.tenantId ?? 'tenant-1',
      caseId,
      actor: input.actor ?? { type: 'HUMAN', userId: 'user-1' },
      correlationId: 'request:rcv-p02-1',
      idempotencyKey: `claim-item:${operation.toLowerCase()}:rcv-p02-1`,
      occurredAt,
      effectiveAt: occurredAt,
      source: {
        sourceType: input.sourceType ?? 'USER_COMMAND',
        sourceId: 'request:rcv-p02-1',
        evidenceRefs: [],
      },
      authority: { policyRef: input.policyRef ?? 'CLAIM_ITEM_WRITE_POLICY_V1' },
      currency: 'TRY',
    },
    payload:
      input.payload ??
      (operation === 'CREATE'
        ? { caseId, amount: 1000 }
        : operation === 'CANCEL'
          ? {}
          : { description: 'metadata' }),
  });
}

function makeGate(input: {
  user?: unknown;
  caseInScope?: unknown;
  claimItemInScope?: unknown;
  lawyerAssignment?: unknown;
  staffAssignment?: unknown;
} = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        input.user === undefined
          ? {
              tenantId: 'tenant-1',
              isActive: true,
              lawyer: { id: 'lawyer-1', tenantId: 'tenant-1', isActive: true },
              staffMember: null,
            }
          : input.user,
      ),
    },
    case: {
      findFirst: jest.fn().mockResolvedValue(
        input.caseInScope === undefined ? { id: 'case-1' } : input.caseInScope,
      ),
    },
    claimItem: {
      findFirst: jest.fn().mockResolvedValue(
        input.claimItemInScope === undefined
          ? { id: 'claim-1' }
          : input.claimItemInScope,
      ),
    },
    caseLawyer: {
      findFirst: jest.fn().mockResolvedValue(
        input.lawyerAssignment === undefined
          ? { casePermissions: { canEditFinance: true } }
          : input.lawyerAssignment,
      ),
    },
    caseStaff: {
      findFirst: jest.fn().mockResolvedValue(
        input.staffAssignment === undefined ? { canEdit: true } : input.staffAssignment,
      ),
    },
  };
  return { gate: new ClaimItemWriteGateService(prisma), prisma };
}

describe('RCV-P2-WS01-P02 ClaimItemWriteGateService', () => {
  it('Nest dependency injection boundary resolves with PrismaService', async () => {
    const prisma = makeGate().prisma;
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClaimItemWriteGateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    expect(moduleRef.get(ClaimItemWriteGateService)).toBeInstanceOf(
      ClaimItemWriteGateService,
    );
  });

  it('explicit lawyer case finance grant allows only a low-impact direct update', async () => {
    const { gate, prisma } = makeGate();

    const result = await gate.evaluate(command());

    expect(result).toEqual({
      outcome: 'DIRECT_ALLOWED',
      actorType: 'HUMAN',
      permission: 'EDIT_FINANCE',
      permissionSource: 'CASE_LAWYER',
      approvalRequired: false,
      scope: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        claimItemId: 'claim-1',
      },
    });
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.claimItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'claim-1', tenantId: 'tenant-1', caseId: 'case-1' },
      select: { id: true },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.scope)).toBe(true);
  });

  it.each([
    ['CREATE', { caseId: 'case-1', amount: 1000 }],
    ['UPDATE', { amount: 1200 }],
    ['CANCEL', {}],
  ] as const)(
    '%s high-impact command is routed to the existing OfficeApproval action',
    async (operation, payload) => {
      const { gate } = makeGate();

      await expect(
        gate.evaluate(command({ operation, payload })),
      ).resolves.toMatchObject({
        outcome: 'OFFICE_APPROVAL_REQUIRED',
        actorType: 'HUMAN',
        permission: 'EDIT_FINANCE',
        permissionSource: 'CASE_LAWYER',
        approvalRequired: true,
        approvalActionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      });
    },
  );

  it('cross-tenant or missing case fails closed before target and permission reads', async () => {
    const { gate, prisma } = makeGate({ caseInScope: null });

    await expect(gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'TENANT_CASE_SCOPE_MISMATCH',
    });
    expect(prisma.claimItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.caseLawyer.findFirst).not.toHaveBeenCalled();
  });

  it('ClaimItem must belong to both the envelope tenant and case', async () => {
    const { gate, prisma } = makeGate({ claimItemInScope: null });

    await expect(gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'CLAIM_ITEM_SCOPE_MISMATCH',
    });
    expect(prisma.caseLawyer.findFirst).not.toHaveBeenCalled();
  });

  it('CREATE payload cannot contradict the envelope case scope', async () => {
    const { gate, prisma } = makeGate();

    await expect(
      gate.evaluate(
        command({
          operation: 'CREATE',
          payload: { caseId: 'foreign-case', amount: 1000 },
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'PAYLOAD_SCOPE_MISMATCH',
    });
    expect(prisma.caseLawyer.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    [
      'cross-tenant user',
      {
        tenantId: 'tenant-2',
        isActive: true,
        lawyer: { id: 'lawyer-1', tenantId: 'tenant-2', isActive: true },
        staffMember: null,
      },
    ],
    [
      'inactive user',
      {
        tenantId: 'tenant-1',
        isActive: false,
        lawyer: { id: 'lawyer-1', tenantId: 'tenant-1', isActive: true },
        staffMember: null,
      },
    ],
    [
      'inactive profile',
      {
        tenantId: 'tenant-1',
        isActive: true,
        lawyer: { id: 'lawyer-1', tenantId: 'tenant-1', isActive: false },
        staffMember: null,
      },
    ],
  ])('%s is denied before any resource lookup', async (_label, user) => {
    const { gate, prisma } = makeGate({ user });

    await expect(gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT',
    });
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('missing or ambiguous human profile fails closed', async () => {
    const noProfile = makeGate({
      user: {
        tenantId: 'tenant-1',
        isActive: true,
        lawyer: null,
        staffMember: null,
      },
    });
    const ambiguous = makeGate({
      user: {
        tenantId: 'tenant-1',
        isActive: true,
        lawyer: { id: 'lawyer-1', tenantId: 'tenant-1', isActive: true },
        staffMember: {
          id: 'staff-1',
          tenantId: 'tenant-1',
          isActive: true,
          canSeeFinance: true,
        },
      },
    });

    await expect(noProfile.gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'HUMAN_ACTOR_PROFILE_INVALID',
    });
    await expect(ambiguous.gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'HUMAN_ACTOR_PROFILE_INVALID',
    });
  });

  it('approval eligibility or title does not replace explicit object permission', async () => {
    const { gate } = makeGate({
      lawyerAssignment: { casePermissions: { canEditFinance: false } },
    });

    await expect(gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'OBJECT_PERMISSION_DENIED',
    });
  });

  it('active staff requires both finance visibility and object-scoped canEdit', async () => {
    const staff = {
      tenantId: 'tenant-1',
      isActive: true,
      lawyer: null,
      staffMember: {
        id: 'staff-1',
        tenantId: 'tenant-1',
        isActive: true,
        canSeeFinance: true,
      },
    };
    const allowed = makeGate({ user: staff, staffAssignment: { canEdit: true } });
    const denied = makeGate({ user: staff, staffAssignment: { canEdit: false } });

    await expect(allowed.gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DIRECT_ALLOWED',
      permissionSource: 'CASE_STAFF',
    });
    await expect(denied.gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'OBJECT_PERMISSION_DENIED',
    });
  });

  it('staff object assignment alone cannot bypass missing finance visibility', async () => {
    const { gate, prisma } = makeGate({
      user: {
        tenantId: 'tenant-1',
        isActive: true,
        lawyer: null,
        staffMember: {
          id: 'staff-1',
          tenantId: 'tenant-1',
          isActive: true,
          canSeeFinance: false,
        },
      },
      staffAssignment: { canEdit: true },
    });

    await expect(gate.evaluate(command())).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode: 'OBJECT_PERMISSION_DENIED',
    });
    expect(prisma.caseStaff.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    [
      { type: 'SYSTEM', system: 'DUE_BRIDGE' } as const,
      'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED',
    ],
    [
      { type: 'EXTERNAL', externalSystem: 'UYAP' } as const,
      'EXTERNAL_ACTOR_AUTHORITY_NOT_ROUTED',
    ],
  ])('unrouted %s actor is classified and denied', async (actor, reasonCode) => {
    const { gate, prisma } = makeGate();

    await expect(gate.evaluate(command({ actor }))).resolves.toMatchObject({
      outcome: 'DENIED',
      actorType: actor.type,
      reasonCode,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(Object.entries(CLAIM_ITEM_SYSTEM_WRITER_ROUTES))(
    '%s exact route source/policy is directly allowed for its declared operation',
    async (routeName, route) => {
      const { gate, prisma } = makeGate();
      const operation = route.operations[0];

      await expect(gate.evaluate(command({
        operation,
        actor: { type: 'SYSTEM', system: routeName },
        sourceType: route.sourceType,
        policyRef: route.policyRef,
      }))).resolves.toMatchObject({
        outcome: 'DIRECT_ALLOWED',
        actorType: 'SYSTEM',
        permission: 'SYSTEM_ROUTE',
        permissionSource: routeName,
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(Object.entries(CLAIM_ITEM_SYSTEM_WRITER_ROUTES))(
    '%s fails closed on cross-tenant/case scope',
    async (routeName, route) => {
      const { gate } = makeGate({ caseInScope: null });
      const operation = route.operations[0];

      await expect(gate.evaluate(command({
        operation,
        actor: { type: 'SYSTEM', system: routeName },
        sourceType: route.sourceType,
        policyRef: route.policyRef,
      }))).resolves.toMatchObject({
        outcome: 'DENIED',
        actorType: 'SYSTEM',
        reasonCode: 'TENANT_CASE_SCOPE_MISMATCH',
      });
    },
  );

  it.each(Object.entries(CLAIM_ITEM_SYSTEM_WRITER_ROUTES))(
    '%s actor cannot use a mismatched source/authority contract',
    async (routeName, route) => {
      const { gate, prisma } = makeGate();

      await expect(gate.evaluate(command({
        operation: route.operations[0],
        actor: { type: 'SYSTEM', system: routeName },
        sourceType: `${route.sourceType}:UNAUTHORIZED`,
        policyRef: route.policyRef,
      }))).resolves.toMatchObject({
        outcome: 'DENIED',
        actorType: 'SYSTEM',
        reasonCode: 'SYSTEM_ACTOR_AUTHORITY_NOT_ROUTED',
      });
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{}, 'EMPTY_UPDATE_PAYLOAD'],
    [{ internalOnly: true }, 'UNSUPPORTED_UPDATE_FIELD'],
  ])('invalid update payload %s is denied, never treated as direct', async (payload, reasonCode) => {
    const { gate } = makeGate();

    await expect(gate.evaluate(command({ payload }))).resolves.toMatchObject({
      outcome: 'DENIED',
      reasonCode,
    });
  });

  it('dependency failure aborts evaluation instead of producing an allow decision', async () => {
    const { gate, prisma } = makeGate();
    prisma.user.findUnique.mockRejectedValueOnce(new Error('identity store unavailable'));

    await expect(gate.evaluate(command())).rejects.toThrow('identity store unavailable');
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });
});
