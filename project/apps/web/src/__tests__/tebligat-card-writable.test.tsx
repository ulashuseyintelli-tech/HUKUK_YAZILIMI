import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import: TebligatCard → tebligat/TebligatPanel → @/lib/api (mock). @shared/types zinciri yok → test-safe.
import { TebligatCard } from "@/components/case/TebligatCard";
import { api } from "@/lib/api";

// CASEDETAILTABS-MIGRATION-C2b-manuel: readOnly=false → YALNIZ güvenli manuel aksiyonlar açılır
// (create / markAsSent / PTT sonucu / MERNİS). K2=A: elektronik (UETS/KEP) kanal create modalından çıkarıldı.
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
  status: "HAZIRLANDI", // HAZIRLANDI → readOnly=false'da "Gönder" (markAsSent) butonu çıkar
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

describe("TebligatCard — CASEDETAILTABS-MIGRATION-C2b-manuel (readOnly=false güvenli manuel write)", () => {
  it("readOnly=false → 'Yeni Tebligat' ETKİN + 'Pasif kayit' bildirimi YOK", async () => {
    render(<TebligatCard caseId="c1" readOnly={false} />);
    fireEvent.click(screen.getByRole("button")); // kapalıyken tek buton = toggle
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
    const newBtn = screen.getByText("Yeni Tebligat").closest("button") as HTMLButtonElement;
    expect(newBtn.disabled).toBe(false);
    expect(screen.queryByText(/Pasif kayit/i)).toBeNull();
  });

  it("readOnly=false → HAZIRLANDI tebligatta 'Gönder' (markAsSent) görünür", async () => {
    render(<TebligatCard caseId="c1" readOnly={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
    expect(screen.getByText("Gönder")).toBeTruthy();
  });

  it("create modalında elektronik kanal YOK (K2=A): UETS/KEP kaldırıldı, fiziksel kanal var", async () => {
    render(<TebligatCard caseId="c1" readOnly={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
    fireEvent.click(screen.getByText("Yeni Tebligat"));
    await waitFor(() => expect(screen.getByText("Yeni Tebligat Oluştur")).toBeTruthy());
    // Fiziksel kanal mevcut:
    expect(screen.getByRole("option", { name: /Fiziki Tebligat/ })).toBeTruthy();
    // Elektronik gönderim kanalları YOK (sahte-başarı riski → guardrail):
    expect(screen.queryByRole("option", { name: /Ulusal Elektronik Tebligat/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Kayıtlı Elektronik Posta/ })).toBeNull();
  });

  it("default (readOnly=true) → 'Yeni Tebligat' DISABLED (C2a salt-okuma regresyon koruması)", async () => {
    render(<TebligatCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test Alıcı")).toBeTruthy());
    const newBtn = screen.getByText("Yeni Tebligat").closest("button") as HTMLButtonElement;
    expect(newBtn.disabled).toBe(true);
  });
});
