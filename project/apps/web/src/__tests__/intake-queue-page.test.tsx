import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntakeQueuePage from "@/app/(dashboard)/intake/page";
import { api } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ api: { listIntakeSubmissions: vi.fn() } }));

const listIntakeSubmissions = api.listIntakeSubmissions as unknown as ReturnType<typeof vi.fn>;

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    tenantId: "t",
    intakeLinkId: "l1",
    caseId: "c1",
    clientId: "cl1",
    status: "IN_REVIEW",
    submittedAt: "2026-06-17T10:00:00Z",
    claimedById: null,
    claimedAt: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: "2026-06-17T10:00:00Z",
    ...over,
  };
}

describe("IntakeQueuePage (review kuyruğu)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("kuyruğu listeler", async () => {
    listIntakeSubmissions.mockResolvedValue([sub()]);
    render(<IntakeQueuePage />);
    await waitFor(() => expect(listIntakeSubmissions).toHaveBeenCalled());
    // Satıra özgü öğeler (durum metni filtre option'ı ile çakışır → onu kullanma)
    expect(screen.getByText("Dosyaya git")).toBeTruthy();
    expect(screen.getByRole("link", { name: /İncele/ })).toBeTruthy();
  });

  it("durum filtresi → status ile yeniden yükler", async () => {
    listIntakeSubmissions.mockResolvedValue([]);
    render(<IntakeQueuePage />);
    await waitFor(() => expect(listIntakeSubmissions).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Durum filtresi"), { target: { value: "REJECTED" } });
    await waitFor(() => expect(listIntakeSubmissions).toHaveBeenCalledWith({ status: "REJECTED" }));
  });
});
