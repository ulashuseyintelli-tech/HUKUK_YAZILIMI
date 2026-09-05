import { BadRequestException } from '@nestjs/common';
import { StaffService } from '../staff.service';

const TENANT = 'staff-update-test';
const STAFF_ID = 'staff-target';

const build = (isActive = true) => {
  const existing = {
    id: STAFF_ID, tenantId: TENANT, officeId: 'office-a', userId: 'linked-user',
    firstName: 'Ada', lastName: 'Lovelace', tckn: '12345678901', isActive,
    phone: 'old-phone',
  };
  const prisma = {
    staffMember: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
    },
    user: { update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn(), logInTransaction: jest.fn() };
  const service = new StaffService(prisma as never, audit as never);
  return { service, prisma, audit };
};

describe('Staff normal update lifecycle boundary', () => {
  it('preserves normal updates without an isActive field', async () => {
    const { service, prisma } = build();
    await service.update(STAFF_ID, TENANT, { phone: null, email: '', isDefaultForNewCases: true });
    expect(prisma.staffMember.update.mock.calls[0][0].data).toEqual({
      phone: null, email: '', isDefaultForNewCases: true,
    });
  });

  it.each([true, false])('accepts unchanged isActive=%s without writing lifecycle state', async (isActive) => {
    const { service, prisma } = build(isActive);
    await service.update(STAFF_ID, TENANT, { phone: 'new-phone', isActive });
    expect(prisma.staffMember.update.mock.calls[0][0].data).toEqual({ phone: 'new-phone' });
  });

  it('preserves full-row inert metadata, masked TCKN and review-confirmation passthrough', async () => {
    const { service, prisma } = build();
    await service.update(STAFF_ID, TENANT, {
      id: STAFF_ID, tenantId: TENANT, officeId: 'office-a', userId: 'linked-user',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      user: { id: 'linked-user', role: 'USER' }, caseAssignments: [],
      firstName: 'Ada', lastName: 'Lovelace', tckn: '123****01', isActive: true,
      confirmSimilarNameUpdate: true, phone: 'new-phone',
    });
    expect(prisma.staffMember.update.mock.calls[0][0].data).toEqual({
      firstName: 'Ada', lastName: 'Lovelace', phone: 'new-phone',
    });
    expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['deactivation', true, false],
    ['reactivation', false, true],
    ['null', true, null],
    ['string false', true, 'false'],
    ['string true', true, 'true'],
    ['zero', true, 0],
    ['one', true, 1],
    ['ORM operation', true, { set: false }],
    ['boxed boolean', true, new Boolean(false)],
  ])('rejects %s in a mixed payload before any business write', async (_label, current, isActive) => {
    const { service, prisma, audit } = build(current as boolean);
    await expect(service.update(STAFF_ID, TENANT, {
      phone: 'new-phone', isActive,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffMember.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});
