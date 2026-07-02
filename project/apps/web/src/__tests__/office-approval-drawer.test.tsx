import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/office-approval", () => ({
  officeApprovalApi: { getInbox: vi.fn(), getDetail: vi.fn() },
}));
import { officeApprovalApi } from "@/lib/api/office-approval";
import { OfficeApprovalDetailDrawer } from "@/components/office-approval/OfficeApprovalDetailDrawer";

beforeEach(() => {
  (officeApprovalApi.getDetail as any).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("OfficeApprovalDetailDrawer (P4-4 read-only)", () => {
  it("requestId null → render etmez", () => {
    const { container } = render(<OfficeApprovalDetailDrawer requestId={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(officeApprovalApi.getDetail).not.toHaveBeenCalled();
  });

  it("requestId verilince getDetail çağrılır; yüklenene kadar 'Yükleniyor...' gösterilir", async () => {
    let resolve!: (v: unknown) => void;
    (officeApprovalApi.getDetail as any).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
    resolve({
      id: "req1",
      actionCode: "CHANGE_STATUS",
      targetType: "LegalCase",
      targetRef: "case-123",
      status: "PENDING_APPROVAL",
      executionStatus: "NOT_RUN",
      requesterUserId: "user-1",
      approverUserId: null,
      hasReplacement: false,
      reason: "Dosya kapanışı",
      createdAt: "2026-07-01T00:00:00Z",
      decidedAt: null,
      expiresAt: null,
      savedIntent: { status: "HITAM" },
      payloadHash: "h1",
      replacementSavedIntent: null,
      replacementPayloadHash: null,
      decisionNote: null,
      executedAt: null,
    });
    await waitFor(() => expect(screen.getByText("CHANGE_STATUS")).toBeInTheDocument());
  });

  it("hata → hata mesajı gösterilir", async () => {
    (officeApprovalApi.getDetail as any).mockRejectedValue(new Error("Talep bulunamadı"));
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Talep bulunamadı")).toBeInTheDocument());
  });

  it("savedIntent JSON okunabilir şekilde <pre> içinde render edilir", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue({
      id: "req1",
      actionCode: "CHANGE_STATUS",
      targetType: "LegalCase",
      targetRef: "case-123",
      status: "PENDING_APPROVAL",
      executionStatus: "NOT_RUN",
      requesterUserId: "user-1",
      approverUserId: null,
      hasReplacement: false,
      reason: null,
      createdAt: "2026-07-01T00:00:00Z",
      decidedAt: null,
      expiresAt: null,
      savedIntent: { status: "HITAM", reason: "test" },
      payloadHash: "h1",
      replacementSavedIntent: null,
      replacementPayloadHash: null,
      decisionNote: null,
      executedAt: null,
    });
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Kayıtlı Niyet (savedIntent)")).toBeInTheDocument());
    expect(screen.getByText(/"status": "HITAM"/)).toBeInTheDocument();
  });

  it("financeVisibility.applied=true → maskeleme uyarısı gösterilir", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue({
      id: "req1",
      actionCode: "COLLECTION_DISPOSITION_POST",
      targetType: "COLLECTION_DISPOSITION",
      targetRef: "disp-1",
      status: "PENDING_APPROVAL",
      executionStatus: "NOT_RUN",
      requesterUserId: "user-1",
      approverUserId: null,
      hasReplacement: false,
      reason: null,
      createdAt: "2026-07-01T00:00:00Z",
      decidedAt: null,
      expiresAt: null,
      savedIntent: { totalAmount: 1000 },
      payloadHash: "h1",
      replacementSavedIntent: null,
      replacementPayloadHash: null,
      decisionNote: null,
      executedAt: null,
      financeVisibility: { applied: true, level: "MASKED", contractVersion: "v1", maskedFields: ["savedIntent.lines"] },
    });
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/maskelenmiştir/)).toBeInTheDocument());
  });
});
