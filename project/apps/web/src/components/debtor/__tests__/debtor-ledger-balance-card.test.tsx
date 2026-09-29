import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getCaseDebtorLedgerBalances = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { getCaseDebtorLedgerBalances: (...a: unknown[]) => getCaseDebtorLedgerBalances(...a) },
}));

import { DebtorLedgerBalanceCard } from "../DebtorLedgerBalanceCard";

const result = {
  kaynak: "KALICI_DEFTER",
  isleyenFaizDahil: false,
  not: "işleyen faiz HARİÇTİR",
  borclular: [
    {
      caseDebtorId: "cd-k",
      debtorId: "k",
      ad: "Keşideci Ali",
      rol: "KESIDECI",
      kalemler: [
        { claimItemId: "p", kalemTuru: "PRINCIPAL", aciklama: "Çek Bedeli", paraBirimi: "TRY", tutar: 10000, tahsilEdilen: 500, kalan: 9500, ortak: true },
        { claimItemId: "t", kalemTuru: "CHECK_PENALTY", aciklama: "Çek Tazminatı", paraBirimi: "TRY", tutar: 1000, tahsilEdilen: 300, kalan: 700, ortak: false },
      ],
      toplamlar: [{ paraBirimi: "TRY", tutar: 11000, tahsilEdilen: 800, kalan: 10200 }],
    },
    {
      caseDebtorId: "cd-c",
      debtorId: "c",
      ad: "Ciranta Ayşe",
      rol: "CIRANTA",
      kalemler: [
        { claimItemId: "p", kalemTuru: "PRINCIPAL", aciklama: "Çek Bedeli", paraBirimi: "TRY", tutar: 10000, tahsilEdilen: 500, kalan: 9500, ortak: true },
      ],
      toplamlar: [{ paraBirimi: "TRY", tutar: 10000, tahsilEdilen: 500, kalan: 9500 }],
    },
  ],
  sorumlusuBulunamayanKalemler: [],
  mahsubuBekleyenTahsilatlar: [{ collectionId: "col-h", tutar: 250, paraBirimi: "TRY", sebep: "ON_BEHALF_DEBTOR_REQUIRED" }],
};

/** K3-L Faz 1c — borçlu detayında kalem bazlı borç (faiz hariç). */
describe("DebtorLedgerBalanceCard (K3-L)", () => {
  beforeEach(() => getCaseDebtorLedgerBalances.mockReset().mockResolvedValue(result));

  it("ciranta yalnız ortak bedeli görür; keşideciye ait tazminat listelenmez", async () => {
    render(<DebtorLedgerBalanceCard caseId="case-1" caseDebtorId="cd-c" />);
    await waitFor(() => expect(screen.getAllByTestId("debtor-ledger-line")).toHaveLength(1));
    expect(screen.queryByText(/Çek Tazminatı/)).toBeNull();
    expect(screen.getByTestId("debtor-ledger-total").textContent).toContain("9.500,00 TRY");
  });

  it("keşideci kendi tazminatını 'yalnız bu borçlu grubuna ait' etiketiyle görür", async () => {
    render(<DebtorLedgerBalanceCard caseId="case-1" caseDebtorId="cd-k" />);
    await waitFor(() => expect(screen.getAllByTestId("debtor-ledger-line")).toHaveLength(2));
    expect(screen.getByText(/yalnız bu borçlu grubuna ait/)).toBeTruthy();
    expect(screen.getByTestId("debtor-ledger-total").textContent).toContain("10.200,00 TRY");
    expect(screen.getByText(/işleyen faiz hariç/i)).toBeTruthy();
    expect(screen.getByTestId("debtor-ledger-held").textContent).toContain("250,00 TRY");
  });
});
