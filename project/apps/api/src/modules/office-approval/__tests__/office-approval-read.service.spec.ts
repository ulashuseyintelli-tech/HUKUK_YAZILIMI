/** @jest-environment node */
import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { OfficeApprovalService } from '../office-approval.service';

/**
 * P4-4 — OfficeApprovalService yeni read metodları + isApproverEligible predikatı (TENANT-SCOPED).
 * KESİN: inbox tenant + PENDING(default) + KENDİ talebi HARİÇ · mine tenant + kendi · getByIdForTenant where{id,tenantId}→404 ·
 *   isApproverEligible = aktif + aynı tenant + linkli Lawyer + (PARTNER ∨ canApproveOfficeActions); diğer → false (throw YOK).
 */
const mk = (over: Record<string, unknown> = {}) => {
  const prisma: any = {
    officeApprovalRequest: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    ...over,
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  return { svc: new OfficeApprovalService(prisma, audit), prisma };
};

describe('P4-4 listForTenant', () => {
  it('inbox: where = {tenantId, status:PENDING_APPROVAL (default), requesterUserId:{not:caller}} + orderBy createdAt desc', async () => {
    const { svc, prisma } = mk();
    await svc.listForTenant('t1', { view: 'inbox', callerUserId: 'u1' });
    expect(prisma.officeApprovalRequest.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', status: 'PENDING_APPROVAL', requesterUserId: { not: 'u1' } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('inbox: status override → status filtre değişir, exclude-own korunur', async () => {
    const { svc, prisma } = mk();
    await svc.listForTenant('t1', { view: 'inbox', callerUserId: 'u1', status: 'APPROVED' as never });
    expect(prisma.officeApprovalRequest.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1', status: 'APPROVED', requesterUserId: { not: 'u1' },
    });
  });

  it('mine: where = {tenantId, requesterUserId:caller}; status verilmezse status filtre YOK', async () => {
    const { svc, prisma } = mk();
    await svc.listForTenant('t1', { view: 'mine', callerUserId: 'u1' });
    expect(prisma.officeApprovalRequest.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', requesterUserId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('mine: status verilirse uygulanır (kendi talepleri, exclude-own YOK)', async () => {
    const { svc, prisma } = mk();
    await svc.listForTenant('t1', { view: 'mine', callerUserId: 'u1', status: 'REJECTED' as never });
    expect(prisma.officeApprovalRequest.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1', requesterUserId: 'u1', status: 'REJECTED',
    });
  });
});

describe('P4-4 getByIdForTenant', () => {
  it('findFirst {id, tenantId}; bulunursa döner', async () => {
    const row = { id: 'r1', tenantId: 't1' };
    const { svc, prisma } = mk({ officeApprovalRequest: { findFirst: jest.fn().mockResolvedValue(row), findMany: jest.fn() } });
    const r = await svc.getByIdForTenant('r1', 't1');
    expect(prisma.officeApprovalRequest.findFirst).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 't1' } });
    expect(r).toBe(row);
  });

  it('çapraz-tenant/bulunamaz (findFirst null) → NotFoundException (existence-oracle yok)', async () => {
    const { svc } = mk();
    await expect(svc.getByIdForTenant('r1', 't-OTHER')).rejects.toThrow(NotFoundException);
  });
});

describe('P4-4 isApproverEligible (paylaşılan predikat; throw YOK)', () => {
  const u = (over: Record<string, unknown> = {}) => ({ isActive: true, tenantId: 't1', lawyer: null, ...over });
  const withUser = (user: unknown) =>
    mk({ user: { findUnique: jest.fn().mockResolvedValue(user) }, officeApprovalRequest: { findMany: jest.fn(), findFirst: jest.fn() } });

  it('PARTNER → true', async () => {
    const { svc } = withUser(u({ lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } }));
    expect(await svc.isApproverEligible('u1', 't1')).toBe(true);
  });
  it('delege (canApproveOfficeActions true, non-PARTNER) → true', async () => {
    const { svc } = withUser(u({ lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: true } }));
    expect(await svc.isApproverEligible('u1', 't1')).toBe(true);
  });
  it('non-eligible avukat (LAWYER, canApprove false) → false', async () => {
    const { svc } = withUser(u({ lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } }));
    expect(await svc.isApproverEligible('u1', 't1')).toBe(false);
  });
  it('linksiz (lawyer null = staff/unlinked) → false', async () => {
    const { svc } = withUser(u());
    expect(await svc.isApproverEligible('u1', 't1')).toBe(false);
  });
  it('inactive (PARTNER bile) → false', async () => {
    const { svc } = withUser(u({ isActive: false, lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } }));
    expect(await svc.isApproverEligible('u1', 't1')).toBe(false);
  });
  it('cross-tenant (PARTNER bile) → false', async () => {
    const { svc } = withUser(u({ tenantId: 't-OTHER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } }));
    expect(await svc.isApproverEligible('u1', 't1')).toBe(false);
  });
  it('null user → false', async () => {
    const { svc } = withUser(null);
    expect(await svc.isApproverEligible('u1', 't1')).toBe(false);
  });
});
