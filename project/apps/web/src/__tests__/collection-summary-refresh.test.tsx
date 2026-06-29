import { readFileSync } from "node:fs";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceShadowDiffPanel, CollectionModal, DueModal, HesapOzetiPanel } from "@/components/finance";
import { OperationDeck } from "@/components/case-detail/OperationDeck";
import { api } from "@/lib/api";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import { useCaseCalculation } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    cancelCollection: vi.fn(),
    getCollectionDispositionsByCase: vi.fn(),
    postCollectionDisposition: vi.fn(),
    previewCasePayment: vi.fn(),
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
  cancelCollection: ReturnType<typeof vi.fn>;
  getCollectionDispositionsByCase: ReturnType<typeof vi.fn>;
  postCollectionDisposition: ReturnType<typeof vi.fn>;
  previewCasePayment: ReturnType<typeof vi.fn>;
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

function readOperationDeckSource() {
  return readFileSync("src/components/case-detail/OperationDeck.tsx", "utf8");
}

function readApiSource() {
  return readFileSync("src/lib/api.ts", "utf8");
}

function makeDispositionAccountingRecord(status = "HELD_PENDING_DISTRIBUTION") {
  return {
    id: "disp-1",
    type: status === "POSTED" ? "ODEME_ALINDI" : "DAGITIM_BEKLIYOR",
    description: "Tahsilat - Durum: Dağıtım bekliyor",
    amount: 100,
    createdAt: "2026-06-25T10:00:00.000Z",
    relatedRequestId: "collection-1",
    disposition: {
      id: "disp-1",
      collectionId: "collection-1",
      status,
      totalAmount: "100.00",
      currency: "TRY",
      beneficiaryScope: "CASE_CLIENT",
      caseClientId: null,
      manualReversalRequiredAt: null,
    },
  } as any;
}

function makeClusterDispositionAccountingRecord(status = "HELD_PENDING_DISTRIBUTION") {
  const record = makeDispositionAccountingRecord(status);
  return {
    ...record,
    disposition: {
      ...record.disposition,
      beneficiaryScope: "CASE_CREDITOR_CLUSTER",
    },
  } as any;
}
function makePaymentPreviewResponse(overrides: any = {}) {
  const base = {
    nonPersistent: true,
    caseId: "case-1",
    input: {
      amount: 100000,
      paymentDate: "2026-06-25",
      currency: "TRY",
      paymentMethod: "BANKA",
      caseDebtorId: null,
    },
    acceptance: {
      wouldAccept: true,
      blockingReasons: [],
      warnings: [],
    },
    balanceImpact: {
      currentOutstandingAmount: 200000,
      paymentAmount: 100000,
      appliedAmount: 100000,
      overpaymentAmount: 0,
      projectedOutstandingAmount: 100000,
    },
    distributionPreview: {
      source: "SINGLE_CASE_CLIENT",
      status: "HELD_PENDING_DISTRIBUTION",
      totalAmount: 100000,
      requiresClientSelection: false,
      lines: [
        {
          type: "CLIENT_PAYABLE",
          amount: 100000,
          caseClientId: "case-client-1",
          clientName: "Muvekkil A",
        },
      ],
    },
  };

  return {
    ...base,
    ...overrides,
    input: { ...base.input, ...(overrides.input || {}) },
    acceptance: { ...base.acceptance, ...(overrides.acceptance || {}) },
    balanceImpact: { ...base.balanceImpact, ...(overrides.balanceImpact || {}) },
    distributionPreview: { ...base.distributionPreview, ...(overrides.distributionPreview || {}) },
  };
}

describe("collection summary refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.createCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.updateCollection.mockResolvedValue({ id: "collection-1" });
    apiMock.deleteCollection.mockResolvedValue({ success: true });
    apiMock.cancelCollection.mockResolvedValue({ id: "collection-1", status: "CANCELLED" });
    apiMock.getCollectionDispositionsByCase.mockResolvedValue([]);
    apiMock.postCollectionDisposition.mockResolvedValue({ posted: true, dispositionId: "disp-1", lineCount: 1 });
    apiMock.previewCasePayment.mockResolvedValue(makePaymentPreviewResponse());
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

  });

  it("payment preview helper endpointini POST ile cagirir", () => {
    const source = readApiSource();

    expect(source).toContain("async previewCasePayment(caseId: string, payload: PaymentPreviewRequestDTO)");
    expect(source).toContain("`/cases/${caseId}/payment-preview`");
    expect(source).toContain('method: "POST"');
  });

  it("tahsilat onizlemesi create/update cagirmadan preview endpointini kullanir", async () => {
    render(<CaseFinanceRefreshHarness />);

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Önizleme/ }));

    await waitFor(() => {
      expect(apiMock.previewCasePayment).toHaveBeenCalledWith(
        "case-1",
        expect.objectContaining({
          amount: 100000,
          currency: "TRY",
          paymentMethod: "BANKA",
        }),
      );
    });

    expect(apiMock.createCollection).not.toHaveBeenCalled();
    expect(apiMock.updateCollection).not.toHaveBeenCalled();
    expect(refetchCalculation).not.toHaveBeenCalled();
    expect(await screen.findByText(/Kayıt oluşturmaz/)).toBeInTheDocument();
    expect(screen.getByText("Muvekkil A")).toBeInTheDocument();
  });

  it("coklu alacakli payment preview otomatik kayit acmaz ve secim mesajini gosterir", async () => {
    apiMock.previewCasePayment.mockResolvedValueOnce(
      makePaymentPreviewResponse({
        acceptance: {
          warnings: ["CLIENT_SELECTION_REQUIRED_FOR_DISTRIBUTION"],
        },
        distributionPreview: {
          source: "CASE_CREDITOR_CLUSTER",
          status: "HELD_PENDING_DISTRIBUTION",
          requiresClientSelection: true,
          lines: [],
        },
      }),
    );

    render(<CaseFinanceRefreshHarness />);

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "75000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Önizleme/ }));

    await waitFor(() => {
      expect(apiMock.previewCasePayment).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findAllByText(/Çoklu alacaklı dosyada dağıtım için alacaklı seçimi gerekir/)).not.toHaveLength(0);
    expect(apiMock.createCollection).not.toHaveBeenCalled();
    expect(apiMock.updateCollection).not.toHaveBeenCalled();
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

  it("pending tahsilatta delete aksiyonunu calisir gostermeyip void-discard mesajini verir", () => {
    render(
      <CaseFinanceRefreshHarness
        collection={{
          id: "collection-1",
          type: "TAHSILAT",
          channel: "BANKA",
          amount: 50000,
          date: "2026-06-25",
          currency: "TRY",
          status: "PENDING",
        }}
      />,
    );

    expect(screen.queryByTitle("Sil")).not.toBeInTheDocument();
    expect(screen.getByText(/Taslak tahsilat silme/)).toBeInTheDocument();
    expect(apiMock.deleteCollection).not.toHaveBeenCalled();
    expect(refetchCalculation).not.toHaveBeenCalled();
  });
  it("confirmed tahsilat iptalinde cancel endpointini kullanir ve delete cagirmaz", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("sehven kayit");
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
          status: "CONFIRMED",
        }}
      />,
    );

    fireEvent.click(screen.getByTitle("Tahsilatı İptal Et"));

    await waitFor(() => {
      expect(apiMock.cancelCollection).toHaveBeenCalledWith("case-1", "collection-1", "sehven kayit");
    });
    expect(apiMock.deleteCollection).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(refetchCalculation).toHaveBeenCalledTimes(1);
    });

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("posted tahsilat iptalinde muhasebe uyarisi verir", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("posted reversal");
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
          status: "CONFIRMED",
          accountingDispositionStatus: "POSTED",
        }}
      />,
    );

    fireEvent.click(screen.getByTitle("Tahsilatı İptal Et"));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("muhasebe/posting"));
    });
    await waitFor(() => {
      expect(apiMock.cancelCollection).toHaveBeenCalledWith("case-1", "collection-1", "posted reversal");
    });
    expect(apiMock.deleteCollection).not.toHaveBeenCalled();

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("case page tahsilat aksiyonunda confirmed icin cancel, draft icin disabled bilgi kullanir", () => {
    const source = readCasePageSource();

    expect(source).toContain("+ Yeni Ödeme");
    expect(source).toContain("await api.cancelCollection(caseData.id, collection.id, trimmedReason);");
    expect(source).toContain("title={posted ? \"Tahsilatı İptal Et / Reversal\" : \"Tahsilatı İptal Et\"}");

    expect(source).toContain("Taslak tahsilat silme bu sürümde devre dışı; ayrı void/discard akışı gerekiyor.");
    expect(source).not.toContain("await api.deleteCollection(caseData.id, col.id);");
  });

  it("case page dağıtım/mutabakat panelini disposition read modeliyle besler", () => {
    const source = readCasePageSource();

    expect(source).toContain("api.getCollectionDispositionsByCase(params.id as string)");
    expect(source).toContain("setCollectionDispositions(dispositionsRes || []);");
    expect(source).toContain("muhasebeKayitlari={operationAccountingRecords}");
    expect(source).toContain("accountingEmptyMessage={operationAccountingEmptyMessage}");
    expect(source).toContain("eligibleDispositionClients={eligibleDispositionClients}");
    expect(source).toContain("postingDispositionId={postingDispositionId}");
    expect(source).toContain("onPostDisposition={handlePostCollectionDisposition}");
    expect(source).toContain("await api.postCollectionDisposition(disposition.id, { lines });");
    expect(source).toContain("refreshCollectionDependentViews();");
    expect(source).toContain("Tahsilat finans özetinde görünüyor; dağıtım/mutabakat kaydı henüz oluşturulmamış.");
    expect(source).toContain("Dağıtım/mutabakat kaydı");
  });

  it("operation deck dağıtım/mutabakat paneli net baslik ve acik empty-state kullanir", () => {
    const source = readOperationDeckSource();

    expect(source).toContain("accountingEmptyMessage?: string");
    expect(source).toContain("Dağıtım & Mutabakat");
    expect(source).toContain("Tahsilat dağıtım kayıtları");
    expect(source).toContain("Tahsilatların müvekkil payı, ücret/masraf mahsubu ve payout öncesi dağıtım durumunu gösterir.");
    expect(source).not.toContain("Sadece muhasebe ve yetkili görür");
    expect(source).not.toContain("Henüz muhasebe kaydı yok");
  });

  it("api helper bekleyen disposition posting endpointini POST ile cagirir", () => {
    const source = readApiSource();

    expect(source).toContain("async postCollectionDisposition(dispositionId: string, payload: PostCollectionDispositionDTO)");
    expect(source).toContain("`/collection-dispositions/${dispositionId}/post`");
    expect(source).toContain('method: "POST"');
  });

  it("held pending distribution ve tek alacaklida dagitimi kesinlestirme payloadini hazirlar", async () => {
    const postDisposition = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={postDisposition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Kesinleştir/ }));

    await waitFor(() => {
      expect(postDisposition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "disp-1", status: "HELD_PENDING_DISTRIBUTION" }),
        [{ type: "CLIENT_PAYABLE", amount: "100.00", caseClientId: "case-client-1" }],
      );
    });
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("coklu alacaklida otomatik post yapmaz ve secim gerektigini gosterir", async () => {
    const postDisposition = vi.fn();

    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[
          { id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" },
          { id: "case-client-2", name: "Alacaklı B", role: "ORTAK_ALACAKLI" },
        ]}
        onPostDisposition={postDisposition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Kesinleştir/ }));

    expect(await screen.findByText("Çoklu alacaklı dosyada dağıtım için alacaklı seçimi gerekir.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dağıtımı Belirle/ })).toBeInTheDocument();
    expect(postDisposition).not.toHaveBeenCalled();
  });

  it("posted disposition kaydinda dagitimi kesinlestirme aksiyonu gostermez", () => {
    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord("POSTED")]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));

    expect(screen.queryByRole("button", { name: /Dağıtımı Kesinleştir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dağıtımı Belirle/ })).not.toBeInTheDocument();
  });

  it("dagitim belirle modalini acar ve held bucket secenegini gostermez", () => {
    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));

    const dialog = screen.getByRole("dialog", { name: /Dağıtımı Belirle/ });
    expect(dialog).toBeInTheDocument();

    const optionValues = within(dialog).getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(optionValues).toEqual(expect.arrayContaining([
      "CLIENT_PAYABLE",
      "CLIENT_EXPENSE_REIMBURSEMENT",
      "CONTRACTUAL_FEE_WITHHELD",
      "FIRM_EXPENSE_REIMBURSEMENT",
      "OFFSET_CLIENT_ADVANCE",
      "OTHER",
    ]));
    expect(optionValues).not.toContain("HELD_PENDING_DISTRIBUTION");
  });

  it("dagitim modalinda satir ekler ve siler", () => {
    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));

    expect(screen.getAllByLabelText(/Dağıtım tutarı/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Satır Ekle/ }));
    expect(screen.getAllByLabelText(/Dağıtım tutarı/)).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: /Satırı Sil/ })[0]);
    expect(screen.getAllByLabelText(/Dağıtım tutarı/)).toHaveLength(1);
  });

  it("dagitim toplami tahsilat tutariyla eslesmezse submit disable olur", () => {
    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));
    fireEvent.change(screen.getByLabelText(/Dağıtım tutarı/), { target: { value: "90.00" } });

    expect(screen.getByText("Dağıtım toplamı tahsilat tutarıyla birebir eşit olmalı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dağıtımı Kaydet/ })).toBeDisabled();
  });

  it("cluster client bucket icin caseClientId secimi zorunlu tutar", () => {
    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeClusterDispositionAccountingRecord()]}
        eligibleDispositionClients={[
          { id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" },
          { id: "case-client-2", name: "Alacaklı B", role: "ORTAK_ALACAKLI" },
        ]}
        onPostDisposition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));

    expect(screen.getByText("Müvekkil payı ve müvekkil masraf iadesi için alacaklı seçimi zorunlu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dağıtımı Kaydet/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Alacaklı seçimi/), { target: { value: "case-client-2" } });

    expect(screen.queryByText("Müvekkil payı ve müvekkil masraf iadesi için alacaklı seçimi zorunlu.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dağıtımı Kaydet/ })).not.toBeDisabled();
  });

  it("non-client bucket caseClientId olmadan submit edilebilir", async () => {
    const postDisposition = vi.fn().mockResolvedValue(undefined);

    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeClusterDispositionAccountingRecord()]}
        eligibleDispositionClients={[
          { id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" },
          { id: "case-client-2", name: "Alacaklı B", role: "ORTAK_ALACAKLI" },
        ]}
        onPostDisposition={postDisposition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));
    fireEvent.change(screen.getByLabelText(/Dağıtım kalemi türü/), { target: { value: "CONTRACTUAL_FEE_WITHHELD" } });

    expect(screen.getByText("Bu bucket için caseClientId gerekmez.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Kaydet/ }));

    await waitFor(() => {
      expect(postDisposition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "disp-1", status: "HELD_PENDING_DISTRIBUTION" }),
        [{ type: "CONTRACTUAL_FEE_WITHHELD", amount: "100.00" }],
      );
    });
  });

  it("cok satirli dagitim payloadini dogru gonderir ve basarida paneli kapatir", async () => {
    const postDisposition = vi.fn().mockResolvedValue(undefined);

    render(
      <OperationDeck
        caseId="case-1"
        muhasebeKayitlari={[makeDispositionAccountingRecord()]}
        eligibleDispositionClients={[{ id: "case-client-1", name: "Alacaklı A", role: "ALACAKLI" }]}
        onPostDisposition={postDisposition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Belirle/ }));
    fireEvent.change(screen.getByLabelText(/Dağıtım tutarı/), { target: { value: "70.00" } });
    fireEvent.click(screen.getByRole("button", { name: /Satır Ekle/ }));

    expect(screen.getAllByLabelText(/Dağıtım tutarı/)[1]).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: /Dağıtımı Kaydet/ }));

    await waitFor(() => {
      expect(postDisposition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "disp-1", status: "HELD_PENDING_DISTRIBUTION" }),
        [
          { type: "CLIENT_PAYABLE", amount: "70.00", caseClientId: "case-client-1" },
          { type: "OTHER", amount: "30.00" },
        ],
      );
    });
    expect(screen.queryByRole("dialog", { name: /Dağıtımı Belirle/ })).not.toBeInTheDocument();
    expect(screen.getByText("Dağıtım kararı kaydedildi.")).toBeInTheDocument();
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

    // P3-2C-FE: kanonik changeCaseStatus çağrısı guarded-edge consumer (runGuardedStatus) ile sarıldı + confirmationToken retry argümanı eklendi.
    expect(saveCaseStatusBlock).toContain("await runGuardedStatus(");
    expect(saveCaseStatusBlock).toContain('api.changeCaseStatus(params.id as string, caseStatusValue, "Statü güncellendi", confirmation?.token)');
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
