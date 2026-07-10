import { NotFoundException } from "@nestjs/common";
import { DebtorScoringService } from "../debtor-scoring.service";
import { FinancialInputAdapter } from "../inputs/financial-input.adapter";
import { CaseSignalInputAdapter } from "../inputs/case-signal-input.adapter";

/**
 * DEBTOR-SCORING PR-2C — DebtorScoringService orkestrasyon testleri.
 * Saf birim test (DB yok): adaptörler mock'lanır (gerçek Prisma/CaseBalanceService
 * PR-2B'de zaten test edildi — burada yalnız orkestrasyonun birleştirme/geçirme
 * mantığı doğrulanır).
 */
describe("DebtorScoringService (PR-2C orchestration)", () => {
  function makeFinancialAdapter(result: any) {
    return { build: jest.fn().mockResolvedValue(result) } as unknown as FinancialInputAdapter;
  }
  function makeSignalAdapter(result: any) {
    return { build: jest.fn().mockResolvedValue(result) } as unknown as CaseSignalInputAdapter;
  }

  function financialSafe() {
    return {
      financial: { source: "BALANCE_AUTHORITY", outstandingTotal: 70000, confirmedPaidTotal: 30000 },
      warnings: [],
    };
  }
  function financialFallback() {
    return {
      financial: { source: "CONFIRMED_FILTER_FALLBACK", outstandingTotal: 50000, confirmedPaidTotal: 10000 },
      warnings: ["FinancialInputAdapter: kanonik balance authority güvenli değil — NON_AUTHORITATIVE fallback"],
    };
  }
  function signalBase() {
    return {
      caseSignals: {
        createdAt: "2026-01-01T00:00:00.000Z",
        workflowStage: "ENFORCEMENT",
        hasObjection: false,
        lastConfirmedPaymentAt: null,
      },
      asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "NO", realEstate: "NO", bank: "YES", sgkWage: "NO" },
      service: { source: "TEBLIGAT", serviceStatus: "DELIVERED" },
      warnings: [],
    };
  }

  it("1) başarılı orchestration: iki adaptör paralel çağrılır, motor sonucu döner", async () => {
    const financial = makeFinancialAdapter(financialSafe());
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(financial.build).toHaveBeenCalledWith("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");
    expect(signal.build).toHaveBeenCalledWith("tenant-A", "case-1");
    expect(result.tenantId).toBe("tenant-A");
    expect(result.caseId).toBe("case-1");
    expect(result.calculatedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("2) tenant isolation: adaptörlerden biri NotFoundException fırlatırsa orkestrasyon da fırlatır, veri sızdırmaz", async () => {
    const financial = { build: jest.fn().mockRejectedValue(new NotFoundException("Case not found")) } as unknown as FinancialInputAdapter;
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    await expect(svc.calculateCaseScore("tenant-B", "case-1", "2026-07-10T00:00:00.000Z")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("3a) safe balance yolu: financial.source BALANCE_AUTHORITY olarak provenance'a yansır", async () => {
    const financial = makeFinancialAdapter(financialSafe());
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(result.inputProvenance.financial).toBe("BALANCE_AUTHORITY");
  });

  it("3b) unsafe fallback yolu: financial.source CONFIRMED_FILTER_FALLBACK olarak provenance'a yansır", async () => {
    const financial = makeFinancialAdapter(financialFallback());
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(result.inputProvenance.financial).toBe("CONFIRMED_FILTER_FALLBACK");
  });

  it("4) adaptör gap/warning birleşimi: financial + signal uyarıları kaybolmadan sonuca taşınır", async () => {
    const financial = makeFinancialAdapter(financialFallback());
    const signal = makeSignalAdapter({
      ...signalBase(),
      warnings: ["CaseSignalInputAdapter: aktif CaseDebtor bulunamadı"],
    });
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("NON_AUTHORITATIVE"),
        "CaseSignalInputAdapter: aktif CaseDebtor bulunamadı",
        expect.stringContaining("LEGAL_DEADLINE"), // motorun kendi sabit uyarısı da korunur
      ]),
    );
  });

  it("dataGaps adaptör NOT_AVAILABLE girdisinden doğru üretilir", async () => {
    const financial = makeFinancialAdapter({
      financial: { source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: 0 },
      warnings: [],
    });
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(result.dataGaps.some((g) => g.factorCode === "FIN_RECOVERY")).toBe(true);
  });

  it("5) determinizm: aynı adaptör çıktısı + aynı asOf → bit-bit aynı sonuç", async () => {
    const financial1 = makeFinancialAdapter(financialSafe());
    const signal1 = makeSignalAdapter(signalBase());
    const svc1 = new DebtorScoringService(financial1, signal1);

    const financial2 = makeFinancialAdapter(financialSafe());
    const signal2 = makeSignalAdapter(signalBase());
    const svc2 = new DebtorScoringService(financial2, signal2);

    const [r1, r2] = await Promise.all([
      svc1.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z"),
      svc2.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z"),
    ]);

    expect(r1).toEqual(r2);
  });

  it("6) Case.riskScore hiçbir yerde yazılmaz (sonuç nesnesinde yalnız 'score' alanı var, write çağrısı yok)", async () => {
    const financial = makeFinancialAdapter(financialSafe());
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    const result = await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    expect(Object.keys(result)).not.toContain("riskScoreWritten");
    expect((financial.build as jest.Mock).mock.calls.length).toBe(1);
  });

  it("7) hiçbir Prisma create/update çağrısı orkestrasyon katmanında yapılmaz (yalnız adaptör build() çağrılır)", async () => {
    const financial = makeFinancialAdapter(financialSafe());
    const signal = makeSignalAdapter(signalBase());
    const svc = new DebtorScoringService(financial, signal);

    await svc.calculateCaseScore("tenant-A", "case-1", "2026-07-10T00:00:00.000Z");

    // DebtorScoringService kendi prisma instance'ına sahip DEĞİL — yalnız adaptörlere delege eder.
    expect((svc as any).prisma).toBeUndefined();
  });
});
