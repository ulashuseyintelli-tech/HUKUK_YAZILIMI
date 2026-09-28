import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CheckPenaltySummary } from "@/hooks/useCaseCalculation";

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: vi.fn(),
  formatTL: (amount: number) =>
    `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
  formatDate: (date: string) => date,
}));

import { CheckPenaltyInfo } from "@/components/finance/HesapOzetiPanel";

/** K3-L (owner kararı 2026-09-28) — hesap özeti çek tazminatı bilgi kutusu. */
describe("CheckPenaltyInfo (K3-L)", () => {
  const base: CheckPenaltySummary = { tutar: 0, durum: "UYGULANMAZ", mesaj: null, kalemler: [], tahmin: null };

  it("çek dosyası değilse hiçbir şey göstermez", () => {
    const { container } = render(<CheckPenaltyInfo summary={base} />);
    expect(container.innerHTML).toBe("");
  });

  it("kalem varsa yalnız kalemdeki sorumluları gösterir (tüm borçlulara yaymaz)", () => {
    render(
      <CheckPenaltyInfo
        summary={{
          ...base,
          tutar: 1234.57,
          durum: "KALEM_VAR",
          kalemler: [
            {
              claimItemId: "ci-1",
              tutar: 1234.57,
              tahsilEdilen: 0,
              kalan: 1234.57,
              paraBirimi: "TRY",
              sorumluBorclular: [{ debtorId: "d-1", ad: "Keşideci Ali" }],
              sorumlulukBelirsiz: false,
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("check-penalty-item").textContent).toContain("sorumlu: Keşideci Ali");
    expect(screen.queryByTestId("check-penalty-estimate")).toBeNull();
  });

  it("kalem yoksa durum mesajı + tahmin AYRI bilgi olarak (borca dahil değil) gösterilir", () => {
    render(
      <CheckPenaltyInfo
        summary={{
          ...base,
          durum: "OLUSTURULMAMIS",
          mesaj: "Çek tazminatı kalemi oluşturulmamış; kayıt yokluğu tazminat hakkının bulunmadığı veya bundan vazgeçildiği anlamına gelmez.",
          tahmin: { durum: "HESAPLANDI", tutar: 1234.57, aciklama: "Bilgi amaçlı tahmin — DAHİL DEĞİL." },
        }}
      />,
    );
    expect(screen.getByTestId("check-penalty-status").textContent).toContain("oluşturulmamış");
    expect(screen.getByTestId("check-penalty-estimate").textContent).toContain("Bilgi (borca dahil değil): tahmini tazminat");
  });

  it("matrah doğrulanamıyorsa tutar göstermez: hesaplanamadı — veri eksik", () => {
    render(
      <CheckPenaltyInfo
        summary={{
          ...base,
          durum: "ONAY_BEKLIYOR",
          mesaj: "Çek tazminatı kalemi onay bekliyor; onaylanana kadar borca eklenmez.",
          tahmin: { durum: "VERI_EKSIK", tutar: null, aciklama: "Hesaplanamadı — veri eksik: karşılıksız işaretli çek kaydı yok." },
        }}
      />,
    );
    const estimate = screen.getByTestId("check-penalty-estimate").textContent ?? "";
    expect(estimate).toContain("Hesaplanamadı — veri eksik");
    expect(estimate).not.toMatch(/TL/);
  });
});
