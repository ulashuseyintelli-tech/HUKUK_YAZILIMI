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

  it("fallback outstanding keeps demandedAmount=0 instead of legacy amount", async () => {
    const prisma = makePrisma({
      claimItem: {
        ...modelWithCount(1),
        findMany: jest.fn(async () => [{
          demandedAmount: 0,
          amount: 1000,
          collectedAmount: 0,
        }]),
      },
    });
    const balance = {
      computeCaseBalance: jest.fn().mockRejectedValue(new Error("canonical unavailable")),
    };
    const service = new CasePaymentPreviewService(prisma as never, balance as never);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 100 },
    });

    expect(result.balanceImpact).toMatchObject({
      currentOutstandingAmount: 0,
      appliedAmount: 0,
      overpaymentAmount: 100,
      projectedOutstandingAmount: 0,
    });
    expectNoFinancialMutations(prisma);
  });

  describe("K3-L D2-P0: kanonik sonuç yalnız önizlenen para biriminden", () => {
    const trySameCurrencyItems = () =>
      makePrisma({
        claimItem: {
          ...modelWithCount(1),
          findMany: jest.fn(async () => [{ demandedAmount: 800, amount: 800, collectedAmount: 0 }]),
        },
      });

    it("TRY sonucu yokken USD sonucunun borcu TRY borcu SAYILMAZ; aynı para birimi yedeği + açık uyarı", async () => {
      const prisma = trySameCurrencyItems();
      const balance = {
        computeCaseBalance: jest.fn(async () => ({
          currencyResults: [
            { currency: "TRY", result: null },
            { currency: "USD", result: { totalDue: 99999 } },
          ],
        })),
      };
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({
        tenantId: "tenant-1",
        caseId: "case-1",
        input: { amount: 100, currency: "TRY" },
      });

      // önceki davranış: currentOutstandingAmount = 99999 (USD); yeni: TRY kalem okuma yedeği = 800
      expect(result.balanceImpact.currentOutstandingAmount).toBe(800);
      expect(result.balanceImpact.currentOutstandingAmount).not.toBe(99999);
      expect(result.acceptance.warnings).toEqual(
        expect.arrayContaining([
          "CURRENT_BALANCE_CURRENCY_NOT_COMPUTED",
          "CURRENT_BALANCE_UNAVAILABLE",
          "CLAIM_ITEM_READ_FALLBACK_USED",
        ]),
      );
      expect(prisma.claimItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ currency: "TRY" }) }),
      );
      expectNoFinancialMutations(prisma);
    });

    it("para birimi satırı hiç yoksa da başka para birimine düşülmez", async () => {
      const prisma = trySameCurrencyItems();
      const balance = {
        computeCaseBalance: jest.fn(async () => ({ currencyResults: [{ currency: "EUR", result: { totalDue: 5 } }] })),
      };
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 100 } });

      expect(result.balanceImpact.currentOutstandingAmount).toBe(800);
      expect(result.acceptance.warnings).toContain("CURRENT_BALANCE_CURRENCY_NOT_COMPUTED");
    });

    it("kendi para birimi sonucu varsa diğer para birimleri yok sayılır, uyarı üretilmez", async () => {
      const prisma = trySameCurrencyItems();
      const balance = {
        computeCaseBalance: jest.fn(async () => ({
          currencyResults: [
            { currency: "USD", result: { totalDue: 99999 } },
            { currency: "TRY", result: { totalDue: 1500 } },
          ],
        })),
      };
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY" } });

      expect(result.balanceImpact.currentOutstandingAmount).toBe(1500);
      expect(result.acceptance.warnings).not.toContain("CURRENT_BALANCE_CURRENCY_NOT_COMPUTED");
      expect(result.acceptance.warnings).not.toContain("CLAIM_ITEM_READ_FALLBACK_USED");
    });

    it("D2-b1 ile birlikte: TRY faizsiz anapara simüle edilmeyince USD sonucu TRY borcu sayılmaz", async () => {
      const prisma = makePrisma({
        claimItem: {
          ...modelWithCount(1),
          findMany: jest.fn(async () => [{ demandedAmount: 5000, amount: 5000, collectedAmount: 0 }]),
        },
      });
      // CaseBalanceService'in b1 çıktısı: TRY satırı taşınan anaparalı (sonuç yok), USD normal hesaplandı
      const balance = {
        computeCaseBalance: jest.fn(async () => ({
          currencyResults: [
            { currency: "TRY", result: null, skippedReason: "NON_ACCRUING_NOT_SIMULATED", grossPrincipal: 0, unsimulatedPrincipal: 5000 },
            { currency: "USD", result: { totalDue: 2000 }, grossPrincipal: 2000 },
          ],
        })),
      };
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY" } });

      expect(result.balanceImpact.currentOutstandingAmount).toBe(5000);
      expect(result.balanceImpact.currentOutstandingAmount).not.toBe(2000);
      expect(result.acceptance.warnings).toEqual(
        expect.arrayContaining(["CURRENT_BALANCE_CURRENCY_NOT_COMPUTED", "CLAIM_ITEM_READ_FALLBACK_USED"]),
      );
    });

    it("hiçbir para biriminde sonuç yoksa (ör. faizsiz anapara, kova yok) para birimi uyarısı eklenmez", async () => {
      const prisma = trySameCurrencyItems();
      const balance = { computeCaseBalance: jest.fn(async () => ({ currencyResults: [] })) };
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 100 } });

      expect(result.balanceImpact.currentOutstandingAmount).toBe(800);
      expect(result.acceptance.warnings).not.toContain("CURRENT_BALANCE_CURRENCY_NOT_COMPUTED");
      expect(result.acceptance.warnings).toContain("CLAIM_ITEM_READ_FALLBACK_USED");
    });
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

  it("K3-L: mahsup bekletilecekse dagitim onizlemesi URETILMEZ (BLOCKED, satir yok) ve bakiye etkisi sifir", async () => {
    const prisma = makePrisma({
      claimItem: {
        ...modelWithCount(1),
        // yalniz kesideciye bagli tazminat kalemi → hesabina odeme yapilan borclu zorunlu
        findMany: jest.fn(async () => [
          { amount: 10000, demandedAmount: 10000, collectedAmount: 0, isAllDebtorsLiable: true, liableDebtorIds: [] },
          { amount: 1000, demandedAmount: 1000, collectedAmount: 0, isAllDebtorsLiable: false, liableDebtorIds: ["debtor-kesideci"] },
        ]),
      },
    });
    const service = new CasePaymentPreviewService(prisma as any, makeBalance(11000) as any);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 1500, currency: "TRY" },
    });

    expect(result.acceptance.wouldAccept).toBe(true);
    expect(result.acceptance.warnings).toContain("ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED");
    expect(result.acceptance.warnings).toContain("DISTRIBUTION_DEFERRED_UNTIL_ALLOCATION_COMPLETED");
    expect(result.balanceImpact).toMatchObject({
      appliedAmount: 0,
      overpaymentAmount: 0,
      currentOutstandingAmount: 11000,
      projectedOutstandingAmount: 11000,
    });
    expect(result.distributionPreview).toEqual({
      source: "SINGLE_CASE_CLIENT",
      status: "BLOCKED",
      totalAmount: 1500,
      requiresClientSelection: false,
      lines: [],
    });
    expectNoFinancialMutations(prisma);
  });

  it("K3-L: coklu alacaklida da bekletme varken muvekkil secimi ISTENMEZ (dagitim ertelenir)", async () => {
    const prisma = makePrisma({
      claimItem: {
        ...modelWithCount(1),
        findMany: jest.fn(async () => [
          { amount: 1000, demandedAmount: 1000, collectedAmount: 0, isAllDebtorsLiable: false, liableDebtorIds: ["debtor-kesideci"] },
        ]),
      },
      caseClient: {
        ...modelWithCount(2),
        findMany: jest.fn(async () => [
          { id: "cc-1", role: "ALACAKLI", client: { displayName: "A", firstName: null, lastName: null, companyName: null } },
          { id: "cc-2", role: "ORTAK_ALACAKLI", client: { displayName: "B", firstName: null, lastName: null, companyName: null } },
        ]),
      },
    });
    const service = new CasePaymentPreviewService(prisma as any, makeBalance(1000) as any);

    const result = await service.preview({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: { amount: 300, currency: "TRY" },
    });

    expect(result.distributionPreview).toMatchObject({ status: "BLOCKED", requiresClientSelection: false, lines: [] });
    expect(result.acceptance.warnings).not.toContain("CLIENT_SELECTION_REQUIRED_FOR_DISTRIBUTION");
  });
});

describe("K3-L KP-11: ödeme önizlemesi hesap tarihi", () => {
  it("ödeme tarihi verilmezse Türkiye takvimine göre bugün kullanılır ve yanıtta açıkça döner", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-30T23:30:00.000Z") });
    try {
      const prisma = makePrisma();
      const balance = makeBalance(1500);
      const service = new CasePaymentPreviewService(prisma as never, balance as never);

      const result = await service.preview({ tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY" } });

      // UTC günü 2026-09-30 olurdu
      expect(balance.computeCaseBalance).toHaveBeenCalledWith("tenant-1", "case-1", "2026-10-01");
      expect(result).toMatchObject({ asOfDate: "2026-10-01", asOfDateSource: "TURKEY_TODAY_DEFAULT" });
      expect(result.input.paymentDate).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("ödeme tarihi verilirse o gün kullanılır; saatli girdi ANIN Türkiye gününe indirgenir (UTC günü değil)", async () => {
    const prisma = makePrisma();
    const balance = makeBalance(1500);
    const service = new CasePaymentPreviewService(prisma as never, balance as never);

    const plain = await service.preview({
      tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY", paymentDate: "2026-06-28" },
    });
    expect(plain).toMatchObject({ asOfDate: "2026-06-28", asOfDateSource: "PAYMENT_DATE", input: { paymentDate: "2026-06-28" } });

    const withTime = await service.preview({
      tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY", paymentDate: "2026-10-01T01:30:00+03:00" },
    });
    expect(withTime).toMatchObject({ asOfDate: "2026-10-01", input: { paymentDate: "2026-10-01" } });
    expect(balance.computeCaseBalance).toHaveBeenLastCalledWith("tenant-1", "case-1", "2026-10-01");

    await expect(service.preview({
      tenantId: "tenant-1", caseId: "case-1", input: { amount: 100, currency: "TRY", paymentDate: "2026-02-30" },
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
