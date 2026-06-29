import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ api: { resolveErrorLog: vi.fn() } }));
import { ErrorLogDetailDrawer } from "@/components/error/ErrorLogDetailDrawer";
import type { ErrorLogRecord } from "@/lib/api";

const baseLog: ErrorLogRecord = {
  id: "l1",
  level: "ERROR",
  source: "API",
  message: "boom error message",
  stack: "at handler (/x.ts:1:2)",
  endpoint: "/api/cases",
  method: "POST",
  statusCode: 500,
  metadata: { requestId: "req-xyz", safeErrorCode: "NETWORK_ERROR" },
  isResolved: false,
  createdAt: "2026-06-28T00:00:00Z",
  occurrenceCount: 3,
  firstSeenAt: "2026-06-28T00:00:00Z",
  lastSeenAt: "2026-06-28T01:00:00Z",
};

describe("ErrorLogDetailDrawer (PR-5)", () => {
  it("log null → render etmez", () => {
    const { container } = render(<ErrorLogDetailDrawer log={null} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("humanized bölümler + KORUNAN teknik detay render eder", () => {
    render(<ErrorLogDetailDrawer log={baseLog} onClose={vi.fn()} onResolved={vi.fn()} />);
    // Katman 1 — humanized (NETWORK_ERROR → Bağlantı Hatası)
    expect(screen.getByText("Bu hata ne anlama geliyor?")).toBeInTheDocument();
    expect(screen.getByText("Bağlantı Hatası")).toBeInTheDocument();
    expect(screen.getByText("Teknik ekip için çözüm notu")).toBeInTheDocument();
    // Katman 2 — korunan teknik detay
    expect(screen.getByText("İşlem Kimliği")).toBeInTheDocument(); // RequestId türkçe label
    expect(screen.getByText("req-xyz")).toBeInTheDocument(); // değer korunur
    expect(screen.getByText(/boom error message/)).toBeInTheDocument(); // ham mesaj KAYBOLMAZ
    expect(screen.getByText(/at handler/)).toBeInTheDocument(); // stack <pre>
    expect(screen.getAllByText(/NETWORK_ERROR/).length).toBeGreaterThan(0); // Teknik Kod + metadata JSON
    expect(screen.getByText("3")).toBeInTheDocument(); // occurrenceCount (Tekrar)
  });

  it("çözülmemiş → resolve formu görünür", () => {
    render(<ErrorLogDetailDrawer log={baseLog} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(screen.getByText("Çözüldü olarak işaretle")).toBeInTheDocument();
  });

  it("çözülmüş → resolution gösterilir, resolve formu YOK", () => {
    const resolved: ErrorLogRecord = {
      ...baseLog,
      isResolved: true,
      resolution: "düzeltildi commit abc",
      resolvedBy: "admin1",
      resolvedAt: "2026-06-28T02:00:00Z",
    };
    render(<ErrorLogDetailDrawer log={resolved} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(screen.getByText("düzeltildi commit abc")).toBeInTheDocument();
    expect(screen.queryByText("Çözüldü olarak işaretle")).toBeNull();
  });
});
