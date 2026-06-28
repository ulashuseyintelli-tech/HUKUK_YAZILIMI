import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getErrorLogs: vi.fn(), getErrorLogStats: vi.fn(), resolveErrorLog: vi.fn() },
}));
import { api } from "@/lib/api";
import ErrorLogsPage from "@/app/(dashboard)/settings/error-logs/page";

beforeEach(() => {
  (api.getErrorLogs as any).mockReset();
  (api.getErrorLogStats as any).mockReset().mockResolvedValue({ total: 0, errors: 0, warnings: 0, unresolved: 0 });
});
afterEach(() => vi.restoreAllMocks());

describe("ErrorLogsPage (PR-5)", () => {
  it("403 → 'yetkiniz yok' state (boş listeden FARKLI)", async () => {
    (api.getErrorLogs as any).mockRejectedValue({ status: 403 });
    render(<ErrorLogsPage />);
    await waitFor(() =>
      expect(screen.getByText("Bu sayfayı görüntüleme yetkiniz yok.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Henüz log kaydı yok")).toBeNull();
  });

  it("boş liste → 'Henüz log kaydı yok' (403'ten FARKLI)", async () => {
    (api.getErrorLogs as any).mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    render(<ErrorLogsPage />);
    await waitFor(() => expect(screen.getByText("Henüz log kaydı yok")).toBeInTheDocument());
    expect(screen.queryByText("Bu sayfayı görüntüleme yetkiniz yok.")).toBeNull();
  });

  it("dolu liste → mesaj render + satıra tıklayınca drawer açılır", async () => {
    (api.getErrorLogs as any).mockResolvedValue({
      logs: [
        {
          id: "l1",
          level: "ERROR",
          source: "API",
          message: "kayıt mesajı",
          isResolved: false,
          createdAt: "2026-06-28T00:00:00Z",
          occurrenceCount: 1,
          metadata: { requestId: "req-1" },
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    render(<ErrorLogsPage />);
    await waitFor(() => expect(screen.getByText("kayıt mesajı")).toBeInTheDocument());
    fireEvent.click(screen.getByText("kayıt mesajı"));
    expect(screen.getByText("Hata Detayı")).toBeInTheDocument(); // drawer açıldı
  });
});
