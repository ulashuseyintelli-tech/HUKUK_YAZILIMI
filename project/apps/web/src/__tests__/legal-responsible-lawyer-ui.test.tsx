// WP-1d-5-5 — Hukuki Sorumlu Avukat kaydı değişikliği UI (frontend-only) testleri.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  LegalResponsibleLawyerModal,
  mapLegalResponsibleError,
} from "@/components/case/LegalResponsibleLawyerModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { changeLegalResponsibleLawyer: vi.fn() } }));
const changeFn = api.changeLegalResponsibleLawyer as unknown as ReturnType<typeof vi.fn>;

const LAWYERS = [
  { id: "cl1", lawyer: { id: "L1", name: "Ayşe", surname: "Yılmaz" }, role: "ASSIGNED" },
  { id: "cl2", lawyer: { id: "L2", name: "Mehmet", surname: "Demir" }, role: "RESPONSIBLE", isResponsible: true },
];

function renderModal(over: Partial<React.ComponentProps<typeof LegalResponsibleLawyerModal>> = {}) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <LegalResponsibleLawyerModal
      isOpen
      onClose={onClose}
      caseId="c1"
      lawyers={LAWYERS}
      onSuccess={onSuccess}
      {...over}
    />,
  );
  return { onSuccess, onClose };
}

beforeEach(() => {
  changeFn.mockReset();
  changeFn.mockResolvedValue({});
});

describe("LegalResponsibleLawyerModal (WP-1d-5-5)", () => {
  it("3: case'e bağlı avukat adaylarını gösterir, mevcut responsible '(mevcut)' işaretli", () => {
    renderModal();
    expect(screen.getByText("Hukuki Sorumlu Avukat Kaydını Değiştir")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Av. Ayşe Yılmaz" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Av. Mehmet Demir (mevcut)" })).toBeTruthy();
  });

  it("5: reason boşsa submit edilmez + 'Değişiklik nedeni zorunludur.' + API çağrılmaz", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Değişiklik nedeni zorunludur.")).toBeTruthy();
    expect(changeFn).not.toHaveBeenCalled();
  });

  it("5b: avukat seçilmezse uyarı + API çağrılmaz", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Yeni hukuki sorumlu avukat seçiniz.")).toBeTruthy();
    expect(changeFn).not.toHaveBeenCalled();
  });

  it("6+7: geçerli lawyer+reason → PATCH helper yalnız {lawyerId,reason,note} ile çağrılır (backdate YOK)", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "  hukuki sorumlu değişikliği  " } });
    fireEvent.change(screen.getByLabelText("Not"), { target: { value: "ek not" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    await waitFor(() => expect(changeFn).toHaveBeenCalledTimes(1));
    expect(changeFn).toHaveBeenCalledWith("c1", { lawyerId: "L1", reason: "hukuki sorumlu değişikliği", note: "ek not" });
    const payload = changeFn.mock.calls[0][1];
    expect(payload).not.toHaveProperty("effectiveAt");
    expect(payload).not.toHaveProperty("asOf");
    expect(payload).not.toHaveProperty("backdate");
  });

  it("note boşsa payload'da note alanı yok", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    await waitFor(() => expect(changeFn).toHaveBeenCalledTimes(1));
    expect(changeFn.mock.calls[0][1]).not.toHaveProperty("note");
  });

  it("8+9: başarı → success mesajı gösterilir + onSuccess (refresh) tetiklenir", async () => {
    const { onSuccess } = renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Hukuki sorumlu avukat kaydı güncellendi.")).toBeTruthy();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("10: 403/yetki hatası → 'Bu işlemi yapma yetkiniz yok.' (çıplak kod yok)", async () => {
    changeFn.mockRejectedValue(new Error("Bu işlem için yetkiniz yok (geçici kural: yalnız yönetici/ADMIN)."));
    const { onSuccess } = renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Bu işlemi yapma yetkiniz yok.")).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("11: TARGET_CASE_LAWYER_NOT_FOUND → kullanıcı dostu mesaj", async () => {
    changeFn.mockRejectedValue(new Error("Hedef avukat bu dosyaya bağlı değil. [TARGET_CASE_LAWYER_NOT_FOUND]"));
    renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Seçilen avukat bu dosyanın avukatları arasında bulunamadı.")).toBeTruthy();
  });

  it("12: LEGAL_RESPONSIBLE_INVARIANT_VIOLATION → kullanıcı dostu mesaj", async () => {
    changeFn.mockRejectedValue(new Error("... [LEGAL_RESPONSIBLE_INVARIANT_VIOLATION]"));
    renderModal();
    fireEvent.change(screen.getByLabelText("Yeni Hukuki Sorumlu Avukat"), { target: { value: "L1" } });
    fireEvent.change(screen.getByLabelText("Değişiklik Nedeni"), { target: { value: "neden" } });
    fireEvent.click(screen.getByText("Kaydı Değiştir"));
    expect(await screen.findByText("Hukuki sorumlu avukat kaydı tutarsız olduğu için işlem yapılamadı.")).toBeTruthy();
  });
});

describe("mapLegalResponsibleError", () => {
  it("bilinen kodları dostu mesaja çevirir", () => {
    expect(mapLegalResponsibleError("x [LEGAL_RESPONSIBLE_REASON_REQUIRED]")).toBe("Değişiklik nedeni zorunludur.");
    expect(mapLegalResponsibleError("x [LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT]")).toBe("Seçilen avukat zaten Hukuki Sorumlu Avukat.");
  });
  it("bilinmeyen mesajda [CODE] ekini temizler (çıplak kod sızdırmaz)", () => {
    expect(mapLegalResponsibleError("Beklenmedik durum [SOME_UNKNOWN_CODE]")).toBe("Beklenmedik durum");
  });
  it("boş mesaj → genel fallback", () => {
    expect(mapLegalResponsibleError("")).toBe("İşlem başarısız oldu.");
  });
});
