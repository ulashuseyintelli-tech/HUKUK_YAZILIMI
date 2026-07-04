import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CasePaymentPreviewService } from "../case-payment-preview.service";

const stableCounts = {
  collection: 0,
  collectionDisposition: 0,
  collectionAllocation: 0,
  collectionOverpayment: 0,
  clientPayout: 0,
  clientStatement: 0,
  balanceLedger: 0,
  ledgerEntry: 0,
  ledgerAllocation: 0,
  icrabotOutboxAction: 0,
  icrabotTimelineEntry: 0,
  clientOffset: 0,
};

function modelWithCount(count = 0) {
  return {
    count: jest.fn(async () => count),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  const models = Object.fromEntries(
    Object.entries(stableCounts).map(([name, count]) => [name, modelWithCount(count)]),
  );

  return {
    ...models,
    case: {
      ...modelWithCount(1),
      findFirst: jest.fn(async () => ({
        id: "case-1",
        currency: "TRY",
        caseStatus: "DERDEST",
      })),
    },
    caseDebtor: {
      ...modelWithCount(1),
      findFirst: jest.fn(async () => ({ id: "case-debtor-1" })),
    },
    caseClient: {
      ...modelWithCount(1),
      findMany: jest.fn(async () => [
        {
          id: "case-client-1",
          role: "ALACAKLI",
          client: {
            displayName: "Muvekkil A",
            firstName: null,
            lastName: null,
            companyName: null,
          },
        },
      ]),
    },
    claimItem: {
      ...modelWithCount(1),
      findMany: jest.fn(async () => []),
    },
    ...overrides,
  };
}

function makeBalance(totalDue = 1500) {
  return {
    computeCaseBalance: jest.fn(async () => ({
      currencyResults: [
        {
          currency: "TRY",
          result: { totalDue },
        },
      ],
    })),
  };
}

async function countFinancialSideEffectTables(prisma: any) {
  const result: Record<string, number> = {};
  for (const name of Object.keys(stableCounts)) {
    if (prisma[name]?.count) {
      result[name] = await prisma[name].count();
    }
  }
  return result;
}

function expectNoFinancialMutations(prisma: any) {
  for (const name of Object.keys(stableCounts)) {
    const model = prisma[name];
    expect(model.create).not.toHaveBeenCalled();
    expect(model.update).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(model.delete).not.toHaveBeenCalled();
    expect(model.deleteMany).not.toHaveBeenCalled();
  }
}

describe("CasePaymentPreviewService", () => {
  it("valid single-client preview returns CLIENT_PAYABLE without persistence", async () => {
    const prisma = makePrisma();
    const balance = makeBalance(1500);
    const service = new CasePaymentPreviewService(prisma as never, balance as never);

    const before = await countFinancialSideEffectTables(prisma);
    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 1000, currency: "TRY", paymentDate: "2026-06-28" },
    });
    const after = await countFinancialSideEffectTables(prisma);

    expect(result).toMatchObject({
      nonPersistent: true,
      caseId: "case-1",
      acceptance: { wouldAccept: true, blockingReasons: [] },
      balanceImpact: {
        currentOutstandingAmount: 1500,
        paymentAmount: 1000,
        appliedAmount: 1000,
        overpaymentAmount: 0,
        projectedOutstandingAmount: 500,
      },
      distributionPreview: {
        source: "SINGLE_CASE_CLIENT",
        status: "HELD_PENDING_DISTRIBUTION",
        requiresClientSelection: false,
        lines: [
          {
            type: "CLIENT_PAYABLE",
            amount: 1000,
            caseClientId: "case-client-1",
            clientName: "Muvekkil A",
          },
        ],
      },
    });
    expect(before).toEqual(after);
    expectNoFinancialMutations(prisma);
    expect(balance.computeCaseBalance).toHaveBeenCalledWith("tenant-1", "case-1", "2026-06-28");
    expect(prisma.caseClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          caseId: "case-1",
          role: { in: ["ALACAKLI", "ORTAK_ALACAKLI"] },
        },
      }),
    );
  });

  it("keeps cent precision for payment and projected outstanding amounts", async () => {
    const prisma = makePrisma();
    const service = new CasePaymentPreviewService(prisma as never, makeBalance(100.25) as never);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 0.01 },
    });

    expect(result.balanceImpact).toMatchObject({
      currentOutstandingAmount: 100.25,
      paymentAmount: 0.01,
      appliedAmount: 0.01,
      overpaymentAmount: 0,
      projectedOutstandingAmount: 100.24,
    });
    expectNoFinancialMutations(prisma);
  });

  it("multi-client preview requires selection and does not create auto line", async () => {
    const prisma = makePrisma({
      caseClient: {
        ...modelWithCount(2),
        findMany: jest.fn(async () => [
          { id: "cc-1", role: "ALACAKLI", client: { displayName: "A" } },
          { id: "cc-2", role: "ORTAK_ALACAKLI", client: { displayName: "B" } },
        ]),
      },
    });
    const service = new CasePaymentPreviewService(prisma as never, makeBalance(2000) as never);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 750 },
    });

    expect(result.distributionPreview).toMatchObject({
      source: "CASE_CREDITOR_CLUSTER",
      status: "HELD_PENDING_DISTRIBUTION",
      requiresClientSelection: true,
      lines: [],
    });
    expect(result.acceptance.warnings).toContain("CLIENT_SELECTION_REQUIRED_FOR_DISTRIBUTION");
    expectNoFinancialMutations(prisma);
  });

  it("zero or negative amount is rejected before reads that could imply a write flow", async () => {
    const prisma = makePrisma();
    const service = new CasePaymentPreviewService(prisma as never, makeBalance() as never);

    await expect(
      service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 0 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: -1 } }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expectNoFinancialMutations(prisma);
  });

  it("missing case fails closed", async () => {
    const prisma = makePrisma({
      case: {
        ...modelWithCount(0),
        findFirst: jest.fn(async () => null),
      },
    });
    const service = new CasePaymentPreviewService(prisma as never, makeBalance() as never);

    await expect(
      service.preview({ tenantId: "foreign-tenant", caseId: "case-1", input: { amount: 100 } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectNoFinancialMutations(prisma);
  });

  it("caseDebtorId must belong to the same active tenant/case scope", async () => {
    const prisma = makePrisma({
      caseDebtor: {
        ...modelWithCount(0),
        findFirst: jest.fn(async () => null),
      },
    });
    const service = new CasePaymentPreviewService(prisma as never, makeBalance() as never);

    await expect(
      service.preview({
        tenantId: "tenant-1",
        caseId: "case-1",
        input: { amount: 100, caseDebtorId: "foreign-case-debtor" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign-case-debtor",
        caseId: "case-1",
        lifecycleStatus: "ACTIVE",
        case: { tenantId: "tenant-1" },
      },
      select: { id: true },
    });
    expectNoFinancialMutations(prisma);
  });

  it("overpayment is shown without CollectionOverpayment write", async () => {
    const prisma = makePrisma();
    const service = new CasePaymentPreviewService(prisma as never, makeBalance(400) as never);

    const before = await countFinancialSideEffectTables(prisma);
    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 1000 },
    });
    const after = await countFinancialSideEffectTables(prisma);

    expect(result.balanceImpact).toMatchObject({
      currentOutstandingAmount: 400,
      paymentAmount: 1000,
      appliedAmount: 400,
      overpaymentAmount: 600,
      projectedOutstandingAmount: 0,
    });
    expect(result.acceptance.warnings).toContain("PAYMENT_EXCEEDS_CURRENT_OUTSTANDING");
    expect(before).toEqual(after);
    expectNoFinancialMutations(prisma);
  });

  it("closed collection case status returns blocking acceptance without writes", async () => {
    const prisma = makePrisma({
      case: {
        ...modelWithCount(1),
        findFirst: jest.fn(async () => ({
          id: "case-1",
          currency: "TRY",
          caseStatus: "HITAM",
        })),
      },
    });
    const service = new CasePaymentPreviewService(prisma as never, makeBalance(1000) as never);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 100 },
    });

    expect(result.acceptance).toMatchObject({
      wouldAccept: false,
      blockingReasons: ["CASE_CLOSED_FOR_COLLECTION"],
    });
    expectNoFinancialMutations(prisma);
  });

  it("no eligible client leaves distribution as manual required without blocking collection preview", async () => {
    const prisma = makePrisma({
      caseClient: {
        ...modelWithCount(0),
        findMany: jest.fn(async () => []),
      },
    });
    const service = new CasePaymentPreviewService(prisma as never, makeBalance(1000) as never);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 100 },
    });

    expect(result.acceptance.wouldAccept).toBe(true);
    expect(result.acceptance.warnings).toContain("NO_ELIGIBLE_CASE_CLIENT_FOR_DISTRIBUTION");
    expect(result.distributionPreview).toMatchObject({
      source: "UNKNOWN",
      status: "MANUAL_REQUIRED",
      lines: [],
    });
    expectNoFinancialMutations(prisma);
  });
});
