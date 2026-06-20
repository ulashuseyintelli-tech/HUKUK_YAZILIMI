import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DebtorRow } from "../components/debtor/DebtorRow";
import { DebtorDetailDrawer } from "../components/debtor/DebtorDetailDrawer";

const apiMock = vi.hoisted(() => ({
  getCaseDebtorDetail: vi.fn(),
  updateServiceStatus: vi.fn(),
  startNewServiceAttempt: vi.fn(),
  updateDebtorQuickNote: vi.fn(),
  getDebtor: vi.fn(),
  setActiveAddress: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  return {
    api: apiMock,
    DebtorRoleLabels: {
      ASIL_BORCLU: "Asil Borclu",
      KEFIL: "Kefil",
    },
  };
});

vi.mock("../components/debtor/AddressListSection", () => ({
  AddressListSection: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="address-list" data-readonly={String(!!readOnly)} />
  ),
}));

vi.mock("../components/debtor/NotificationChainPanel", () => ({
  NotificationChainPanel: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="notification-chain" data-readonly={String(!!readOnly)} />
  ),
}));

vi.mock("../components/debtor/AssetQueryPanel", () => ({
  AssetQueryPanel: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="asset-query-panel" data-readonly={String(!!readOnly)} />
  ),
}));

vi.mock("../components/address-discovery", () => ({
  AddressResearchWidget: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="address-research-widget" data-readonly={String(!!readOnly)} />
  ),
}));

vi.mock("../components/debtor/modals/ServiceUpdateModal", () => ({
  ServiceUpdateModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="service-update-modal" /> : null,
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
  serviceStatus: "RETURNED",
  serviceLabel: "Iade",
  assets: {
    vehicle: "UNKNOWN",
    realEstate: "UNKNOWN",
    bank: "UNKNOWN",
    sgkWage: "UNKNOWN",
  },
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
  service: {
    status: "RETURNED",
  },
  riskFlags: [],
  quickNote: "Eski not",
};

describe("PR-L7b passive CaseDebtor UI safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passive debtor row badge visible", () => {
    render(
      <DebtorRow
        debtor={{
          ...baseDebtor,
          lifecycleStatus: "PASSIVE",
        } as any}
      />
    );

    expect(screen.getByText("Pasif")).toBeInTheDocument();
  });

  it("passive drawer disables operational controls and propagates readOnly", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtor,
      lifecycleStatus: "PASSIVE",
    });

    render(
      <DebtorDetailDrawer
        isOpen
        onClose={vi.fn()}
        caseId="case-1"
        caseDebtorId="case-debtor-1"
      />
    );

    expect(await screen.findByText("Pasif")).toBeInTheDocument();
    expect(screen.getByText(/Salt okunur/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Guncelle|Güncelle/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Duzenle|Düzenle/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Yeni Deneme/i })).not.toBeInTheDocument();

    expect(screen.getByTestId("address-list")).toHaveAttribute("data-readonly", "true");
    expect(screen.getByTestId("notification-chain")).toHaveAttribute("data-readonly", "true");

    fireEvent.click(screen.getByText("Eski not"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Malvar/i }));
    expect(await screen.findByTestId("asset-query-panel")).toHaveAttribute("data-readonly", "true");

    fireEvent.click(screen.getByRole("button", { name: /Adres Ara/i }));
    expect(await screen.findByTestId("address-research-widget")).toHaveAttribute("data-readonly", "true");
  });

  it("active drawer keeps operational controls enabled", async () => {
    apiMock.getCaseDebtorDetail.mockResolvedValue({
      ...baseDebtor,
      lifecycleStatus: "ACTIVE",
    });

    render(
      <DebtorDetailDrawer
        isOpen
        onClose={vi.fn()}
        caseId="case-1"
        caseDebtorId="case-debtor-1"
      />
    );

    await waitFor(() => expect(apiMock.getCaseDebtorDetail).toHaveBeenCalled());

    expect(screen.queryByText(/Salt okunur/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guncelle|Güncelle/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Duzenle|Düzenle/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Yeni Deneme/i })).toBeEnabled();
    expect(screen.getByTestId("address-list")).toHaveAttribute("data-readonly", "false");

    fireEvent.click(screen.getByText("Eski not"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
