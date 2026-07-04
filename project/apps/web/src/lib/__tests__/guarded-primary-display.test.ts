import { describe, it, expect } from "vitest";
import {
  canonicalPrimaryAmounts,
  evaluateGuardedPrimaryDisplayPilot,
} from "../guarded-primary-display";
import type { BalanceDisplayShadowDiffReport } from "../api/balance-shadow-diff";

// GO-IMPLEMENT-1 (totalDebtAmount contract, ALC-AUTH-1 takibi, 2026-07-04): bu senaryo, GO-IMPLEMENT-1
// SONRASI 2026/9502'yi taklit eder — totalDebtAmount artık finite (daha önce hep null'dü, tek başına
// CANONICAL_PRINCIPAL_UNAVAILABLE üretiyordu). Amaç: bu tek düzelme B1 primary-display'i kazara AÇMASIN.
function makeAllFiniteReport(
  overrides: Partial<BalanceDisplayShadowDiffReport> = {},
): BalanceDisplayShadowDiffReport {
  return {
    tenantId: "tenant-1",
    caseId: "case-9502",
    currency: "TRY",
    generatedAt: "2026-07-04T00:00:00.000Z",
    sourceVersion: "computeBalance:test",
    mode: "SHADOW_ONLY",
    primaryDisplayUnchanged: true,
    sources: {
      legacyCalculationSummary: {
        available: true,
        endpoint: "/cases/:id/calculation-summary",
        authority: "LEGACY_DISPLAY",
        diagnostics: [],
      },
      canonicalBalanceDisplay: {
        available: true,
        endpoint: "/interest-engine/case/:caseId/balance/display",
        authority: "SHADOW_ONLY",
        diagnostics: [],
        unsafeSources: [],
      },
    },
    comparability: {
      comparable: true,
      classification: "EXACT_MATCH",
      severity: "GREEN",
      blockers: [],
      warnings: [],
    },
    totals: {
      canonical: {
        currency: "TRY",
        // GO-IMPLEMENT-1 öncesi bu her zaman null'dü; artık gerçek gross/as-of-date değer.
        totalDebtAmount: 234311.1,
        totalPaidAmount: 220000,
        outstandingAmount: 0,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        raw: {},
      },
      diffs: [],
    },
    bucketDiffs: [
      {
        code: "PRINCIPAL_BUCKET_DELTA",
        label: "PRINCIPAL bucket shadow diff",
        bucket: "PRINCIPAL",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.asilAlacak",
        canonicalField: "canonical.bucket.PRINCIPAL",
        legacyAmount: 200000,
        canonicalAmount: 0,
        delta: -200000,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "GREEN",
        explanation: "test fixture",
        canonicalDisplayable: true,
      },
    ],
    diagnostics: [],
    cutoverReadiness: {
      safeForPrimaryDisplay: false,
      safeForOptInShadow: true,
      blockers: [],
      nextRequiredEvidence: [],
    },
    provenance: {
      legacyCalculationSummaryUsed: true,
      canonicalBalanceDisplayUsed: true,
      computeBalanceUsed: true,
      finalDebtStatesAvailable: true,
      claimItemCollectedAmountUsedAsAuthority: false,
      overpaymentHeldAvailable: true,
      blockedOverpaymentDiagnosticsAvailable: false,
    },
    ...overrides,
  };
}

describe("GO-IMPLEMENT-1: totalDebtAmount finite tek başına B1'i açmaz", () => {
  it("canonicalPrimaryAmounts(): tüm alanlar (totalDebtAmount dahil) finite ise geçerli tutar döner", () => {
    const report = makeAllFiniteReport();
    const amounts = canonicalPrimaryAmounts(report);
    expect(amounts).not.toBeNull();
    expect(amounts?.totalDebtAmount).toBe(234311.1);
    expect(amounts?.principalAmount).toBe(0);
  });

  it("evaluateGuardedPrimaryDisplayPilot(): totalDebtAmount finite olsa BİLE primarySource CANONICAL'a geçmez", () => {
    const report = makeAllFiniteReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });

    // Bu satır olmasaydı (B1_REMAINING_BLOCKERS_UNRESOLVED gate'i kaldırılsaydı) decision
    // CANONICAL_PRIMARY_CANDIDATE olurdu — tam da GO-IMPLEMENT-1'in AÇMAMASI istenen davranış.
    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("B1_REMAINING_BLOCKERS_UNRESOLVED");
  });

  it("totalDebtAmount null olduğunda (GO-IMPLEMENT-1 öncesi davranış) CANONICAL_PRINCIPAL_UNAVAILABLE hâlâ üretilir", () => {
    const report = makeAllFiniteReport({
      totals: {
        canonical: {
          currency: "TRY",
          totalDebtAmount: null,
          totalPaidAmount: 220000,
          outstandingAmount: 0,
          interestAmount: 0,
          costsAmount: 0,
          attorneyFeeAmount: 0,
          raw: {},
        },
        diffs: [],
      },
    });
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    expect(decision.reasonCodes).toContain("CANONICAL_PRINCIPAL_UNAVAILABLE");
    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
  });
});
