/**
 * K3-L KP-11 (owner kararı 2026-10-01) — hesap tarihi:
 *  - yeni hesapta varsayılan Türkiye takvimine göre bugün (TSİ 00:00–02:59 arasında UTC günü bir önceki gündür);
 *  - kullanılan tarih çıktıda açıkça yazılır (ödeme önizlemesi kartı sunucunun kullandığı tarihi gösterir).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { isCalendarDay, turkeyCalendarDate, turkeyToday } from "@/lib/turkey-calendar";

const previewCasePayment = vi.fn();
const useCaseCalculation = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    previewCasePayment: (...a: unknown[]) => previewCasePayment(...a),
    cancelCollection: vi.fn(),
  },
}));

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: (...a: unknown[]) => useCaseCalculation(...a),
  formatTL: (amount: number) => `${amount.toFixed(2)} TL`,
  formatDate: (date: string) => date,
}));

vi.mock("@/hooks/useBalanceShadowDiff", () => ({
  useBalanceShadowDiff: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));

import { CollectionModal } from "../CollectionModal";
import { HesapOzetiPanel } from "../HesapOzetiPanel";

const AT_TSI_0230 = new Date("2026-09-30T23:30:00.000Z"); // UTC günü 2026-09-30, Türkiye günü 2026-10-01

describe("K3-L KP-11: Türkiye takvimi günü (web)", () => {
  it.each([
    ["2026-09-30T20:59:59.999Z", "2026-09-30"],
    ["2026-09-30T21:00:00.000Z", "2026-10-01"],
    ["2026-09-30T23:30:00.000Z", "2026-10-01"],
    ["2026-12-31T21:00:00.000Z", "2027-01-01"],
  ])("%s → %s", (instant, expected) => {
    expect(turkeyCalendarDate(new Date(instant))).toBe(expected);
    expect(turkeyToday(new Date(instant))).toBe(expected);
  });

  it("taslak doğrulaması yalnız geçerli takvim gününü kabul eder", () => {
    expect(isCalendarDay("2026-09-15")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("15.09.2026")).toBe(false);
    expect(isCalendarDay(undefined)).toBe(false);
  });
});

describe("K3-L KP-11: varsayılan hesap tarihi ve çıktıda kullanılan tarih", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AT_TSI_0230);
    previewCasePayment.mockReset();
    useCaseCalculation.mockReset().mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Hesap Özeti paneli tarih verilmezse Türkiye takvimine göre bugünle hesaplar (UTC günü değil)", () => {
    render(<HesapOzetiPanel caseId="case-1" />);
    expect(useCaseCalculation).toHaveBeenCalledWith(expect.objectContaining({ caseId: "case-1", calculationDate: "2026-10-01" }));
  });

  it("Hesap Özeti paneli verilen hesap tarihini aynen kullanır", () => {
    render(<HesapOzetiPanel caseId="case-1" calculationDate="2026-06-15" />);
    expect(useCaseCalculation).toHaveBeenCalledWith(expect.objectContaining({ calculationDate: "2026-06-15" }));
  });

  it("tahsilat formu varsayılan günü Türkiye takvimine göre bugün; önizleme kartı sunucunun kullandığı hesap tarihini yazar", async () => {
    previewCasePayment.mockResolvedValue({
      nonPersistent: true,
      caseId: "case-1",
      asOfDate: "2026-10-01",
      asOfDateSource: "PAYMENT_DATE",
      input: { amount: 500, paymentDate: "2026-10-01", currency: "TRY", caseDebtorId: null },
      acceptance: { wouldAccept: true, blockingReasons: [], warnings: [] },
      balanceImpact: {
        currentOutstandingAmount: 1000,
        paymentAmount: 500,
        appliedAmount: 500,
        overpaymentAmount: 0,
        projectedOutstandingAmount: 500,
      },
      distributionPreview: { status: "HELD_PENDING_DISTRIBUTION", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    });
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    await waitFor(() => expect(previewCasePayment).toHaveBeenCalledTimes(1));
    // Tahsilat tarihi = önizlemenin hesap tarihi; UTC günü 2026-09-30 olurdu
    expect(previewCasePayment.mock.calls[0][1]).toMatchObject({ paymentDate: "2026-10-01" });
    expect(await screen.findByTestId("payment-preview-as-of")).toHaveTextContent("hesap tarihi 01.10.2026");
  });
});
