/**
 * K3-L KP-7 / KP-3 (owner kararı 2026-10-01) — hesap özeti tahsilat gösterimi:
 *  - Kanonik pilot: "Toplam tahsilat" = dosyaya fiilen giren (grossReceivedAmount); "Borca uygulanan" ve "Dağıtım bekleyen"
 *    ayrı satır; aynı para iki kez sayılmaz (sunucu bloğu tutarsızsa kanonik gösterilmez); kullanılan hesap tarihi yazılır.
 *  - Farklı tarih kapsamındaki rapor legacy özetle birleştirilmez (AS_OF_DATE_MISMATCH / AS_OF_DATE_UNVERIFIED).
 *  - Legacy panel: "Tahsilat Düşümü" tarih süzgeçsiz kalır, hesap tarihinden sonraki kısım ayrıca yazılır.
 *  - KP-3: talep edilmiş işlemiş faiz görünür, "hesaba dahil edilmedi" açıkça yazılır.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HesapOzetiPanel } from "@/components/finance/HesapOzetiPanel";
import {
  buildGuardedPrimaryCalculationResult,
  canonicalReceipts,
  evaluateGuardedPrimaryDisplayPilot,
} from "@/lib/guarded-primary-display";
import { apiClient } from "@/lib/api/client";
import type { BalanceDisplayShadowDiffReport } from "@/lib/api/balance-shadow-diff";
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

const legacy = {
  caseId: "case-1",
  hesapTarihi: "2026-06-24",
  takipTarihi: "2026-06-01",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 1000,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 1000,
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
  toplamBorc: 1000,
  sonBorc: 1000,
  toplamTahsilat: 1500,
  kalanBorc: -500,
  kalanAnapara: 1000,
  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [],
};

function receipts(applied: number, unapplied: number, held: number, asOfDate = "2026-06-24") {
  return {
    currency: "TRY",
    asOfDate,
    scope: "ON_OR_BEFORE_AS_OF_DATE" as const,
    receivedAmount: applied + unapplied + held,
    paymentAmount: applied + unapplied,
    allocationHeldAmount: held,
    appliedToDebtAmount: applied,
    unappliedPaymentAmount: unapplied,
    notAppliedAmount: unapplied + held,
    afterAsOfExcludedAmount: 0,
    appliedScope: "PRINCIPAL_AND_INTEREST_ONLY" as const,
  };
}

/** Uygun (eligible) kanonik rapor: 1.000 borca uygulanan, 200 fazla ödeme, 300 mahsubu bekleyen → Toplam 1.500. */
function eligibleReport(): BalanceDisplayShadowDiffReport {
  return {
    tenantId: "tenant-1",
    caseId: "case-1",
    currency: "TRY",
    asOfDate: "2026-06-24",
    generatedAt: "2026-06-24T10:00:00.000Z",
    sourceVersion: "test",
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
    comparability: { comparable: true, classification: "EXACT_MATCH", severity: "GREEN", blockers: [], warnings: [] },
    totals: {
      canonical: {
        currency: "TRY",
        totalDebtAmount: 1000,
        totalPaidAmount: 1000,
        outstandingAmount: 0,
        interestAmount: 0,
        costsAmount: 0,
        attorneyFeeAmount: 0,
        allocatedPaidAmount: 1000,
        grossReceivedAmount: 1500,
        receipts: receipts(1000, 200, 300),
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
        legacyAmount: 1000,
        canonicalAmount: 0,
        delta: 0,
        deltaPercent: 0,
        status: "MATCH",
        severity: "GREEN",
        explanation: "",
        bucket: "PRINCIPAL",
        canonicalDisplayable: true,
      },
    ],
    diagnostics: [],
    cutoverReadiness: { safeForPrimaryDisplay: true, safeForOptInShadow: true, blockers: [], nextRequiredEvidence: [] },
    provenance: {
      legacyCalculationSummaryUsed: true,
      canonicalBalanceDisplayUsed: true,
      computeBalanceUsed: true,
      finalDebtStatesAvailable: true,
      claimItemCollectedAmountUsedAsAuthority: false,
      overpaymentHeldAvailable: true,
      blockedOverpaymentDiagnosticsAvailable: false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useCaseCalculationMock.mockReturnValue({ data: legacy, loading: false, error: null, refetch: vi.fn() });
});

describe("K3-L KP-7: kanonik pilot tahsilat eşlemesi", () => {
  it("Toplam tahsilat = dosyaya giren (1.500); Borca uygulanan (1.000) ve Dağıtım bekleyen (500) ayrı; hesap tarihi taşınır", () => {
    const report = eligibleReport();
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true, legacyAsOfDate: "2026-06-24" });
    const result = buildGuardedPrimaryCalculationResult(legacy, report, decision);

    expect(decision).toEqual({ primarySource: "CANONICAL_PRIMARY_CANDIDATE", reasonCodes: [] });
    expect(result!.toplamTahsilat).toBe(1500);
    expect(result!.tahsilatGosterimi).toEqual({
      hesapTarihi: "2026-06-24",
      paraBirimi: "TRY",
      toplamTahsilat: 1500,
      borcaUygulanan: 1000,
      dagitimBekleyen: 500,
      mahsubuBekleyen: 300,
      hesapTarihindenSonra: 0,
      masrafFeriUyarisi: false,
    });
  });

  it("rapor başka hesap tarihine aitse legacy özetle birleştirilmez (AS_OF_DATE_MISMATCH)", () => {
    const report = eligibleReport();
    report.asOfDate = "2026-06-01";
    report.totals.canonical!.receipts = receipts(1000, 200, 300, "2026-06-01");
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true, legacyAsOfDate: "2026-06-24" });

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("AS_OF_DATE_MISMATCH");
    // Savunma: karar elle kurgulansa da farklı tarihli rapor birleştirilmez
    expect(buildGuardedPrimaryCalculationResult(legacy, report, {
      primarySource: "CANONICAL_PRIMARY_CANDIDATE",
      reasonCodes: [],
    })).toBeNull();
  });

  it("raporda hesap tarihi yoksa doğrulanamaz → legacy (AS_OF_DATE_UNVERIFIED)", () => {
    const report = eligibleReport();
    delete report.asOfDate;
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true, legacyAsOfDate: "2026-06-24" });

    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(["AS_OF_DATE_UNVERIFIED", "CANONICAL_RECEIPTS_UNAVAILABLE"]));
  });

  it.each([
    ["Toplam ≠ Uygulanan + Bekleyen", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.receipts!.notAppliedAmount = 400; }],
    ["Toplam tahsilat üst toplamla uyuşmuyor", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.grossReceivedAmount = 1400; }],
    ["Borca uygulanan üst toplamla uyuşmuyor", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.totalPaidAmount = 1200; }],
    ["blok farklı tarihli", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.receipts!.asOfDate = "2026-06-23"; }],
    ["blok yok", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.receipts = null; }],
    ["uygulanan bilinmiyor", (r: BalanceDisplayShadowDiffReport) => { r.totals.canonical!.receipts!.appliedToDebtAmount = null; }],
  ])("tahsilat bloğu tutarsız/eksik (%s) → kanonik tahsilat gösterilmez, legacy", (_label, mutate) => {
    const report = eligibleReport();
    mutate(report);
    const decision = evaluateGuardedPrimaryDisplayPilot(report, { featureFlagEnabled: true, legacyAsOfDate: "2026-06-24" });

    expect(canonicalReceipts(report)).toBeNull();
    expect(decision.primarySource).toBe("LEGACY_CALCULATION_SUMMARY");
    expect(decision.reasonCodes).toContain("CANONICAL_RECEIPTS_UNAVAILABLE");
  });
});

describe("K3-L KP-7 / KP-3: HesapOzetiPanel", () => {
  it("pilot: Toplam tahsilat / Borca uygulanan / Dağıtım bekleyen + mahsubu bekleyen satırı ve hesap tarihi; tek bekletme kutusu", async () => {
    useCaseCalculationMock.mockReturnValue({
      data: { ...legacy, mahsubuBekleyenTahsilat: 300 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    apiGet.mockResolvedValue({ data: eligibleReport() });

    render(<HesapOzetiPanel caseId="case-1" guardedPrimaryPilotEnabled guardedPrimaryPilotAsOfDate="2026-06-24" />);

    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    expect(screen.getByTestId("tahsilat-gosterimi-kapsam")).toHaveTextContent("2026-06-24");
    expect(screen.getByTestId("tahsilat-toplam")).toHaveTextContent("1.500,00 TL");
    expect(screen.getByTestId("tahsilat-borca-uygulanan")).toHaveTextContent("- 1.000,00 TL");
    expect(screen.getByTestId("tahsilat-dagitim-bekleyen")).toHaveTextContent("500,00 TL");
    expect(screen.getByTestId("tahsilat-mahsubu-bekleyen")).toHaveTextContent("300,00 TL");
    // Legacy "Tahsilat Düşümü" ve tarih süzgeçsiz ikinci bekletme kutusu pilotta yan yana konmaz
    expect(screen.queryByText("Tahsilat Düşümü")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hesap-mahsubu-bekleyen-tahsilat")).not.toBeInTheDocument();
  });

  it("pilot rapor farklı tarihliyse legacy satırlar korunur ve neden görünür", async () => {
    const report = eligibleReport();
    report.asOfDate = "2026-06-01";
    report.totals.canonical!.receipts = receipts(1000, 200, 300, "2026-06-01");
    apiGet.mockResolvedValue({ data: report });

    render(<HesapOzetiPanel caseId="case-1" guardedPrimaryPilotEnabled guardedPrimaryPilotAsOfDate="2026-06-01" />);

    expect(await screen.findByText("Legacy calculation-summary fallback")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("guarded-primary-display-reasons")).toHaveTextContent("AS_OF_DATE_MISMATCH"),
    );
    expect(screen.getByText("Tahsilat Düşümü")).toBeInTheDocument();
    expect(screen.queryByTestId("tahsilat-gosterimi")).not.toBeInTheDocument();
  });

  it("legacy: tarih süzgeçsiz Tahsilat Düşümü'nün hesap tarihinden sonraki kısmı ayrıca yazılır", () => {
    useCaseCalculationMock.mockReturnValue({
      data: { ...legacy, hesapTarihindenSonrakiTahsilat: 250, hesapTarihindenSonrakiTahsilatAdedi: 1 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HesapOzetiPanel caseId="case-1" />);

    expect(screen.getByText("Tahsilat Düşümü")).toBeInTheDocument();
    expect(screen.getByTestId("hesap-tahsilat-tarih-kapsami")).toHaveTextContent("250,00 TL");
    expect(screen.getByTestId("hesap-tahsilat-tarih-kapsami")).toHaveTextContent("2026-06-24");
  });

  it("KP-3: talep edilmiş işlemiş faiz tutarı ve 'hesaba dahil edilmedi' açıkça yazılır; kayıt yoksa satır yok", () => {
    useCaseCalculationMock.mockReturnValue({
      data: {
        ...legacy,
        talepEdilenIslemisFaiz: {
          hesabaDahil: false,
          gerekce: "TALEP_EDILEN_ISLEMIS_FAIZ_HESAPLAMAYA_DAHIL_DEGIL",
          toplamParaBirimiBazinda: { TRY: 500 },
          kalemler: [{ claimItemId: "i1", kalemTuru: "PRE_INTEREST", paraBirimi: "TRY", tutar: 500 }],
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { unmount } = render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.getByTestId("claimed-interest-amount")).toHaveTextContent("500,00 TL");
    expect(screen.getByTestId("claimed-interest-status")).toHaveTextContent("dahil edilmedi");
    unmount();

    useCaseCalculationMock.mockReturnValue({ data: { ...legacy, talepEdilenIslemisFaiz: null }, loading: false, error: null, refetch: vi.fn() });
    render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.queryByTestId("claimed-interest-info")).not.toBeInTheDocument();
  });
});
