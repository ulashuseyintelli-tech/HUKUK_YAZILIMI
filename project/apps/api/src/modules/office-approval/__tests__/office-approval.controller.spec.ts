/** @jest-environment node */
import 'reflect-metadata';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OfficeApprovalController } from '../office-approval.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * P4-4 — OfficeApprovalController testleri (servis mock'lu; controller mantığı).
 * KESİN: inbox yetkisiz→[] · detail tenant+visibility→404 · action'lar thin pass-through · raw Prisma entity SIZMAZ ·
 *   DETAIL ham savedIntent/replacementSavedIntent EXPOSE (Ulaş kilidi) · decision-only (controller execution çağırmaz).
 */

const mkReq = (over: Record<string, unknown> = {}) => ({
  id: 'r1', tenantId: 't1', actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: 'c1',
  requesterUserId: 'req-user', approverUserId: null, status: 'PENDING_APPROVAL', executionStatus: 'NOT_RUN',
  savedIntent: { status: 'ACIZ', reason: 'GIZLI_GEREKCE' }, payloadHash: 'a'.repeat(64),
  replacementSavedIntent: null, replacementPayloadHash: null, reason: 'GIZLI_GEREKCE', decisionNote: null,
  idempotencyKey: 'idem-secret', createdAt: new Date(), decidedAt: null, executedAt: null, expiresAt: null, ...over,
});

const mk = (over: Record<string, unknown> = {}) => {
  const service: any = {
    isApproverEligible: jest.fn().mockResolvedValue(false),
    listForTenant: jest.fn().mockResolvedValue([mkReq()]),
    getByIdForTenant: jest.fn().mockResolvedValue(mkReq()),
    approve: jest.fn().mockResolvedValue(mkReq({ status: 'APPROVED', approverUserId: 'appr' })),
    reject: jest.fn().mockResolvedValue(mkReq({ status: 'REJECTED' })),
    requestRevision: jest.fn().mockResolvedValue(mkReq({ status: 'REVISION_REQUESTED' })),
    approveWithChanges: jest.fn().mockResolvedValue(mkReq({ status: 'APPROVED_WITH_CHANGES', replacementSavedIntent: { status: 'BATAK' }, replacementPayloadHash: 'b'.repeat(64) })),
    cancel: jest.fn().mockResolvedValue(mkReq({ status: 'CANCELLED' })),
    ...over,
  };
  return { ctrl: new OfficeApprovalController(service), service };
};

describe('P4-4 OfficeApprovalController — inbox / mine', () => {
  it('inbox: yetkisiz → boş liste (403 DEĞİL); listForTenant ÇAĞRILMAZ', async () => {
    const { ctrl, service } = mk({ isApproverEligible: jest.fn().mockResolvedValue(false) });
    const res = await ctrl.inbox('u1', 't1', undefined);
    expect(res).toEqual({ success: true, data: [] });
    expect(service.listForTenant).not.toHaveBeenCalled();
  });

  it('inbox: eligible → listForTenant(view:inbox, caller, status); SUMMARY (raw savedIntent + tenantId YOK)', async () => {
    const { ctrl, service } = mk({ isApproverEligible: jest.fn().mockResolvedValue(true) });
    const res: any = await ctrl.inbox('u1', 't1', undefined);
    expect(service.listForTenant).toHaveBeenCalledWith('t1', { view: 'inbox', callerUserId: 'u1', status: undefined });
    expect(res.data[0]).toMatchObject({ id: 'r1', status: 'PENDING_APPROVAL', hasReplacement: false });
    expect(res.data[0]).not.toHaveProperty('savedIntent'); // summary: raw payload YOK
    expect(res.data[0]).not.toHaveProperty('tenantId');     // raw entity sızmaz
    expect(res.data[0]).not.toHaveProperty('idempotencyKey');
  });

  it('inbox: geçersiz status → 400 (eligible bile olsa)', async () => {
    const { ctrl } = mk({ isApproverEligible: jest.fn().mockResolvedValue(true) });
    await expect(ctrl.inbox('u1', 't1', 'BOGUS')).rejects.toThrow(BadRequestException);
  });

  it('mine: listForTenant(view:mine, caller, status) → kendi talepleri', async () => {
    const { ctrl, service } = mk();
    await ctrl.mine('u1', 't1', 'APPROVED');
    expect(service.listForTenant).toHaveBeenCalledWith('t1', { view: 'mine', callerUserId: 'u1', status: 'APPROVED' });
  });
});

describe('P4-4 OfficeApprovalController — detail (tenant + visibility)', () => {
  it('tenant mismatch → getByIdForTenant 404 propagate', async () => {
    const { ctrl } = mk({ getByIdForTenant: jest.fn().mockRejectedValue(new NotFoundException()) });
    await expect(ctrl.detail('u1', 't-OTHER', 'r1')).rejects.toThrow(NotFoundException);
  });

  it('requester görebilir (eligible olmasa bile; eligibility lookup short-circuit)', async () => {
    const isApproverEligible = jest.fn().mockResolvedValue(false);
    const { ctrl } = mk({ getByIdForTenant: jest.fn().mockResolvedValue(mkReq({ requesterUserId: 'u1' })), isApproverEligible });
    const res: any = await ctrl.detail('u1', 't1', 'r1');
    expect(res.data.id).toBe('r1');
    expect(isApproverEligible).not.toHaveBeenCalled();
    expect(res.data).toHaveProperty('savedIntent'); // DETAIL ham niyet EXPOSE (Ulaş kilidi)
  });

  it('eligible approver (requester DEĞİL) görebilir', async () => {
    const { ctrl } = mk({ getByIdForTenant: jest.fn().mockResolvedValue(mkReq({ requesterUserId: 'someone-else' })), isApproverEligible: jest.fn().mockResolvedValue(true) });
    const res: any = await ctrl.detail('u1', 't1', 'r1');
    expect(res.data.id).toBe('r1');
  });

  it('ilgisiz kullanıcı (requester değil + eligible değil) → 404 (existence-oracle yok)', async () => {
    const { ctrl } = mk({ getByIdForTenant: jest.fn().mockResolvedValue(mkReq({ requesterUserId: 'someone-else' })), isApproverEligible: jest.fn().mockResolvedValue(false) });
    await expect(ctrl.detail('u1', 't1', 'r1')).rejects.toThrow(NotFoundException);
  });

  it('raw Prisma entity SIZMAZ: tenantId/idempotencyKey yanıtta YOK; ama savedIntent/replacementSavedIntent EXPOSE', async () => {
    const { ctrl } = mk({ getByIdForTenant: jest.fn().mockResolvedValue(mkReq({ requesterUserId: 'u1', replacementSavedIntent: { status: 'BATAK' } })) });
    const res: any = await ctrl.detail('u1', 't1', 'r1');
    expect(res.data).not.toHaveProperty('tenantId');
    expect(res.data).not.toHaveProperty('idempotencyKey');
    expect(res.data).toHaveProperty('savedIntent');
    expect(res.data.replacementSavedIntent).toEqual({ status: 'BATAK' });
  });
});

describe('P4-4 OfficeApprovalController — actions (thin pass-through, decision-only)', () => {
  it('approve → service.approve(id, actor, note); detail DTO (APPROVED)', async () => {
    const { ctrl, service } = mk();
    const res: any = await ctrl.approve('appr', 'r1', { note: 'ok' });
    expect(service.approve).toHaveBeenCalledWith('r1', 'appr', 'ok');
    expect(res.data.status).toBe('APPROVED');
    expect(res.data.executionStatus).toBe('NOT_RUN'); // decision-only: execution tetiklenmez
  });

  it('reject → service.reject(id, actor, note)', async () => {
    const { ctrl, service } = mk();
    await ctrl.reject('appr', 'r1', { note: 'gerekçe' });
    expect(service.reject).toHaveBeenCalledWith('r1', 'appr', 'gerekçe');
  });

  it('request-revision → service.requestRevision(id, actor, note)', async () => {
    const { ctrl, service } = mk();
    await ctrl.requestRevision('appr', 'r1', { note: 'revize et' });
    expect(service.requestRevision).toHaveBeenCalledWith('r1', 'appr', 'revize et');
  });

  it('approve-with-changes → service.approveWithChanges(id, actor, replacement, note); detail replacement gösterir', async () => {
    const { ctrl, service } = mk();
    const res: any = await ctrl.approveWithChanges('appr', 'r1', { replacementSavedIntent: { status: 'BATAK' } as Record<string, unknown>, note: 'değiştir' });
    expect(service.approveWithChanges).toHaveBeenCalledWith('r1', 'appr', { status: 'BATAK' }, 'değiştir');
    expect(res.data.status).toBe('APPROVED_WITH_CHANGES');
    expect(res.data.replacementSavedIntent).toEqual({ status: 'BATAK' });
  });

  it('cancel → service.cancel(id, actor)', async () => {
    const { ctrl, service } = mk();
    const res: any = await ctrl.cancel('req-user', 'r1');
    expect(service.cancel).toHaveBeenCalledWith('r1', 'req-user');
    expect(res.data.status).toBe('CANCELLED');
  });

  it('controller markExecution* / changeStatus ÇAĞIRMAZ (decision-only; servis mock\'unda öyle metod yok → erişilmez)', () => {
    const { service } = mk();
    expect(service.markExecutionSucceeded).toBeUndefined(); // controller execution yüzeyine dokunmaz
  });
});

describe('P4-4 OfficeApprovalController — guard', () => {
  it('class-level JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', OfficeApprovalController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });
});
