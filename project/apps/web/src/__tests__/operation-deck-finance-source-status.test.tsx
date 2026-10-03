import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationDeck } from "@/components/case-detail/OperationDeck";
import type { FinanceSourceStatus } from "@/lib/operation-deck-finance-sources";

/**
 * OperationDeck "Finans" sekmesi — gerçek kaynağa BAĞLI alanlar (tahsilat, masraf talebi) okunmadan / okunamamışken
 * sıfır ya da "kayıt yok" yazmaz.
 *
 * Kusur (sayfa düzeyinde ölçüldü, main 6681b1d5 ve 8727e5d2): tahsilat okuması sürerken, hata verdiğinde ve gerçekten
 * kayıt yokken sekme aynı metni yazıyordu — "Tahsilat 0 ₺ · Masraf Talebi 0 ₺ Ödenen: 0 ₺ · Henüz tahsilat yok".
 * Sunucuda 1.000 ₺ tahsilat ve 750 ₺ masraf talebi olan dosyada da okuma bitmeden / düşünce aynı sıfırlar yazılıyordu.
 *
 * Kural (owner kararı 2026-10-02): iki kaynağın durumu AYRI taşınır.
 *   - İlk okuma tamamlanmadan READY / boş / 0 kabul edilmez: kartta "Yükleniyor…", hatada "Bu bilgi okunamadı".
 *   - Liste açıklaması kaynağı adıyla söyler: "Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez."
 *   - Okuma düştüğünde sekmede ilgili kaynağı yeniden okuyan "Tekrar dene" bulunur.
 *   - Son başarılı veri ekranda kalıyorsa güncel / hatasızmış gibi sunulmaz: "Güncelleniyor…" /
 *     "Güncellenemedi; son başarılı veri gösteriliyor".
 *   - Başarılı okuma gerçekten boşsa önceki sıfır ve boş liste gösterimi aynen kalır.
 * Bu karar, Finans sekmesinde okuma hatasında "0 ₺ + üstte hata bandı" kabulünün (WSMR-A4-AB-2) yerine geçer.
 */

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

type DeckProps = React.ComponentProps<typeof OperationDeck>;
type FinanceItems = NonNullable<DeckProps["financeItems"]>;

const CARD_TEXT = {
  NOT_CONNECTED: "Bu bilgi henüz bu ekrana bağlanmadı",
  LOADING: "Yükleniyor…",
  ERROR: "Bu bilgi okunamadı",
} as const;
const REFRESH_NOTE = {
  REFRESHING: "Güncelleniyor…",
  REFRESH_FAILED: "Güncellenemedi; son başarılı veri gösteriliyor",
} as const;
const NO_DATA: Array<keyof typeof CARD_TEXT> = ["NOT_CONNECTED", "LOADING", "ERROR"];
const STALE: Array<keyof typeof REFRESH_NOTE> = ["REFRESHING", "REFRESH_FAILED"];

const tahsilat = (id: string, amount: number, currency = "TRY", extra: Partial<FinanceItems[number]> = {}): FinanceItems[number] => ({
  id,
  type: "TAHSILAT",
  amount,
  date: "2026-03-01",
  description: `Tahsilat ${id}`,
  currency,
  ...extra,
});

const masrafTalebi = (id: string, amount: number, paidAmount: number): FinanceItems[number] => ({
  id,
  type: "MASRAF_TALEP",
  amount,
  date: "2026-02-01",
  description: "Takip Açılış Masrafları",
  status: paidAmount > 0 ? "PARTIAL" : "PENDING",
  paidAmount,
});

const masraf = (id: string, amount: number, description: string): FinanceItems[number] => ({
  id,
  type: "MASRAF_YAPILAN",
  amount,
  date: "2026-02-10",
  description,
});

/** Sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). Tek değilse hata fırlatır. */
function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole("button").filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

function openFinance(props: Partial<DeckProps> = {}) {
  const view = render(<OperationDeck caseId="case-1" {...props} />);
  fireEvent.click(deckTab("Finans"));
  return view;
}

/** Finans sekmesinin içeriği (kart ızgarası + bölümler). */
function financePanel(): HTMLElement {
  const panel = screen.getByText("Son İşlemler").parentElement?.parentElement;
  if (!panel) throw new Error("Finans sekmesi açık değil");
  return panel;
}

/** Dört özet kartı: başlığa göre kartın tam metni. Kart sayısı dört değilse hata fırlatır. */
function financeCards(): Record<"Tahsilat" | "Yapılan Masraf" | "Masraf Talebi" | "Müvekkil Bakiye", string> {
  const grid = financePanel().children[0];
  const cards = Array.from(grid.children).map((card) => norm(card.textContent));
  if (cards.length !== 4) throw new Error(`Finans sekmesinde 4 kart bekleniyordu: ${cards.length}`);
  return { Tahsilat: cards[0], "Yapılan Masraf": cards[1], "Masraf Talebi": cards[2], "Müvekkil Bakiye": cards[3] };
}

/** "Son İşlemler" listesi: hareket satırı "açıklama | tutar", boş durumda metnin kendisi. */
function recentList(): string[] {
  const list = screen.getByText("Son İşlemler").nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  return Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
}

/** "Masraf Talepleri" bölümü: yoksa null; varsa listelenen talep açıklamaları. */
function expenseRequestSection(): string[] | null {
  const heading = Array.from(financePanel().querySelectorAll("p")).find((p) => norm(p.textContent) === "Masraf Talepleri");
  if (!heading?.parentElement) return null;
  return Array.from(heading.parentElement.querySelectorAll("span.text-sm.font-medium")).map((el) => norm(el.textContent));
}

const noticeText = (testId: string) => {
  const notice = screen.queryByTestId(testId);
  if (!notice) return null;
  const retry = notice.querySelector("button");
  return norm(retry ? notice.textContent?.replace(retry.textContent ?? "", "") : notice.textContent);
};
const statusOf = (testId: string) => screen.getByTestId(testId).getAttribute("data-source-status");

const COLLECTION_NOTICE = "finance-recent-collections-notice";
const EXPENSE_NOTICE = "finance-expense-requests-notice";

// =================================================================================================================
// Tahsilat
// =================================================================================================================

describe('"Tahsilat" kartı — okunmamış / okunamamış kaynak sıfır yazmaz', () => {
  it.each(NO_DATA)("%s: sayı yazılmaz, durumun kendisi yazılır; kart nötr renkte", (status) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(financeCards().Tahsilat).toBe(`Tahsilat${CARD_TEXT[status]}`);
    expect(financeCards().Tahsilat).not.toMatch(/\d/);
    const notice = screen.getByTestId("finance-collection-source-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe(status);
    expect(notice.className).not.toMatch(/emerald|red|green|amber/);
    expect(notice.parentElement?.className).not.toMatch(/emerald|red|green|amber/);
    expect(screen.queryByTestId("finance-collection-total")).toBeNull();
    expect(screen.queryByTestId("finance-collection-total-unavailable")).toBeNull();
    expect(screen.queryByTestId("finance-collection-held")).toBeNull();
  });

  it("durum verilmezse (varsayılan) kaynak okunmuş sayılmaz: 'bağlanmadı' yazılır, sayı yazılmaz", () => {
    openFinance({ financeItems: [tahsilat("c1", 1000)] });

    expect(financeCards().Tahsilat).toBe(`Tahsilat${CARD_TEXT.NOT_CONNECTED}`);
    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi${CARD_TEXT.NOT_CONNECTED}`);
    expect(recentList()).toEqual([]);
  });

  it.each(["LOADING", "ERROR"] as const)("dövizli dosyada %s: '0 USD' yazılmaz", (status) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", caseCurrency: "USD" });

    expect(financeCards().Tahsilat).toBe(`Tahsilat${CARD_TEXT[status]}`);
    expect(norm(financePanel().textContent)).not.toContain("USD");
  });

  it("GERÇEK SIFIR: kaynak READY ve tahsilat yoksa önceki gösterim aynen — '0 ₺' ve 'Henüz tahsilat yok'", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY", caseCurrency: "TRY" });

    expect(financeCards().Tahsilat).toBe("Tahsilat0 ₺");
    expect(recentList()).toEqual(["Henüz tahsilat yok"]);
    expect(screen.queryByTestId("finance-collection-source-unavailable")).toBeNull();
    expect(screen.queryByTestId("finance-collection-refresh")).toBeNull();
    expect(screen.queryByTestId(COLLECTION_NOTICE)).toBeNull();
  });

  it("GERÇEK SIFIR, dövizli dosya: READY iken '0 USD' yazılır (#2875 kuralı korunur)", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY", caseCurrency: "USD" });
    expect(financeCards().Tahsilat).toBe("Tahsilat0 USD");
  });

  it("kaynak READY: toplam ve satır yazılır, durum notu yok", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(financeCards().Tahsilat).toBe("Tahsilat1.000 ₺");
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    expect(screen.queryByTestId("finance-collection-refresh")).toBeNull();
    expect(screen.queryByTestId(COLLECTION_NOTICE)).toBeNull();
  });
});

describe('"Tahsilat" — son başarılı veri güncel / hatasızmış gibi sunulmaz', () => {
  it.each(STALE)("%s: son başarılı tutar kalır, yanında durumu yazılır", (status) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(norm(screen.getByTestId("finance-collection-total").textContent)).toBe("1.000 ₺");
    expect(norm(screen.getByTestId("finance-collection-refresh").textContent)).toBe(REFRESH_NOTE[status]);
    expect(statusOf("finance-collection-refresh")).toBe(status);
    expect(financeCards().Tahsilat).toBe(`Tahsilat1.000 ₺${REFRESH_NOTE[status]}`);
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
  });

  it.each(STALE)("%s + son başarılı okuma boştu: '0 ₺' ve 'Henüz tahsilat yok' durum notuyla birlikte yazılır", (status) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY" });

    expect(financeCards().Tahsilat).toBe(`Tahsilat0 ₺${REFRESH_NOTE[status]}`);
    expect(recentList()).toEqual(["Henüz tahsilat yok"]);
    expect(noticeText(COLLECTION_NOTICE)).not.toBeNull();
  });

  it("farklı para birimli tahsilatta REFRESH_FAILED: toplam yine 'gösterilemez' (#2875), durum notu eklenir", () => {
    openFinance({
      collectionsSource: "REFRESH_FAILED",
      expenseRequestsSource: "READY",
      caseCurrency: "USD",
      financeItems: [tahsilat("c1", 1000, "USD"), tahsilat("c2", 500, "TRY")],
    });

    expect(norm(screen.getByTestId("finance-collection-total-unavailable").textContent)).toBe("gösterilemez");
    expect(financeCards().Tahsilat).toBe(`Tahsilat (farklı para birimleri)gösterilemez${REFRESH_NOTE.REFRESH_FAILED}`);
    expect(financeCards().Tahsilat).not.toContain("1.500");
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 USD", "Tahsilat c2 | +500 ₺"]);
  });

  it("mahsubu bekleyen tahsilat satırı REFRESHING iken de ayrı yazılır", () => {
    openFinance({
      collectionsSource: "REFRESHING",
      expenseRequestsSource: "READY",
      financeItems: [tahsilat("c1", 1000), tahsilat("c2", 1500, "TRY", { allocationHeld: true })],
    });

    expect(financeCards().Tahsilat).toBe(
      `Tahsilat1.000 ₺Mahsubu bekleyen: 1.500 ₺ (borçtan düşülmedi)${REFRESH_NOTE.REFRESHING}`,
    );
  });
});

describe('"Son İşlemler" — tahsilatlar okunmadıkça "tahsilat yok" denmez', () => {
  it.each([
    ["NOT_CONNECTED", "Tahsilatlar henüz bu ekrana bağlanmadı. Bu, tahsilat bulunmadığı anlamına gelmez."],
    ["LOADING", "Tahsilatlar yükleniyor…"],
    ["ERROR", "Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez."],
  ] as const)("%s: 'Henüz tahsilat yok' yazılmaz; açıklama kaynağı adıyla söyler", (status, text) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY" });

    expect(recentList()).toEqual([]);
    expect(screen.queryByText("Henüz tahsilat yok")).toBeNull();
    expect(screen.queryByText("Henüz işlem yok")).toBeNull();
    expect(noticeText(COLLECTION_NOTICE)).toBe(text);
    expect(statusOf(COLLECTION_NOTICE)).toBe(status);
  });

  it.each(NO_DATA)("%s iken verilen tahsilat satırı listelenmez (başka okumanın satırı sızmaz)", (status) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(recentList()).toEqual([]);
    expect(norm(financePanel().textContent)).not.toContain("1.000");
  });

  it.each([
    ["REFRESHING", "Tahsilatlar güncelleniyor…"],
    ["REFRESH_FAILED", "Tahsilatlar güncellenemedi; son başarılı veri gösteriliyor."],
  ] as const)("%s: satırlar kalır, açıklama verinin güncel olmadığını söyler", (status, text) => {
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    expect(noticeText(COLLECTION_NOTICE)).toBe(text);
    expect(statusOf(COLLECTION_NOTICE)).toBe(status);
  });

  it("yapılan masraf notu (bağlanmamış kaynak) tahsilat açıklamasıyla birlikte yazılır; biri diğerinin yerine geçmez", () => {
    openFinance({ collectionsSource: "ERROR", expenseRequestsSource: "READY" });

    expect(noticeText(COLLECTION_NOTICE)).toBe("Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez.");
    expect(norm(screen.getByTestId("finance-recent-actual-expense-unavailable").textContent)).toBe(
      "Yapılan masraf hareketleri henüz bu ekrana bağlanmadı; bu liste yalnız tahsilatları gösterir.",
    );
  });

  it("tahsilat okunmamış, yapılan masraf kaynağı READY: masraf satırı listelenir, 'işlem yok' denmez", () => {
    openFinance({
      collectionsSource: "LOADING",
      expenseRequestsSource: "READY",
      actualExpenseSource: "READY",
      financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu")],
    });

    expect(recentList()).toEqual(["Haciz yolluğu | -350 ₺"]);
    expect(noticeText(COLLECTION_NOTICE)).toBe("Tahsilatlar yükleniyor…");
  });

  it("iki kaynak da READY ve hiç hareket yoksa 'Henüz işlem yok' (önceki gösterim)", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY", actualExpenseSource: "READY" });
    expect(recentList()).toEqual(["Henüz işlem yok"]);
  });
});

describe('"Tekrar dene" — yalnız okuma düştüğünde, ilgili kaynak için', () => {
  it.each(["ERROR", "REFRESH_FAILED"] as const)("tahsilat %s: düğme çizilir ve tahsilat işleyicisini bir kez çağırır", (status) => {
    const onRetryCollections = vi.fn();
    const onRetryExpenseRequests = vi.fn();
    openFinance({ collectionsSource: status, expenseRequestsSource: "READY", onRetryCollections, onRetryExpenseRequests });

    const button = screen.getByTestId("finance-collections-retry");
    expect(norm(button.textContent)).toBe("Tekrar dene");
    fireEvent.click(button);
    expect(onRetryCollections).toHaveBeenCalledTimes(1);
    expect(onRetryCollections).toHaveBeenCalledWith();
    expect(onRetryExpenseRequests).not.toHaveBeenCalled();
  });

  it.each(["ERROR", "REFRESH_FAILED"] as const)("masraf talebi %s: düğme masraf talebi işleyicisini çağırır", (status) => {
    const onRetryCollections = vi.fn();
    const onRetryExpenseRequests = vi.fn();
    openFinance({ collectionsSource: "READY", expenseRequestsSource: status, onRetryCollections, onRetryExpenseRequests });

    fireEvent.click(screen.getByTestId("finance-expense-requests-retry"));
    expect(onRetryExpenseRequests).toHaveBeenCalledTimes(1);
    expect(onRetryExpenseRequests).toHaveBeenCalledWith();
    expect(onRetryCollections).not.toHaveBeenCalled();
  });

  it.each(["NOT_CONNECTED", "LOADING", "REFRESHING", "READY"] as const)("%s: düğme çizilmez", (status) => {
    openFinance({
      collectionsSource: status,
      expenseRequestsSource: status,
      onRetryCollections: vi.fn(),
      onRetryExpenseRequests: vi.fn(),
    });

    expect(screen.queryByTestId("finance-collections-retry")).toBeNull();
    expect(screen.queryByTestId("finance-expense-requests-retry")).toBeNull();
  });

  it("işleyici verilmemişse işlem yapmayan düğme çizilmez; açıklama yine yazılır", () => {
    openFinance({ collectionsSource: "ERROR", expenseRequestsSource: "ERROR" });

    expect(screen.queryByTestId("finance-collections-retry")).toBeNull();
    expect(screen.queryByTestId("finance-expense-requests-retry")).toBeNull();
    expect(noticeText(COLLECTION_NOTICE)).toBe("Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez.");
  });
});

// =================================================================================================================
// Masraf talebi
// =================================================================================================================

describe('"Masraf Talebi" kartı ve "Masraf Talepleri" bölümü — okunmamış / okunamamış kaynak sıfır yazmaz', () => {
  it.each(NO_DATA)("%s: toplam ve 'Ödenen' yazılmaz; verilen talep listelenmez", (status) => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: status, financeItems: [masrafTalebi("t1", 750, 250)] });

    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi${CARD_TEXT[status]}`);
    expect(financeCards()["Masraf Talebi"]).not.toMatch(/\d/);
    expect(financeCards()["Masraf Talebi"]).not.toContain("Ödenen");
    const notice = screen.getByTestId("finance-expense-request-source-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe(status);
    expect(notice.parentElement?.className).not.toMatch(/emerald|red|green|amber/);
    expect(screen.queryByTestId("finance-expense-request-total")).toBeNull();
    expect(expenseRequestSection()).toEqual([]);
    expect(norm(financePanel().textContent)).not.toContain("750");
  });

  it.each([
    ["NOT_CONNECTED", "Masraf talepleri henüz bu ekrana bağlanmadı. Bu, masraf talebi bulunmadığı anlamına gelmez."],
    ["LOADING", "Masraf talepleri yükleniyor…"],
    ["ERROR", "Masraf talepleri okunamadı. Bu, masraf talebi bulunmadığı anlamına gelmez."],
  ] as const)("%s: bölüm 'talep yok' gibi gizlenmez; açıklama kaynağı adıyla söyler", (status, text) => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: status });

    expect(expenseRequestSection()).toEqual([]);
    expect(noticeText(EXPENSE_NOTICE)).toBe(text);
    expect(statusOf(EXPENSE_NOTICE)).toBe(status);
  });

  it("GERÇEK SIFIR: kaynak READY ve talep yoksa önceki gösterim aynen — '0 ₺ / Ödenen: 0 ₺', bölüm çizilmez", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY" });

    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi0 ₺Ödenen: 0 ₺");
    expect(expenseRequestSection()).toBeNull();
    expect(screen.queryByTestId(EXPENSE_NOTICE)).toBeNull();
    expect(screen.queryByTestId("finance-expense-request-refresh")).toBeNull();
  });

  it("kaynak READY: toplam, ödenen ve talep listesi yazılır; durum notu yok", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "READY", financeItems: [masrafTalebi("t1", 750, 250)] });

    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi750 ₺Ödenen: 250 ₺");
    expect(norm(screen.getByTestId("finance-expense-request-total").textContent)).toBe("750 ₺");
    expect(expenseRequestSection()).toEqual(["Takip Açılış Masrafları"]);
    expect(screen.queryByTestId(EXPENSE_NOTICE)).toBeNull();
  });

  it.each([
    ["REFRESHING", "Masraf talepleri güncelleniyor…"],
    ["REFRESH_FAILED", "Masraf talepleri güncellenemedi; son başarılı veri gösteriliyor."],
  ] as const)("%s: son başarılı tutar ve liste kalır, durumu kartta ve açıklamada yazılır", (status, text) => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: status, financeItems: [masrafTalebi("t1", 750, 250)] });

    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi750 ₺Ödenen: 250 ₺${REFRESH_NOTE[status]}`);
    expect(statusOf("finance-expense-request-refresh")).toBe(status);
    expect(expenseRequestSection()).toEqual(["Takip Açılış Masrafları"]);
    expect(noticeText(EXPENSE_NOTICE)).toBe(text);
  });

  it.each(STALE)("%s + son başarılı okuma boştu: '0 ₺' durum notuyla yazılır, bölüm açıklamasıyla çizilir", (status) => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: status });

    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi0 ₺Ödenen: 0 ₺${REFRESH_NOTE[status]}`);
    expect(expenseRequestSection()).toEqual([]);
    expect(noticeText(EXPENSE_NOTICE)).not.toBeNull();
  });
});

// =================================================================================================================
// İki kaynak birbirinden bağımsız
// =================================================================================================================

describe("Tahsilat ve masraf talebi kaynakları AYRI durum taşır", () => {
  const items = [tahsilat("c1", 1000), masrafTalebi("t1", 750, 250)];

  it("tahsilat okundu, masraf talebi okunamadı: tahsilat yazılır, masraf talebi yazılmaz", () => {
    openFinance({ collectionsSource: "READY", expenseRequestsSource: "ERROR", financeItems: items });

    expect(financeCards().Tahsilat).toBe("Tahsilat1.000 ₺");
    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi${CARD_TEXT.ERROR}`);
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    expect(screen.queryByTestId(COLLECTION_NOTICE)).toBeNull();
    expect(noticeText(EXPENSE_NOTICE)).toBe("Masraf talepleri okunamadı. Bu, masraf talebi bulunmadığı anlamına gelmez.");
  });

  it("masraf talebi okundu, tahsilat yükleniyor: masraf talebi yazılır, tahsilat yazılmaz", () => {
    openFinance({ collectionsSource: "LOADING", expenseRequestsSource: "READY", financeItems: items });

    expect(financeCards().Tahsilat).toBe(`Tahsilat${CARD_TEXT.LOADING}`);
    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi750 ₺Ödenen: 250 ₺");
    expect(expenseRequestSection()).toEqual(["Takip Açılış Masrafları"]);
    expect(recentList()).toEqual([]);
    expect(screen.queryByTestId(EXPENSE_NOTICE)).toBeNull();
  });

  it("bağlanmamış kartlar (Yapılan Masraf, Müvekkil Bakiye) bağlı kaynakların durumundan etkilenmez", () => {
    openFinance({ collectionsSource: "ERROR", expenseRequestsSource: "LOADING", financeItems: items });

    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${CARD_TEXT.NOT_CONNECTED}`);
    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${CARD_TEXT.NOT_CONNECTED}`);
  });
});

// =================================================================================================================
// Tip dışı durum
// =================================================================================================================

describe("Tip dışı durum güvenli tarafa düşer — sayı yazılmaz, sekme çökmez", () => {
  it.each([
    [null, CARD_TEXT.NOT_CONNECTED],
    ["ready", CARD_TEXT.ERROR],
    ["", CARD_TEXT.ERROR],
    [1, CARD_TEXT.ERROR],
  ])("durum %j: '%s'", (status, text) => {
    openFinance({
      collectionsSource: status as unknown as FinanceSourceStatus,
      expenseRequestsSource: status as unknown as FinanceSourceStatus,
      financeItems: [tahsilat("c1", 1000), masrafTalebi("t1", 750, 250)],
    });

    expect(financeCards().Tahsilat).toBe(`Tahsilat${text}`);
    expect(financeCards()["Masraf Talebi"]).toBe(`Masraf Talebi${text}`);
    expect(norm(financePanel().textContent)).not.toMatch(/1\.000|750|250/);
    expect(noticeText(COLLECTION_NOTICE)).not.toBeNull();
    expect(noticeText(EXPENSE_NOTICE)).not.toBeNull();
  });
});
