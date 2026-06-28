/** @jest-environment node */
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { OfficeApprovalService } from '../office-approval.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

/**
 * P4-1 — OfficeApprovalService substrate testleri.
 * KESİN: self-approval YASAK · approver=PARTNER∨canApproveOfficeActions · status state-machine guard'lı ·
 * execution yalnız APPROVED'da · audit ham savedIntent SIZDIRMAZ (yalnız payloadHash).
 */

const REQUESTER = 'user-requester';
const APPROVER = 'user-approver';
const TENANT = 't1';

const mkReq = (over: Record<string, unknown> = {}) => ({
  id: 'oar-1',
  tenantId: TENANT,
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'case-1',
  requesterUserId: REQUESTER,
  approverUserId: null,
  status: 'PENDING_APPROVAL',
  executionStatus: 'NOT_RUN',
  savedIntent: { status: 'ACIZ', reason: 'x' },
  payloadHash: stableJsonHash({ status: 'ACIZ', reason: 'x' }),
  reason: null,
  decisionNote: null,
  idempotencyKey: null,
  createdAt: new Date(0),
  decidedAt: null,
  executedAt: null,
  expiresAt: null,
  ...over,
});

const make = (opts: {
  reqSeq?: any[]; // officeApprovalRequest.findUnique sıralı dönüşleri
  updateCount?: number;
  approverUser?: any; // user.findUnique (approver eligibility)
  createReturn?: any;
  idempotentExisting?: any; // createPendingRequest idempotency findUnique
}) => {
  const findUnique = jest.fn();
  (opts.reqSeq || []).forEach((r) => findUnique.mockResolvedValueOnce(r));
  const prisma = {
    officeApprovalRequest: {
      findUnique: findUnique,
      create: jest.fn().mockResolvedValue(opts.createReturn ?? mkReq()),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.approverUser ?? null) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new OfficeApprovalService(prisma as never, audit as never);
  return { svc, prisma, audit };
};

const partner = (over = {}) => ({ id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, ...over });
const delegated = () => ({ id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: true } });

describe('P4-1 OfficeApprovalService — createPendingRequest', () => {
  it('PENDING_APPROVAL + NOT_RUN oluşturur, payloadHash hesaplar, REQUESTED audit yazar', async () => {
    const created = mkReq();
    const { svc, prisma, audit } = make({ createReturn: created });
    const res = await svc.createPendingRequest({ tenantId: TENANT, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'case-1', requesterUserId: REQUESTER, savedIntent: { status: 'ACIZ', reason: 'x' } });
    const data = prisma.officeApprovalRequest.create.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING_APPROVAL');
    expect(data.executionStatus).toBe('NOT_RUN');
    expect(data.payloadHash).toBe(stableJsonHash({ status: 'ACIZ', reason: 'x' }));
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_REQUESTED');
    expect(res).toBe(created);
  });

  it('idempotencyKey mevcutsa create ETMEZ, mevcut talebi döner', async () => {
    const existing = mkReq({ id: 'oar-existing', idempotencyKey: 'k1' });
    const { svc, prisma, audit } = make({ reqSeq: [existing] });
    const res = await svc.createPendingRequest({ tenantId: TENANT, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'case-1', requesterUserId: REQUESTER, savedIntent: {}, idempotencyKey: 'k1' });
    expect(res).toBe(existing);
    expect(prisma.officeApprovalRequest.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('P4-1 OfficeApprovalService — approve', () => {
  it('yetkili PARTNER (≠requester) PENDING→APPROVED + audit', async () => {
    const { svc, prisma, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'APPROVED', approverUserId: APPROVER })], approverUser: partner() });
    const res = await svc.approve('oar-1', APPROVER, 'tamam');
    expect(prisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.officeApprovalRequest.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'oar-1', status: 'PENDING_APPROVAL' });
    expect(res.status).toBe('APPROVED');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_APPROVED');
  });

  it('canApproveOfficeActions=true delege avukat (non-PARTNER) onaylayabilir', async () => {
    const { svc } = make({ reqSeq: [mkReq(), mkReq({ status: 'APPROVED', approverUserId: APPROVER })], approverUser: delegated() });
    const res = await svc.approve('oar-1', APPROVER, 'ok');
    expect(res.status).toBe('APPROVED');
  });

  it('SELF-APPROVAL → BadRequest (approver===requester); updateMany/user-lookup ÇAĞRILMAZ', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq()] });
    await expect(svc.approve('oar-1', REQUESTER)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('yetkisiz approver (non-PARTNER + canApprove false) → Forbidden; updateMany YOK', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq()], approverUser: { id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } } });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('staff (lawyer linki YOK) → Forbidden', async () => {
    const { svc } = make({ reqSeq: [mkReq()], approverUser: { id: APPROVER, isActive: true, tenantId: TENANT, lawyer: null } });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cross-tenant approver → Forbidden', async () => {
    const { svc } = make({ reqSeq: [mkReq()], approverUser: partner({ tenantId: 't-OTHER' }) });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PENDING değil → Conflict', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'APPROVED' })] });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('bulunamayan id → NotFound', async () => {
    const { svc } = make({ reqSeq: [null] });
    await expect(svc.approve('yok', APPROVER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('eşzamanlı geçiş (updateMany count=0) → Conflict', async () => {
    const { svc } = make({ reqSeq: [mkReq()], approverUser: partner(), updateCount: 0 });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('P4-1 OfficeApprovalService — reject / cancel', () => {
  it('reject gerekçesiz → BadRequest', async () => {
    const { svc } = make({ reqSeq: [mkReq()] });
    await expect(svc.reject('oar-1', APPROVER, '   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reject yetkili + gerekçe → REJECTED + audit', async () => {
    const { svc, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'REJECTED', approverUserId: APPROVER, decisionNote: 'eksik' })], approverUser: partner() });
    const res = await svc.reject('oar-1', APPROVER, 'eksik');
    expect(res.status).toBe('REJECTED');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_REJECTED');
  });

  it('reject self (approver===requester) → BadRequest', async () => {
    const { svc } = make({ reqSeq: [mkReq()] });
    await expect(svc.reject('oar-1', REQUESTER, 'gerekçe')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancel: talep sahibi PENDING→CANCELLED', async () => {
    const { svc, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'CANCELLED' })] });
    const res = await svc.cancel('oar-1', REQUESTER);
    expect(res.status).toBe('CANCELLED');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_CANCELLED');
  });

  it('cancel: talep sahibi DEĞİL → Forbidden', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq()] });
    await expect(svc.cancel('oar-1', 'baskasi')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe('P4-1 OfficeApprovalService — execution markers', () => {
  it('markExecutionSucceeded: APPROVED→SUCCEEDED + executedAt + audit', async () => {
    const { svc, prisma, audit } = make({ reqSeq: [mkReq({ status: 'APPROVED' }), mkReq({ status: 'APPROVED', executionStatus: 'SUCCEEDED' })] });
    const res = await svc.markExecutionSucceeded('oar-1', APPROVER);
    expect(res.executionStatus).toBe('SUCCEEDED');
    expect(prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data.executedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_EXECUTION_SUCCEEDED');
  });

  it('markExecutionFailed: APPROVED→FAILED (executedAt YAZILMAZ)', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq({ status: 'APPROVED' }), mkReq({ status: 'APPROVED', executionStatus: 'FAILED' })] });
    await svc.markExecutionFailed('oar-1', APPROVER);
    expect(prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data.executedAt).toBeUndefined();
  });

  it('markExecutionStale: APPROVED→STALE + audit', async () => {
    const { svc, audit } = make({ reqSeq: [mkReq({ status: 'APPROVED' }), mkReq({ status: 'APPROVED', executionStatus: 'STALE' })] });
    const res = await svc.markExecutionStale('oar-1', APPROVER);
    expect(res.executionStatus).toBe('STALE');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_EXECUTION_STALE');
  });

  it('execution yalnız APPROVED: PENDING talep yürütme işareti → Conflict', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'PENDING_APPROVAL' })] });
    await expect(svc.markExecutionSucceeded('oar-1', APPROVER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('execution idempotent: zaten sonlanmış (updateMany count=0) → Conflict', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'APPROVED', executionStatus: 'SUCCEEDED' })], updateCount: 0 });
    await expect(svc.markExecutionSucceeded('oar-1', APPROVER)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('P4-1 OfficeApprovalService — audit gizlilik', () => {
  it('audit metadata yalnız payloadHash taşır; ham savedIntent (status/reason değeri) SIZMAZ', async () => {
    const created = mkReq({ savedIntent: { status: 'ACIZ', reason: 'GIZLI_GEREKCE' }, payloadHash: stableJsonHash({ status: 'ACIZ', reason: 'GIZLI_GEREKCE' }) });
    const { svc, audit } = make({ createReturn: created });
    await svc.createPendingRequest({ tenantId: TENANT, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'case-1', requesterUserId: REQUESTER, savedIntent: { status: 'ACIZ', reason: 'GIZLI_GEREKCE' } });
    const meta = audit.log.mock.calls[0][0].metadata;
    const blob = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(meta.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(blob).not.toContain('GIZLI_GEREKCE'); // ham reason audit'e girmez
    expect(blob).not.toContain('savedIntent'); // savedIntent anahtarı metadata'da yok
    expect(meta.requesterUserId).toBe(REQUESTER); // truthful actor alanları
  });
});
