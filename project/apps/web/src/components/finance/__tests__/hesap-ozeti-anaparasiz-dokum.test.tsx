/**
 * Hesap Özeti — anaparasız dosya açıklayıcı dökümü (DAVRANIŞ SÖZLEŞMESİ).
 *
 * Ölçülen kusur (13.11.2026, yerel pilot dosyası; değerler BURADA sentetik): yalnız ilam vekâlet ücreti + yargılama
 * gideri içeren dosyada panel eski özetin tarife masrafı + takip vekâlet ücretinden oluşan toplamını "TOPLAM BORÇ" /
 * "SON BORÇ" diye gösteriyordu. İçe aktarılan iki kalem panelde yoktu.
 *
 * Kural (sunucu kararı `anaparasizKalemDokumu`; istemci hesabı YOK, kanonik gölge yükseltilmez):
 * - Kalem tutarları ayrı blokta, "Kalem tutarları toplamı" ile "Nihai borç toplamı" AYRI.
 * - Faiz "belirlenemedi"; nihai borç "hesaplanamadı".
 * - Eski toplamlar rakam yerine "hesaplanamadı"; eski vekâlet ücreti satırı "takip (tarife)" diye etiketlenir.
 * - Alan yoksa gösterim DEĞİŞMEZ.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HesapOzetiPanel } from "../HesapOzetiPanel";
import { apiClient } from "@/lib/api/client";
import { formatTL } from "@/hooks/useCaseCalculation";
import type { AnaparasizKalemDokumu, CaseCalculationResult } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

/** Eski özet sayıları (anaparasız dosyada sunucunun ürettiği biçim; sentetik). */
const eskiOzet = {
  caseId: "case-pf",
  hesapTarihi: "2026-11-13",
  takipTarihi: "2026-11-09",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 0,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 0,
  basvurmaHarci: 738.5,
  vekaletHarci: 105,
  pesinHarc: 120,
  dosyaGideri: 50,
  tebligatGideri: 252,
  vekaletPulu: 165.6,
  icraMasraflari: 1431.1,
  pesinHarcDahilTahsilHarci: 65.11,
  pesinHarcHaricTahsilHarci: 59.65,
  vekaletUcreti: 9000,
  takipSonrasiFaiz: 0,
  toplamBorc: 10431.1,
  sonBorc: 10490.75,
  toplamTahsilat: 0,
  kalanBorc: 10490.75,
  kalanAnapara: 0,
  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [{ oran: 0, label: "0", tutar: 10431.1 }],
} satisfies CaseCalculationResult;

const dokumTL: AnaparasizKalemDokumu = {
  durum: "NIHAI_TOPLAM_HESAPLANAMADI",
  otorite: "ACIKLAYICI_DOKUM",
  kanonikOtorite: "UNSAFE_FOR_PRIMARY_DISPLAY",
  gerekce: "NO_PRINCIPAL_BASIS",
  paraBirimleri: [{
    paraBirimi: "TRY",
    kalemler: [
      { claimItemId: "ci-vu", kod: "VEKALET_UCRETI", kalemTuru: "ATTORNEY_FEE", etiket: "Vekâlet Ücreti (alacak kalemi) — İLAM VEKALET ÜCRETİ", tutar: 4321.1, faizDurumu: "BELIRLENEMEDI" },
      { claimItemId: "ci-yg", kod: "YARGILAMA_GIDERI", kalemTuru: "YARGILAMA_GIDERI", etiket: "Yargılama Gideri", tutar: 1234.56, faizDurumu: "BELIRLENEMEDI" },
    ],
    kalemTutarlariToplami: 5555.66,
  }],
  faizDurumu: "BELIRLENEMEDI",
  nihaiBorcToplami: null,
  mesaj: "Dosyada anapara kalemi yok. Kalem tutarları kayıtlı kaynak tutarlarıdır. Kalemlerin faiz durumu belirlenmediği için faiz hesaplanmadı (sıfır sayılmadı); nihai borç toplamı hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.",
};

async function ciz(yanit: Partial<CaseCalculationResult>) {
  apiGet.mockResolvedValue({ data: { ...eskiOzet, ...yanit } });
  const view = render(<HesapOzetiPanel caseId="case-pf" calculationDate="2026-11-13" debtorCount={2} />);
  await screen.findByText("TOPLAM BORÇ");
  return view;
}

describe("Hesap Özeti — anaparasız dosya açıklayıcı dökümü", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("kalem tutarları ayrı; kalem toplamı ile nihai borç toplamı ayrı; faiz belirlenemedi; nihai toplam hesaplanamadı", async () => {
    await ciz({ anaparasizKalemDokumu: dokumTL });
    const blok = screen.getByTestId("hesap-anaparasiz-dokum");
    expect(within(blok).getByText("Kalem tutarları (açıklayıcı döküm)")).toBeInTheDocument();
    expect(within(blok).getByText(/İLAM VEKALET ÜCRETİ/)).toBeInTheDocument();
    expect(within(blok).getByText("Yargılama Gideri")).toBeInTheDocument();
    expect(screen.getByTestId("hesap-anaparasiz-kalem-VEKALET_UCRETI")).toHaveTextContent(formatTL(4321.1));
    expect(screen.getByTestId("hesap-anaparasiz-kalem-YARGILAMA_GIDERI")).toHaveTextContent(formatTL(1234.56));
    expect(within(blok).getByText("Kalem tutarları toplamı")).toBeInTheDocument();
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-TRY")).toHaveTextContent(formatTL(5555.66));
    expect(within(blok).getByText("Nihai borç toplamı")).toBeInTheDocument();
    expect(screen.getByTestId("hesap-anaparasiz-nihai-toplam")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-anaparasiz-faiz")).toHaveTextContent("belirlenemedi");
    expect(within(blok).getAllByText("(faiz durumu belirlenmedi)")).toHaveLength(2);
    expect(screen.getByTestId("hesap-anaparasiz-dokum-mesaj")).toHaveTextContent("nihai mali hesap değildir");
    // Faiz hiçbir yerde "0,00" olarak sunulmaz
    expect(within(blok).queryByText(formatTL(0))).not.toBeInTheDocument();
  });

  it("eski özetin eksik toplamı nihai borç gibi gösterilmez: TAKİP TUTARI / TOPLAM / SON / tahsil oranları 'hesaplanamadı'", async () => {
    await ciz({ anaparasizKalemDokumu: dokumTL });
    expect(screen.getByTestId("hesap-deger-takipTutari")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-sonBorc")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-tahsil-oranlari-durum")).toHaveTextContent("hesaplanamadı");
    expect(screen.queryByText(formatTL(10431.1))).not.toBeInTheDocument();
    expect(screen.queryByText(formatTL(10490.75))).not.toBeInTheDocument();
    // Vurgulu toplam biçimi kullanılmaz
    expect(screen.getByTestId("hesap-deger-toplamBorc").className).toContain("text-gray-500");
  });

  it("takip vekâlet ücreti (tarife) ilam vekâlet ücretinin yerine konmaz: ayrı etiket, döküm kalemi ayrı tutar", async () => {
    await ciz({ anaparasizKalemDokumu: dokumTL });
    expect(screen.getByText("Takip Vekâlet Ücreti (tarife) =")).toBeInTheDocument();
    expect(screen.queryByText("Vekalet Ücreti =")).not.toBeInTheDocument();
    expect(screen.getByTestId("hesap-deger-vekaletUcreti")).toHaveTextContent(formatTL(9000));
    expect(screen.getByTestId("hesap-anaparasiz-kalem-VEKALET_UCRETI")).toHaveTextContent(formatTL(4321.1));
  });

  it("çok para birimli döküm: para birimi başına ayrı toplam; ortak toplam YOK", async () => {
    const coklu: AnaparasizKalemDokumu = {
      ...dokumTL,
      paraBirimleri: [
        { paraBirimi: "TRY", kalemler: [dokumTL.paraBirimleri[0].kalemler[1]], kalemTutarlariToplami: 1234.56 },
        { paraBirimi: "USD", kalemler: [{ ...dokumTL.paraBirimleri[0].kalemler[0], claimItemId: "ci-vu-usd" }], kalemTutarlariToplami: 4321.1 },
      ],
    };
    await ciz({ anaparasizKalemDokumu: coklu });
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-TRY")).toHaveTextContent(formatTL(1234.56));
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-USD")).toHaveTextContent("4.321,10 USD");
    expect(screen.getByText("Kalem tutarları toplamı (TRY)")).toBeInTheDocument();
    expect(screen.getByText("Kalem tutarları toplamı (USD)")).toBeInTheDocument();
    expect(screen.queryByText(formatTL(5555.66))).not.toBeInTheDocument();
  });

  it("satırı kullanılamayan para biriminde tutar ve toplam 'hesaplanamadı' (sıfır yazılmaz)", async () => {
    const eksik: AnaparasizKalemDokumu = {
      ...dokumTL,
      paraBirimleri: [{ ...dokumTL.paraBirimleri[0], kalemler: dokumTL.paraBirimleri[0].kalemler.map((k) => ({ ...k, tutar: null })), kalemTutarlariToplami: null }],
    };
    await ciz({ anaparasizKalemDokumu: eksik });
    expect(screen.getByTestId("hesap-anaparasiz-kalem-VEKALET_UCRETI")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-TRY")).toHaveTextContent("hesaplanamadı");
  });

  it("alan yoksa (anaparalı / eski sunucu yanıtı) gösterim DEĞİŞMEZ: döküm yok, toplamlar rakamla, etiket aynı", async () => {
    await ciz({});
    expect(screen.queryByTestId("hesap-anaparasiz-dokum")).not.toBeInTheDocument();
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent(formatTL(10431.1));
    expect(screen.getByTestId("hesap-deger-sonBorc")).toHaveTextContent(formatTL(10490.75));
    expect(screen.getByText("Vekalet Ücreti =")).toBeInTheDocument();
    expect(screen.queryByTestId("hesap-tahsil-oranlari-durum")).not.toBeInTheDocument();
  });
});
