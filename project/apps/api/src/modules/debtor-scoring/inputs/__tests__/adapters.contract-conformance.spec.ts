import { calculateScore } from "../../scoring-engine";
import { ScoringInput } from "../../debtor-scoring.types";
import { FinancialInputResult } from "../financial-input.adapter";
import { CaseSignalInputResult } from "../case-signal-input.adapter";

/**
 * DEBTOR-SCORING PR-2B — kontrat uyumluluğu (test #10).
 *
 * Adaptör çıktı parçalarının (FinancialInputResult/CaseSignalInputResult),
 * hiçbir `as any`/cast olmadan PR-2A'nın saf motoruna (`ScoringInput`) doğrudan
 * birleştirilebildiğini kanıtlar — derleme zamanında tip uyumu, çalışma
 * zamanında da motorun hatasız çalıştığı doğrulanır. Orkestrasyon (PR-2C)
 * burada YOKTUR; bu yalnız iki adaptörün çıktı şeklinin motorun beklediği
 * girdiyle bire bir örtüştüğünün kanıtıdır.
 */
describe("debtor-scoring adapters — ScoringInput kontrat uyumluluğu", () => {
  it("financial + case-signal adaptör çıktıları birleştiğinde geçerli bir ScoringInput oluşturur ve motor hatasız skor üretir", () => {
    const financialResult: FinancialInputResult = {
      financial: { source: "BALANCE_AUTHORITY", outstandingTotal: 80000, confirmedPaidTotal: 20000 },
      warnings: [],
    };
    const signalResult: CaseSignalInputResult = {
      caseSignals: {
        createdAt: "2026-01-01T00:00:00.000Z",
        workflowStage: "ENFORCEMENT",
        hasObjection: false,
        lastConfirmedPaymentAt: "2026-06-01T00:00:00.000Z",
      },
      asset: { source: "CASE_DEBTOR_FIELDS", vehicle: "NO", realEstate: "NO", bank: "YES", sgkWage: "NO" },
      service: { source: "TEBLIGAT", serviceStatus: "DELIVERED" },
      warnings: ["örnek adapter uyarısı"],
    };

    // Orkestrasyonun (PR-2C) yapacağı birleştirme burada YALNIZ kontrat kanıtı için taklit edilir.
    const input: ScoringInput = {
      tenantId: "tenant-1",
      caseId: "case-1",
      asOf: "2026-07-10T00:00:00.000Z",
      financial: financialResult.financial,
      asset: signalResult.asset,
      caseSignals: signalResult.caseSignals,
      service: signalResult.service,
      warnings: [...financialResult.warnings, ...signalResult.warnings],
    };

    const result = calculateScore(input);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.warnings).toEqual(expect.arrayContaining(["örnek adapter uyarısı"]));
    expect(result.inputProvenance.financial).toBe("BALANCE_AUTHORITY");
    expect(result.inputProvenance.asset).toBe("CASE_DEBTOR_FIELDS");
    expect(result.inputProvenance.service).toBe("TEBLIGAT");
  });
});
