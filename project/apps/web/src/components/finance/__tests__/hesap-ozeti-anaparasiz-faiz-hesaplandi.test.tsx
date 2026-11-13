/**
 * Hesap Özeti — anaparasız dosyada faizi AÇIKÇA belirlenmiş ilam kalemleri (D1, owner GO-COMPLETE 13.11.2026).
 *
 * Kural (sunucu kararı; istemci hesabı YOK):
 * - Faiz kalem bazında "takip öncesi / takip sonrası" olarak dökümde gösterilir (sunucu değerleri).
 * - "Kalem tutarları + faiz" yalnız sunucu doldurduysa görünür ve "açıklayıcı; nihai borç değildir" diye etiketlenir;
 *   "Nihai borç toplamı" HER DURUMDA "hesaplanamadı" (owner K3); eski TOPLAM / SON BORÇ rakam yazmaz.
 * - Eski bölümün takip öncesi / sonrası faiz satırları dökümün açıklayıcı toplamını yazar (iki bölüm çelişmez);
 *   gerçek hesaplanmış sıfır "0,00 ₺" olur; bilinmeyen sıfıra dönüşmez ("belirlenemedi").
 * - Faiz toplamı null ise (bir kalem belirsiz) "Kalem tutarları + faiz" satırı YOK.
 * Tutarlar SENTETİK.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HesapOzetiPanel } from "../HesapOzetiPanel";
import { apiClient } from "@/lib/api/client";
import { formatTL } from "@/hooks/useCaseCalculation";
import type { AnaparasizKalemDokumu, CaseCalculationResult } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn() },
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const eskiOzet = {
  caseId: "case-pf",
  hesapTarihi: "2026-11-13",
  takipTarihi: "2026-11-09",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 0, tazminat: 0, komisyon: 0, takipOncesiFaiz: 0, takipTutari: 0,
  basvurmaHarci: 738.5, vekaletHarci: 105, pesinHarc: 120, dosyaGideri: 50, tebligatGideri: 252, vekaletPulu: 165.6,
  icraMasraflari: 1431.1, pesinHarcDahilTahsilHarci: 65.11, pesinHarcHaricTahsilHarci: 59.65,
  vekaletUcreti: 9000, takipSonrasiFaiz: 0, toplamBorc: 10431.1, sonBorc: 10490.75, toplamTahsilat: 0,
  kalanBorc: 10490.75, kalanAnapara: 0, mahsupDetaylari: [], faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [{ oran: 0, label: "0", tutar: 10431.1 }],
} satisfies CaseCalculationResult;

const hesaplandi: AnaparasizKalemDokumu = {
  durum: "NIHAI_TOPLAM_HESAPLANAMADI",
  otorite: "ACIKLAYICI_DOKUM",
  kanonikOtorite: "UNSAFE_FOR_PRIMARY_DISPLAY",
  gerekce: "NO_PRINCIPAL_BASIS",
  paraBirimleri: [{
    paraBirimi: "TRY",
    kalemler: [
      {
        claimItemId: "ci-vu", kod: "VEKALET_UCRETI", kalemTuru: "ATTORNEY_FEE", etiket: "İlam Vekâlet Ücreti (alacak kalemi)", tutar: 4321.1,
        faizDurumu: "HESAPLANDI", vekaletUcretiKaynagi: "ILAM",
        faiz: { takipOncesi: 62.51, takipSonrasi: 340.95, toplam: 403.46, baslangic: "2025-01-10", baslangicDayanagi: "JUDGMENT_DATE", faizTuru: "LEGAL_3095" },
      },
      {
        claimItemId: "ci-yg", kod: "YARGILAMA_GIDERI", kalemTuru: "YARGILAMA_GIDERI", etiket: "Yargılama Gideri", tutar: 1234.56,
        faizDurumu: "HESAPLANDI",
        faiz: { takipOncesi: 0, takipSonrasi: 97.41, toplam: 97.41, baslangic: "2025-02-01", baslangicDayanagi: "ENFORCEMENT_PROCEEDING_DATE", faizTuru: "LEGAL_3095" },
      },
    ],
    kalemTutarlariToplami: 5555.66,
    faizToplami: 500.87,
    takipOncesiFaizToplami: 62.51,
    takipSonrasiFaizToplami: 438.36,
    kalemVeFaizToplami: 6056.53,
  }],
  faizDurumu: "HESAPLANDI",
  nihaiBorcToplami: null,
  mesaj: "Dosyada anapara kalemi yok. … açıklayıcı olarak hesaplandı; … nihai borç toplamı hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.",
};

async function ciz(dokum: AnaparasizKalemDokumu) {
  apiGet.mockResolvedValue({ data: { ...eskiOzet, anaparasizKalemDokumu: dokum } });
  const view = render(<HesapOzetiPanel caseId="case-pf" calculationDate="2026-11-13" debtorCount={2} />);
  await screen.findByText("TOPLAM BORÇ");
  return view;
}

describe("Hesap Özeti — anaparasız dosyada açıklayıcı faiz (D1)", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("kalem bazında takip öncesi / sonrası faiz; kalem + faiz açıklayıcı ve nihai borç DEĞİL; nihai borç hesaplanamadı", async () => {
    await ciz(hesaplandi);
    const vu = screen.getByTestId("hesap-anaparasiz-kalem-faiz-ci-vu");
    expect(vu).toHaveTextContent(`Takip öncesi faiz ${formatTL(62.51)}`);
    expect(vu).toHaveTextContent(`Takip sonrası faiz ${formatTL(340.95)}`);
    // Gerçek hesaplanmış sıfır 0,00 ₺ olarak yazılır
    expect(screen.getByTestId("hesap-anaparasiz-kalem-faiz-ci-yg")).toHaveTextContent(`Takip öncesi faiz ${formatTL(0)}`);

    expect(screen.getByTestId("hesap-anaparasiz-faiz")).toHaveTextContent(formatTL(500.87));
    const kalemVeFaiz = screen.getByTestId("hesap-anaparasiz-kalem-ve-faiz-TRY");
    expect(kalemVeFaiz).toHaveTextContent(formatTL(6056.53));
    expect(kalemVeFaiz.parentElement).toHaveTextContent("açıklayıcı; nihai borç değildir");
    expect(screen.getByTestId("hesap-anaparasiz-nihai-toplam")).toHaveTextContent("hesaplanamadı");
    const blok = screen.getByTestId("hesap-anaparasiz-dokum");
    expect(within(blok).queryByText(/Nihai borç toplamı/)?.parentElement).not.toHaveTextContent(formatTL(6056.53));

    // Eski bölüm: takip öncesi / sonrası faiz dökümle aynı kaynaktan; toplamlar rakam yazmaz
    expect(screen.getByTestId("hesap-deger-takipOncesiFaiz")).toHaveTextContent(formatTL(62.51));
    expect(screen.getByTestId("hesap-deger-takipSonrasiFaiz")).toHaveTextContent(formatTL(438.36));
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-sonBorc")).toHaveTextContent("hesaplanamadı");
  });

  it("bir kalem belirsizse faiz toplamı null → 'Kalem tutarları + faiz' satırı yok; faiz satırları 'belirlenemedi' (sıfır değil)", async () => {
    const pb = hesaplandi.paraBirimleri[0];
    await ciz({
      ...hesaplandi,
      faizDurumu: "BELIRLENEMEDI",
      paraBirimleri: [{
        ...pb,
        kalemler: [pb.kalemler[0], { ...pb.kalemler[1], faizDurumu: "BELIRLENEMEDI", faiz: undefined, faizNedeni: "ACCRUAL_STATUS_UNKNOWN" }],
        faizToplami: null, takipOncesiFaizToplami: null, takipSonrasiFaizToplami: null, kalemVeFaizToplami: null,
      }],
    });
    expect(screen.getByTestId("hesap-anaparasiz-kalem-faiz-ci-vu")).toHaveTextContent(formatTL(340.95));
    expect(screen.queryByTestId("hesap-anaparasiz-kalem-faiz-ci-yg")).toBeNull();
    expect(screen.queryByTestId("hesap-anaparasiz-kalem-ve-faiz-TRY")).toBeNull();
    expect(screen.getByTestId("hesap-anaparasiz-faiz")).toHaveTextContent("belirlenemedi");
    expect(screen.getByTestId("hesap-deger-takipSonrasiFaiz")).toHaveTextContent("belirlenemedi");
    expect(screen.queryByTestId("hesap-deger-takipOncesiFaiz")).toBeNull();
  });
});
