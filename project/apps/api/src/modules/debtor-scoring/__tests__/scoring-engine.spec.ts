import { calculateScore, resolveScoreBand, CALCULATION_VERSION } from "../scoring-engine";
import { ScoringInput } from "../debtor-scoring.types";

/**
 * DEBTOR-SCORING PR-2A — saf motor birim testleri.
 * Frozen kararlar: yüksek=kötü; 25/25/20/15/15; eksik veri = nötr + dataGaps + warnings;
 * LEGAL_DEADLINE v1'de daima EXCLUDED DATA_GAP; motor saat okumaz (asOf girdiden).
 */
describe("scoring-engine (PR-2A)", () => {
  const AS_OF = "2026-07-10T12:00:00.000Z";

  function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
    return {
      tenantId: "tenant-1",
      caseId: "case-1",
      asOf: AS_OF,
      financial: { source: "BALANCE_AUTHORITY", outstandingTotal: 100000, confirmedPaidTotal: 0 },
      asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "NO", realEstate: "NO", bank: "NO", sgkWage: "NO" },
      caseSignals: {
        createdAt: "2025-06-01T00:00:00.000Z", // ~400 gün → CASE_AGE 20
        workflowStage: "INITIAL",
        hasObjection: false,
        lastConfirmedPaymentAt: null,
      },
      service: { source: "TEBLIGAT", serviceStatus: "SENT" },
      ...overrides,
    };
  }

  it("1) determinizm: aynı input iki çağrıda bit-bit aynı sonucu üretir", () => {
    const input = baseInput();
    const a = calculateScore(input);
    const b = calculateScore(input);
    expect(a).toEqual(b);
    expect(a.calculatedAt).toBe(AS_OF); // motor saat okumaz
    expect(a.calculationVersion).toBe(CALCULATION_VERSION);
    expect(a.tenantId).toBe("tenant-1");
    expect(a.caseId).toBe("case-1");
  });

  it("2) faktör toplamı: score, factorBreakdown puanlarının toplamına eşittir", () => {
    const result = calculateScore(baseInput());
    const sum = result.factorBreakdown.reduce((s, f) => s + f.points, 0);
    expect(result.score).toBe(sum);
    // Ağırlıklar (M1): 25/25/20/15/15 + LEGAL_DEADLINE 0
    const maxByFactor = Object.fromEntries(
      result.factorBreakdown.map((f) => [f.factorCode, f.maxPoints]),
    );
    expect(maxByFactor).toEqual({
      FIN_RECOVERY: 25,
      ASSET_COVERAGE: 25,
      CASE_AGE: 20,
      STAGE_PROGRESS: 15,
      BEHAVIOR: 15,
      LEGAL_DEADLINE: 0,
    });
  });

  it("3) clamp: en kötü senaryo tam 100'ü aşamaz, en iyi senaryo 0'ın altına inemez", () => {
    // En kötü: ödeme yok (25) + tüm kanallar NO (25) + yaş 400g (20) + INITIAL (15)
    // + itiraz var & tebligat iade (7+5+3 → clamp 15) = 100
    const worst = calculateScore(
      baseInput({
        caseSignals: {
          createdAt: "2025-06-01T00:00:00.000Z",
          workflowStage: "INITIAL",
          hasObjection: true,
          lastConfirmedPaymentAt: null,
        },
        service: { source: "TEBLIGAT", serviceStatus: "RETURNED" },
      }),
    );
    expect(worst.score).toBe(100);
    expect(worst.scoreBand).toBe("CRITICAL");

    // En iyi: %100 tahsilat (0) + tüm kanallar YES (0) + yeni dosya (0) + COLLECTION (0)
    // + yakın ödeme & teslim (7-3-2=2)
    const best = calculateScore(
      baseInput({
        financial: { source: "BALANCE_AUTHORITY", outstandingTotal: 0, confirmedPaidTotal: 100000 },
        asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "YES", realEstate: "YES", bank: "YES", sgkWage: "YES" },
        caseSignals: {
          createdAt: "2026-07-01T00:00:00.000Z",
          workflowStage: "COLLECTION",
          hasObjection: false,
          lastConfirmedPaymentAt: "2026-07-05T00:00:00.000Z",
        },
        service: { source: "TEBLIGAT", serviceStatus: "DELIVERED" },
      }),
    );
    expect(best.score).toBe(2);
    expect(best.score).toBeGreaterThanOrEqual(0);
    expect(best.scoreBand).toBe("LOW");
  });

  it("4) band sınırları: 0/24 LOW, 25/49 MEDIUM, 50/74 HIGH, 75/100 CRITICAL", () => {
    expect(resolveScoreBand(0)).toBe("LOW");
    expect(resolveScoreBand(24)).toBe("LOW");
    expect(resolveScoreBand(25)).toBe("MEDIUM");
    expect(resolveScoreBand(49)).toBe("MEDIUM");
    expect(resolveScoreBand(50)).toBe("HIGH");
    expect(resolveScoreBand(74)).toBe("HIGH");
    expect(resolveScoreBand(75)).toBe("CRITICAL");
    expect(resolveScoreBand(100)).toBe("CRITICAL");
  });

  it("5) DATA_GAP nötr puan üretir: finansal girdi yok → 12; tüm asset kanalları bilinmiyor → 12", () => {
    const result = calculateScore(
      baseInput({
        financial: { source: "NOT_AVAILABLE", outstandingTotal: null, confirmedPaidTotal: null },
        asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "UNKNOWN", realEstate: "PENDING", bank: "ERROR", sgkWage: "UNKNOWN" },
      }),
    );
    const fin = result.factorBreakdown.find((f) => f.factorCode === "FIN_RECOVERY")!;
    const asset = result.factorBreakdown.find((f) => f.factorCode === "ASSET_COVERAGE")!;
    expect(fin.points).toBe(12);
    expect(fin.direction).toBe("NEUTRAL");
    expect(asset.points).toBe(12);
    expect(result.dataGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FINANCIAL_INPUT_UNAVAILABLE", factorCode: "FIN_RECOVERY", effect: "NEUTRALIZED" }),
        expect.objectContaining({ code: "ASSET_QUERY_NOT_RUN", factorCode: "ASSET_COVERAGE", effect: "NEUTRALIZED" }),
      ]),
    );
    // Eksik faktörler açıklamada görünür (warnings)
    expect(result.warnings.join(" ")).toContain("FIN_RECOVERY nötr");
    expect(result.warnings.join(" ")).toContain("ASSET_COVERAGE nötr");
  });

  it("5b) asset ayrımı: sorgulandı-ve-YOK (NO) gap DEĞİL, tam risk katkısıdır", () => {
    const allNo = calculateScore(baseInput()); // 4 kanal NO
    const assetFactor = allNo.factorBreakdown.find((f) => f.factorCode === "ASSET_COVERAGE")!;
    expect(assetFactor.points).toBe(25);
    expect(
      allNo.dataGaps.some((g) => g.factorCode === "ASSET_COVERAGE" && g.effect === "NEUTRALIZED"),
    ).toBe(false);
  });

  it("6) warnings ve provenance korunur", () => {
    const result = calculateScore(
      baseInput({
        financial: { source: "CONFIRMED_FILTER_FALLBACK", outstandingTotal: 80000, confirmedPaidTotal: 20000 },
        warnings: ["adapter: iptal/iade geçmişi mevcut"],
      }),
    );
    expect(result.warnings).toContain("adapter: iptal/iade geçmişi mevcut");
    expect(result.inputProvenance).toEqual({
      financial: "CONFIRMED_FILTER_FALLBACK",
      asset: "CASE_DEBTOR_FIELDS",
      service: "TEBLIGAT",
      legalDeadline: "NOT_AVAILABLE",
    });
  });

  it("7) LEGAL_DEADLINE her sonuçta EXCLUDED gap olarak görünür ve 0/0 faktördür", () => {
    const result = calculateScore(baseInput());
    expect(result.dataGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LEGAL_TIME_AUTHORITY_PENDING", factorCode: "LEGAL_DEADLINE", effect: "EXCLUDED" }),
      ]),
    );
    const legal = result.factorBreakdown.find((f) => f.factorCode === "LEGAL_DEADLINE")!;
    expect(legal.points).toBe(0);
    expect(legal.maxPoints).toBe(0);
  });

  it("8) polarite: kötü sinyaller skoru YÜKSELTİR, iyi sinyaller DÜŞÜRÜR (ters polarite sızmaz)", () => {
    const risky = calculateScore(baseInput()); // ödeme yok, varlık yok, eski dosya
    expect(risky.score).toBeGreaterThanOrEqual(75); // yüksek = kötü

    // Tek değişiklik: gayrimenkul bulundu → skor DÜŞMELİ (yüksek=iyi olsaydı yükselirdi)
    const withAsset = calculateScore(
      baseInput({
        asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "NO", realEstate: "YES", bank: "NO", sgkWage: "NO" },
      }),
    );
    expect(withAsset.score).toBeLessThan(risky.score);

    // Tek değişiklik: tahsilat %85 → skor DÜŞMELİ
    const withRecovery = calculateScore(
      baseInput({
        financial: { source: "BALANCE_AUTHORITY", outstandingTotal: 15000, confirmedPaidTotal: 85000 },
      }),
    );
    expect(withRecovery.score).toBeLessThan(risky.score);
  });

  it("8b) erken-yaşam ayrımı: <30 gün + tahsilat yok → EARLY_LIFECYCLE gap işaretlenir", () => {
    const young = calculateScore(
      baseInput({
        caseSignals: {
          createdAt: "2026-07-01T00:00:00.000Z", // 9 gün
          workflowStage: "INITIAL",
          hasObjection: false,
          lastConfirmedPaymentAt: null,
        },
      }),
    );
    expect(young.dataGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EARLY_LIFECYCLE", factorCode: "FIN_RECOVERY", effect: "PARTIAL" }),
      ]),
    );
  });

  it("tebligat entegrasyon-yok ≠ tebliğ-edilemedi: NOT_AVAILABLE gap üretir, RETURNED risk üretir", () => {
    const notIntegrated = calculateScore(
      baseInput({ service: { source: "NOT_AVAILABLE", serviceStatus: "UNKNOWN" } }),
    );
    expect(notIntegrated.dataGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SERVICE_NOT_INTEGRATED", factorCode: "BEHAVIOR", effect: "PARTIAL" }),
      ]),
    );
    const returned = calculateScore(
      baseInput({ service: { source: "TEBLIGAT", serviceStatus: "RETURNED" } }),
    );
    const behaviorNI = notIntegrated.factorBreakdown.find((f) => f.factorCode === "BEHAVIOR")!;
    const behaviorRet = returned.factorBreakdown.find((f) => f.factorCode === "BEHAVIOR")!;
    expect(behaviorRet.points).toBeGreaterThan(behaviorNI.points);
  });
});
