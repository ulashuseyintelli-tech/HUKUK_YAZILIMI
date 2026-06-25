import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceShadowDiffPanel, CollectionModal, HesapOzetiPanel } from "@/components/finance";
import { api } from "@/lib/api";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import { useCaseCalculation } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
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

function CaseFinanceRefreshHarness() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <HesapOzetiPanel caseId="case-1" refreshKey={refreshKey} />
      <CollectionModal
        isOpen
        onClose={vi.fn()}
        caseId="case-1"
        onSuccess={() => setRefreshKey((key) => key + 1)}
      />
    </>
  );
}

describe("collection summary refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.createCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.updateCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.deleteCollection.mockResolvedValue({ success: true });
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

  it("opt-in shadow panel aciksa refresh key degisiminde shadow diff refetch eder", async () => {
    const { rerender } = render(
      <BalanceShadowDiffPanel caseId="case-1" enabled refreshKey={0} />,
    );

    expect(refetchShadowDiff).not.toHaveBeenCalled();

    rerender(<BalanceShadowDiffPanel caseId="case-1" enabled refreshKey={1} />);

    await waitFor(() => {
      expect(refetchShadowDiff).toHaveBeenCalledTimes(1);
    });
  });});
