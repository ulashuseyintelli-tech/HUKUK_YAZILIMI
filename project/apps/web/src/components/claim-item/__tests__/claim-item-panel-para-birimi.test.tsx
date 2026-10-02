/**
 * Alacak Kalemleri (Kanonik) paneli — özet toplamlarının para birimi gösterimi (DAVRANIŞ SÖZLEŞMESİ).
 *
 * Ölçülen kusur (gerçek HTTP + disposable PostgreSQL yanıtı bu panelde gösterilerek, main 6917e8aa): 10.000 USD + 5.000 EUR
 * + 2.000 TRY anaparalı dosyada özet kartları "Asıl Alacak ₺17.000,00 · Toplam Alacak ₺17.000,00", alt özet "TOPLAM ALACAK
 * ₺17.000,00" yazıyordu; kalem satırları doğruydu ($10.000,00 / €5.000,00 / ₺2.000,00).
 *
 * Kural (sunucu kararı `paraBirimiDurumu`; istemci hesap ve çevirme YAPMAZ): tek toplam gösterilemiyorsa kartlarda ve
 * "TOPLAM ALACAK" satırında tutar yerine "gösterilemez" yazılır; toplamlar sunucunun para birimi bazındaki değerleriyle
 * gösterilir. Tek para birimli (TL ve dövizli) dosyada ve eski sunucu yanıtında gösterim DEĞİŞMEZ.
 *
 * Aşağıdaki yanıtlar ölçülen sunucu yanıtlarıdır (API: claim-item/claim-summary-currency.ts); yalnız ağ katmanı taklit edilir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ClaimItemPanel } from "../ClaimItemPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

type Totals = Record<
  "principal" | "preInterest" | "postInterest" | "totalInterest" | "expense" | "fee" | "attorneyFee" | "penalty" | "tax" | "other" | "grandTotal",
  number
>;

const toplam = (degerler: Partial<Totals>): Totals => ({
  principal: 0,
  preInterest: 0,
  postInterest: 0,
  totalInterest: 0,
  expense: 0,
  fee: 0,
  attorneyFee: 0,
  penalty: 0,
  tax: 0,
  other: 0,
  grandTotal: 0,
  ...degerler,
});

const kalem = (id: string, itemType: string, amount: number, currency: string) => ({
  id,
  itemType,
  amount,
  currency,
  description: `${currency} ${itemType}`,
  status: "ACTIVE",
  isCalculated: false,
});

const tekParaBirimiDurumu = (paraBirimi: string, kalemSayisi: number, totals: Totals) => ({
  durum: "TEK_PARA_BIRIMI",
  toplamGosterilebilir: true,
  gerekce: null,
  mesaj: null,
  alacakParaBirimi: paraBirimi,
  paraBirimleri: [paraBirimi],
  paraBirimiEksikKalemSayisi: 0,
  toplamlarParaBirimiBazinda: [{ paraBirimi, kalemSayisi, totals }],
});

/** Tek para birimli dosya: 10.000 anapara + 250 masraf (ölçülen yanıt; USD / EUR / TRY dosyada sayılar aynı). */
const tekParaBirimliDosya = (paraBirimi: string) => {
  const totals = toplam({ principal: 10000, expense: 250, grandTotal: 10250 });
  return {
    items: [kalem("i1", "PRINCIPAL", 10000, paraBirimi), kalem("i2", "EXPENSE", 250, paraBirimi)],
    summary: {
      caseId: "case-1",
      currency: paraBirimi,
      items: [
        { type: "PRINCIPAL", label: "Asıl Alacak", amount: 10000, count: 1 },
        { type: "EXPENSE", label: "Masraf", amount: 250, count: 1 },
      ],
      totals,
      calculationDate: "2026-03-01T00:00:00.000Z",
      paraBirimiDurumu: tekParaBirimiDurumu(paraBirimi, 2, totals),
    },
  };
};

const KARMA_MESAJ =
  "Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Tutarlar çevrilmedi ve tek toplamda " +
  "birleştirilmedi; toplamlar para birimi bazında gösterilir.";

/** Karma anapara: USD dosya, 10.000 USD + 5.000 EUR + 2.000 TRY (ölçülen yanıt; mevcut alanlar 17.000 / "TRY"). */
const karmaAnapara = {
  items: [kalem("i1", "PRINCIPAL", 10000, "USD"), kalem("i2", "PRINCIPAL", 5000, "EUR"), kalem("i3", "PRINCIPAL", 2000, "TRY")],
  summary: {
    caseId: "case-1",
    currency: "TRY",
    items: [{ type: "PRINCIPAL", label: "Asıl Alacak", amount: 17000, count: 3 }],
    totals: toplam({ principal: 17000, grandTotal: 17000 }),
    calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "KARMA_PARA_BIRIMI",
      toplamGosterilebilir: false,
      gerekce: "FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
      mesaj: KARMA_MESAJ,
      alacakParaBirimi: null,
      paraBirimleri: ["EUR", "TRY", "USD"],
      paraBirimiEksikKalemSayisi: 0,
      toplamlarParaBirimiBazinda: [
        { paraBirimi: "EUR", kalemSayisi: 1, totals: toplam({ principal: 5000, grandTotal: 5000 }) },
        { paraBirimi: "TRY", kalemSayisi: 1, totals: toplam({ principal: 2000, grandTotal: 2000 }) },
        { paraBirimi: "USD", kalemSayisi: 1, totals: toplam({ principal: 10000, grandTotal: 10000 }) },
      ],
    },
  },
};

/** Aynı kategoride farklı para birimi: USD anapara + USD 250 masraf + EUR 300 masraf (ölçülen yanıt; mevcut masraf 550). */
const karmaMasraf = {
  items: [kalem("i1", "PRINCIPAL", 10000, "USD"), kalem("i2", "EXPENSE", 250, "USD"), kalem("i3", "EXPENSE", 300, "EUR")],
  summary: {
    caseId: "case-1",
    currency: "EUR",
    items: [
      { type: "PRINCIPAL", label: "Asıl Alacak", amount: 10000, count: 1 },
      { type: "EXPENSE", label: "Masraf", amount: 550, count: 2 },
    ],
    totals: toplam({ principal: 10000, expense: 550, grandTotal: 10550 }),
    calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "KARMA_PARA_BIRIMI",
      toplamGosterilebilir: false,
      gerekce: "FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ",
      mesaj: "Dosyada birden fazla para biriminde alacak kalemi var (EUR, USD).",
      alacakParaBirimi: null,
      paraBirimleri: ["EUR", "USD"],
      paraBirimiEksikKalemSayisi: 0,
      toplamlarParaBirimiBazinda: [
        { paraBirimi: "EUR", kalemSayisi: 1, totals: toplam({ expense: 300, grandTotal: 300 }) },
        { paraBirimi: "USD", kalemSayisi: 2, totals: toplam({ principal: 10000, expense: 250, grandTotal: 10250 }) },
      ],
    },
  },
};

type Yanit = { items: unknown[]; summary: Record<string, unknown> };

function yanitla({ items, summary }: Yanit) {
  apiGet.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: items } }),
  );
}

/** Üretimdeki bağlantıyla aynı: salt görüntüleme + metadata düzenleme. */
async function goster(yanit: Yanit) {
  yanitla(yanit);
  const view = render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
  await screen.findByText(`Alacak Kalemleri (${yanit.items.length})`);
  return view;
}

/** Tutar yazan öğelerin metinleri (Intl para birimi biçiminin boşluk türünden bağımsız). */
const duz = (metin: string | null | undefined) => (metin ?? "").replace(/\s/g, " ").trim();
const ozetKartlari = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".grid.grid-cols-2 > div")).map((kart) =>
    Array.from(kart.querySelectorAll("p")).map((p) => duz(p.textContent)),
  );
const satirlar = (kok: HTMLElement) =>
  Array.from(kok.querySelectorAll("div.flex.justify-between")).map((satir) =>
    Array.from(satir.querySelectorAll(":scope > span")).map((span) => duz(span.textContent)),
  );
/** Kalem listesindeki satır tutarları (özet değil; kalemin kendi kaydı). */
const kalemTutarlari = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".divide-y span.text-lg.font-bold")).map((el) => duz(el.textContent));

beforeEach(() => {
  apiGet.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ClaimItemPanel — tek para birimli dosyada gösterim AYNEN", () => {
  it.each([
    ["TRY", ["₺10.000,00", "₺0,00", "₺250,00", "₺10.250,00"]],
    ["USD", ["$10.000,00", "$0,00", "$250,00", "$10.250,00"]],
    ["EUR", ["€10.000,00", "€0,00", "€250,00", "€10.250,00"]],
  ])("%s dosya: kartlar ve alt özet tek toplamı dosyanın para birimiyle yazar; uyarı ve 'gösterilemez' yok", async (paraBirimi, beklenen) => {
    const { container } = await goster(tekParaBirimliDosya(paraBirimi));

    expect(ozetKartlari(container)).toEqual([
      ["Asıl Alacak", beklenen[0]],
      ["Toplam Faiz", beklenen[1]],
      ["Masraf + Harç", beklenen[2]],
      ["Toplam Alacak", beklenen[3]],
    ]);
    const altOzet = screen.getByText("Alacak Özeti").parentElement as HTMLElement;
    expect(satirlar(altOzet)).toEqual([
      ["Asıl Alacak (Ana Para)", beklenen[0]],
      ["Masraflar", beklenen[2]],
      ["TOPLAM ALACAK", beklenen[3]],
    ]);
    expect(kalemTutarlari(container)).toEqual([beklenen[0], beklenen[2]]);
    expect(screen.queryByTestId("claim-summary-currency-notice")).toBeNull();
    expect(screen.queryByTestId("claim-summary-by-currency")).toBeNull();
    expect(container.textContent).not.toContain("gösterilemez");
  });

  it.each(["TRY", "USD"])("%s dosya: `paraBirimiDurumu` taşıyan yanıt ile eski sunucu yanıtı (blok yok) AYNI işaretlemeyi üretir", async (paraBirimi) => {
    const yeni = tekParaBirimliDosya(paraBirimi);
    const { paraBirimiDurumu: _blok, ...eskiOzet } = yeni.summary;

    const yeniHtml = (await goster(yeni)).container.innerHTML;
    cleanup();
    const eskiHtml = (await goster({ items: yeni.items, summary: eskiOzet })).container.innerHTML;

    expect(yeniHtml.length).toBeGreaterThan(500); // bakıldığının kanıtı: panel gerçekten çizildi
    expect(yeniHtml).toBe(eskiHtml);
  });

  it("kalemsiz dosya (KALEM_YOK): gösterim eski yanıtla aynı (tek toplam 0)", async () => {
    const bos = {
      items: [],
      summary: {
        caseId: "case-1",
        currency: "TRY",
        items: [],
        totals: toplam({}),
        calculationDate: "2026-03-01T00:00:00.000Z",
        paraBirimiDurumu: {
          durum: "KALEM_YOK",
          toplamGosterilebilir: true,
          gerekce: null,
          mesaj: null,
          alacakParaBirimi: null,
          paraBirimleri: [],
          paraBirimiEksikKalemSayisi: 0,
          toplamlarParaBirimiBazinda: [],
        },
      },
    };
    const { paraBirimiDurumu: _blok, ...eskiOzet } = bos.summary;

    const view = await goster(bos);
    expect(ozetKartlari(view.container).map((kart) => kart[1])).toEqual(["₺0,00", "₺0,00", "₺0,00", "₺0,00"]);
    const yeniHtml = view.container.innerHTML;
    cleanup();
    const eskiHtml = (await goster({ items: [], summary: eskiOzet })).container.innerHTML;

    expect(yeniHtml).toBe(eskiHtml);
  });
});

describe("ClaimItemPanel — karma para birimli dosyada tek toplam geçerli tutar gibi gösterilmez", () => {
  it("karma anapara (USD + EUR + TRY): kartlar ve TOPLAM ALACAK 'gösterilemez'; 17.000 hiçbir yerde yazmaz", async () => {
    const { container } = await goster(karmaAnapara);

    expect(ozetKartlari(container)).toEqual([
      ["Asıl Alacak", "gösterilemez"],
      ["Toplam Faiz", "gösterilemez"],
      ["Masraf + Harç", "gösterilemez"],
      ["Toplam Alacak", "gösterilemez"],
    ]);
    expect(duz(screen.getByTestId("claim-summary-grand-total-unavailable").textContent)).toBe("gösterilemez");
    expect(duz(screen.getByTestId("claim-summary-currency-notice").textContent)).toBe(KARMA_MESAJ);
    // Çapraz para birimi toplamı (sunucunun mevcut `totals` alanındaki 17.000) hiçbir biçimde ekranda yok
    expect(container.textContent).not.toMatch(/17[.,]?000/);
  });

  it("karma anapara: toplamlar sunucunun para birimi bazındaki değerleriyle, her biri kendi para birimiyle yazılır", async () => {
    await goster(karmaAnapara);

    const bolum = (kod: string) => satirlar(screen.getByTestId(`claim-summary-currency-${kod}`));
    expect(duz(within(screen.getByTestId("claim-summary-currency-USD")).getByText(/kalem$/).textContent)).toBe("USD · 1 kalem");
    expect(bolum("EUR")).toEqual([["Asıl Alacak (Ana Para)", "€5.000,00"], ["Toplam (EUR)", "€5.000,00"]]);
    expect(bolum("TRY")).toEqual([["Asıl Alacak (Ana Para)", "₺2.000,00"], ["Toplam (TRY)", "₺2.000,00"]]);
    expect(bolum("USD")).toEqual([["Asıl Alacak (Ana Para)", "$10.000,00"], ["Toplam (USD)", "$10.000,00"]]);
    // Bölüm sırası sunucunun sırasıdır
    expect(
      Array.from(screen.getByTestId("claim-summary-by-currency").querySelectorAll("[data-testid^='claim-summary-currency-']")).map(
        (el) => el.getAttribute("data-testid"),
      ),
    ).toEqual(["claim-summary-currency-EUR", "claim-summary-currency-TRY", "claim-summary-currency-USD"]);
  });

  it("karma anapara: kalem satırları değişmedi — her kalem kendi para birimiyle", async () => {
    const { container } = await goster(karmaAnapara);

    expect(kalemTutarlari(container)).toEqual(["$10.000,00", "€5.000,00", "₺2.000,00"]);
  });

  it("aynı kategoride farklı para birimi (USD + EUR masraf): kategori toplamı da ayrılır; 550 ve 10.550 yazmaz", async () => {
    const { container } = await goster(karmaMasraf);

    expect(satirlar(screen.getByTestId("claim-summary-currency-EUR"))).toEqual([
      ["Masraflar", "€300,00"],
      ["Toplam (EUR)", "€300,00"],
    ]);
    expect(satirlar(screen.getByTestId("claim-summary-currency-USD"))).toEqual([
      ["Asıl Alacak (Ana Para)", "$10.000,00"],
      ["Masraflar", "$250,00"],
      ["Toplam (USD)", "$10.250,00"],
    ]);
    expect(screen.getAllByTestId("claim-summary-card-unavailable")).toHaveLength(4);
    expect(container.textContent).not.toMatch(/550,00/);
  });

  it("istemci toplama YAPMAZ: para birimi bazındaki tutar kalem listesinden değil sunucu bloğundan gelir", async () => {
    // Kalem listesi 10.000 USD + 5.000 EUR + 2.000 TRY; sunucu bloğu bilerek farklı (USD 9.999,99) → ekranda sunucunun değeri
    const sunucuFarkli = {
      items: karmaAnapara.items,
      summary: {
        ...karmaAnapara.summary,
        paraBirimiDurumu: {
          ...karmaAnapara.summary.paraBirimiDurumu,
          toplamlarParaBirimiBazinda: [
            { paraBirimi: "USD", kalemSayisi: 1, totals: toplam({ principal: 9999.99, fee: 1.5, other: 2.25, grandTotal: 10003.74 }) },
          ],
        },
      },
    };

    await goster(sunucuFarkli);

    expect(satirlar(screen.getByTestId("claim-summary-currency-USD"))).toEqual([
      ["Asıl Alacak (Ana Para)", "$9.999,99"],
      ["Harçlar", "$1,50"],
      ["Diğer", "$2,25"],
      ["Toplam (USD)", "$10.003,74"],
    ]);
    expect(screen.queryByTestId("claim-summary-currency-EUR")).toBeNull();
  });

  it("para birimi kayıtlı olmayan kalem (PARA_BIRIMI_EKSIK): sunucu açıklaması gösterilir; tek toplam 'gösterilemez'", async () => {
    const mesaj = "1 alacak kaleminin para birimi kayıtlı değil. Bu kalemler hiçbir toplama dahil edilmedi; tek toplam gösterilmedi.";
    const eksik = {
      items: [kalem("i1", "PRINCIPAL", 10000, "TRY")],
      summary: {
        caseId: "case-1",
        currency: "TRY",
        items: [],
        totals: toplam({ principal: 10000, expense: 250, grandTotal: 10250 }),
        calculationDate: "2026-03-01T00:00:00.000Z",
        paraBirimiDurumu: {
          durum: "PARA_BIRIMI_EKSIK",
          toplamGosterilebilir: false,
          gerekce: "KALEM_PARA_BIRIMI_EKSIK",
          mesaj,
          alacakParaBirimi: null,
          paraBirimleri: ["TRY"],
          paraBirimiEksikKalemSayisi: 1,
          toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: 1, totals: toplam({ principal: 10000, grandTotal: 10000 }) }],
        },
      },
    };

    const { container } = await goster(eksik);

    expect(duz(screen.getByTestId("claim-summary-currency-notice").textContent)).toBe(mesaj);
    expect(screen.getAllByTestId("claim-summary-card-unavailable")).toHaveLength(4);
    expect(satirlar(screen.getByTestId("claim-summary-currency-TRY"))).toEqual([
      ["Asıl Alacak (Ana Para)", "₺10.000,00"],
      ["Toplam (TRY)", "₺10.000,00"],
    ]);
    // Para birimi bilinmeyen kalemi içeren tek toplam (10.250) gösterilmez
    expect(container.textContent).not.toMatch(/10\.250/);
  });
});
