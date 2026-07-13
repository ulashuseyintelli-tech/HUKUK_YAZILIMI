import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceStatusBadge } from "../components/debtor/ServiceStatusBadge";
import { DebtorDetailDrawer } from "../components/debtor/DebtorDetailDrawer";

/**
 * MPB-028(a) PR-4 (owner revizyonu, 2026-07-14 — "PR-4 dar düzeltme") — frontend.
 *
 * `finalizationDate` (LEGACY PROJECTION — GERÇEK bir kesinleşme olgusu DEĞİLDİR, yalnız
 * tebliğ+7 gün tahmini) ile `finalizationRequestEligibleDate` (kanonik hukuki süre motorunun
 * ürettiği, kesinleştirme talebi için uygunluk süre hesabı) KESİNLİKLE ayrı tutulur. Owner kararı:
 * flag AÇIKKEN (finalizationEligibilitySource !== LEGACY) "Kesinleşti"/"Kesinleşme tarihi"
 * ifadesi ASLA gösterilmez — itiraz/durdurucu-etki fact'i henüz kanonik olarak
 * modellenmediği için sistem bunu bilerek nötr/UNRESOLVED bırakır.
 */

const apiMock = vi.hoisted(() => ({
  getCaseDebtorDetail: vi.fn(),
  updateServiceStatus: vi.fn(),
  startNewServiceAttempt: vi.fn(),
  updateDebtorQuickNote: vi.fn(),
  getDebtor: vi.fn(),
  setActiveAddress: vi.fn(),
  getCrossFileDebtorAlerts: vi.fn().mockResolvedValue({ hasAlert: false }),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  DebtorRoleLabels: { ASIL_BORCLU: "Asil Borclu", KEFIL: "Kefil" },
}));

vi.mock("../components/debtor/AddressListSection", () => ({
  AddressListSection: () => <div data-testid="address-list" />,
}));
vi.mock("../components/debtor/NotificationChainPanel", () => ({
  NotificationChainPanel: () => <div data-testid="notification-chain" />,
}));
vi.mock("../components/debtor/AssetQueryPanel", () => ({
  AssetQueryPanel: () => <div data-testid="asset-query-panel" />,
}));
vi.mock("../components/address-discovery", () => ({
  AddressResearchWidget: () => <div data-testid="address-research-widget" />,
}));
vi.mock("../components/case/IntelStatementSection", () => ({
  IntelStatementSection: () => <div data-testid="intel-statement-section" />,
}));
vi.mock("../components/debtor/modals/ServiceUpdateModal", () => ({
  ServiceUpdateModal: () => null,
}));
vi.mock("../components/debtor/NewDebtorModal", () => ({
  NewDebtorModal: () => <div data-testid="new-debtor-modal" />,
}));

const baseDebtor = {
  id: "debtor-1",
  caseDebtorId: "case-debtor-1",
  displayName: "Ali Veli",
  personType: "REAL",
  role: "ASIL_BORCLU",
  lifecycleStatus: "ACTIVE",
  serviceStatus: "DELIVERED",
  serviceLabel: "Tebliğ Edildi",
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
  riskFlags: [],
  quickNote: "",
};

describe("MPB-028(a) PR-4: ServiceStatusBadge — finalizationDate vs finalizationRequestEligibleDate", () => {
  it("flag kapalıyken (finalizationEligibilitySource yok) finalizationDate geçmişteyse FINALIZED/Kesinleşti gösterir — davranış değişmez", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    render(<ServiceStatusBadge status={"DELIVERED" as any} finalizationDate={past} />);
    expect(screen.getByText(/Kesinleşti/)).toBeInTheDocument();
  });

  it("flag açık (finalizationEligibilitySource=CANONICAL) iken finalizationDate geçmişte OLSA BİLE ASLA 'Kesinleşti' göstermez", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    render(
      <ServiceStatusBadge
        status={"DELIVERED" as any}
        finalizationDate={past}
        finalizationEligibilitySource="CANONICAL"
        finalizationRequestEligibleDate={new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()}
      />
    );
    expect(screen.getByText("Tebliğ Edildi")).toBeInTheDocument();
    expect(screen.queryByText(/Kesinleşti/)).not.toBeInTheDocument();
  });

  it("CANONICAL eligibility (gelecek tarih) tooltip'te 'Kesinleştirme talebine N gün' gösterir, 'Kesinleşti' yazmaz", () => {
    const eligibleFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <ServiceStatusBadge
        status={"DELIVERED" as any}
        finalizationRequestEligibleDate={eligibleFuture}
        finalizationEligibilitySource="CANONICAL"
      />
    );
    expect(screen.getByTitle(/Kesinleştirme talebine 10 gün/)).toBeInTheDocument();
    // "Kesinleşti(?!rme)": "Kesinleştirme" (bu testte beklenen, doğru ifade) kelimesini hariç
    // tutar; asıl kontrol edilen, LEGACY'nin ürettiği "Kesinleşti"/"Kesinleşme:" hükmünün YOK olmasıdır.
    expect(screen.queryByTitle(/Kesinleşti(?!rme)/)).not.toBeInTheDocument();
  });

  it("UNRESOLVED: tahmini tarih göstermez, nötr tooltip verir", () => {
    render(
      <ServiceStatusBadge status={"DELIVERED" as any} finalizationEligibilitySource="UNRESOLVED" />
    );
    expect(
      screen.getByTitle(/Kesinleştirme talebi için uygunluk hesaplanamadı/)
    ).toBeInTheDocument();
  });
});

describe("MPB-028(a) PR-4: DebtorDetailDrawer — finalizationDate ve finalizationRequestEligibility ayrımı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getCrossFileDebtorAlerts.mockResolvedValue({ hasAlert: false });
  });

  it("LEGACY (flag kapalı / backward-compat): yalnız mevcut client-side +7 gün göstergesi render edilir, eligibility bloğu HİÇ render edilmez", async () => {
    const deliveredAt = "2026-05-01T00:00:00.000Z";
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtor,
      service: { status: "DELIVERED", deliveredAt },
      finalizationDate: undefined,
      finalizationRequestEligibleDate: undefined,
      finalizationEligibilitySource: "LEGACY",
    });

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="case-debtor-1" />);

    expect(await screen.findByText("✓ Kesinleşti")).toBeInTheDocument();
    expect(screen.queryByText("Kesinleştirme Talebi Uygunluğu")).not.toBeInTheDocument();
  });

  it("CANONICAL: finalizationDate geçmişte olsa bile 'Kesinleşti' göstergesi HİÇ render edilmez, yalnız 'Kesinleştirme talebine N gün' gösterilir", async () => {
    const eligibleDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtor,
      service: { status: "DELIVERED", deliveredAt: "2026-05-01T00:00:00.000Z" },
      finalizationDate: new Date("2026-05-08T00:00:00.000Z").toISOString(), // LEGACY projection — geçmişte
      finalizationRequestEligibleDate: eligibleDate,
      finalizationEligibilitySource: "CANONICAL",
    });

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="case-debtor-1" />);

    // Flag açıkken finalizationDate (LEGACY projection) ARTIK hiç render edilmez — "Kesinleşti" YOK.
    await screen.findByText("Kesinleştirme Talebi Uygunluğu");
    expect(screen.queryByText("✓ Kesinleşti")).not.toBeInTheDocument();
    expect(screen.queryByText(/Kesinleşme:/)).not.toBeInTheDocument();
    expect(screen.getByText("Kesinleştirme talebine 30 gün")).toBeInTheDocument();
  });

  it("UNRESOLVED: eligibility bloğu 'Hesaplanamadı' gösterir, tahmini tarih üretmez, 'Kesinleşti' hiç görünmez", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtor,
      service: { status: "DELIVERED", deliveredAt: "2026-05-01T00:00:00.000Z" },
      finalizationDate: new Date("2026-05-08T00:00:00.000Z").toISOString(),
      finalizationRequestEligibleDate: undefined,
      finalizationEligibilitySource: "UNRESOLVED",
    });

    render(<DebtorDetailDrawer isOpen onClose={vi.fn()} caseId="case-1" caseDebtorId="case-debtor-1" />);

    expect(await screen.findByText("Hesaplanamadı")).toBeInTheDocument();
    expect(screen.queryByText("✓ Kesinleşti")).not.toBeInTheDocument();
    expect(screen.queryByText(/Kesinleştirme talebine \d/)).not.toBeInTheDocument();
  });
});
