import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DistributionRecommendationService } from '../distribution-recommendation.service';

const ACTOR = { userId: 'u-1' };

function defaultDisp(extra: Record<string, unknown> = {}) {
  return {
    id: 'disp-1',
    status: 'HELD_PENDING_DISTRIBUTION',
    currency: 'TRY',
    totalAmount: '100000',
    beneficiaryScope: 'SINGLE_CASE_CLIENT',
    caseClientId: 'cc-1',
    caseId: 'case-1',
    ...extra,
  };
}

function makeService(
  overrides: { disp?: unknown; eligibility?: unknown; caseClient?: unknown } = {},
) {
  const prisma = {
    collectionDisposition: {
      findFirst: jest.fn().mockResolvedValue(overrides.disp ?? defaultDisp()),
    },
    caseClient: {
      findFirst: jest.fn().mockResolvedValue(overrides.caseClient ?? { client: { id: 'client-1' } }),
    },
  };
  const offset = {
    getEligibility: jest.fn().mockResolvedValue(
      overrides.eligibility ?? { eligibleExpenseRequests: [] },
    ),
  };
  const svc = new DistributionRecommendationService(prisma as never, offset as never);
  return { svc, prisma, offset };
}

describe('DistributionRecommendationService (S8-B FAZ-1a)', () => {
  it('fee=0 → tek CLIENT_PAYABLE = gross, sum==gross, finansal etki yok', async () => {
    const { svc } = makeService();
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines).toEqual([
      { type: 'CLIENT_PAYABLE', amount: '100000', caseClientId: 'cc-1', origin: 'CLIENT_PAYABLE_RESIDUAL', editable: true },
    ]);
    expect(r.sumCheck).toEqual({ sum: '100000', equalsGross: true });
    expect(r.financialEffect).toBe(false);
    expect(r.recommendOnly).toBe(true);
  });

  it('0<fee<gross → [FEE, PAYABLE] sum==gross, faithful decimal, fee client-attributed DEĞİL', async () => {
    const { svc } = makeService();
    const r = await svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '33333.33' } }, ACTOR);
    expect(r.suggestedLines.map((l) => [l.type, l.amount])).toEqual([
      ['CONTRACTUAL_FEE_WITHHELD', '33333.33'],
      ['CLIENT_PAYABLE', '66666.67'],
    ]);
    expect(r.suggestedLines[0].caseClientId).toBeNull();
    expect(r.suggestedLines[1].caseClientId).toBe('cc-1');
    expect(r.sumCheck.equalsGross).toBe(true);
  });

  it('fee==gross → yalnız FEE, CLIENT_PAYABLE yok + residual-0 uyarısı, sum==gross', async () => {
    const { svc } = makeService();
    const r = await svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '100000' } }, ACTOR);
    expect(r.suggestedLines.map((l) => l.type)).toEqual(['CONTRACTUAL_FEE_WITHHELD']);
    expect(r.warnings.some((w) => w.includes('₺0'))).toBe(true);
    expect(r.sumCheck.equalsGross).toBe(true);
  });

  it('fee>gross → BadRequest (clamp YOK)', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '100001' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('geçersiz ücret string → BadRequest', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: 'abc' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ücret number/float (string değil) → BadRequest (faithful decimal-string zorunlu)', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: 5000.5 as never } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ücret >2 ondalık → BadRequest (Decimal 15,2 uyumu)', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '33333.333' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gross=0 → boş suggestedLines + residual-0 uyarısı, sum==gross (0==0)', async () => {
    const { svc } = makeService({ disp: defaultDisp({ totalAmount: '0' }) });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines).toEqual([]);
    expect(r.sumCheck).toEqual({ sum: '0', equalsGross: true });
    expect(r.warnings.some((w) => w.includes('₺0'))).toBe(true);
  });

  it('caseClient client çözülemezse → candidates [] ve getEligibility çağrılmaz', async () => {
    const { svc, prisma, offset } = makeService();
    prisma.caseClient.findFirst.mockResolvedValueOnce(null);
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.expenseModule.candidates).toEqual([]);
    expect(offset.getEligibility).not.toHaveBeenCalled();
  });

  it('mode!=AMOUNT → BadRequest (oran modeli FAZ-2)', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'RATE' as never, amount: '10' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-HELD disposition → BadRequest', async () => {
    const { svc } = makeService({ disp: defaultDisp({ status: 'POSTED' }) });
    await expect(svc.generate('t1', 'disp-1', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('disposition yok → NotFound', async () => {
    const { svc, prisma } = makeService();
    prisma.collectionDisposition.findFirst.mockResolvedValueOnce(null);
    await expect(svc.generate('t1', 'x', {}, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('masraf adayı var → autoApply false, aynı-dosya filtreli listede, suggestedLines DIŞINDA, uyarı', async () => {
    const { svc, offset } = makeService({
      eligibility: {
        eligibleExpenseRequests: [
          { expenseCaseId: 'case-1', expenseRequestId: 'er-1', clientId: 'client-1', currency: 'TRY', unpaidAmount: '5000', caseNumber: '2026/1', requestStatus: 'SENT' },
          { expenseCaseId: 'OTHER', expenseRequestId: 'er-2', clientId: 'client-1', currency: 'TRY', unpaidAmount: '9000', caseNumber: '2026/2', requestStatus: 'SENT' },
        ],
      },
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.expenseModule.autoApplyEnabled).toBe(false);
    expect(r.expenseModule.disabledReason).toBe('EXPENSE_APPROVAL_FIELD_MISSING');
    expect(r.expenseModule.candidates.map((c) => c.expenseRequestId)).toEqual(['er-1']); // same-case only
    expect(r.expenseModule.candidates[0]).toMatchObject({ applied: false, remaining: '5000', status: 'SENT' });
    expect(r.suggestedLines.every((l) => l.type !== 'CLIENT_EXPENSE_REIMBURSEMENT')).toBe(true);
    expect(r.warnings.some((w) => w.includes('otomatik masraf önerisi devre dışı'))).toBe(true);
    expect(offset.getEligibility).toHaveBeenCalledWith('t1', 'u-1', 'client-1', 'TRY');
  });

  it('CLUSTER → boş suggestedLines + cluster uyarısı, getEligibility çağrılmaz', async () => {
    const { svc, offset } = makeService({
      disp: defaultDisp({ beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null }),
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines).toEqual([]);
    expect(r.warnings.some((w) => w.includes('Çoklu-alacaklı'))).toBe(true);
    expect(offset.getEligibility).not.toHaveBeenCalled();
  });
});
