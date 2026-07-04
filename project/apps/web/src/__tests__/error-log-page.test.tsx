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

  it("dolu liste → humanized başlık (raw mesaj DEĞİL) + tıklayınca drawer açılır", async () => {
    (api.getErrorLogs as any).mockResolvedValue({
      logs: [
        {
          id: "l1",
          level: "ERROR",
          source: "FRONTEND",
          message: "Unhandled promise rejection",
          isResolved: false,
          createdAt: "2026-06-28T00:00:00Z",
          occurrenceCount: 1,
          endpoint: "web:rejection /clients/cmqp16a8f000rne1l4p0zjsft/accounting",
          metadata: { requestId: "req-1", safeErrorCode: "UNHANDLED_REJECTION" },
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    render(<ErrorLogsPage />);
    // Liste başlığı humanized: "Arayüz İşlem Hatası" (ham "Unhandled promise rejection" DEĞİL)
    await waitFor(() => expect(screen.getByText("Arayüz İşlem Hatası")).toBeInTheDocument());
    expect(screen.queryByText("Unhandled promise rejection")).toBeNull();
    // "Sorunlu sayfa" okunur Türkçe sayfa adı (cuid'li ham yol DEĞİL)
    expect(screen.getByText("Müvekkil Muhasebe")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Arayüz İşlem Hatası"));
    expect(screen.getByText("Hata Detayı")).toBeInTheDocument(); // drawer açıldı
    expect(screen.getByText("Bu hata ne anlama geliyor?")).toBeInTheDocument();
  });
});
