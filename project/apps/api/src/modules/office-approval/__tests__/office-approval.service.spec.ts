/** @jest-environment node */
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OfficeApprovalService } from '../office-approval.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

/**
 * P4-1 — OfficeApprovalService substrate testleri.
 * KESİN: generic self-approval YASAK; DBIND §5 gereği yalnız CLIENT_PAYOUT_POST approve() için
 * PayoutApprovalPolicy eligible üst-seviye aktör istisnası var · approver=PARTNER∨canApproveOfficeActions ·
 * status state-machine guard'lı · execution yalnız APPROVED'da · audit ham savedIntent SIZDIRMAZ (yalnız payloadHash).
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
  domainSync?: any;
}) => {
  const findUnique = jest.fn();
  (opts.reqSeq || []).forEach((r) => findUnique.mockResolvedValueOnce(r));
  const prisma: any = {
    officeApprovalRequest: {
      findUnique: findUnique,
      create: jest.fn().mockResolvedValue(opts.createReturn ?? mkReq()),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.approverUser ?? null) },
  };
  (prisma as any).$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new OfficeApprovalService(prisma as never, audit as never, opts.domainSync);
  return { svc, prisma, audit };
};

const partner = (over = {}) => ({ id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false }, ...over });
const delegated = () => ({ id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: true } });
const manager = (over = {}) => ({ id: APPROVER, isActive: true, tenantId: TENANT, lawyer: { lawyerRank: 'MANAGER', canApproveOfficeActions: false }, ...over });

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

  // ---- H7: terminal kayıt idempotencyKey'i işgal ediyor — PENDING_APPROVAL dönmemeli ----
  it.each(['REJECTED', 'APPROVED', 'APPROVED_WITH_CHANGES', 'CANCELLED', 'REVISION_REQUESTED'])(
    'idempotencyKey terminal (%s) kayda denk gelirse: o kayıt DÖNMEZ, anahtarı boşaltılır, YENİ PENDING_APPROVAL kayıt oluşturulur',
    async (terminalStatus) => {
      const existing = mkReq({ id: 'oar-old-terminal', idempotencyKey: 'k1', status: terminalStatus });
      const fresh = mkReq({ id: 'oar-fresh', idempotencyKey: 'k1', status: 'PENDING_APPROVAL' });
      const { svc, prisma, audit } = make({ reqSeq: [existing], createReturn: fresh });

      const res = await svc.createPendingRequest({
        tenantId: TENANT, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'case-1',
        requesterUserId: REQUESTER, savedIntent: { status: 'HITAM' }, idempotencyKey: 'k1',
      });

      // Eski terminal kaydın anahtarı CAS ile namespace'lendi (kayıt SİLİNMEDİ, id korunuyor).
      expect(prisma.officeApprovalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'oar-old-terminal', idempotencyKey: 'k1' },
        data: { idempotencyKey: 'k1::superseded:oar-old-terminal' },
      });
      // create() ORİJİNAL anahtarla çağrıldı (yeni kayıt bu anahtarı taşır).
      expect(prisma.officeApprovalRequest.create.mock.calls[0][0].data.idempotencyKey).toBe('k1');
      expect(prisma.officeApprovalRequest.create.mock.calls[0][0].data.status).toBe('PENDING_APPROVAL');
      // Dönüş: YENİ (fresh) kayıt — asla eski terminal kayıt DEĞİL.
      expect(res).toBe(fresh);
      expect(res).not.toBe(existing);
      expect(res.status).toBe('PENDING_APPROVAL'); // caller'a artık DOĞRU durum yansır (yalan yok)
      expect(audit.log).toHaveBeenCalledTimes(1); // yeni kayıt için REQUESTED audit (eski kayıt için YOK)
      expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_REQUESTED');
    },
  );

  it('DBIND-P1: disposition terminal idempotencyKey re-recommend icin supersede edilir ve taze request acilir', async () => {
    const key = 'collection-disposition-recommend:d1';
    const existing = mkReq({ id: 'oar-old-terminal', actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'd1', idempotencyKey: key, status: 'REJECTED' });
    const fresh = mkReq({ id: 'oar-fresh', actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'd1', idempotencyKey: key, status: 'PENDING_APPROVAL' });
    const { svc, prisma } = make({ reqSeq: [existing], createReturn: fresh });

    const res = await svc.createPendingRequest({
      tenantId: TENANT, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'd1',
      requesterUserId: REQUESTER, savedIntent: { dispositionId: 'd1' }, idempotencyKey: key,
    });

    expect(prisma.officeApprovalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'oar-old-terminal', idempotencyKey: key },
      data: { idempotencyKey: key + '::superseded:oar-old-terminal' },
    });
    expect(res).toBe(fresh);
  });

  it('H7: terminal-anahtar boşaltma yarışını KAYBEDEN (updateMany count=0) yine de create()e düşer; P2002 ile taze kaydı bulur', async () => {
    const existingTerminal = mkReq({ id: 'oar-old', idempotencyKey: 'k1', status: 'REJECTED' });
    const freshFromWinner = mkReq({ id: 'oar-fresh-winner', idempotencyKey: 'k1', status: 'PENDING_APPROVAL' });
    const findUnique = jest.fn()
      .mockResolvedValueOnce(existingTerminal) // ön-kontrol: terminal kayıt görülüyor
      .mockResolvedValueOnce(freshFromWinner); // P2002 sonrası: kazananın taze kaydı
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
    const prisma = {
      officeApprovalRequest: {
        findUnique,
        create: jest.fn().mockRejectedValue(p2002), // bu çağıran yarışı kaybetti
        updateMany: jest.fn().mockResolvedValue({ count: 0 }), // CAS'i KAYBETTİ (başka çağıran zaten boşalttı) — no-op
      },
      user: { findUnique: jest.fn() },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new OfficeApprovalService(prisma as never, audit as never);

    const res = await svc.createPendingRequest({
      tenantId: TENANT, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'case-1',
      requesterUserId: REQUESTER, savedIntent: { status: 'HITAM' }, idempotencyKey: 'k1',
    });

    expect(res).toBe(freshFromWinner); // kaybeden de doğru (taze, PENDING) kaydı elde eder
    expect(res.status).toBe('PENDING_APPROVAL');
    expect(audit.log).not.toHaveBeenCalled(); // bu çağıran REQUESTED audit YAZMAZ (kazanan zaten yazdı)
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

describe('DBIND-P1 OfficeApprovalService - disposition domain sync transaction', () => {
  const dispositionApproval = (over: Record<string, unknown> = {}) => mkReq({
    actionCode: 'COLLECTION_DISPOSITION_POST',
    targetType: 'COLLECTION_DISPOSITION',
    targetRef: 'd1',
    ...over,
  });

  it('generic approve terminal update sonrasi ayni transaction icinde domain sync cagirir; audit sonra yazilir', async () => {
    const updated = dispositionApproval({ status: 'APPROVED', approverUserId: APPROVER });
    const domainSync = { syncAfterDecision: jest.fn().mockResolvedValue(undefined) };
    const { svc, prisma, audit } = make({
      reqSeq: [dispositionApproval(), updated],
      approverUser: partner(),
      domainSync,
    });

    const res = await svc.approve('oar-1', APPROVER, 'ok');

    expect(res).toBe(updated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(domainSync.syncAfterDecision).toHaveBeenCalledWith(prisma, updated);
    const decisionOrder = prisma.officeApprovalRequest.updateMany.mock.invocationCallOrder[0];
    const syncOrder = domainSync.syncAfterDecision.mock.invocationCallOrder[0];
    const auditOrder = audit.log.mock.invocationCallOrder[0];
    expect(decisionOrder).toBeLessThan(syncOrder);
    expect(syncOrder).toBeLessThan(auditOrder);
  });

  it('sync hata verirse audit yazmaz ve karar cagrisi fail olur', async () => {
    const domainSync = { syncAfterDecision: jest.fn().mockRejectedValue(new ConflictException('sync fail')) };
    const { svc, audit } = make({ reqSeq: [dispositionApproval(), dispositionApproval({ status: 'APPROVED', approverUserId: APPROVER })], approverUser: partner(), domainSync });
    await expect(svc.approve('oar-1', APPROVER, 'ok')).rejects.toThrow(/sync fail/);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('double decision yarisi update count=0 ise sync ikinci kez calismaz', async () => {
    const domainSync = { syncAfterDecision: jest.fn().mockResolvedValue(undefined) };
    const { svc } = make({ reqSeq: [dispositionApproval()], approverUser: partner(), updateCount: 0, domainSync });
    await expect(svc.approve('oar-1', APPROVER, 'ok')).rejects.toBeInstanceOf(ConflictException);
    expect(domainSync.syncAfterDecision).not.toHaveBeenCalled();
  });
});

describe('PAYOUT-APPROVAL-2 OfficeApprovalService — actionCode dispatcher (CLIENT_PAYOUT_POST)', () => {
  const payoutReq = (over: Record<string, unknown> = {}) =>
    mkReq({ actionCode: 'CLIENT_PAYOUT_POST', targetType: 'CLIENT_PAYOUT_REQUEST', targetRef: 'idem-1', ...over });

  it('MANAGER, CLIENT_PAYOUT_POST talebini onaylayabilir (izole PayoutApprovalPolicy — isApproverEligible DEĞİL)', async () => {
    const { svc, prisma } = make({
      reqSeq: [payoutReq(), payoutReq({ status: 'APPROVED', approverUserId: APPROVER })],
      approverUser: manager(),
    });
    const res = await svc.approve('oar-1', APPROVER, 'ok');
    expect(res.status).toBe('APPROVED');
    expect(prisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it('Staff (Lawyer linki yok), CLIENT_PAYOUT_POST talebini onaylayamaz → Forbidden', async () => {
    const { svc } = make({
      reqSeq: [payoutReq()],
      approverUser: { id: APPROVER, isActive: true, tenantId: TENANT, lawyer: null },
    });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REGRESYON: MANAGER, CHANGE_STATUS (generic/disposition-tipi actionCode) talebini HÂLÂ onaylayamaz — dispatcher disposition davranışını DEĞİŞTİRMEDİ', async () => {
    const { svc, prisma } = make({ reqSeq: [mkReq()], approverUser: manager() });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('REGRESYON: MANAGER, COLLECTION_DISPOSITION_POST talebini HÂLÂ onaylayamaz (disposition = isApproverEligible, PARTNER-only)', async () => {
    const dispositionReq = () => mkReq({ actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'd1' });
    const { svc } = make({ reqSeq: [dispositionReq()], approverUser: manager() });
    await expect(svc.approve('oar-1', APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DBIND §5: eligible PARTNER kendi CLIENT_PAYOUT_POST talebini approve() ile onaylayabilir', async () => {
    const selfPartner = {
      id: REQUESTER,
      isActive: true,
      tenantId: TENANT,
      lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false },
    };
    const { svc, prisma } = make({
      reqSeq: [payoutReq(), payoutReq({ status: 'APPROVED', approverUserId: REQUESTER })],
      approverUser: selfPartner,
    });

    const res = await svc.approve('oar-1', REQUESTER, 'dbind §5');

    expect(res.status).toBe('APPROVED');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: REQUESTER } }));
    expect(prisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it('OWN-29-B: DBIND §5 COLLECTION_VOID icin uygulanmaz; eligible PARTNER self-approve edemez', async () => {
    const collectionVoidReq = () =>
      mkReq({
        actionCode: 'COLLECTION_VOID',
        targetType: 'COLLECTION',
        targetRef: 'col-1',
        requesterUserId: REQUESTER,
        savedIntent: { caseId: 'case-1', collectionId: 'col-1', cancelReason: 'sehven kayit' },
      });
    const selfPartner = {
      id: REQUESTER,
      isActive: true,
      tenantId: TENANT,
      lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false },
    };
    const { svc, prisma } = make({ reqSeq: [collectionVoidReq()], approverUser: selfPartner });

    await expect(svc.approve('oar-1', REQUESTER, 'self collection void')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('OWN-29-D: DBIND §5 CLAIM_ITEM_HIGH_IMPACT_CHANGE icin uygulanmaz; eligible PARTNER self-approve edemez', async () => {
    const claimItemReq = () =>
      mkReq({
        actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
        targetType: 'CLAIM_ITEM',
        targetRef: 'ci-1',
        requesterUserId: REQUESTER,
        savedIntent: {
          version: 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1',
          operation: 'UPDATE',
          caseId: 'case-1',
          claimItemId: 'ci-1',
          proposedPatch: { amount: 1200 },
          currentSnapshot: {},
          currentSnapshotHash: 'hash',
        },
      });
    const selfPartner = {
      id: REQUESTER,
      isActive: true,
      tenantId: TENANT,
      lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false },
    };
    const { svc, prisma } = make({ reqSeq: [claimItemReq()], approverUser: selfPartner });

    await expect(svc.approve('oar-1', REQUESTER, 'self claim item')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('DBIND §5: self requester CLIENT_PAYOUT_POST icin eligible degilse yine Forbidden ve karar yazilmaz', async () => {
    const { svc, prisma } = make({
      reqSeq: [payoutReq()],
      approverUser: { id: REQUESTER, isActive: true, tenantId: TENANT, lawyer: null },
    });

    await expect(svc.approve('oar-1', REQUESTER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
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

  it('P4-5C-2 markExecutionRetrying: FAILED→RUNNING (retryCount<MAX CAS) + runningStartedAt + RETRYING audit', async () => {
    const { svc, prisma, audit } = make({
      reqSeq: [mkReq({ status: 'APPROVED', executionStatus: 'FAILED' }), mkReq({ status: 'APPROVED', executionStatus: 'RUNNING' })],
    });
    await svc.markExecutionRetrying('oar-1', APPROVER, 3);
    const call = prisma.officeApprovalRequest.updateMany.mock.calls[0][0];
    expect(call.where.executionStatus).toBe('FAILED'); // STRICT FAILED→RUNNING
    expect(call.where.retryCount).toEqual({ lt: 3 }); // bounded
    expect(call.data.executionStatus).toBe('RUNNING');
    expect(call.data.runningStartedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls[0][0].action).toBe('OFFICE_APPROVAL_EXECUTION_RETRYING');
  });

  it('P4-5C-2 markExecutionRetrying: count=0 (FAILED değil / retryCount>=MAX / yarış) → Conflict', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'APPROVED', executionStatus: 'FAILED' })], updateCount: 0 });
    await expect(svc.markExecutionRetrying('oar-1', APPROVER, 3)).rejects.toBeInstanceOf(ConflictException);
  });

  it('P4-5C-2 markExecutionRetrying: APPROVED dışı (PENDING) → Conflict (executable değil)', async () => {
    const { svc } = make({ reqSeq: [mkReq({ status: 'PENDING_APPROVAL', executionStatus: 'FAILED' })] });
    await expect(svc.markExecutionRetrying('oar-1', APPROVER, 3)).rejects.toBeInstanceOf(ConflictException);
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
    const { svc, prisma, audit } = make({ reqSeq: [mkReq(), mkReq({ status: 'REVISION_REQUESTED', approverUserId: APPROVER, decisionNote: 'açıklamayı düzelt' })], approverUser: partner() });
    const res = await svc.requestRevision('oar-1', APPROVER, 'açıklamayı düzelt');
    expect(res.status).toBe('REVISION_REQUESTED');
    expect(prisma.officeApprovalRequest.updateMany.mock.calls[0][0].data.decisionNote).toBe('açıklamayı düzelt');
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
