/**
 * Sihirbaz alacak kalemi formu — "Hesap Özeti" masraf satırları: takip türü kodu taşınır, masraf hesaplanamıyorsa
 * "hesaplanamadı" yazılır, 0,00 DEĞİL (owner kararı 12).
 *
 * Ölçülen kusur (main 63dc6618 / fdc1f23b; gerçek tarayıcı + derlenmiş denetleyici): form `fee-engine/preview`e takip türü
 * yerine KALEM TÜRÜNÜ (`ASIL_ALACAK`, `FATURA`, `CEK`…) yolluyordu; sunucu bunu hiçbir masraf profiliyle eşleştiremeyip
 * `success:true, 0` döndürüyor, panel "Başvurma Harcı 0,00 ₺ … İCRA MASRAFLARI 0,00 ₺ · Vekalet Ücreti 11.000,00 ₺ · TOPLAM
 * BORÇ 21.000,00 ₺" yazıyordu; tarife yokken de aynı görünüm. Masraf önizlemesi alınamadığında (hata yanıtı) ise masraf 0,00
 * ve toplamlar eksik kalemle TAM gibi sayı olarak yazılıyordu.
 *
 * Sözleşme: (1) istek `takipTuruCode` taşır (kalem türü DEĞİL); (2) sunucu `success:false` derse masrafın kendisi ve masrafa
 * bağlı tahsil harcı "hesaplanamadı", eksik kalemle toplanmış TOPLAM / SON BORÇ ve oran tablosu "gösterilemez" yazılır, neden
 * (sunucu metni) görünür; (3) gerçekten doğmayan harç (ilamlıda peşin harç) "0,00 ₺" olarak KALIR; (4) döviz / TL toplama kapıları
 * değişmez (bkz. professional-claim-item-form-para-birimi.test.tsx).
 *
 * Form, önizleme istemcileri ve biçimlendirici GERÇEKTİR; yalnız ağ katmanı taklit edilir. Taklit sunucunun doğru / hatalı
 * yanıtı gerçek denetleyiciyle `apps/api/.../fee-preview-hesaplanamadi.http.spec.ts` içinde ayrıca kilitlidir.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProfessionalClaimItemForm } from "../ProfessionalClaimItemForm";
import { apiClient } from "@/lib/api/client";

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

const BASARILI = (pesinHarc: number, toplam: number) => ({
  success: true,
  data: {
    estimatedFees: toplam,
    estimatedAttorneyFee: 11000,
    tariffYear: 2026,
    breakdown: { basvurmaHarci: 738.5, vekaletHarci: 105, pesinHarc, dosyaGideri: 50, tebligatGideri: 252, vekaletPulu: 165.6 },
  },
  cached: false,
});

const HATA = (code: string, message: string) => ({ success: false, error: { code, message }, cached: false });

type MasrafYaniti = (istek: Record<string, unknown>) => unknown;

let masrafIstekleri: Array<Record<string, unknown>>;

function agiKur(masraf: MasrafYaniti) {
  apiPost.mockImplementation(async (url: string, body: Record<string, unknown>) => {
    if (url === "/fee-engine/preview") {
      masrafIstekleri.push(body);
      return { data: masraf(body) };
    }
    if (url === "/interest-engine/preview") {
      return { data: { success: true, data: { estimatedInterest: 0, currentRate: 24, days: 0, interestType: body.interestType }, cached: false } };
    }
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

function satirlar(container: HTMLElement): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of Array.from(container.querySelectorAll("div.flex.justify-between"))) {
    const cells = Array.from(row.children).map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells.length === 2) map[cells[0]] = cells[1];
  }
  return map;
}

function ozetPaneli(container: HTMLElement): HTMLElement {
  const baslik = Array.from(container.querySelectorAll("h3")).find((h) => (h.textContent ?? "").includes("Hesap Özeti"));
  const panel = baslik?.closest("div.w-72");
  if (!panel) throw new Error("Hesap Özeti paneli bulunamadı");
  return panel as HTMLElement;
}

const KALEM = (kalemTuru = "ASIL_ALACAK", currency = "TRY") => ({
  id: "kalem-1",
  kalemTuru,
  toplamTutar: 10000,
  bakiyeTutar: 10000,
  currency,
  vadeTarihi: "2026-08-01",
  takipOncesiFaiz: "YOK",
  takipSonrasiFaiz: "YOK",
  faizOrani: null,
  faizsizGerekce: "",
  hesaplanmisFaiz: false,
  aciklama: "",
});

const SABIT_BORCLULAR: never[] = [];

async function goster({
  takipTuruCode = "ILAMSIZ_GENEL",
  kalem = KALEM(),
  dosya = "TRY",
  onItemsChange,
}: {
  takipTuruCode?: string | undefined;
  kalem?: Record<string, unknown>;
  dosya?: string;
  onItemsChange?: (items: any[]) => void;
} = {}) {
  const view = render(
    <ProfessionalClaimItemForm
      caseType="GENEL_ICRA"
      currency={dosya}
      takipTuruCode={takipTuruCode}
      takipTarihi="2026-10-01"
      hesapTarihi="2026-10-01"
      borcluSayisi={1}
      caseDebtors={SABIT_BORCLULAR}
      initialItems={[kalem]}
      onItemsChange={onItemsChange}
    />,
  );
  await screen.findByText("SON BORÇ", {}, { timeout: 4000 });
  const panel = ozetPaneli(view.container);
  const rows = satirlar(panel);
  const row = (basi: string) => Object.entries(rows).find(([etiket]) => etiket.startsWith(basi))?.[1];
  return { ...view, panel, rows, row, text: (panel.textContent ?? "").replace(/\s+/g, " ") };
}

const TL_TUTAR = /^-?[\d.]+,\d{2} ₺$/;

beforeEach(() => {
  masrafIstekleri = [];
  apiPost.mockReset();
});
afterEach(() => cleanup());

describe("Hesap Özeti masraf — takip türü kodu taşınır", () => {
  it("istek `takipTuruCode` taşır; KALEM TÜRÜ gönderilmez (eskiden caseType: ASIL_ALACAK)", async () => {
    agiKur(() => BASARILI(120, 1431.1));
    await goster({ takipTuruCode: "ILAMSIZ_GENEL", kalem: KALEM("ASIL_ALACAK") });

    expect(masrafIstekleri.length).toBeGreaterThan(0);
    for (const istek of masrafIstekleri) {
      expect(istek).toMatchObject({ principalAmount: 10000, takipTuruCode: "ILAMSIZ_GENEL", debtorCount: 1 });
      expect(istek).not.toHaveProperty("caseType");
    }
  });

  it.each([
    ["KAMBIYO_CEK", "CEK"],
    ["ILAMSIZ_KIRA", "KIRA"],
    ["ILAMLI", "ILAM"],
  ])("takip türü %s, kalem türü %s: istekte takip türü kodu var, kalem türü yok", async (takipTuruCode, kalemTuru) => {
    agiKur(() => BASARILI(0, 1311.1));
    await goster({
      takipTuruCode,
      kalem: {
        ...KALEM(kalemTuru),
        ...(kalemTuru === "CEK"
          ? { cekBilgileri: { ibrazTarihi: "2026-08-01", duzenlemeYeri: "", cekSeriNo: "CK-1", hesapNo: "", bankaVeSube: "Banka - Şube", cekiImzalayanlar: "" } }
          : {}),
      },
    });

    for (const istek of masrafIstekleri) {
      expect(istek.takipTuruCode).toBe(takipTuruCode);
      expect(JSON.stringify(istek)).not.toContain(`"${kalemTuru}"`);
    }
  });

  it("sunucu doğru satırları dönünce panel o satırları yazar (kod taşınınca 0,00 değil)", async () => {
    agiKur(() => BASARILI(120, 1431.1));
    const { rows } = await goster();

    expect(rows).toMatchObject({
      "Başvurma Harcı": "738,50 ₺",
      "Vekalet Harcı": "105,00 ₺",
      "Peşin Harç": "120,00 ₺",
      "Dosya Gideri": "50,00 ₺",
      "Vekalet Pulu": "165,60 ₺",
      "İCRA MASRAFLARI": "1.431,10 ₺",
    });
    expect(screen.queryByTestId("kalem-hesap-masraf-hesaplanamadi")).toBeNull();
  });
});

describe("Hesap Özeti masraf — hesaplanamadı ≠ gerçek 0,00", () => {
  const NEDENLER: Array<[string, string, string]> = [
    ["CASE_TYPE_UNRESOLVED", "Takip türü belirtilmedi; masraflar hesaplanamadı.", "takip türü yok"],
    ["TARIFF_NOT_FOUND", "Tariff not found for year: 2026", "tarife yok"],
    ["TARIFF_ITEM_MISSING", "Tarifede gerekli kalem tanımlı değil (file_expense); masraflar hesaplanamadı.", "tarifede kalem yok"],
    ["FEE_PROFILE_NOT_FOUND", "Bu takip türü için masraf profili bulunamadı; masraflar hesaplanamadı.", "profil yok"],
  ];

  it.each(NEDENLER)("%s (%s → %s): masraf ve masrafa bağlı satırlar 'hesaplanamadı', toplamlar 'gösterilemez', neden görünür", async (kod, mesaj) => {
    agiKur(() => HATA(kod, mesaj));
    const { rows, row, text } = await goster();

    expect(row("İCRA MASRAFLARI")).toBe("hesaplanamadı");
    expect(row("Vekalet Ücreti")).toBe("hesaplanamadı");
    expect(row("Peşin Harç Dahil Tahsil Harcı")).toBe("hesaplanamadı");
    expect(row("Peşin Harç Hariç Tahsil Harcı")).toBe("hesaplanamadı");
    expect(row("TOPLAM BORÇ")).toBe("gösterilemez");
    expect(row("SON BORÇ")).toBe("gösterilemez");
    // Bilinen satır olduğu gibi kalır; masraf yerine 0,00 yazılan hiçbir satır yok
    expect(row("TAKİP TUTARI")).toBe("10.000,00 ₺");
    expect(rows["İCRA MASRAFLARI"]).not.toMatch(TL_TUTAR);
    expect(text).not.toContain("0,00 ₺ İCRA");
    expect(screen.getByTestId("kalem-hesap-masraf-hesaplanamadi").textContent).toBe(mesaj);
    // Oran tablosu tek durum satırı: tutar yok
    expect(screen.getByTestId("kalem-hesap-tahsil-oranlari-durum").textContent).toBe("gösterilemez");
  });

  it("sunucuya hiç ulaşılamazsa (ağ hatası) aynı görünüm; 0,00 yok", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/fee-engine/preview") throw new Error("ağ yok");
      return { data: { success: true, data: { estimatedInterest: 0, currentRate: 24, days: 0, interestType: "LEGAL_3095" }, cached: false } };
    });
    const { row } = await goster();

    expect(row("İCRA MASRAFLARI")).toBe("hesaplanamadı");
    expect(row("TOPLAM BORÇ")).toBe("gösterilemez");
    expect(row("SON BORÇ")).toBe("gösterilemez");
    expect(screen.getByTestId("kalem-hesap-masraf-hesaplanamadi").textContent).toContain("erişilemiyor");
  });

  it("GERÇEK 0: ilamlıda peşin harç doğmaz — '0,00 ₺' kalır, toplamlar sayıdır, uyarı yok", async () => {
    agiKur(() => BASARILI(0, 1311.1));
    const { row } = await goster({ takipTuruCode: "ILAMLI", kalem: KALEM("ILAM") });

    expect(row("Peşin Harç")).toBe("0,00 ₺");
    expect(row("İCRA MASRAFLARI")).toBe("1.311,10 ₺");
    expect(row("TOPLAM BORÇ")).toMatch(TL_TUTAR);
    expect(row("SON BORÇ")).toMatch(TL_TUTAR);
    expect(screen.queryByTestId("kalem-hesap-masraf-hesaplanamadi")).toBeNull();
    expect(screen.queryByTestId("kalem-hesap-tahsil-oranlari-durum")).toBeNull();
  });

  it("dövizli kalemde masraf hesaplanamazsa toplamlar yine döviz simgesiyle sayı olarak yazılmaz", async () => {
    agiKur(() => HATA("CASE_TYPE_UNRESOLVED", "Takip türü belirtilmedi; masraflar hesaplanamadı."));
    const { row, text } = await goster({ kalem: KALEM("ASIL_ALACAK", "USD"), dosya: "USD" });

    expect(row("TOPLAM BORÇ")).toBe("gösterilemez");
    expect(row("SON BORÇ")).toBe("gösterilemez");
    expect(row("İCRA MASRAFLARI")).toBe("hesaplanamadı");
    expect(text).not.toMatch(/\d,\d{2} \$ *SON BORÇ/);
  });
});

describe("Hesap Özeti masraf — dışarı verilen satırlar sıfırı gerçek sanmaz", () => {
  const sonSatirlar = (onItemsChange: ReturnType<typeof vi.fn>) => {
    const cagrilar = onItemsChange.mock.calls;
    const son = cagrilar[cagrilar.length - 1]?.[0]?.[0]?.hesapOzeti as Array<{ key: string; hesaplanamadi?: boolean }> | undefined;
    return Object.fromEntries((son ?? []).map((s) => [s.key, s.hesaplanamadi === true]));
  };

  it("masraf hesaplanamadıysa ilgili satırlar `hesaplanamadi: true` taşır", async () => {
    agiKur(() => HATA("TARIFF_NOT_FOUND", "Tariff not found for year: 2026"));
    const onItemsChange = vi.fn();
    await goster({ onItemsChange });

    const bayrak = sonSatirlar(onItemsChange);
    expect(bayrak.icra_masraflari).toBe(true);
    expect(bayrak.vekalet_ucreti).toBe(true);
    expect(bayrak.toplam_borc).toBe(true);
    expect(bayrak.son_borc).toBe(true);
    expect(bayrak.tahsil_0).toBe(true);
    expect(bayrak.takip_tutari).toBe(false);
  });

  it("masraf hesaplandıysa hiçbir satır `hesaplanamadi` taşımaz", async () => {
    agiKur(() => BASARILI(120, 1431.1));
    const onItemsChange = vi.fn();
    await goster({ onItemsChange });

    const bayrak = sonSatirlar(onItemsChange);
    expect(Object.values(bayrak).some(Boolean)).toBe(false);
    expect(Object.keys(bayrak)).toContain("icra_masraflari");
  });
});
