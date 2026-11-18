import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { type CanonicalWriteActor } from '../../../common/canonical-write-envelope';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS,
  CLAIM_ITEM_LOW_IMPACT_USER_FIELDS,
} from '../claim-item-approval.constants';
import { buildClaimItemWriteCommand } from '../claim-item-write-command';
import { ClaimItemWriteGateService } from '../claim-item-write-gate.service';
import { CLAIM_ITEM_SYSTEM_WRITER_ROUTES, DUE_BRIDGE_UPDATE_FIELDS } from '../claim-item-writer-routes';

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

  /**
   * Owner kararı 18.11.2026 (K1): Due köprüsü kullanıcı isteğiyle tetiklenir; bağlı kanonik kalemde yalnız düşük
   * etkili alanları güncelleyebilir. Yüksek etkili alan taşıyan DUE_BRIDGE UPDATE yükü kapıda reddedilir.
   */
  describe('DUE_BRIDGE UPDATE alan süzgeci', () => {
    const dueBridge = (payload: Record<string, unknown>) =>
      command({
        operation: 'UPDATE',
        actor: { type: 'SYSTEM', system: 'DUE_BRIDGE' },
        sourceType: CLAIM_ITEM_SYSTEM_WRITER_ROUTES.DUE_BRIDGE.sourceType,
        policyRef: CLAIM_ITEM_SYSTEM_WRITER_ROUTES.DUE_BRIDGE.policyRef,
        payload,
      });

    it('rota yalnız düşük etkili alanları bildirir', () => {
      expect(CLAIM_ITEM_SYSTEM_WRITER_ROUTES.DUE_BRIDGE.updateFields).toEqual(['description', 'sortOrder']);
      expect(DUE_BRIDGE_UPDATE_FIELDS.every((field) => (CLAIM_ITEM_LOW_IMPACT_USER_FIELDS as readonly string[]).includes(field))).toBe(true);
      expect(DUE_BRIDGE_UPDATE_FIELDS.some((field) => (CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS as readonly string[]).includes(field))).toBe(false);
    });

    it.each([{ description: 'metin' }, { sortOrder: 3 }, { description: null, sortOrder: 1 }])(
      'düşük etkili yük %j doğrudan izinlidir',
      async (payload) => {
        const { gate } = makeGate();
        await expect(gate.evaluate(dueBridge(payload))).resolves.toMatchObject({
          outcome: 'DIRECT_ALLOWED',
          actorType: 'SYSTEM',
          permissionSource: 'DUE_BRIDGE',
        });
      },
    );

    it.each(CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS.map((field) => [field]))(
      'yüksek etkili alan %s taşıyan yük reddedilir (kapsam sorgusu bile yapılmaz)',
      async (field) => {
        const { gate, prisma } = makeGate();
        await expect(gate.evaluate(dueBridge({ description: 'metin', [field]: 'x' }))).resolves.toMatchObject({
          outcome: 'DENIED',
          actorType: 'SYSTEM',
          reasonCode: 'UNSUPPORTED_UPDATE_FIELD',
        });
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
      },
    );

    it('süzgeç yalnız UPDATE içindir: CREATE yükü etkilenmez', async () => {
      const { gate } = makeGate();
      await expect(gate.evaluate(command({
        operation: 'CREATE',
        actor: { type: 'SYSTEM', system: 'DUE_BRIDGE' },
        sourceType: CLAIM_ITEM_SYSTEM_WRITER_ROUTES.DUE_BRIDGE.sourceType,
        policyRef: CLAIM_ITEM_SYSTEM_WRITER_ROUTES.DUE_BRIDGE.policyRef,
        payload: { caseId: 'case-1', amount: 1000, interestStartDate: '2026-01-02' },
      }))).resolves.toMatchObject({ outcome: 'DIRECT_ALLOWED', permissionSource: 'DUE_BRIDGE' });
    });
  });

  /**
   * Dosya düzeyi mali yazma yetkisi (K3): kalem insan yazma kapısıyla AYNI yüklem; Due oluşturma / güncelleme /
   * silme bunu kullanır. Yalnız aynı büroda bulunmak, rütbe ya da rol yetki üretmez.
   */
  describe('evaluateHumanCaseFinanceWrite', () => {
    const input = { tenantId: 'tenant-1', caseId: 'case-1', actorUserId: 'user-1' };
    const staffUser = (canSeeFinance: boolean) => ({
      tenantId: 'tenant-1',
      isActive: true,
      lawyer: null,
      staffMember: { id: 'staff-1', tenantId: 'tenant-1', isActive: true, canSeeFinance },
    });

    it('dosyada mali düzenleme izni olan avukat izinlidir', async () => {
      const { gate, prisma } = makeGate();
      await expect(gate.evaluateHumanCaseFinanceWrite(input)).resolves.toEqual({
        allowed: true,
        permission: 'EDIT_FINANCE',
        permissionSource: 'CASE_LAWYER',
      });
      expect(prisma.caseLawyer.findFirst).toHaveBeenCalledWith({
        where: { caseId: 'case-1', lawyerId: 'lawyer-1' },
        select: { casePermissions: true },
      });
      expect(prisma.claimItem.findFirst).not.toHaveBeenCalled();
    });

    it('mali modülü açık ve dosyada düzenleme izni olan personel izinlidir', async () => {
      const { gate } = makeGate({ user: staffUser(true), staffAssignment: { canEdit: true } });
      await expect(gate.evaluateHumanCaseFinanceWrite(input)).resolves.toMatchObject({ allowed: true, permissionSource: 'CASE_STAFF' });
    });

    it.each([
      ['dosyaya atanmamış avukat', { lawyerAssignment: null }, 'OBJECT_PERMISSION_DENIED'],
      ['atanmış ama izni olmayan avukat', { lawyerAssignment: { casePermissions: { canEditFinance: false } } }, 'OBJECT_PERMISSION_DENIED'],
      ['izin alanı boş atama', { lawyerAssignment: { casePermissions: null } }, 'OBJECT_PERMISSION_DENIED'],
      ['dosyada düzenleme izni olmayan personel', { user: staffUser(true), staffAssignment: { canEdit: false } }, 'OBJECT_PERMISSION_DENIED'],
      ['dosyaya atanmamış personel', { user: staffUser(true), staffAssignment: null }, 'OBJECT_PERMISSION_DENIED'],
      ['mali modülü kapalı personel', { user: staffUser(false), staffAssignment: { canEdit: true } }, 'OBJECT_PERMISSION_DENIED'],
      ['kartsız hesap', { user: { tenantId: 'tenant-1', isActive: true, lawyer: null, staffMember: null } }, 'HUMAN_ACTOR_PROFILE_INVALID'],
      [
        'iki kartlı hesap',
        { user: { tenantId: 'tenant-1', isActive: true, lawyer: { id: 'l', tenantId: 'tenant-1', isActive: true }, staffMember: { id: 's', tenantId: 'tenant-1', isActive: true, canSeeFinance: true } } },
        'HUMAN_ACTOR_PROFILE_INVALID',
      ],
      ['pasif hesap', { user: { tenantId: 'tenant-1', isActive: false, lawyer: { id: 'l', tenantId: 'tenant-1', isActive: true }, staffMember: null } }, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT'],
      ['pasif avukat kartı', { user: { tenantId: 'tenant-1', isActive: true, lawyer: { id: 'l', tenantId: 'tenant-1', isActive: false }, staffMember: null } }, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT'],
      ['başka büronun hesabı', { user: { tenantId: 'tenant-other', isActive: true, lawyer: { id: 'l', tenantId: 'tenant-other', isActive: true }, staffMember: null } }, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT'],
      ['hesap yok', { user: null }, 'HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT'],
      ['dosya büroda yok', { caseInScope: null }, 'TENANT_CASE_SCOPE_MISMATCH'],
    ] as Array<[string, Parameters<typeof makeGate>[0], string]>)('%s reddedilir', async (_label, setup, reasonCode) => {
      const { gate } = makeGate(setup);
      await expect(gate.evaluateHumanCaseFinanceWrite(input)).resolves.toEqual({ allowed: false, reasonCode });
    });

    it('verilen veritabanı istemcisiyle (yazma transaction\'ı) değerlendirir', async () => {
      const { gate, prisma } = makeGate();
      const tx = makeGate({ lawyerAssignment: null }).prisma;
      await expect(gate.evaluateHumanCaseFinanceWrite(input, tx)).resolves.toEqual({ allowed: false, reasonCode: 'OBJECT_PERMISSION_DENIED' });
      expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('okuma hatası izne çevrilmez (fail-closed)', async () => {
      const { gate, prisma } = makeGate();
      prisma.caseLawyer.findFirst.mockRejectedValue(new Error('db down'));
      await expect(gate.evaluateHumanCaseFinanceWrite(input)).rejects.toThrow('db down');
    });
  });

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
