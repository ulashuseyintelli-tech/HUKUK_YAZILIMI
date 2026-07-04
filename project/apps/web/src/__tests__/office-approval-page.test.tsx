import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api/office-approval", () => ({
  officeApprovalApi: {
    getInbox: vi.fn(),
    getDetail: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    requestRevision: vi.fn(),
    approveWithChanges: vi.fn(),
    cancel: vi.fn(),
  },
}));
// Drawer useAuth kullanır (karar aksiyonları); page testi drawer'ı gerçek render eder → mock şart.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "approver-9" } }),
}));
import { officeApprovalApi } from "@/lib/api/office-approval";
import OfficeApprovalsPage from "@/app/(dashboard)/office-approvals/page";

beforeEach(() => {
  (officeApprovalApi.getInbox as any).mockReset();
  (officeApprovalApi.getDetail as any).mockReset();
  (officeApprovalApi.approve as any).mockReset();
});
afterEach(() => vi.restoreAllMocks());

const ROW = {
  id: "req1",
  actionCode: "CHANGE_STATUS",
  targetType: "LegalCase",
  targetRef: "case-123",
  status: "PENDING_APPROVAL" as const,
  executionStatus: "NOT_RUN",
  requesterUserId: "user-1",
  approverUserId: null,
  hasReplacement: false,
  reason: null,
  createdAt: "2026-07-01T00:00:00Z",
  decidedAt: null,
  expiresAt: null,
};

describe("OfficeApprovalsPage (P4-4 read-only inbox)", () => {
  it("varsayılan filtre PENDING_APPROVAL ile çağrılır", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("PENDING_APPROVAL"));
  });

  it("boş liste → 'Bekleyen onay yok'", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("Bekleyen onay yok")).toBeInTheDocument());
  });

  it("hata → hata mesajı gösterilir, boş-liste mesajından FARKLI", async () => {
    (officeApprovalApi.getInbox as any).mockRejectedValue(new Error("Sunucu hatası"));
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("Sunucu hatası")).toBeInTheDocument());
    expect(screen.queryByText("Bekleyen onay yok")).toBeNull();
  });

  it("dolu liste → satır render eder; tıklayınca detay drawer açılır ve doğru id ile getDetail çağrılır", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([ROW]);
    (officeApprovalApi.getDetail as any).mockResolvedValue({
      ...ROW,
      savedIntent: { status: "ISLEMDE" },
      payloadHash: "h1",
      replacementSavedIntent: null,
      replacementPayloadHash: null,
      decisionNote: null,
      executedAt: null,
    });
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("CHANGE_STATUS")).toBeInTheDocument());
    expect(screen.getByText(/case-123/)).toBeInTheDocument();
    expect(screen.getByText(/user-1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("CHANGE_STATUS"));
    expect(screen.getByText("Onay Talebi Detayı")).toBeInTheDocument();
    await waitFor(() => expect(officeApprovalApi.getDetail).toHaveBeenCalledWith("req1"));
  });

  it("status dropdown değiştirilince getInbox yeni değerle tekrar çağrılır", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("PENDING_APPROVAL"));

    fireEvent.change(screen.getByLabelText("Durum filtresi"), { target: { value: "APPROVED" } });
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("APPROVED"));
  });

  it("drawer içinde karar verilince liste yenilenir (onDecided → getInbox tekrar çağrılır)", async () => {
    const detail = {
      ...ROW,
      savedIntent: { status: "HITAM" },
      payloadHash: "h1",
      replacementSavedIntent: null,
      replacementPayloadHash: null,
      decisionNote: null,
      executedAt: null,
    };
    (officeApprovalApi.getInbox as any).mockResolvedValue([ROW]);
    (officeApprovalApi.getDetail as any).mockResolvedValue(detail);
    (officeApprovalApi.approve as any).mockResolvedValue({ ...detail, status: "APPROVED" });

    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("CHANGE_STATUS")).toBeInTheDocument());
    expect(officeApprovalApi.getInbox).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("CHANGE_STATUS")); // drawer aç
    await waitFor(() => expect(screen.getAllByText("Onayla").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("Onayla")); // aksiyon paneli
    fireEvent.click(screen.getByRole("button", { name: "Onayla" })); // kaydet

    await waitFor(() => expect(officeApprovalApi.approve).toHaveBeenCalledWith("req1", ""));
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledTimes(2));
  });
});
