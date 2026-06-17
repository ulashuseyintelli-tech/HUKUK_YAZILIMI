import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntakeSubmissionDetailPage from "@/app/(dashboard)/intake-review/[id]/page";
import { api } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  api: {
    getIntakeSubmission: vi.fn(),
    getCase: vi.fn(),
    claimIntakeSubmission: vi.fn(),
    reviewIntakeField: vi.fn(),
    bulkReviewIntakeFields: vi.fn(),
    rejectIntakeSubmission: vi.fn(),
  },
}));

const getIntakeSubmission = api.getIntakeSubmission as unknown as ReturnType<typeof vi.fn>;
const getCase = api.getCase as unknown as ReturnType<typeof vi.fn>;
const claimIntakeSubmission = api.claimIntakeSubmission as unknown as ReturnType<typeof vi.fn>;
const reviewIntakeField = api.reviewIntakeField as unknown as ReturnType<typeof vi.fn>;
const bulkReviewIntakeFields = api.bulkReviewIntakeFields as unknown as ReturnType<typeof vi.fn>;
const rejectIntakeSubmission = api.rejectIntakeSubmission as unknown as ReturnType<typeof vi.fn>;

function field(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    submissionId: "s1",
    category: "INCOME_SOURCE",
    label: null,
    value: "Müteahhit",
    note: null,
    reviewStatus: "PENDING",
    reviewNote: null,
    promotedRefType: null,
    promotedRefId: null,
    createdAt: "2026-06-17T10:00:00Z",
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}) {
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
    fields: [field()],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCase.mockResolvedValue({ fileNumber: "2025/1", client: { name: "Acme" } });
});

describe("IntakeSubmissionDetailPage (REVIEW-ONLY)", () => {
  it("IN_REVIEW: alanları + Onayla/Reddet gösterir; Onayla → reviewIntakeField", async () => {
    getIntakeSubmission.mockResolvedValue(detail());
    reviewIntakeField.mockResolvedValue(detail({ fields: [field({ reviewStatus: "APPROVED" })] }));
    render(<IntakeSubmissionDetailPage params={{ id: "s1" }} />);
    await waitFor(() => expect(screen.getByText("Müteahhit")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(reviewIntakeField).toHaveBeenCalledWith("f1", "APPROVE"));
  });

  it("CLIENT_SUBMITTED: 'İncelemeyi üstlen' var; claim çağrılır", async () => {
    getIntakeSubmission.mockResolvedValue(detail({ status: "CLIENT_SUBMITTED" }));
    claimIntakeSubmission.mockResolvedValue(detail({ status: "IN_REVIEW" }));
    render(<IntakeSubmissionDetailPage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText("Müteahhit"));

    // claim öncesi alan review butonu YOK
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /İncelemeyi üstlen/ }));
    await waitFor(() => expect(claimIntakeSubmission).toHaveBeenCalledWith("s1"));
  });

  it("toplu onay: alan seç → bulkReviewIntakeFields", async () => {
    getIntakeSubmission.mockResolvedValue(detail());
    bulkReviewIntakeFields.mockResolvedValue(detail({ fields: [field({ reviewStatus: "APPROVED" })] }));
    render(<IntakeSubmissionDetailPage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText("Müteahhit"));

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Seçili alanları onayla/ }));
    await waitFor(() => expect(bulkReviewIntakeFields).toHaveBeenCalledWith("s1", ["f1"], "APPROVE"));
  });

  it("gönderimi reddet → rejectIntakeSubmission", async () => {
    getIntakeSubmission.mockResolvedValue(detail());
    rejectIntakeSubmission.mockResolvedValue(detail({ status: "REJECTED" }));
    render(<IntakeSubmissionDetailPage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText("Müteahhit"));

    fireEvent.click(screen.getByRole("button", { name: /Gönderimi reddet/ }));
    await waitFor(() => expect(rejectIntakeSubmission).toHaveBeenCalledWith("s1"));
  });

  it("MİMARİ SINIR: promote/aktarım kontrolü EKRANDA YOK", async () => {
    getIntakeSubmission.mockResolvedValue(detail());
    render(<IntakeSubmissionDetailPage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText("Müteahhit"));

    expect(screen.queryByRole("button", { name: /promote|aktar|kanon/i })).toBeNull();
    expect(screen.queryByText(/promote|kanoniğe aktar/i)).toBeNull();
  });
});
