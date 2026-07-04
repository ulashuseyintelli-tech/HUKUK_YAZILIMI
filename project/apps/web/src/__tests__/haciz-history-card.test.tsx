import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// DoÄŸrudan import: HacizHistoryCard â†’ CaseHistoryPanel â†’ @/lib/api (mock) + safe Haciz projection.
// @shared/types zinciri yok â†’ test-safe.
import { HacizHistoryCard } from "@/components/case/HacizHistoryCard";
import { api } from "@/lib/api";

// CASEDETAILTABS-MIGRATION-C1: #123 Haciz Gönderim Geçmişi re-wire â€” collapsible + lazy.
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

describe("HacizHistoryCard â€” CASEDETAILTABS-MIGRATION-C1 (#123 re-wire, collapsible + lazy)", () => {
  it("kapalÄ±yken (varsayÄ±lan) panel mount EDÄ°LMEZ â†’ fetch YAPILMAZ (lazy kanÄ±tÄ±)", () => {
    getAudits.mockResolvedValue({ logs: [sampleLog], total: 1, page: 1, limit: 20, totalPages: 1 });
    render(<HacizHistoryCard caseId="c1" />);
    // Kart baÅŸlÄ±ÄŸÄ± gÃ¶rÃ¼nÃ¼r, ama panel mount edilmedi â†’ fetch tetiklenmez.
    expect(screen.getByText("Haciz Gönderim Geçmişi")).toBeTruthy();
    expect(screen.queryByText(/Gizle/)).toBeNull(); // kapalÄ± durum (â–¼ GÃ¶ster)
    expect(getAudits).not.toHaveBeenCalled(); // â† LAZY: kapalÄ± â†’ fetch YOK
  });

  it("aÃ§Ä±lÄ±nca panel mount â†’ fetch YAPILIR + safe projection render edilir", async () => {
    getAudits.mockResolvedValue({ logs: [sampleLog], total: 1, page: 1, limit: 20, totalPages: 1 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1")); // â† LAZY: aÃ§Ä±k â†’ fetch VAR
    await waitFor(() => expect(screen.getByText("Borçlu #1")).toBeTruthy());
    expect(screen.getByText(/Borçlunun kayıtlı adresi yok/i)).toBeTruthy();
    expect(screen.getByText(/Risk: Yüksek/i)).toBeTruthy();
    expect(screen.queryByText("RAW SNAPSHOT BORCLU")).toBeNull();
    expect(screen.queryByText("RAW CPE WARNING")).toBeNull();
  });

  it("safe projection yoksa raw metadata'ya dÃ¼ÅŸmez", async () => {
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

  it("aÃ§Ä±lÄ±nca boÅŸ-durum: kayÄ±t yoksa bilgi mesajÄ±", async () => {
    getAudits.mockResolvedValue({ logs: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    render(<HacizHistoryCard caseId="c1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getAudits).toHaveBeenCalledWith("c1"));
    expect(screen.getByText(/henÃ¼z haciz gÃ¶nderimi kaydÄ± yok/i)).toBeTruthy();
  });
});
