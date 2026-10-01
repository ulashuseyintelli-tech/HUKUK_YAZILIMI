/**
 * Hesap Özeti — para birimi gösterimi (DAVRANIŞ SÖZLEŞMESİ).
 *
 * Ölçülen kusur (gerçek HTTP + disposable PostgreSQL yanıtı bu panelde gösterilerek): 10.000 USD anaparalı dosyada panel
 * "Asıl Alacak 10.000,00 ₺ … TOPLAM BORÇ 20.431,10 ₺" yazıyordu; USD anapara, TL sabit masraf ve 10.000 TL'ymiş gibi
 * hesaplanan harç / vekalet ücreti tek sayıda toplanıp "₺" ile gösteriliyordu.
 *
 * Kural (sunucu kararı `paraBirimiDurumu`; istemci hesap ve çevirme YAPMAZ): bilinen tutar kendi para birimiyle yazılır;
 * dövizli alacağa TL tarifesi oranı uygulanarak bulunan kalemler "hesaplanamadı", farklı para birimlerini toplayan
 * satırlar "gösterilemez" yazılır. TL dosyada ve eski sunucu yanıtında gösterim DEĞİŞMEZ.
 *
 * Kanca (useCaseCalculation) ve biçimlendirici (formatTL) GERÇEKTİR; yalnız ağ katmanı taklit edilir.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckPenaltyInfo, HesapOzetiPanel, TahsilatGosterimiPanel } from "../HesapOzetiPanel";
import { apiClient } from "@/lib/api/client";
import type { BalanceDisplayShadowDiffReport } from "@/lib/api/balance-shadow-diff";
import type { CaseCalculationResult, ParaBirimiAlani, ParaBirimiDurumu } from "@/hooks/useCaseCalculation";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

/** Ölçülen yanıtın sayıları (USD ve TRY dosyada birebir aynı): 10.000 anapara, 1 borçlu, tahsilat yok. */
const olculenSayilar = {
  caseId: "case-1",
  hesapTarihi: "2026-03-01",
  takipTarihi: "2026-02-01",
  kalemTuru: "PRINCIPAL",
  asilAlacak: 10000,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 10000,
  basvurmaHarci: 738.5,
  vekaletHarci: 105,
  pesinHarc: 120,
  dosyaGideri: 50,
  tebligatGideri: 252,
  vekaletPulu: 165.6,
  icraMasraflari: 1431.1,
  pesinHarcDahilTahsilHarci: 520.12,
  pesinHarcHaricTahsilHarci: 514.66,
  vekaletUcreti: 9000,
  takipSonrasiFaiz: 0,
  toplamBorc: 20431.1,
  sonBorc: 20945.76,
  toplamTahsilat: 0,
  kalanBorc: 20945.76,
  kalanAnapara: 10000,
  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [
    { oran: 0, label: "0", tutar: 20431.1 },
    { oran: 0.0455, label: "4,55", tutar: 21360.72 },
  ],
} satisfies CaseCalculationResult;

const ALACAK = ["asilAlacak", "tazminat", "komisyon", "takipOncesiFaiz", "takipTutari", "takipSonrasiFaiz", "kalanAnapara"];
const TAHSILAT = ["toplamTahsilat", "hesapTarihindenSonrakiTahsilat"];
const SABIT_TARIFE = ["basvurmaHarci", "vekaletHarci", "dosyaGideri", "tebligatGideri", "vekaletPulu"];
const ORANLI_TARIFE = ["pesinHarc", "icraMasraflari", "pesinHarcDahilTahsilHarci", "pesinHarcHaricTahsilHarci", "vekaletUcreti"];
const TOPLAM = ["toplamBorc", "sonBorc", "kalanBorc", "tahsilOranlari"];

const gecerli = (paraBirimi: string): ParaBirimiAlani => ({ paraBirimi, durum: "GECERLI" });
const HESAPLANAMADI: ParaBirimiAlani = { paraBirimi: null, durum: "HESAPLANAMADI" };
const GOSTERILEMEZ: ParaBirimiAlani = { paraBirimi: null, durum: "GOSTERILEMEZ" };
const doldur = (alanlar: string[], deger: ParaBirimiAlani) => Object.fromEntries(alanlar.map((ad) => [ad, deger]));

/** Sunucu sözleşmesiyle aynı biçim (API: case-calculation-summary-currency.ts). */
const tlDurumu: ParaBirimiDurumu = {
  dosyaParaBirimi: "TRY",
  tarifeParaBirimi: "TRY",
  durum: "TEK_PARA_BIRIMI_TL",
  toplamGosterilebilir: true,
  gerekce: null,
  mesaj: null,
  alacakParaBirimi: "TRY",
  asilAlacakParaBirimiBazinda: [{ paraBirimi: "TRY", tutar: 10000 }],
  tahsilatParaBirimiBazinda: [],
  alanlar: doldur([...ALACAK, ...TAHSILAT, "mahsubuBekleyenTahsilat", ...SABIT_TARIFE, ...ORANLI_TARIFE, ...TOPLAM], gecerli("TRY")),
};

const dovizDurumu = (paraBirimi: string): ParaBirimiDurumu => ({
  dosyaParaBirimi: paraBirimi,
  tarifeParaBirimi: "TRY",
  durum: "TEK_PARA_BIRIMI_DOVIZ",
  toplamGosterilebilir: false,
  gerekce: "DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
  mesaj: `Alacak ${paraBirimi} cinsindendir; harç, masraf ve vekalet ücreti TL tarifesindendir.`,
  alacakParaBirimi: paraBirimi,
  asilAlacakParaBirimiBazinda: [{ paraBirimi, tutar: 10000 }],
  tahsilatParaBirimiBazinda: [],
  alanlar: {
    ...doldur([...ALACAK, ...TAHSILAT, "mahsubuBekleyenTahsilat"], gecerli(paraBirimi)),
    ...doldur(SABIT_TARIFE, gecerli("TRY")),
    ...doldur(ORANLI_TARIFE, HESAPLANAMADI),
    ...doldur(TOPLAM, GOSTERILEMEZ),
  },
});

const karmaDurumu: ParaBirimiDurumu = {
  dosyaParaBirimi: "USD",
  tarifeParaBirimi: "TRY",
  durum: "KARMA_PARA_BIRIMI",
  toplamGosterilebilir: false,
  gerekce: "FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
  mesaj: "Dosyada birden fazla para biriminde tutar var (EUR, TRY, USD).",
  alacakParaBirimi: null,
  asilAlacakParaBirimiBazinda: [
    { paraBirimi: "EUR", tutar: 5000 },
    { paraBirimi: "TRY", tutar: 2000 },
    { paraBirimi: "USD", tutar: 10000 },
  ],
  tahsilatParaBirimiBazinda: [],
  alanlar: {
    ...doldur(ALACAK, GOSTERILEMEZ),
    ...doldur([...TAHSILAT, "mahsubuBekleyenTahsilat"], gecerli("USD")),
    ...doldur(SABIT_TARIFE, gecerli("TRY")),
    ...doldur(ORANLI_TARIFE, HESAPLANAMADI),
    ...doldur(TOPLAM, GOSTERILEMEZ),
  },
};

/** Ekrandaki "etiket → değer" satırları (yalnız iki hücreli satırlar). */
function satirlar(container: HTMLElement): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of Array.from(container.querySelectorAll("div.flex.justify-between"))) {
    const cells = Array.from(row.children).map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells.length === 2) map[cells[0]] = cells[1];
  }
  return map;
}

async function goster(yanit: Partial<CaseCalculationResult>) {
  apiGet.mockResolvedValue({ data: { ...olculenSayilar, ...yanit } });
  const view = render(<HesapOzetiPanel caseId="case-1" calculationDate="2026-03-01" debtorCount={1} />);
  await screen.findByText("TOPLAM BORÇ");
  return { ...view, rows: satirlar(view.container), text: (view.container.textContent ?? "").replace(/\s+/g, " ") };
}

describe("Hesap Özeti — para birimi gösterimi", () => {
  // Gövde süslü parantezli: ok işlevi mock'u DÖNDÜRÜRSE vitest onu test sonu temizliği sayıp argümansız çağırır
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("TL dosya: gösterim aynen (tüm tutarlar ₺, tek toplam var, uyarı yok)", async () => {
    const { rows } = await goster({ paraBirimiDurumu: tlDurumu });

    expect(rows).toMatchObject({
      "Asıl Alacak": "10.000,00 ₺",
      "TAKİP TUTARI": "10.000,00 ₺",
      "Peşin Harç": "120,00 ₺",
      "İCRA MASRAFLARI": "1.431,10 ₺",
      "Vekalet Ücreti =": "9.000,00 ₺",
      "TOPLAM BORÇ": "20.431,10 ₺",
      "SON BORÇ": "20.945,76 ₺",
      "%4,55": "21.360,72 ₺",
    });
    expect(screen.queryByTestId("hesap-para-birimi-uyari")).toBeNull();
    // Vurgulu tutar biçimi TL dosyada aynen (büyük, yeşil). Öğe metinle bulunur: bu test düzeltmesiz panelde de geçer.
    expect(screen.getByText("20.945,76 ₺").className).toBe("font-bold text-xl text-green-700");
  });

  it("eski sunucu yanıtı (karar bloğu yok): TL dosyadaki gösterimle birebir aynı satırlar", async () => {
    const tl = await goster({ paraBirimiDurumu: tlDurumu });
    tl.unmount();
    const eski = await goster({});

    expect(eski.rows).toEqual(tl.rows);
    expect(screen.queryByTestId("hesap-para-birimi-uyari")).toBeNull();
  });

  it("dövizli dosya: alacak kendi para biriminde, sabit masraf ₺, oranlı kalemler hesaplanamadı, toplamlar gösterilemez", async () => {
    const { rows, text } = await goster({ paraBirimiDurumu: dovizDurumu("USD") });

    expect(rows).toMatchObject({
      "Asıl Alacak": "10.000,00 USD",
      "TAKİP TUTARI": "10.000,00 USD",
      // Tarifeden gelen sabit TL tutarlar bilinen tutardır; görünür kalır
      "Başvurma Harcı": "738,50 ₺",
      "Vekalet Harcı": "105,00 ₺",
      "Dosya Gideri": "50,00 ₺",
      "Tebligat Gideri (1 borçlu)": "252,00 ₺",
      "Vekalet Pulu": "165,60 ₺",
      // TL tarifesi oranı 10.000 USD'ye 10.000 TL'ymiş gibi uygulanmıştı → gösterilmez
      "Peşin Harç": "hesaplanamadı",
      "İCRA MASRAFLARI": "hesaplanamadı",
      "Peşin Harç Dahil Tahsil Harcı": "hesaplanamadı",
      "Peşin Harç Hariç Tahsil Harcı": "hesaplanamadı",
      "Vekalet Ücreti =": "hesaplanamadı",
      "TOPLAM BORÇ": "gösterilemez",
      "SON BORÇ": "gösterilemez",
    });
    expect(screen.getByTestId("hesap-tahsil-oranlari-durum")).toHaveTextContent("gösterilemez");
    expect(screen.getByTestId("hesap-para-birimi-uyari")).toHaveTextContent("Alacak USD cinsindendir");
    // "gösterilemez" vurgulu tutar gibi (büyük, yeşil) basılmaz
    expect(screen.getByTestId("hesap-deger-sonBorc").className).toBe("font-medium text-gray-500");

    // USD anapara "₺" ile yazılmaz; USD + TL karışık toplamlar ekranın hiçbir yerinde geçmez
    expect(text).not.toContain("10.000,00 ₺");
    for (const karisikToplam of ["20.431,10", "20.945,76", "21.360,72", "1.431,10", "9.000,00", "120,00", "514,66", "520,12"]) {
      expect(text).not.toContain(karisikToplam);
    }
    // "₺" yalnız beş sabit tarife satırında kalır
    expect((text.match(/₺/g) ?? []).length).toBe(5);
  });

  it("dövizli dosyada tahsilat: tahsilat kendi para biriminde düşüm satırı olur; kalan borç gösterilemez", async () => {
    const durum = { ...dovizDurumu("USD"), tahsilatParaBirimiBazinda: [{ paraBirimi: "USD", tutar: 1000 }] };
    const { rows, text } = await goster({ toplamTahsilat: 1000, kalanBorc: 19945.76, paraBirimiDurumu: durum });

    expect(rows["Tahsilat Düşümü"]).toBe("- 1.000,00 USD");
    expect(rows["KALAN BORÇ"]).toBe("gösterilemez");
    expect(text).not.toContain("19.945,76");
  });

  it("karma anapara: tek sayıya toplanmaz — para birimi bazında ayrı satır; alacak toplamı gösterilemez", async () => {
    const { rows, text } = await goster({ asilAlacak: 17000, takipTutari: 17000, kalanAnapara: 17000, paraBirimiDurumu: karmaDurumu });

    expect(rows).toMatchObject({
      "Asıl Alacak (EUR)": "5.000,00 EUR",
      "Asıl Alacak (TRY)": "2.000,00 ₺",
      "Asıl Alacak (USD)": "10.000,00 USD",
      "TAKİP TUTARI": "gösterilemez",
      "TOPLAM BORÇ": "gösterilemez",
    });
    expect(rows["Asıl Alacak"]).toBeUndefined();
    expect(text).not.toContain("17.000,00");
    expect(screen.getByTestId("hesap-para-birimi-uyari")).toHaveTextContent("EUR, TRY, USD");
  });

  it("kısıtlı durumda sunucunun karar vermediği alan TL diye etiketlenmez (fail-closed)", async () => {
    const eksik = dovizDurumu("USD");
    const { toplamBorc: _toplamBorc, basvurmaHarci: _basvurmaHarci, ...kalanAlanlar } = eksik.alanlar;
    const { rows } = await goster({ paraBirimiDurumu: { ...eksik, alanlar: kalanAlanlar } });

    expect(rows["TOPLAM BORÇ"]).toBe("gösterilemez");
    expect(rows["Başvurma Harcı"]).toBe("gösterilemez");
  });
});

describe("Hesap Özeti — kanonik pilot (varsayılan kapalı) dövizli dosyada", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  /** Uygun (eligible) kanonik rapor, USD: anapara 10.000, tahsilat 1.000 (tamamı borca uygulanmış). */
  const usdRapor: BalanceDisplayShadowDiffReport = {
    tenantId: "tenant-1",
    caseId: "case-1",
    currency: "USD",
    asOfDate: "2026-03-01",
    generatedAt: "2026-03-01T10:00:00.000Z",
    sourceVersion: "test",
    mode: "SHADOW_ONLY",
    primaryDisplayUnchanged: true,
    sources: {
      legacyCalculationSummary: { available: true, endpoint: "/cases/:id/calculation-summary", authority: "LEGACY_DISPLAY", diagnostics: [] },
      canonicalBalanceDisplay: {
        available: true,
        endpoint: "/interest-engine/case/:caseId/balance/display",
        authority: "SHADOW_ONLY",
        diagnostics: [],
        unsafeSources: [],
      },
    },
    comparability: { comparable: true, classification: "EXACT_MATCH", severity: "GREEN", blockers: [], warnings: [] },
    totals: {
      canonical: {
        currency: "USD",
        totalDebtAmount: 10250,
        totalPaidAmount: 1000,
        outstandingAmount: 9250,
        interestAmount: 0,
        costsAmount: 250,
        attorneyFeeAmount: 0,
        allocatedPaidAmount: 1000,
        grossReceivedAmount: 1000,
        receipts: {
          currency: "USD",
          asOfDate: "2026-03-01",
          scope: "ON_OR_BEFORE_AS_OF_DATE",
          receivedAmount: 1000,
          paymentAmount: 1000,
          allocationHeldAmount: 0,
          appliedToDebtAmount: 1000,
          unappliedPaymentAmount: 0,
          notAppliedAmount: 0,
          afterAsOfExcludedAmount: 0,
          appliedScope: "PRINCIPAL_AND_INTEREST_ONLY",
        },
        raw: {},
      },
      diffs: [],
    },
    bucketDiffs: [
      {
        code: "PRINCIPAL_MATCH",
        label: "Principal",
        classification: "EXACT_MATCH",
        legacyField: "asilAlacak",
        canonicalField: "bucket.PRINCIPAL",
        legacyAmount: 10000,
        canonicalAmount: 10000,
        delta: 0,
        deltaPercent: 0,
        status: "MATCH",
        severity: "GREEN",
        explanation: "",
        bucket: "PRINCIPAL",
        canonicalDisplayable: true,
      },
    ],
    diagnostics: [],
    cutoverReadiness: { safeForPrimaryDisplay: true, safeForOptInShadow: true, blockers: [], nextRequiredEvidence: [] },
    provenance: {
      legacyCalculationSummaryUsed: true,
      canonicalBalanceDisplayUsed: true,
      computeBalanceUsed: true,
      finalDebtStatesAvailable: true,
      claimItemCollectedAmountUsedAsAuthority: false,
      overpaymentHeldAvailable: true,
      blockedOverpaymentDiagnosticsAvailable: false,
    },
  };

  it("pilot kanonik sonucu seçse de USD tutar ₺ ile yazılmaz ve tek toplam gösterilmez", async () => {
    const legacy = { ...olculenSayilar, toplamTahsilat: 1000, kalanBorc: 19945.76, paraBirimiDurumu: dovizDurumu("USD") };
    apiGet.mockImplementation(async (url: string) => ({ data: url.includes("shadow-diff") ? usdRapor : legacy }));

    const { container } = render(
      <HesapOzetiPanel caseId="case-1" calculationDate="2026-03-01" debtorCount={1} guardedPrimaryPilotEnabled guardedPrimaryPilotAsOfDate="2026-03-01" />,
    );
    expect(await screen.findByText("Guarded canonical primary candidate")).toBeInTheDocument();
    const rows = satirlar(container);
    const text = (container.textContent ?? "").replace(/\s+/g, " ");

    expect(rows).toMatchObject({
      "Asıl Alacak": "10.000,00 USD",
      "TAKİP TUTARI": "10.000,00 USD",
      "Vekalet Ücreti =": "hesaplanamadı",
      "TOPLAM BORÇ": "gösterilemez",
      "SON BORÇ": "gösterilemez",
      "KALAN BORÇ": "gösterilemez",
    });
    expect(screen.getByTestId("tahsilat-toplam")).toHaveTextContent("1.000,00 USD");
    expect(screen.getByTestId("tahsilat-borca-uygulanan")).toHaveTextContent("- 1.000,00 USD");
    // Kanonik toplam (10.250 / 9.250) da masraf projeksiyonunu para birimi ayrımı olmadan içerir → tek sayı olarak yazılmaz
    for (const toplam of ["10.250,00", "9.250,00", "20.431,10", "19.945,76"]) expect(text).not.toContain(toplam);
    expect((text.match(/₺/g) ?? []).length).toBe(5); // yalnız beş sabit tarife satırı
  });
});

describe("Hesap Özeti — alt bileşenlerde para birimi etiketi", () => {
  it("çek tazminatı kalemi kendi para birimiyle yazılır (TL kalemde gösterim aynen)", () => {
    const kalem = { claimItemId: "i1", tutar: 1000, tahsilEdilen: 0, kalan: 1000, sorumluBorclular: [], sorumlulukBelirsiz: true };
    const ozet = (paraBirimi: string) => ({
      tutar: 1000,
      durum: "KALEM_VAR" as const,
      mesaj: null,
      kalemler: [{ ...kalem, paraBirimi }],
      tahmin: null,
    });

    const usd = render(<CheckPenaltyInfo summary={ozet("USD")} />);
    expect(screen.getByTestId("check-penalty-item")).toHaveTextContent("Tazminat 1.000,00 USD · kalan 1.000,00 USD");
    usd.unmount();

    render(<CheckPenaltyInfo summary={ozet("TRY")} />);
    expect(screen.getByTestId("check-penalty-item")).toHaveTextContent("Tazminat 1.000,00 ₺ · kalan 1.000,00 ₺");
  });

  it("kanonik tahsilat bloğu kendi para birimiyle yazılır; kalan borç metni dışarıdan verilen karardır", () => {
    const gosterim = {
      hesapTarihi: "2026-03-01",
      paraBirimi: "USD",
      toplamTahsilat: 1500,
      borcaUygulanan: 1000,
      dagitimBekleyen: 500,
      mahsubuBekleyen: 300,
      hesapTarihindenSonra: 200,
      masrafFeriUyarisi: false,
    };

    const usd = render(<TahsilatGosterimiPanel gosterim={gosterim} kalanBorc={19945.76} kalanBorcMetni="gösterilemez" />);
    expect(screen.getByTestId("tahsilat-toplam")).toHaveTextContent("1.500,00 USD");
    expect(screen.getByTestId("tahsilat-borca-uygulanan")).toHaveTextContent("- 1.000,00 USD");
    expect(screen.getByTestId("tahsilat-dagitim-bekleyen")).toHaveTextContent("500,00 USD");
    expect(screen.getByTestId("tahsilat-mahsubu-bekleyen")).toHaveTextContent("300,00 USD");
    expect(screen.getByTestId("tahsilat-tarih-sonrasi")).toHaveTextContent("200,00 USD");
    expect(usd.container.textContent).toContain("gösterilemez");
    expect(usd.container.textContent).not.toContain("₺");
    usd.unmount();

    // TL bloğunda ve metin verilmediğinde gösterim aynen
    const tl = render(<TahsilatGosterimiPanel gosterim={{ ...gosterim, paraBirimi: "TRY" }} kalanBorc={19945.76} />);
    expect(screen.getByTestId("tahsilat-toplam")).toHaveTextContent("1.500,00 ₺");
    expect(tl.container.textContent).toContain("19.945,76 ₺");
  });
});
