import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BalanceShadowDiffPanel } from "@/components/finance/BalanceShadowDiffPanel";
import { HesapOzetiPanel } from "@/components/finance/HesapOzetiPanel";
import {
  getBalanceShadowDisplayDate,
  shouldShowBalanceShadowDisplay,
} from "@/lib/balance-shadow-display";
import { apiClient } from "@/lib/api/client";
import type { BalanceDisplayShadowDiffReport } from "@/lib/api/balance-shadow-diff";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: vi.fn(() => ({
    data: legacyCalculationSummary,
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
  formatTL: (amount: number) =>
    `${amount.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TL`,
  formatDate: (date: string) => date,
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  vi.clearAllMocks();
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
