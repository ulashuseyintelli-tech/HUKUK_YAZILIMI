import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import: TebligatCard → tebligat/TebligatPanel → @/lib/api (mock). @shared/types zinciri yok → test-safe.
import { TebligatCard } from "@/components/case/TebligatCard";
import { api } from "@/lib/api";

// CASEDETAILTABS-MIGRATION-C2a: Tebligat salt-okuma re-wire — collapsible + lazy + mutation YOK.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;

const sampleTebligat = {
  id: "t1",
  tebligatType: "ODEME_EMRI",
  addressType: "BILINEN",
  addressText: "Örnek Mah. 1. Sk. No:1",
  recipientName: "Test Alıcı",
  channel: "PTT",
  status: "HAZIRLANDI", // HAZIRLANDI → readOnly OLMASA "Gönder" butonu çıkardı (mutation-gate kanıtı)
  preparedAt: "2026-06-01T10:00:00.000Z",
};
const sampleSummary = {
  total: 1, hazirlanan: 1, gonderilen: 0, teslimEdilen: 0,
  iadeGelen: 0, tebligEdilmisSayilan: 0, bekleyenIslem: 1,
};

function primeApi() {
  get.mockImplementation((url: string) => {
    if (url.includes("/tebligat/summary")) return Promise.resolve({ data: sampleSummary });
    if (url.includes("/tebligat/case/")) return Promise.resolve({ data: [sampleTebligat] });
    return Promise.resolve({ data: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  primeApi();
});

describe("TebligatCard — CASEDETAILTABS-MIGRATION-C2a (read-only, collapsible + lazy)", () => {
  it("kapalıyken (varsayılan) panel mount EDİLMEZ → fetch YAPILMAZ (lazy kanıtı)", () => {
    render(<TebligatCard caseId="c1" />);
    expect(screen.getByText("Tebligat")).toBeTruthy(); // kart başlığı
    expect(screen.queryByText("▲ Gizle")).toBeNull(); // kapalı
    expect(get).not.toHaveBeenCalled(); // ← LAZY: kapalı → fetch YOK
  });

  it("açılınca panel mount → dosya-seviyesi fetch + liste render", async () => {
    render(<TebligatCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    // Dosya-seviyesi uç (caseDebtorId YOK):
    await waitFor(() => expect(get).toHaveBeenCalledWith("/tebligat/case/c1"));
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
  });

  it("MUTATION YOK: readOnly tüm yazma aksiyonlarını kapatır", async () => {
    render(<TebligatCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
    // Salt-okuma bildirimi görünür:
    expect(screen.getByText(/Pasif kayit: yeni tebligat kapali/i)).toBeTruthy();
    // Satır-içi mutation (HAZIRLANDI → "Gönder") GİZLİ (aksiyon bloğu readOnly-gate):
    expect(screen.queryByText("Gönder")).toBeNull();
    expect(screen.queryByText("PTT Sonucu Gir")).toBeNull();
    // "Yeni Tebligat" butonu DISABLED (oluşturma kapalı):
    const newBtn = screen.getByText("Yeni Tebligat").closest("button") as HTMLButtonElement;
    expect(newBtn.disabled).toBe(true);
  });
});
