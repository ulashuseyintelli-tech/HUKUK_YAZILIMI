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
// Drawer useAuth kullanır (karar aksiyonları görünürlüğü); testte AuthProvider yerine mutable mock.
const authState: { user: { id: string } | null } = { user: { id: "approver-9" } };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authState,
}));
vi.mock("@/lib/api/client-accounting", () => ({
  clientAccountingApi: { finalizePayout: vi.fn() },
}));
import { officeApprovalApi } from "@/lib/api/office-approval";
import { clientAccountingApi } from "@/lib/api/client-accounting";
import { OfficeApprovalDetailDrawer } from "@/components/office-approval/OfficeApprovalDetailDrawer";

beforeEach(() => {
  (officeApprovalApi.getDetail as any).mockReset();
  (officeApprovalApi.approve as any).mockReset();
  (clientAccountingApi.finalizePayout as any).mockReset();
  authState.user = { id: "approver-9" };
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

  it("savedIntent özetlenebiliyorsa (CHANGE_STATUS) özet gösterilir; ham JSON 'Advanced' altında erişilebilir kalır", async () => {
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
    // Özet render edilir (payload'dan): Yeni Durum = HITAM.
    expect(screen.getByText("HITAM")).toBeInTheDocument();
    // Ham JSON varsayılan olarak KAPALI (özet mevcutken) — kaldırılmadı, "Advanced" ile erişilebilir.
    expect(screen.queryByText(/"status": "HITAM"/)).toBeNull();
    fireEvent.click(screen.getByText("Advanced / Ham JSON"));
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

const PENDING_DETAIL = {
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
  savedIntent: { status: "HITAM" },
  payloadHash: "h1",
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
};

describe("OfficeApprovalDetailDrawer (Decision UI entegrasyonu)", () => {
  it("PENDING + requester-olmayan görüntüleyici → karar butonları görünür, 'Talebi Geri Çek' görünmez", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue(PENDING_DETAIL);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Onayla")).toBeInTheDocument());
    expect(screen.getByText("Reddet")).toBeInTheDocument();
    expect(screen.getByText("Revizyon İste")).toBeInTheDocument();
    expect(screen.getByText("Değiştirerek Onayla")).toBeInTheDocument();
    expect(screen.queryByText("Talebi Geri Çek")).toBeNull();
  });

  it("terminal statü (REJECTED) → hiçbir karar aksiyonu render edilmez", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue({ ...PENDING_DETAIL, status: "REJECTED" });
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("CHANGE_STATUS")).toBeInTheDocument());
    expect(screen.queryByTestId("decision-actions")).toBeNull();
  });

  it("requester kendisi → yalnız 'Talebi Geri Çek' görünür", async () => {
    authState.user = { id: "user-1" };
    (officeApprovalApi.getDetail as any).mockResolvedValue(PENDING_DETAIL);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Talebi Geri Çek")).toBeInTheDocument());
    expect(screen.queryByText("Onayla")).toBeNull();
    expect(screen.queryByText("Reddet")).toBeNull();
  });

  it("onay akışı: Onayla → panel → kaydet → api.approve çağrılır, drawer güncel statüyü gösterir, onDecided tetiklenir", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue(PENDING_DETAIL);
    (officeApprovalApi.approve as any).mockResolvedValue({
      ...PENDING_DETAIL,
      status: "APPROVED",
      approverUserId: "approver-9",
      decidedAt: "2026-07-03T00:00:00Z",
    });
    const onDecided = vi.fn();
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} onDecided={onDecided} />);
    await waitFor(() => expect(screen.getByText("Onayla")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Onayla")); // panel açılır
    fireEvent.change(screen.getByLabelText(/Karar Notu/), { target: { value: "uygundur" } });
    fireEvent.click(screen.getByRole("button", { name: "Onayla" })); // panel içi kaydet

    await waitFor(() => expect(officeApprovalApi.approve).toHaveBeenCalledWith("req1", "uygundur"));
    await waitFor(() => expect(screen.getByText("Onaylandı")).toBeInTheDocument());
    expect(onDecided).toHaveBeenCalledTimes(1);
    // karar sonrası aksiyon paneli kaybolur (statü artık PENDING değil)
    expect(screen.queryByTestId("decision-actions")).toBeNull();
  });
});

// Satır 8: ödeme talebi çekmecede — "Değiştirerek Onayla" yok; onaylandıktan sonra KAYITLI karar sahibine "Kesinleştir".
const PAYOUT_INTENT = { caseId: "case-1", caseClientId: "cc-1", amount: "400", currency: "TRY", note: "not", idempotencyKey: "k1" };
const PAYOUT_PENDING = {
  ...PENDING_DETAIL,
  actionCode: "CLIENT_PAYOUT_POST",
  targetType: "CLIENT_PAYOUT_REQUEST",
  targetRef: "k1",
  savedIntent: PAYOUT_INTENT,
};
const PAYOUT_APPROVED = { ...PAYOUT_PENDING, status: "APPROVED", approverUserId: "approver-9", decidedAt: "2026-07-03T00:00:00Z" };

describe("OfficeApprovalDetailDrawer — müvekkile ödeme talebi (satır 8)", () => {
  it("PENDING ödeme talebi: 'Onayla / Revizyon İste / Reddet' var, 'Değiştirerek Onayla' YOK", async () => {
    (officeApprovalApi.getDetail as any).mockResolvedValue(PAYOUT_PENDING);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Onayla")).toBeInTheDocument());
    expect(screen.getByText("Revizyon İste")).toBeInTheDocument();
    expect(screen.getByText("Reddet")).toBeInTheDocument();
    expect(screen.queryByText("Değiştirerek Onayla")).toBeNull();
  });

  it("APPROVED + kayıtlı karar sahibi: çekmecede 'Kesinleştir' görünür; tıklama finalize'ı onaylanan niyetle çağırır, çekmece güncel durumu gösterir ve onDecided tetiklenir", async () => {
    (officeApprovalApi.getDetail as any)
      .mockResolvedValueOnce(PAYOUT_APPROVED)
      .mockResolvedValueOnce({ ...PAYOUT_APPROVED, executionStatus: "SUCCEEDED" });
    (clientAccountingApi.finalizePayout as any).mockResolvedValue({ created: true });
    const onDecided = vi.fn();
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} onDecided={onDecided} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Kesinleştir" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() =>
      expect(clientAccountingApi.finalizePayout).toHaveBeenCalledWith("req1", {
        caseId: "case-1",
        caseClientId: "cc-1",
        amount: "400",
        currency: "TRY",
        note: "not",
        idempotencyKey: "k1",
      }),
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    // Kesinleşmiş talepte düğme artık yok.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Kesinleştir" })).toBeNull());
  });

  it("APPROVED ama karar sahibi BAŞKASI → çekmecede 'Kesinleştir' YOK", async () => {
    authState.user = { id: "baska-kullanici" };
    (officeApprovalApi.getDetail as any).mockResolvedValue(PAYOUT_APPROVED);
    render(<OfficeApprovalDetailDrawer requestId="req1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("CLIENT_PAYOUT_POST")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Kesinleştir" })).toBeNull();
  });
});
