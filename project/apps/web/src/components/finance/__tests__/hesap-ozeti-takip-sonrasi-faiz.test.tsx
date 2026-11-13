/**
 * Hesap Özeti — "Takip Sonrası Faiz" satırı ve faiz belirsizliği (DAVRANIŞ SÖZLEŞMESİ).
 *
 * Ölçülen kusur (13.11.2026, yerel pilot dosyası; değerler BURADA sentetik): anaparasız dosyada açıklayıcı döküm
 * "faiz belirlenemedi (sıfır sayılmadı)" derken eski bölümün "Takip Sonrası Faiz =" satırı eski özetin yer tutucu
 * sıfırını "0,00 ₺" olarak gösteriyordu; aynı ekranda iki bölüm çelişiyordu.
 *
 * Kural (istemci hesabı YOK; motor ve faiz politikası değişmez):
 * - Döküm varsa satır dökümün faiz durumunu AYNI metinle yazar ("belirlenemedi" / "hesaplanmadı"); 0'a çevrilmez.
 * - Döküm yokken hesaplanmış faiz ve hesaplanmış GERÇEK SIFIR tutar olarak kalır (0,00 ₺).
 * - Değer yoksa (null / sonlu değil) sıfır yazılmaz: "belirlenemedi".
 * - Para birimi kısıtlı dosyada sunucunun alan kararı aynen uygulanır.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HesapOzetiPanel } from "../HesapOzetiPanel";
import { apiClient } from "@/lib/api/client";
import { formatTL } from "@/hooks/useCaseCalculation";
import type { AnaparasizKalemDokumu, CaseCalculationResult, ParaBirimiDurumu } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

/** Anaparalı, faizi hesaplanmış normal dosya (sentetik). */
const normalOzet = {
  caseId: "case-tsf",
  hesapTarihi: "2026-11-13",
  takipTarihi: "2026-06-02",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 20000,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 20000,
  basvurmaHarci: 412.3,
  vekaletHarci: 87.2,
  pesinHarc: 101.4,
  dosyaGideri: 33,
  tebligatGideri: 144,
  vekaletPulu: 98.7,
  icraMasraflari: 876.6,
  pesinHarcDahilTahsilHarci: 41.27,
  pesinHarcHaricTahsilHarci: 37.91,
  vekaletUcreti: 3600,
  takipSonrasiFaiz: 1234.57,
  toplamBorc: 25711.17,
  sonBorc: 25752.44,
  toplamTahsilat: 0,
  kalanBorc: 25752.44,
  kalanAnapara: 20000,
  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [{ oran: 0, label: "0", tutar: 25711.17 }],
} satisfies CaseCalculationResult;

/** Anaparasız dosyanın eski özeti: anapara 0, faiz yer tutucu 0 (sentetik). */
const anaparasizOzet = {
  ...normalOzet,
  asilAlacak: 0,
  takipTutari: 0,
  takipSonrasiFaiz: 0,
  toplamBorc: 4476.6,
  sonBorc: 4517.87,
  kalanBorc: 4517.87,
  kalanAnapara: 0,
  tahsilOranlari: [{ oran: 0, label: "0", tutar: 4476.6 }],
} satisfies CaseCalculationResult;

const dokum: AnaparasizKalemDokumu = {
  durum: "NIHAI_TOPLAM_HESAPLANAMADI",
  otorite: "ACIKLAYICI_DOKUM",
  kanonikOtorite: "UNSAFE_FOR_PRIMARY_DISPLAY",
  gerekce: "NO_PRINCIPAL_BASIS",
  paraBirimleri: [{
    paraBirimi: "TRY",
    kalemler: [
      { claimItemId: "ci-a", kod: "VEKALET_UCRETI", kalemTuru: "ATTORNEY_FEE", etiket: "Vekâlet Ücreti (alacak kalemi) — İLAM VEKALET ÜCRETİ", tutar: 2468.13, faizDurumu: "BELIRLENEMEDI" },
      { claimItemId: "ci-b", kod: "YARGILAMA_GIDERI", kalemTuru: "YARGILAMA_GIDERI", etiket: "Yargılama Gideri", tutar: 975.4, faizDurumu: "BELIRLENEMEDI" },
    ],
    kalemTutarlariToplami: 3443.53,
  }],
  faizDurumu: "BELIRLENEMEDI",
  nihaiBorcToplami: null,
  mesaj: "Kalemlerin faiz durumu belirlenmediği için faiz hesaplanmadı (sıfır sayılmadı); nihai borç toplamı hesaplanamadı.",
};

async function ciz(yanit: Record<string, unknown>) {
  apiGet.mockResolvedValue({ data: yanit });
  const view = render(<HesapOzetiPanel caseId="case-tsf" calculationDate="2026-11-13" debtorCount={1} />);
  await screen.findByText("TOPLAM BORÇ");
  return view;
}

const faizSatiri = () => screen.getByTestId("hesap-deger-takipSonrasiFaiz");

describe("Hesap Özeti — Takip Sonrası Faiz satırı ve faiz belirsizliği", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("anaparasız dosya (faiz belirlenemedi): eski bölüm de 'belirlenemedi' yazar, yer tutucu 0 '0,00 ₺' olmaz", async () => {
    await ciz({ ...anaparasizOzet, anaparasizKalemDokumu: dokum });
    expect(faizSatiri()).toHaveTextContent("belirlenemedi");
    expect(faizSatiri()).not.toHaveTextContent(formatTL(0));
    expect(faizSatiri().className).toContain("text-gray-500");
  });

  it("döküm ile eski özet aynı dosyada çelişmez: iki faiz satırı aynı metin; kalem toplamı ayrı; nihai borç hesaplanamadı", async () => {
    await ciz({ ...anaparasizOzet, anaparasizKalemDokumu: dokum });
    expect(screen.getByTestId("hesap-anaparasiz-faiz").textContent).toBe(faizSatiri().textContent);
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-TRY")).toHaveTextContent(formatTL(3443.53));
    expect(screen.getByTestId("hesap-anaparasiz-nihai-toplam")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-sonBorc")).toHaveTextContent("hesaplanamadı");
    // Faiz hiçbir bölümde sıfır tutar olarak sunulmaz; takip öncesi faiz satırı da çizilmez
    const dokumBlogu = screen.getByTestId("hesap-anaparasiz-dokum");
    expect(within(dokumBlogu).queryByText(formatTL(0))).not.toBeInTheDocument();
    expect(screen.queryByText("Takip Öncesi Faiz")).not.toBeInTheDocument();
  });

  it("döküm faizi 'hesaplanmadı' ise eski bölüm de 'hesaplanmadı' yazar (aynı metin)", async () => {
    const hesaplanmadi: AnaparasizKalemDokumu = {
      ...dokum,
      paraBirimleri: [{ ...dokum.paraBirimleri[0], kalemler: dokum.paraBirimleri[0].kalemler.map((k) => ({ ...k, faizDurumu: "HESAPLANMADI" as const })) }],
      faizDurumu: "HESAPLANMADI",
    };
    await ciz({ ...anaparasizOzet, anaparasizKalemDokumu: hesaplanmadi });
    expect(faizSatiri()).toHaveTextContent("hesaplanmadı");
    expect(screen.getByTestId("hesap-anaparasiz-faiz").textContent).toBe(faizSatiri().textContent);
  });

  it("normal dosya: hesaplanmış faiz tutar olarak kalır (davranış DEĞİŞMEZ)", async () => {
    await ciz({ ...normalOzet });
    expect(screen.queryByTestId("hesap-anaparasiz-dokum")).not.toBeInTheDocument();
    expect(faizSatiri()).toHaveTextContent(formatTL(1234.57));
    expect(faizSatiri().className).toContain("font-semibold");
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent(formatTL(25711.17));
  });

  it("normal dosya: hesaplanmış GERÇEK SIFIR faiz '0,00 ₺' olarak kalır", async () => {
    await ciz({ ...normalOzet, takipSonrasiFaiz: 0, toplamBorc: 24476.6 });
    expect(faizSatiri()).toHaveTextContent(formatTL(0));
    expect(faizSatiri()).not.toHaveTextContent("belirlenemedi");
    expect(faizSatiri().className).toContain("font-semibold");
  });

  it("değer yoksa (null) sıfıra çevrilmez: 'belirlenemedi'", async () => {
    await ciz({ ...normalOzet, takipSonrasiFaiz: null });
    expect(faizSatiri()).toHaveTextContent("belirlenemedi");
    expect(faizSatiri()).not.toHaveTextContent(formatTL(0));
  });

  it("para birimi kısıtlı dosyada sunucunun alan kararı aynen uygulanır (döviz faizi kendi para birimiyle)", async () => {
    const alanlar = Object.fromEntries(
      ["asilAlacak", "takipTutari", "takipSonrasiFaiz", "kalanAnapara", "toplamTahsilat"].map((ad) => [ad, { paraBirimi: "USD", durum: "GECERLI" as const }]),
    );
    const doviz: ParaBirimiDurumu = {
      dosyaParaBirimi: "USD",
      tarifeParaBirimi: "TRY",
      durum: "TEK_PARA_BIRIMI_DOVIZ",
      toplamGosterilebilir: false,
      gerekce: "DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
      mesaj: "Alacak USD cinsindendir.",
      alacakParaBirimi: "USD",
      asilAlacakParaBirimiBazinda: [{ paraBirimi: "USD", tutar: 20000 }],
      tahsilatParaBirimiBazinda: [],
      alanlar,
    };
    await ciz({ ...normalOzet, paraBirimiDurumu: doviz });
    expect(faizSatiri()).toHaveTextContent("1.234,57 USD");
  });
});
