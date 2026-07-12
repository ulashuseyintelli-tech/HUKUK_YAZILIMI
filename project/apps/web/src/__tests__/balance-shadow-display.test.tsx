import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BalanceShadowDiffPanel } from "@/components/finance/BalanceShadowDiffPanel";
import { HesapOzetiPanel } from "@/components/finance/HesapOzetiPanel";
import {
  getBalanceShadowDisplayDate,
  shouldShowBalanceShadowDisplay,
} from "@/lib/balance-shadow-display";
import {
  buildGuardedPrimaryCalculationResult,
  buildGuardedPrimaryCalculationResultWithBoundaryPlan,
  buildGuardedSummaryRuntimeBoundaryPlan,
  evaluateGuardedPrimaryDisplayPilot,
  shouldEnableGuardedPrimaryDisplayPilot,
} from "@/lib/guarded-primary-display";
import { apiClient } from "@/lib/api/client";
import type {
  BalanceDisplayShadowDiffReport,
  CanonicalSummaryShadowRow,
} from "@/lib/api/balance-shadow-diff";
import { useCaseCalculation } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: vi.fn(),
  formatTL: (amount: number) =>
    `${amount.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TL`,
  formatDate: (date: string) => date,
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const useCaseCalculationMock = useCaseCalculation as unknown as ReturnType<typeof vi.fn>;

function unsupportedCanonicalSummaryRows(): readonly CanonicalSummaryShadowRow[] {
  return (["tazminat", "komisyon", "takipOncesiFaiz"] as const).map((rowId) => ({
    rowId,
    status: "UNSUPPORTED",
    amount: null,
    currency: null,
    sourceAuthority: "UNKNOWN",
    affectsPaymentAllocation: false,
    allocationCategory: "UNSUPPORTED",
    primaryEligible: false,
    contractVersion: "canonical-summary-rows.shadow-status.v1",
  }));
}

const legacyCalculationSummary = {
  caseId: "case-1",
  hesapTarihi: "2026-06-24",
  takipTarihi: "2026-06-01",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 1234,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 1234,
  basvurmaHarci: 0,
  vekaletHarci: 0,
  pesinHarc: 0,
  dosyaGideri: 0,
  tebligatGideri: 0,
  vekaletPulu: 0,
  icraMasraflari: 0,
  pesinHarcDahilTahsilHarci: 0,
  pesinHarcHaricTahsilHarci: 0,
  vekaletUcreti: 0,
  takipSonrasiFaiz: 0,
  toplamBorc: 1234,
  sonBorc: 1234,
  toplamTahsilat: 0,
  kalanBorc: 1234,
  kalanAnapara: 1234,
  mahsupDetaylari: [],
  faizSegmentleri: {
    takipOncesi: [],
    takipSonrasi: [],
  },
  tahsilOranlari: [],
};

function makeReport(
  overrides: Partial<BalanceDisplayShadowDiffReport> = {},
): BalanceDisplayShadowDiffReport {
  const base: BalanceDisplayShadowDiffReport = {
    tenantId: "tenant-1",
    caseId: "case-1",
    currency: "TRY",
    generatedAt: "2026-06-24T10:00:00.000Z",
    sourceVersion: "balance-display-shadow-diff-v1",
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
        authority: "CANONICAL_BALANCE_DISPLAY",
        diagnostics: [],
        unsafeSources: [],
      },
    },
    comparability: {
      comparable: true,
      classification: "EXPECTED_CANONICAL_DIVERGENCE",
      severity: "YELLOW",
      blockers: [],
      warnings: [],
    },
    totals: {
      legacy: {
        currency: "TRY",
        totalDebtAmount: 1234,
        totalPaidAmount: 0,
        outstandingAmount: 1234,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        raw: {},
      },
      canonical: {
        currency: "TRY",
        totalDebtAmount: 980,
        totalPaidAmount: 0,
        outstandingAmount: 980,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        raw: {},
      },
      diffs: [
        {
          code: "TOTAL_DEBT_DIFF",
          label: "Total debt",
          classification: "EXPECTED_CANONICAL_DIVERGENCE",
          legacyField: "toplamBorc",
          canonicalField: "totals.totalDebtAmount",
          legacyAmount: 1234,
          canonicalAmount: 980,
          delta: -254,
          deltaPercent: -20.58,
          status: "MAJOR_DELTA",
          severity: "YELLOW",
          explanation: "Expected divergence",
        },
      ],
    },
    bucketDiffs: [],
    diagnostics: [
      {
        code: "LEGACY_CALCULATION_SUMMARY_LIVE",
        classification: "LEGACY_AUTHORITY_RISK",
        severity: "YELLOW",
        message: "Legacy display remains live.",
      },
    ],
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
      overpaymentHeldAvailable: false,
      blockedOverpaymentDiagnosticsAvailable: false,
    },
  };

  return {
    ...base,
    ...overrides,
    sources: {
      ...base.sources,
      ...overrides.sources,
    },
    comparability: {
      ...base.comparability,
      ...overrides.comparability,
    },
    totals: {
      ...base.totals,
      ...overrides.totals,
    },
    cutoverReadiness: {
      ...base.cutoverReadiness,
      ...overrides.cutoverReadiness,
    },
    provenance: {
      ...base.provenance,
      ...overrides.provenance,
    },
  };
}

function makeEligibleGuardedPrimaryReport(): BalanceDisplayShadowDiffReport {
  return makeReport({
    comparability: {
      comparable: true,
      classification: "EXACT_MATCH",
      severity: "GREEN",
      blockers: [],
      warnings: [],
    },
    totals: {
      legacy: {
        currency: "TRY",
        totalDebtAmount: 980,
        totalPaidAmount: 0,
        outstandingAmount: 980,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        raw: {},
      },
      canonical: {
        currency: "TRY",
        totalDebtAmount: 980,
        totalPaidAmount: 0,
        outstandingAmount: 980,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        raw: {},
      },
      diffs: [],
    },
    bucketDiffs: [
      {
        code: "PRINCIPAL_MATCH",
        label: "Principal",
        classification: "EXACT_MATCH",
        legacyField: "asilAlacak",
        canonicalField: "bucket.PRINCIPAL",
        legacyAmount: 980,
        canonicalAmount: 980,
        delta: 0,
        deltaPercent: 0,
        status: "MATCH",
        severity: "GREEN",
        explanation: "Principal exact match.",
        bucket: "PRINCIPAL",
        canonicalDisplayable: true,
      },
    ],
    diagnostics: [],
    cutoverReadiness: {
      safeForPrimaryDisplay: true,
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
      overpaymentHeldAvailable: false,
      blockedOverpaymentDiagnosticsAvailable: false,
    },
  });
}

function makeMixedAuthorityLegacySummary() {
  return {
    ...legacyCalculationSummary,
    asilAlacak: 90001,
    tazminat: 111,
    komisyon: 222,
    takipOncesiFaiz: 333,
    takipTutari: 90001,
    basvurmaHarci: 444,
    vekaletHarci: 555,
    pesinHarc: 666,
    dosyaGideri: 777,
    tebligatGideri: 888,
    vekaletPulu: 999,
    icraMasraflari: 90002,
    pesinHarcDahilTahsilHarci: 1001,
    pesinHarcHaricTahsilHarci: 1002,
    vekaletUcreti: 90003,
    takipSonrasiFaiz: 90004,
    toplamBorc: 90005,
    sonBorc: 90006,
    toplamTahsilat: 90007,
    kalanBorc: 90008,
    kalanAnapara: 90009,
    mahsupDetaylari: [
      {
        tarih: "2026-06-10",
        tahsilatTutar: 123,
        mahsupMasraf: 124,
        mahsupVekalet: 125,
        mahsupTakipOncesiFaiz: 126,
        mahsupFaiz: 127,
        mahsupAnapara: 128,
        kalanAnapara: 129,
      },
    ],
    faizSegmentleri: {
      takipOncesi: [
        {
          baslangic: "2026-01-01",
          bitis: "2026-01-02",
          gun: 1,
          oran: 9,
          faiz: 1004,
        },
      ],
      takipSonrasi: [
        {
          baslangic: "2026-02-01",
          bitis: "2026-02-02",
          gun: 1,
          oran: 10,
          faiz: 1005,
        },
      ],
    },
    tahsilOranlari: [
      {
        oran: 5,
        label: "legacy oran",
        tutar: 1003,
      },
    ],
  };
}

function makeMixedAuthorityCanonicalReport(): BalanceDisplayShadowDiffReport {
  const report = makeEligibleGuardedPrimaryReport();
  report.bucketDiffs[0].canonicalAmount = 10001;
  report.totals.canonical!.totalDebtAmount = 20002;
  report.totals.canonical!.outstandingAmount = 30003;
  report.totals.canonical!.totalPaidAmount = 4004;
  report.totals.canonical!.interestAmount = 505;
  report.totals.canonical!.costsAmount = 606;
  report.totals.canonical!.attorneyFeeAmount = 707;
  return report;
}
beforeEach(() => {
  vi.clearAllMocks();
  useCaseCalculationMock.mockReturnValue({
    data: legacyCalculationSummary,
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("balance shadow display opt-in gate", () => {
  it("env flag true ve balanceShadow=1 birlikte olmadan panel acilmaz", () => {
    expect(shouldShowBalanceShadowDisplay(new URLSearchParams("balanceShadow=1"), true)).toBe(true);
    expect(shouldShowBalanceShadowDisplay(new URLSearchParams("balanceShadow=1"), false)).toBe(false);
    expect(shouldShowBalanceShadowDisplay(new URLSearchParams("balanceShadow=true"), true)).toBe(false);
    expect(shouldShowBalanceShadowDisplay(new URLSearchParams(""), true)).toBe(false);
  });

  it("opsiyonel shadow tarihini query'den okur", () => {
    expect(getBalanceShadowDisplayDate(new URLSearchParams("balanceShadowDate=2026-06-24"))).toBe("2026-06-24");
    expect(getBalanceShadowDisplayDate(new URLSearchParams(""))).toBeUndefined();
  });
});

describe("guarded primary display pilot gate", () => {
  it("env flag true ve guardedPrimary=1 birlikte olmadan pilot acilmaz", () => {
    expect(shouldEnableGuardedPrimaryDisplayPilot(new URLSearchParams("guardedPrimary=1"), true)).toBe(true);
    expect(shouldEnableGuardedPrimaryDisplayPilot(new URLSearchParams("guardedPrimary=1"), false)).toBe(false);
    expect(shouldEnableGuardedPrimaryDisplayPilot(new URLSearchParams("guardedPrimary=true"), true)).toBe(false);
    expect(shouldEnableGuardedPrimaryDisplayPilot(new URLSearchParams(""), true)).toBe(false);
  });

  it("balanceShadow=1 tek basina guarded primary pilot acmaz", () => {
    const params = new URLSearchParams("balanceShadow=1");

    expect(shouldShowBalanceShadowDisplay(params, true)).toBe(true);
    expect(shouldEnableGuardedPrimaryDisplayPilot(params, true)).toBe(false);
  });
  it("flag off ise eligible evidence olsa bile legacy fallback secer", () => {
    const decision = evaluateGuardedPrimaryDisplayPilot(makeEligibleGuardedPrimaryReport(), {
      featureFlagEnabled: false,
    });

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("FEATURE_FLAG_OFF");
  });

  it("flag on ve eligible evidence varsa canonical primary candidate secer", () => {
    const decision = evaluateGuardedPrimaryDisplayPilot(makeEligibleGuardedPrimaryReport(), {
      featureFlagEnabled: true,
    });

    expect(decision).toEqual({
      primarySource: "CANONICAL_PRIMARY_CANDIDATE",
      reasonCodes: [],
    });
  });

  it("zero canonical monetary values valid guarded primary payload olarak kabul edilir", () => {
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.legacy!.totalDebtAmount = 0;
    report.totals.legacy!.outstandingAmount = 0;
    report.totals.canonical!.totalDebtAmount = 0;
    report.totals.canonical!.outstandingAmount = 0;
    report.totals.canonical!.totalPaidAmount = 0;
    report.totals.canonical!.interestAmount = 0;
    report.totals.canonical!.costsAmount = 0;
    report.totals.canonical!.attorneyFeeAmount = 0;
    report.bucketDiffs[0].legacyAmount = 0;
    report.bucketDiffs[0].canonicalAmount = 0;

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacyCalculationSummary, report, decision);

    expect(decision.primarySource).toBe("CANONICAL_PRIMARY_CANDIDATE");
    expect(decision.reasonCodes).toEqual([]);
    expect(guardedResult).toEqual(expect.objectContaining({
      asilAlacak: 0,
      takipTutari: 0,
      toplamBorc: 0,
      sonBorc: 0,
      kalanBorc: 0,
    }));
  });

  it("finite negative canonical monetary values mevcut guard tarafindan domain disi diye reddedilmez", () => {
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.legacy!.totalDebtAmount = -50;
    report.totals.legacy!.outstandingAmount = -50;
    report.totals.canonical!.totalDebtAmount = -50;
    report.totals.canonical!.outstandingAmount = -50;
    report.totals.canonical!.totalPaidAmount = -50;
    report.totals.canonical!.interestAmount = -50;
    report.totals.canonical!.costsAmount = -50;
    report.totals.canonical!.attorneyFeeAmount = -50;
    report.bucketDiffs[0].legacyAmount = -50;
    report.bucketDiffs[0].canonicalAmount = -50;

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });

    expect(decision.primarySource).toBe("CANONICAL_PRIMARY_CANDIDATE");
    expect(decision.reasonCodes).toEqual([]);
  });


  it("guarded primary calculation result canonical alanlari override eder ama legacy-only satirlari korur", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(decision.primarySource).toBe("CANONICAL_PRIMARY_CANDIDATE");
    expect(guardedResult).toEqual(expect.objectContaining({
      asilAlacak: 10001,
      takipTutari: 10001,
      takipSonrasiFaiz: 505,
      toplamBorc: 20002,
      sonBorc: 30003,
      toplamTahsilat: 4004,
      kalanBorc: 30003,
      kalanAnapara: 10001,
    }));
    // ALC-AUTH-1A: icraMasraflari/vekaletUcreti B1 kapsami disinda -- legacy (tarife formulu)
    // degerleri korunur, canonical (606/707) DEGIL.
    expect(guardedResult).toEqual(expect.objectContaining({
      tazminat: 111,
      komisyon: 222,
      takipOncesiFaiz: 333,
      basvurmaHarci: 444,
      vekaletHarci: 555,
      pesinHarc: 666,
      dosyaGideri: 777,
      tebligatGideri: 888,
      vekaletPulu: 999,
      icraMasraflari: 90002,
      pesinHarcDahilTahsilHarci: 1001,
      pesinHarcHaricTahsilHarci: 1002,
      vekaletUcreti: 90003,
      tahsilOranlari: legacy.tahsilOranlari,
      mahsupDetaylari: legacy.mahsupDetaylari,
      faizSegmentleri: legacy.faizSegmentleri,
    }));
  });
  it.each([
    ["totalPaidAmount", undefined],
    ["totalPaidAmount", null],
    ["totalPaidAmount", "0"],
    ["totalPaidAmount", Number.NaN],
    ["totalPaidAmount", Number.POSITIVE_INFINITY],
    ["interestAmount", undefined],
    ["interestAmount", null],
    ["interestAmount", "0"],
    ["interestAmount", Number.NaN],
    ["interestAmount", Number.POSITIVE_INFINITY],
  ] as const)(
    "%s malformed oldugunda guarded primary fallback secer",
    (field, value) => {
      const report = makeEligibleGuardedPrimaryReport();
      report.totals.canonical![field] = value as unknown as number;

      const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
      const guardedResult = buildGuardedPrimaryCalculationResult(legacyCalculationSummary, report, decision);

      expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
      expect(decision.reasonCodes).toContain("CANONICAL_DISPLAYED_AMOUNT_UNAVAILABLE");
      expect(guardedResult).toBeNull();
    },
  );

  // ALC-AUTH-1A: B1 kapsami principal + interest + payment ile sinirlandi -- cost/vekalet
  // (costsAmount/attorneyFeeAmount) artik canonical primary gate'i BLOKLAMAZ.
  it.each([
    ["costsAmount", undefined],
    ["costsAmount", null],
    ["costsAmount", "0"],
    ["costsAmount", Number.NaN],
    ["costsAmount", Number.POSITIVE_INFINITY],
    ["attorneyFeeAmount", undefined],
    ["attorneyFeeAmount", null],
    ["attorneyFeeAmount", "0"],
    ["attorneyFeeAmount", Number.NaN],
    ["attorneyFeeAmount", Number.POSITIVE_INFINITY],
  ] as const)(
    "%s malformed olsa da B1 (principal+interest+payment) kapsami disinda oldugundan guarded primary'yi bloklamaz",
    (field, value) => {
      const report = makeEligibleGuardedPrimaryReport();
      report.totals.canonical![field] = value as unknown as number;

      const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
      const guardedResult = buildGuardedPrimaryCalculationResult(legacyCalculationSummary, report, decision);

      expect(decision.primarySource).toBe("CANONICAL_PRIMARY_CANDIDATE");
      expect(decision.reasonCodes).toEqual([]);
      expect(guardedResult).not.toBeNull();
    },
  );

  // ALC-AUTH-3E: COSTS_DELTA/ATTORNEY_FEE_DELTA RED ise (legacy nonzero, canonical
  // cost/vekalet ClaimItem-boslugu yuzunden 0) toplamBorc/sonBorc/kalanBorc case-bazli
  // legacy'de kalir; guard'in kendisi bloklanmaz (B1_SCOPE_EXEMPT_DIFF_CODES ile tutarli),
  // diger 5 canonical override alan etkilenmez.
  it("COSTS_DELTA RED tek basina ise decision PARTIAL_CANONICAL_LEGACY_TOTALS'a duser (ALC-AUTH-4A-IMPL)", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    report.totals.diffs = [
      ...report.totals.diffs,
      {
        code: "COSTS_DELTA",
        label: "Legacy icraMasraflari vs canonical costs",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.icraMasraflari",
        canonicalField: "canonical.costs",
        legacyAmount: legacy.icraMasraflari,
        canonicalAmount: 0,
        delta: -legacy.icraMasraflari,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Legacy masraf hesaplari ile canonical case-level cost projection ayni otorite degildir.",
      },
    ];

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    // ALC-AUTH-4A-IMPL (owner karari, 2026-07-05): PR #942'nin "her zaman tam LEGACY" safe
    // default'u YALNIZ COST_ATTORNEY_FEE_SUPPRESSED baska hicbir engelleyici sebep olmadan tek
    // basina varken PARTIAL_CANONICAL_LEGACY_TOTALS'a genisletildi -- 5 canonical-override alan
    // korunur, yalniz toplamBorc/sonBorc/kalanBorc legacy'de kalir; suppress reasonCodes'ta hala
    // GORUNUR (banner artik "eligible" yanilgisi vermez, ama tam legacy'e de dusmez).
    expect(decision.primarySource).toBe("PARTIAL_CANONICAL_LEGACY_TOTALS");
    expect(decision.reasonCodes).toContain("COST_ATTORNEY_FEE_SUPPRESSED");
    expect(guardedResult).not.toBeNull();
    expect(guardedResult!.toplamBorc).toBe(legacy.toplamBorc);
    expect(guardedResult!.sonBorc).toBe(legacy.sonBorc);
    expect(guardedResult!.kalanBorc).toBe(legacy.kalanBorc);
    expect(guardedResult!.asilAlacak).toBe(report.bucketDiffs[0].canonicalAmount);
    expect(guardedResult!.takipTutari).toBe(report.bucketDiffs[0].canonicalAmount);
    expect(guardedResult!.takipSonrasiFaiz).toBe(report.totals.canonical!.interestAmount);
    expect(guardedResult!.toplamTahsilat).toBe(report.totals.canonical!.totalPaidAmount);
    expect(guardedResult!.kalanAnapara).toBe(report.bucketDiffs[0].canonicalAmount);
  });

  it("ATTORNEY_FEE_DELTA RED tek basina ise de decision PARTIAL_CANONICAL_LEGACY_TOTALS'a duser (ALC-AUTH-4A-IMPL)", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    report.totals.diffs = [
      ...report.totals.diffs,
      {
        code: "ATTORNEY_FEE_DELTA",
        label: "Legacy vekaletUcreti vs canonical attorney fee",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.vekaletUcreti",
        canonicalField: "canonical.bucket.ATTORNEY_FEE",
        legacyAmount: legacy.vekaletUcreti,
        canonicalAmount: 0,
        delta: -legacy.vekaletUcreti,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Vekalet ucreti projection farki cutover blocker adayidir.",
      },
    ];

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(decision.primarySource).toBe("PARTIAL_CANONICAL_LEGACY_TOTALS");
    expect(decision.reasonCodes).toContain("COST_ATTORNEY_FEE_SUPPRESSED");
    expect(guardedResult).not.toBeNull();
    expect(guardedResult!.toplamBorc).toBe(legacy.toplamBorc);
    expect(guardedResult!.sonBorc).toBe(legacy.sonBorc);
    expect(guardedResult!.kalanBorc).toBe(legacy.kalanBorc);
  });

  it("COST_ATTORNEY_FEE_SUPPRESSED baska bir engelleyici reasonCode ile birlikteyse safe default korunur: decision tam LEGACY'e duser (ALC-AUTH-4A-IMPL)", () => {
    // Owner karari: partial-canonical istisnasi YALNIZ suppress TEK BASINA iken gecerlidir.
    // Baska herhangi bir engelleyici sebep (burada: feature flag kapali) varken PR #942'nin
    // "safe default"u (tam legacy) DEGISMEDEN korunur.
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    report.totals.diffs = [
      ...report.totals.diffs,
      {
        code: "COSTS_DELTA",
        label: "Legacy icraMasraflari vs canonical costs",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.icraMasraflari",
        canonicalField: "canonical.costs",
        legacyAmount: legacy.icraMasraflari,
        canonicalAmount: 0,
        delta: -legacy.icraMasraflari,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Legacy masraf hesaplari ile canonical case-level cost projection ayni otorite degildir.",
      },
    ];

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: false });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("COST_ATTORNEY_FEE_SUPPRESSED");
    expect(decision.reasonCodes).toContain("FEATURE_FLAG_OFF");
    expect(guardedResult).toBeNull();
  });

  it("ALC-AUTH-3E defense-in-depth: decision manuel CANONICAL kurgulanirsa (evaluate() bypass) buildGuardedPrimaryCalculationResult yine de 3 aggregate alani suppress eder", () => {
    // Bu test evaluateGuardedPrimaryDisplayPilot()'u ATLAYIP decision'i elle CANONICAL kurguluyor --
    // buildGuardedPrimaryCalculationResult'un KENDI suppress kontrolunun (defense-in-depth,
    // ALC-AUTH-3E'den kalan) hala calistigini dogrular; normal akista (evaluate() ile) bu artik
    // hic tetiklenmez cunku decision zaten LEGACY olur (bkz. yukaridaki iki test).
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    report.totals.diffs = [
      ...report.totals.diffs,
      {
        code: "COSTS_DELTA",
        label: "Legacy icraMasraflari vs canonical costs",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.icraMasraflari",
        canonicalField: "canonical.costs",
        legacyAmount: legacy.icraMasraflari,
        canonicalAmount: 0,
        delta: -legacy.icraMasraflari,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Legacy masraf hesaplari ile canonical case-level cost projection ayni otorite degildir.",
      },
    ];
    const manualDecision = { primarySource: "CANONICAL_PRIMARY_CANDIDATE" as const, reasonCodes: [] };

    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, manualDecision);

    expect(guardedResult).not.toBeNull();
    expect(guardedResult!.toplamBorc).toBe(legacy.toplamBorc);
    expect(guardedResult!.sonBorc).toBe(legacy.sonBorc);
    expect(guardedResult!.kalanBorc).toBe(legacy.kalanBorc);
    expect(guardedResult!.asilAlacak).toBe(report.bucketDiffs[0].canonicalAmount);
  });

  it("COSTS_DELTA/ATTORNEY_FEE_DELTA RED degilse toplamBorc/sonBorc/kalanBorc mevcut gibi canonical override edilir", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    // report.totals.diffs bos (makeReport base) -- RED cost/fee sinyali yok.
    expect(report.totals.diffs.some((d) => d.code === "COSTS_DELTA" || d.code === "ATTORNEY_FEE_DELTA")).toBe(false);

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(guardedResult).not.toBeNull();
    expect(guardedResult!.toplamBorc).toBe(report.totals.canonical!.totalDebtAmount);
    expect(guardedResult!.sonBorc).toBe(report.totals.canonical!.outstandingAmount);
    expect(guardedResult!.kalanBorc).toBe(report.totals.canonical!.outstandingAmount);
  });

  it("principal bucket displayable degilse guarded primary fallback secer", () => {
    const report = makeEligibleGuardedPrimaryReport();
    report.bucketDiffs[0].canonicalDisplayable = false;

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("CANONICAL_PRINCIPAL_UNAVAILABLE");
  });

  it.each([
    ["missing totalDebtAmount", undefined],
    ["null totalDebtAmount", null],
    ["string totalDebtAmount", "980"],
    ["NaN totalDebtAmount", Number.NaN],
    ["Infinity totalDebtAmount", Number.POSITIVE_INFINITY],
  ])("%s durumunda guarded primary fallback secer", (_label, totalDebtAmount) => {
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.canonical!.totalDebtAmount = totalDebtAmount as unknown as number;

    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("CANONICAL_PRINCIPAL_UNAVAILABLE");
  });

  it("flag on ama finalDebtStates missing ise legacy fallback secer", () => {
    const decision = evaluateGuardedPrimaryDisplayPilot(
      makeReport({
        diagnostics: [
          {
            code: "FINAL_DEBT_STATES_MISSING",
            classification: "BLOCKER",
            severity: "RED",
            message: "Final debt states missing.",
          },
        ],
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: true,
          blockers: ["FINAL_DEBT_STATES_MISSING"],
          nextRequiredEvidence: [],
        },
        provenance: {
          ...makeReport().provenance,
          finalDebtStatesAvailable: false,
        },
      }),
      { featureFlagEnabled: true },
    );

    // ALC-AUTH-3D: FINAL_DEBT_STATES_REQUIRED artik frontend'de uretilmiyor (ikinci authority
    // kaldirildi) - FINAL_DEBT_STATES_MISSING tek kaynaktan (backend cutoverReadiness.blockers) gelir.
    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "FINAL_DEBT_STATES_MISSING",
    ]));
  });

  it("currency veya context mismatch varsa amount comparison primary yapilmaz", () => {
    // ALC-AUTH-3D: domain-safety tek otorite backend cutoverReadiness'tir -- gercek backend'de
    // compare.blockers (CURRENCY_MISMATCH/CONTEXT_MISMATCH) zaten cutoverReadiness.blockers'a
    // akar (bkz. balance-display-shadow-diff.service.ts cutoverReadiness()), fixture bunu yansitir.
    // safeForOptInShadow=false: CURRENCY_MISMATCH/CONTEXT_MISMATCH backend'in kendi
    // optInShadowBlockers setinde -- shadow paneli de guvenli degil (gercek davranisla eslesir).
    const currencyDecision = evaluateGuardedPrimaryDisplayPilot(
      makeReport({
        currency: null,
        comparability: {
          comparable: false,
          classification: "CURRENCY_MISMATCH",
          severity: "RED",
          blockers: [
            {
              code: "CURRENCY_MISMATCH",
              classification: "CURRENCY_MISMATCH",
              severity: "RED",
              message: "Currencies differ.",
            },
          ],
          warnings: [],
        },
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: false,
          blockers: ["CURRENCY_MISMATCH"],
          nextRequiredEvidence: [],
        },
      }),
      { featureFlagEnabled: true },
    );
    const contextDecision = evaluateGuardedPrimaryDisplayPilot(
      makeReport({
        comparability: {
          comparable: false,
          classification: "CONTEXT_MISMATCH",
          severity: "RED",
          blockers: [
            {
              code: "CONTEXT_MISMATCH",
              classification: "CONTEXT_MISMATCH",
              severity: "RED",
              message: "Context mismatch.",
            },
          ],
          warnings: [],
        },
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: false,
          blockers: ["CONTEXT_MISMATCH"],
          nextRequiredEvidence: [],
        },
      }),
      { featureFlagEnabled: true },
    );

    expect(currencyDecision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(currencyDecision.reasonCodes).toEqual(expect.arrayContaining(["CURRENCY_MISMATCH"]));
    expect(contextDecision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(contextDecision.reasonCodes).toEqual(expect.arrayContaining(["CONTEXT_MISMATCH"]));
  });

  it("ClaimItem contamination, blocked overpayment, restricted payment ve periodic unsupported hallerinde legacy fallback secer", () => {
    const claimDecision = evaluateGuardedPrimaryDisplayPilot(
      makeEligibleGuardedPrimaryReport(),
      { featureFlagEnabled: true, claimItemAuthorityContaminated: true },
    );
    const blockedDecision = evaluateGuardedPrimaryDisplayPilot(
      makeReport({
        diagnostics: [
          {
            code: "OVERPAYMENT_BLOCKED",
            classification: "CANONICAL_UNSAFE",
            severity: "YELLOW",
            message: "Blocked overpayment is diagnostic evidence.",
          },
          {
            code: "RESTRICTED_PAYMENT_DISPLAY_UNSAFE",
            classification: "CANONICAL_UNSAFE",
            severity: "YELLOW",
            message: "Restricted payment scope is unresolved.",
          },
        ],
        // ALC-AUTH-3D: bu iki kod artık frontend'in kendi HARD_NO_GO_CODES'undan değil,
        // backend cutoverReadiness.blockers'tan geliyor (tek otorite). safeForOptInShadow=true:
        // OVERPAYMENT_BLOCKED backend'in optInShadowBlockers setinde DEĞİL (yalnız
        // primary-display'i bloklar, shadow panelini değil) — gerçek davranışla eşleşir.
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: true,
          blockers: ["OVERPAYMENT_BLOCKED", "RESTRICTED_PAYMENT_DISPLAY_UNSAFE"],
          nextRequiredEvidence: [],
        },
      }),
      { featureFlagEnabled: true, paymentDesignationRequired: true },
    );
    const periodicDecision = evaluateGuardedPrimaryDisplayPilot(
      makeEligibleGuardedPrimaryReport(),
      { featureFlagEnabled: true, unsupportedPeriodicObligation: true },
    );

    expect(claimDecision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(claimDecision.reasonCodes).toContain("CLAIM_ITEM_AUTHORITY_CONTAMINATION");
    expect(blockedDecision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(blockedDecision.reasonCodes).toEqual(expect.arrayContaining([
      "OVERPAYMENT_BLOCKED",
      "PAYMENT_DESIGNATION_REQUIRED",
      "RESTRICTED_PAYMENT_DISPLAY_UNSAFE",
    ]));
    expect(periodicDecision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(periodicDecision.reasonCodes).toContain("UNSUPPORTED_PERIODIC_OBLIGATION");
  });

  it("ALC-AUTH-3D: frontend ikinci authority uretmez - backend cutoverReadiness.safeForPrimaryDisplay TEK otoritedir", () => {
    // Eski HARD_NO_GO_CODES listesinde HIC olmayan bir backend blocker (PRINCIPAL_BUCKET_DELTA,
    // OUTSTANDING_DELTA, PAID_DELTA) - ALC-AUTH-3C'nin kanitladigi tam senaryo: bu kodlar eskiden
    // frontend'in kendi listesinde olmadigi icin sessizce eleniyordu, guard yanlislikla geciyordu.
    const decision = evaluateGuardedPrimaryDisplayPilot(
      makeReport({
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: true,
          blockers: ["OUTSTANDING_DELTA", "PAID_DELTA", "PRINCIPAL_BUCKET_DELTA"],
          nextRequiredEvidence: [],
        },
      }),
      { featureFlagEnabled: true },
    );

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "OUTSTANDING_DELTA",
      "PAID_DELTA",
      "PRINCIPAL_BUCKET_DELTA",
    ]));
  });

  it("ALC-AUTH-3D: backend safeForPrimaryDisplay=true ve render-verisi mevcutsa canonical primary candidate secilir", () => {
    const decision = evaluateGuardedPrimaryDisplayPilot(
      makeEligibleGuardedPrimaryReport(),
      { featureFlagEnabled: true },
    );

    expect(decision.primarySource).toBe("CANONICAL_PRIMARY_CANDIDATE");
    expect(decision.reasonCodes).toEqual([]);
  });
});

describe("guarded summary runtime boundary plan", () => {
  const canonicalPrimaryOverrideRowIds = [
    "asilAlacak",
    "takipTutari",
    "takipSonrasiFaiz",
    "toplamBorc",
    "sonBorc",
    "toplamTahsilat",
    "kalanBorc",
    "kalanAnapara",
  ];

  // ALC-AUTH-1A: icraMasraflari/vekaletUcreti B1 kapsami disinda -- backend contract required
  // (legacy retained) satirlara tasindi.
  const backendContractRequiredRowIds = [
    "tazminat",
    "komisyon",
    "takipOncesiFaiz",
    "icraMasraflari",
    "vekaletUcreti",
  ];

  const legacyDiagnosticRetainedRowIds = [
    "basvurmaHarci",
    "vekaletHarci",
    "pesinHarc",
    "dosyaGideri",
    "tebligatGideri",
    "vekaletPulu",
    "pesinHarcDahilTahsilHarci",
    "pesinHarcHaricTahsilHarci",
    "tahsilOranlari",
    "mahsupDetaylari",
    "faizSegmentleri",
    "takipTarihi",
    "kalemTuru",
  ];

  const mixedAuthorityBlockedRowIds = ["mahsupDetayPanelContext"];

  const boundaryMetadataKeys = [
    "boundaryPlan",
    "runtimeBoundaryPlan",
    "sourceBoundaryPlan",
  ];

  function expectPairwiseDisjoint(groups: Array<{ name: string; rowIds: string[] }>) {
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const overlap = groups[i].rowIds.filter((rowId) => groups[j].rowIds.includes(rowId));

        expect(overlap, `${groups[i].name} overlaps ${groups[j].name}`).toEqual([]);
      }
    }
  }

  it("guardedPrimarySelected=false durumunu fallback legacy boundary olarak raporlar", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: false });

    expect(plan.guardedPrimarySelected).toBe(false);
    expect(plan.summary.canonicalPrimaryOverrideRowIds).toEqual([]);
    expect(plan.summary.backendContractRequiredRowIds).toEqual([]);
    expect(plan.summary.legacyDiagnosticRetainedRowIds).toEqual([]);
    expect(plan.summary.mixedAuthorityBlockedRowIds).toEqual([]);
    expect(plan.summary.fallbackLegacyRowIds).toEqual([
      ...canonicalPrimaryOverrideRowIds,
      ...backendContractRequiredRowIds,
      ...legacyDiagnosticRetainedRowIds,
      "mahsupDetayPanelContext",
    ]);
    expect(plan.decisions.every((decision) =>
      decision.runtimeSource === "LEGACY_FALLBACK" &&
      decision.placement === "FALLBACK_LEGACY_SURFACE",
    )).toBe(true);
  });

  it("guardedPrimarySelected=true canonical primary override rowlarini exact raporlar", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expect(plan.summary.canonicalPrimaryOverrideRowIds).toEqual(canonicalPrimaryOverrideRowIds);
    for (const rowId of canonicalPrimaryOverrideRowIds) {
      expect(plan.decisions).toContainEqual(expect.objectContaining({
        rowId,
        runtimeSource: "CANONICAL_PRIMARY_OVERRIDE",
        placement: "PRIMARY_CANONICAL_OVERRIDE",
      }));
    }
  });

  it("backend contract required retained rowlarini exact raporlar", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expect(plan.summary.backendContractRequiredRowIds).toEqual(backendContractRequiredRowIds);
    for (const rowId of backendContractRequiredRowIds) {
      expect(plan.decisions).toContainEqual(expect.objectContaining({
        rowId,
        runtimeSource: "LEGACY_BACKEND_CONTRACT_RETAINED",
        placement: "BACKEND_CONTRACT_REQUIRED_RETAINED",
      }));
    }
  });

  it("legacy diagnostic detail ve projection retained rowlarini raporlar", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expect(plan.summary.legacyDiagnosticRetainedRowIds).toEqual(legacyDiagnosticRetainedRowIds);
    for (const rowId of legacyDiagnosticRetainedRowIds) {
      expect(plan.decisions).toContainEqual(expect.objectContaining({
        rowId,
        runtimeSource: "LEGACY_DIAGNOSTIC_RETAINED",
        placement: "LEGACY_DIAGNOSTIC_RETAINED",
      }));
    }
  });

  it("MahsupDetayPanel context bilgisini mixed authority blocked olarak raporlar", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expect(plan.summary.mixedAuthorityBlockedRowIds).toEqual(mixedAuthorityBlockedRowIds);
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      rowId: "mahsupDetayPanelContext",
      runtimeSource: "MIXED_CANONICAL_LEGACY_CONTEXT",
      placement: "MIXED_AUTHORITY_BLOCKED",
    }));
  });

  it("boundary kategori setleri pairwise disjoint kalir", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expectPairwiseDisjoint([
      {
        name: "canonicalPrimaryOverrideRowIds",
        rowIds: plan.summary.canonicalPrimaryOverrideRowIds,
      },
      {
        name: "backendContractRequiredRowIds",
        rowIds: plan.summary.backendContractRequiredRowIds,
      },
      {
        name: "legacyDiagnosticRetainedRowIds",
        rowIds: plan.summary.legacyDiagnosticRetainedRowIds,
      },
      {
        name: "mixedAuthorityBlockedRowIds",
        rowIds: plan.summary.mixedAuthorityBlockedRowIds,
      },
    ]);
  });

  it("backend contract ve diagnostic rows canonical primary boundary icinde yer almaz", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    for (const rowId of backendContractRequiredRowIds) {
      expect(plan.summary.canonicalPrimaryOverrideRowIds).not.toContain(rowId);
    }

    for (const rowId of [
      "basvurmaHarci",
      "pesinHarcDahilTahsilHarci",
      "tahsilOranlari",
      "mahsupDetaylari",
      "faizSegmentleri",
    ]) {
      expect(plan.summary.canonicalPrimaryOverrideRowIds).not.toContain(rowId);
    }
  });

  it("mixed authority context yalniz blocked kategorisinde kalir", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true });

    expect(plan.summary.mixedAuthorityBlockedRowIds).toEqual(mixedAuthorityBlockedRowIds);
    expect(plan.summary.canonicalPrimaryOverrideRowIds).not.toContain("mahsupDetayPanelContext");
    expect(plan.summary.backendContractRequiredRowIds).not.toContain("mahsupDetayPanelContext");
    expect(plan.summary.legacyDiagnosticRetainedRowIds).not.toContain("mahsupDetayPanelContext");
  });

  it("fallback boundary controlled primary readiness ima etmez", () => {
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: false });

    expect(plan.guardedPrimarySelected).toBe(false);
    expect(plan.summary.canonicalPrimaryOverrideRowIds).toEqual([]);
    expect(plan.summary.backendContractRequiredRowIds).toEqual([]);
    expect(plan.summary.legacyDiagnosticRetainedRowIds).toEqual([]);
    expect(plan.summary.mixedAuthorityBlockedRowIds).toEqual([]);
    expect(plan.summary.fallbackLegacyRowIds).toEqual([
      ...canonicalPrimaryOverrideRowIds,
      ...backendContractRequiredRowIds,
      ...legacyDiagnosticRetainedRowIds,
      ...mixedAuthorityBlockedRowIds,
    ]);
    expect(plan.decisions).toHaveLength(plan.summary.fallbackLegacyRowIds.length);
    expect(plan.decisions.every((decision) =>
      decision.runtimeSource === "LEGACY_FALLBACK" &&
      decision.placement === "FALLBACK_LEGACY_SURFACE",
    )).toBe(true);
  });

  it("boundary plan buildGuardedPrimaryCalculationResult runtime overwrite siniri ile uyumludur", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: Boolean(guardedResult) });

    expect(guardedResult).not.toBeNull();
    expect(plan.summary.canonicalPrimaryOverrideRowIds).toEqual(canonicalPrimaryOverrideRowIds);
    expect(plan.summary.backendContractRequiredRowIds).toEqual(backendContractRequiredRowIds);
    expect(plan.summary.legacyDiagnosticRetainedRowIds).toEqual(legacyDiagnosticRetainedRowIds);
    expect(plan.summary.mixedAuthorityBlockedRowIds).toEqual(mixedAuthorityBlockedRowIds);

    for (const rowId of canonicalPrimaryOverrideRowIds) {
      expect(guardedResult![rowId as keyof typeof guardedResult]).not.toBe(legacy[rowId as keyof typeof legacy]);
    }

    for (const rowId of [
      ...backendContractRequiredRowIds,
      ...legacyDiagnosticRetainedRowIds,
    ]) {
      expect(guardedResult![rowId as keyof typeof guardedResult]).toBe(legacy[rowId as keyof typeof legacy]);
    }
  });

  it("guarded calculation result boundary metadata alanlari eklemez", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(guardedResult).not.toBeNull();
    for (const key of boundaryMetadataKeys) {
      expect(guardedResult).not.toHaveProperty(key);
    }
  });

  it("runtime overwrite alani TM14 boundary plan ile birebir anlasir", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);
    const plan = buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: Boolean(guardedResult) });

    expect(guardedResult).not.toBeNull();

    const overwrittenRows = Object.keys(guardedResult!).filter((rowId) =>
      guardedResult![rowId as keyof typeof guardedResult] !== legacy[rowId as keyof typeof legacy],
    );
    expect(overwrittenRows.sort()).toEqual([...plan.summary.canonicalPrimaryOverrideRowIds].sort());

    for (const rowId of [
      ...plan.summary.backendContractRequiredRowIds,
      ...plan.summary.legacyDiagnosticRetainedRowIds,
    ]) {
      expect(guardedResult![rowId as keyof typeof guardedResult]).toBe(legacy[rowId as keyof typeof legacy]);
    }
    expect(guardedResult!.mahsupDetaylari).toBe(legacy.mahsupDetaylari);
    expect(guardedResult!.faizSegmentleri).toBe(legacy.faizSegmentleri);
    expect(guardedResult!.tahsilOranlari).toBe(legacy.tahsilOranlari);
  });

  it("runtime boundary wrapper guarded calculation result ile boundary plan'i birlikte tasir", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const guardedResult = buildGuardedPrimaryCalculationResult(legacy, report, decision);
    const wrapper = buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision);

    expect(wrapper.guardedPrimaryHesap).toEqual(guardedResult);
    expect(wrapper.boundaryPlan).toEqual(
      buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true }),
    );
    expect(Object.keys(wrapper).sort()).toEqual(["boundaryPlan", "guardedPrimaryHesap"]);
  });

  it("runtime boundary wrapper inputlari mutate etmez", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const legacyBefore = JSON.parse(JSON.stringify(legacy));
    const reportBefore = JSON.parse(JSON.stringify(report));
    const decisionBefore = JSON.parse(JSON.stringify(decision));

    buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision);

    expect(legacy).toEqual(legacyBefore);
    expect(report).toEqual(reportBefore);
    expect(decision).toEqual(decisionBefore);
  });

  it("runtime boundary wrapper ayni input icin deterministic kalir", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });

    expect(buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision)).toEqual(
      buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision),
    );
  });

  it("runtime boundary wrapper fallback modda legacy boundary plan dondurur", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: false });
    const wrapper = buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision);

    expect(wrapper.guardedPrimaryHesap).toBeNull();
    expect(wrapper.boundaryPlan).toEqual(
      buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: false }),
    );
    expect(wrapper.boundaryPlan.guardedPrimarySelected).toBe(false);
    expect(wrapper.boundaryPlan.summary.canonicalPrimaryOverrideRowIds).toEqual([]);
    expect(wrapper.boundaryPlan.summary.fallbackLegacyRowIds).toEqual([
      ...canonicalPrimaryOverrideRowIds,
      ...backendContractRequiredRowIds,
      ...legacyDiagnosticRetainedRowIds,
      ...mixedAuthorityBlockedRowIds,
    ]);
  });

  it("runtime boundary wrapper guarded selected modda TM15 row setlerini korur", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const wrapper = buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision);

    expect(wrapper.guardedPrimaryHesap).not.toBeNull();
    expect(wrapper.boundaryPlan.guardedPrimarySelected).toBe(true);
    expect(wrapper.boundaryPlan.summary.canonicalPrimaryOverrideRowIds).toEqual(canonicalPrimaryOverrideRowIds);
    expect(wrapper.boundaryPlan.summary.backendContractRequiredRowIds).toEqual(backendContractRequiredRowIds);
    expect(wrapper.boundaryPlan.summary.legacyDiagnosticRetainedRowIds).toEqual(legacyDiagnosticRetainedRowIds);
    expect(wrapper.boundaryPlan.summary.mixedAuthorityBlockedRowIds).toEqual(mixedAuthorityBlockedRowIds);
    expect(wrapper.boundaryPlan.summary.fallbackLegacyRowIds).toEqual([]);
  });

  it("runtime boundary wrapper guarded result shape'ine boundary metadata eklemez", () => {
    const legacy = makeMixedAuthorityLegacySummary();
    const report = makeMixedAuthorityCanonicalReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true });
    const wrapper = buildGuardedPrimaryCalculationResultWithBoundaryPlan(legacy, report, decision);

    expect(wrapper.guardedPrimaryHesap).not.toBeNull();
    for (const key of boundaryMetadataKeys) {
      expect(wrapper.guardedPrimaryHesap).not.toHaveProperty(key);
    }
  });

  it("boundary plan ayni input icin deterministic kalir", () => {
    expect(buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true })).toEqual(
      buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: true }),
    );
    expect(buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: false })).toEqual(
      buildGuardedSummaryRuntimeBoundaryPlan({ guardedPrimarySelected: false }),
    );
  });
});
describe("BalanceShadowDiffPanel", () => {
  it("kapaliyken render ve fetch yapmaz", () => {
    render(<BalanceShadowDiffPanel caseId="case-1" enabled={false} />);

    expect(screen.queryByTestId("balance-shadow-diff-panel")).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("caseId yoksa acik olsa bile fetch yapmaz", () => {
    render(<BalanceShadowDiffPanel caseId="" enabled />);

    expect(screen.getByTestId("balance-shadow-diff-panel")).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("acikken dogru endpoint'i cagirir ve non-authoritative etiketleri gosterir", async () => {
    apiGet.mockResolvedValue({ data: makeReport() });

    render(<BalanceShadowDiffPanel caseId="case-1" enabled asOfDate="2026-06-24" />);

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/interest-engine/case/case-1/balance/display/shadow-diff?asOfDate=2026-06-24",
      ),
    );
    expect(await screen.findByText("Shadow Balance Diff")).toBeInTheDocument();
    expect(screen.getByText("audit only")).toBeInTheDocument();
    expect(screen.getByText("Not used as legal balance")).toBeInTheDocument();
    expect(screen.getByText("Primary display remains calculation-summary")).toBeInTheDocument();
    expect(screen.getByText("Canonical display is shadow evidence only")).toBeInTheDocument();
    expect(screen.getByText("Cutover readiness is audit evidence only")).toBeInTheDocument();
    expect(screen.getByText("Primary display unchanged: true")).toBeInTheDocument();
  });

  it("canonicalSummaryRows shadow metadata BalanceShadowDiffPanel render yuzeyine sizmaz", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        canonicalSummaryRows: unsupportedCanonicalSummaryRows(),
      }),
    });

    render(<BalanceShadowDiffPanel caseId="case-1" enabled />);

    expect(await screen.findByText("Shadow Balance Diff")).toBeInTheDocument();
    expect(await screen.findByText("audit only")).toBeInTheDocument();
    expect(await screen.findByText("Primary display unchanged: true")).toBeInTheDocument();

    const panelText = screen.getByTestId("balance-shadow-diff-panel").textContent ?? "";
    expect(panelText).not.toContain("canonicalSummaryRows");
    expect(panelText).not.toContain("canonical-summary-rows.shadow-status.v1");
    expect(panelText).not.toContain("UNSUPPORTED");
    expect(panelText).not.toContain("tazminat");
    expect(panelText).not.toContain("komisyon");
    expect(panelText).not.toContain("takipOncesiFaiz");
  });

  it("shadow degeri farkli olsa bile primary HesapOzetiPanel legacy summary degerini korur", async () => {
    apiGet.mockResolvedValue({ data: makeReport() });

    render(
      <>
        <HesapOzetiPanel caseId="case-1" />
        <BalanceShadowDiffPanel caseId="case-1" enabled />
      </>,
    );

    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/interest-engine/case/case-1/balance/display/shadow-diff",
      ),
    );
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("₺980,00")).length).toBeGreaterThan(0);
  });

  it("HesapOzetiPanel loading, error ve empty states render etmeye devam eder", () => {
    useCaseCalculationMock.mockReturnValueOnce({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    const { rerender } = render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.getByText(/Hesaplan/)).toBeInTheDocument();

    useCaseCalculationMock.mockReturnValueOnce({
      data: null,
      loading: false,
      error: "boom",
      refetch: vi.fn(),
    });
    rerender(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar Dene" })).toBeInTheDocument();

    useCaseCalculationMock.mockReturnValueOnce({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.getByText(/alacak/)).toBeInTheDocument();
  });

  it("guarded primary pilot malformed displayed canonical amount durumunda legacy fallback degerlerini korur", async () => {
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.canonical!.interestAmount = Number.POSITIVE_INFINITY;
    apiGet.mockResolvedValue({ data: report });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    // "Legacy calculation-summary fallback" basligi shadow-diff fetch'i PENDING iken de gorunur;
    // reason kodlari ise ancak fetch cozulunce dolar. Bu yuzden basligi beklemek tek basina
    // yetmez — reason metni populate olana kadar waitFor ile bekle (render timing flake'ini giderir).
    await waitFor(() =>
      expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent(
        "CANONICAL_DISPLAYED_AMOUNT_UNAVAILABLE",
      ),
    );
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });
  it("guarded primary pilot malformed display field durumunda crash olmadan legacy fallback degerlerini korur", async () => {
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.canonical!.outstandingAmount = Number.POSITIVE_INFINITY;
    apiGet.mockResolvedValue({ data: report });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    // Ayni race: fallback basligi PENDING render'da da gorunur, reason metni sonradan dolar.
    await waitFor(() =>
      expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent(
        "CANONICAL_PRINCIPAL_UNAVAILABLE",
      ),
    );
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });

  it("guarded primary pilot flag on ve eligible evidence varsa canonical candidate degerlerini gosterir", async () => {
    apiGet.mockResolvedValue({ data: makeEligibleGuardedPrimaryReport() });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/interest-engine/case/case-1/balance/display/shadow-diff?asOfDate=2026-06-24",
      ),
    );
    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("ELIGIBLE");
    expect(screen.getAllByText("980,00 TL").length).toBeGreaterThan(0);
    expect(screen.queryByText("1.234,00 TL")).not.toBeInTheDocument();
  });

  it("guarded primary pilot COSTS_DELTA RED (tek basina) durumunda artik yanlislikla ELIGIBLE gorunmez -- partial-canonical Turkce authority copy + satir etiketleri gosterir (ALC-AUTH-4A-IMPL)", async () => {
    // Bu, ALC-AUTH-4A GO-ANALYZE'in bulguya isaret ettigi TAM senaryo: risk sadece
    // buildGuardedPrimaryCalculationResult() icinde ele alinip decision/banner katmanina hic
    // yansimiyordu -- bu test o boslugu (sifir render-seviyesi kapsam) kapatiyor.
    const report = makeEligibleGuardedPrimaryReport();
    report.totals.canonical!.totalPaidAmount = 100; // KALAN BORC blogunu render ettirmek icin
    report.totals.diffs = [
      {
        code: "COSTS_DELTA",
        label: "Legacy icraMasraflari vs canonical costs",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.icraMasraflari",
        canonicalField: "canonical.costs",
        legacyAmount: 500,
        canonicalAmount: 0,
        delta: -500,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Legacy masraf hesaplari ile canonical case-level cost projection ayni otorite degildir.",
      },
    ];
    apiGet.mockResolvedValue({ data: report });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/interest-engine/case/case-1/balance/display/shadow-diff?asOfDate=2026-06-24",
      ),
    );
    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();

    // Ham diagnostic satiri DEGISMEDI (additive, Fork 2) -- suppress kodu hala orada gorunur.
    await waitFor(() =>
      expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent(
        "COST_ATTORNEY_FEE_SUPPRESSED",
      ),
    );

    // YENI: Turkce authority copy artik "ELIGIBLE" yerine kismi-durumu acikliyor.
    await waitFor(() =>
      expect(screen.getByTestId("guarded-primary-display-authority-copy")).toHaveTextContent(
        "Masraf/vekalet verisi tamamlanmadığı için Toplam Borç, Son Borç ve Kalan Borç mevcut hesaplama ile gösterilmektedir",
      ),
    );
    expect(screen.getByTestId("guarded-primary-display-authority-copy").textContent).not.toContain("ELIGIBLE");

    // YENI: TOPLAM BORC/SON BORC/KALAN BORC yaninda "(mevcut hesaplama)" satir etiketi.
    expect(screen.getByTestId("guarded-primary-partial-label-toplam-borc")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-partial-label-son-borc")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-partial-label-kalan-borc")).toBeInTheDocument();

    // toplamBorc/sonBorc/kalanBorc LEGACY degerini gosterir (legacyCalculationSummary: 1234);
    // asilAlacak/takipTutari ise canonical'a gecmis olmali (980).
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("980,00 TL").length).toBeGreaterThan(0);
  });

  it("guarded primary pilot COSTS_DELTA RED + gercek backend blocker birlikteyken safe default korunur: tam legacy fallback, partial etiket YOK (ALC-AUTH-4A-IMPL)", async () => {
    // Owner karari: partial-canonical istisnasi YALNIZ suppress TEK BASINA (baska hicbir
    // engelleyici reasonCode yokken) gecerli. Burada COST_ATTORNEY_FEE_SUPPRESSED'e ek olarak
    // gercek bir backend blocker (CURRENCY_MISMATCH) de varsa PR #942'nin safe default'u
    // (tam legacy, guarded primary hic secilmez) DEGISMEDEN korunmali.
    const report = makeEligibleGuardedPrimaryReport();
    report.cutoverReadiness = {
      safeForPrimaryDisplay: false,
      safeForOptInShadow: true,
      blockers: ["CURRENCY_MISMATCH"],
      nextRequiredEvidence: [],
    };
    report.totals.diffs = [
      {
        code: "COSTS_DELTA",
        label: "Legacy icraMasraflari vs canonical costs",
        classification: "EXPECTED_CANONICAL_DIVERGENCE",
        legacyField: "legacy.icraMasraflari",
        canonicalField: "canonical.costs",
        legacyAmount: 500,
        canonicalAmount: 0,
        delta: -500,
        deltaPercent: -100,
        status: "MAJOR_DELTA",
        severity: "RED",
        explanation: "Legacy masraf hesaplari ile canonical case-level cost projection ayni otorite degildir.",
      },
    ];
    apiGet.mockResolvedValue({ data: report });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    await waitFor(() => {
      const reasons = screen.getByTestId("guarded-primary-display-reasons").textContent ?? "";
      expect(reasons).toContain("CURRENCY_MISMATCH");
      expect(reasons).toContain("COST_ATTORNEY_FEE_SUPPRESSED");
    });
    expect(screen.queryByTestId("guarded-primary-partial-label-toplam-borc")).not.toBeInTheDocument();
    expect(screen.queryByTestId("guarded-primary-partial-label-son-borc")).not.toBeInTheDocument();
    expect(screen.queryByTestId("guarded-primary-partial-label-kalan-borc")).not.toBeInTheDocument();
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });

  it("canonicalSummaryRows shadow metadata guarded primary render output'una sizmaz", async () => {
    apiGet.mockResolvedValue({
      data: {
        ...makeEligibleGuardedPrimaryReport(),
        canonicalSummaryRows: unsupportedCanonicalSummaryRows(),
      },
    });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("ELIGIBLE");
    expect(screen.getAllByText("980,00 TL").length).toBeGreaterThan(0);
    expect(screen.queryByText("1.234,00 TL")).not.toBeInTheDocument();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toContain("canonical-summary-rows.shadow-status.v1");
    expect(renderedText).not.toContain("UNSUPPORTED");
    expect(renderedText).not.toContain("tazminat");
    expect(renderedText).not.toContain("komisyon");
    expect(renderedText).not.toContain("takipOncesiFaiz");
    expect(screen.queryByText("Komisyon")).not.toBeInTheDocument();
  });

  it("guarded primary pilot mixed authority satirlarini current behavior olarak karakterize eder", async () => {
    useCaseCalculationMock.mockReturnValue({
      data: makeMixedAuthorityLegacySummary(),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    apiGet.mockResolvedValue({ data: makeMixedAuthorityCanonicalReport() });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("ELIGIBLE");

    expect(screen.getAllByText("10.001,00 TL").length).toBeGreaterThan(0);
    expect(screen.getByText("20.002,00 TL")).toBeInTheDocument();
    expect(screen.getAllByText("30.003,00 TL").length).toBeGreaterThan(0);
    expect(screen.getByText("- 4.004,00 TL")).toBeInTheDocument();
    expect(screen.getByText("505,00 TL")).toBeInTheDocument();
    // ALC-AUTH-1A: icraMasraflari/vekaletUcreti B1 kapsami disinda -- legacy (90.002/90.003)
    // gorunur kalir, canonical (606/707) DEGIL.
    expect(screen.queryByText("606,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("707,00 TL")).not.toBeInTheDocument();
    expect(screen.getByText("90.002,00 TL")).toBeInTheDocument();
    expect(screen.getByText("90.003,00 TL")).toBeInTheDocument();

    expect(screen.queryByText("90.001,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("90.005,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("90.006,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("90.007,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("90.008,00 TL")).not.toBeInTheDocument();

    expect(screen.getByText("111,00 TL")).toBeInTheDocument();
    expect(screen.getByText("222,00 TL")).toBeInTheDocument();
    expect(screen.getByText("333,00 TL")).toBeInTheDocument();
    expect(screen.getByText("444,00 TL")).toBeInTheDocument();
    expect(screen.getByText("555,00 TL")).toBeInTheDocument();
    expect(screen.getByText("666,00 TL")).toBeInTheDocument();
    expect(screen.getByText("777,00 TL")).toBeInTheDocument();
    expect(screen.getByText("888,00 TL")).toBeInTheDocument();
    expect(screen.getByText("999,00 TL")).toBeInTheDocument();
    expect(screen.getByText("1.001,00 TL")).toBeInTheDocument();
    expect(screen.getByText("1.002,00 TL")).toBeInTheDocument();
    expect(screen.getByText("%legacy oran")).toBeInTheDocument();
    expect(screen.getByText("1.003,00 TL")).toBeInTheDocument();
    expect(screen.getByText(/2026-06-10/)).toBeInTheDocument();
    expect(screen.getByText("Masraf: 124,00 TL")).toBeInTheDocument();
    expect(screen.getByText("Vekalet: 125,00 TL")).toBeInTheDocument();
    expect(screen.getByText(/126,00 TL/)).toBeInTheDocument();
    expect(screen.getByText(/127,00 TL/)).toBeInTheDocument();
    expect(screen.getByText("Anapara: 128,00 TL")).toBeInTheDocument();
    expect(screen.getByText("Kalan Anapara: 129,00 TL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Faiz/ }));

    expect(screen.getByText("1.004,00 TL")).toBeInTheDocument();
    expect(screen.getByText("1.005,00 TL")).toBeInTheDocument();
  });
  it("guarded primary selected yuzeyde canonical ana satirlar ile legacy diagnostic satirlar birlikte kalir", async () => {
    useCaseCalculationMock.mockReturnValue({
      data: makeMixedAuthorityLegacySummary(),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    apiGet.mockResolvedValue({ data: makeMixedAuthorityCanonicalReport() });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("ELIGIBLE");

    expect(screen.getByText(/2026-06-01.*2026-06-24/)).toBeInTheDocument();
    expect(screen.getByText("Asıl Alacak")).toBeInTheDocument();

    for (const canonicalValue of [
      "10.001,00 TL",
      "20.002,00 TL",
      "30.003,00 TL",
      "- 4.004,00 TL",
      "505,00 TL",
    ]) {
      expect(screen.getAllByText(canonicalValue).length).toBeGreaterThan(0);
    }

    // ALC-AUTH-1A: icraMasraflari/vekaletUcreti B1 kapsami disinda -- canonical (606/707) artik
    // gorunmez, legacy (90.002/90.003) korunur.
    expect(screen.queryByText("606,00 TL")).not.toBeInTheDocument();
    expect(screen.queryByText("707,00 TL")).not.toBeInTheDocument();
    expect(screen.getAllByText("90.002,00 TL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("90.003,00 TL").length).toBeGreaterThan(0);

    for (const replacedLegacyValue of [
      "90.001,00 TL",
      "90.004,00 TL",
      "90.005,00 TL",
      "90.006,00 TL",
      "90.007,00 TL",
      "90.008,00 TL",
      "90.009,00 TL",
    ]) {
      expect(screen.queryByText(replacedLegacyValue)).not.toBeInTheDocument();
    }

    for (const legacyOnlyValue of [
      "111,00 TL",
      "222,00 TL",
      "333,00 TL",
      "444,00 TL",
      "555,00 TL",
      "666,00 TL",
      "777,00 TL",
      "888,00 TL",
      "999,00 TL",
      "1.001,00 TL",
      "1.002,00 TL",
      "1.003,00 TL",
    ]) {
      expect(screen.getByText(legacyOnlyValue)).toBeInTheDocument();
    }

    expect(screen.getByText("%legacy oran")).toBeInTheDocument();
    expect(screen.getByText(/2026-06-10/)).toBeInTheDocument();
    expect(screen.getByText("Masraf: 124,00 TL")).toBeInTheDocument();
    expect(screen.getByText("Vekalet: 125,00 TL")).toBeInTheDocument();
    expect(screen.getByText(/126,00 TL/)).toBeInTheDocument();
    expect(screen.getByText(/127,00 TL/)).toBeInTheDocument();
    expect(screen.getByText("Anapara: 128,00 TL")).toBeInTheDocument();
    expect(screen.getByText("Kalan Anapara: 129,00 TL")).toBeInTheDocument();
    expect(screen.queryByText(/Faiz Matrah/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Faiz/ }));

    expect(screen.getByText("1.004,00 TL")).toBeInTheDocument();
    expect(screen.getByText("1.005,00 TL")).toBeInTheDocument();
  });
  it("guarded primary pilot hard no-go diagnostic varsa legacy fallback degerlerini korur", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        diagnostics: [
          {
            code: "FINAL_DEBT_STATES_MISSING",
            classification: "BLOCKER",
            severity: "RED",
            message: "Final debt states missing.",
          },
        ],
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: true,
          blockers: ["FINAL_DEBT_STATES_MISSING"],
          nextRequiredEvidence: [],
        },
        provenance: {
          ...makeReport().provenance,
          finalDebtStatesAvailable: false,
        },
      }),
    });

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    expect(screen.getByTestId("guarded-primary-display-reasons").textContent).toContain("FINAL_DEBT_STATES_MISSING");
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });

  it("guarded primary pilot shadow source failure durumunda legacy fallback degerlerini korur", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    apiGet.mockRejectedValue(new Error("shadow unavailable"));

    render(
      <HesapOzetiPanel
        caseId="case-1"
        guardedPrimaryPilotEnabled
        guardedPrimaryPilotAsOfDate="2026-06-24"
      />,
    );

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("SHADOW_OR_CANONICAL_SOURCE_FAILURE");
    });
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });

  it("shadow endpoint hata verirse audit error gosterir ve primary display kirilmaz", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    apiGet.mockRejectedValue(new Error("shadow unavailable"));

    render(
      <>
        <HesapOzetiPanel caseId="case-1" />
        <BalanceShadowDiffPanel caseId="case-1" enabled />
      </>,
    );

    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    expect(await screen.findByText("shadow unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });

  it("RED/BLOCKER durumunu blocker olarak gosterir ama primary display'e yazmaz", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        comparability: {
          comparable: true,
          classification: "BLOCKER",
          severity: "RED",
          blockers: [
            {
              code: "FINAL_DEBT_STATES_MISSING",
              classification: "BLOCKER",
              severity: "RED",
              message: "Final debt states missing.",
            },
          ],
          warnings: [],
        },
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: true,
          blockers: ["FINAL_DEBT_STATES_MISSING"],
          nextRequiredEvidence: [],
        },
        diagnostics: [
          {
            code: "FINAL_DEBT_STATES_MISSING",
            classification: "BLOCKER",
            severity: "RED",
            message: "Final debt states missing.",
          },
        ],
      }),
    });

    render(
      <>
        <HesapOzetiPanel caseId="case-1" />
        <BalanceShadowDiffPanel caseId="case-1" enabled />
      </>,
    );

    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    expect(await screen.findByText("Blockers")).toBeInTheDocument();
    expect(screen.getAllByText("FINAL_DEBT_STATES_MISSING").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });

  it("currency/context mismatch varsa karsilastirilabilir degil diye gosterir", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        currency: null,
        comparability: {
          comparable: false,
          classification: "CURRENCY_MISMATCH",
          severity: "RED",
          blockers: [
            {
              code: "CURRENCY_MISMATCH",
              classification: "CURRENCY_MISMATCH",
              severity: "RED",
              message: "Currencies differ.",
            },
          ],
          warnings: [],
        },
        cutoverReadiness: {
          safeForPrimaryDisplay: false,
          safeForOptInShadow: false,
          blockers: ["CURRENCY_MISMATCH"],
          nextRequiredEvidence: [],
        },
        diagnostics: [
          {
            code: "CURRENCY_MISMATCH",
            classification: "CURRENCY_MISMATCH",
            severity: "RED",
            message: "Currencies differ.",
          },
        ],
      }),
    });

    render(<BalanceShadowDiffPanel caseId="case-1" enabled />);

    expect((await screen.findAllByText("CURRENCY_MISMATCH")).length).toBeGreaterThan(0);
    expect(screen.getByText("no")).toBeInTheDocument();
    expect(screen.getByText("Amount comparison blocked by context or currency mismatch.")).toBeInTheDocument();
    expect(screen.queryByText("Visible diffs")).not.toBeInTheDocument();
  });

  it("HELD ve OVERPAYMENT_BLOCKED bilgisini settlement gibi degil audit wording ile gosterir", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        totals: {
          ...makeReport().totals,
          canonical: {
            ...makeReport().totals.canonical!,
            heldOverpaymentAmount: 75,
          },
        },
        bucketDiffs: [
          {
            code: "HELD_OVERPAYMENT_DIFF",
            label: "Held overpayment",
            classification: "EXPECTED_CANONICAL_DIVERGENCE",
            legacyField: "none",
            canonicalField: "totals.heldOverpaymentAmount",
            legacyAmount: null,
            canonicalAmount: 75,
            delta: null,
            deltaPercent: null,
            status: "CANONICAL_ONLY",
            severity: "YELLOW",
            explanation: "Held overpayment is separate evidence.",
            bucket: "HELD_OVERPAYMENT",
            canonicalDisplayable: false,
          },
        ],
        diagnostics: [
          {
            code: "OVERPAYMENT_BLOCKED",
            classification: "CANONICAL_UNSAFE",
            severity: "YELLOW",
            message: "Blocked overpayment is diagnostic evidence.",
          },
          {
            code: "RESTRICTED_PAYMENT_DISPLAY_UNSAFE",
            classification: "CANONICAL_UNSAFE",
            severity: "YELLOW",
            message: "Restricted payment scope is unresolved.",
          },
        ],
      }),
    });

    render(<BalanceShadowDiffPanel caseId="case-1" enabled />);

    expect((await screen.findAllByText("Held outside debt total")).length).toBeGreaterThan(0);
    expect(screen.getByText("Not subtracted from outstanding; not applied to another scope.")).toBeInTheDocument();
    expect(screen.getByText("Separate evidence; not subtracted from outstanding or applied to another scope.")).toBeInTheDocument();
    expect(screen.getByText("OVERPAYMENT_BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("Blocked allocation evidence")).toBeInTheDocument();
    expect(screen.getByText("Diagnostic only; not a debt, payment, or unrestricted overpayment.")).toBeInTheDocument();
    expect(screen.getByText("RESTRICTED_PAYMENT_DISPLAY_UNSAFE")).toBeInTheDocument();
    expect(screen.getByText("Restricted payment scope unresolved")).toBeInTheDocument();
    expect(screen.getByText("PaymentDesignation is required before this can be shown as surplus or applied elsewhere.")).toBeInTheDocument();
    const panelText = screen.getByTestId("balance-shadow-diff-panel").textContent ?? "";
    expect(panelText).not.toContain("debt closed");
    expect(panelText).not.toContain("paid");
    expect(panelText).not.toContain("applied to debt");
    expect(panelText).not.toContain("confirmed overpayment");
    expect(panelText).not.toContain("settled");
    expect(panelText).not.toContain("refund available");
    expect(panelText).not.toContain("transfer available");
    expect(panelText).not.toContain("borc kapandi");
    expect(panelText).not.toContain("borctan dusuldu");
    expect(panelText).not.toContain("odendi");
    expect(panelText).not.toContain("mahsup edildi");
    expect(panelText).not.toContain("kesin fazla tahsilat");
    expect(panelText).not.toContain("fazla tahsilat olustu");
    expect(panelText).not.toContain("dosya kapandi");
    expect(panelText).not.toContain("alacak kapandi");
    expect(panelText).not.toContain("tahsilat islendi");
    expect(panelText).not.toContain("serbest fazla tahsilat");
    expect(screen.getAllByText("₺75,00").length).toBeGreaterThan(0);
  });

  it("NAFAKA principal risk diagnostic'ini audit evidence olarak gosterir", async () => {
    apiGet.mockResolvedValue({
      data: makeReport({
        diagnostics: [
          {
            code: "NAFAKA_PRINCIPAL_DISPLAY_RISK",
            classification: "LEGACY_AUTHORITY_RISK",
            severity: "YELLOW",
            message: "Nafaka principal display risk.",
          },
        ],
      }),
    });

    render(
      <>
        <HesapOzetiPanel caseId="case-1" />
        <BalanceShadowDiffPanel caseId="case-1" enabled />
      </>,
    );

    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
    expect(await screen.findByText("NAFAKA_PRINCIPAL_DISPLAY_RISK")).toBeInTheDocument();
    expect(screen.getAllByText("1.234,00 TL").length).toBeGreaterThan(0);
  });
});
