import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IntakePromotePage from "@/app/(dashboard)/intake/[id]/promote/page";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getIntakeSubmission: vi.fn(),
    getCaseDebtors: vi.fn(),
    getCase: vi.fn(),
    promoteSoftField: vi.fn(),
    promoteAddressField: vi.fn(),
  },
}));

const getIntakeSubmission = api.getIntakeSubmission as unknown as ReturnType<typeof vi.fn>;
const getCaseDebtors = api.getCaseDebtors as unknown as ReturnType<typeof vi.fn>;
const getCase = api.getCase as unknown as ReturnType<typeof vi.fn>;
const promoteSoftField = api.promoteSoftField as unknown as ReturnType<typeof vi.fn>;
const promoteAddressField = api.promoteAddressField as unknown as ReturnType<typeof vi.fn>;

function field(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "f1", submissionId: "s1", category: "INCOME_SOURCE", label: null,
    value: "Müteahhit", note: null, reviewStatus: "APPROVED", reviewNote: null,
    promotedRefType: null, promotedRefId: null, createdAt: "2026-06-18T10:00:00Z",
    ...over,
  };
}
function sub(fields: unknown[]) {
  return {
    id: "s1", tenantId: "t", intakeLinkId: "l", caseId: "c1", clientId: "cl",
    status: "IN_REVIEW", submittedAt: "", claimedById: null, claimedAt: null,
    reviewedById: null, reviewedAt: null, createdAt: "", fields,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCase.mockResolvedValue({ fileNumber: "2026/1", client: { name: "Acme A.Ş." } });
  getCaseDebtors.mockResolvedValue({
    summary: {},
    items: [{ id: "d1", caseDebtorId: "cd1", displayName: "Borçlu A" }],
  });
});

describe("IntakePromotePage (field-level promote)", () => {
  it("APPROVED soft alan → Aktar → onay modalı → promoteSoftField(fieldId, debtorId)", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field()]));
    promoteSoftField.mockResolvedValue({ result: "PROMOTED", clientIntelStatementId: "cis1", submissionStatus: "COMPLETED" });
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => expect(getIntakeSubmission).toHaveBeenCalledWith("s1"));
    await waitFor(() => screen.getByRole("button", { name: /^Aktar$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Aktar$/ }));
    await waitFor(() => screen.getByRole("button", { name: /Kalıcı olarak aktar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Kalıcı olarak aktar/i }));
    await waitFor(() => expect(promoteSoftField).toHaveBeenCalledWith("f1", "d1"));
  });

  it("ADDRESS → Adres olarak aktar → street/city → promoteAddressField", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field({ id: "fa", category: "ADDRESS", value: "X Sok 1 Kadıköy" })]));
    promoteAddressField.mockResolvedValue({ result: "PROMOTED", debtorAddressId: "da1", submissionStatus: "COMPLETED" });
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByRole("button", { name: /Adres olarak aktar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Adres olarak aktar/i }));
    await waitFor(() => screen.getByLabelText("Sokak"));
    fireEvent.change(screen.getByLabelText("Sokak"), { target: { value: "X Sok 1" } });
    fireEvent.change(screen.getByLabelText("İl"), { target: { value: "İstanbul" } });
    fireEvent.click(screen.getByRole("button", { name: /Kalıcı olarak aktar/i }));
    await waitFor(() => expect(promoteAddressField).toHaveBeenCalled());
    const [fid, input] = promoteAddressField.mock.calls[0];
    expect(fid).toBe("fa");
    expect(input).toMatchObject({ debtorId: "d1", street: "X Sok 1", city: "İstanbul" });
  });

  it("ADDRESS → street/city boş → promote ÇAĞRILMAZ (validasyon)", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field({ id: "fa", category: "ADDRESS", value: "ham adres" })]));
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByRole("button", { name: /Adres olarak aktar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Adres olarak aktar/i }));
    await waitFor(() => screen.getByRole("button", { name: /Kalıcı olarak aktar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Kalıcı olarak aktar/i }));
    await waitFor(() => screen.getByText(/sokak ve il/i));
    expect(promoteAddressField).not.toHaveBeenCalled();
  });

  it("ASSET → 'aktarılamaz' DISABLED, promote çağrısı yok", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field({ id: "fas", category: "ASSET", value: "Araç" })]));
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByRole("button", { name: /aktarılamaz/i }));
    const btn = screen.getByRole("button", { name: /aktarılamaz/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(promoteSoftField).not.toHaveBeenCalled();
    expect(promoteAddressField).not.toHaveBeenCalled();
  });

  it("promotedRefId dolu → 'Aktarıldı' rozet, Aktar butonu YOK", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field({ promotedRefType: "ClientIntelStatement", promotedRefId: "cis-old" })]));
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText(/Aktarıldı/));
    expect(screen.queryByRole("button", { name: /^Aktar$/ })).toBeNull();
  });

  it("APPROVED olmayan alan → Aktar butonu YOK ('önce onaylanmalı')", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field({ reviewStatus: "PENDING" })]));
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getByText(/önce onaylanmalı/i));
    expect(screen.queryByRole("button", { name: /^Aktar$/ })).toBeNull();
  });

  it("toplu/submission-level aktar kontrolü YOK (yalnız field-level)", async () => {
    getIntakeSubmission.mockResolvedValue(sub([field(), field({ id: "f2", category: "STRATEGY", value: "Plan" })]));
    render(<IntakePromotePage params={{ id: "s1" }} />);
    await waitFor(() => screen.getAllByRole("button", { name: /^Aktar$/ }));
    expect(screen.queryByRole("button", { name: /tümünü aktar|gönderimi aktar|toplu/i })).toBeNull();
  });
});
