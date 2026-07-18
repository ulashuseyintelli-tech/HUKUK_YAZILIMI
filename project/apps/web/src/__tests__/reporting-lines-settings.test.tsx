import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";
import ReportingLinesPage from "@/app/(dashboard)/settings/reporting-lines/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Raporlama Hiyerarşisi (reporting-lines) ayar sayfası", () => {
  it("mount'ta 3 endpoint çağırır ve ilişkileri isimlerle render eder", async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === "/reporting-lines")
        return Promise.resolve({
          data: {
            relationships: [
              {
                id: "r1",
                actorUserId: "a",
                managerUserId: "b",
                validFrom: "2026-01-01",
              },
            ],
          },
        });
      if (url === "/reporting-lines/eligible")
        return Promise.resolve({
          data: {
            eligible: [
              { userId: "a", name: "Ayse", email: "a@x", profileType: "STAFF" },
              { userId: "b", name: "Bora", email: "b@x", profileType: "LAWYER" },
            ],
          },
        });
      if (url === "/reporting-lines/reconciliation")
        return Promise.resolve({ data: { actorsPlaced: 1, cycles: 0 } });
      return Promise.resolve({ data: {} });
    });

    render(<ReportingLinesPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/reporting-lines"),
    );
    expect(api.get).toHaveBeenCalledWith("/reporting-lines/eligible");
    expect(api.get).toHaveBeenCalledWith("/reporting-lines/reconciliation");
    await waitFor(() => expect(screen.getByText("Ayse")).toBeInTheDocument());
    expect(screen.getByText("Bora")).toBeInTheDocument();
  });

  it("403 → yetki-yok paneli gösterir", async () => {
    (api.get as any).mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403 }),
    );

    render(<ReportingLinesPage />);

    await waitFor(() =>
      expect(
        screen.getByText("Bu sayfayı görüntüleme yetkiniz yok."),
      ).toBeInTheDocument(),
    );
  });
});
