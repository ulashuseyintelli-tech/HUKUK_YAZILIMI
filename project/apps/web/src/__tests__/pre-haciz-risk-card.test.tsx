import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import: PreHacizRiskCard → @/lib/api (mock) + @/lib/haciz-audit-format (saf). @shared/types zinciri yok → test-safe.
import { PreHacizRiskCard } from "@/components/case/PreHacizRiskCard";
import { api } from "@/lib/api";

// CASEDETAILTABS-MIGRATION-C3a: #116 pre-haciz risk salt-okuma kart — collapsible + lazy + UYAP gönderimi YOK.
vi.mock("@/lib/api", () => ({
  api: { getPreHacizIntelligence: vi.fn() },
}));

const getRisk = api.getPreHacizIntelligence as unknown as ReturnType<typeof vi.fn>;

const sampleRisk = {
  caseId: "c1",
  isValid: false,
  warnings: [],
  overallLevel: "YUKSEK",
  debtors: [
    {
      debtorId: "d1",
      name: "Borçlu A",
      level: "YUKSEK",
      score: 80,
      reasons: [{ id: "INTEL_NO_ADDRESS", message: "Borçlunun kayıtlı adresi yok", severity: "HIGH" }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PreHacizRiskCard — CASEDETAILTABS-MIGRATION-C3a (#116 read-only, collapsible + lazy)", () => {
  it("kapalıyken panel mount EDİLMEZ → getPreHacizIntelligence çağrılmaz (lazy kanıtı)", () => {
    getRisk.mockResolvedValue(sampleRisk);
    render(<PreHacizRiskCard caseId="c1" />);
    expect(screen.getByText("Haciz Öncesi Risk Kontrolü")).toBeTruthy(); // kart başlığı
    expect(screen.queryByText("▲ Gizle")).toBeNull(); // kapalı
    expect(getRisk).not.toHaveBeenCalled(); // ← LAZY: kapalı → fetch YOK
  });

  it("açılınca getPreHacizIntelligence(caseId) → risk bilgisi render", async () => {
    getRisk.mockResolvedValue(sampleRisk);
    render(<PreHacizRiskCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getRisk).toHaveBeenCalledWith("c1")); // ← yalnız bu uç
    await waitFor(() => expect(screen.getByText("Borçlu A")).toBeTruthy());
    expect(screen.getByText("Borçlunun kayıtlı adresi yok")).toBeTruthy();
  });

  it("boş/veri yok durumu render", async () => {
    getRisk.mockResolvedValue({ ...sampleRisk, debtors: [], overallLevel: "YOK" });
    render(<PreHacizRiskCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getRisk).toHaveBeenCalledWith("c1"));
    expect(screen.getByText(/haciz öncesi risk sinyali yok/i)).toBeTruthy();
  });

  it("SUBMIT/SEND YOK: açıkken yalnız toggle butonu var, gönderim aksiyonu yok", async () => {
    getRisk.mockResolvedValue(sampleRisk);
    render(<PreHacizRiskCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Borçlu A")).toBeTruthy());
    // Tek buton = collapsible toggle; gönderim/aksiyon butonu YOK:
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("UYAP'a Gönder")).toBeNull();
    expect(screen.queryByText("Haciz Talebi Gönder")).toBeNull();
    expect(screen.queryByText("Evrak Gönder")).toBeNull();
  });
});
