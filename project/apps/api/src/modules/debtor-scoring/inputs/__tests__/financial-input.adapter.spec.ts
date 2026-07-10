import { NotFoundException } from "@nestjs/common";
import { FinancialInputAdapter } from "../financial-input.adapter";

/**
 * DEBTOR-SCORING PR-2B — FinancialInputAdapter birim testleri.
 * Saf birim test (DB yok): prisma + CaseBalanceService mock'lanır.
 */
describe("FinancialInputAdapter", () => {
  function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      case: { findFirst: jest.fn() },
      collection: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    } as any;
  }

  function makeCaseBalance(result: any) {
    return { computeCaseBalance: jest.fn().mockResolvedValue(result) } as any;
  }

  function safeBalanceResult(totalDueByCurrency: number[]) {
    return {
      diagnostics: { fatal: [] },
      currencyResults: totalDueByCurrency.map((totalDue) => ({ result: { totalDue } })),
    };
  }

  function unsafeBalanceResult() {
    return {
      diagnostics: { fatal: [{ code: "CASE_NOT_FOUND", caseId: "case-1" }] },
      currencyResults: [],
    };
  }

  it("1) tenant isolation: başka tenant caseId → NotFoundException, hiçbir başka okuma tetiklenmez", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(null);
    const caseBalance = makeCaseBalance(safeBalanceResult([0]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    await expect(adapter.build("tenant-B", "case-1", "2026-07-10")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "case-1", tenantId: "tenant-B" } }),
    );
    expect(prisma.collection.findMany).not.toHaveBeenCalled();
    expect(caseBalance.computeCaseBalance).not.toHaveBeenCalled();
  });

  it("2) kanonik balance güvenliyse birincil kaynak kullanılır (BALANCE_AUTHORITY, çoklu para birimi toplamı)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000 });
    prisma.collection.findMany.mockResolvedValue([{ amount: 30000, status: "CONFIRMED" }]);
    const caseBalance = makeCaseBalance(safeBalanceResult([70000, 5000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({
      source: "BALANCE_AUTHORITY",
      outstandingTotal: 75000,
      confirmedPaidTotal: 30000,
    });
    expect(caseBalance.computeCaseBalance).toHaveBeenCalledWith("tenant-A", "case-1", "2026-07-10");
    expect(result.warnings).toEqual([]);
  });

  it("3) unsafe balance + principalAmount var → CONFIRMED-only fallback + provenance/warning", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000 });
    prisma.collection.findMany.mockResolvedValue([{ amount: 20000, status: "CONFIRMED" }]);
    const caseBalance = makeCaseBalance(unsafeBalanceResult());
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({
      source: "CONFIRMED_FILTER_FALLBACK",
      outstandingTotal: 80000,
      confirmedPaidTotal: 20000,
    });
    expect(result.warnings.join(" ")).toContain("NON_AUTHORITATIVE");
  });

  it("unsafe balance + principalAmount YOK → NOT_AVAILABLE (confirmedPaidTotal yine de gerçek değer taşır)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: null });
    prisma.collection.findMany.mockResolvedValue([{ amount: 15000, status: "CONFIRMED" }]);
    const caseBalance = makeCaseBalance(unsafeBalanceResult());
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({
      source: "NOT_AVAILABLE",
      outstandingTotal: null,
      confirmedPaidTotal: 15000,
    });
  });

  it("4) REGRESYON: PENDING/CANCELLED/REFUNDED confirmedPaidTotal'a dahil edilmez", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000 });
    prisma.collection.findMany.mockResolvedValue([
      { amount: 10000, status: "CONFIRMED" },
      { amount: 90000, status: "CANCELLED" },
      { amount: 50000, status: "REFUNDED" },
      { amount: 20000, status: "PENDING" },
    ]);
    const caseBalance = makeCaseBalance(safeBalanceResult([50000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial.confirmedPaidTotal).toBe(10000);
  });

  it("5) asOfDate computeCaseBalance'a birebir geçirilir (determinizm)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 0 });
    const caseBalance = makeCaseBalance(safeBalanceResult([0]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    await adapter.build("tenant-A", "case-1", "2025-01-15");

    expect(caseBalance.computeCaseBalance).toHaveBeenCalledWith("tenant-A", "case-1", "2025-01-15");
  });

  it("6) hiçbir Prisma write çağrısı yapılmaz (read-only)", async () => {
    const prisma = makePrisma({
      collection: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
      case: { findFirst: jest.fn().mockResolvedValue({ principalAmount: 100000 }), update: jest.fn(), create: jest.fn() },
    });
    const caseBalance = makeCaseBalance(safeBalanceResult([100000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.case.create).not.toHaveBeenCalled();
    expect(prisma.collection.create).not.toHaveBeenCalled();
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it("negatif outstanding clamp edilir (aşırı ödeme senaryosu)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 10000 });
    prisma.collection.findMany.mockResolvedValue([{ amount: 50000, status: "CONFIRMED" }]);
    const caseBalance = makeCaseBalance(unsafeBalanceResult());
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial.outstandingTotal).toBe(0);
  });
});
