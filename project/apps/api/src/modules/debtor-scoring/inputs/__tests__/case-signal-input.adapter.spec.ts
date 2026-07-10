import { NotFoundException } from "@nestjs/common";
import { CaseSignalInputAdapter } from "../case-signal-input.adapter";

/**
 * DEBTOR-SCORING PR-2B — CaseSignalInputAdapter birim testleri.
 * Saf birim test (DB yok): prisma mock'lanır.
 */
describe("CaseSignalInputAdapter", () => {
  function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      case: { findFirst: jest.fn() },
      caseDebtor: { findMany: jest.fn().mockResolvedValue([]) },
      tebligat: { count: jest.fn().mockResolvedValue(0) },
      collection: { findMany: jest.fn().mockResolvedValue([]) },
      caseLifecycle: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    } as any;
  }

  function baseCaseRow() {
    return { createdAt: new Date("2026-06-01T00:00:00.000Z"), workflowStage: "ENFORCEMENT" };
  }

  it("1) tenant isolation: başka tenant caseId → NotFoundException, hiçbir başka okuma tetiklenmez", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(null);
    const adapter = new CaseSignalInputAdapter(prisma);

    await expect(adapter.build("tenant-B", "case-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "case-1", tenantId: "tenant-B" } }),
    );
    expect(prisma.caseDebtor.findMany).not.toHaveBeenCalled();
    expect(prisma.tebligat.count).not.toHaveBeenCalled();
  });

  it("2) asset ayrımı: UNKNOWN/PENDING/ERROR nötr, NO gerçek negatif sinyal, YES her zaman kazanır", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: "ASIL_BORCLU",
            serviceStatus: "SENT",
            assetVehicle: "NO",
            assetRealEstate: "UNKNOWN",
            assetBank: "PENDING",
            assetSgkWage: "ERROR",
          },
        ]),
      },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.asset).toEqual({
      source: "CASE_DEBTOR_FIELDS",
      vehicle: "NO",
      realEstate: "UNKNOWN",
      bank: "PENDING",
      sgkWage: "ERROR",
    });
  });

  it("aktif CaseDebtor yoksa asset UNKNOWN/NOT_AVAILABLE + uyarı", async () => {
    const prisma = makePrisma({ case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) } });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.asset).toEqual({
      source: "NOT_AVAILABLE",
      vehicle: "UNKNOWN",
      realEstate: "UNKNOWN",
      bank: "UNKNOWN",
      sgkWage: "UNKNOWN",
    });
    expect(result.warnings.join(" ")).toContain("aktif CaseDebtor bulunamadı");
  });

  it("3) Tebligat kaydı yoksa service NOT_AVAILABLE; varsa TEBLIGAT + doğru serviceStatus", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue([{ role: "ASIL_BORCLU", serviceStatus: "DELIVERED", assetVehicle: "NO", assetRealEstate: "NO", assetBank: "NO", assetSgkWage: "NO" }]),
      },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    const noTebligat = await adapter.build("tenant-A", "case-1");
    expect(noTebligat.service).toEqual({ source: "NOT_AVAILABLE", serviceStatus: "UNKNOWN" });

    prisma.tebligat.count.mockResolvedValue(2);
    const withTebligat = await adapter.build("tenant-A", "case-1");
    expect(withTebligat.service).toEqual({ source: "TEBLIGAT", serviceStatus: "DELIVERED" });
  });

  it("4) itiraz sinyali: CaseLifecycle'da OBJECTION kaydı varsa hasObjection=true", async () => {
    const prisma = makePrisma({ case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) } });
    const adapter = new CaseSignalInputAdapter(prisma);

    const without = await adapter.build("tenant-A", "case-1");
    expect(without.caseSignals.hasObjection).toBe(false);

    prisma.caseLifecycle.findFirst.mockResolvedValue({ id: "lc-1" });
    const withObjection = await adapter.build("tenant-A", "case-1");
    expect(withObjection.caseSignals.hasObjection).toBe(true);
    expect(prisma.caseLifecycle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case-1", case: { tenantId: "tenant-A" }, stage: "OBJECTION" } }),
    );
  });

  it("5) REGRESYON: lastConfirmedPaymentAt yalnız CONFIRMED tahsilattan hesaplanır (en yeni tarih)", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) },
      collection: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 1000, status: "CONFIRMED", date: new Date("2026-05-01T00:00:00.000Z") },
          { amount: 9000, status: "CANCELLED", date: new Date("2026-07-01T00:00:00.000Z") }, // en yeni ama iptal
          { amount: 2000, status: "CONFIRMED", date: new Date("2026-06-15T00:00:00.000Z") },
        ]),
      },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.caseSignals.lastConfirmedPaymentAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("hiç CONFIRMED tahsilat yoksa lastConfirmedPaymentAt null", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) },
      collection: { findMany: jest.fn().mockResolvedValue([{ amount: 5000, status: "PENDING", date: new Date() }]) },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.caseSignals.lastConfirmedPaymentAt).toBeNull();
  });

  it("6) çoklu aktif co-borçlu: asset 'herhangi biri YES' kazanır, service ASIL_BORCLU tercih edilir + uyarı", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue([
          { role: "MUSTEREK_BORCLU", serviceStatus: "DELIVERED", assetVehicle: "NO", assetRealEstate: "NO", assetBank: "NO", assetSgkWage: "NO" },
          { role: "ASIL_BORCLU", serviceStatus: "SENT", assetVehicle: "YES", assetRealEstate: "NO", assetBank: "NO", assetSgkWage: "NO" },
        ]),
      },
      tebligat: { count: jest.fn().mockResolvedValue(1) },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.asset.vehicle).toBe("YES"); // herhangi biri YES → kazanır
    expect(result.service).toEqual({ source: "TEBLIGAT", serviceStatus: "SENT" }); // ASIL_BORCLU tercihli
    expect(result.warnings.join(" ")).toContain("co-borçlu");
  });

  it("workflowStage/createdAt doğrudan Case'ten geçirilir", async () => {
    const prisma = makePrisma({ case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) } });
    const adapter = new CaseSignalInputAdapter(prisma);

    const result = await adapter.build("tenant-A", "case-1");

    expect(result.caseSignals.workflowStage).toBe("ENFORCEMENT");
    expect(result.caseSignals.createdAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("7-8) NotificationQueue veya manuel riskLevel hiçbir Prisma çağrısında referans edilmez", async () => {
    const prisma = makePrisma({ case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()) } });
    const adapter = new CaseSignalInputAdapter(prisma);

    await adapter.build("tenant-A", "case-1");

    const allCalls = [
      ...prisma.caseDebtor.findMany.mock.calls,
      ...prisma.case.findFirst.mock.calls,
      ...prisma.collection.findMany.mock.calls,
      ...prisma.caseLifecycle.findFirst.mock.calls,
    ];
    const serialized = JSON.stringify(allCalls);
    expect(serialized).not.toMatch(/notificationQueue|riskLevel|lookupRisk/i);
  });

  it("9) hiçbir Prisma write çağrısı yapılmaz (read-only)", async () => {
    const prisma = makePrisma({
      case: { findFirst: jest.fn().mockResolvedValue(baseCaseRow()), update: jest.fn() },
      caseDebtor: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    });
    const adapter = new CaseSignalInputAdapter(prisma);

    await adapter.build("tenant-A", "case-1");

    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.caseDebtor.update).not.toHaveBeenCalled();
  });
});
