import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/lib/error-reporter", () => ({ reportClientError: vi.fn() }));
import { reportClientError } from "@/lib/error-reporter";
import { GlobalErrorHandlers } from "@/components/error/GlobalErrorHandlers";

function dispatchRejection(reason: unknown) {
  const ev: any = new Event("unhandledrejection");
  ev.reason = reason;
  window.dispatchEvent(ev);
}

beforeEach(() => {
  (reportClientError as any).mockClear();
});
afterEach(() => cleanup());

describe("GlobalErrorHandlers", () => {
  it("window 'error' → reportClientError (WINDOW_ERROR)", () => {
    render(<GlobalErrorHandlers />);
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));
    expect(reportClientError).toHaveBeenCalled();
    const arg = (reportClientError as any).mock.calls.at(-1)[0];
    expect(arg.metadata.safeErrorCode).toBe("WINDOW_ERROR");
    expect(arg.message).toContain("boom");
  });

  it("unhandledrejection (Error reason) → raporlanır", () => {
    render(<GlobalErrorHandlers />);
    dispatchRejection(new Error("rejected"));
    expect(reportClientError).toHaveBeenCalled();
    const arg = (reportClientError as any).mock.calls.at(-1)[0];
    expect(arg.message).toContain("rejected");
    expect(arg.metadata.safeErrorCode).toBe("UNHANDLED_REJECTION");
  });

  it("unhandledrejection HTTP-status reason → SKIP (duplicate önle)", () => {
    render(<GlobalErrorHandlers />);
    dispatchRejection({ status: 500, body: { message: "x" } });
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("unmount → 'error' + 'unhandledrejection' listener'ları temizlenir", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<GlobalErrorHandlers />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    removeSpy.mockRestore();
  });
});
