import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DueModal, dueApprovalNotice } from "@/components/finance/DueModal";
import { api } from "@/lib/api";

/**
 * Due (dosya kalemi) penceresi — onaya giden istekler (owner kararı 19.11.2026):
 *  - Yeni kalem ekleme artık kayıt OLUŞTURMAZ; iki kişi onayına talep açar. Hesap ve dışa aktarım çıktısını etkileyen
 *    değişiklik (ör. alt tür) ve bağlı alacak kalemi olmayan kalemin silinmesi de onaya gider.
 *  - Pencere bu yanıtı "başarıyla kaydedildi" gibi GÖSTERMEZ: kapanmaz, liste yenilenmez; sunucunun iletisi pencerede
 *    okunur kalır. Değerler SENTETİK.
 */
vi.mock("@/lib/api", () => ({ api: { createDue: vi.fn(), updateDue: vi.fn(), deleteDue: vi.fn() } }));

const RECORD = { id: "due-1", type: "PRINCIPAL", description: "Sentetik asıl alacak", amount: 1000, dueDate: "2025-01-15", currency: "TRY", interestType: "YASAL" };
const pending = (message: string, fields?: string[]) => ({ applied: false, approvalRequired: true, approvalRequestId: "approval-1", status: "PENDING_APPROVAL", message, ...(fields ? { fields } : {}) });

function renderModal(record?: Record<string, unknown>) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<DueModal isOpen caseId="case-1" defaultCurrency="TRY" due={record} onSuccess={onSuccess} onClose={onClose} />);
  return { onSuccess, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("dueApprovalNotice", () => {
  it("yalnız onaya giden yanıtta ileti döner; doğrudan uygulanan yanıtta null", () => {
    expect(dueApprovalNotice(pending("Kalem ekleme talebi onaya gönderildi."))).toBe("Kalem ekleme talebi onaya gönderildi.");
    expect(dueApprovalNotice({ approvalRequired: true })).toContain("onaya gönderildi"); // ileti yoksa genel metin
    for (const applied of [{ id: "due-1" }, { success: true }, { approvalRequired: false, message: "x" }, null, undefined, "x"]) {
      expect(dueApprovalNotice(applied)).toBeNull();
    }
  });
});

describe("DueModal — onaya giden istek kayıt edilmiş gibi gösterilmez", () => {
  it("yeni kalem: istek gider; pencere kapanmaz, liste yenilenmez, onay iletisi pencerede kalır", async () => {
    vi.mocked(api.createDue).mockResolvedValueOnce(pending("Kalem ekleme talebi onaya gönderildi. İkinci bir kişinin onayından sonra dosyaya eklenir.") as never);
    const { onSuccess, onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Ekle" }));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Onaya gönderildi");
    expect(notice).toHaveTextContent("İkinci bir kişinin onayından sonra dosyaya eklenir.");
    expect(api.createDue).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("alt tür değişikliği: yalnız değişen alan gider; yanıt onaya gittiyse pencere açık kalır ve ileti gösterilir", async () => {
    vi.mocked(api.updateDue).mockResolvedValueOnce(pending("Bu değişiklik hesap ve dışa aktarım çıktısını etkilediği için onaya gönderildi.", ["type"]) as never);
    const { onSuccess, onClose } = renderModal(RECORD);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "KIRA" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));

    expect(await screen.findByRole("status")).toHaveTextContent("hesap ve dışa aktarım çıktısını etkilediği için onaya gönderildi");
    expect(api.updateDue).toHaveBeenCalledWith("case-1", "due-1", { type: "KIRA" });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("doğrudan uygulanan değişiklikte davranış aynı: liste yenilenir ve pencere kapanır", async () => {
    vi.mocked(api.updateDue).mockResolvedValueOnce({ id: "due-1" } as never);
    const { onSuccess, onClose } = renderModal(RECORD);
    fireEvent.change(screen.getByPlaceholderText("Opsiyonel açıklama"), { target: { value: "Sentetik açıklama (düzeltildi)" } });
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("silme onaya gittiyse kayıt silinmiş gibi kapanmaz; ileti gösterilir", async () => {
    vi.mocked(api.deleteDue).mockResolvedValueOnce(pending("Silme talebi onaya gönderildi. O zamana kadar dosya kalemi yerinde kalır.") as never);
    const { onSuccess, onClose } = renderModal({ ...RECORD, type: "NAFAKA" });
    fireEvent.click(screen.getByTitle("Sil"));

    expect(await screen.findByRole("status")).toHaveTextContent("dosya kalemi yerinde kalır");
    expect(api.deleteDue).toHaveBeenCalledWith("case-1", "due-1");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
