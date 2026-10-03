import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HesapOzetiPanel } from "@/components/finance";
import { OperationDeck } from "@/components/case-detail/OperationDeck";
import { CaseDebtReport } from "@/components/reports/CaseDebtReport";
import { api } from "@/lib/api";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import { useCaseCalculation } from "@/hooks/useCaseCalculation";

// K3-L D1 — mahsubu BEKLETİLEN tahsilat ekranda "tahsil edildi / borçtan düştü" gibi gösterilmez; ayrı gösterilir.

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    cancelCollection: vi.fn(),
    previewCasePayment: vi.fn(),
    getCollectionDispositionsByCase: vi.fn(),
    postCollectionDisposition: vi.fn(),
  },
}));

vi.mock("@/hooks/useBalanceShadowDiff", () => ({
  useBalanceShadowDiff: vi.fn(),
}));

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: vi.fn(),
  formatTL: (amount: number) =>
    `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
  formatDate: (date: string) => date,
}));

const apiMock = api as unknown as { get: ReturnType<typeof vi.fn> };
const useCaseCalculationMock = useCaseCalculation as unknown as ReturnType<typeof vi.fn>;
const useBalanceShadowDiffMock = useBalanceShadowDiff as unknown as ReturnType<typeof vi.fn>;

function makeCalculationSummary(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "case-1",
    hesapTarihi: "2026-09-30",
    takipTarihi: "2026-09-01",
    kalemTuru: "CEK",
    asilAlacak: 10000,
    tazminat: 0,
    komisyon: 0,
    takipOncesiFaiz: 0,
    takipTutari: 10000,
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
    toplamBorc: 10000,
    sonBorc: 10000,
    toplamTahsilat: 0,
    kalanBorc: 10000,
    kalanAnapara: 10000,
    mahsupDetaylari: [],
    faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
    tahsilOranlari: [],
    ...overrides,
  };
}

function mockCalculation(data: Record<string, unknown>) {
  useCaseCalculationMock.mockReturnValue({ data, loading: false, error: null, refetch: vi.fn() });
  useBalanceShadowDiffMock.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
}

function heldDispositionRecord(allocationHeld: boolean) {
  return {
    id: "disp-1",
    type: "DAGITIM_BEKLIYOR",
    description: "Tahsilat",
    amount: 1500,
    createdAt: "2026-09-20T09:00:00.000Z",
    relatedRequestId: "collection-1",
    disposition: {
      id: "disp-1",
      collectionId: "collection-1",
      status: "HELD_PENDING_DISTRIBUTION",
      totalAmount: "1500.00",
      currency: "TRY",
      beneficiaryScope: "SINGLE_CASE_CLIENT",
      caseClientId: "case-client-1",
      manualReversalRequiredAt: null,
      allocationHeld,
    },
  } as any;
}

describe("K3-L D1 — mahsubu bekleyen tahsilat gösterimi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OperationDeck finans kartı", () => {
    it("bekletilen tahsilat 'Tahsilat' toplamına GİRMEZ, ayrı satırda 'borçtan düşülmedi' notuyla gösterilir", () => {
      render(
        <OperationDeck
          caseId="case-1"
          collectionsSource="READY"
          financeItems={[
            { id: "c1", type: "TAHSILAT", amount: 500, date: "2026-09-20" },
            { id: "c2", type: "TAHSILAT", amount: 1500, date: "2026-09-20", allocationHeld: true },
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Finans/ }));

      // Kartın kendi para biçimi ("500 ₺"): toplam YALNIZ mahsup edilmiş tahsilat
      expect(screen.getByTestId("finance-collection-total").textContent?.trim()).toBe("500 ₺");
      const held = screen.getByTestId("finance-collection-held");
      expect(held.textContent).toContain("1.500 ₺");
      expect(held.textContent).toContain("borçtan düşülmedi");
      expect(screen.getByText("mahsubu bekliyor")).toBeInTheDocument();
    });

    it("bekletme yokken ayrı satır gösterilmez; toplam tüm tahsilattır", () => {
      render(
        <OperationDeck
          caseId="case-1"
          collectionsSource="READY"
          financeItems={[
            { id: "c1", type: "TAHSILAT", amount: 500, date: "2026-09-20" },
            { id: "c2", type: "TAHSILAT", amount: 1500, date: "2026-09-20" },
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Finans/ }));

      expect(screen.getByTestId("finance-collection-total").textContent?.trim()).toBe("2.000 ₺");
      expect(screen.queryByTestId("finance-collection-held")).toBeNull();
      expect(screen.queryByText("mahsubu bekliyor")).toBeNull();
    });
  });

  describe("OperationDeck dağıtım & mutabakat", () => {
    it("bekletilen tahsilatın dağıtım taslağında 'Dağıtım Öner' / 'Dağıtımı Belirle' GÖSTERİLMEZ", () => {
      const recommend = vi.fn();
      render(
        <OperationDeck
          caseId="case-1"
          muhasebeKayitlari={[heldDispositionRecord(true)]}
          eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
          onRecommendDisposition={recommend}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));

      expect(screen.getByTestId("disposition-allocation-held").textContent).toContain("Mahsubu bekliyor — dağıtıma kapalı");
      expect(screen.queryByRole("button", { name: /Dağıtım Öner/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Dağıtımı Belirle/ })).toBeNull();
      expect(recommend).not.toHaveBeenCalled();
    });

    it("bekletme yokken dağıtım düğmeleri önceki gibi gösterilir", () => {
      render(
        <OperationDeck
          caseId="case-1"
          muhasebeKayitlari={[heldDispositionRecord(false)]}
          eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
          onRecommendDisposition={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));

      expect(screen.queryByTestId("disposition-allocation-held")).toBeNull();
      expect(screen.getByRole("button", { name: /Dağıtım Öner/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Dağıtımı Belirle/ })).toBeInTheDocument();
    });
  });

  describe("HesapOzetiPanel", () => {
    it("sunucunun mahsubuBekleyenTahsilat değeri, tahsilat düşümü hiç yokken de ayrı satırda gösterilir", () => {
      mockCalculation(makeCalculationSummary({ toplamTahsilat: 0, kalanBorc: 10000, mahsubuBekleyenTahsilat: 1500 }));
      render(<HesapOzetiPanel caseId="case-1" />);

      const row = screen.getByTestId("hesap-mahsubu-bekleyen-tahsilat");
      expect(row.textContent).toContain("Mahsubu bekleyen tahsilat");
      expect(row.textContent).toContain("kalan borçtan düşülmedi");
      expect(row.textContent).toContain("1.500,00");
      // Tahsilat düşümü satırı YOK: bekletilen tutar borçtan düşülmüş gibi gösterilmez
      expect(screen.queryByText("Tahsilat Düşümü")).toBeNull();
    });

    it("bekletme yokken (alan yok ya da 0) satır gösterilmez", () => {
      mockCalculation(makeCalculationSummary({ mahsubuBekleyenTahsilat: 0 }));
      const { unmount } = render(<HesapOzetiPanel caseId="case-1" />);
      expect(screen.queryByTestId("hesap-mahsubu-bekleyen-tahsilat")).toBeNull();
      unmount();

      mockCalculation(makeCalculationSummary());
      render(<HesapOzetiPanel caseId="case-1" />);
      expect(screen.queryByTestId("hesap-mahsubu-bekleyen-tahsilat")).toBeNull();
    });
  });

  describe("CaseDebtReport", () => {
    const report = (collectionDetails: Record<string, unknown>) => ({
      caseInfo: { id: "case-1", fileNumber: "2026/1", clientName: "Alacaklı", status: "DERDEST", openDate: "2026-09-01T00:00:00.000Z" },
      debtors: [],
      claimDetails: {
        principalAmount: 10000,
        currency: "TRY",
        interestAmount: 0,
        interestEndDate: "2026-09-30T00:00:00.000Z",
        expenseAmount: 0,
        feeAmount: 0,
        attorneyFeeAmount: 0,
        otherAmount: 0,
        totalClaim: 10000,
      },
      collectionDetails: { totalCollected: 500, collectionCount: 1, byType: {}, ...collectionDetails },
      balance: {
        remainingDebt: 9500,
        remainingPrincipal: 9500,
        remainingInterest: 0,
        remainingExpense: 0,
        remainingFee: 0,
        remainingAttorneyFee: 0,
      },
      calculationDate: "2026-09-30T00:00:00.000Z",
      generatedAt: "2026-09-30T00:00:00.000Z",
    });

    const load = async () => {
      render(<CaseDebtReport />);
      fireEvent.change(screen.getByPlaceholderText("Dosya ID girin..."), { target: { value: "case-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Hesapla/ }));
      await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(1));
    };

    it("mahsubu bekleyen tahsilat ayrı satırda, 'borçtan düşülmedi' notuyla gösterilir", async () => {
      apiMock.get.mockResolvedValue({ data: { data: report({ allocationHeldAmount: 1500, allocationHeldCount: 1 }) } });
      await load();

      const row = await screen.findByTestId("case-debt-allocation-held");
      expect(row.textContent).toContain("Mahsubu bekleyen tahsilat (1)");
      expect(row.textContent).toContain("borçtan düşülmedi");
      expect(row.textContent).toContain("1.500,00");
    });

    it("bekletme yokken satır gösterilmez (eski yanıt biçimi dahil)", async () => {
      apiMock.get.mockResolvedValue({ data: { data: report({}) } });
      await load();

      expect(await screen.findByText("Toplam Tahsilat")).toBeInTheDocument();
      expect(screen.queryByTestId("case-debt-allocation-held")).toBeNull();
    });
  });

  describe("dosya detayı sayfası (kaynak kilidi)", () => {
    const source = readFileSync("src/app/(dashboard)/cases/[id]/page.tsx", "utf8");

    it("finans kartına giden tahsilat satırı bekletme bilgisini taşır", () => {
      expect(source).toContain("allocationHeld: isAllocationHeldCollection(c),");
    });

    it("'Ödemeler' listesi bekletilen tahsilatı 'Onaylandı' ve yeşil '+' ile GÖSTERMEZ", () => {
      expect(source).toContain("const allocationHeld = !cancelled && isAllocationHeldCollection(col);");
      expect(source).toContain("'Mahsubu bekliyor (borçtan düşülmedi)'");
      expect(source).toContain('{allocationHeld ? "" : "+"}');
      // etiket zincirinde bekletme dalı, CONFIRMED → 'Onaylandı' dalından ÖNCE gelir
      expect(source.indexOf("'Mahsubu bekliyor (borçtan düşülmedi)'")).toBeLessThan(source.indexOf("? 'Onaylandı'"));
    });

    it("dağıtım kaydı bekletme bilgisini yalnız dağıtım bekleyen taslak için taşır", () => {
      expect(source).toContain('status === "HELD_PENDING_DISTRIBUTION" && isAllocationHeldCollection(sourceCollection as any);');
      expect(source).toContain('"Mahsubu bekliyor — dağıtıma kapalı"');
    });
  });
});
