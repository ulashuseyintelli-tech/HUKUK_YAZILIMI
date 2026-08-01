import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UyapPanel } from "@/components/case/UyapPanel";
import { api } from "@/lib/api";

/**
 * I15-D1-R1 — owner-ratified TRIGGER_HACIZ_CASE_DEBTOR_TARGET_UNBOUND düzeltmesi, frontend
 * davranış kuralları (8 zorunlu senaryo). Backend her koşulda authoritative validation yapar
 * (bkz. trigger-haciz-authorization.service.ts); bu testler yalnız UX sözleşmesini doğrular.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      getUyapStatus: vi.fn(),
      validateUyapCasePoa: vi.fn(),
      getUyapRequestHistory: vi.fn(),
      getCaseDebtors: vi.fn(),
      getPreHacizIntelligence: vi.fn(),
      sendUyapHacizRequest: vi.fn(),
      retryUyapFailedRequests: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getUyapStatus: ReturnType<typeof vi.fn>;
  validateUyapCasePoa: ReturnType<typeof vi.fn>;
  getUyapRequestHistory: ReturnType<typeof vi.fn>;
  getCaseDebtors: ReturnType<typeof vi.fn>;
  getPreHacizIntelligence: ReturnType<typeof vi.fn>;
  sendUyapHacizRequest: ReturnType<typeof vi.fn>;
  retryUyapFailedRequests: ReturnType<typeof vi.fn>;
};

const debtor = (over: Record<string, any> = {}) => ({
  id: "debtor-1",
  caseDebtorId: "cd-1",
  displayName: "Ahmet Yılmaz",
  personType: "REAL",
  role: "ASIL_BORCLU",
  lifecycleStatus: "ACTIVE",
  serviceStatus: "NOT_STARTED",
  serviceLabel: "Başlatılmadı",
  assets: { vehicle: "UNKNOWN", realEstate: "UNKNOWN", bank: "UNKNOWN", sgkWage: "UNKNOWN" },
  alertCount: 0,
  alertLevel: "NONE",
  issues: [],
  hasDifferentAddressInOtherCase: false,
  researchStatus: "NOT_STARTED",
  ...over,
});

async function openHacizTab() {
  render(<UyapPanel caseId="case-1" />);
  await waitFor(() => expect(screen.getByText("UYAP Entegrasyonu")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Haciz Talebi"));
  await waitFor(() => expect(screen.getByText("Hedef Borçlu")).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getUyapStatus.mockResolvedValue({ connected: true, mode: "STUB", message: "ok" });
  apiMock.validateUyapCasePoa.mockResolvedValue({ isValid: true, errors: [], canProceedToUyap: true });
  apiMock.getUyapRequestHistory.mockResolvedValue([]);
  apiMock.getPreHacizIntelligence.mockResolvedValue({ debtors: [], overallLevel: "YOK" });
  apiMock.sendUyapHacizRequest.mockResolvedValue({ success: true, requestId: "req-1" });
});

describe("I15-D1-R1 — UyapPanel haciz CaseDebtor target-binding", () => {
  it("TEST-01: tek ACTIVE borçlu → otomatik seçilir, request tam bu caseDebtorId'yi taşır", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({ items: [debtor()], summary: {} as any });
    await openHacizTab();

    // Tek borçlu düz metin olarak gösterilir (dropdown DEĞİL) ama seçim state'te AKTİFTİR.
    expect(screen.getByText("Ahmet Yılmaz")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1000" } });
    fireEvent.click(screen.getByText("Haciz Talebi Gönder"));

    await waitFor(() =>
      expect(apiMock.sendUyapHacizRequest).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: "case-1", caseDebtorId: "cd-1" }),
      ),
    );
  });

  it("TEST-02: birden fazla ACTIVE borçlu → seçim zorunludur, seçilmeden gönderim kapalıdır", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({
      items: [debtor({ caseDebtorId: "cd-1", displayName: "Ahmet Yılmaz" }), debtor({ caseDebtorId: "cd-2", displayName: "Ayşe Kaya", role: "MUSETEREK_BORCLU" })],
      summary: {} as any,
    });
    await openHacizTab();

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1000" } });
    const submitButton = screen.getByText("Haciz Talebi Gönder").closest("button")!;
    expect(submitButton).toBeDisabled();
  });

  it("TEST-03: çoklu borçlu varken İLK kayıt otomatik seçilmez (varsayılan seçim yok)", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({
      items: [debtor({ caseDebtorId: "cd-1", displayName: "Ahmet Yılmaz" }), debtor({ caseDebtorId: "cd-2", displayName: "Ayşe Kaya" })],
      summary: {} as any,
    });
    await openHacizTab();

    const select = screen.getByRole("combobox", { name: "Hedef Borçlu" }) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("TEST-04: sıfır ACTIVE borçlu → gönderim butonu disabled, açık hata mesajı gösterilir", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({ items: [], summary: {} as any });
    await openHacizTab();

    expect(screen.getByText(/aktif borçlu bulunamadı/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1000" } });
    const submitButton = screen.getByText("Haciz Talebi Gönder").closest("button")!;
    expect(submitButton).toBeDisabled();
  });

  it("TEST-05: PASSIVE borçlu seçilemez — backend'den güvenli varsayılan (includePassive olmadan) istenir", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({ items: [debtor()], summary: {} as any });
    await openHacizTab();

    // Safe-default kanıtı: includePassive:true İSTENMEDİ (backend zaten yalnız ACTIVE döner).
    expect(apiMock.getCaseDebtors).toHaveBeenCalledWith("case-1");
    expect(apiMock.getCaseDebtors).not.toHaveBeenCalledWith("case-1", expect.objectContaining({ includePassive: true }));
  });

  it("TEST-06: caseId değişince önceki seçim sıfırlanır", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({
      items: [debtor({ caseDebtorId: "cd-1" }), debtor({ caseDebtorId: "cd-2", displayName: "Ayşe Kaya" })],
      summary: {} as any,
    });
    const { rerender } = render(<UyapPanel caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("UYAP Entegrasyonu")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Haciz Talebi"));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Hedef Borçlu" })).toBeInTheDocument());

    fireEvent.change(screen.getByRole("combobox", { name: "Hedef Borçlu" }), { target: { value: "cd-1" } });
    expect((screen.getByRole("combobox", { name: "Hedef Borçlu" }) as HTMLSelectElement).value).toBe("cd-1");

    // Farklı bir dosyaya geçiş — yeni dosyanın borçlu listesi (farklı id'ler).
    apiMock.getCaseDebtors.mockResolvedValue({
      items: [debtor({ caseDebtorId: "cd-9", displayName: "Başka Borçlu" }), debtor({ caseDebtorId: "cd-10", displayName: "Başka Borçlu 2" })],
      summary: {} as any,
    });
    rerender(<UyapPanel caseId="case-2" />);

    await waitFor(() => expect(apiMock.getCaseDebtors).toHaveBeenLastCalledWith("case-2"));
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Hedef Borçlu" }) as HTMLSelectElement).value).toBe(""));
  });

  it("TEST-07: request TAM seçilen caseDebtorId'yi taşır (çoklu borçlu senaryosu)", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({
      items: [debtor({ caseDebtorId: "cd-1", displayName: "Ahmet Yılmaz" }), debtor({ caseDebtorId: "cd-2", displayName: "Ayşe Kaya" })],
      summary: {} as any,
    });
    await openHacizTab();

    fireEvent.change(screen.getByRole("combobox", { name: "Hedef Borçlu" }), { target: { value: "cd-2" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Haciz Talebi Gönder"));

    await waitFor(() =>
      expect(apiMock.sendUyapHacizRequest).toHaveBeenCalledWith(
        expect.objectContaining({ caseDebtorId: "cd-2" }),
      ),
    );
  });

  it("TEST-08: backend hatası güvenli biçimde gösterilir (ham hata/stack DEĞİL)", async () => {
    apiMock.getCaseDebtors.mockResolvedValue({ items: [debtor()], summary: {} as any });
    apiMock.sendUyapHacizRequest.mockRejectedValue(new Error("Internal stack trace leak XYZ"));
    await openHacizTab();

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1000" } });
    fireEvent.click(screen.getByText("Haciz Talebi Gönder"));

    await waitFor(() =>
      expect(screen.getByText("Haciz talebi gönderilemedi. Lütfen tekrar deneyin.")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Internal stack trace/)).not.toBeInTheDocument();
  });
});
