import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThirdPartyPanel } from "@/components/debtor/ThirdPartyPanel";
import { api } from "@/lib/api";

/**
 * DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I03 (OWNER D2 POLICY DECISION —
 * RATIFIED). Backend her koşulda authoritative validation/authority yapar (bkz.
 * ExternalCaseStatusAuthorityService/ExternalCaseStatusTransitionService); bu
 * testler yalnız frontend'in backend-projected capability'i doğru gösterdiğini,
 * status/statusSource'u kendi başına icat etmediğini ve CAS/evidence sözleşmesine
 * uyduğunu doğrular.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function externalCase(overrides: Record<string, any> = {}) {
  return {
    id: "ec-1",
    externalOffice: "İstanbul 5. İcra Dairesi",
    externalCaseNo: "2026/100",
    counterpartyName: "Karşı Taraf A.Ş.",
    claimAmount: 10000,
    claimCurrency: "TRY",
    attachmentStatus: "HACIZ_TALEP",
    receivedAmount: 0,
    allowedManualTransitions: ["CEVAP_BEKLENIYOR", "HACIZ_KONDU"],
    canManualClose: false,
    ...overrides,
  };
}

function mockExternalCases(cases: any[]) {
  apiMock.get.mockImplementation((endpoint: string) => {
    if (endpoint.includes("/external-cases")) return Promise.resolve({ data: cases });
    if (endpoint.includes("/third-parties/with-status")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

async function openDosyaTab() {
  render(<ThirdPartyPanel caseDebtorId="cd-1" debtorName="Test Borçlu" />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Borçlunun Dosyaları/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Borçlunun Dosyaları/ }));
  await waitFor(() =>
    expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining("/external-cases")),
  );
}

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.post.mockResolvedValue({ data: {} });
  apiMock.put.mockResolvedValue({ data: {} });
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
});

describe("D2-I03 — ThirdPartyPanel ExternalCase durum enforcement", () => {
  it("TEST-01: create formunda status selector yok", async () => {
    mockExternalCases([]);
    await openDosyaTab();
    fireEvent.click(screen.getByText("Dış Dosya Ekle"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Ekle (Alacak Haczi)")).toBeInTheDocument());

    expect(screen.queryByText("Haciz Durumu")).not.toBeInTheDocument();
  });

  it("TEST-02: create request status/statusSource içermiyor", async () => {
    mockExternalCases([]);
    await openDosyaTab();
    fireEvent.click(screen.getByText("Dış Dosya Ekle"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Ekle (Alacak Haczi)")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Örn: İstanbul 5. İcra Dairesi"), {
      target: { value: "Ankara 3. İcra Dairesi" },
    });
    fireEvent.change(screen.getByPlaceholderText("Örn: 2024/12345"), { target: { value: "2026/55" } });
    fireEvent.change(screen.getByPlaceholderText("Borçlunun alacaklı olduğu kişi/kurum"), {
      target: { value: "Karşı Taraf Ltd." },
    });
    fireEvent.click(screen.getByText("Ekle"));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      "/case-debtors/cd-1/external-cases",
      expect.any(Object),
    ));
    const body = apiMock.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("attachmentStatus");
    expect(body).not.toHaveProperty("statusSource");
  });

  it("TEST-03: generic edit formu status mutasyonu yapmıyor (selector yok, PUT body'de yok)", async () => {
    mockExternalCases([externalCase()]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Düzenle"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Düzenle")).toBeInTheDocument());
    expect(screen.queryByText("Haciz Durumu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/external-cases/ec-1", expect.any(Object)));
    const body = apiMock.put.mock.calls[0][1];
    expect(body).not.toHaveProperty("attachmentStatus");
    expect(body).not.toHaveProperty("statusSource");
  });

  it("TEST-04: UI yalnız backend-projected transitions'ı gösteriyor (bağımsız matrix kopyalanmaz)", async () => {
    mockExternalCases([externalCase({ allowedManualTransitions: ["HACIZ_KONDU"] })]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());

    const select = screen.getByLabelText("Yeni Durum *") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["", "HACIZ_KONDU"]);
    expect(screen.queryByText("Cevap Bekleniyor")).not.toBeInTheDocument();
  });

  it("TEST-05: allowedManualTransitions boşsa Durum Geçir butonu hiç gösterilmez (derived/terminal durumlar dahil)", async () => {
    mockExternalCases([
      externalCase({ id: "ec-2", attachmentStatus: "TAHSIL_BASLADI", allowedManualTransitions: [], canManualClose: false }),
    ]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    expect(screen.queryByText("Durum Geçir")).not.toBeInTheDocument();
  });

  it("TEST-06: staff (canManualClose=false) Manuel Kapat butonunu göremez", async () => {
    mockExternalCases([externalCase({ attachmentStatus: "HACIZ_KONDU", canManualClose: false })]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    expect(screen.queryByText("Manuel Kapat")).not.toBeInTheDocument();
  });

  it("TEST-07: yetkili avukat (canManualClose=true) Manuel Kapat yapabiliyor", async () => {
    mockExternalCases([externalCase({ attachmentStatus: "HACIZ_KONDU", canManualClose: true })]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Manuel Kapat"));
    await waitFor(() => expect(screen.getByText("Dış Dosyayı Manuel Kapat")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Kapatma Sebebi *"), { target: { value: "NEGATIVE_RESPONSE" } });
    fireEvent.click(screen.getByText("Dosyayı Kapat"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        "/external-cases/ec-1/close",
        expect.objectContaining({ expectedStatus: "HACIZ_KONDU", closureReason: "NEGATIVE_RESPONSE" }),
      ),
    );
  });

  it("TEST-08: evidence (occurredAt/externalReference) eksikse transition submit edilmez", async () => {
    mockExternalCases([externalCase()]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Yeni Durum *"), { target: { value: "HACIZ_KONDU" } });
    fireEvent.click(screen.getByText("Durumu Geçir"));

    expect(alertSpy).toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalledWith("/external-cases/ec-1/transition-status", expect.any(Object));
  });

  it("TEST-09: client provenance/statusSource spoof edemiyor (transition body'sinde yok)", async () => {
    mockExternalCases([externalCase()]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Yeni Durum *"), { target: { value: "HACIZ_KONDU" } });
    fireEvent.change(screen.getByPlaceholderText("Örn: tutanak no, tebligat referansı"), {
      target: { value: "Tutanak-42" },
    });
    fireEvent.change(screen.getByLabelText("Gerçekleşme Tarihi *"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("Durumu Geçir"));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      "/external-cases/ec-1/transition-status",
      expect.any(Object),
    ));
    const body = apiMock.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("statusSource");
    expect(Object.keys(body).sort()).toEqual(
      ["expectedStatus", "externalReference", "statusOccurredAt", "targetStatus"].sort(),
    );
  });

  it("TEST-10: expectedStatus mevcut attachmentStatus olarak gönderiliyor, başarı sonrası liste yeniden yüklenir", async () => {
    mockExternalCases([externalCase({ attachmentStatus: "HACIZ_TALEP" })]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());
    const getCallsBefore = apiMock.get.mock.calls.length;

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Yeni Durum *"), { target: { value: "CEVAP_BEKLENIYOR" } });
    fireEvent.change(screen.getByPlaceholderText("Örn: tutanak no, tebligat referansı"), {
      target: { value: "Ref-1" },
    });
    fireEvent.change(screen.getByLabelText("Gerçekleşme Tarihi *"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("Durumu Geçir"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        "/external-cases/ec-1/transition-status",
        expect.objectContaining({ expectedStatus: "HACIZ_TALEP", targetStatus: "CEVAP_BEKLENIYOR" }),
      ),
    );
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore));
  });

  it("TEST-11: 409 (CAS conflict) durumunda bildirim gösterilir ve liste yeniden yüklenir, stale veri tekrar gönderilmez", async () => {
    mockExternalCases([externalCase()]);
    apiMock.post.mockRejectedValueOnce({ response: { status: 409 } });
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());
    const getCallsBefore = apiMock.get.mock.calls.length;

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Yeni Durum *"), { target: { value: "HACIZ_KONDU" } });
    fireEvent.change(screen.getByPlaceholderText("Örn: tutanak no, tebligat referansı"), {
      target: { value: "Ref-1" },
    });
    fireEvent.change(screen.getByLabelText("Gerçekleşme Tarihi *"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("Durumu Geçir"));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/değiştirildi/));
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore));
    // Modal kapanmış olmalı — aynı stale expectedStatus ile tekrar submit edilemez.
    expect(screen.queryByText("Dış Dosya Durumunu Geçir")).not.toBeInTheDocument();
  });

  it("TEST-12: pending sırasında double-submit engellenir", async () => {
    mockExternalCases([externalCase()]);
    let resolvePost: (v: any) => void;
    apiMock.post.mockImplementation(() => new Promise((resolve) => { resolvePost = resolve; }));
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Durum Geçir"));
    await waitFor(() => expect(screen.getByText("Dış Dosya Durumunu Geçir")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Yeni Durum *"), { target: { value: "HACIZ_KONDU" } });
    fireEvent.change(screen.getByPlaceholderText("Örn: tutanak no, tebligat referansı"), {
      target: { value: "Ref-1" },
    });
    fireEvent.change(screen.getByLabelText("Gerçekleşme Tarihi *"), { target: { value: "2026-08-01" } });

    const submitButton = screen.getByText("Durumu Geçir").closest("button")!;
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    resolvePost!({ data: {} });
  });

  it("TEST-13: KAPANDI için reopen yolu yok (Durum Geçir/Manuel Kapat butonu yok)", async () => {
    mockExternalCases([
      externalCase({ attachmentStatus: "KAPANDI", allowedManualTransitions: [], canManualClose: false }),
    ]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    expect(screen.queryByText("Durum Geçir")).not.toBeInTheDocument();
    expect(screen.queryByText("Manuel Kapat")).not.toBeInTheDocument();
  });

  it('TEST-14: "Diğer" kapatma sebebi seçilirse açıklama zorunludur', async () => {
    mockExternalCases([externalCase({ attachmentStatus: "HACIZ_KONDU", canManualClose: true })]);
    await openDosyaTab();
    await waitFor(() => expect(screen.getByText("2026/100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Manuel Kapat"));
    await waitFor(() => expect(screen.getByText("Dış Dosyayı Manuel Kapat")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Kapatma Sebebi *"), { target: { value: "OTHER" } });
    fireEvent.click(screen.getByText("Dosyayı Kapat"));

    expect(alertSpy).toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalledWith("/external-cases/ec-1/close", expect.any(Object));
  });
});
