/** @jest-environment node */
import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
jest.mock('../../office-approval/office-approval.service', () => ({
  OfficeApprovalService: class OfficeApprovalService {},
}));

import { FinancialCaseCloseApprovalService } from '../financial-case-close-approval.service';
import {
  FINANCIAL_CASE_CLOSE_ACTION_CODE,
  FINANCIAL_CASE_CLOSE_INTENT_VERSION,
  FINANCIAL_CASE_CLOSE_TARGET_TYPE,
} from '../financial-case-close.constants';

const mk = (caseRow: unknown = { id: 'case-1' }, request: any = { id: 'req-1', status: 'PENDING_APPROVAL', payloadHash: 'x' }) => {
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue(caseRow) },
  };
  const officeApproval: any = {
    createPendingRequest: jest.fn().mockResolvedValue(request),
  };
  const svc = new FinancialCaseCloseApprovalService(prisma, officeApproval);
  return { svc, prisma, officeApproval };
};

describe('OWN-29-C FinancialCaseCloseApprovalService', () => {
  it.each([
    'HITAM',
    'INFAZ',
    'MUVEKKILE_IADE',
    'ACIZ',
    'BATAK',
    'MAHSUP',
    'TEMLIK',
  ])('%s financial-close status kabul edilir', (status) => {
    const { svc } = mk();
    expect(svc.isFinancialCloseStatus(status as never)).toBe(true);
  });

  it.each(['AZIL', 'FERAGAT', 'SULH'])(
    '%s tek başına OWN-29-C financial-close değildir',
    (status) => {
      const { svc } = mk();
      expect(svc.isFinancialCloseStatus(status as never)).toBe(false);
    },
  );

  it('requestApproval yalnız OfficeApprovalRequest oluşturur; Case status mutation yapmaz', async () => {
    const { svc, prisma, officeApproval } = mk();
    const res = await svc.requestApproval({
      actorUserId: 'requester',
      tenantId: 't1',
      caseId: 'case-1',
      status: 'HITAM' as never,
      reason: 'tam ödeme',
    });

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 't1' },
      select: { id: true },
    });
    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith({
      tenantId: 't1',
      actionCode: FINANCIAL_CASE_CLOSE_ACTION_CODE,
      targetType: FINANCIAL_CASE_CLOSE_TARGET_TYPE,
      targetRef: 'case-1',
      requesterUserId: 'requester',
      savedIntent: {
        version: FINANCIAL_CASE_CLOSE_INTENT_VERSION,
        caseId: 'case-1',
        status: 'HITAM',
        reason: 'tam ödeme',
      },
      reason: 'Finansal dosya kapanışı yetkili onayı gerektirir.',
      idempotencyKey: 'financial-case-close:case-1',
    });
    expect(prisma.case.update).toBeUndefined();
    expect(res.outcome).toBe('APPROVAL_REQUIRED');
    expect(res.actionCode).toBe(FINANCIAL_CASE_CLOSE_ACTION_CODE);
    expect(res.approval).toEqual({ requestId: 'req-1', status: 'PENDING_APPROVAL' });
  });

  it('case yoksa request açmaz', async () => {
    const { svc, officeApproval } = mk(null);
    await expect(
      svc.requestApproval({
        actorUserId: 'requester',
        tenantId: 't1',
        caseId: 'missing',
        status: 'HITAM' as never,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });
});
