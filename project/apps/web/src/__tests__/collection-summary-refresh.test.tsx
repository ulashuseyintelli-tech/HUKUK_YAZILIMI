import { readFileSync } from "node:fs";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceShadowDiffPanel, CollectionModal, DueModal, HesapOzetiPanel } from "@/components/finance";
import { api } from "@/lib/api";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import { useCaseCalculation } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    createDue: vi.fn(),
    updateDue: vi.fn(),
    deleteDue: vi.fn(),
  },
}));

vi.mock("@/hooks/useBalanceShadowDiff", () => ({
  useBalanceShadowDiff: vi.fn(),
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

const apiMock = api as unknown as {
  createCollection: ReturnType<typeof vi.fn>;
  updateCollection: ReturnType<typeof vi.fn>;
  deleteCollection: ReturnType<typeof vi.fn>;
  createDue: ReturnType<typeof vi.fn>;
  updateDue: ReturnType<typeof vi.fn>;
  deleteDue: ReturnType<typeof vi.fn>;
};
const useCaseCalculationMock = useCaseCalculation as unknown as ReturnType<typeof vi.fn>;
const useBalanceShadowDiffMock = useBalanceShadowDiff as unknown as ReturnType<typeof vi.fn>;

const refetchCalculation = vi.fn();
const refetchShadowDiff = vi.fn();

function makeCalculationSummary() {
  return {
    caseId: "case-1",
    hesapTarihi: "2026-06-25",
    takipTarihi: "2026-06-01",
    kalemTuru: "ASIL_ALACAK",
    asilAlacak: 200000,
    tazminat: 0,
    komisyon: 0,
    takipOncesiFaiz: 0,
    takipTutari: 200000,
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
    toplamBorc: 200000,
    sonBorc: 200000,
    toplamTahsilat: 0,
    kalanBorc: 200000,
    kalanAnapara: 200000,
    mahsupDetaylari: [],
    faizSegmentleri: {
      takipOncesi: [],
      takipSonrasi: [],
    },
    tahsilOranlari: [],
  };
}

function CaseFinanceRefreshHarness({ collection }: { collection?: any }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <HesapOzetiPanel caseId="case-1" refreshKey={refreshKey} />
      <CollectionModal
        isOpen
        onClose={vi.fn()}
        caseId="case-1"
        collection={collection}
        onSuccess={() => setRefreshKey((key) => key + 1)}
      />
    </>
  );
}

function CaseDueRefreshHarness({ due }: { due?: any }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <HesapOzetiPanel caseId="case-1" refreshKey={refreshKey} />
      <DueModal
        isOpen
        onClose={vi.fn()}
        caseId="case-1"
        due={due}
        onSuccess={() => setRefreshKey((key) => key + 1)}
      />
    </>
  );
}

function readCasePageSource() {
  return readFileSync("src/app/(dashboard)/cases/[id]/page.tsx", "utf8");
}
describe("collection summary refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.createCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.updateCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.deleteCollection.mockResolvedValue({ success: true });
    apiMock.createDue.mockResolvedValue({ id: "due-1" });
    apiMock.updateDue.mockResolvedValue({ id: "due-1" });
    apiMock.deleteDue.mockResolvedValue({ success: true });
    useCaseCalculationMock.mockReturnValue({
      data: makeCalculationSummary(),
      loading: false,
      error: null,
      refetch: refetchCalculation,
    });
    useBalanceShadowDiffMock.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: refetchShadowDiff,
    });
  });

  it("tahsilat kaydi basarili olunca stale hesap ozetini refetch eder", async () => {
    render(<CaseFinanceRefreshHarness />);

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Ekle$/ }));

    await waitFor(() => {
      expect(apiMock.createCollection).toHaveBeenCalledWith(
        "case-1",
        expect.objectContaining({ amount: 100000 }),
      );
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });
    expect(refetchShadowDiff).not.toHaveBeenCalled();
  });

  it("tahsilat guncelleme basarili olunca stale hesap ozetini refetch eder", async () => {
    render(
      <CaseFinanceRefreshHarness
        collection={{
          id: "collection-1",
          type: "TAHSILAT",
          channel: "BANKA",
          amount: 50000,
          date: "2026-06-25",
          currency: "TRY",
        }}
      />,
    );

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "125000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Güncelle$/ }));

    await waitFor(() => {
      expect(apiMock.updateCollection).toHaveBeenCalledWith(
        "case-1",
        "collection-1",
        expect.objectContaining({ amount: 125000 }),
      );
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });
    expect(refetchShadowDiff).not.toHaveBeenCalled();
  });

  it("tahsilat silme basarili olunca stale hesap ozetini refetch eder", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <CaseFinanceRefreshHarness
        collection={{
          id: "collection-1",
          type: "TAHSILAT",
          channel: "BANKA",
          amount: 50000,
          date: "2026-06-25",
          currency: "TRY",
        }}
      />,
    );

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Sil"));

    await waitFor(() => {
      expect(apiMock.deleteCollection).toHaveBeenCalledWith("case-1", "collection-1");
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });
    expect(refetchShadowDiff).not.toHaveBeenCalled();
  });

  it("alacak kalemi kaydi basarili olunca stale hesap ozetini refetch eder", async () => {
    render(<CaseDueRefreshHarness />);

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "150000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Ekle$/ }));

    await waitFor(() => {
      expect(apiMock.createDue).toHaveBeenCalledWith(
        "case-1",
        expect.objectContaining({ amount: 150000 }),
      );
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });
  });

  it("alacak kalemi guncelleme basarili olunca stale hesap ozetini refetch eder", async () => {
    render(
      <CaseDueRefreshHarness
        due={{
          id: "due-1",
          type: "PRINCIPAL",
          description: "Ana alacak",
          amount: 50000,
          dueDate: "2026-06-25",
          currency: "TRY",
          interestType: "YASAL",
        }}
      />,
    );

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "175000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ncelle$/ }));

    await waitFor(() => {
      expect(apiMock.updateDue).toHaveBeenCalledWith(
        "case-1",
        "due-1",
        expect.objectContaining({ amount: 175000 }),
      );
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });
  });

  it("alacak kalemi modal silme basarili olunca stale hesap ozetini refetch eder", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <CaseDueRefreshHarness
        due={{
          id: "due-1",
          type: "PRINCIPAL",
          description: "Ana alacak",
          amount: 50000,
          dueDate: "2026-06-25",
          currency: "TRY",
          interestType: "YASAL",
        }}
      />,
    );

    expect(refetchCalculation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Sil"));

    await waitFor(() => {
      expect(apiMock.deleteDue).toHaveBeenCalledWith("case-1", "due-1");
    });
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });

    confirmSpy.mockRestore();
  });

  it("case page DueModal success dependent finance summary refresh helperini kullanir", () => {
    const source = readCasePageSource();
    const dueModalStart = source.indexOf("<DueModal");
    const dueModalBlock = source.slice(dueModalStart, source.indexOf("/>", dueModalStart) + 2);

    expect(dueModalBlock).toContain("onSuccess={refreshCollectionDependentViews}");
    expect(dueModalBlock).not.toContain("onSuccess={fetchFinanceData}");
  });

  it("inline alacak kalemi silme dependent finance summary refresh helperini kullanir", () => {
    const source = readCasePageSource();
    const deleteDueStart = source.indexOf("await api.deleteDue");
    const deleteDueBlock = source.slice(deleteDueStart, source.indexOf("} catch", deleteDueStart));

    expect(deleteDueBlock).toContain("refreshCollectionDependentViews();");
    expect(deleteDueBlock).not.toContain("fetchFinanceData();");
  });
  it("case page takip tarihi kaydi dependent finance summary refresh keyini artirir", () => {
    const source = readCasePageSource();
    const saveCaseDateStart = source.indexOf("const handleSaveCaseDate");
    const saveCaseDateBlock = source.slice(
      saveCaseDateStart,
      source.indexOf("  // Takip stat", saveCaseDateStart),
    );

    expect(saveCaseDateBlock).toContain("await api.updateCase(params.id as string, { caseDate: caseDateValue });");
    expect(saveCaseDateBlock).toContain("await fetchCase();");
    expect(saveCaseDateBlock).toContain("setFinancialSummaryRefreshKey((key) => key + 1);");
  });

  it("case page takip statusu kaydi dependent finance summary refresh keyini artirmaz", () => {
    const source = readCasePageSource();
    const saveCaseStatusStart = source.indexOf("const handleSaveCaseStatus");
    const saveCaseStatusBlock = source.slice(
      saveCaseStatusStart,
      source.indexOf("  // Fetch case debtors", saveCaseStatusStart),
    );

    expect(saveCaseStatusBlock).toContain('await api.changeCaseStatus(params.id as string, caseStatusValue, "Statü güncellendi");');
    expect(saveCaseStatusBlock).toContain("await fetchCase();");
    expect(saveCaseStatusBlock).not.toContain("setFinancialSummaryRefreshKey");
  });
  it("opt-in shadow panel aciksa refresh key degisiminde shadow diff refetch eder", async () => {
    const { rerender } = render(
      <BalanceShadowDiffPanel caseId="case-1" enabled refreshKey={0} />,
    );

    expect(refetchShadowDiff).not.toHaveBeenCalled();

    rerender(<BalanceShadowDiffPanel caseId="case-1" enabled refreshKey={1} />);

    await waitFor(() => {
      expect(refetchShadowDiff).toHaveBeenCalledTimes(1);
    });
  });
});
