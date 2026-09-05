import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LawyerService } from '../lawyer.service';

const TENANT = 'office-update-test';
const LAWYER_ID = 'lawyer-target';
const ADMIN = { userId: 'admin-actor', role: 'ADMIN' };
const MANAGER = { userId: 'manager-actor', role: 'USER' };

// Service boundary coverage deliberately imports no new DTO: the same tests can
// run against the original source before the HTTP validation fix is installed.
const build = (isActive = true) => {
  const existing = {
    id: LAWYER_ID, tenantId: TENANT, officeId: 'office-a', userId: 'linked-user',
    name: 'Ada', surname: 'Lovelace', tckn: null, barNumber: null, isActive,
    lawyerRank: 'LAWYER', canApproveOfficeActions: false,
    defaultPermissions: { canEditCase: true }, permissionsLocked: false,
    canModifyOtherPermissions: false, phone: 'old-phone',
  };
  const prisma = {
    lawyer: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        tenantId: TENANT, isActive: true, lawyer: { lawyerRank: 'MANAGER' },
      }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new LawyerService(prisma as never, audit as never, {} as never);
  return { service, prisma, audit };
};

type Fixture = ReturnType<typeof build>;
const expectNoMutation = ({ prisma, audit }: Fixture) => {
  expect(prisma.lawyer.update).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(audit.log).not.toHaveBeenCalled();
};

describe('Lawyer update profile and ORM write boundary', () => {
  it.each([
    ['user', { update: { role: 'ADMIN' } }],
    ['tenant', { connect: { id: 'other-tenant' } }],
    ['office', { connect: { id: 'other-office' } }],
    ['userId', 'other-user'],
    ['tenantId', 'other-tenant'],
    ['officeId', 'other-office'],
    ['id', 'other-lawyer'],
    ['createdAt', '2026-01-01T00:00:00.000Z'],
    ['permissionsLockedBy', 'other-user'],
    ['unexpectedField', 'not-an-office-profile-field'],
  ])('rejects %s with an otherwise permitted profile update before any mutation', async (field, value) => {
    const fixture = build();
    await expect(fixture.service.update(TENANT, LAWYER_ID, {
      phone: 'new-phone', [field as string]: value,
    } as never, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
    expectNoMutation(fixture);
  });

  it.each([
    ['phone', { set: 'new-phone' }],
    ['sortOrder', { increment: 1 }],
    ['role', { set: 'PARTNER' }],
    ['permissionsLocked', { set: true }],
    ['canApproveOfficeActions', { set: true }],
  ])('rejects an ORM operation object in scalar field %s for a direct service caller', async (field, value) => {
    const fixture = build();
    await expect(fixture.service.update(TENANT, LAWYER_ID, {
      [field as string]: value,
    } as never, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expectNoMutation(fixture);
  });

  it('preserves legitimate defaultPermissions JSON, including nested keys named like ORM operations', async () => {
    const { service, prisma } = build();
    const permissions = { canEditCase: true, scope: { set: ['read', 'write'], enabled: false } };
    await service.update(TENANT, LAWYER_ID, { defaultPermissions: permissions }, ADMIN);
    expect(prisma.lawyer.update.mock.calls[0][0].data.defaultPermissions).toEqual(permissions);
  });

  it.each(['constructor', '__proto__', 'hasOwnProperty'])('rejects reserved top-level key %s without silently dropping it', async (key) => {
    const fixture = build();
    const body = JSON.parse(`{"phone":"new-phone","${key}":{"role":"ADMIN"}}`);
    await expect(fixture.service.update(TENANT, LAWYER_ID, body, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expectNoMutation(fixture);
  });

  it('preserves ordinary JSON keys even when class transformation would discard them', async () => {
    const { service, prisma } = build();
    const permissions = JSON.parse('{"constructor":{"set":true},"scope":{"__proto__":{"read":true}}}');
    await service.update(TENANT, LAWYER_ID, { defaultPermissions: permissions }, ADMIN);
    expect(JSON.stringify(prisma.lawyer.update.mock.calls[0][0].data.defaultPermissions)).toBe(JSON.stringify(permissions));
  });

  it.each([null, [], 'profile', 1, true])('rejects malformed whole body %p before any mutation', async (body) => {
    const fixture = build();
    await expect(fixture.service.update(TENANT, LAWYER_ID, body as never, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expectNoMutation(fixture);
  });

  it.each([
    ['lawyerRank', 'LAWYER'],
    ['defaultPermissions', { canEditCase: true }],
    ['permissionsLocked', false],
    ['canModifyOtherPermissions', false],
  ])('preserves the presence guard for unchanged privileged field %s', async (field, value) => {
    const fixture = build();
    await expect(fixture.service.update(TENANT, LAWYER_ID, {
      [field as string]: value,
    } as never, MANAGER)).rejects.toBeInstanceOf(ForbiddenException);
    expectNoMutation(fixture);
  });

  it('allows an unchanged delegation echo without widening its authority', async () => {
    const { service, prisma, audit } = build();
    await service.update(TENANT, LAWYER_ID, { phone: 'new-phone', canApproveOfficeActions: false }, MANAGER);
    expect(prisma.lawyer.update.mock.calls[0][0].data).toEqual({ phone: 'new-phone' });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each([true, false])('accepts isActive=%s echoed unchanged but never writes it', async (isActive) => {
    const { service, prisma } = build(isActive);
    await service.update(TENANT, LAWYER_ID, { phone: 'new-phone', isActive }, MANAGER);
    expect(prisma.lawyer.update.mock.calls[0][0].data).toEqual({ phone: 'new-phone' });
  });

  it('preserves omitted lifecycle state and nullable/empty contact values', async () => {
    const { service, prisma } = build();
    await service.update(TENANT, LAWYER_ID, { phone: null, email: '', confirmSimilarNameUpdate: true } as never, MANAGER);
    expect(prisma.lawyer.update.mock.calls[0][0].data).toEqual({ phone: null, email: '' });
  });

  it.each([true, false])('rejects a real transition from %s before a mixed delegation write or success audit', async (isActive) => {
    const fixture = build(isActive);
    await expect(fixture.service.update(TENANT, LAWYER_ID, {
      phone: 'new-phone', isActive: !isActive, canApproveOfficeActions: true,
    }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expectNoMutation(fixture);
  });

  it.each([null, 'false', 'true', 0, 1, { set: false }, new Boolean(false)])(
    'rejects non-primitive-boolean isActive=%p before any mutation', async (isActive) => {
      const fixture = build();
      await expect(fixture.service.update(TENANT, LAWYER_ID, {
        phone: 'new-phone', isActive,
      } as never, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expectNoMutation(fixture);
    },
  );
});
