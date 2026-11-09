import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import: HacizHistoryCard → CaseHistoryPanel → @/lib/api (mock) + safe Haciz projection.
// @shared/types zinciri yok → test-safe.
import { HacizHistoryCard } from "@/components/case/HacizHistoryCard";
import { api } from "@/lib/api";

// CASEDETAILTABS-MIGRATION-C1: #123 Haciz Gönderim Geçmişi re-wire — collapsible + lazy.
vi.mock("@/lib/api", () => ({
  api: { getCaseHacizAudits: vi.fn() },
}));

const getAudits = api.getCaseHacizAudits as unknown as ReturnType<typeof vi.fn>;

const sampleLog = {
  id: "a1",
  action: "HACIZ_REQUEST_SUBMITTED",
  entityType: "CASE",
  entityId: "c1",
  userName: "Av. Test",
  createdAt: "2026-06-01T10:00:00.000Z",
  hacizSafeProjection: {
    action: "HACIZ_REQUEST_SUBMITTED",
    targetType: { code: "BANK", label: "Banka" },
    overallLevel: { code: "YUKSEK", label: "Yüksek" },
    createdAt: "2026-06-01T10:00:00.000Z",
    actor: { id: "u1", displayName: "Av. Test" },
    uyapRequestId: "uyap-1",
    cpeTraceId: "trace-1",
    cpeWarningsPresent: true,
    cpeWarningsCount: 1,
    debtors: [
      {
        debtorReference: "d1",
        displayLabel: "Borçlu #1",
        level: { code: "YUKSEK", label: "Yüksek" },
        reasonIds: ["INTEL_NO_ADDRESS"],
        reasons: [{ id: "INTEL_NO_ADDRESS", label: "Borçlunun kayıtlı adresi yok" }],
      },
    ],
  },
  metadata: {
    overallLevel: "YUKSEK",
    targetType: "BANK",
    debtors: [{ debtorId: "d1", name: "RAW SNAPSHOT BORCLU", level: "YUKSEK", reasonIds: ["INTEL_NO_ADDRESS"] }],
    cpeWarnings: [{ secret: "RAW CPE WARNING" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HacizHistoryCard — CASEDETAILTABS-MIGRATION-C1 (#123 re-wire, collapsible + lazy)", () => {
  it("kapalıyken (varsayılan) panel mount EDİLMEZ → fetch YAPILMAZ (lazy kanıtı)", () => {
    getAudits.mockResolvedValue({ logs: [sampleLog], total: 1, page: 1, limit: 20, totalPages: 1 });
    render(<HacizHistoryCard caseId="c1" />);
    // Kart başlığı görünür, ama panel mount edilmedi → fetch tetiklenmez.
    expect(screen.getByText("Haciz Gönderim Geçmişi")).toBeTruthy();
    expect(screen.queryByText(/Gizle/)).toBeNull(); // kapalı durum (▼ Göster)
    expect(getAudits).not.toHaveBeenCalled(); // ← LAZY: kapalı → fetch YOK
  });

  it("açılınca panel mount → fetch YAPILIR + safe projection render edilir", async () => {
    const { metadata, ...safeOnly } = sampleLog;
    getAudits.mockResolvedValue({ logs: [safeOnly], total: 1, page: 1, limit: 20, totalPages: 1 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1")); // ← LAZY: açık → fetch VAR
    await waitFor(() => expect(screen.getByText("Borçlu #1")).toBeTruthy());
    expect(screen.getByText(/Borçlunun kayıtlı adresi yok/i)).toBeTruthy();
    expect(screen.getByText(/Risk: Yüksek/i)).toBeTruthy();
    expect(screen.queryByText("RAW SNAPSHOT BORCLU")).toBeNull();
    expect(screen.queryByText("RAW CPE WARNING")).toBeNull();
  });

  it("safe projection yoksa raw metadata'ya düşmez", async () => {
    getAudits.mockResolvedValue({
      logs: [{ ...sampleLog, hacizSafeProjection: null }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText(/Haciz haczi gönderildi/i)).toBeTruthy();
    expect(screen.queryByText("RAW SNAPSHOT BORCLU")).toBeNull();
  });

  it("açılınca boş-durum: kayıt yoksa bilgi mesajı", async () => {
    getAudits.mockResolvedValue({ logs: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1"));
    expect(screen.getByText(/henüz haciz gönderimi kaydı yok/i)).toBeTruthy();
  });
});

// R12 Kabul A (09.11.2026): açılan paneldeki metinler çift kodlanmış UTF-8 (mojibake: "GÃ¶nderim",
// "henÃ¼z", "Ã¢â‚¬Â¢") olarak görünüyordu; bozulma CaseHistoryPanel kaynak dizgelerindeydi (API etiketleri doğru).
const MOJIBAKE = /Ã|Ä|Å|â€|Â/;

describe("HacizHistoryCard — R12 Kabul A Türkçe metin (mojibake yok)", () => {
  it("boş durum: başlık, açıklama ve bilgi metni doğru Türkçe", async () => {
    getAudits.mockResolvedValue({ logs: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const { container } = render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Bu dosyada henüz haciz gönderimi kaydı yok.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Haciz Gönderim Geçmişi" })).toBeTruthy();
    expect(
      screen.getByText("Haciz talebi gönderildiği anda backend'in hesapladığı saha istihbaratı riski (karar-anı izi). Salt görüntü."),
    ).toBeTruthy();
    expect(container.textContent).not.toMatch(MOJIBAKE);
  });

  it("kayıtlı durum: gerekçe madde imi • ve metin doğru", async () => {
    const { metadata, ...safeOnly } = sampleLog;
    getAudits.mockResolvedValue({ logs: [safeOnly], total: 1, page: 1, limit: 20, totalPages: 1 });
    const { container } = render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("• Borçlunun kayıtlı adresi yok")).toBeTruthy();
    expect(container.textContent).not.toMatch(MOJIBAKE);
  });

  it("yükleniyor ve hata durumları doğru Türkçe", async () => {
    getAudits.mockReturnValue(new Promise(() => {}));
    const first = render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Yükleniyor…")).toBeTruthy();
    expect(first.container.textContent).not.toMatch(MOJIBAKE);
    first.unmount();

    getAudits.mockRejectedValue(new Error("network"));
    const second = render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("İşlem geçmişi yüklenemedi.")).toBeTruthy();
    expect(second.container.textContent).not.toMatch(MOJIBAKE);
  });
});
