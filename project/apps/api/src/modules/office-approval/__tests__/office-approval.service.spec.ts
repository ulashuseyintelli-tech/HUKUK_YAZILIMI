/** @jest-environment node */
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  it('P4-5C-1 markExecutionRunning: NOT_RUN→RUNNING + runningStartedAt=now yazılır (precise stuck-timeout temeli)', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq({ status: 'APPROVED' }), mkReq({ status: 'APPROVED', executionStatus: 'RUNNING' })] });
    await svc.markExecutionRunning('oar-1', APPROVER);
    const data = prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data;
    expect(data.executionStatus).toBe('RUNNING');
    expect(data.runningStartedAt).toBeInstanceOf(Date);
  });

  it('P4-5C-1 markExecutionFailed: retryCount increment + lastRetryAt yazılır (orphan/fail sayacı; executedAt YAZILMAZ)', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq({ status: 'APPROVED' }), mkReq({ status: 'APPROVED', executionStatus: 'FAILED' })] });
    await svc.markExecutionFailed('oar-1', APPROVER);
    const data = prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data;
    expect(data.retryCount).toEqual({ increment: 1 });
    expect(data.lastRetryAt).toBeInstanceOf(Date);
    expect(data.executedAt).toBeUndefined(); // FAILED'de executedAt YAZILMAZ (P4-5B davranışı korunur)
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

describe('P4-1A OfficeApprovalService — approveWithChanges / requestRevision', () => {
  it('approveWithChanges: PENDING→APPROVED_WITH_CHANGES + replacementPayloadHash + audit; orijinal savedIntent EZİLMEZ', async () => {
    const { svc, prisma, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'APPROVED_WITH_CHANGES', approverUserId: APPROVER, replacementPayloadHash: stableJsonHash({ status: 'BATAK', reason: 'düzeltme' }) })], approverUser: partner() });
    const res = await svc.approveWithChanges('oar-1', APPROVER, { status: 'BATAK', reason: 'düzeltme' }, 'değiştirdim');
    const data = prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('APPROVED_WITH_CHANGES');
    expect(data.replacementPayloadHash).toBe(stableJsonHash({ status: 'BATAK', reason: 'düzeltme' }));
    expect('savedIntent' in data).toBe(false); // ORİJİNAL niyet update'te YOK → ezilmiyor (audit çizgisi korunur)
    expect(res.status).toBe('APPROVED_WITH_CHANGES');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_APPROVED_WITH_CHANGES');
  });

  it('approveWithChanges: replacementSavedIntent YOK → BadRequest', async () => {
    const { svc } = make({ reqSeq: [] });
    await expect(svc.approveWithChanges('oar-1', APPROVER, null as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approveWithChanges: self (approver===requester) → BadRequest', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq()] });
    await expect(svc.approveWithChanges('oar-1', REQUESTER, { status: 'BATAK' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('approveWithChanges: yetkisiz approver → Forbidden', async () => {
    const { svc } = make({ reqSeq: [mkReq()], approverUser: { id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } } });
    await expect(svc.approveWithChanges('oar-1', APPROVER, { status: 'BATAK' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requestRevision: notsuz → BadRequest', async () => {
    const { svc } = make({ reqSeq: [] });
    await expect(svc.requestRevision('oar-1', APPROVER, '   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requestRevision: PENDING→REVISION_REQUESTED + audit (REJECTED DEĞİL)', async () => {
    const { svc, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'REVISION_REQUESTED', approverUserId: APPROVER, decisionNote: 'açıklamayı düzelt' })], approverUser: partner() });
    const res = await svc.requestRevision('oar-1', APPROVER, 'açıklamayı düzelt');
    expect(res.status).toBe('REVISION_REQUESTED');
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_REVISION_REQUESTED');
  });

  it('requestRevision: self → BadRequest', async () => {
    const { svc } = make({ reqSeq: [mkReq()] });
    await expect(svc.requestRevision('oar-1', REQUESTER, 'düzelt')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('execution: APPROVED_WITH_CHANGES talep de yürütülebilir', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'APPROVED_WITH_CHANGES' }), mkReq({ status: 'APPROVED_WITH_CHANGES', executionStatus: 'SUCCEEDED' })] });
    const res = await svc.markExecutionSucceeded('oar-1', APPROVER);
    expect(res.executionStatus).toBe('SUCCEEDED');
  });

  it('audit gizlilik: APPROVED_WITH_CHANGES ham replacement değeri SIZDIRMAZ (yalnız replacementPayloadHash)', async () => {
    const updated = mkReq({ status: 'APPROVED_WITH_CHANGES', approverUserId: APPROVER, replacementPayloadHash: stableJsonHash({ status: 'BATAK', reason: 'GIZLI_REPLACEMENT' }) });
    const { svc, audit } = make({ reqSeq: [mkReq(), updated], approverUser: partner() });
    await svc.approveWithChanges('oar-1', APPROVER, { status: 'BATAK', reason: 'GIZLI_REPLACEMENT' }, 'not');
    const blob = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(blob).not.toContain('GIZLI_REPLACEMENT'); // ham replacement audit'e SIZMAZ
    expect(audit.log.mock.calls[0][0].metadata.replacementPayloadHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('P4-1A OfficeApprovalService — idempotency P2002 race', () => {
  it('eşzamanlı çift-talep: create P2002 → mevcut kaydı döner (idempotent), audit YAZMAZ', async () => {
    const existing = mkReq({ id: 'oar-race', idempotencyKey: 'kRace' });
    const findUnique = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing); // pre-check null, P2002 sonrası existing
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
    const prisma = {
      officeApprovalRequest: { findUnique, create: jest.fn().mockRejectedValue(p2002), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new OfficeApprovalService(prisma as never, audit as never);
    const res = await svc.createPendingRequest({ tenantId: TENANT, actionCode: 'X', targetType: 'LegalCase', targetRef: 'c', requesterUserId: REQUESTER, savedIntent: {}, idempotencyKey: 'kRace' });
    expect(res).toBe(existing);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('P2002 ama idempotencyKey YOK → hata yeniden fırlatılır (gerçek hata yutulmaz)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
    const prisma = {
      officeApprovalRequest: { findUnique: jest.fn(), create: jest.fn().mockRejectedValue(p2002), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const svc = new OfficeApprovalService(prisma as never, { log: jest.fn() } as never);
    await expect(svc.createPendingRequest({ tenantId: TENANT, actionCode: 'X', targetType: 'LegalCase', targetRef: 'c', requesterUserId: REQUESTER, savedIntent: {} })).rejects.toBe(p2002);
  });
});
