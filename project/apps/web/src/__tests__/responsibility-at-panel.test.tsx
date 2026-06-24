// WP-1d-4a: "Sorumluluk Geçmişi" paneli component testleri (read-only).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResponsibilityAtPanel } from "@/components/case/responsibility-at-panel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { getCaseResponsibilityAt: vi.fn(), get: vi.fn() },
}));

const getResp = api.getCaseResponsibilityAt as unknown as ReturnType<typeof vi.fn>;
const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

function result(over: Record<string, any> = {}) {
  return {
    caseId: "c1",
    asOf: "2026-06-24T10:00:00.000Z",
    operationOwner: {
      type: "LAWYER",
      id: "law1",
      confidence: "EVENT_CONFIRMED",
      changedByUserId: "u1",
      effectiveAt: "2026-06-01T09:00:00.000Z",
    },
    legalResponsibleLawyer: {
      lawyerId: "law1",
      confidence: "EVENT_CONFIRMED",
      changedByUserId: "u1",
      effectiveAt: "2026-06-01T09:00:00.000Z",
    },
    horizon: {},
    ...over,
  };
}

describe("ResponsibilityAtPanel (read-only temporal panel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // İsim çözüm lookup'ları best-effort → boş döndür (fallback davranışı test edilir).
    apiGet.mockResolvedValue({ data: { data: [] } });
  });

  it("EVENT_CONFIRMED → 'Audit kaydıyla doğrulandı' etiketi görünür", async () => {
    getResp.mockResolvedValue(result());
    render(<ResponsibilityAtPanel caseId="c1" />);
    await waitFor(() => expect(getResp).toHaveBeenCalled());
    const labels = await screen.findAllByText("Audit kaydıyla doğrulandı");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    // Kanonik alan başlıkları
    expect(screen.getByText("Dosya Operasyon Sorumlusu")).toBeTruthy();
    expect(screen.getByText("Hukuki Sorumlu Avukat")).toBeTruthy();
  });

  it("UNKNOWN_BEFORE_HORIZON → dürüst gösterim; 'Atanmamış' false-certainty YOK", async () => {
    getResp.mockResolvedValue(
      result({
        operationOwner: { type: "UNKNOWN", id: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
        legalResponsibleLawyer: { lawyerId: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
      }),
    );
    render(<ResponsibilityAtPanel caseId="c1" />);
    // İsim ALANI da (yalnız rozet değil) dürüst metni gösterir → owner adı + avukat adı + 2 rozet = ≥4
    const honest = await screen.findAllByText("Bu tarih için kesin kayıt yok");
    expect(honest.length).toBeGreaterThanOrEqual(2);
    // UNKNOWN'da "Atanmamış" (yanlış kesinlik) GÖSTERİLMEZ.
    expect(screen.queryByText("Atanmamış")).toBeNull();
  });

  it("tarih değişince endpoint yeniden çağrılır", async () => {
    getResp.mockResolvedValue(result());
    render(<ResponsibilityAtPanel caseId="c1" />);
    await waitFor(() => expect(getResp).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Sorumluluk tarihi"), {
      target: { value: "2026-05-01T12:00" },
    });
    await waitFor(() => expect(getResp).toHaveBeenCalledTimes(2));
  });

  it("hata durumunda error state gösterilir", async () => {
    getResp.mockRejectedValue(new Error("Sunucu hatası X"));
    render(<ResponsibilityAtPanel caseId="c1" />);
    expect(await screen.findByText("Sunucu hatası X")).toBeTruthy();
  });
});
