/**
 * Satır 8 (owner kararı 7): onay kutusu çekmecesinde müvekkile ödeme talebi için "Kesinleştir".
 * Görünürlük YALNIZ kolaylıktır; yetki / durum / payload-drift / tutar kapıları sunucudadır (finalize ucu).
 * Burada: yalnız KAYITLI karar sahibine, yalnız APPROVED + henüz yürütülmemiş talepte, geçerli niyetle görünür;
 * tıklama finalize ucuna onaylanan niyetle gider; sunucu reddi aynen gösterilir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api/office-approval", () => ({
  officeApprovalApi: { getDetail: vi.fn() },
}));
vi.mock("@/lib/api/client-accounting", () => ({
  clientAccountingApi: { finalizePayout: vi.fn() },
}));
import { officeApprovalApi } from "@/lib/api/office-approval";
import { clientAccountingApi } from "@/lib/api/client-accounting";
import { PayoutFinalizeAction } from "@/components/office-approval/PayoutFinalizeAction";

const INTENT = { caseId: "case-1", caseClientId: "cc-1", amount: "400", currency: "TRY", note: "not", idempotencyKey: "k1" };
const DETAIL = {
  id: "req1",
  actionCode: "CLIENT_PAYOUT_POST",
  targetType: "CLIENT_PAYOUT_REQUEST",
  targetRef: "k1",
  status: "APPROVED" as const,
  executionStatus: "NOT_RUN",
  requesterUserId: "requester-1",
  approverUserId: "approver-9",
  hasReplacement: false,
  reason: null,
  createdAt: "2026-07-01T00:00:00Z",
  decidedAt: "2026-07-01T01:00:00Z",
  expiresAt: null,
  savedIntent: INTENT,
  payloadHash: "h1",
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
};

const getDetail = officeApprovalApi.getDetail as any;
const finalizePayout = clientAccountingApi.finalizePayout as any;

beforeEach(() => {
  getDetail.mockReset();
  finalizePayout.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("PayoutFinalizeAction — görünürlük", () => {
  it("kayıtlı karar sahibine, APPROVED + yürütülmemiş ödeme talebinde GÖRÜNÜR", () => {
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Kesinleştir" })).toBeInTheDocument();
  });

  it.each([
    ["karar sahibi olmayan kullanıcı", { detail: DETAIL, uid: "baska-kullanici" }],
    ["oturum yok", { detail: DETAIL, uid: null }],
    ["PENDING_APPROVAL (henüz onaylanmadı)", { detail: { ...DETAIL, status: "PENDING_APPROVAL" as const, approverUserId: null }, uid: "approver-9" }],
    ["REJECTED", { detail: { ...DETAIL, status: "REJECTED" as const }, uid: "approver-9" }],
    ["zaten kesinleşmiş (SUCCEEDED)", { detail: { ...DETAIL, executionStatus: "SUCCEEDED" }, uid: "approver-9" }],
    ["başka onay türü", { detail: { ...DETAIL, actionCode: "COLLECTION_DISPOSITION_POST" }, uid: "approver-9" }],
    ["niyet okunamıyor / maskeli", { detail: { ...DETAIL, savedIntent: "[MASKED]" }, uid: "approver-9" }],
  ])("%s → GÖRÜNMEZ", (_ad, c) => {
    const { container } = render(<PayoutFinalizeAction detail={c.detail as any} currentUserId={c.uid} onFinalized={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("PayoutFinalizeAction — eylem", () => {
  it("tıklama: finalize ucuna ONAYLANAN niyetle gider; başarıda güncel detay ile onFinalized", async () => {
    finalizePayout.mockResolvedValue({ created: true, payoutId: "p1" });
    getDetail.mockResolvedValue({ ...DETAIL, executionStatus: "SUCCEEDED" });
    const onFinalized = vi.fn();
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() =>
      expect(finalizePayout).toHaveBeenCalledWith("req1", {
        caseId: "case-1",
        caseClientId: "cc-1",
        amount: "400",
        currency: "TRY",
        note: "not",
        idempotencyKey: "k1",
      }),
    );
    await waitFor(() => expect(onFinalized).toHaveBeenCalledWith(expect.objectContaining({ executionStatus: "SUCCEEDED" })));
  });

  it("sunucu reddi (403 vb.) AYNEN gösterilir; onFinalized ÇAĞRILMAZ; düğme yeniden aktif", async () => {
    finalizePayout.mockRejectedValue(new Error("Onay yetkisi yok."));
    const onFinalized = vi.fn();
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Onay yetkisi yok."));
    expect(onFinalized).not.toHaveBeenCalled();
    expect(getDetail).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kesinleştir" })).not.toBeDisabled();
  });

  it("double-submit koruması: AYNI anda gelen iki tıklama finalize'ı TEK kez çağırır (düğme henüz devre dışı olmadan)", async () => {
    let release!: (v: unknown) => void;
    finalizePayout.mockReturnValue(new Promise((r) => (release = r)));
    getDetail.mockResolvedValue({ ...DETAIL, executionStatus: "SUCCEEDED" });
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={vi.fn()} />);

    const btn = screen.getByRole("button", { name: "Kesinleştir" }) as HTMLButtonElement;
    // Aynı act içinde iki tıklama: React durumu (disabled) güncellenmeden ikinci tıklama da işleyiciye ulaşır → yalnız ref koruması keser.
    act(() => {
      btn.click();
      btn.click();
    });
    expect(finalizePayout).toHaveBeenCalledTimes(1);
    release({ created: true });
    await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(1));
  });
});

describe("PayoutFinalizeAction — kesinleştirme başarılı, yenileme düşerse", () => {
  it("kesinleştirme 2xx + detay okuması HATA → 'başarısız' DEĞİL: ödeme yapıldı uyarısı, düğme kapalı, onFinalized çağrılmaz", async () => {
    finalizePayout.mockResolvedValue({ created: true, payoutId: "p1" });
    getDetail.mockRejectedValue(new Error("ağ koptu"));
    const onFinalized = vi.fn();
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ödeme kesinleştirildi"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Kesinleştir/ })).toBeNull(); // tekrar kesinleştirme yönlendirilmez
    expect(onFinalized).not.toHaveBeenCalled();
    expect(finalizePayout).toHaveBeenCalledTimes(1);
  });

  it("kesinleştirme HATA → hata gösterilir ve detay hiç okunmaz (yenileme hatasından ayrı)", async () => {
    finalizePayout.mockRejectedValue(new Error("Tutar borcu aşıyor"));
    render(<PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tutar borcu aşıyor"));
    expect(getDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("başarıda muhasebe sorguları (borç, ödemeler, ekstre, defter, talep kartı) tazelenir", async () => {
    finalizePayout.mockResolvedValue({ created: true });
    getDetail.mockResolvedValue({ ...DETAIL, executionStatus: "SUCCEEDED" });
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(
      <QueryClientProvider client={qc}>
        <PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "client-accounting-outstanding",
        "client-accounting-payouts",
        "client-statement",
        "financial-statement",
        "client-payout-approval-requests",
        "client-payout-approval-request-details",
      ]),
    );
  });

  it("kesinleştirme HATAsında sorgular tazelenmez", async () => {
    finalizePayout.mockRejectedValue(new Error("reddedildi"));
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(
      <QueryClientProvider client={qc}>
        <PayoutFinalizeAction detail={DETAIL} currentUserId="approver-9" onFinalized={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kesinleştir" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
