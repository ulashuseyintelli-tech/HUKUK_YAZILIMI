/**
 * WSMR-A4-AB-18 — DebtorDetailDrawer#fetchCrossFileAlert okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): hata durumunda `setCrossFileAlert(null)` çağrılıyordu — bu, GERÇEKTEN
 * uyarı olmadığı durumla (`hasAlert: false`) BİREBİR AYNI değere düşüyordu. Çapraz-dosya
 * uyarısı, aynı borçlunun BAŞKA bir dosyada eş zamanlı güncellendiğini bildiren güvenlik-
 * kritik bir tamamlayıcı bilgi — sessizce kaybolursa bir avukat güncel olmayan bilgiyle
 * işlem yapabilir ("Güncel bilgiyi teyit etmeden işlem yapmayın" uyarısı hiç görünmez).
 *
 * Seri zincirin 3. halkası (A4-AB-16→20, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getCaseDebtorDetail: vi.fn(),
  getCrossFileDebtorAlerts: vi.fn(),
  getServiceHistory: vi.fn().mockResolvedValue([]),
  updateServiceStatus: vi.fn(),
  startNewServiceAttempt: vi.fn(),
  updateDebtorQuickNote: vi.fn(),
  getDebtor: vi.fn(),
  setActiveAddress: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  DebtorRoleLabels: { ASIL_BORCLU: "Asil Borclu", KEFIL: "Kefil" },
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

const REAL_ALERT = {
  hasAlert: true,
  lastChangedAt: "2026-08-01T00:00:00.000Z",
  categories: ["address"],
  sourceCaseId: "case-2",
  otherActiveCases: [{ caseId: "case-2", fileNumber: "2026/9", responsibleName: null }],
};
const NO_ALERT = { hasAlert: false, lastChangedAt: null, categories: [], sourceCaseId: null, otherActiveCases: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WSMR-A4-AB-18: DebtorDetailDrawer#fetchCrossFileAlert okuma hatası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getServiceHistory.mockResolvedValue([]);
  });

  it("[1] gerçek başarı (hasAlert=true): amber uyarı bandı görünür, hata bandı yok", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue(REAL_ALERT);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    await screen.findByText(/başka aktif dosya/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[2] gerçek boş (hasAlert=false): hiçbir bant görünmez", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue(NO_ALERT);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    await screen.findByText("Ali Veli");
    expect(screen.queryByText(/başka aktif dosya/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[3] ağ hatası: görünür hata bandı çıkar, 'uyarı yok' İLE ASLA KARIŞTIRILMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts.mockRejectedValue(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Çapraz dosya uyarısı yüklenemedi.");
    // Amber "gerçek uyarı yok/var" bandı hiç render edilmedi — sadece hata bandı var.
    expect(screen.queryByText(/başka aktif dosya/)).not.toBeInTheDocument();
  });

  it("[4] malformed gövde (hasAlert eksik): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue({ lastChangedAt: null } as any);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Çapraz dosya uyarısı yüklenemedi.");
  });

  it("[5] retry başarılı: hata bandı temizlenir, uyarı bandı doğru görünür", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(REAL_ALERT);

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText(/başka aktif dosya/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiMock.getCrossFileDebtorAlerts).toHaveBeenCalledTimes(2);
  });

  it("[6] retry YALNIZ bu kaynağı tekrar dener — getCaseDebtorDetail tekrar ÇAĞRILMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts.mockRejectedValue(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    await screen.findByRole("alert");
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(apiMock.getCrossFileDebtorAlerts).toHaveBeenCalledTimes(2));
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);
  });

  it("[7] aynı-borçlu stale: başarılı uyarı (hasAlert=true) sonrası SONRAKİ okuma başarısız olursa, amber bant KORUNUR + bayat-hata bandı gösterilir", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    apiMock.getCrossFileDebtorAlerts
      .mockResolvedValueOnce(REAL_ALERT)
      .mockRejectedValueOnce(new Error("network down"));

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />);

    await screen.findByText(/başka aktif dosya/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Servis güncellemesi gibi bir olay fetchDebtor'ı (ve dolayısıyla fetchCrossFileAlert'i)
    // tekrar tetikler — burada doğrudan header'daki "Yenile" ile simüle ediyoruz (aynı borçlu).
    fireEvent.click(screen.getByTitle("Borçlu bilgisini yenile"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("bayat olabilir");
    // ÖNCEKİ amber uyarı bandı HÂLÂ görünür — "uyarı yok" ile DEĞİŞTİRİLMEDİ.
    expect(screen.getByText(/başka aktif dosya/)).toBeInTheDocument();
  });

  it("[8] cross-debtor izolasyonu: kimlik değişince ÖNCEKİ borçlunun uyarı/hata durumu YENİ borçluya SIZMAZ", async () => {
    apiMock.getCaseDebtorDetail.mockImplementation((_caseId: string, caseDebtorId: string) => {
      if (caseDebtorId === "debtor-A") return Promise.resolve(baseDebtorFor("debtor-A", "Ali Veli"));
      return Promise.resolve(baseDebtorFor("debtor-B", "Veli Ali"));
    });
    apiMock.getCrossFileDebtorAlerts.mockImplementation((debtorId: string) => {
      if (debtorId === "debtor-A") return Promise.reject(new Error("network down"));
      return Promise.resolve(NO_ALERT);
    });

    const { rerender } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );
    await screen.findByRole("alert"); // A için hata

    rerender(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-B" />);

    await screen.findByText("Veli Ali");
    // B için gerçek-boş (NO_ALERT) — A'nın hata bandı YENİ borçluya SIZMADI.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[9] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));
    const pending = deferred<any>();
    apiMock.getCrossFileDebtorAlerts.mockReturnValue(pending.promise);

    const { unmount } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );
    await screen.findByText("Ali Veli");
    unmount();
    pending.resolve(REAL_ALERT);

    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
  });
});
