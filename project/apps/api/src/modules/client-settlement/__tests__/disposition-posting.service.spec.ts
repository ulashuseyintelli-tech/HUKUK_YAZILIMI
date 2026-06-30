/**
 * TM3 M2 + S8-B FAZ-0 â€” DispositionPostingService (recommend/approve/post onay yaÅŸam dÃ¶ngÃ¼sÃ¼).
 *
 * BaÅŸarÄ± kriteri (UlaÅŸ):
 *  - recommend: line validasyonu (sum==total, HELD yasak, CLUSTER caseClientId, foreign reddi) + finansal etki YOK + P4 talebi.
 *  - approve: yalnÄ±z PARTNER/yetkili (isApproverEligible) + P4.approve (4-gÃ¶z); finansal etki YOK.
 *  - post: YALNIZ DISTRIBUTION_APPROVED + APPROVED P4; OFFSETâ†’BalanceLedger CREDIT korelasyonlu (finansal etki burada).
 *  - non-APPROVED post reddedilir; capability'siz approve reddedilir.
 */
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DispositionPostingService } from '../disposition-posting.service';

const D = (n: number) => new Prisma.Decimal(n);

const DISP_HELD = {
  id: 'd1', collectionId: 'col1', caseId: 'case1', beneficiaryScope: 'SINGLE_CASE_CLIENT',
  caseClientId: 'cc-A', totalAmount: D(100), currency: 'TRY', status: 'HELD_PENDING_DISTRIBUTION',
  approvalRequestId: null, approvedById: null, manualReversalRequiredAt: null,
};
const DISP_RECOMMENDED = { ...DISP_HELD, status: 'DISTRIBUTION_RECOMMENDED', approvalRequestId: 'appr-1' };
const DISP_APPROVED = { ...DISP_HELD, status: 'DISTRIBUTION_APPROVED', approvalRequestId: 'appr-1', approvedById: 'u2' };

function buildApproval(opts: { eligible?: boolean; requestId?: string } = {}) {
  return {
    createPendingRequest: jest.fn().mockResolvedValue({ id: opts.requestId ?? 'appr-1' }),
    approve: jest.fn().mockResolvedValue({}),
    isApproverEligible: jest.fn().mockResolvedValue(opts.eligible ?? true),
    markExecutionSucceeded: jest.fn().mockResolvedValue({}),
  } as any;
}

function buildPrisma(opts: { disp?: any; col?: any; validCaseClients?: any[]; lines?: any[]; approval?: any; expenseRequest?: any } = {}) {
  const tx = {
    collectionDispositionLine: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `line-${data.type}` })),
    },
    collectionDisposition: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    caseBalance: { findFirst: jest.fn().mockResolvedValue({ id: 'cb-1' }), create: jest.fn().mockResolvedValue({ id: 'cb-new' }) },
    balanceLedger: { create: jest.fn().mockResolvedValue({}) },
    // FAZ-1b reimbursement application + tx-iÃ§i expenseRequest doÄŸrulamasÄ±
    expenseRequest: { findFirst: jest.fn().mockResolvedValue(opts.expenseRequest ?? { totalAmount: D(50), paidTotal: D(0), currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED' }) },
    collectionDispositionExpenseApplication: { create: jest.fn().mockResolvedValue({ id: 'app-1' }) },
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'journal-1', _count: { lines: 2 } }),
    },
  };
  const prisma: any = {
    collectionDisposition: {
      findFirst: jest.fn().mockResolvedValue(opts.disp === undefined ? DISP_HELD : opts.disp),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    collection: { findFirst: jest.fn().mockResolvedValue(opts.col === undefined ? { status: 'CONFIRMED' } : opts.col) },
    caseClient: { findMany: jest.fn().mockResolvedValue(opts.validCaseClients ?? [{ id: 'cc-A', clientId: 'client-A' }]) },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue(opts.lines ?? []) },
    officeApprovalRequest: { findFirst: jest.fn().mockResolvedValue(opts.approval === undefined ? { status: 'APPROVED' } : opts.approval) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}
function buildReadService(remaining?: any) {
  return { computeExpenseRemaining: jest.fn().mockResolvedValue(remaining ?? D(1000000)) } as any;
}
const svc = (p: any, a?: any, r?: any) => new DispositionPostingService(p, a ?? buildApproval(), r ?? buildReadService());

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ recommend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('DispositionPostingService.recommend', () => {
  it('SINGLE happy: sum==total â†’ RECOMMENDED + lines + caseClientId inherit + P4 talebi (finansal etki YOK)', async () => {
    const { prisma, tx } = buildPrisma();
    const approval = buildApproval();
    const res = await svc(prisma, approval).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' });

    expect(res.recommended).toBe(true);
    expect(res.approvalRequestId).toBe('appr-1');
    expect(approval.createPendingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'COLLECTION_DISPOSITION_POST', targetRef: 'd1', requesterUserId: 'u1' }),
    );
    const pendingArg = approval.createPendingRequest.mock.calls[0][0];
    expect(pendingArg.reason).toContain('Dagitim kesinlesmeden once yetkili onayi gerekir.');
    expect(pendingArg.savedIntent).toEqual(expect.objectContaining({
      version: 'S9H_COLLECTION_DISPOSITION_POST_INTENT_V1',
      risk: expect.objectContaining({ decision: 'REQUIRE_APPROVAL' }),
      visibility: expect.objectContaining({ detailRequiresServerSideMasking: true }),
    }));
    expect(JSON.stringify(pendingArg.savedIntent)).not.toContain('internalMessage');
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CLIENT_PAYABLE', caseClientId: 'cc-A' }) }),
    );
    expect(tx.collectionDisposition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DISTRIBUTION_RECOMMENDED', recommendedById: 'u1', approvalRequestId: 'appr-1' }) }),
    );
    expect(tx.balanceLedger.create).not.toHaveBeenCalled(); // recommend'da finansal etki YOK
  });

  it('Ã§ok satÄ±rlÄ±: auto-postable bucketlar + toplam==tahsilat', async () => {
    const { prisma, tx } = buildPrisma();
    const res = await svc(prisma).recommend('t1', 'd1', {
      lines: [
        { type: 'CLIENT_PAYABLE', amount: '10' }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '15', expenseRequestId: 'er-c' },
        { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '20' }, { type: 'FIRM_EXPENSE_REIMBURSEMENT', amount: '5', expenseRequestId: 'er-f' },
        { type: 'OFFSET_CLIENT_ADVANCE', amount: '50' },
      ],
    }, { userId: 'u1' });
    expect(res.lineCount).toBe(5);
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledTimes(5);
  });

  it('Q3: SINGLE scope fee (CONTRACTUAL_FEE_WITHHELD) caseClientId=null KALIR; CLIENT_PAYABLE cc-A alÄ±r', async () => {
    const { prisma, tx } = buildPrisma();
    await svc(prisma).recommend('t1', 'd1', {
      lines: [{ type: 'CONTRACTUAL_FEE_WITHHELD', amount: '30' }, { type: 'CLIENT_PAYABLE', amount: '70' }],
    }, { userId: 'u1' });
    const created = tx.collectionDispositionLine.create.mock.calls.map(
      ([a]: any[]) => ({ type: a.data.type, caseClientId: a.data.caseClientId }),
    );
    // BÃ¼ro geliri client-attributed DEÄÄ°L â†’ SINGLE scope'ta dahi caseClientId null kalmalÄ± (Q3).
    expect(created).toContainEqual({ type: 'CONTRACTUAL_FEE_WITHHELD', caseClientId: null });
    // MÃ¼vekkil payÄ± client-attributed â†’ tek-alacaklÄ±nÄ±n caseClientId'sini devralÄ±r.
    expect(created).toContainEqual({ type: 'CLIENT_PAYABLE', caseClientId: 'cc-A' });
  });

  it('OTHER bucket -> MANUAL_REVIEW; OfficeApprovalRequest yaratÄ±lmaz ve transaction aÃ§Ä±lmaz', async () => {
    const { prisma } = buildPrisma();
    const approval = buildApproval();
    await expect(svc(prisma, approval).recommend('t1', 'd1', {
      lines: [{ type: 'CLIENT_PAYABLE', amount: '75' }, { type: 'OTHER', amount: '25' }],
    }, { userId: 'u1' })).rejects.toThrow(/manuel inceleme|OTHER/);
    expect(approval.createPendingRequest).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('sum < total â†’ reject, $transaction aÃ§Ä±lmaz', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '70' }] }, { userId: 'u1' })).rejects.toThrow(/eÅŸit olmalÄ±/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sum > total â†’ reject', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '120' }] }, { userId: 'u1' })).rejects.toThrow(/eÅŸit olmalÄ±/);
  });

  it('HELD_PENDING_DISTRIBUTION satÄ±r â†’ reject', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'HELD_PENDING_DISTRIBUTION', amount: '100' }] }, { userId: 'u1' })).rejects.toThrow(/HELD_PENDING_DISTRIBUTION/);
  });

  it('CLUSTER CLIENT_PAYABLE caseClientId yoksa â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: { ...DISP_HELD, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null } });
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' })).rejects.toThrow(/caseClientId zorunlu/);
  });

  it('CLUSTER explicit caseClientId ile kabul', async () => {
    const { prisma, tx } = buildPrisma({ disp: { ...DISP_HELD, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null }, validCaseClients: [{ id: 'cc-A' }, { id: 'cc-B' }] });
    const res = await svc(prisma).recommend('t1', 'd1', {
      lines: [{ type: 'CLIENT_PAYABLE', amount: '70', caseClientId: 'cc-A' }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '30', caseClientId: 'cc-B', expenseRequestId: 'er-b' }],
    }, { userId: 'u1' });
    expect(res.lineCount).toBe(2);
    expect(tx.collectionDispositionLine.create.mock.calls.map(([a]: any[]) => a.data.caseClientId)).toEqual(['cc-A', 'cc-B']);
  });

  it('yabancÄ±/uygunsuz caseClientId â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: { ...DISP_HELD, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null }, validCaseClients: [] });
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100', caseClientId: 'cc-FOREIGN' }] }, { userId: 'u1' })).rejects.toThrow(/geÃ§ersiz\/yabancÄ±|uygun rolde/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('disposition HELD deÄŸilse â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: DISP_RECOMMENDED });
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' })).rejects.toThrow(/HELD_PENDING_DISTRIBUTION Ã¶nerilebilir/);
  });

  it('collection CONFIRMED deÄŸilse â†’ reject', async () => {
    const { prisma } = buildPrisma({ col: { status: 'CANCELLED' } });
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' })).rejects.toThrow(/posting yasak/);
  });

  it('disposition bulunamazsa â†’ NotFound', async () => {
    const { prisma } = buildPrisma({ disp: null });
    await expect(svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' })).rejects.toThrow(NotFoundException);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('DispositionPostingService.approve', () => {
  it('happy: eligible approver â†’ DISTRIBUTION_APPROVED + P4.approve Ã§aÄŸrÄ±lÄ±r (finansal etki YOK)', async () => {
    const { prisma } = buildPrisma({ disp: DISP_RECOMMENDED });
    const approval = buildApproval({ eligible: true });
    const res = await svc(prisma, approval).approve('t1', 'd1', { userId: 'u2' }, 'onaylandÄ±');
    expect(res.approved).toBe(true);
    expect(approval.approve).toHaveBeenCalledWith('appr-1', 'u2', 'onaylandÄ±');
    expect(prisma.collectionDisposition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DISTRIBUTION_APPROVED', approvedById: 'u2' }) }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled(); // finansal etki YOK
  });

  it('capability olmayan kullanÄ±cÄ± â†’ Forbidden, P4.approve Ã§aÄŸrÄ±lmaz', async () => {
    const { prisma } = buildPrisma({ disp: DISP_RECOMMENDED });
    const approval = buildApproval({ eligible: false });
    await expect(svc(prisma, approval).approve('t1', 'd1', { userId: 'u9' })).rejects.toThrow(ForbiddenException);
    expect(approval.approve).not.toHaveBeenCalled();
  });

  it('disposition RECOMMENDED deÄŸilse â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: DISP_HELD });
    await expect(svc(prisma).approve('t1', 'd1', { userId: 'u2' })).rejects.toThrow(/DISTRIBUTION_RECOMMENDED onaylanabilir/);
  });

  it('P4 self-approval (requester===approver) â†’ P4.approve hatasÄ± yukarÄ± taÅŸÄ±nÄ±r', async () => {
    const { prisma } = buildPrisma({ disp: DISP_RECOMMENDED });
    const approval = buildApproval({ eligible: true });
    approval.approve = jest.fn().mockRejectedValue(new BadRequestException('SELF_APPROVAL_FORBIDDEN'));
    await expect(svc(prisma, approval).approve('t1', 'd1', { userId: 'u1' })).rejects.toThrow(/SELF_APPROVAL_FORBIDDEN/);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ post â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('DispositionPostingService.post', () => {
  it('happy: DISTRIBUTION_APPROVED + APPROVED P4 â†’ POSTED + markExecutionSucceeded', async () => {
    const { prisma, tx } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'l1', type: 'CLIENT_PAYABLE', amount: D(100), caseClientId: 'cc-A' }] });
    const approval = buildApproval();
    const res = await svc(prisma, approval).post('t1', 'd1', { userId: 'u3' });
    expect(res).toEqual({ posted: true, dispositionId: 'd1', lineCount: 1 });
    expect(tx.collectionDisposition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'DISTRIBUTION_APPROVED' }), data: expect.objectContaining({ status: 'POSTED', postedById: 'u3' }) }),
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'COLLECTION_DISPOSITION_LINE',
          sourceId: 'l1',
          sourceAction: 'posted',
          lines: { create: expect.arrayContaining([expect.objectContaining({ dispositionLineId: 'l1', caseClientId: 'cc-A' })]) },
        }),
      }),
    );
    expect(approval.markExecutionSucceeded).toHaveBeenCalledWith('appr-1', 'u3');
  });

  it('disposition APPROVED deÄŸilse â†’ reject (Partner/Manager onayÄ± gerekir)', async () => {
    const { prisma } = buildPrisma({ disp: DISP_RECOMMENDED });
    await expect(svc(prisma).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/DISTRIBUTION_APPROVED post edilebilir/);
  });

  it('P4 request APPROVED deÄŸilse â†’ conflict (post yasak)', async () => {
    const { prisma } = buildPrisma({ disp: DISP_APPROVED, approval: { status: 'PENDING_APPROVAL' }, lines: [{ id: 'l1', type: 'CLIENT_PAYABLE', amount: D(100), caseClientId: 'cc-A' }] });
    await expect(svc(prisma).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/APPROVED deÄŸil/);
  });

  it('manualReversalRequiredAt marker taÅŸÄ±yan disposition post edilmez; manual review olur ve mutation yoktur', async () => {
    const { prisma } = buildPrisma({
      disp: { ...DISP_APPROVED, manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') },
      lines: [{ id: 'l1', type: 'CLIENT_PAYABLE', amount: D(100), caseClientId: 'cc-A' }],
    });
    const approval = buildApproval();
    await expect(svc(prisma, approval).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/manuel reversal|inceleme/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(approval.markExecutionSucceeded).not.toHaveBeenCalled();
  });
  it('OFFSET_CLIENT_ADVANCE â†’ BalanceLedger CREDIT korelasyonlu (mevcut line id ile)', async () => {
    const { prisma, tx } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'lineX', type: 'OFFSET_CLIENT_ADVANCE', amount: D(100) }] });
    await svc(prisma).post('t1', 'd1', { userId: 'u3' });
    expect(tx.balanceLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CREDIT', amount: D(100), source: 'disposition_line:lineX', sourceId: 'lineX' }) }),
    );
  });

  it('line toplamÄ± != totalAmount (tamper guard) â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'l1', type: 'CLIENT_PAYABLE', amount: D(70) }] });
    await expect(svc(prisma).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/eÅŸit olmalÄ±/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('collection CONFIRMED deÄŸilse (approveâ†’post arasÄ± iptal) â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: DISP_APPROVED, col: { status: 'CANCELLED' }, lines: [{ id: 'l1', type: 'CLIENT_PAYABLE', amount: D(100), caseClientId: 'cc-A' }] });
    await expect(svc(prisma).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/posting yasak/);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ FAZ-1b reimbursement application â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('DispositionPostingService FAZ-1b reimbursement', () => {
  it('recommend: REIMBURSEMENT satÄ±rÄ± expenseRequestId taÅŸÄ±mÄ±yorsa â†’ reject', async () => {
    const { prisma } = buildPrisma();
    await expect(
      svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '100' }] }, { userId: 'u1' }),
    ).rejects.toThrow(/expenseRequestId zorunlu/);
  });

  it('recommend: REIMBURSEMENT satÄ±rÄ± expenseRequestId line\'a yazÄ±lÄ±r', async () => {
    const { prisma, tx } = buildPrisma();
    await svc(prisma).recommend('t1', 'd1', { lines: [{ type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '100', expenseRequestId: 'er1' }] }, { userId: 'u1' });
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CLIENT_EXPENSE_REIMBURSEMENT', expenseRequestId: 'er1' }) }),
    );
  });

  it('post: REIMBURSEMENT â†’ APPLY application yazÄ±lÄ±r (CLIENT_FRONTED; paidTotal mutate YOK)', async () => {
    const { prisma, tx } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'l1', type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: D(100), caseClientId: 'cc-A', expenseRequestId: 'er1' }] });
    await svc(prisma).post('t1', 'd1', { userId: 'u3' });
    expect(tx.collectionDispositionExpenseApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expenseRequestId: 'er1', kind: 'APPLY', amount: D(100), reimbursementScope: 'CLIENT_FRONTED', collectionDispositionLineId: 'l1' }) }),
    );
    expect((tx.expenseRequest as any).update).toBeUndefined(); // projection-first: paidTotal mutate YOK (update yok)
  });

  it('post: FIRM_EXPENSE_REIMBURSEMENT â†’ reimbursementScope FIRM_FRONTED', async () => {
    const { prisma, tx } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'l1', type: 'FIRM_EXPENSE_REIMBURSEMENT', amount: D(100), expenseRequestId: 'er1' }] });
    await svc(prisma).post('t1', 'd1', { userId: 'u3' });
    expect(tx.collectionDispositionExpenseApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reimbursementScope: 'FIRM_FRONTED' }) }),
    );
  });

  it('post: hedef masraf APPROVED deÄŸilse â†’ reject (application yazÄ±lmaz)', async () => {
    const { prisma, tx } = buildPrisma({
      disp: DISP_APPROVED,
      lines: [{ id: 'l1', type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: D(100), caseClientId: 'cc-A', expenseRequestId: 'er1' }],
      expenseRequest: { totalAmount: D(50), paidTotal: D(0), currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'PENDING_APPROVAL' },
    });
    await expect(svc(prisma).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/APPROVED/);
    expect(tx.collectionDispositionExpenseApplication.create).not.toHaveBeenCalled();
  });

  it('post: reimbursement tutarÄ± masraf kalanÄ±nÄ± aÅŸarsa â†’ reject', async () => {
    const { prisma } = buildPrisma({ disp: DISP_APPROVED, lines: [{ id: 'l1', type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: D(100), caseClientId: 'cc-A', expenseRequestId: 'er1' }] });
    await expect(svc(prisma, undefined, buildReadService(D(40))).post('t1', 'd1', { userId: 'u3' })).rejects.toThrow(/aÅŸamaz|kalanÄ±nÄ±/);
  });
});
