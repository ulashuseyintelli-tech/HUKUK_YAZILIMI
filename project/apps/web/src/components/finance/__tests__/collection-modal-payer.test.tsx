import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// K3-L (owner kararları 2026-09-28/29): tahsilat yalnız HESABINA ödeme yapılan borçlunun sorumlu olduğu kalemlere
// mahsup edilir; borçlu belirsizse tahsilat kaydedilir ve mahsup bekletilir. Modal seçimi önizleme ve kayda taşır.

const createCollection = vi.fn();
const previewCasePayment = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: (...a: unknown[]) => createCollection(...a),
    updateCollection: vi.fn(),
    previewCasePayment: (...a: unknown[]) => previewCasePayment(...a),
    cancelCollection: vi.fn(),
  },
}));

import { CollectionModal } from "../CollectionModal";

const debtors = [
  { id: "cd-kesideci", role: "KESIDECI", lifecycleStatus: "ACTIVE", debtor: { name: "Keşideci Ali" } },
  { id: "cd-ciranta", role: "CIRANTA", lifecycleStatus: "ACTIVE", debtor: { name: "Ciranta Ayşe" } },
  { id: "cd-pasif", role: "AVAL", lifecycleStatus: "PASSIVE", debtor: { name: "Pasif Aval" } },
];

describe("CollectionModal hesabına ödeme yapılan borçlu (K3-L)", () => {
  it("etiket gönderen kişiyi değil hesabına ödeme yapılan borçluyu ister", () => {
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} debtors={debtors} />);
    expect(screen.getByLabelText("Hesabına ödeme yapılan borçlu")).toBeTruthy();
    expect(screen.getByText(/Parayı gönderen kişi veya ileten icra dairesi değil/)).toBeTruthy();
  });

  beforeEach(() => {
    createCollection.mockReset().mockResolvedValue({ id: "col-1" });
    previewCasePayment.mockReset();
  });

  it("yalnız etkin borçluları sunar ve seçimi kayda caseDebtorId olarak taşır", async () => {
    const onSuccess = vi.fn();
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={onSuccess} debtors={debtors} />);
    const select = screen.getByTestId("collection-payer-select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Belirtilmedi",
      "Keşideci Ali (KESIDECI)",
      "Ciranta Ayşe (CIRANTA)",
    ]);
    fireEvent.change(select, { target: { value: "cd-ciranta" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Ekle" }));
    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(createCollection.mock.calls[0][1]).toMatchObject({ caseDebtorId: "cd-ciranta", amount: 500 });
  });

  it("seçim yoksa caseDebtorId gönderilmez; mahsup bekletme uyarısı önizlemede Türkçe gösterilir", async () => {
    previewCasePayment.mockResolvedValue({
      nonPersistent: true,
      caseId: "case-1",
      input: { amount: 500, currency: "TRY", caseDebtorId: null },
      acceptance: { wouldAccept: true, blockingReasons: [], warnings: ["ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED"] },
      balanceImpact: {
        currentOutstandingAmount: 0,
        paymentAmount: 500,
        appliedAmount: 0,
        overpaymentAmount: 500,
        projectedOutstandingAmount: 0,
      },
      distributionPreview: { status: "HELD_PENDING_DISTRIBUTION", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    });
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} debtors={debtors} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    await waitFor(() => expect(previewCasePayment).toHaveBeenCalledTimes(1));
    expect(previewCasePayment.mock.calls[0][1]).not.toHaveProperty("caseDebtorId");
    expect(await screen.findByText(/mahsup bekletilecek/)).toBeTruthy();
  });

  it("borçlu listesi yoksa seçim alanı gösterilmez (mevcut davranış)", () => {
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} />);
    expect(screen.queryByTestId("collection-payer-select")).toBeNull();
  });
});
