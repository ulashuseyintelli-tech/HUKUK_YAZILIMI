import { readFileSync } from "node:fs";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClaimItemPanel } from "@/components/claim-item/ClaimItemPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const put = api.put as unknown as ReturnType<typeof vi.fn>;

const mockItems = [
  { id: "i1", itemType: "PRINCIPAL", amount: 1000, currency: "TRY", description: "Asil Alacak" },
];
const mockSummary = {
  currency: "TRY",
  totals: {
    principal: 1000,
    preInterest: 0,
    postInterest: 0,
    totalInterest: 0,
    expense: 0,
    fee: 0,
    attorneyFee: 0,
    penalty: 0,
    tax: 0,
    other: 0,
    grandTotal: 1000,
  },
};

function primeApi() {
  get.mockImplementation((url: string) =>
    url.endsWith("/summary")
      ? Promise.resolve({ data: { data: mockSummary } })
      : Promise.resolve({ data: { data: mockItems } }),
  );
  put.mockResolvedValue({ data: { data: { ...mockItems[0] } } });
}

function readCasePageSource() {
  return readFileSync("src/app/(dashboard)/cases/[id]/page.tsx", "utf8");
}

describe("claim item metadata dependent refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeApi();
  });

  it("metadata edit success notifies parent dependent refresh callback", async () => {
    const onMetadataEditSuccess = vi.fn();

    render(
      <ClaimItemPanel
        caseId="c1"
        readOnly
        metadataEdit
        onMetadataEditSuccess={onMetadataEditSuccess}
      />,
    );

    await waitFor(() => expect(screen.getByText(/D.*zenle/)).toBeTruthy());
    fireEvent.click(screen.getByText(/D.*zenle/));
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    expect(onMetadataEditSuccess).toHaveBeenCalledTimes(1);
  });

  it("case page wires claim item metadata success to finance refresh key", () => {
    const source = readCasePageSource();
    const claimItemPanelStart = source.indexOf("<ClaimItemPanel");
    const claimItemPanelBlock = source.slice(
      claimItemPanelStart,
      source.indexOf("/>", claimItemPanelStart) + 2,
    );
    const refreshHelperStart = source.indexOf("const refreshClaimItemMetadataDependentViews");
    const refreshHelperBlock = source.slice(
      refreshHelperStart,
      source.indexOf("  // Fetch address", refreshHelperStart),
    );

    expect(claimItemPanelBlock).toContain("onMetadataEditSuccess={refreshClaimItemMetadataDependentViews}");
    expect(claimItemPanelBlock).not.toContain("refreshCollectionDependentViews");
    expect(refreshHelperBlock).toContain("setFinancialSummaryRefreshKey((key) => key + 1);");
  });
});