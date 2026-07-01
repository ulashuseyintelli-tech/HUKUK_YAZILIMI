import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DistributionRecommendationService } from '../distribution-recommendation.service';
import type { DistributionRecommendation } from '../dto/distribution-recommendation.dto';

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
  overrides: {
    disp?: unknown;
    eligibility?: unknown;
    caseClient?: unknown;
    /** FAZ-2: getActiveForCaseClient dönüşü. Omit -> null (mevcut davranış; agreement yok). */
    feeAgreement?: unknown;
  } = {},
) {
  const prisma = {
    $transaction: jest.fn(),
    collectionDisposition: {
      findFirst: jest.fn().mockResolvedValue(overrides.disp ?? defaultDisp()),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    collectionDispositionLine: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    accountingJournalEntry: {
      create: jest.fn(),
    },
    accountingJournalLine: {
      create: jest.fn(),
    },
    officeApprovalRequest: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
  const feeAgreements = {
    getActiveForCaseClient: jest.fn().mockResolvedValue(overrides.feeAgreement ?? null),
  };
  const svc = new DistributionRecommendationService(prisma as never, offset as never, feeAgreements as never);
  return { svc, prisma, offset, feeAgreements };
}

function activeFlatAgreement(extra: Record<string, unknown> = {}) {
  return {
    id: 'cfa-1',
    feeType: 'FLAT_AMOUNT',
    flatAmount: '15000.00',
    percentageBps: null,
    feeBase: 'GROSS',
    status: 'ACTIVE',
    ...extra,
  };
}

function activePercentageAgreement(extra: Record<string, unknown> = {}) {
  return {
    id: 'cfa-2',
    feeType: 'PERCENTAGE_OF_COLLECTION',
    flatAmount: null,
    percentageBps: 1500, // %15
    feeBase: 'GROSS',
    status: 'ACTIVE',
    ...extra,
  };
}

function expectAdvisoryContract(
  r: DistributionRecommendation,
  overrides: Partial<DistributionRecommendation> = {},
) {
  expect(Object.keys(r).sort()).toEqual([
    'beneficiaryScope',
    'currency',
    'dispositionId',
    'expenseModule',
    'financialEffect',
    'gross',
    'recommendOnly',
    'status',
    'suggestedLines',
    'sumCheck',
    'warnings',
  ]);
  expect(Object.keys(r.sumCheck).sort()).toEqual(['equalsGross', 'sum']);
  expect(Object.keys(r.expenseModule).sort()).toEqual([
    'autoApplyEnabled',
    'candidates',
    'disabledReason',
  ]);
  expect(r).toMatchObject({
    dispositionId: 'disp-1',
    status: 'HELD_PENDING_DISTRIBUTION',
    currency: 'TRY',
    gross: '100000',
    beneficiaryScope: 'SINGLE_CASE_CLIENT',
    recommendOnly: true,
    financialEffect: false,
    expenseModule: {
      autoApplyEnabled: false,
      disabledReason: 'EXPENSE_APPROVAL_FIELD_MISSING',
    },
    ...overrides,
  });
}

function expectNoWriteDelegation(prisma: ReturnType<typeof makeService>['prisma']) {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
  expect(prisma.collectionDisposition.updateMany).not.toHaveBeenCalled();
  expect(prisma.collectionDispositionLine.create).not.toHaveBeenCalled();
  expect(prisma.collectionDispositionLine.deleteMany).not.toHaveBeenCalled();
  expect(prisma.collectionDispositionLine.update).not.toHaveBeenCalled();
  expect(prisma.collectionDispositionLine.updateMany).not.toHaveBeenCalled();
  expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  expect(prisma.accountingJournalLine.create).not.toHaveBeenCalled();
  expect(prisma.officeApprovalRequest.create).not.toHaveBeenCalled();
  expect(prisma.officeApprovalRequest.update).not.toHaveBeenCalled();
  expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
}

describe('DistributionRecommendationService (S8-B FAZ-1a)', () => {
  it('fee=0 locks advisory envelope, tenant read boundary, and no-write semantics', async () => {
    const { svc, prisma, offset } = makeService();
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);

    expectAdvisoryContract(r, {
      suggestedLines: [
        {
          type: 'CLIENT_PAYABLE',
          amount: '100000',
          caseClientId: 'cc-1',
          origin: 'CLIENT_PAYABLE_RESIDUAL',
          editable: true,
        },
      ],
      sumCheck: { sum: '100000', equalsGross: true },
      warnings: [],
    });
    expect(r.expenseModule.candidates).toEqual([]);
    expect(prisma.collectionDisposition.findFirst).toHaveBeenCalledWith({
      where: { id: 'disp-1', tenantId: 't1' },
      select: {
        id: true,
        status: true,
        currency: true,
        totalAmount: true,
        beneficiaryScope: true,
        caseClientId: true,
        caseId: true,
      },
    });
    expect(prisma.caseClient.findFirst).toHaveBeenCalledWith({
      where: { id: 'cc-1', client: { tenantId: 't1' } },
      select: { client: { select: { id: true } } },
    });
    expect(offset.getEligibility).toHaveBeenCalledWith('t1', 'u-1', 'client-1', 'TRY');
    expectNoWriteDelegation(prisma);
  });

  it('0<fee<gross -> [FEE, PAYABLE] sum==gross, faithful decimal, fee is not client-attributed', async () => {
    const { svc, prisma } = makeService();
    const r = await svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '33333.33' } }, ACTOR);
    expect(r.suggestedLines.map((l) => [l.type, l.amount])).toEqual([
      ['CONTRACTUAL_FEE_WITHHELD', '33333.33'],
      ['CLIENT_PAYABLE', '66666.67'],
    ]);
    expect(r.suggestedLines[0].caseClientId).toBeNull();
    expect(r.suggestedLines[1].caseClientId).toBe('cc-1');
    expect(r.sumCheck.equalsGross).toBe(true);
    expect(r.recommendOnly).toBe(true);
    expect(r.financialEffect).toBe(false);
    expectNoWriteDelegation(prisma);
  });

  it('fee==gross -> only FEE, no CLIENT_PAYABLE, residual-0 warning, sum==gross', async () => {
    const { svc } = makeService();
    const r = await svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '100000' } }, ACTOR);
    expect(r.suggestedLines.map((l) => l.type)).toEqual(['CONTRACTUAL_FEE_WITHHELD']);
    expect(r.warnings.some((w) => w.includes('0'))).toBe(true);
    expect(r.sumCheck.equalsGross).toBe(true);
  });

  it('fee>gross -> BadRequest with no clamp', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '100001' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invalid fee string -> BadRequest', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: 'abc' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fee number/float, not string -> BadRequest because faithful decimal-string is required', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: 5000.5 as never } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fee with more than 2 decimals -> BadRequest for Decimal 15,2 compatibility', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'AMOUNT', amount: '33333.333' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gross=0 -> empty suggestedLines, residual-0 warning, sum==gross (0==0)', async () => {
    const { svc } = makeService({ disp: defaultDisp({ totalAmount: '0' }) });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines).toEqual([]);
    expect(r.sumCheck).toEqual({ sum: '0', equalsGross: true });
    expect(r.warnings.some((w) => w.includes('0'))).toBe(true);
  });

  it('unresolved caseClient client -> candidates [] and getEligibility is not called', async () => {
    const { svc, prisma, offset } = makeService();
    prisma.caseClient.findFirst.mockResolvedValueOnce(null);
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.expenseModule.candidates).toEqual([]);
    expect(offset.getEligibility).not.toHaveBeenCalled();
    expectNoWriteDelegation(prisma);
  });

  it('mode!=AMOUNT -> BadRequest because rate model is FAZ-2', async () => {
    const { svc } = makeService();
    await expect(
      svc.generate('t1', 'disp-1', { attorneyFee: { mode: 'RATE' as never, amount: '10' } }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-HELD disposition -> BadRequest', async () => {
    const { svc } = makeService({ disp: defaultDisp({ status: 'POSTED' }) });
    await expect(svc.generate('t1', 'disp-1', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('missing disposition -> NotFound', async () => {
    const { svc, prisma } = makeService();
    prisma.collectionDisposition.findFirst.mockResolvedValueOnce(null);
    await expect(svc.generate('t1', 'x', {}, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('expense candidates remain candidate-only and outside suggestedLines', async () => {
    const { svc, prisma, offset } = makeService({
      eligibility: {
        eligibleExpenseRequests: [
          {
            expenseCaseId: 'case-1',
            expenseRequestId: 'er-1',
            clientId: 'client-1',
            currency: 'TRY',
            unpaidAmount: '5000',
            caseNumber: '2026/1',
            requestStatus: 'SENT',
          },
          {
            expenseCaseId: 'OTHER',
            expenseRequestId: 'er-2',
            clientId: 'client-1',
            currency: 'TRY',
            unpaidAmount: '9000',
            caseNumber: '2026/2',
            requestStatus: 'SENT',
          },
        ],
      },
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);

    expectAdvisoryContract(r, {
      suggestedLines: [
        {
          type: 'CLIENT_PAYABLE',
          amount: '100000',
          caseClientId: 'cc-1',
          origin: 'CLIENT_PAYABLE_RESIDUAL',
          editable: true,
        },
      ],
      sumCheck: { sum: '100000', equalsGross: true },
    });
    expect(r.expenseModule.autoApplyEnabled).toBe(false);
    expect(r.expenseModule.disabledReason).toBe('EXPENSE_APPROVAL_FIELD_MISSING');
    expect(r.expenseModule.candidates.map((c) => c.expenseRequestId)).toEqual(['er-1']);
    expect(r.expenseModule.candidates[0]).toMatchObject({ applied: false, remaining: '5000', status: 'SENT' });
    expect(r.suggestedLines.every((l) => l.type !== 'CLIENT_EXPENSE_REIMBURSEMENT')).toBe(true);
    expect(r.warnings.some((w) => w.includes('otomatik masraf'))).toBe(true);
    expect(offset.getEligibility).toHaveBeenCalledWith('t1', 'u-1', 'client-1', 'TRY');
    expectNoWriteDelegation(prisma);
  });

  it('CLUSTER remains manual advisory-only with no candidate or write delegation', async () => {
    const { svc, prisma, offset, feeAgreements } = makeService({
      disp: defaultDisp({ beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null }),
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);

    expectAdvisoryContract(r, {
      beneficiaryScope: 'CASE_CREDITOR_CLUSTER',
      suggestedLines: [],
      sumCheck: { sum: '0', equalsGross: false },
    });
    expect(r.suggestedLines).toEqual([]);
    expect(r.warnings).toEqual([expect.stringContaining('CASE_CREDITOR_CLUSTER')]);
    expect(offset.getEligibility).not.toHaveBeenCalled();
    expect(prisma.caseClient.findFirst).not.toHaveBeenCalled();
    // FAZ-2: CLUSTER erken döner (resolveFeeAttribution hiç çağrılmaz) -> agreement hiç okunmaz.
    expect(feeAgreements.getActiveForCaseClient).not.toHaveBeenCalled();
    expectNoWriteDelegation(prisma);
  });
});

describe('DistributionRecommendationService (S8-B FAZ-2 — CaseFeeAgreement recommendation)', () => {
  const FLAG = 'FEE_AGREEMENT_RECOMMENDATION_ENABLED';
  afterEach(() => {
    delete process.env[FLAG];
  });

  it('flag OFF (default) + active agreement + manuel yok -> legacy (fee=0) korunur, agreement okunur ama uygulanmaz, WARN loglanır', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, feeAgreements } = makeService({ feeAgreement: activeFlatAgreement() });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines.map((l) => l.type)).toEqual(['CLIENT_PAYABLE']);
    expect(r.suggestedLines.every((l) => l.origin !== 'FEE_AGREEMENT')).toBe(true);
    // dual-eval: agreement OKUNUR (rollout gözlemi) ama flag OFF olduğu için uygulanmaz.
    expect(feeAgreements.getActiveForCaseClient).toHaveBeenCalledWith('t1', 'cc-1');
    // Politika: flag OFF + divergent agreement -> rollout-gözlem WARN'ı loglanır ("flag açılsaydı ne olurdu").
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('fee-agreement-recommendation'));
    warnSpy.mockRestore();
  });

  it('flag ON + SINGLE_CASE_CLIENT + FLAT_AMOUNT agreement + manuel yok -> FEE_AGREEMENT line + feeAgreementId provenance, gereksiz WARN YOK', async () => {
    process.env[FLAG] = 'true';
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc } = makeService({ feeAgreement: activeFlatAgreement() });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines.map((l) => [l.type, l.amount])).toEqual([
      ['CONTRACTUAL_FEE_WITHHELD', '15000'],
      ['CLIENT_PAYABLE', '85000'],
    ]);
    expect(r.suggestedLines[0]).toMatchObject({
      origin: 'FEE_AGREEMENT',
      feeAgreementId: 'cfa-1',
      caseClientId: null,
    });
    expect(r.suggestedLines[1].feeAgreementId).toBeUndefined();
    expect(r.sumCheck.equalsGross).toBe(true);
    // Politika: flag ON -> agreement normal uygulanıyor, "farklı" değil; gereksiz dual-eval WARN'ı YOK.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('flag ON + PERCENTAGE_OF_COLLECTION (%15 x 100000) -> faithful decimal hesap', async () => {
    process.env[FLAG] = 'true';
    const { svc } = makeService({ feeAgreement: activePercentageAgreement() });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines.map((l) => [l.type, l.amount])).toEqual([
      ['CONTRACTUAL_FEE_WITHHELD', '15000'],
      ['CLIENT_PAYABLE', '85000'],
    ]);
    expect(r.suggestedLines[0].feeAgreementId).toBe('cfa-2');
  });

  it('flag ON + PERCENTAGE_OF_COLLECTION rounding -> ROUND_HALF_UP 2dp (Decimal 15,2 uyumu)', async () => {
    process.env[FLAG] = 'true';
    // 100010 * 5 / 10000 = 50.005 -> HALF_UP -> 50.01
    const { svc } = makeService({
      disp: defaultDisp({ totalAmount: '100010' }),
      feeAgreement: activePercentageAgreement({ id: 'cfa-round', percentageBps: 5 }),
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines[0]).toMatchObject({ type: 'CONTRACTUAL_FEE_WITHHELD', amount: '50.01' });
  });

  it('flag ON + manuel attorneyFee VERİLMİŞ -> manuel override kazanır, agreement hiç okunmaz', async () => {
    process.env[FLAG] = 'true';
    const { svc, feeAgreements } = makeService({ feeAgreement: activeFlatAgreement() });
    const r = await svc.generate(
      't1',
      'disp-1',
      { attorneyFee: { mode: 'AMOUNT', amount: '5000' } },
      ACTOR,
    );
    expect(r.suggestedLines[0]).toMatchObject({
      type: 'CONTRACTUAL_FEE_WITHHELD',
      amount: '5000',
      origin: 'FEE_MANUAL',
    });
    expect(r.suggestedLines[0].feeAgreementId).toBeUndefined();
    expect(feeAgreements.getActiveForCaseClient).not.toHaveBeenCalled();
  });

  it('flag ON + agreement feeBase=NET_OF_EXPENSE (defensive) -> agreement uygulanmaz, legacy (fee=0) korunur', async () => {
    process.env[FLAG] = 'true';
    const { svc } = makeService({
      feeAgreement: activeFlatAgreement({ feeBase: 'NET_OF_EXPENSE' }),
    });
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines.map((l) => l.type)).toEqual(['CLIENT_PAYABLE']);
  });

  it('flag ON + agreement yok (null) -> legacy (fee=0) korunur, hata yok', async () => {
    process.env[FLAG] = 'true';
    const { svc } = makeService();
    const r = await svc.generate('t1', 'disp-1', {}, ACTOR);
    expect(r.suggestedLines.map((l) => l.type)).toEqual(['CLIENT_PAYABLE']);
  });

  it('flag ON + agreement-türevi fee > gross -> BadRequest, clamp YOK (manuel ile simetrik)', async () => {
    process.env[FLAG] = 'true';
    const { svc } = makeService({
      feeAgreement: activeFlatAgreement({ flatAmount: '200000.00' }),
    });
    await expect(svc.generate('t1', 'disp-1', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});
