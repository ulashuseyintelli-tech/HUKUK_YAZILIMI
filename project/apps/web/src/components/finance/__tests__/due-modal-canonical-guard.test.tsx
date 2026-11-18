import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DueModal, buildDueUpdatePayload, dueBlockNotice, dueFormFromRecord } from "@/components/finance/DueModal";
import { api } from "@/lib/api";

/**
 * Due (dosya kalemi) düzenleme penceresi — owner kararı 18.11.2026:
 *  - Düzenlemede yalnız kullanıcının DEĞİŞTİRDİĞİ alanlar gönderilir; dokunulmamış varsayılan alanlar (özellikle
 *    "Faiz Türü") gönderilmez. Eskiden her kayıtta tür / tutar / vade / faiz türü birlikte gidiyor ve bağlı alacak
 *    kaleminin onaylı faiz bilgisini bozuyordu.
 *  - Sunucunun "bu pencereden yapılamaz" / "yetki yok" reddi pencerede aynen ve kalıcı gösterilir; kullanıcı kanonik
 *    kalem ekranına yönlendirilir. Değerler SENTETİK.
 */
vi.mock("@/lib/api", () => ({ api: { createDue: vi.fn(), updateDue: vi.fn(), deleteDue: vi.fn() } }));

const RECORD = { id: "due-1", type: "PRINCIPAL", description: "Sentetik asıl alacak", amount: 1000, dueDate: "2025-01-15", currency: "TRY", interestType: "YASAL" };

const blocked = (code: string, message: string, status = 409) => Object.assign(new Error(message), { status, body: { code, message } });

function renderModal(record: Record<string, unknown> = RECORD) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<DueModal isOpen caseId="case-1" defaultCurrency="TRY" due={record} onSuccess={onSuccess} onClose={onClose} />);
  return { onSuccess, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.mocked(api.updateDue).mockResolvedValue({ id: "due-1" } as never);
  vi.mocked(api.deleteDue).mockResolvedValue({ success: true } as never);
});

describe("buildDueUpdatePayload — yalnız değişen alanlar", () => {
  const initial = dueFormFromRecord(RECORD);

  it("hiçbir alan değişmediyse boş yük", () => {
    expect(buildDueUpdatePayload(initial, { ...initial })).toEqual({});
  });

  it.each([
    ["açıklama", { description: "Yeni açıklama" }, { description: "Yeni açıklama" }],
    ["tutar", { amount: "1500" }, { amount: 1500 }],
    ["vade", { dueDate: "2025-02-20" }, { dueDate: "2025-02-20" }],
    ["tür", { type: "KIRA" }, { type: "KIRA" }],
    ["faiz türü", { interestType: "TICARI_SABIT" }, { interestType: "TICARI_SABIT" }],
  ])("yalnız %s değişince yalnız o alan gider", (_label, change, expected) => {
    expect(buildDueUpdatePayload(initial, { ...initial, ...change })).toEqual(expected);
  });

  it("aynı tutarın farklı yazımı (1000 / 1000.00) değişiklik değildir", () => {
    expect(buildDueUpdatePayload(initial, { ...initial, amount: "1000.00" })).toEqual({});
  });

  it("asıl alacak dışındaki türde faiz türü hiç gönderilmez", () => {
    const expense = dueFormFromRecord({ ...RECORD, type: "EXPENSE", interestType: undefined });
    expect(buildDueUpdatePayload(expense, { ...expense, interestType: "TICARI_SABIT", description: "Masraf" })).toEqual({ description: "Masraf" });
  });
});

describe("DueModal düzenleme — gönderilen yük", () => {
  it("değişiklik yokken Güncelle isteği ATMAZ; pencere kapanır, başarı bildirilmez", async () => {
    const { onSuccess, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(api.updateDue).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("yalnız açıklama değişince tür / tutar / vade / para birimi / faiz türü GÖNDERİLMEZ", async () => {
    const { onSuccess, onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Opsiyonel açıklama"), { target: { value: "Düzeltilmiş açıklama" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));
    await waitFor(() => expect(api.updateDue).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateDue).mock.calls[0]).toEqual(["case-1", "due-1", { description: "Düzeltilmiş açıklama" }]);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("düzenlemede onaya tabi alanlar için yönlendirme notu görünür; yeni kayıtta ve nafakada görünmez", () => {
    const { unmount } = render(<DueModal isOpen caseId="case-1" defaultCurrency="TRY" due={RECORD} onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/iki kişi onayına tabidir/)).toHaveTextContent("Alacak Kalemleri (Kanonik)");
    unmount();

    const created = render(<DueModal isOpen caseId="case-1" defaultCurrency="TRY" onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/iki kişi onayına tabidir/)).toBeNull();
    created.unmount();

    render(<DueModal isOpen caseId="case-1" defaultCurrency="TRY" due={{ ...RECORD, type: "NAFAKA" }} onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/iki kişi onayına tabidir/)).toBeNull();
  });
});

describe("DueModal — sunucunun engel reddi", () => {
  const MESSAGE =
    'Bu değişiklik (tutar) bağlı alacak kaleminin onaya tabi bilgisini değiştirir ve bu pencereden yapılamaz. Değişikliği "Alacak Kalemleri (Kanonik)" panelinde kalemi düzenleyip "Onaya Gönder" ile isteyin; ikinci bir kişinin onayıyla uygulanır. Hiçbir kayıt değiştirilmedi.';

  it("onaya tabi değişiklik reddi pencerede aynen gösterilir; uyarı kutusu açılmaz, pencere kapanmaz, form korunur", async () => {
    vi.mocked(api.updateDue).mockRejectedValueOnce(blocked("DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL", MESSAGE));
    const { onSuccess, onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Bu işlem bu pencereden yapılamadı");
    expect(notice).toHaveTextContent("Alacak Kalemleri (Kanonik)");
    expect(notice).toHaveTextContent("Onaya Gönder");
    expect(notice).toHaveTextContent("Hiçbir kayıt değiştirilmedi");
    expect(vi.mocked(api.updateDue).mock.calls[0][2]).toEqual({ amount: 1500 });
    expect(window.alert).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("0.00") as HTMLInputElement).value).toBe("1500");
  });

  it("silme reddi (etkin bağlı kalem) pencerede gösterilir; pencere kapanmaz", async () => {
    vi.mocked(api.deleteDue).mockRejectedValueOnce(
      blocked("DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL", "Bu dosya kalemine bağlı etkin bir alacak kalemi var; silme, o kalemin iptalini gerektirir ve iki kişi onayına tabidir."),
    );
    const { onSuccess, onClose } = renderModal();
    fireEvent.click(screen.getByTitle("Sil"));

    expect(await screen.findByRole("alert")).toHaveTextContent("iptalini gerektirir");
    expect(api.deleteDue).toHaveBeenCalledWith("case-1", "due-1");
    expect(window.alert).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("yetki reddi pencerede gösterilir", async () => {
    vi.mocked(api.updateDue).mockRejectedValueOnce(
      blocked("DUE_WRITE_FORBIDDEN", "Dosya kalemi eklemek, değiştirmek veya silmek için bu dosyada mali düzenleme yetkisi gerekir.", 403),
    );
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Opsiyonel açıklama"), { target: { value: "Yetkisiz deneme" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("mali düzenleme yetkisi gerekir");
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("engel reddi olmayan hata eskisi gibi uyarı kutusuyla gösterilir", async () => {
    vi.mocked(api.updateDue).mockRejectedValueOnce(new Error("Sunucu hatası"));
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Opsiyonel açıklama"), { target: { value: "Başka hata" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Sunucu hatası")));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dueBlockNotice yalnız bilinen engel kodlarında ileti döner", () => {
    expect(dueBlockNotice(blocked("DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL", "Bekleyen talep var"))).toBe("Bekleyen talep var");
    expect(dueBlockNotice(blocked("CASE_CLAIM_CURRENCY_MISMATCH", "para birimi"))).toBeNull();
    expect(dueBlockNotice(new Error("x"))).toBeNull();
    expect(dueBlockNotice(null)).toBeNull();
  });
});
