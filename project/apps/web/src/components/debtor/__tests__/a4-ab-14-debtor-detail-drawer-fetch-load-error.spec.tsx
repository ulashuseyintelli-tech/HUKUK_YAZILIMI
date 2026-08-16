/**
 * WSMR-A4-AB-14 — DebtorDetailDrawer#fetchDebtor okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): `fetchDebtor` hatayı yalnız `console.error` ile yutuyordu;
 * `debtor` null kalıyor ve `isLoading` false olunca render "Borçlu bilgisi
 * bulunamadı" (KESİN YOKLUK iddiası) gösteriyordu — bu, gerçek bir okuma
 * arızasıyla (ağ/500/malformed) borçlunun GERÇEKTEN var olmadığı durumunu
 * AYIRT EDİLEMEZ kılıyordu (icra/enforcement dosyası bağlamında ciddi hukuki
 * yanlış-bilgilendirme riski).
 *
 * Seri zincirin 4. halkası (A4-AB-11→15, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getCaseDebtorDetail: vi.fn(),
  getCrossFileDebtorAlerts: vi.fn().mockResolvedValue({ hasAlert: false }),
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

// Established session convention: promise'i dışarıdan kontrol edebilmek için.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WSMR-A4-AB-14: DebtorDetailDrawer#fetchDebtor okuma hatası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue({ hasAlert: false });
    apiMock.getServiceHistory.mockResolvedValue([]);
  });

  it("[1] ağ hatası: 'Borçlu bilgisi bulunamadı' YAZILMAZ, görünür hata bandı + retry gösterilir", async () => {
    apiMock.getCaseDebtorDetail.mockRejectedValue(new Error("network down"));

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Borçlu detayı yüklenemedi.");
    expect(screen.queryByText("Borçlu bilgisi bulunamadı")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("[2] malformed gövde (service eksik): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtorFor("debtor-A", "Ali Veli"),
      service: undefined,
    });

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Borçlu detayı yüklenemedi.");
    expect(screen.queryByText("Ali Veli")).not.toBeInTheDocument();
  });

  it("[3] gerçek başarı: borçlu bilgileri render edilir, hata bandı yok", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue(baseDebtorFor("debtor-A", "Ali Veli"));

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    await screen.findByText("Ali Veli");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[4] retry başarılı: hata bandı temizlenir, borçlu render edilir", async () => {
    apiMock.getCaseDebtorDetail
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(baseDebtorFor("debtor-A", "Ali Veli"));

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText("Ali Veli");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(2);
  });

  it("[5] retry yalnız fetchDebtor'ı tekrar dener — her denemede yalnız 1 çağrı üretir", async () => {
    apiMock.getCaseDebtorDetail
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down again"));

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    await screen.findByRole("alert");
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => {
      expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(2);
    });
    // Halen hata bandı gösteriliyor (ikinci deneme de başarısız oldu) — başka
    // hiçbir mutation/okuma tetiklenmedi.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Borçlu detayı yüklenemedi."
    );
  });

  it("[6] başarı sonrası ikinci okuma başarısız olursa: önceki borçlu verisi SİLİNMEZ, bayat bandı gösterilir", async () => {
    apiMock.getCaseDebtorDetail
      .mockResolvedValueOnce(baseDebtorFor("debtor-A", "Ali Veli"))
      .mockRejectedValueOnce(new Error("network down"));

    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    await screen.findByText("Ali Veli");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Header'daki manuel "Yenile" ikonu — YALNIZ bu okumayı tekrar dener.
    fireEvent.click(screen.getByTitle("Borçlu bilgisini yenile"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Gösterilen bilgiler bayat olabilir.");
    // Önceki başarılı veri hâlâ DOM'da — "Borçlu bilgisi bulunamadı" ile
    // DEĞİŞTİRİLMEDİ.
    expect(screen.getByText("Ali Veli")).toBeInTheDocument();
  });

  it("[7] kimlik değişimi: önceki borçlunun verisi/hatası YENİ borçlu bağlamında YANLIŞLIKLA görünmez", async () => {
    apiMock.getCaseDebtorDetail.mockImplementation((_caseId: string, caseDebtorId: string) => {
      if (caseDebtorId === "debtor-A") {
        return Promise.resolve(baseDebtorFor("debtor-A", "Ali Veli"));
      }
      return Promise.resolve(baseDebtorFor("debtor-B", "Veli Ali"));
    });

    const { rerender } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    await screen.findByText("Ali Veli");

    rerender(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-B" />
    );

    // A'nın verisi hemen temizlenir (yükleniyor durumuna döner), B render olunca
    // yalnız B görünür — A'nın adı hiçbir noktada B'nin bağlamında kalmaz.
    await screen.findByText("Veli Ali");
    expect(screen.queryByText("Ali Veli")).not.toBeInTheDocument();
  });

  it("[8] çift-retry: hızlı art arda iki tıklama tek aktif isteğe düşer (in-flight koruması)", async () => {
    apiMock.getCaseDebtorDetail.mockRejectedValueOnce(new Error("network down"));
    render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );
    await screen.findByRole("alert");
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(1);

    const retry = deferred<any>();
    apiMock.getCaseDebtorDetail.mockReturnValueOnce(retry.promise);

    const retryButton = screen.getByRole("button", { name: "Tekrar dene" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton); // ikinci tık — in-flight guard'a takılmalı

    retry.resolve(baseDebtorFor("debtor-A", "Ali Veli"));
    await screen.findByText("Ali Veli");

    // İlk deneme (1) + yalnız TEK retry çağrısı (2) = toplam 2, 3 DEĞİL.
    expect(apiMock.getCaseDebtorDetail).toHaveBeenCalledTimes(2);
  });

  it("[9] jenerasyon token: eski kimliğin geç gelen yanıtı yeni kimliğin state'ini EZMEZ", async () => {
    const staleA = deferred<any>();
    const freshB = deferred<any>();

    apiMock.getCaseDebtorDetail.mockImplementation((_caseId: string, caseDebtorId: string) => {
      if (caseDebtorId === "debtor-A") return staleA.promise;
      return freshB.promise;
    });

    const { rerender } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    rerender(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-B" />
    );

    freshB.resolve(baseDebtorFor("debtor-B", "Veli Ali"));
    await screen.findByText("Veli Ali");

    // A'nın (bayat) yanıtı ŞİMDİ gelir — B'nin zaten render edilmiş verisini EZMEMELİ.
    staleA.resolve(baseDebtorFor("debtor-A", "Ali Veli"));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText("Veli Ali")).toBeInTheDocument();
    expect(screen.queryByText("Ali Veli")).not.toBeInTheDocument();
  });

  it("[10] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    const pending = deferred<any>();
    apiMock.getCaseDebtorDetail.mockReturnValue(pending.promise);

    const { unmount } = render(
      <DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="debtor-A" />
    );

    unmount();
    pending.resolve(baseDebtorFor("debtor-A", "Ali Veli"));

    await new Promise((r) => setTimeout(r, 0));
    // Bu noktaya kadar throw/unhandled rejection olmadan ulaşmak testin kendisidir.
    expect(true).toBe(true);
  });
});
