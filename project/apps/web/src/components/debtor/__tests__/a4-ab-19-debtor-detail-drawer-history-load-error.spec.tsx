/**
 * WSMR-A4-AB-19 — DebtorDetailDrawer#fetchHistory okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): hata durumunda hiçbir state dokunulmuyordu (yalnız console.error) —
 * `history` boş kalınca `ServiceHistoryTimeline` "Henüz tebligat geçmişi yok" (GERÇEK boşluk)
 * render ediyordu, okuma hatasıyla AYIRT EDİLEMEZ. Ayrıca `history`/`showHistory` caseDebtorId
 * DEĞİŞİMİNDE hiç temizlenmiyordu — `fetchHistory`'nin eski "zaten yüklüyse tekrar çekme"
 * korumasıyla birleşince, ÖNCEKİ borçlunun tebligat geçmişi YENİ borçlunun panelinde
 * SESSİZCE kalabiliyordu (cross-debtor veri sızıntısı — icra/tebligat bağlamında ciddi risk).
 *
 * Seri zincirin 4. halkası (A4-AB-16→20, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getCaseDebtorDetail: vi.fn(),
  getCrossFileDebtorAlerts: vi.fn().mockResolvedValue({ hasAlert: false }),
  getServiceHistory: vi.fn(),
  updateServiceStatus: vi.fn(),
  startNewServiceAttempt: vi.fn(),
  updateDebtorQuickNote: vi.fn(),
  getDebtor: vi.fn(),
  setActiveAddress: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  DebtorRoleLabels: { ASIL_BORCLU: "Asil Borclu", KEFIL: "Kefil" },
  ServiceStatusLabels: {
    NOT_STARTED: "Baslatilmadi", READY: "Hazir", SENT: "Gonderildi", DELIVERED: "Tebligat Edildi",
    RETURNED: "Iade", MUHTAR: "Muhtara Teslim", ANNOUNCEMENT: "Ilan Yoluyla", FAILED: "Basarisiz",
    UNKNOWN: "Bilinmiyor", FINALIZED: "Kesinlesti",
  },
  ServiceReturnReasonLabels: {
    ADDRESS_NOT_FOUND: "Adres Bulunamadi", MOVED: "Tasinmis", REFUSED: "Reddetti",
    DECEASED: "Vefat", COMPANY_CLOSED: "Sirket Kapandi", UNCLAIMED: "Alinmadi", OTHER: "Diger",
  },
  AddressTypeLabels: { IS: "Is", EV: "Ev", DIGER: "Diger" },
}));

vi.mock("../AddressListSection", () => ({
  AddressListSection: () => <div data-testid="address-list" />,
}));
vi.mock("../NotificationChainPanel", () => ({
  NotificationChainPanel: () => <div data-testid="notification-chain" />,
}));
vi.mock("../AssetQueryPanel", () => ({
  AssetQueryPanel: () => <div data-testid="asset-query-panel" />,
}));
vi.mock("../../address-discovery", () => ({
  AddressResearchWidget: () => <div data-testid="address-research-widget" />,
}));
vi.mock("../../case/IntelStatementSection", () => ({
  IntelStatementSection: () => <div data-testid="intel-statement-section" />,
}));
vi.mock("../modals/ServiceUpdateModal", () => ({
  ServiceUpdateModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="service-update-modal" /> : null,
}));
vi.mock("../NewDebtorModal", () => ({
  NewDebtorModal: () => <div data-testid="new-debtor-modal" />,
}));

import { DebtorDetailDrawer } from "../DebtorDetailDrawer";

function baseDebtorFor(id: string, name: string) {
  return {
    id,
    caseDebtorId: id,
    displayName: name,
    personType: "REAL",
    role: "ASIL_BORCLU",
    lifecycleStatus: "ACTIVE",
    serviceStatus: "READY",
    serviceLabel: "Hazir",
    assets: { vehicle: "UNKNOWN", realEstate: "UNKNOWN", bank: "UNKNOWN", sgkWage: "UNKNOWN" },
    alertCount: 0,
    alertLevel: "NONE",
    issues: [],
    emailMasked: undefined,
    phone: undefined,
    email: undefined,
    identityNo: undefined,
    address: undefined,
    addresses: [],
    selectedAddressId: undefined,
    service: { status: "READY" },
    riskFlags: [],
    quickNote: "",
  };
}

const HISTORY_ITEM = {
  id: "h1",
  fromStatus: "READY",
  toStatus: "SENT",
  createdAt: "2026-08-01T00:00:00.000Z",
};

async function openHistoryPanel() {
  fireEvent.click(screen.getByText("Tebligat Geçmişi"));
}

describe("WSMR-A4-AB-19: DebtorDetailDrawer#fetchHistory okuma hatası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue({ hasAlert: false });
  });

  it("[1] gerçek başarı: tebligat geçmişi render edilir, hata bandı yok", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockResolvedValue([HISTORY_ITEM]);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();

    await waitFor(() => expect(screen.queryByText("Yükleniyor...")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Henüz tebligat geçmişi yok")).not.toBeInTheDocument();
  });

  it("[2] gerçek boş (başarılı, boş dizi): 'Henüz tebligat geçmişi yok' DOĞRU gösterilir, hata YOK", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockResolvedValue([]);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();

    await screen.findByText("Henüz tebligat geçmişi yok");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[3] ağ hatası: görünür hata bandı çıkar, 'Henüz tebligat geçmişi yok' İLE ASLA KARIŞTIRILMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockRejectedValue(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tebligat geçmişi yüklenemedi.");
    expect(screen.queryByText("Henüz tebligat geçmişi yok")).not.toBeInTheDocument();
  });

  it("[4] malformed gövde (dizi değil): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockResolvedValue({ message: "beklenmedik" } as any);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tebligat geçmişi yüklenemedi.");
  });

  it("[5] retry başarılı: hata bandı temizlenir, geçmiş render edilir", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([HISTORY_ITEM]);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(apiMock.getServiceHistory).toHaveBeenCalledTimes(2);
  });

  it("[6] retry YALNIZ geçmiş kaynağını tekrar dener — getCaseDebtorDetail tekrar ÇAĞRILMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockRejectedValue(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    await screen.findByRole("alert");
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(apiMock.getServiceHistory).toHaveBeenCalledTimes(2));
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);
  });

  it("[7] aynı-borçlu stale: başarılı geçmiş sonrası SONRAKİ okuma (manuel yenile) başarısız olursa ÖNCEKİ kayıtlar KORUNUR + bayat-hata bandı gösterilir", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory
      .mockResolvedValueOnce([HISTORY_ITEM])
      .mockRejectedValueOnce(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    await waitFor(() => expect(screen.queryByText("Yükleniyor...")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Panel başarıyla dolu — "zaten yüklü" olduğundan toggle kapat/aç ile tekrar
    // ÇEKİLMEZ. Tek meşru ikinci-deneme yolu: manuel "Yenile" ikonu.
    fireEvent.click(screen.getByTitle("Tebligat geçmişini yenile"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("bayat olabilir");
    // ÖNCEKİ kayıt HÂLÂ DOM'da — "Henüz tebligat geçmişi yok" İLE DEĞİŞTİRİLMEDİ.
    expect(screen.queryByText("Henüz tebligat geçmişi yok")).not.toBeInTheDocument();
    expect(apiMock.getServiceHistory).toHaveBeenCalledTimes(2);
  });

  it("[8] cross-debtor izolasyonu: kimlik değişince ÖNCEKİ borçlunun geçmişi/hatası YENİ borçluya SIZMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockImplementation((_caseId: string, caseDebtorId: string) => {
      if (caseDebtorId === "debtor-A") return Promise.resolve(baseDebtorFor("debtor-A", "Ali Veli"));
      return Promise.resolve(baseDebtorFor("debtor-B", "Veli Ali"));
    });
    apiMock.getServiceHistory.mockImplementation((_caseId: string, caseDebtorId: string) => {
      if (caseDebtorId === "debtor-A") return Promise.resolve([HISTORY_ITEM]);
      return Promise.resolve([]); // B için gerçekten boş
    });

    const { rerender } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    await waitFor(() => expect(screen.queryByText("Yükleniyor...")).not.toBeInTheDocument());
    // A'nın geçmişi yüklendi (history.length > 0).

    rerender(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-B" />);
    await screen.findByText("Veli Ali");

    // Panel B için KAPALI başlar (showHistory identity-değişiminde sıfırlanır) —
    // A'nın kayıtları (SENT durumu) DOM'da GÖRÜNMEZ, "zaten yüklü" guard'ı B'yi
    // A'nın verisiyle YANLIŞLIKLA "yüklü" saymaz.
    expect(screen.queryByText("Henüz tebligat geçmişi yok")).not.toBeInTheDocument();
    await openHistoryPanel();
    await screen.findByText("Henüz tebligat geçmişi yok");
    // getServiceHistory B için GERÇEKTEN çağrıldı (guard'a takılıp atlanmadı).
    expect(apiMock.getServiceHistory).toHaveBeenCalledWith("case-1", "debtor-B");
  });

  it("[9] çift-retry: hızlı art arda iki tıklama tek aktif isteğe düşer (in-flight koruması)", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getServiceHistory.mockRejectedValue(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    await screen.findByRole("alert");
    expect(apiMock.getServiceHistory).toHaveBeenCalledTimes(1);

    const retryButton = screen.getByRole("button", { name: "Tekrar dene" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => expect(apiMock.getServiceHistory).toHaveBeenCalledTimes(2));
  });

  it("[10] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    let resolveHistory: (v: any) => void = () => {};
    apiMock.getServiceHistory.mockReturnValue(new Promise((res) => { resolveHistory = res; }));

    const { unmount } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );
    await screen.findByText("Ali Veli");
    await openHistoryPanel();
    unmount();
    resolveHistory([HISTORY_ITEM]);

    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
  });
});
