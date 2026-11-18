/**
 * P02 kullanılabilirlik notu U-8 (owner 18.11.2026) — Onay Kutusu talep ayrıntısı: masaüstünde geniş; talep bilgileri ve
 * "talep edilen değişiklik" yan yana; karar düğmeleri altta yapışık şeritte; Escape kapatır. İçerik ve karar kuralları AYNEN
 * (talep sahibi kendi talebini onaylayamaz — karar düğmeleri ona gösterilmez).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/api/office-approval", () => ({
  officeApprovalApi: {
    getInbox: vi.fn(), getDetail: vi.fn(), approve: vi.fn(), reject: vi.fn(), requestRevision: vi.fn(), approveWithChanges: vi.fn(), cancel: vi.fn(),
  },
}));
const authState: { user: { id: string } | null } = { user: { id: "approver-9" } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/api/client-accounting", () => ({ clientAccountingApi: { finalizePayout: vi.fn() } }));
import { officeApprovalApi } from "@/lib/api/office-approval";
import { OfficeApprovalDetailDrawer } from "@/components/office-approval/OfficeApprovalDetailDrawer";

const DETAIL = {
  id: "req1", actionCode: "CHANGE_STATUS", targetType: "LegalCase", targetRef: "case-123", status: "PENDING_APPROVAL",
  executionStatus: "NOT_RUN", requesterUserId: "user-1", approverUserId: null, hasReplacement: false, reason: "Dosya kapanışı",
  createdAt: "2026-07-01T00:00:00Z", decidedAt: null, expiresAt: null, savedIntent: { status: "HITAM" }, payloadHash: "h1",
  replacementSavedIntent: null, replacementPayloadHash: null, decisionNote: null, executedAt: null,
};

beforeEach(() => {
  (officeApprovalApi.getDetail as any).mockReset();
  (officeApprovalApi.approve as any).mockReset();
  authState.user = { id: "approver-9" };
});
afterEach(() => vi.restoreAllMocks());

describe("OfficeApprovalDetailDrawer — yerleşim (U-8)", () => {
  it("geniş diyalog; bilgiler ve talep edilen değişiklik iki sütunda; karar düğmeleri yapışık şeritte", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue(DETAIL);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("approval-detail-columns")).toBeInTheDocument());
    const dialog = screen.getByRole("dialog", { name: "Onay talebi detayı" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.querySelector(".lg\\:max-w-4xl")).not.toBeNull();
    expect(screen.getByTestId("approval-detail-columns").className).toContain("lg:grid-cols-2");
    expect(within(screen.getByTestId("approval-detail-facts")).getByText("İşlem")).toBeInTheDocument();
    expect(within(screen.getByTestId("approval-detail-intent")).getByText(/Talep edilen değişiklik/)).toBeInTheDocument();
    const actions = screen.getByTestId("approval-detail-actions");
    expect(actions.className).toContain("sticky");
    expect(within(actions).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("talep sahibi kendi talebinde karar düğmelerini görmez (şerit boş kalır, gizlenir)", async () => {
    authState.user = { id: "user-1" };
    (officeApprovalApi.getDetail as any).mockResolvedValue(DETAIL);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("approval-detail-columns")).toBeInTheDocument());
    const actions = screen.getByTestId("approval-detail-actions");
    expect(within(actions).queryByRole("button", { name: /^Onayla$/ })).toBeNull();
    expect(actions.className).toContain("empty:hidden");
  });

  it("Escape kapatır; üstte başka kalıcı pencere varken kapatmaz", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue(DETAIL);
    const onClose = vi.fn();
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId("approval-detail-columns")).toBeInTheDocument());
    const other = document.createElement("div");
    other.setAttribute("aria-modal", "true");
    document.body.appendChild(other);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    other.remove();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
