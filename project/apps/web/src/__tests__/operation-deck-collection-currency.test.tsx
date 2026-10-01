import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationDeck } from "@/components/case-detail/OperationDeck";

/**
 * OperationDeck — tahsilat ve dağıtım kaydı tutarı KAYDIN KENDİ para birimiyle yazılır.
 *
 * Kusur (sayfa düzeyinde ölçüldü, main 6917e8aa): "Finans" sekmesi USD tahsilatı "Tahsilat 1.000 ₺ / +1.000 ₺" basıyor,
 * 1.000 USD + 500 TRY + 300 EUR tahsilatı tek sayıda ("1.800 ₺") topluyor; "Dağıtım & Mutabakat" sekmesi USD dağıtım
 * kaydını "1.000 ₺ / +400 ₺" yazıyordu.
 *
 * Kural (politika gerektirmeyen kısım; RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002): tutar kaydın kendi para
 * birimiyle yazılır, farklı para birimleri tek toplamda birleştirilmez, tutar ÇEVRİLMEZ. Masraf ve masraf talebi
 * tutarları TL tarifesindendir — etiketleri değişmez. TL dosyada gösterim aynen kalır.
 */

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

type Item = {
  id: string;
  type: "TAHSILAT" | "MASRAF_YAPILAN" | "MASRAF_TALEP";
  amount: number;
  date: string;
  description?: string;
  currency?: string | null;
  allocationHeld?: boolean;
  paidAmount?: number;
};

const tahsilat = (id: string, amount: number, currency?: string | null, extra: Partial<Item> = {}): Item => ({
  id,
  type: "TAHSILAT",
  amount,
  date: "2026-03-01",
  description: `Tahsilat ${id}`,
  ...(currency === undefined ? {} : { currency }),
  ...extra,
});

/** `extra`: senaryonun gerektirdiği ek girdiler (ör. yapılan masraf kaynağının bağlı olduğu durum). */
function openFinance(
  financeItems: Item[],
  caseCurrency?: string | null,
  extra: Partial<React.ComponentProps<typeof OperationDeck>> = {},
) {
  render(
    <OperationDeck
      caseId="case-1"
      financeItems={financeItems}
      {...(caseCurrency === undefined ? {} : { caseCurrency })}
      {...extra}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Finans/ }));
}

/** "Son İşlemler" satırları: "açıklama | tutar". Liste bulunamazsa hata fırlatır (boş sonuç "bakıldı" demek olsun). */
function recentRows(): string[] {
  const list = screen.getByText("Son İşlemler").nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  return Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    if (!amount) throw new Error(`satırda tutar öğesi yok: ${norm(row.textContent)}`);
    return `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}`;
  });
}

const total = () => norm(screen.getByTestId("finance-collection-total").textContent);
const held = () => norm(screen.getByTestId("finance-collection-held").textContent);
/** "Tahsilat" özet kartının tamamı (başlık + toplam + bekleyen satırı). */
const collectionCard = () => {
  const card = (screen.queryByTestId("finance-collection-total") ?? screen.getByTestId("finance-collection-total-unavailable")).parentElement;
  if (!card) throw new Error("Tahsilat kartı bulunamadı");
  return card;
};

describe("Finans sekmesi — tahsilat tutarı kaydın kendi para birimiyle", () => {
  it("USD tahsilat: özet kartı ve satır USD ile yazılır; '₺' yazılmaz", () => {
    openFinance([tahsilat("c1", 1000, "USD")], "USD");

    expect(total()).toBe("1.000 USD");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD"]);
    expect(norm(collectionCard().textContent)).not.toContain("₺");
  });

  it("satır, dosyanın değil KAYDIN para birimini taşır (dosya USD, kayıt EUR)", () => {
    openFinance([tahsilat("c1", 300, "EUR")], "USD");

    expect(total()).toBe("300 EUR");
    expect(recentRows()).toEqual(["Tahsilat c1 | +300 EUR"]);
  });

  it("para birimi kodu boşluk / küçük harfle gelse de ISO koduyla yazılır", () => {
    openFinance([tahsilat("c1", 1000, " usd ")], "USD");

    expect(total()).toBe("1.000 USD");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD"]);
  });

  it("mahsubu bekleyen tahsilat ayrı satırda ve kendi para birimiyle, '+' olmadan yazılır", () => {
    openFinance(
      [tahsilat("c1", 1000, "USD"), tahsilat("c2", 1500, "USD", { allocationHeld: true })],
      "USD",
    );

    expect(total()).toBe("1.000 USD");
    expect(held()).toBe("Mahsubu bekleyen: 1.500 USD (borçtan düşülmedi)");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD", "Tahsilat c2mahsubu bekliyor | 1.500 USD"]);
  });

  it("tahsilat yokken 0 tutarı dosyanın para birimiyle yazılır", () => {
    openFinance([], "EUR");

    expect(total()).toBe("0 EUR");
    expect(screen.queryByTestId("finance-collection-held")).toBeNull();
    // Masraf hareketleri bu ekrana bağlı değilken boş liste yalnız tahsilat için konuşur
    expect(screen.getByText("Henüz tahsilat yok")).toBeInTheDocument();
  });

  it("yalnız bekleyen tahsilat varken mahsup edilmiş toplam (0) dosyanın para birimiyle yazılır", () => {
    openFinance([tahsilat("c1", 1500, "USD", { allocationHeld: true })], "USD");

    expect(total()).toBe("0 USD");
    expect(held()).toBe("Mahsubu bekleyen: 1.500 USD (borçtan düşülmedi)");
  });
});

describe("Finans sekmesi — farklı para birimleri tek toplamda birleştirilmez", () => {
  it("USD + TRY + EUR tahsilat: toplam 'gösterilemez' (1.800 yazılmaz); her satır kendi para birimiyle", () => {
    openFinance(
      [tahsilat("c1", 1000, "USD"), tahsilat("c2", 500, "TRY"), tahsilat("c3", 300, "EUR")],
      "USD",
    );

    expect(screen.queryByTestId("finance-collection-total")).toBeNull();
    expect(norm(screen.getByTestId("finance-collection-total-unavailable").textContent)).toBe("gösterilemez");
    expect(norm(collectionCard().textContent)).toBe("Tahsilat (farklı para birimleri)gösterilemez");
    expect(norm(collectionCard().textContent)).not.toContain("1.800");
    // Neden ekranda: kart açıklamayı taşır
    expect(collectionCard().getAttribute("title")).toBe(
      "Tahsilatlar birden fazla para biriminde; tutarlar çevrilmez ve tek toplamda birleştirilmez.",
    );
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD", "Tahsilat c2 | +500 ₺", "Tahsilat c3 | +300 EUR"]);
  });

  it("para birimi alanı taşımayan eski kayıt TRY sayılır: USD kayıtla birlikte toplam yine 'gösterilemez'", () => {
    openFinance([tahsilat("c1", 1000, "USD"), tahsilat("c2", 500)], "USD");

    expect(screen.queryByTestId("finance-collection-total")).toBeNull();
    expect(norm(screen.getByTestId("finance-collection-total-unavailable").textContent)).toBe("gösterilemez");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD", "Tahsilat c2 | +500 ₺"]);
  });

  it("mahsup edilmiş ve bekleyen tahsilat ayrı toplamlardır: her biri kendi içinde tek para birimindeyse yazılır", () => {
    openFinance(
      [tahsilat("c1", 1000, "USD"), tahsilat("c2", 500, "TRY", { allocationHeld: true })],
      "USD",
    );

    expect(total()).toBe("1.000 USD");
    expect(held()).toBe("Mahsubu bekleyen: 500 ₺ (borçtan düşülmedi)");
    expect(screen.queryByTestId("finance-collection-total-unavailable")).toBeNull();
    expect(collectionCard().getAttribute("title")).toBeNull();
  });

  it("bekleyen tahsilatlar farklı para birimlerindeyse bekleyen toplamı 'gösterilemez'; mahsup edilmiş toplam yazılır", () => {
    openFinance(
      [
        tahsilat("c1", 1000, "USD"),
        tahsilat("c2", 500, "USD", { allocationHeld: true }),
        tahsilat("c3", 300, "EUR", { allocationHeld: true }),
      ],
      "USD",
    );

    expect(total()).toBe("1.000 USD");
    expect(held()).toBe("Mahsubu bekleyen (farklı para birimleri): gösterilemez (borçtan düşülmedi)");
    expect(held()).not.toContain("800");
    // başlık karma demez (mahsup edilmiş toplam yazılabiliyor); neden yine kartta
    expect(norm(collectionCard().children[0]?.textContent)).toBe("Tahsilat");
    expect(collectionCard().getAttribute("title")).toBe(
      "Tahsilatlar birden fazla para biriminde; tutarlar çevrilmez ve tek toplamda birleştirilmez.",
    );
  });

  it("aynı para birimindeki tahsilatlar (dosya para birimi farklı olsa da) tek toplamda o para biriminde yazılır", () => {
    openFinance([tahsilat("c1", 1000, "EUR"), tahsilat("c2", 250.5, "EUR")], "USD");

    expect(total()).toBe("1.250,5 EUR");
    expect(screen.queryByTestId("finance-collection-total-unavailable")).toBeNull();
  });
});

describe("Finans sekmesi — masraf tutarları TL tarifesindendir (etiket değişmez)", () => {
  // Yapılan masraf satırları yalnız kaynağı bağlıyken (READY) yazılır; bu senaryolarda kaynak bağlıdır.
  const ACTUAL_EXPENSE_CONNECTED = { actualExpenseSource: "READY" as const };

  it("USD dosyada yapılan masraf ve masraf talebi '₺' ile yazılır; tahsilat USD ile", () => {
    openFinance(
      [
        tahsilat("c1", 1000, "USD"),
        { id: "m1", type: "MASRAF_YAPILAN", amount: 300, date: "2026-03-02", description: "Tebligat gideri" },
        { id: "t1", type: "MASRAF_TALEP", amount: 500, date: "2026-03-03", description: "Açılış masrafı", paidAmount: 200 },
      ],
      "USD",
      ACTUAL_EXPENSE_CONNECTED,
    );

    expect(total()).toBe("1.000 USD");
    const cards = Array.from(collectionCard().parentElement?.children ?? []).map((card) => norm(card.textContent));
    expect(cards).toEqual([
      "Tahsilat1.000 USD",
      "Yapılan Masraf300 ₺",
      "Masraf Talebi500 ₺Ödenen: 200 ₺",
      "Müvekkil BakiyeBu bilgi henüz bu ekrana bağlanmadı",
    ]);
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD", "Tebligat gideri | -300 ₺"]);
  });

  it("masraf satırı para birimi alanı taşısa da '₺' ile yazılır ve tahsilat toplamını karma yapmaz", () => {
    openFinance(
      [
        tahsilat("c1", 1000, "USD"),
        { id: "m1", type: "MASRAF_YAPILAN", amount: 300, date: "2026-03-02", description: "Tebligat gideri", currency: "EUR" },
      ],
      "USD",
      ACTUAL_EXPENSE_CONNECTED,
    );

    expect(total()).toBe("1.000 USD");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 USD", "Tebligat gideri | -300 ₺"]);
  });
});

describe("Finans sekmesi — TL dosyada gösterim DEĞİŞMEDİ (düzeltme öncesi ölçülen metinle birebir)", () => {
  it("TRY tahsilat: '1.000 ₺' ve '+1.000 ₺'", () => {
    openFinance([tahsilat("c1", 1000, "TRY")], "TRY");

    expect(total()).toBe("1.000 ₺");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    const cards = Array.from(collectionCard().parentElement?.children ?? []).map((card) => norm(card.textContent));
    // Tahsilat ve Masraf Talebi kartları önceki metinle aynı. Veri kaynağına bağlı olmayan iki kart artık "0 ₺" yazmaz
    // (bkz. operation-deck-unconnected-sources.test.tsx).
    expect(cards).toEqual([
      "Tahsilat1.000 ₺",
      "Yapılan MasrafBu bilgi henüz bu ekrana bağlanmadı",
      "Masraf Talebi0 ₺Ödenen: 0 ₺",
      "Müvekkil BakiyeBu bilgi henüz bu ekrana bağlanmadı",
    ]);
  });

  it("bekleyen TRY tahsilat: önceki metinle aynı", () => {
    openFinance([tahsilat("c1", 1000, "TRY"), tahsilat("c2", 1500, "TRY", { allocationHeld: true })], "TRY");

    expect(total()).toBe("1.000 ₺");
    expect(held()).toBe("Mahsubu bekleyen: 1.500 ₺ (borçtan düşülmedi)");
    expect(recentRows()).toEqual(["Tahsilat c1 | +1.000 ₺", "Tahsilat c2mahsubu bekliyor | 1.500 ₺"]);
  });

  it("para birimi alanı ve dosya para birimi verilmeyen çağrı (eski biçim) şema varsayılanı TRY sayılır", () => {
    openFinance([tahsilat("c1", 200), tahsilat("c2", 50.25, null)]);

    expect(total()).toBe("250,25 ₺");
    expect(recentRows()).toEqual(["Tahsilat c1 | +200 ₺", "Tahsilat c2 | +50,25 ₺"]);
  });

  it("tahsilat yokken ve dosya para birimi verilmemişken '0 ₺'", () => {
    openFinance([]);

    expect(total()).toBe("0 ₺");
  });
});

// ─── Dağıtım & Mutabakat ────────────────────────────────────────────────────────────────────────────────────────────

function dispositionRecord(id: string, type: string, amount: number, currency: string | undefined, status: string, description: string) {
  return {
    id,
    type,
    description,
    amount,
    createdAt: "2026-03-01T10:00:00.000Z",
    relatedRequestId: `collection-${id}`,
    disposition: {
      id,
      collectionId: `collection-${id}`,
      status,
      totalAmount: String(amount),
      ...(currency ? { currency } : {}),
      beneficiaryScope: "SINGLE_CASE_CLIENT",
      caseClientId: null,
      manualReversalRequiredAt: null,
      allocationHeld: false,
    },
  } as any;
}

function openAccounting(records: any[]) {
  render(<OperationDeck caseId="case-1" muhasebeKayitlari={records} />);
  fireEvent.click(screen.getByRole("button", { name: /Dağıtım & Mutabakat/ }));
}

/** Açıklaması verilen dağıtım kaydının tutar satırı (açıklamanın hemen altındaki paragraf). */
function recordAmount(description: string): string {
  const amount = screen.getByText(description).nextElementSibling;
  if (!amount || amount.tagName !== "P") throw new Error(`"${description}" kaydının tutar satırı bulunamadı`);
  return norm(amount.textContent);
}

describe("Dağıtım & Mutabakat — dağıtım kaydı tutarı kaydın kendi para birimiyle", () => {
  it("USD dağıtım kaydı: bekleyen '1.000 USD', kesinleşen '+400 USD'", () => {
    openAccounting([
      dispositionRecord("disp-1", "DAGITIM_BEKLIYOR", 1000, "USD", "HELD_PENDING_DISTRIBUTION", "Bekleyen dağıtım"),
      dispositionRecord("disp-2", "ODEME_ALINDI", 400, "USD", "POSTED", "Kesinleşen dağıtım"),
    ]);

    expect(recordAmount("Bekleyen dağıtım")).toBe("1.000 USD");
    expect(recordAmount("Kesinleşen dağıtım")).toBe("+400 USD");
  });

  it("farklı para birimli kayıtlar yan yana: her biri kendi para birimiyle", () => {
    openAccounting([
      dispositionRecord("disp-1", "DAGITIM_BEKLIYOR", 1000, "USD", "HELD_PENDING_DISTRIBUTION", "USD dağıtım"),
      dispositionRecord("disp-2", "ODEME_ALINDI", 300, "EUR", "POSTED", "EUR dağıtım"),
      dispositionRecord("disp-3", "ODEME_ALINDI", 500, "TRY", "POSTED", "TRY dağıtım"),
    ]);

    expect(recordAmount("USD dağıtım")).toBe("1.000 USD");
    expect(recordAmount("EUR dağıtım")).toBe("+300 EUR");
    expect(recordAmount("TRY dağıtım")).toBe("+500 ₺");
  });

  it("TL dosyada gösterim DEĞİŞMEDİ: '1.000 ₺' ve '+400 ₺'", () => {
    openAccounting([
      dispositionRecord("disp-1", "DAGITIM_BEKLIYOR", 1000, "TRY", "HELD_PENDING_DISTRIBUTION", "Bekleyen dağıtım"),
      dispositionRecord("disp-2", "ODEME_ALINDI", 400, "TRY", "POSTED", "Kesinleşen dağıtım"),
    ]);

    expect(recordAmount("Bekleyen dağıtım")).toBe("1.000 ₺");
    expect(recordAmount("Kesinleşen dağıtım")).toBe("+400 ₺");
  });

  it("para birimi taşımayan kayıt (dağıtım bilgisi olmayan ya da alansız) önceki gibi '₺' ile yazılır", () => {
    openAccounting([
      dispositionRecord("disp-1", "ODEME_ALINDI", 400, undefined, "POSTED", "Alansız dağıtım"),
      { id: "rec-1", type: "MASRAF_TALEBI_GONDERILDI", description: "Masraf talebi gönderildi", amount: 250, createdAt: "2026-03-01T10:00:00.000Z" },
    ]);

    expect(recordAmount("Alansız dağıtım")).toBe("+400 ₺");
    expect(recordAmount("Masraf talebi gönderildi")).toBe("250 ₺");
  });
});
