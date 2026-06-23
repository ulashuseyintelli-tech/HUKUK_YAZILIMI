import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import: HacizHistoryCard → CaseHistoryPanel → @/lib/api (mock) + @/lib/haciz-audit-format (saf).
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
  metadata: {
    overallLevel: "YUKSEK",
    targetType: "BANK",
    debtors: [{ debtorId: "d1", name: "Borçlu A", level: "YUKSEK", reasonIds: ["INTEL_NO_ADDRESS"] }],
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
    expect(screen.queryByText("▲ Gizle")).toBeNull(); // kapalı durum (▼ Göster)
    expect(getAudits).not.toHaveBeenCalled(); // ← LAZY: kapalı → fetch YOK
  });

  it("açılınca panel mount → fetch YAPILIR + log render edilir", async () => {
    getAudits.mockResolvedValue({ logs: [sampleLog], total: 1, page: 1, limit: 20, totalPages: 1 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1")); // ← LAZY: açık → fetch VAR
    // Log içeriği render edildi (borçlu adı doğrudan basılır):
    await waitFor(() => expect(screen.getByText("Borçlu A")).toBeTruthy());
  });

  it("açılınca boş-durum: kayıt yoksa bilgi mesajı", async () => {
    getAudits.mockResolvedValue({ logs: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1"));
    expect(screen.getByText(/henüz haciz gönderimi kaydı yok/i)).toBeTruthy();
  });
});
