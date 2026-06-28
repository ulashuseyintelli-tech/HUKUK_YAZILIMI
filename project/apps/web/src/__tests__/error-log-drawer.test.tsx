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

  it("requestId (üst alan) + message + stack + metadata JSON + occurrenceCount render eder", () => {
    render(<ErrorLogDetailDrawer log={baseLog} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(screen.getByText("req-xyz")).toBeInTheDocument(); // requestId üst alan (exact)
    expect(screen.getByText(/boom error message/)).toBeInTheDocument();
    expect(screen.getByText(/at handler/)).toBeInTheDocument(); // stack <pre>
    expect(screen.getByText(/NETWORK_ERROR/)).toBeInTheDocument(); // metadata JSON <pre>
    expect(screen.getByText("3")).toBeInTheDocument(); // occurrenceCount
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
