import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationDeck, type OperationDeckSourceStatus } from "@/components/case-detail/OperationDeck";

/**
 * OperationDeck — veri kaynağına BAĞLI OLMAYAN alan sıfır ya da "kayıt yok" yazmaz.
 *
 * Kusur (gerçek tarayıcıda ölçüldü, main ea3c1156 / 4915fc57; yerel API + disposable PostgreSQL): dosya detay sayfası
 * bileşene sabit `clientBalance={0}`, `uyapQueries={[]}`, `relatedCases={[]}` veriyor, yapılan masraf satırı hiç
 * vermiyordu. Sunucuda masraf/avans bakiyesi 1.150, masraf düşümü 850, müvekkile ödenecek 600 olan dosyada ekran
 * "Yapılan Masraf 0 ₺ · Müvekkil Bakiye 0 ₺ (yeşil)" yazıyor; hiç mali hareketi olmayan dosyayla aynı metin ve renk.
 * "UYAP Sorgu" sekmesi borçlunun iki bekleyen sorgusu varken "Henüz sorgu yapılmamış" diyor ve beş "Hızlı Sorgu"
 * düğmesi basılınca hiçbir şey yapmıyordu; "İlişkili" sekmesi "İlişkili dosya yok" diyordu.
 *
 * Kural (owner kararı 2026-10-01; bakiye tanımı / masraf kapsamı / kur politikası SEÇİLMEDİ): bir alan üç ayrı
 * durumda olabilir ve ekran bunları karıştırmaz —
 *   1. veri bağlantısı yok (NOT_CONNECTED): sayı ya da "kayıt yok" yazılmaz, bağlantının hazır olmadığı yazılır;
 *   2. gerçek sıfır / gerçek boş (READY): kaynak okundu, değer 0 ya da liste boş — "0 ₺" / "kayıt yok" yazılır;
 *   3. yükleme / hata (LOADING / ERROR): kaynak bağlı ama değer yok — sayı ya da "kayıt yok" yazılmaz.
 * Gerçek kaynağa bağlı tahsilat ve masraf talebi, kaynakları OKUNMUŞKEN (READY) önceki gibi gösterilir; bu dosyadaki
 * düzenek o iki kaynağı READY verir. Okunmamış / okunamamış hâlleri: `operation-deck-finance-source-status.test.tsx`.
 */

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

type DeckProps = React.ComponentProps<typeof OperationDeck>;
type FinanceItems = NonNullable<DeckProps["financeItems"]>;

const NOT_CONNECTED_CARD = "Bu bilgi henüz bu ekrana bağlanmadı";
const UNAVAILABLE: OperationDeckSourceStatus[] = ["NOT_CONNECTED", "LOADING", "ERROR"];

function renderDeck(props: Partial<DeckProps> = {}) {
  return render(<OperationDeck caseId="case-1" collectionsSource="READY" expenseRequestsSource="READY" {...props} />);
}

/** Sekme düğmesi: yazısı etiketin kendisi (+ varsa rozet sayısı). Tek değilse hata fırlatır. */
function deckTab(label: string): HTMLElement {
  const hits = screen.getAllByRole("button").filter((b) => new RegExp(`^${label}(\\d+)?$`).test(norm(b.textContent)));
  if (hits.length !== 1) throw new Error(`"${label}" sekme düğmesi tek değil: ${hits.length}`);
  return hits[0];
}

const badgeOf = (label: string) => norm(deckTab(label).textContent).slice(label.length) || null;

function openFinance(props: Partial<DeckProps> = {}) {
  renderDeck(props);
  fireEvent.click(deckTab("Finans"));
}

/** Finans sekmesindeki dört özet kartı: başlığa göre kartın tam metni. Kart bulunamazsa hata fırlatır. */
function financeCards(): Record<string, string> {
  const grid = screen.getByTestId("finance-collection-total").parentElement?.parentElement;
  if (!grid) throw new Error("Finans kart ızgarası bulunamadı");
  const cards = Array.from(grid.children).map((card) => norm(card.textContent));
  if (cards.length !== 4) throw new Error(`Finans sekmesinde 4 kart bekleniyordu: ${cards.length}`);
  return {
    Tahsilat: cards[0],
    "Yapılan Masraf": cards[1],
    "Masraf Talebi": cards[2],
    "Müvekkil Bakiye": cards[3],
  };
}

/** "Son İşlemler" listesi: hareket satırı "açıklama | tutar" (tarih saat dilimine bağlı — okunmaz), boş durumda metnin kendisi. */
function recentList(): string[] {
  const list = screen.getByText("Son İşlemler").nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  return Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
}

const tahsilat = (id: string, amount: number, currency = "TRY"): FinanceItems[number] => ({
  id,
  type: "TAHSILAT",
  amount,
  date: "2026-03-01",
  description: `Tahsilat ${id}`,
  currency,
});

const masraf = (id: string, amount: number, description: string): FinanceItems[number] => ({
  id,
  type: "MASRAF_YAPILAN",
  amount,
  date: "2026-02-10",
  description,
});

const masrafTalebi: FinanceItems[number] = {
  id: "t1",
  type: "MASRAF_TALEP",
  amount: 1431.1,
  date: "2026-02-01",
  description: "Takip Açılış Masrafları",
  status: "PENDING",
  paidAmount: 0,
};

// =================================================================================================================
// "Müvekkil Bakiye" kartı
// =================================================================================================================

describe('"Müvekkil Bakiye" kartı — bağlantı yok / gerçek sıfır / yükleme-hata ayrıdır', () => {
  it("VERİ BAĞLANTISI YOK (varsayılan): sayı yazılmaz, olumlu / olumsuz renk yok", () => {
    openFinance();

    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${NOT_CONNECTED_CARD}`);
    const notice = screen.getByTestId("finance-client-balance-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(notice.className).not.toMatch(/emerald|red|green/);
    expect(screen.queryByTestId("finance-client-balance")).toBeNull();
    expect(financeCards()["Müvekkil Bakiye"]).not.toMatch(/\d/);
  });

  it("değer verilse bile kaynak READY değilse yazılmaz (bağlanmamış alana sayı sızmaz)", () => {
    openFinance({ clientBalance: 0 });
    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${NOT_CONNECTED_CARD}`);
  });

  it("GERÇEK SIFIR: kaynak READY ve değer 0 ise '0 ₺' yazılır", () => {
    openFinance({ clientBalanceSource: "READY", clientBalance: 0 });

    expect(financeCards()["Müvekkil Bakiye"]).toBe("Müvekkil Bakiye0 ₺");
    expect(norm(screen.getByTestId("finance-client-balance").textContent)).toBe("0 ₺");
    expect(screen.queryByTestId("finance-client-balance-unavailable")).toBeNull();
  });

  it.each([
    [581.1, "581,1 ₺", "text-emerald-700"],
    [-250, "-250 ₺", "text-red-700"],
  ])("kaynak READY: %s → '%s'", (value, text, colorClass) => {
    openFinance({ clientBalanceSource: "READY", clientBalance: value });

    const shown = screen.getByTestId("finance-client-balance");
    expect(norm(shown.textContent)).toBe(text);
    expect(shown.className).toContain(colorClass);
  });

  it.each([
    ["LOADING", "Yükleniyor…"],
    ["ERROR", "Bu bilgi okunamadı"],
  ] as const)("YÜKLEME / HATA (%s): sayı yazılmaz, '%s' yazılır — bağlantı yok metniyle karışmaz", (status, text) => {
    openFinance({ clientBalanceSource: status, clientBalance: 600 });

    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${text}`);
    expect(screen.getByTestId("finance-client-balance-unavailable").getAttribute("data-source-status")).toBe(status);
    expect(financeCards()["Müvekkil Bakiye"]).not.toContain(NOT_CONNECTED_CARD);
    expect(financeCards()["Müvekkil Bakiye"]).not.toMatch(/\d/);
  });

  it.each([[undefined], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "READY denmiş ama geçerli sayı yoksa (%s) sıfır yazılmaz: 'okunamadı'",
    (value) => {
      openFinance({ clientBalanceSource: "READY", clientBalance: value });

      expect(financeCards()["Müvekkil Bakiye"]).toBe("Müvekkil BakiyeBu bilgi okunamadı");
      expect(screen.getByTestId("finance-client-balance-unavailable").getAttribute("data-source-status")).toBe("ERROR");
    },
  );
});

// =================================================================================================================
// "Yapılan Masraf" kartı ve "Son İşlemler"
// =================================================================================================================

describe('"Yapılan Masraf" kartı — bağlantı yok / gerçek sıfır / yükleme-hata ayrıdır', () => {
  it("VERİ BAĞLANTISI YOK (varsayılan): sayı yazılmaz; kart nötr renkte", () => {
    openFinance({ financeItems: [tahsilat("c1", 1000)] });

    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${NOT_CONNECTED_CARD}`);
    const notice = screen.getByTestId("finance-actual-expense-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(notice.parentElement?.className).not.toMatch(/red|emerald|green/);
    expect(screen.queryByTestId("finance-actual-expense-total")).toBeNull();
  });

  it("GERÇEK SIFIR: kaynak READY ve masraf satırı yoksa '0 ₺' yazılır", () => {
    openFinance({ actualExpenseSource: "READY", financeItems: [tahsilat("c1", 1000)] });

    expect(financeCards()["Yapılan Masraf"]).toBe("Yapılan Masraf0 ₺");
    expect(screen.queryByTestId("finance-actual-expense-unavailable")).toBeNull();
  });

  it("kaynak READY: masraf satırları toplamı ve satırların kendisi yazılır", () => {
    openFinance({
      actualExpenseSource: "READY",
      financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu"), masraf("m2", 500, "Tebligat gideri")],
    });

    expect(norm(screen.getByTestId("finance-actual-expense-total").textContent)).toBe("850 ₺");
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺", "Haciz yolluğu | -350 ₺", "Tebligat gideri | -500 ₺"]);
    expect(screen.queryByTestId("finance-recent-actual-expense-unavailable")).toBeNull();
  });

  it.each([
    ["LOADING", "Yükleniyor…"],
    ["ERROR", "Bu bilgi okunamadı"],
  ] as const)("YÜKLEME / HATA (%s): sayı yazılmaz, '%s' yazılır — bağlantı yok metniyle karışmaz", (status, text) => {
    openFinance({ actualExpenseSource: status, financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu")] });

    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${text}`);
    expect(screen.getByTestId("finance-actual-expense-unavailable").getAttribute("data-source-status")).toBe(status);
    expect(financeCards()["Yapılan Masraf"]).not.toContain(NOT_CONNECTED_CARD);
    expect(financeCards()["Yapılan Masraf"]).not.toMatch(/\d/);
  });

  it.each(UNAVAILABLE)("kaynak %s iken verilen masraf satırı toplanmaz ve listelenmez", (status) => {
    openFinance({ actualExpenseSource: status, financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu")] });

    expect(financeCards()["Yapılan Masraf"]).not.toContain("350");
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
  });
});

describe('"Son İşlemler" — masraf hareketleri bağlı değilken liste "işlem yok" demez', () => {
  it("VERİ BAĞLANTISI YOK + tahsilat yok: 'Henüz tahsilat yok' ve masraf hareketlerinin bağlı olmadığı notu", () => {
    openFinance();

    expect(recentList()).toEqual(["Henüz tahsilat yok"]);
    expect(screen.queryByText("Henüz işlem yok")).toBeNull();
    const note = screen.getByTestId("finance-recent-actual-expense-unavailable");
    expect(norm(note.textContent)).toBe(
      "Yapılan masraf hareketleri henüz bu ekrana bağlanmadı; bu liste yalnız tahsilatları gösterir.",
    );
    expect(note.getAttribute("data-source-status")).toBe("NOT_CONNECTED");
  });

  it("VERİ BAĞLANTISI YOK + tahsilat var: tahsilat satırı aynen, not yine görünür", () => {
    openFinance({ financeItems: [tahsilat("c1", 1000, "USD")], caseCurrency: "USD" });

    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 USD"]);
    expect(screen.getByTestId("finance-recent-actual-expense-unavailable")).toBeInTheDocument();
  });

  it("GERÇEK BOŞ: kaynak READY ve hiç hareket yoksa 'Henüz işlem yok' yazılır, not yok", () => {
    openFinance({ actualExpenseSource: "READY" });

    expect(recentList()).toEqual(["Henüz işlem yok"]);
    expect(screen.queryByTestId("finance-recent-actual-expense-unavailable")).toBeNull();
  });

  it.each([
    ["LOADING", "Yapılan masraf hareketleri yükleniyor; bu liste şimdilik yalnız tahsilatları gösterir."],
    ["ERROR", "Yapılan masraf hareketleri okunamadı; bu liste yalnız tahsilatları gösterir."],
  ] as const)("YÜKLEME / HATA (%s): 'işlem yok' denmez; durumun kendisi yazılır", (status, text) => {
    openFinance({ actualExpenseSource: status });

    expect(recentList()).toEqual(["Henüz tahsilat yok"]);
    expect(norm(screen.getByTestId("finance-recent-actual-expense-unavailable").textContent)).toBe(text);
  });
});

describe("Gerçek kaynağa bağlı kartlar DEĞİŞMEDİ", () => {
  it("TL: tahsilat ve masraf talebi tutarları önceki metinle; gerçek sıfırları '0 ₺' kalır", () => {
    openFinance({ financeItems: [tahsilat("c1", 1000), masrafTalebi], caseCurrency: "TRY" });
    expect(financeCards().Tahsilat).toBe("Tahsilat1.000 ₺");
    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi1.431,1 ₺Ödenen: 0 ₺");
  });

  it("gerçek sıfır (tahsilat ve masraf talebi yok): '0 ₺' — bağlantı yok metni bu kartlara yazılmaz", () => {
    openFinance({ caseCurrency: "TRY" });
    expect(financeCards().Tahsilat).toBe("Tahsilat0 ₺");
    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi0 ₺Ödenen: 0 ₺");
  });

  it("USD dosya: tahsilat kendi para birimiyle (#2875); masraf talebi TL", () => {
    openFinance({ financeItems: [tahsilat("c1", 1000, "USD"), masrafTalebi], caseCurrency: "USD" });
    expect(financeCards().Tahsilat).toBe("Tahsilat1.000 USD");
    expect(financeCards()["Masraf Talebi"]).toBe("Masraf Talebi1.431,1 ₺Ödenen: 0 ₺");
  });
});

// =================================================================================================================
// "UYAP Sorgu" sekmesi
// =================================================================================================================

const uyapQuery = (id: string, status: "BEKLIYOR" | "TAMAMLANDI" | "HATA", extra: object = {}) => ({
  id,
  queryType: "SGK",
  status,
  createdAt: "2026-03-10T09:00:00.000Z",
  ...extra,
});

describe('"UYAP Sorgu" sekmesi — kayıtlar okunmadıkça "sorgu yapılmamış" denmez', () => {
  it("VERİ BAĞLANTISI YOK (varsayılan): bağlantının hazır olmadığı yazılır; rozet yok", () => {
    renderDeck();
    expect(badgeOf("UYAP Sorgu")).toBeNull();
    fireEvent.click(deckTab("UYAP Sorgu"));

    const notice = screen.getByTestId("uyap-queries-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(norm(notice.textContent)).toBe(
      "UYAP sorgu kayıtlarının bu ekrana bağlantısı henüz hazır değil.Bu, sorgu yapılmadığı anlamına gelmez.",
    );
    expect(screen.queryByText("Henüz sorgu yapılmamış")).toBeNull();
  });

  it("kaynak bağlı değilken verilen kayıtlar listelenmez ve rozete sayılmaz", () => {
    renderDeck({ uyapQueries: [uyapQuery("q1", "BEKLIYOR")] });
    expect(badgeOf("UYAP Sorgu")).toBeNull();
    fireEvent.click(deckTab("UYAP Sorgu"));

    expect(screen.getByTestId("uyap-queries-unavailable")).toBeInTheDocument();
    expect(screen.queryByText("SGK Sorgusu")).toBeNull();
  });

  it("GERÇEK BOŞ: kaynak READY ve kayıt yoksa 'Henüz sorgu yapılmamış' yazılır", () => {
    renderDeck({ uyapQueriesSource: "READY", uyapQueries: [] });
    fireEvent.click(deckTab("UYAP Sorgu"));

    expect(screen.getByText("Henüz sorgu yapılmamış")).toBeInTheDocument();
    expect(screen.queryByTestId("uyap-queries-unavailable")).toBeNull();
  });

  it("kaynak READY: kayıtlar listelenir, bekleyenler rozete sayılır", () => {
    renderDeck({ uyapQueriesSource: "READY", uyapQueries: [uyapQuery("q1", "BEKLIYOR"), uyapQuery("q2", "TAMAMLANDI")] });
    expect(badgeOf("UYAP Sorgu")).toBe("1");
    fireEvent.click(deckTab("UYAP Sorgu"));

    expect(screen.getAllByText("SGK Sorgusu")).toHaveLength(2);
    expect(screen.getByText("Bekliyor")).toBeInTheDocument();
    expect(screen.getByText("Tamamlandı")).toBeInTheDocument();
    expect(screen.queryByText("Henüz sorgu yapılmamış")).toBeNull();
  });

  it.each([
    ["LOADING", "UYAP sorgu kayıtları yükleniyor…"],
    ["ERROR", "UYAP sorgu kayıtları okunamadı.Bu, sorgu yapılmadığı anlamına gelmez."],
  ] as const)("YÜKLEME / HATA (%s): 'sorgu yapılmamış' denmez; durumun kendisi yazılır", (status, text) => {
    renderDeck({ uyapQueriesSource: status, uyapQueries: [uyapQuery("q1", "BEKLIYOR")] });
    expect(badgeOf("UYAP Sorgu")).toBeNull();
    fireEvent.click(deckTab("UYAP Sorgu"));

    const notice = screen.getByTestId("uyap-queries-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe(status);
    expect(norm(notice.textContent)).toBe(text);
    expect(screen.queryByText("Henüz sorgu yapılmamış")).toBeNull();
    expect(norm(notice.textContent)).not.toContain("bağlantısı henüz hazır değil");
  });

  it('işleyici bağlı değilken "Hızlı Sorgu" düğmeleri çizilmez (işlem yapmayan düğme yok)', () => {
    renderDeck();
    fireEvent.click(deckTab("UYAP Sorgu"));

    expect(screen.queryByText("Hızlı Sorgu")).toBeNull();
    for (const label of ["SGK Sorgusu", "Tapu Sorgusu", "Araç Sorgusu", "Banka Sorgusu", "Mernis Sorgusu"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it('işleyici bağlıyken "Hızlı Sorgu" düğmeleri çizilir ve her biri işleyiciyi çağırır', () => {
    const onRunQuery = vi.fn();
    renderDeck({ onRunQuery });
    fireEvent.click(deckTab("UYAP Sorgu"));

    for (const label of ["SGK Sorgusu", "Tapu Sorgusu", "Araç Sorgusu", "Banka Sorgusu", "Mernis Sorgusu"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    expect(onRunQuery.mock.calls.map((call) => call[0])).toEqual(["SGK", "TAPU", "ARAC", "BANKA", "MERNIS"]);
  });

  it('"Tekrar Sorgula" düğmesi yalnız işleyici bağlıyken çizilir', () => {
    const queries = [uyapQuery("q1", "TAMAMLANDI", { canRepeat: true })];

    const first = renderDeck({ uyapQueriesSource: "READY", uyapQueries: queries });
    fireEvent.click(deckTab("UYAP Sorgu"));
    expect(screen.queryByTitle("Tekrar Sorgula")).toBeNull();
    first.unmount();

    const onRunQuery = vi.fn();
    renderDeck({ uyapQueriesSource: "READY", uyapQueries: queries, onRunQuery });
    fireEvent.click(deckTab("UYAP Sorgu"));
    fireEvent.click(screen.getByTitle("Tekrar Sorgula"));
    expect(onRunQuery).toHaveBeenCalledWith("SGK");
  });
});

// =================================================================================================================
// "İlişkili" sekmesi
// =================================================================================================================

const relatedCase = { id: "case-9", fileNumber: "2025/77", type: "İlamsız İcra", status: "DERDEST", relation: "AYNI_BORCLU" as const };

describe('"İlişkili" sekmesi — dosyalar okunmadıkça "ilişkili dosya yok" denmez', () => {
  it("VERİ BAĞLANTISI YOK (varsayılan): bağlantının hazır olmadığı yazılır; rozet yok", () => {
    renderDeck();
    expect(badgeOf("İlişkili")).toBeNull();
    fireEvent.click(deckTab("İlişkili"));

    const notice = screen.getByTestId("related-cases-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(norm(notice.textContent)).toBe(
      "İlişkili dosyaların bu ekrana bağlantısı henüz hazır değil.Bu, ilişkili dosya bulunmadığı anlamına gelmez.",
    );
    expect(screen.queryByText("İlişkili dosya yok")).toBeNull();
  });

  it("kaynak bağlı değilken verilen dosyalar listelenmez ve rozete sayılmaz", () => {
    renderDeck({ relatedCases: [relatedCase] });
    expect(badgeOf("İlişkili")).toBeNull();
    fireEvent.click(deckTab("İlişkili"));

    expect(screen.getByTestId("related-cases-unavailable")).toBeInTheDocument();
    expect(screen.queryByText("2025/77")).toBeNull();
  });

  it("GERÇEK BOŞ: kaynak READY ve dosya yoksa 'İlişkili dosya yok' yazılır", () => {
    renderDeck({ relatedCasesSource: "READY", relatedCases: [] });
    fireEvent.click(deckTab("İlişkili"));

    expect(screen.getByText("İlişkili dosya yok")).toBeInTheDocument();
    expect(screen.queryByTestId("related-cases-unavailable")).toBeNull();
  });

  it("kaynak READY: dosyalar bağlantılarıyla listelenir ve rozete sayılır", () => {
    renderDeck({ relatedCasesSource: "READY", relatedCases: [relatedCase] });
    expect(badgeOf("İlişkili")).toBe("1");
    fireEvent.click(deckTab("İlişkili"));

    expect(screen.getByText("2025/77").closest("a")?.getAttribute("href")).toBe("/cases/case-9");
    expect(screen.queryByText("İlişkili dosya yok")).toBeNull();
  });

  it.each([
    ["LOADING", "İlişkili dosyalar yükleniyor…"],
    ["ERROR", "İlişkili dosyalar okunamadı.Bu, ilişkili dosya bulunmadığı anlamına gelmez."],
  ] as const)("YÜKLEME / HATA (%s): 'ilişkili dosya yok' denmez; durumun kendisi yazılır", (status, text) => {
    renderDeck({ relatedCasesSource: status, relatedCases: [relatedCase] });
    expect(badgeOf("İlişkili")).toBeNull();
    fireEvent.click(deckTab("İlişkili"));

    const notice = screen.getByTestId("related-cases-unavailable");
    expect(notice.getAttribute("data-source-status")).toBe(status);
    expect(norm(notice.textContent)).toBe(text);
    expect(screen.queryByText("İlişkili dosya yok")).toBeNull();
    expect(norm(notice.textContent)).not.toContain("bağlantısı henüz hazır değil");
  });
});
