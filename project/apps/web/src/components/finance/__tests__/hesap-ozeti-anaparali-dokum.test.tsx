/**
 * Hesap Özeti — anaparalı dosya (eski hesap yolu) açıklayıcı dökümü — F02 kabul K-1 (owner kararı 22.11.2026, seçenek A).
 *
 * Kusur (UB-4 / UB-5; sentetik kabul dosyası): asıl alacak eklenince panel eski yolun TOPLAM BORÇ'unu (asıl alacak +
 * masraf + tarife) gösteriyordu; onaylı 2.400 TL ilam vekâlet ücreti ve faizi yoktu; faiz durumu belirlenmemiş kalemde
 * "Takip Sonrası Faiz = 0,00 ₺" yazıyordu (eski yol faizi hiç hesaplamaz).
 * Kural (sunucu `anaparaliKalemDokumu`; istemci hesabı YOK): onaylı kalemler kayıtlı tutarlarıyla dökülür; bilinen kalem
 * toplamı faizden AYRI; faiz ve bağlı nihai toplamlar (takip tutarı / toplam / son / kalan / oranlı) "hesaplanamadı";
 * nihai borç diye sunulmaz. Alan yoksa gösterim DEĞİŞMEZ. Değerler sentetik.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HesapOzetiPanel } from "../HesapOzetiPanel";
import { apiClient } from "@/lib/api/client";
import { formatTL } from "@/hooks/useCaseCalculation";
import type { AnaparaliKalemDokumu, CaseCalculationResult } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

/** Eski özet (anaparalı; sunucunun ürettiği biçim, sentetik): faiz sabit 0, toplam ilam kalemini içermez. */
const eskiOzet = {
  caseId: "case-1", hesapTarihi: "2026-11-21", takipTarihi: "2026-10-01", kalemTuru: "PRINCIPAL",
  asilAlacak: 1000, tazminat: 0, komisyon: 0, takipOncesiFaiz: 0, takipTutari: 1000,
  basvurmaHarci: 738.5, vekaletHarci: 105, pesinHarc: 120, dosyaGideri: 50, tebligatGideri: 504, vekaletPulu: 165.6,
  icraMasraflari: 1683.1, pesinHarcDahilTahsilHarci: 122.08, pesinHarcHaricTahsilHarci: 116.62, vekaletUcreti: 9000,
  takipSonrasiFaiz: 0, toplamBorc: 11683.1, sonBorc: 11799.72, toplamTahsilat: 0, kalanBorc: 11799.72, kalanAnapara: 1000,
  mahsupDetaylari: [], faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [{ oran: 0, label: "0", tutar: 11683.1 }],
} satisfies CaseCalculationResult;

const dokum: AnaparaliKalemDokumu = {
  durum: "NIHAI_TOPLAM_HESAPLANAMADI",
  otorite: "ACIKLAYICI_DOKUM",
  kanonikOtorite: "ESKI_HESAP_YOLU",
  gerekceler: ["ESKI_YOL_FAIZ_HESAPLAMAZ", "ESKI_YOL_KALEM_KAPSAMI_DISI"],
  paraBirimleri: [{
    paraBirimi: "TRY",
    kalemler: [
      { claimItemId: "ci-vu", kod: "ATTORNEY_FEE", kalemTuru: "ATTORNEY_FEE", etiket: "İlam Vekâlet Ücreti (alacak kalemi)", tutar: 2400, faizDurumu: "HESAPLANMADI" },
      { claimItemId: "ci-aa", kod: "PRINCIPAL", kalemTuru: "PRINCIPAL", etiket: "Asıl Alacak — Sentetik", tutar: 1000, faizDurumu: "BELIRLENEMEDI" },
    ],
    kalemTutarlariToplami: 3400,
    faizToplami: null, takipOncesiFaizToplami: null, takipSonrasiFaizToplami: null, kalemVeFaizToplami: null,
  }],
  faizDurumu: "BELIRLENEMEDI",
  nihaiBorcToplami: null,
  mesaj: "Kalem tutarları onaylı kalemlerin kayıtlı tutarlarıdır. Bu hesap yolu faizi hesaplamaz: faizi işleyen ya da faiz durumu belirlenmemiş kalemlerin faizi hesaplanamadı (sıfır sayılmadı). Asıl alacak dışındaki kalemler eski özet toplamlarına dahil değildir. Takip tutarı, toplam borç ve son borç hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.",
};

async function ciz(yanit: Partial<CaseCalculationResult>) {
  apiGet.mockResolvedValue({ data: { ...eskiOzet, ...yanit } });
  render(<HesapOzetiPanel caseId="case-1" calculationDate="2026-11-21" debtorCount={2} />);
  await screen.findByText("TOPLAM BORÇ");
}

describe("Hesap Özeti — anaparalı dosya (K-1)", () => {
  beforeEach(() => apiGet.mockReset());

  it("onaylı kalemler tutarlarıyla eksiksiz dökülür; bilinen kalem toplamı ayrı; faiz ve nihai borç 'hesaplanamadı'", async () => {
    await ciz({ anaparaliKalemDokumu: dokum });
    const blok = screen.getByTestId("hesap-anaparasiz-dokum");
    expect(within(blok).getByText("İlam Vekâlet Ücreti (alacak kalemi)")).toBeInTheDocument();
    expect(screen.getByTestId("hesap-anaparasiz-kalem-ATTORNEY_FEE")).toHaveTextContent(formatTL(2400));
    expect(screen.getByTestId("hesap-anaparasiz-kalem-PRINCIPAL")).toHaveTextContent(formatTL(1000));
    expect(screen.getByTestId("hesap-anaparasiz-kalem-toplami-TRY")).toHaveTextContent(formatTL(3400));
    expect(screen.getByTestId("hesap-anaparasiz-faiz")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-anaparasiz-nihai-toplam")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-anaparasiz-dokum-mesaj")).toHaveTextContent("nihai mali hesap değildir");
  });

  it("eski yolun hesaplayamadığı faiz ve bağlı nihai toplamlar rakam değil 'hesaplanamadı'; faiz 0,00 diye sunulmaz", async () => {
    await ciz({ anaparaliKalemDokumu: dokum });
    expect(screen.getByTestId("hesap-deger-takipOncesiFaiz")).toHaveTextContent("hesaplanamadı");
    expect(screen.getByTestId("hesap-deger-takipSonrasiFaiz")).toHaveTextContent("hesaplanamadı");
    // (kalan borç satırı yalnız tahsilat varken basılır; o da aynı toplamMetni ile "hesaplanamadı" alır)
    for (const id of ["takipTutari", "toplamBorc", "sonBorc"]) {
      expect(screen.getByTestId(`hesap-deger-${id}`)).toHaveTextContent("hesaplanamadı");
    }
    expect(screen.getByTestId("hesap-tahsil-oranlari-durum")).toHaveTextContent("hesaplanamadı");
    expect(screen.queryByText(formatTL(11683.1))).not.toBeInTheDocument();
    expect(screen.queryByText(formatTL(11799.72))).not.toBeInTheDocument();
    // Asıl alacak bilinen tutar olarak kalır; tarife vekâlet ücreti ilam kaleminden ayrı etiketlenir
    expect(screen.getByText("Takip Vekâlet Ücreti (tarife) =")).toBeInTheDocument();
  });

  it("her kalemin faizi kayıtlı olarak işlemezse faiz gerçek sıfır olarak yazılır (nihai toplam yine hesaplanamadı)", async () => {
    const islemez: AnaparaliKalemDokumu = {
      ...dokum,
      gerekceler: ["ESKI_YOL_KALEM_KAPSAMI_DISI"],
      faizDurumu: "HESAPLANDI",
      paraBirimleri: [{
        ...dokum.paraBirimleri[0],
        kalemler: dokum.paraBirimleri[0].kalemler.map((k) => ({ ...k, faizDurumu: "ISLEMEZ_KAYITLI" as const })),
        faizToplami: 0, takipOncesiFaizToplami: 0, takipSonrasiFaizToplami: 0, kalemVeFaizToplami: 3400,
      }],
    };
    await ciz({ anaparaliKalemDokumu: islemez });
    expect(screen.getByTestId("hesap-deger-takipSonrasiFaiz")).toHaveTextContent(formatTL(0));
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent("hesaplanamadı");
  });

  it("alan yoksa eski gösterim değişmez", async () => {
    await ciz({});
    expect(screen.queryByTestId("hesap-anaparasiz-dokum")).not.toBeInTheDocument();
    expect(screen.getByTestId("hesap-deger-toplamBorc")).toHaveTextContent(formatTL(11683.1));
  });
});
