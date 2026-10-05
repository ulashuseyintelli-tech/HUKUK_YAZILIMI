/**
 * Sihirbaz alacak kalemi formu — "Hesap Özeti" para birimi gösterimi (DAVRANIŞ SÖZLEŞMESİ).
 *
 * Ölçülen kusur (main 6681b1d5; gerçek tarayıcı + derlenmiş API + disposable PostgreSQL): 10.000 USD kalemde panel
 * "Vekalet Ücreti 11.000,00 $ … TOPLAM BORÇ 21.197,26 $ … SON BORÇ 21.652,26 $" yazıyordu; sayılar TL kalemle birebir
 * aynıydı, yalnız simge değişiyordu. TL tarifesinden gelen tutarlar kalemin para birimi simgesiyle basılıyor ve döviz
 * anaparayla tek toplamda birleşiyordu. Masraf önizleme isteği para birimi taşımıyor, faiz önizleme isteği USD kalem
 * için "TRY" gönderiyordu.
 *
 * Kural (sunucu kararı `paraBirimiDurumu`; form hesap ve çevirme YAPMAZ, kendi başına karar VERMEZ): bilinen tutar kendi
 * para birimiyle yazılır; dövizli alacağa TL tarifesi oranı uygulanarak bulunan kalemler "hesaplanamadı", farklı para
 * birimlerini toplayan satırlar "gösterilemez" yazılır. TL kalemde ve karar göndermeyen sunucuda gösterim DEĞİŞMEZ.
 *
 * Form, önizleme istemcileri (feeEngineApi / interestEngineApi) ve biçimlendirici GERÇEKTİR; yalnız ağ katmanı taklit edilir.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfessionalClaimItemForm } from "../ProfessionalClaimItemForm";
import { apiClient } from "@/lib/api/client";
import { api } from "@/lib/api";
import type { ParaBirimiAlani } from "@/hooks/useCaseCalculation";
import type { FeePreviewParaBirimiDurumu } from "@/lib/api/fee-engine";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    previewCekFormation: vi.fn(),
    getToken: vi.fn(() => "jeton"),
    downloadTakipTalebiWord: vi.fn(),
    downloadTakipTalebiPdf: vi.fn(),
    downloadTakipTalebiXml: vi.fn(),
  },
}));

const apiPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const legacyApiPost = api.post as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------------------------------------------
// Sunucu sözleşmesiyle aynı biçimde karar (API: fee-engine/fee-preview-currency.ts → case-calculation-summary-currency.ts)
// ---------------------------------------------------------------------------------------------------------------
const ALACAK = ["asilAlacak", "tazminat", "komisyon", "takipOncesiFaiz", "takipTutari", "takipSonrasiFaiz", "kalanAnapara"];
const TAHSILAT = ["toplamTahsilat", "hesapTarihindenSonrakiTahsilat", "mahsubuBekleyenTahsilat"];
const SABIT_TARIFE = ["basvurmaHarci", "vekaletHarci", "dosyaGideri", "tebligatGideri", "vekaletPulu"];
const ORANLI_TARIFE = ["pesinHarc", "icraMasraflari", "pesinHarcDahilTahsilHarci", "pesinHarcHaricTahsilHarci", "vekaletUcreti"];
const TOPLAM = ["toplamBorc", "sonBorc", "kalanBorc", "tahsilOranlari"];

const gecerli = (paraBirimi: string): ParaBirimiAlani => ({ paraBirimi, durum: "GECERLI" });
const HESAPLANAMADI: ParaBirimiAlani = { paraBirimi: null, durum: "HESAPLANAMADI" };
const GOSTERILEMEZ: ParaBirimiAlani = { paraBirimi: null, durum: "GOSTERILEMEZ" };
const doldur = (alanlar: string[], deger: ParaBirimiAlani) => Object.fromEntries(alanlar.map((ad) => [ad, deger]));

const DOVIZ_MESAJI = (kod: string) =>
  `Alacak ${kod} cinsindendir; harç, masraf ve vekalet ücreti TL tarifesindendir. Dövizli alacakta oranlı kalemlerin hesabı tanımlı değildir.`;
const UYUSMAZLIK_MESAJI = (dosya: string, kalem: string) =>
  `Dosya para birimi (${dosya}) ile kayıtlı tutarların para birimi (${kalem}) uyuşmuyor.`;

function sunucuKarari(kalem: string, dosya: string): FeePreviewParaBirimiDurumu {
  if (kalem === "TRY" && dosya === "TRY") {
    return {
      dosyaParaBirimi: "TRY",
      tarifeParaBirimi: "TRY",
      durum: "TEK_PARA_BIRIMI_TL",
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: "TRY",
      alanlar: doldur([...ALACAK, ...TAHSILAT, ...SABIT_TARIFE, ...ORANLI_TARIFE, ...TOPLAM], gecerli("TRY")),
    };
  }
  const uyusmazlik = kalem !== dosya;
  return {
    dosyaParaBirimi: dosya,
    tarifeParaBirimi: "TRY",
    durum: uyusmazlik ? "KARMA_PARA_BIRIMI" : "TEK_PARA_BIRIMI_DOVIZ",
    toplamGosterilebilir: false,
    gerekce: uyusmazlik ? "DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR" : "DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
    mesaj: uyusmazlik ? UYUSMAZLIK_MESAJI(dosya, kalem) : DOVIZ_MESAJI(kalem),
    alacakParaBirimi: kalem,
    alanlar: {
      ...doldur([...ALACAK, ...TAHSILAT], gecerli(kalem)),
      ...doldur(SABIT_TARIFE, gecerli("TRY")),
      ...doldur(ORANLI_TARIFE, HESAPLANAMADI),
      ...doldur(TOPLAM, GOSTERILEMEZ),
    },
  };
}

/** Önizleme sayıları para biriminden bağımsızdır (ölçüldü): 10.000 için TL tarifesi tutarları. */
const MASRAF = {
  estimatedFees: 1431.1,
  estimatedAttorneyFee: 11000,
  tariffYear: 2026,
  breakdown: { basvurmaHarci: 738.5, vekaletHarci: 105, pesinHarc: 120, dosyaGideri: 50, tebligatGideri: 252, vekaletPulu: 165.6 },
};

type KararSecimi = "sunucu" | "yok" | ((kalem: string, dosya: string) => FeePreviewParaBirimiDurumu | undefined);

let masrafIstekleri: Array<Record<string, unknown>>;
let faizIstekleri: Array<Record<string, unknown>>;

/** Ağ katmanı: masraf ve faiz önizlemesi. `karar`: sunucunun para birimi kararı (yok = kararı desteklemeyen eski sunucu). */
function agiKur(karar: KararSecimi = "sunucu") {
  apiPost.mockImplementation(async (url: string, body: Record<string, unknown>) => {
    if (url === "/fee-engine/preview") {
      masrafIstekleri.push(body);
      const kalem = typeof body.currency === "string" ? body.currency : undefined;
      const dosya = typeof body.caseCurrency === "string" ? body.caseCurrency : kalem;
      const paraBirimiDurumu =
        karar === "yok" || !kalem || !dosya ? undefined : karar === "sunucu" ? sunucuKarari(kalem, dosya) : karar(kalem, dosya);
      return { data: { success: true, data: { ...MASRAF, ...(paraBirimiDurumu ? { paraBirimiDurumu } : {}) }, cached: false } };
    }
    if (url === "/interest-engine/preview") {
      faizIstekleri.push(body);
      return {
        data: { success: true, data: { estimatedInterest: 197.26, currentRate: 24, days: 30, interestType: body.interestType }, cached: false },
      };
    }
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

/** Ekrandaki "etiket → değer" satırları (yalnız iki hücreli satırlar). */
function satirlar(container: HTMLElement): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of Array.from(container.querySelectorAll("div.flex.justify-between"))) {
    const cells = Array.from(row.children).map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells.length === 2) map[cells[0]] = cells[1];
  }
  return map;
}

/** Sağdaki "Hesap Özeti" paneli. */
function ozetPaneli(container: HTMLElement): HTMLElement {
  const baslik = Array.from(container.querySelectorAll("h3")).find((h) => (h.textContent ?? "").includes("Hesap Özeti"));
  const panel = baslik?.closest("div.w-72");
  if (!panel) throw new Error("Hesap Özeti paneli bulunamadı");
  return panel as HTMLElement;
}

const KALEM = (currency: string) => ({
  id: "kalem-1",
  kalemTuru: "ASIL_ALACAK",
  toplamTutar: 10000,
  bakiyeTutar: 10000,
  currency,
  vadeTarihi: "2026-08-01",
  takipOncesiFaiz: "YASAL",
  takipSonrasiFaiz: "YASAL",
  faizOrani: null,
  faizsizGerekce: "",
  hesaplanmisFaiz: false,
  aciklama: "",
});

/** Karşılıksız çek kalemi: tazminat (sunucu taslağı), komisyon ve takip öncesi faiz satırları da oluşur. */
const CEK_KALEMI = (currency: string) => ({
  ...KALEM(currency),
  kalemTuru: "CEK",
  takipOncesiFaiz: "TICARI_DEGISEN",
  takipSonrasiFaiz: "TICARI_DEGISEN",
  cekBilgileri: {
    ibrazTarihi: "2026-08-01",
    duzenlemeYeri: "",
    cekSeriNo: "CK-1",
    hesapNo: "",
    bankaVeSube: "Banka - Şube",
    cekiImzalayanlar: "",
    karsiliksiz: true,
    karsiliksizTarihi: "2026-08-05",
  },
});

/** Kararlı referans: form varsayılanı her render'da yeni dizi üretir → hesap döngüsü her render'da yeniden kurulur. */
const SABIT_BORCLULAR: never[] = [];

const formu = (dosya: string, kalem: Record<string, unknown>, takipTuruCode = "ILAMSIZ_GENEL") => (
  <ProfessionalClaimItemForm
    caseType="GENEL_ICRA"
    currency={dosya}
    takipTuruCode={takipTuruCode}
    takipTarihi="2026-09-01"
    hesapTarihi="2026-10-01"
    borcluSayisi={1}
    caseDebtors={SABIT_BORCLULAR}
    initialItems={[kalem]}
  />
);

async function goster({
  dosya,
  kalem,
  karar,
  kalemVerisi,
  takipTuruCode,
}: {
  dosya: string;
  kalem: string;
  karar?: KararSecimi;
  kalemVerisi?: Record<string, unknown>;
  takipTuruCode?: string;
}) {
  agiKur(karar);
  const view = render(formu(dosya, kalemVerisi ?? KALEM(kalem), takipTuruCode));
  await screen.findByText("SON BORÇ", {}, { timeout: 4000 });
  const panel = ozetPaneli(view.container);
  return { ...view, panel, rows: satirlar(panel), text: (panel.textContent ?? "").replace(/\s+/g, " ") };
}

const TL_TUTAR = /^-?[\d.]+,\d{2} ₺$/;

describe("Alacak kalemi formu — Hesap Özeti para birimi gösterimi", () => {
  // Gövde süslü parantezli: ok işlevi mock'u DÖNDÜRÜRSE vitest onu test sonu temizliği sayıp argümansız çağırır
  beforeEach(() => {
    masrafIstekleri = [];
    faizIstekleri = [];
    apiPost.mockReset();
    legacyApiPost.mockReset();
    (api.previewCekFormation as unknown as ReturnType<typeof vi.fn>).mockReset();
    // Zamanaşımı denetimi (formun ayrı isteği) — bu testin konusu değil
    legacyApiPost.mockResolvedValue({ data: { status: { level: "GREEN", daysLeft: 1000, message: "" }, shouldShowModal: false, modalType: null } });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("TL kalem: gösterim aynen (tüm tutarlar ₺, tek toplam var, uyarı yok)", async () => {
    const { rows, panel } = await goster({ dosya: "TRY", kalem: "TRY" });

    expect(rows).toMatchObject({
      "Genel Alacak": "10.000,00 ₺",
      "TAKİP TUTARI": "10.000,00 ₺",
      "Başvurma Harcı": "738,50 ₺",
      "Peşin Harç": "120,00 ₺",
      "İCRA MASRAFLARI": "1.431,10 ₺",
      "Vekalet Ücreti =": "11.000,00 ₺",
      "Takip Sonrası Faiz =": "197,26 ₺",
      "TOPLAM BORÇ": "22.628,36 ₺",
    });
    for (const etiket of ["Peşin Harç Dahil Tahsil Harcı", "Peşin Harç Hariç Tahsil Harcı", "SON BORÇ", "0", "2,27", "4,55", "9,10", "11,38"]) {
      expect(rows[etiket]).toMatch(TL_TUTAR);
    }
    expect(screen.queryByTestId("kalem-hesap-para-birimi-uyari")).toBeNull();
    expect(screen.queryByTestId("kalem-hesap-tahsil-oranlari-durum")).toBeNull();
    expect(panel.textContent).not.toContain("hesaplanamadı");
    expect(panel.textContent).not.toContain("gösterilemez");
    // Vurgulu tutar biçimi TL kalemde aynen (büyük, yeşil). Öğe metinle bulunur: bu test düzeltmesiz formda da geçer.
    const sinifi = (metin: string) => screen.getAllByText(metin).map((el) => el.className);
    expect(sinifi(rows["SON BORÇ"])).toContain("font-bold text-lg text-green-700");
    expect(sinifi("22.628,36 ₺")).toContain("font-bold text-blue-800");
    expect(sinifi("10.000,00 ₺")).toContain("font-bold text-blue-700");
  });

  it("karar göndermeyen (eski) sunucu + TL kalem: TL gösterimiyle birebir aynı panel", async () => {
    const yeni = await goster({ dosya: "TRY", kalem: "TRY" });
    const yeniHtml = yeni.panel.innerHTML;
    const yeniSatirlar = yeni.rows;
    yeni.unmount();
    const eski = await goster({ dosya: "TRY", kalem: "TRY", karar: "yok" });

    expect(eski.rows).toEqual(yeniSatirlar);
    expect(eski.panel.innerHTML).toBe(yeniHtml);
  });

  it.each(["USD", "EUR"])(
    "%s kalem: alacak kendi para biriminde, sabit masraf ₺, oranlı kalemler hesaplanamadı, toplamlar gösterilemez",
    async (kod) => {
      const simge = kod === "USD" ? "$" : "€";
      const { rows, text } = await goster({ dosya: kod, kalem: kod });

      // Bilinen tutarlar kendi para birimiyle görünür kalır
      expect(rows).toMatchObject({
        "Genel Alacak": `10.000,00 ${simge}`,
        "TAKİP TUTARI": `10.000,00 ${simge}`,
        "Takip Sonrası Faiz =": `197,26 ${simge}`,
        "Başvurma Harcı": "738,50 ₺",
        "Vekalet Harcı": "105,00 ₺",
        "Dosya Gideri": "50,00 ₺",
        "Tebligat Gideri (1 borçlu)": "252,00 ₺",
        "Vekalet Pulu": "165,60 ₺",
      });
      // TL tarifesi oranının döviz tutara uygulanmasıyla bulunan kalemler geçerli tutar gibi gösterilmez
      expect(rows).toMatchObject({
        "Peşin Harç": "hesaplanamadı",
        "İCRA MASRAFLARI": "hesaplanamadı",
        "Peşin Harç Dahil Tahsil Harcı": "hesaplanamadı",
        "Peşin Harç Hariç Tahsil Harcı": "hesaplanamadı",
        "Vekalet Ücreti =": "hesaplanamadı",
      });
      // Döviz alacak ile TL masrafı toplayan satırlar tek tutar olarak gösterilmez
      expect(rows).toMatchObject({ "TOPLAM BORÇ": "gösterilemez", "SON BORÇ": "gösterilemez" });
      expect(screen.getByTestId("kalem-hesap-tahsil-oranlari-durum").textContent).toBe("gösterilemez");
      for (const oran of ["0", "2,27", "4,55", "9,10", "11,38"]) expect(rows[oran]).toBeUndefined();

      // Uyarı metni sunucudan gelir
      expect(screen.getByTestId("kalem-hesap-para-birimi-uyari").textContent).toBe(DOVIZ_MESAJI(kod));

      // Ölçülen kusurun sayıları: TL tarifesi tutarı döviz simgesiyle ya da karışık toplam olarak ekranda yok
      expect(text).not.toContain(`11.000,00 ${simge}`);
      expect(text).not.toContain(`1.431,10 ${simge}`);
      expect(text).not.toContain(`120,00 ${simge}`);
      expect(text).not.toContain(`738,50 ${simge}`);
      expect(text).not.toContain("22.628,36");
      // Dövizli alacak ₺ ile de etiketlenmez
      expect(text).not.toContain("10.000,00 ₺");
    },
  );

  it("dövizli kalemde gösterilemeyen toplam vurgulu tutar biçimiyle (büyük, renkli) basılmaz", async () => {
    await goster({ dosya: "USD", kalem: "USD" });

    const gosterilemez = screen.getAllByText("gösterilemez").map((el) => el.className);
    expect(gosterilemez).not.toContain("font-bold text-lg text-green-700");
    expect(gosterilemez).not.toContain("font-bold text-blue-800");
    // Geçerli takip tutarı vurgulu kalır
    expect(screen.getAllByText("10.000,00 $").map((el) => el.className)).toContain("font-bold text-blue-700");
  });

  it("TL dosyada dövizli kalem: sunucunun uyuşmazlık kararı gösterilir; tutar kalemin para biriminde, toplam yok", async () => {
    const { rows } = await goster({ dosya: "TRY", kalem: "USD" });

    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "USD", caseCurrency: "TRY" });
    expect(screen.getByTestId("kalem-hesap-para-birimi-uyari").textContent).toBe(UYUSMAZLIK_MESAJI("TRY", "USD"));
    expect(rows).toMatchObject({
      "Genel Alacak": "10.000,00 $",
      "TAKİP TUTARI": "10.000,00 $",
      "Vekalet Ücreti =": "hesaplanamadı",
      "SON BORÇ": "gösterilemez",
    });
  });

  it("dövizli dosyada TL kalem: sunucunun uyuşmazlık kararı gösterilir; kalem ₺ ile kalır, oranlı kalem ve toplam yok", async () => {
    const { rows } = await goster({ dosya: "USD", kalem: "TRY" });

    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "TRY", caseCurrency: "USD" });
    expect(screen.getByTestId("kalem-hesap-para-birimi-uyari").textContent).toBe(UYUSMAZLIK_MESAJI("USD", "TRY"));
    expect(rows).toMatchObject({
      "Genel Alacak": "10.000,00 ₺",
      "Başvurma Harcı": "738,50 ₺",
      "Peşin Harç": "hesaplanamadı",
      "TOPLAM BORÇ": "gösterilemez",
    });
  });

  it("önizleme istekleri kalemin ve dosyanın para birimini taşır (faiz isteği dövizli kalem için TRY göndermez)", async () => {
    await goster({ dosya: "USD", kalem: "USD" });

    expect(masrafIstekleri.length).toBeGreaterThan(0);
    for (const istek of masrafIstekleri) {
      expect(istek).toEqual({ principalAmount: 10000, takipTuruCode: "ILAMSIZ_GENEL", debtorCount: 1, currency: "USD", caseCurrency: "USD" });
    }
    expect(faizIstekleri.length).toBeGreaterThan(0);
    for (const istek of faizIstekleri) expect(istek).toMatchObject({ principalAmount: 10000, currency: "USD" });
  });

  it("TL kalemde önizleme isteklerinin mevcut alanları aynen; para birimi TRY olarak bildirilir", async () => {
    await goster({ dosya: "TRY", kalem: "TRY" });

    for (const istek of masrafIstekleri) {
      expect(istek).toEqual({ principalAmount: 10000, takipTuruCode: "ILAMSIZ_GENEL", debtorCount: 1, currency: "TRY", caseCurrency: "TRY" });
    }
    for (const istek of faizIstekleri) {
      expect(istek).toMatchObject({ principalAmount: 10000, currency: "TRY", interestType: "LEGAL_3095", startDate: "2026-09-01", endDate: "2026-10-01" });
    }
  });

  it("form kendi başına karar vermez: sunucu toplamın gösterilebilir olduğunu bildirirse dövizli kalemde de kısıtlamaz", async () => {
    const { rows } = await goster({
      dosya: "USD",
      kalem: "USD",
      karar: () => ({ ...sunucuKarari("TRY", "TRY"), dosyaParaBirimi: "USD", alacakParaBirimi: "USD" }),
    });

    expect(screen.queryByTestId("kalem-hesap-para-birimi-uyari")).toBeNull();
    expect(rows["Vekalet Ücreti ="]).toBe("11.000,00 $");
    expect(rows["TOPLAM BORÇ"]).toBe("22.628,36 $");
  });

  it("form kendi başına karar vermez: karar göndermeyen (eski) sunucuda dövizli kalemde kısıtlama uydurmaz", async () => {
    const { rows, panel } = await goster({ dosya: "USD", kalem: "USD", karar: "yok" });

    expect(screen.queryByTestId("kalem-hesap-para-birimi-uyari")).toBeNull();
    expect(panel.textContent).not.toContain("hesaplanamadı");
    expect(panel.textContent).not.toContain("gösterilemez");
    expect(rows["Genel Alacak"]).toBe("10.000,00 $");
  });

  it("kısıtlı durumda sunucunun karar bildirmediği satır gösterilmez (fail-closed); bildirdiği satır kendi para birimiyle yazılır", async () => {
    const { rows } = await goster({
      dosya: "USD",
      kalem: "USD",
      karar: (kalem, dosya) => {
        const karar = sunucuKarari(kalem, dosya);
        const { vekaletUcreti: _vekalet, takipTutari: _takip, ...alanlar } = karar.alanlar;
        return { ...karar, alanlar: { ...alanlar, takipSonrasiFaiz: gecerli("EUR"), basvurmaHarci: gecerli("XYZ") } };
      },
    });

    expect(rows["Vekalet Ücreti ="]).toBe("gösterilemez");
    expect(rows["TAKİP TUTARI"]).toBe("gösterilemez");
    // Sunucunun bildirdiği para birimi yazılır; listede olmayan kod "₺" sayılmaz
    expect(rows["Takip Sonrası Faiz ="]).toBe("197,26 €");
    expect(rows["Başvurma Harcı"]).toBe("738,50 XYZ");
  });

  it("dövizli çek: sunucu taslak tazminatı, komisyon ve takip öncesi faiz kalemin para biriminde; takip tutarı geçerli, toplam yok", async () => {
    const previewCek = api.previewCekFormation as unknown as ReturnType<typeof vi.fn>;
    previewCek.mockResolvedValue({
      taslak: true,
      uyari: "",
      durum: "HESAPLANDI",
      kod: null,
      aciklama: "",
      tazminat: { tutar: 1000, paraBirimi: "USD", basisPoints: 1000, sorumluTempIds: [], bedelSorumluTempIds: [] },
      previewHash: "h1",
      girdiOzeti: { cekSayisi: 1, karsiliksizCekSayisi: 1, takipEdilenBorcluSayisi: 1 },
    });
    const { rows } = await goster({ dosya: "USD", kalem: "USD", kalemVerisi: CEK_KALEMI("USD"), takipTuruCode: "KAMBIYO_CEK" });

    const tazminat = Object.entries(rows).find(([etiket]) => etiket.startsWith("Karşılıksız Çek Tazminatı"));
    expect(tazminat?.[1]).toBe("1.000,00 $");
    expect(rows).toMatchObject({
      Çek: "10.000,00 $",
      Komisyon: "30,00 $",
      "Takip Öncesi Faiz": "197,26 $",
      "TAKİP TUTARI": "10.227,26 $",
      "Vekalet Ücreti =": "hesaplanamadı",
      "TOPLAM BORÇ": "gösterilemez",
    });
  });

  it("dövizli çekte tazminat verisi eksikse açıklama satırı kalemin para biriminde kalır (döviz tutar ₺ ile yazılmaz)", async () => {
    const previewCek = api.previewCekFormation as unknown as ReturnType<typeof vi.fn>;
    previewCek.mockResolvedValue({
      taslak: true,
      uyari: "",
      durum: "VERI_EKSIK",
      kod: "ROL_EKSIK",
      aciklama: "borçlu rolleri eksik",
      tazminat: null,
      previewHash: "h2",
      girdiOzeti: { cekSayisi: 1, karsiliksizCekSayisi: 1, takipEdilenBorcluSayisi: 0 },
    });
    const { rows } = await goster({ dosya: "USD", kalem: "USD", kalemVerisi: CEK_KALEMI("USD"), takipTuruCode: "KAMBIYO_CEK" });

    expect(rows["Çek Tazminatı — borçlu rolleri eksik"]).toBe("0,00 $");
    expect(rows["Çek"]).toBe("10.000,00 $");
  });

  it("dosyanın para birimi değişince özet yeniden hesaplanır; eski karar yeni bağlamda gösterilmez", async () => {
    agiKur();
    const view = render(formu("TRY", KALEM("TRY")));
    await screen.findByText("SON BORÇ", {}, { timeout: 4000 });
    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "TRY", caseCurrency: "TRY" });

    view.rerender(formu("USD", KALEM("TRY")));

    // Eski (TL dosya) özeti yeni dosya para birimiyle geçerliymiş gibi kalmaz
    expect(ozetPaneli(view.container).textContent).not.toContain("SON BORÇ");
    await waitFor(() => expect(satirlar(ozetPaneli(view.container))["SON BORÇ"]).toBe("gösterilemez"), { timeout: 4000 });
    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "TRY", caseCurrency: "USD" });
    expect(screen.getByTestId("kalem-hesap-para-birimi-uyari").textContent).toBe(UYUSMAZLIK_MESAJI("USD", "TRY"));
  });

  it("geç dönen eski hesap yeni hesabı ezmez: para birimi değiştikten sonra gelen eski karar özeti gizlemez ya da kısıtlamaz", async () => {
    // İlk hesabın (USD kalem) masraf önizlemesi bekletilir; kullanıcı kalemi TRY yapar, yeni hesap hemen döner, eski hesap SONRA döner
    const eskiHesap: { serbestBirak: (() => void) | null } = { serbestBirak: null };
    apiPost.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url === "/fee-engine/preview") {
        masrafIstekleri.push(body);
        const kalem = String(body.currency);
        const yanit = { data: { success: true, data: { ...MASRAF, paraBirimiDurumu: sunucuKarari(kalem, String(body.caseCurrency)) }, cached: false } };
        if (kalem === "USD") await new Promise<void>((resolve) => (eskiHesap.serbestBirak = resolve));
        return yanit;
      }
      if (url === "/interest-engine/preview") {
        faizIstekleri.push(body);
        return { data: { success: true, data: { estimatedInterest: 197.26, currentRate: 24, days: 30, interestType: body.interestType }, cached: false } };
      }
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    const { container } = render(formu("TRY", KALEM("USD")));
    await waitFor(() => expect(masrafIstekleri).toHaveLength(1), { timeout: 4000 });
    expect(masrafIstekleri[0]).toMatchObject({ currency: "USD", caseCurrency: "TRY" });

    const paraBirimi = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "USD"),
    ) as HTMLSelectElement;
    fireEvent.change(paraBirimi, { target: { value: "TRY" } });

    // Yeni (TL) hesap tamamlanır
    await waitFor(() => expect(satirlar(ozetPaneli(container))["Vekalet Ücreti ="]).toBe("11.000,00 ₺"), { timeout: 4000 });
    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "TRY", caseCurrency: "TRY" });

    // Eski (USD) hesap şimdi döner
    expect(eskiHesap.serbestBirak).not.toBeNull();
    eskiHesap.serbestBirak!();
    await waitFor(() => expect(faizIstekleri.filter((istek) => istek.currency === "USD").length).toBeGreaterThan(0), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const sonra = satirlar(ozetPaneli(container));
    expect(sonra["Vekalet Ücreti ="]).toBe("11.000,00 ₺");
    expect(sonra["TOPLAM BORÇ"]).toBe("22.628,36 ₺");
    expect(screen.queryByTestId("kalem-hesap-para-birimi-uyari")).toBeNull();
  });

  it("kalemin para birimi değişince eski hesap yeni simgeyle gösterilmez; yeni karar gelince özet ona göre yazılır", async () => {
    const { container } = await goster({ dosya: "TRY", kalem: "TRY" });
    const paraBirimi = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "USD"),
    ) as HTMLSelectElement;

    fireEvent.change(paraBirimi, { target: { value: "USD" } });

    // TL için hesaplanmış satırlar "$" ile basılmaz: yeni hesap gelene kadar özet gösterilmez
    const hemenSonra = (ozetPaneli(container).textContent ?? "").replace(/\s+/g, " ");
    expect(hemenSonra).not.toContain("11.000,00 $");
    expect(hemenSonra).not.toContain("22.628,36 $");
    expect(hemenSonra).not.toContain("SON BORÇ");

    await waitFor(() => expect(satirlar(ozetPaneli(container))["SON BORÇ"]).toBe("gösterilemez"), { timeout: 4000 });
    const sonra = satirlar(ozetPaneli(container));
    expect(sonra["Genel Alacak"]).toBe("10.000,00 $");
    expect(sonra["Vekalet Ücreti ="]).toBe("hesaplanamadı");
    expect(masrafIstekleri.at(-1)).toMatchObject({ currency: "USD", caseCurrency: "TRY" });
  });
});
