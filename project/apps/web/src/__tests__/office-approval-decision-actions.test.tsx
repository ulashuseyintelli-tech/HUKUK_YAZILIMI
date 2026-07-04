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
import { officeApprovalApi } from "@/lib/api/office-approval";
import { OfficeApprovalDecisionActions } from "@/components/office-approval/OfficeApprovalDecisionActions";

const DETAIL = {
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
  savedIntent: { status: "HITAM" },
  payloadHash: "h1",
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
};

beforeEach(() => {
  (officeApprovalApi.approve as any).mockReset();
  (officeApprovalApi.reject as any).mockReset();
  (officeApprovalApi.requestRevision as any).mockReset();
  (officeApprovalApi.approveWithChanges as any).mockReset();
  (officeApprovalApi.cancel as any).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("OfficeApprovalDecisionActions", () => {
  it("PENDING olmayan statü → hiç render etmez", () => {
    const { container } = render(
      <OfficeApprovalDecisionActions
        detail={{ ...DETAIL, status: "APPROVED" as any }}
        currentUserId="approver-9"
        onDecided={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("reject: gerekçe boşken kaydet butonu disabled; yazınca aktif olur ve api.reject trimlenmiş notla çağrılır", async () => {
    (officeApprovalApi.reject as any).mockResolvedValue({ ...DETAIL, status: "REJECTED" });
    const onDecided = vi.fn();
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={onDecided} />);

    fireEvent.click(screen.getByText("Reddet"));
    const submitBtn = screen.getByRole("button", { name: "Reddet" });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reddetme Gerekçesi/), { target: { value: "  eksik evrak  " } });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => expect(officeApprovalApi.reject).toHaveBeenCalledWith("req1", "eksik evrak"));
    expect(onDecided).toHaveBeenCalledWith(expect.objectContaining({ status: "REJECTED" }));
  });

  it("revizyon: not zorunlu; api.requestRevision çağrılır", async () => {
    (officeApprovalApi.requestRevision as any).mockResolvedValue({ ...DETAIL, status: "REVISION_REQUESTED" });
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);

    fireEvent.click(screen.getByText("Revizyon İste"));
    expect(screen.getByRole("button", { name: "Revizyon İste" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Revizyon Notu/), { target: { value: "tarihi düzelt" } });
    fireEvent.click(screen.getByRole("button", { name: "Revizyon İste" }));

    await waitFor(() => expect(officeApprovalApi.requestRevision).toHaveBeenCalledWith("req1", "tarihi düzelt"));
  });

  it("değiştirerek onayla: textarea savedIntent JSON'u ile önceden dolu gelir", () => {
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);
    fireEvent.click(screen.getByText("Değiştirerek Onayla"));
    const textarea = screen.getByLabelText(/Değiştirilmiş Niyet/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"status": "HITAM"');
  });

  it("değiştirerek onayla: geçersiz JSON → inline hata, api ÇAĞRILMAZ", async () => {
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);
    fireEvent.click(screen.getByText("Değiştirerek Onayla"));
    fireEvent.change(screen.getByLabelText(/Değiştirilmiş Niyet/), { target: { value: "{bozuk json" } });
    fireEvent.click(screen.getByRole("button", { name: "Değiştirerek Onayla" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/geçerli bir JSON nesnesi/));
    expect(officeApprovalApi.approveWithChanges).not.toHaveBeenCalled();
  });

  it("değiştirerek onayla: dizi de reddedilir (nesne şartı)", async () => {
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);
    fireEvent.click(screen.getByText("Değiştirerek Onayla"));
    fireEvent.change(screen.getByLabelText(/Değiştirilmiş Niyet/), { target: { value: '["a"]' } });
    fireEvent.click(screen.getByRole("button", { name: "Değiştirerek Onayla" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(officeApprovalApi.approveWithChanges).not.toHaveBeenCalled();
  });

  it("değiştirerek onayla: geçerli JSON → parse edilmiş nesne ve notla api çağrılır", async () => {
    (officeApprovalApi.approveWithChanges as any).mockResolvedValue({ ...DETAIL, status: "APPROVED_WITH_CHANGES" });
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);
    fireEvent.click(screen.getByText("Değiştirerek Onayla"));
    fireEvent.change(screen.getByLabelText(/Değiştirilmiş Niyet/), { target: { value: '{"status":"BATAK"}' } });
    fireEvent.change(screen.getByLabelText(/Karar Notu/), { target: { value: "aciz değil batak" } });
    fireEvent.click(screen.getByRole("button", { name: "Değiştirerek Onayla" }));

    await waitFor(() =>
      expect(officeApprovalApi.approveWithChanges).toHaveBeenCalledWith("req1", { status: "BATAK" }, "aciz değil batak"),
    );
  });

  it("geri çekme: requester için görünür, onaylayınca api.cancel çağrılır", async () => {
    (officeApprovalApi.cancel as any).mockResolvedValue({ ...DETAIL, status: "CANCELLED" });
    const onDecided = vi.fn();
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="user-1" onDecided={onDecided} />);

    expect(screen.queryByText("Onayla")).toBeNull(); // requester karar butonlarını görmez
    fireEvent.click(screen.getByText("Talebi Geri Çek"));
    expect(screen.getByText(/emin misiniz/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Talebi Geri Çek" }));

    await waitFor(() => expect(officeApprovalApi.cancel).toHaveBeenCalledWith("req1"));
    expect(onDecided).toHaveBeenCalledWith(expect.objectContaining({ status: "CANCELLED" }));
  });

  it("double-submit koruması: istek beklerken kaydet butonu disabled ve 'Kaydediliyor...' gösterir; api TEK kez çağrılır", async () => {
    let resolve!: (v: unknown) => void;
    (officeApprovalApi.approve as any).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);

    fireEvent.click(screen.getByText("Onayla"));
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    const pendingBtn = await screen.findByRole("button", { name: "Kaydediliyor..." });
    expect(pendingBtn).toBeDisabled();
    fireEvent.click(pendingBtn); // ikinci tık — etkisiz olmalı

    resolve({ ...DETAIL, status: "APPROVED" });
    await waitFor(() => expect(officeApprovalApi.approve).toHaveBeenCalledTimes(1));
  });

  it("backend hatası → mesaj okunabilir gösterilir, onDecided ÇAĞRILMAZ, buton tekrar aktif", async () => {
    (officeApprovalApi.approve as any).mockRejectedValue(new Error("Kendi talebini onaylayamazsın."));
    const onDecided = vi.fn();
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={onDecided} />);

    fireEvent.click(screen.getByText("Onayla"));
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Kendi talebini onaylayamazsın."));
    expect(onDecided).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Onayla" })).not.toBeDisabled();
  });

  it("Vazgeç → panel kapanır, api çağrılmaz", () => {
    render(<OfficeApprovalDecisionActions detail={DETAIL} currentUserId="approver-9" onDecided={vi.fn()} />);
    fireEvent.click(screen.getByText("Reddet"));
    fireEvent.click(screen.getByText("Vazgeç"));
    expect(screen.getByText("Onayla")).toBeInTheDocument(); // aksiyon satırı geri geldi
    expect(officeApprovalApi.reject).not.toHaveBeenCalled();
  });
});
