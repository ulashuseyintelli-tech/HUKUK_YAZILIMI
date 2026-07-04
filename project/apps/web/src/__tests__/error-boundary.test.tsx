import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/error-reporter", () => ({ reportClientError: vi.fn() }));
import { reportClientError } from "@/lib/error-reporter";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("render kaboom");
}

beforeEach(() => {
  (reportClientError as any).mockClear();
  // React, boundary yakalarken console.error'a basar → test gürültüsünü sustur.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("render crash yakalar + minimal fallback gösterir", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Bir hata oluştu/i)).toBeInTheDocument();
  });

  it("reportClientError çağrılır; componentStack STACK alanına eklenir", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(reportClientError).toHaveBeenCalledTimes(1);
    const arg = (reportClientError as any).mock.calls[0][0];
    expect(arg.level).toBe("ERROR");
    expect(arg.message).toContain("render kaboom");
    expect(arg.stack).toContain("React component stack:");
    expect(arg.metadata).toEqual({ safeErrorCode: "REACT_RENDER_CRASH" });
  });

  it("hata yoksa children render eder (rapor yok)", () => {
    render(
      <ErrorBoundary>
        <div>ok-content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok-content")).toBeInTheDocument();
    expect(reportClientError).not.toHaveBeenCalled();
  });
});
