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
    await waitFor(() => expect(screen.getByText("Dosya durumu değişikliği")).toBeInTheDocument());
    // Teknik kimlikler listede gösterilmez; talep edenin adı yoksa bu açıkça yazılır (uydurulmaz).
    expect(screen.queryByText(/case-123/)).toBeNull();
    expect(screen.queryByText(/user-1/)).toBeNull();
    expect(screen.getByText("Talep eden: adı bulunamadı")).toBeInTheDocument();
    expect(screen.getByText("Dosya")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Dosya durumu değişikliği"));
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

  // Kutu ucu durum verilmezse YALNIZ bekleyenleri döndürür (sunucu varsayılanı); "tüm durumlar" anlamı sunucuda yok.
  // Bu yüzden süzgeçte durum taşımayan bir seçenek sunulmaz — sunulursa bekleyenleri "tümü" diye gösterir.
  it("durum süzgeci yalnız yedi durumu sunar; 'Tüm Durumlar' seçeneği ve boş değerli seçenek yoktur", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("PENDING_APPROVAL"));

    const select = screen.getByLabelText("Durum filtresi") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
    expect(options).toEqual([
      { value: "PENDING_APPROVAL", label: "Onay Bekliyor" },
      { value: "APPROVED", label: "Onaylandı" },
      { value: "APPROVED_WITH_CHANGES", label: "Değişiklikle Onaylandı" },
      { value: "REVISION_REQUESTED", label: "Revizyon İstendi" },
      { value: "REJECTED", label: "Reddedildi" },
      { value: "CANCELLED", label: "İptal Edildi" },
      { value: "EXPIRED", label: "Süresi Doldu" },
    ]);
    expect(screen.queryByText("Tüm Durumlar")).toBeNull();
  });

  it("hiçbir seçenek kutuyu durum vermeden çağırtmaz (her seçim kendi durum değeriyle istek atar)", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("PENDING_APPROVAL"));

    const select = screen.getByLabelText("Durum filtresi") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    // Varsayılan seçenek en sona alınır: her seçim gerçek bir değer DEĞİŞİMİ olsun (yeni istek atılsın).
    for (const value of [...values.slice(1), values[0]]) {
      fireEvent.change(select, { target: { value } });
      await waitFor(() => expect((officeApprovalApi.getInbox as any).mock.lastCall).toEqual([value]));
    }
    expect((officeApprovalApi.getInbox as any).mock.calls).toHaveLength(values.length + 1);
    for (const call of (officeApprovalApi.getInbox as any).mock.calls) {
      expect(call[0]).toBeTruthy();
    }
  });

  it("boş liste metni seçili duruma göre yazılır: bekleyen dışındaki süzgeçte 'Bekleyen onay yok' denmez", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("Bekleyen onay yok")).toBeInTheDocument());
    expect(screen.queryByText("Bu durumda onay talebi yok")).toBeNull();

    fireEvent.change(screen.getByLabelText("Durum filtresi"), { target: { value: "CANCELLED" } });
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledWith("CANCELLED"));
    await waitFor(() => expect(screen.getByText("Bu durumda onay talebi yok")).toBeInTheDocument());
    expect(screen.queryByText("Bekleyen onay yok")).toBeNull();

    fireEvent.change(screen.getByLabelText("Durum filtresi"), { target: { value: "PENDING_APPROVAL" } });
    await waitFor(() => expect(screen.getByText("Bekleyen onay yok")).toBeInTheDocument());
    expect(screen.queryByText("Bu durumda onay talebi yok")).toBeNull();
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
    await waitFor(() => expect(screen.getByText("Dosya durumu değişikliği")).toBeInTheDocument());
    expect(officeApprovalApi.getInbox).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Dosya durumu değişikliği")); // drawer aç
    await waitFor(() => expect(screen.getAllByText("Onayla").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("Onayla")); // aksiyon paneli
    fireEvent.click(screen.getByRole("button", { name: "Onayla" })); // kaydet

    await waitFor(() => expect(officeApprovalApi.approve).toHaveBeenCalledWith("req1", ""));
    await waitFor(() => expect(officeApprovalApi.getInbox).toHaveBeenCalledTimes(2));
  });
});

describe("OfficeApprovalsPage — okunur satır (U-1 / U-2)", () => {
  it("satırda Türkçe işlem / hedef adı ve talep edenin adı görünür; ham kod görünmez", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([
      { ...ROW, id: "req2", actionCode: "CLAIM_ITEM_HIGH_IMPACT_CHANGE", targetType: "CLAIM_ITEM", requesterName: "Sentetik Talepçi" },
    ]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("Alacak kalemi — yüksek etkili değişiklik")).toBeInTheDocument());
    expect(screen.getByText("Alacak kalemi")).toBeInTheDocument();
    expect(screen.getByText("Talep eden: Sentetik Talepçi")).toBeInTheDocument();
    expect(screen.queryByText("CLAIM_ITEM_HIGH_IMPACT_CHANGE")).toBeNull();
  });

  it("tanınmayan işlem kodu uydurulmaz: 'Tanımsız işlem türü' yazılır", async () => {
    (officeApprovalApi.getInbox as any).mockResolvedValue([{ ...ROW, id: "req3", actionCode: "SOMETHING_NEW", targetType: "Whatever" }]);
    render(<OfficeApprovalsPage />);
    await waitFor(() => expect(screen.getByText("Tanımsız işlem türü")).toBeInTheDocument());
    expect(screen.getByText("Tanımsız hedef türü")).toBeInTheDocument();
  });
});
