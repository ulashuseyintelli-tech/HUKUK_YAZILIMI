import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ api: { resolveErrorLog: vi.fn() } }));
import { api } from "@/lib/api";
import { ResolveErrorLogForm } from "@/components/error/ResolveErrorLogForm";

beforeEach(() => {
  (api.resolveErrorLog as any).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("ResolveErrorLogForm (PR-5)", () => {
  it("kısa açıklama (<10) → submit DISABLED, resolveErrorLog çağrılmaz", () => {
    render(<ResolveErrorLogForm logId="l1" onResolved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Çözüm açıklaması"), { target: { value: "kısa" } });
    const btn = screen.getByText("Çözüldü İşaretle");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(api.resolveErrorLog).not.toHaveBeenCalled();
  });

  it("yalnız boşluk → DISABLED (trim)", () => {
    render(<ResolveErrorLogForm logId="l1" onResolved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Çözüm açıklaması"), { target: { value: "              " } });
    expect(screen.getByText("Çözüldü İşaretle")).toBeDisabled();
  });

  it("geçerli açıklama (>=10) → resolveErrorLog(id, trimmed) + onResolved", async () => {
    (api.resolveErrorLog as any).mockResolvedValue({ id: "l1", isResolved: true });
    const onResolved = vi.fn();
    render(<ResolveErrorLogForm logId="l1" onResolved={onResolved} />);
    fireEvent.change(screen.getByLabelText("Çözüm açıklaması"), { target: { value: "  yeterince uzun açıklama  " } });
    fireEvent.click(screen.getByText("Çözüldü İşaretle"));
    await waitFor(() => expect(api.resolveErrorLog).toHaveBeenCalledWith("l1", "yeterince uzun açıklama"));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ id: "l1", isResolved: true }));
  });
});
