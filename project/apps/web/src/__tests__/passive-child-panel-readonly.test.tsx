import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssetQueryPanel } from "../components/debtor/AssetQueryPanel";
import { AddressResearchWidget } from "../components/address-discovery/AddressResearchWidget";
import { UyapQueryList } from "../components/address-discovery/UyapQueryList";
import { InstitutionLetterList } from "../components/address-discovery/InstitutionLetterList";

const apiMock = vi.hoisted(() => ({
  getAssetSummary: vi.fn(),
  getAssetQueriesForDebtor: vi.fn(),
  runAssetQueries: vi.fn(),
  getDebtorAddresses: vi.fn(),
  getUyapQueriesForDebtor: vi.fn(),
  getInstitutionLettersForDebtor: vi.fn(),
  getClientInfoRequestsForCase: vi.fn(),
  createClientInfoRequest: vi.fn(),
  getSuggestedUyapQueries: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  AssetQueryTypeLabels: {
    VEHICLE: "Vehicle",
    REAL_ESTATE: "Real estate",
    BANK: "Bank",
    SGK_WAGE: "SGK wage",
    SGK_EMPLOYER: "SGK employer",
    TAX: "Tax",
    TRADE_REGISTRY: "Trade registry",
    GSM: "GSM",
  },
  AssetQueryJobStatusLabels: {},
  AssetQueryStatusLabels: {},
}));

vi.mock("@hukuk/ui", () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Spinner: () => <div data-testid="spinner" />,
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children, className: _className }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children, variant: _variant, ...props }: any) => <span {...props}>{children}</span>,
}));

describe("PR-R1 passive child-panel readOnly safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getAssetSummary.mockResolvedValue({
      vehicle: "UNKNOWN",
      realEstate: "UNKNOWN",
      bank: "UNKNOWN",
      sgkWage: "UNKNOWN",
      pendingQueries: 0,
      lastQueryAt: null,
    });
    apiMock.getAssetQueriesForDebtor.mockResolvedValue([]);
    apiMock.runAssetQueries.mockResolvedValue({});
    apiMock.getDebtorAddresses.mockResolvedValue([]);
    apiMock.getUyapQueriesForDebtor.mockResolvedValue([]);
    apiMock.getInstitutionLettersForDebtor.mockResolvedValue([]);
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([]);
    apiMock.createClientInfoRequest.mockResolvedValue({});
    apiMock.getSuggestedUyapQueries.mockResolvedValue([{ queryCode: "NUFUS", name: "Nufus" }]);
  });

  it("AssetQueryPanel hides run controls when readOnly", async () => {
    render(<AssetQueryPanel caseDebtorId="case-debtor-1" readOnly />);

    expect(await screen.findByText(/yeni malvarligi sorgusu kapali/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sorgula/i })).not.toBeInTheDocument();
    expect(apiMock.runAssetQueries).not.toHaveBeenCalled();
  });

  it("AddressResearchWidget disables research action buttons when readOnly", async () => {
    render(
      <AddressResearchWidget
        caseId="case-1"
        caseDebtorId="case-debtor-1"
        debtorId="debtor-1"
        debtorName="Ali Veli"
        debtorType="COMPANY"
        clientId="client-1"
        clientEmail="client@example.test"
        readOnly
      />
    );

    expect(await screen.findByText(/yeni adres arastirma operasyonlari kapali/i)).toBeInTheDocument();

    const actionButtons = screen.getAllByRole("button");
    expect(actionButtons.length).toBeGreaterThan(0);
    for (const button of actionButtons) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }

    expect(apiMock.createClientInfoRequest).not.toHaveBeenCalled();
  });

  it("UyapQueryList hides create controls and skips suggestions when readOnly", async () => {
    render(
      <UyapQueryList
        caseDebtorId="case-debtor-1"
        readOnly
        onCreateQuery={vi.fn()}
        onQueryClick={vi.fn()}
      />
    );

    expect(await screen.findByText(/yeni UYAP sorgusu kapali/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yeni Sorgu/i })).not.toBeInTheDocument();
    expect(apiMock.getSuggestedUyapQueries).not.toHaveBeenCalled();
  });

  it("InstitutionLetterList hides create controls when readOnly", async () => {
    render(
      <InstitutionLetterList
        caseDebtorId="case-debtor-1"
        readOnly
        onCreateLetter={vi.fn()}
        onLetterClick={vi.fn()}
      />
    );

    await waitFor(() => expect(apiMock.getInstitutionLettersForDebtor).toHaveBeenCalled());
    expect(screen.getByText(/yeni kurum yazisi kapali/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yeni/i })).not.toBeInTheDocument();
  });
});
