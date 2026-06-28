import { CasePaymentPreviewController } from "../case-payment-preview.controller";

describe("CasePaymentPreviewController", () => {
  it("delegates tenant, case and request body to the dry-run preview service", async () => {
    const response = {
      nonPersistent: true,
      caseId: "case-1",
      input: { amount: 100, currency: "TRY", caseDebtorId: null },
      acceptance: { wouldAccept: true, blockingReasons: [], warnings: [] },
      balanceImpact: {
        currentOutstandingAmount: 250,
        paymentAmount: 100,
        appliedAmount: 100,
        overpaymentAmount: 0,
        projectedOutstandingAmount: 150,
      },
      distributionPreview: {
        source: "SINGLE_CASE_CLIENT",
        status: "HELD_PENDING_DISTRIBUTION",
        totalAmount: 100,
        requiresClientSelection: false,
        lines: [{ type: "CLIENT_PAYABLE", amount: 100, caseClientId: "case-client-1" }],
      },
    } as const;
    const service = {
      preview: jest.fn(async () => response),
    };
    const controller = new CasePaymentPreviewController(service as never);
    const body = {
      amount: 100,
      currency: "TRY",
      paymentDate: "2026-06-28",
      paymentMethod: "BANK_TRANSFER",
    };

    await expect(controller.previewPayment("tenant-1", "case-1", body)).resolves.toBe(response);

    expect(service.preview).toHaveBeenCalledTimes(1);
    expect(service.preview).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      caseId: "case-1",
      input: body,
    });
  });
});
