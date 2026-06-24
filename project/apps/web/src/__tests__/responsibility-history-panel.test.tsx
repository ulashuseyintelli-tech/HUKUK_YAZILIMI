// WP-1d-4c-2: "Sorumluluk Değişim Geçmişi" timeline component testleri (read-only).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ResponsibilityHistoryPanel } from "@/components/case/responsibility-history-panel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { getCaseResponsibilityHistory: vi.fn(), get: vi.fn() },
}));

const getHist = api.getCaseResponsibilityHistory as unknown as ReturnType<typeof vi.fn>;
const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

function ev(over: Record<string, any> = {}) {
  return {
    id: "e1",
    type: "operationOwner",
    effectiveAt: "2026-06-01T09:00:00.000Z",
    changedByUserId: "u1",
    confidence: "EVENT_CONFIRMED",
    oldValue: { type: "NONE", id: null },
    newValue: { type: "LAWYER", id: "law1" },
    sourceEventId: "a1",
    ...over,
  };
}

function result(events: any[]) {
  return { caseId: "c1", from: null, to: null, events, horizon: {} };
}

describe("ResponsibilityHistoryPanel (read-only timeline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // İsim lookup'ları best-effort → boş döndür (fallback davranışı test edilir).
    apiGet.mockResolvedValue({ data: { data: [] } });
  });

  it("başlık + alt başlık görünür", async () => {
    getHist.mockResolvedValue(result([]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(await screen.findByText("Sorumluluk Değişim Geçmişi")).toBeTruthy();
    expect(
      screen.getByText("Dosya Operasyon Sorumlusu ve Hukuki Sorumlu Avukat değişiklikleri."),
    ).toBeTruthy();
  });

  it("EVENT_CONFIRMED owner/legal → kanonik tür etiketleri + 'Audit kaydıyla doğrulandı'", async () => {
    getHist.mockResolvedValue(
      result([
        ev({ id: "e1", type: "operationOwner" }),
        ev({ id: "e2", type: "legalResponsibleLawyer", newValue: { type: "LAWYER", id: "law1" } }),
      ]),
    );
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalled());
    // Etiketler filtre dropdown'ında da geçtiği için event satırlarına (liste) scope'la.
    const list = await screen.findByRole("list");
    expect(within(list).getByText("Dosya Operasyon Sorumlusu")).toBeTruthy();
    expect(within(list).getByText("Hukuki Sorumlu Avukat")).toBeTruthy();
    const confirmed = within(list).getAllByText("Audit kaydıyla doğrulandı");
    expect(confirmed.length).toBe(2);
  });

  it("INFERRED_FROM_SNAPSHOT → 'Mevcut kayıttan çıkarıldı'", async () => {
    getHist.mockResolvedValue(result([ev({ confidence: "INFERRED_FROM_SNAPSHOT" })]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(await screen.findByText("Mevcut kayıttan çıkarıldı")).toBeTruthy();
  });

  it("UNKNOWN_BEFORE_HORIZON → 'Bu tarih için kesin kayıt yok' (false-certainty YOK)", async () => {
    getHist.mockResolvedValue(
      result([
        ev({
          confidence: "UNKNOWN_BEFORE_HORIZON",
          oldValue: { type: "UNKNOWN", id: null },
          newValue: { type: "UNKNOWN", id: null },
        }),
      ]),
    );
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(await screen.findByText("Bu tarih için kesin kayıt yok")).toBeTruthy();
    // UNKNOWN parti "Atanmamış" (yanlış kesinlik) ile gösterilmez.
    expect(screen.queryByText(/Atanmamış/)).toBeNull();
  });

  it("boş sonuç → dürüst boş-durum mesajı", async () => {
    getHist.mockResolvedValue(result([]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(
      await screen.findByText("Bu dosya için sorumluluk değişim kaydı bulunamadı."),
    ).toBeTruthy();
  });

  it("hata durumunda error state gösterilir", async () => {
    getHist.mockRejectedValue(new Error("Sunucu hatası Z"));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(await screen.findByText("Sunucu hatası Z")).toBeTruthy();
  });

  it("'Çıkarımsal kayıtları göster' checkbox değişince endpoint yeniden çağrılır (includeInferred=false)", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    // mount → includeInferred=true
    expect(getHist).toHaveBeenLastCalledWith("c1", { type: "all", includeInferred: true });
    fireEvent.click(screen.getByLabelText("Çıkarımsal kayıtları göster"));
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist).toHaveBeenLastCalledWith("c1", { type: "all", includeInferred: false });
  });

  it("isim çözülünce ham id yerine isim gösterilir", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/cases/responsible-candidates") {
        return Promise.resolve({ data: { data: [{ type: "LAWYER", id: "law1", displayName: "Av. Ayşe Yılmaz" }] } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    getHist.mockResolvedValue(result([ev({ newValue: { type: "LAWYER", id: "law1" } })]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    expect(await screen.findByText(/Av\. Ayşe Yılmaz/)).toBeTruthy();
    expect(screen.queryByText(/law1/)).toBeNull();
  });

  // --- WP-1d-4c-3: tür + tarih aralığı filtreleri ---

  it("varsayılan açılışta type='all' + includeInferred=true; from/to gönderilmez", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    expect(getHist).toHaveBeenLastCalledWith("c1", { type: "all", includeInferred: true });
    const params = getHist.mock.calls.at(-1)![1];
    expect(params).not.toHaveProperty("from");
    expect(params).not.toHaveProperty("to");
  });

  it("tür filtresi 'Dosya Operasyon Sorumlusu' → type=operationOwner ile yeniden çağrılır", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Değişiklik türü filtresi"), {
      target: { value: "operationOwner" },
    });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist).toHaveBeenLastCalledWith("c1", expect.objectContaining({ type: "operationOwner" }));
  });

  it("tür filtresi 'Hukuki Sorumlu Avukat' → type=legalResponsibleLawyer ile yeniden çağrılır", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Değişiklik türü filtresi"), {
      target: { value: "legalResponsibleLawyer" },
    });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist).toHaveBeenLastCalledWith(
      "c1",
      expect.objectContaining({ type: "legalResponsibleLawyer" }),
    );
  });

  it("başlangıç tarihi girilince ham YYYY-MM-DD 'from' olarak gönderilir (timezone yorumu YOK)", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Başlangıç tarihi"), { target: { value: "2026-01-15" } });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist).toHaveBeenLastCalledWith("c1", expect.objectContaining({ from: "2026-01-15" }));
  });

  it("bitiş tarihi girilince ham YYYY-MM-DD 'to' olarak gönderilir", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Bitiş tarihi"), { target: { value: "2026-06-01" } });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist).toHaveBeenLastCalledWith("c1", expect.objectContaining({ to: "2026-06-01" }));
  });

  it("tarih alanı temizlenince ilgili param artık gönderilmez", async () => {
    getHist.mockResolvedValue(result([ev()]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    const fromInput = screen.getByLabelText("Başlangıç tarihi");
    fireEvent.change(fromInput, { target: { value: "2026-01-15" } });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(2));
    expect(getHist.mock.calls.at(-1)![1]).toHaveProperty("from", "2026-01-15");
    fireEvent.change(fromInput, { target: { value: "" } });
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(3));
    expect(getHist.mock.calls.at(-1)![1]).not.toHaveProperty("from");
  });

  it("filtre aktifken boş sonuç → 'Seçili filtrelerle eşleşen...' metni", async () => {
    getHist.mockResolvedValue(result([]));
    render(<ResponsibilityHistoryPanel caseId="c1" />);
    await waitFor(() => expect(getHist).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Değişiklik türü filtresi"), {
      target: { value: "operationOwner" },
    });
    expect(
      await screen.findByText("Seçili filtrelerle eşleşen sorumluluk değişim kaydı bulunamadı."),
    ).toBeTruthy();
    // filtre yokken gösterilen genel metin artık görünmez
    expect(screen.queryByText("Bu dosya için sorumluluk değişim kaydı bulunamadı.")).toBeNull();
  });
});
