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

  // K3-L TK-11: kanonik sonuç her para birimi satırını para birimiyle taşır (gerçek CaseBalanceResult biçimi)
  function safeBalanceResult(totalDueByCurrency: number[], currencies: string[] = ["TRY", "USD", "EUR"]) {
    return {
      diagnostics: { fatal: [] },
      currencyResults: totalDueByCurrency.map((totalDue, index) => ({ currency: currencies[index], result: { totalDue } })),
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

  it("2) kanonik balance güvenli ve TEK para birimi → birincil kaynak (BALANCE_AUTHORITY)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 30000, status: "CONFIRMED", currency: "TRY" }]);
    const caseBalance = makeCaseBalance(safeBalanceResult([70000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({
      source: "BALANCE_AUTHORITY",
      outstandingTotal: 70000,
      confirmedPaidTotal: 30000,
    });
    expect(caseBalance.computeCaseBalance).toHaveBeenCalledWith("tenant-A", "case-1", "2026-07-10");
    expect(result.warnings).toEqual([]);
  });

  it("2b) K3-L TK-11: birden çok para biriminde sonuç → TOPLAM ÜRETİLMEZ (REC-ALLOC-008), NOT_AVAILABLE + null", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 30000, status: "CONFIRMED", currency: "TRY" }]);
    // TRY 70.000 + USD 5.000 — önceden 75.000 "BALANCE_AUTHORITY" olarak toplanıyordu
    const caseBalance = makeCaseBalance(safeBalanceResult([70000, 5000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({ source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null });
    expect(result.warnings.join(" ")).toContain("REC-ALLOC-008");
  });

  it("2c) K3-L TK-11: atlanan (motor hatası) para birimi varken diğerinin toplamı güvenli sayılmaz", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([]);
    const caseBalance = makeCaseBalance({
      diagnostics: { fatal: [] },
      currencyResults: [
        { currency: "TRY", result: { totalDue: 70000 } },
        { currency: "USD", result: null, skippedReason: "ENGINE_ERROR" },
      ],
    });
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({ source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null });
  });

  it("2d) K3-L TK-11: tahsilat para birimi hesaplanan para biriminden farklı → toplam ve oran üretilmez", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 500, status: "CONFIRMED", currency: "USD" }]);
    const caseBalance = makeCaseBalance(safeBalanceResult([70000], ["TRY"]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({ source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null });
  });

  it("2e) K3-L TK-11: güvensiz bakiye + dosya para biriminden farklı tahsilat → ham fallback toplamı da üretilmez", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 500, status: "CONFIRMED", currency: "EUR" }]);
    const caseBalance = makeCaseBalance(unsafeBalanceResult());
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial).toEqual({ source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null });
  });

  it("3) unsafe balance + principalAmount var → CONFIRMED-only fallback + provenance/warning", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 20000, status: "CONFIRMED", currency: "TRY" }]);
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
    prisma.case.findFirst.mockResolvedValue({ principalAmount: null, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 15000, status: "CONFIRMED", currency: "TRY" }]);
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
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 100000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([
      { amount: 10000, status: "CONFIRMED", currency: "TRY" },
      { amount: 90000, status: "CANCELLED", currency: "TRY" },
      { amount: 50000, status: "REFUNDED", currency: "TRY" },
      { amount: 20000, status: "PENDING", currency: "TRY" },
    ]);
    const caseBalance = makeCaseBalance(safeBalanceResult([50000]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial.confirmedPaidTotal).toBe(10000);
  });

  it("5) asOfDate computeCaseBalance'a birebir geçirilir (determinizm)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 0, currency: "TRY" });
    const caseBalance = makeCaseBalance(safeBalanceResult([0]));
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    await adapter.build("tenant-A", "case-1", "2025-01-15");

    expect(caseBalance.computeCaseBalance).toHaveBeenCalledWith("tenant-A", "case-1", "2025-01-15");
  });

  it("6) hiçbir Prisma write çağrısı yapılmaz (read-only)", async () => {
    const prisma = makePrisma({
      collection: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
      case: { findFirst: jest.fn().mockResolvedValue({ principalAmount: 100000, currency: "TRY" }), update: jest.fn(), create: jest.fn() },
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
    prisma.case.findFirst.mockResolvedValue({ principalAmount: 10000, currency: "TRY" });
    prisma.collection.findMany.mockResolvedValue([{ amount: 50000, status: "CONFIRMED", currency: "TRY" }]);
    const caseBalance = makeCaseBalance(unsafeBalanceResult());
    const adapter = new FinancialInputAdapter(prisma, caseBalance);

    const result = await adapter.build("tenant-A", "case-1", "2026-07-10");

    expect(result.financial.outstandingTotal).toBe(0);
  });
});
