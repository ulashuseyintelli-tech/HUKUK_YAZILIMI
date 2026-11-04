import { ClientIntakePromotionService } from './client-intake-promotion.service';
import { ClientIntakePromotionController } from './client-intake-promotion.controller';
import { OfficeApprovalService } from '../office-approval/office-approval.service';

describe('Intake promotion link capability — existing policy, independent from review grants', () => {
  function harness(role = 'USER', lawyer: any = { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, staffMember: any = null) {
    const user = { id: 'actor', tenantId: 'tenant', role, isActive: true, lawyer, staffMember };
    const prisma: any = {
      clientIntakeSubmission: { findFirst: jest.fn().mockResolvedValue({ id: 'submission' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ role }), findUnique: jest.fn().mockResolvedValue(user) },
    };
    const office: any = { isApproverEligible: jest.fn((id, tenant) => OfficeApprovalService.prototype.isApproverEligible.call({ prisma } as any, id, tenant)) };
    const service = new ClientIntakePromotionService(prisma, {} as any, office, {} as any);
    return { service, prisma, office };
  }

  it.each([
    ['PARTNER', 'USER', { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, null, true],
    ['delegate', 'USER', { lawyerRank: 'LAWYER', canApproveOfficeActions: true }, null, true],
    ['plain MANAGER', 'USER', { lawyerRank: 'MANAGER', canApproveOfficeActions: false }, null, false],
    ['plain ADMIN', 'ADMIN', null, null, false],
    ['Staff-linked PARTNER', 'ADMIN', { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, { id: 'staff' }, false],
    ['VIEWER PARTNER', 'VIEWER', { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, null, false],
  ])('%s mirrors the existing promotion predicate plus VIEWER write denial', async (_name, role, lawyer, staff, expected) => {
    const { service, prisma } = harness(role as string, lawyer, staff);
    expect(await service.getPromotionCapability('tenant', 'submission', 'actor')).toEqual({ canPromote: expected });
    expect(prisma.clientIntakeSubmission.findFirst).toHaveBeenCalledWith({ where: { id: 'submission', tenantId: 'tenant' }, select: { id: true } });
    // This fixture exposes no grant reader or mutation methods; a capability query cannot grant/write or promote.
  });

  it('returns 404 before resolving eligibility for an absent/foreign-tenant submission', async () => {
    const { service, prisma, office } = harness(); prisma.clientIntakeSubmission.findFirst.mockResolvedValue(null);
    await expect(service.getPromotionCapability('foreign', 'submission', 'actor')).rejects.toMatchObject({ status: 404 });
    expect(office.isApproverEligible).not.toHaveBeenCalled(); expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('does not turn unreadable identity/eligibility into PASS', async () => {
    const { service, prisma } = harness(); prisma.user.findFirst.mockRejectedValue(new Error('db-read'));
    await expect(service.getPromotionCapability('tenant', 'submission', 'actor')).rejects.toThrow('db-read');
  });

  it('rejects an inactive/missing actor, and binds HTTP arguments to authenticated identity', async () => {
    const { service, prisma, office } = harness(); prisma.user.findFirst.mockResolvedValue(null);
    const controller = new ClientIntakePromotionController(service);
    expect(await controller.getPromotionCapability({ user: { tenantId: 'tenant', id: 'actor' } } as any, 'submission')).toEqual({ canPromote: false });
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });
});
