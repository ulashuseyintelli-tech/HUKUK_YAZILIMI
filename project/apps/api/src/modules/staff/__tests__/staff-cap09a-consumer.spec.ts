import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { StaffController } from '../staff.controller';
import { StaffService } from '../staff.service';

const TENANT = 'tenant-office-cap09a';
const OTHER_TENANT = 'tenant-other';
const STAFF_ID = 'staff-cap09a';
const LINKED_USER_ID = 'staff-linked-user';
const ACTOR_USER_ID = 'office-admin-user';
const REQUEST_ID = 'req-office-cap09a-01';

type HarnessState = {
  staff: { id: string; tenantId: string; userId: string; staffType: string; isActive: boolean };
  user: { id: string; tenantId: string; isActive: boolean };
  auditLogs: Array<Record<string, unknown>>;
};

const cloneState = (state: HarnessState): HarnessState => ({
  staff: { ...state.staff },
  user: { ...state.user },
  auditLogs: state.auditLogs.map((entry) => ({ ...entry })),
});

const buildTransactionalHarness = (options: { failAudit?: boolean } = {}) => {
  let committed: HarnessState = {
    staff: {
      id: STAFF_ID,
      tenantId: TENANT,
      userId: LINKED_USER_ID,
      staffType: 'PARALEGAL',
      isActive: true,
    },
    user: { id: LINKED_USER_ID, tenantId: TENANT, isActive: true },
    auditLogs: [],
  };
  let lastTransaction: Record<string, unknown> | undefined;

  const prisma: any = {
    staffMember: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        return where.id === committed.staff.id && where.tenantId === committed.staff.tenantId
          ? Promise.resolve({ ...committed.staff })
          : Promise.resolve(null);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const draft = cloneState(committed);
      const tx = {
        user: {
          updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
            if (where.id !== draft.user.id || where.tenantId !== draft.user.tenantId) {
              return Promise.resolve({ count: 0 });
            }
            draft.user = { ...draft.user, ...data };
            return Promise.resolve({ count: 1 });
          }),
        },
        staffMember: {
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            if (where.id !== draft.staff.id) throw new Error('STAFF_NOT_FOUND');
            draft.staff = { ...draft.staff, ...data };
            return Promise.resolve({ ...draft.staff });
          }),
        },
        auditLog: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            if (options.failAudit) throw new Error('AUDIT_WRITE_FAILED');
            draft.auditLogs.push({ ...data });
            return Promise.resolve({ id: `audit-${draft.auditLogs.length}`, ...data });
          }),
        },
      };
      lastTransaction = tx;
      const result = await callback(tx);
      committed = draft;
      return result;
    }),
  };

  const audit = new AuditService(prisma);
  const auditSpy = jest.spyOn(audit, 'logInTransaction');
  const service = new StaffService(prisma, audit);
  const actor = {
    userId: ACTOR_USER_ID,
    role: 'ADMIN',
    requestId: REQUEST_ID,
  };

  return {
    actor,
    auditSpy,
    prisma,
    readBack: () => cloneState(committed),
    service,
    transaction: () => lastTransaction,
  };
};

const executionContext = (user: { id: string; tenantId: string }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('OFFICE-CAP-09A-CONSUMER-01-R01 — Staff lifecycle audit consumer', () => {
  it('başarılı deactivate mutation ve CAP-09A audit kaydını aynı transaction içinde commit eder; read-back attribution tamdır', async () => {
    const harness = buildTransactionalHarness();

    await expect(harness.service.remove(STAFF_ID, TENANT, harness.actor)).resolves.toMatchObject({
      id: STAFF_ID,
      isActive: false,
    });

    expect(harness.auditSpy).toHaveBeenCalledTimes(1);
    expect(harness.auditSpy.mock.calls[0][0]).toBe(harness.transaction());

    const readBack = harness.readBack();
    expect(readBack.staff.isActive).toBe(false);
    expect(readBack.user.isActive).toBe(false);
    expect(readBack.auditLogs).toHaveLength(1);
    expect(readBack.auditLogs[0]).toMatchObject({
      tenantId: TENANT,
      action: 'STAFF_DEACTIVATE',
      entityType: 'STAFF',
      entityId: STAFF_ID,
      userId: ACTOR_USER_ID,
      actorType: 'USER',
      decisionResult: 'SUCCESS',
      reasonCode: 'OFFICE_F01_AUTHORIZED',
      correlationId: REQUEST_ID,
      requestId: REQUEST_ID,
      policyRef: 'OFFICE-GOVERNANCE:OFF-INV-08',
      policyVersion: '2026-08-13',
      oldValues: { isActive: true },
      newValues: { isActive: false },
      metadata: {
        actorRole: 'ADMIN',
        authoritySource: 'OFFICE_F01_AUTHORIZATION_GUARD',
        linkedUserAccountDeactivated: true,
        softDelete: true,
      },
    });
    expect(JSON.stringify(readBack.auditLogs[0])).not.toMatch(/firstName|lastName|tckn|email|phone/i);
  });

  it('doğrudan HTTP fixture kurulumunda da mevcut AuditService consumer API ile audit-siz mutation bırakmaz', async () => {
    const harness = buildTransactionalHarness();
    const directlyConstructedService = new StaffService(harness.prisma);

    await directlyConstructedService.remove(STAFF_ID, TENANT, harness.actor);

    const readBack = harness.readBack();
    expect(readBack.staff.isActive).toBe(false);
    expect(readBack.user.isActive).toBe(false);
    expect(readBack.auditLogs).toHaveLength(1);
    expect(readBack.auditLogs[0]).toMatchObject({
      action: 'STAFF_DEACTIVATE',
      entityId: STAFF_ID,
      requestId: REQUEST_ID,
    });
  });

  it('audit yazımı başarısızsa Staff ve bağlı User değişikliklerini commit etmez; rollback read-back aktiftir', async () => {
    const harness = buildTransactionalHarness({ failAudit: true });

    await expect(harness.service.remove(STAFF_ID, TENANT, harness.actor)).rejects.toThrow('AUDIT_WRITE_FAILED');

    const readBack = harness.readBack();
    expect(readBack.staff.isActive).toBe(true);
    expect(readBack.user.isActive).toBe(true);
    expect(readBack.auditLogs).toEqual([]);
    expect(harness.auditSpy).toHaveBeenCalledTimes(1);
    expect(harness.auditSpy.mock.calls[0][0]).toBe(harness.transaction());
  });

  it('cross-tenant hedef görünmez kalır; transaction ve audit başlamaz', async () => {
    const harness = buildTransactionalHarness();

    await expect(harness.service.remove(STAFF_ID, OTHER_TENANT, harness.actor)).rejects.toThrow(
      'Personel bulunamadı',
    );

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.auditSpy).not.toHaveBeenCalled();
    expect(harness.readBack().staff.isActive).toBe(true);
  });

  it('AuditService mevcutken actor/role/request attribution eksikse mutation başlamadan fail-closed kalır', async () => {
    const harness = buildTransactionalHarness();

    await expect(harness.service.remove(STAFF_ID, TENANT)).rejects.toThrow(
      'Personel pasifleştirme denetim bağlamı eksik',
    );
    await expect(
      harness.service.remove(STAFF_ID, TENANT, { ...harness.actor, role: '' }),
    ).rejects.toThrow('Personel pasifleştirme aktör, rol veya istek kimliği eksik');
    expect(harness.prisma.staffMember.findFirst).not.toHaveBeenCalled();
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('controller doğrulanmış user/role/request attribution alanlarını tek üretim çağırıcısına taşır', async () => {
    const staffService = { remove: jest.fn().mockResolvedValue({ isActive: false }) };
    const controller = new StaffController(staffService as any, {} as any);

    await expect(
      controller.remove(
        { user: { id: ACTOR_USER_ID, tenantId: TENANT, role: 'ADMIN' }, requestId: REQUEST_ID },
        STAFF_ID,
      ),
    ).resolves.toEqual({ success: true });

    expect(staffService.remove).toHaveBeenCalledWith(STAFF_ID, TENANT, {
      userId: ACTOR_USER_ID,
      role: 'ADMIN',
      requestId: REQUEST_ID,
    });
  });

  it('request-id middleware bulunmayan doğrudan HTTP fixture için tekil attribution id üretir', async () => {
    const staffService = { remove: jest.fn().mockResolvedValue({ isActive: false }) };
    const controller = new StaffController(staffService as any, {} as any);

    await controller.remove({ user: { id: ACTOR_USER_ID, tenantId: TENANT, role: 'ADMIN' } }, STAFF_ID);

    expect(staffService.remove).toHaveBeenCalledWith(STAFF_ID, TENANT, {
      userId: ACTOR_USER_ID,
      role: 'ADMIN',
      requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    });
  });

  it('Staff-linked aktör kendi kaydını hedeflese ve Lawyer capability taşısa bile F01 kapısında 403 kalır', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'USER',
          isActive: true,
          tenantId: TENANT,
          staffMember: { id: STAFF_ID, officeId: 'office-1' },
          lawyer: { officeId: 'office-1', lawyerRank: 'PARTNER', canApproveOfficeActions: true },
        }),
      },
    };
    const approval = new OfficeApprovalService(prisma as any, {} as any);
    const guard = new OfficeF01AuthorizationGuard(approval);

    await expect(
      guard.canActivate(executionContext({ id: LINKED_USER_ID, tenantId: TENANT })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: LINKED_USER_ID },
      select: expect.objectContaining({ staffMember: expect.any(Object), lawyer: expect.any(Object) }),
    });
  });
});
