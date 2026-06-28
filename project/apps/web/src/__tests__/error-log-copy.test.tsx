import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ api: { resolveErrorLog: vi.fn() } }));
import { CopyButton } from "@/components/error/CopyButton";
import { ErrorLogDetailDrawer } from "@/components/error/ErrorLogDetailDrawer";
import type { ErrorLogRecord } from "@/lib/api";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("CopyButton", () => {
  it("tıklayınca navigator.clipboard.writeText(value) çağrılır", async () => {
    render(<CopyButton value="kopyalanacak-deger" />);
    fireEvent.click(screen.getByText("Kopyala"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("kopyalanacak-deger"));
  });

  it("clipboard yoksa SESSİZCE geçer (throw etmez)", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<CopyButton value="x" />);
    expect(() => fireEvent.click(screen.getByText("Kopyala"))).not.toThrow();
    expect(writeText).not.toHaveBeenCalled();
  });
});

const log: ErrorLogRecord = {
  id: "l1",
  level: "ERROR",
  source: "API",
  message: "boom",
  stack: "at handler (/x.ts:1:2)",
  metadata: { requestId: "req-zzz", safeErrorCode: "NETWORK_ERROR" },
  isResolved: false,
  createdAt: "2026-06-28T00:00:00Z",
  occurrenceCount: 1,
};

describe("Drawer copy butonları", () => {
  it("requestId / stack / metadata copy → writeText ilgili değerle çağrılır", async () => {
    render(<ErrorLogDetailDrawer log={log} onClose={vi.fn()} onResolved={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Request ID kopyala"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("req-zzz"));

    fireEvent.click(screen.getByLabelText("Stack kopyala"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("at handler (/x.ts:1:2)"));

    fireEvent.click(screen.getByLabelText("Metadata kopyala"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(log.metadata, null, 2)));
  });
});
