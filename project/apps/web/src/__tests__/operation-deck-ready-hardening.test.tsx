import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationDeck } from "@/components/case-detail/OperationDeck";

/**
 * OperationDeck — dört kaynak durumu alanının (Müvekkil Bakiye, Yapılan Masraf, UYAP Sorgu, İlişkili) tip dışı / geçersiz
 * girdide davranışı.
 *
 * Kusur (ölçüldü, main 8727e5d2 = 81ab9466; bugün sayfa dördüne de sabit NOT_CONNECTED verdiği için ekrana yansımıyordu,
 * bir kaynak bağlandığı anda yansıyacaktı):
 *  - durum `null` → tanınmayan durum sayılıp veri (350 ₺, kayıt, dosya) sızıyordu;
 *  - tanınmayan durum dizesi → UYAP / İlişkili sekmesi açılınca TypeError;
 *  - READY + liste verilmedi / dizi değil → "Henüz sorgu yapılmamış" / "İlişkili dosya yok" (ya da ilk çizimde çöküş);
 *  - READY + tutar sayı değil → "NaN ₺", "∞ ₺", dize bitiştirme ("0350.00500.00 ₺") ya da çöküş;
 *  - READY + bakiye -0 → yeşil "-0 ₺".
 *
 * Kural (owner kararı 2026-10-02): tanınmayan / geçersiz durum READY SAYILMAZ ve "okunamadı" yazılır; "henüz
 * bağlanmadı" yalnız gerçekten bağlanmamış (durum verilmemiş) kaynak içindir. Sıfır ve "kayıt yok" yalnız READY ve
 * değer geçerliyken yazılır; READY + boş liste gerçek boştur.
 */

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

type DeckProps = React.ComponentProps<typeof OperationDeck>;
type FinanceItems = NonNullable<DeckProps["financeItems"]>;

const NOT_CONNECTED_CARD = "Bu bilgi henüz bu ekrana bağlanmadı";
const UNREADABLE_CARD = "Bu bilgi okunamadı";

/** Tip dışı değerler: bileşene tip sistemini aşarak gelen çalışma zamanı girdileri. */
const asStatus = (value: unknown) => value as DeckProps["clientBalanceSource"];

function renderDeck(props: Partial<DeckProps> = {}) {
  return render(<OperationDeck caseId="case-1" collectionsSource="READY" expenseRequestsSource="READY" {...props} />);
}

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

function financeCards(): Record<"Tahsilat" | "Yapılan Masraf" | "Masraf Talebi" | "Müvekkil Bakiye", string> {
  const grid = screen.getByText("Son İşlemler").parentElement?.parentElement?.children[0];
  if (!grid) throw new Error("Finans kart ızgarası bulunamadı");
  const cards = Array.from(grid.children).map((card) => norm(card.textContent));
  if (cards.length !== 4) throw new Error(`Finans sekmesinde 4 kart bekleniyordu: ${cards.length}`);
  return { Tahsilat: cards[0], "Yapılan Masraf": cards[1], "Masraf Talebi": cards[2], "Müvekkil Bakiye": cards[3] };
}

function recentList(): string[] {
  const list = screen.getByText("Son İşlemler").nextElementSibling;
  if (!list) throw new Error('"Son İşlemler" listesi bulunamadı');
  return Array.from(list.children).map((row) => {
    const amount = row.children[1]?.children[0];
    return amount ? `${norm(row.children[0]?.textContent)} | ${norm(amount.textContent)}` : norm(row.textContent);
  });
}

const tahsilat = (id: string, amount: number): FinanceItems[number] => ({
  id,
  type: "TAHSILAT",
  amount,
  date: "2026-03-01",
  description: `Tahsilat ${id}`,
  currency: "TRY",
});

const masraf = (id: string, amount: unknown, description: string): FinanceItems[number] =>
  ({ id, type: "MASRAF_YAPILAN", amount, date: "2026-02-10", description }) as FinanceItems[number];

const uyapQuery = (id: string) => ({ id, queryType: "SGK", status: "BEKLIYOR" as const, createdAt: "2026-03-10T09:00:00.000Z" });
const relatedCase = (id: string) => ({
  id,
  fileNumber: `2026/${id}`,
  type: "İcra",
  status: "DERDEST",
  relation: "AYNI_BORCLU" as const,
});

const UNKNOWN_STATUSES: unknown[] = ["ready", "Ready", "", "DONE", "PENDING", 0, 1, true, {}, ["READY"]];

// =================================================================================================================
// Durum çözümlemesi
// =================================================================================================================

describe("Durum yok (undefined / null) → 'henüz bağlanmadı'; tanınmayan durum → 'okunamadı' (READY değil)", () => {
  it.each([[undefined], [null]])("Müvekkil Bakiye / Yapılan Masraf durumu %s: 'henüz bağlanmadı'; veri sızmaz", (status) => {
    openFinance({
      clientBalanceSource: asStatus(status),
      actualExpenseSource: asStatus(status),
      clientBalance: 600,
      financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu")],
    });

    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${NOT_CONNECTED_CARD}`);
    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${NOT_CONNECTED_CARD}`);
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    expect(norm(document.body.textContent)).not.toContain("350");
    expect(norm(document.body.textContent)).not.toContain("600");
  });

  it.each(UNKNOWN_STATUSES.map((v) => [v]))("Müvekkil Bakiye / Yapılan Masraf durumu %j: 'okunamadı'; veri sızmaz, çökmez", (status) => {
    openFinance({
      clientBalanceSource: asStatus(status),
      actualExpenseSource: asStatus(status),
      clientBalance: 600,
      financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu")],
    });

    expect(financeCards()["Müvekkil Bakiye"]).toBe(`Müvekkil Bakiye${UNREADABLE_CARD}`);
    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${UNREADABLE_CARD}`);
    expect(screen.getByTestId("finance-client-balance-unavailable").getAttribute("data-source-status")).toBe("ERROR");
    expect(screen.getByTestId("finance-actual-expense-unavailable").getAttribute("data-source-status")).toBe("ERROR");
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    expect(norm(document.body.textContent)).not.toContain("350");
    expect(norm(document.body.textContent)).not.toContain("600");
  });

  it.each([[undefined], [null]])("UYAP Sorgu / İlişkili durumu %s: 'henüz bağlanmadı'; kayıt ve dosya sızmaz", (status) => {
    renderDeck({
      uyapQueriesSource: asStatus(status),
      relatedCasesSource: asStatus(status),
      uyapQueries: [uyapQuery("q1")],
      relatedCases: [relatedCase("1")],
    });

    expect(badgeOf("UYAP Sorgu")).toBeNull();
    expect(badgeOf("İlişkili")).toBeNull();
    fireEvent.click(deckTab("UYAP Sorgu"));
    expect(screen.getByTestId("uyap-queries-unavailable").getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(screen.queryByText("SGK Sorgusu")).toBeNull();
    fireEvent.click(deckTab("İlişkili"));
    expect(screen.getByTestId("related-cases-unavailable").getAttribute("data-source-status")).toBe("NOT_CONNECTED");
    expect(screen.queryByText("2026/1")).toBeNull();
  });

  it.each(UNKNOWN_STATUSES.map((v) => [v]))("UYAP Sorgu / İlişkili durumu %j: sekme AÇILINCA çökmez, 'okunamadı' yazılır", (status) => {
    renderDeck({
      uyapQueriesSource: asStatus(status),
      relatedCasesSource: asStatus(status),
      uyapQueries: [uyapQuery("q1")],
      relatedCases: [relatedCase("1")],
    });

    expect(badgeOf("UYAP Sorgu")).toBeNull();
    expect(badgeOf("İlişkili")).toBeNull();
    fireEvent.click(deckTab("UYAP Sorgu"));
    const uyap = screen.getByTestId("uyap-queries-unavailable");
    expect(uyap.getAttribute("data-source-status")).toBe("ERROR");
    expect(norm(uyap.textContent)).toBe("UYAP sorgu kayıtları okunamadı.Bu, sorgu yapılmadığı anlamına gelmez.");
    fireEvent.click(deckTab("İlişkili"));
    const related = screen.getByTestId("related-cases-unavailable");
    expect(related.getAttribute("data-source-status")).toBe("ERROR");
    expect(norm(related.textContent)).toBe("İlişkili dosyalar okunamadı.Bu, ilişkili dosya bulunmadığı anlamına gelmez.");
    expect(screen.queryByText("2026/1")).toBeNull();
  });
});

// =================================================================================================================
// READY + geçersiz değer
// =================================================================================================================

describe("READY + liste dizi değilse 'okunamadı'; READY + boş dizi gerçek boştur", () => {
  it.each([["verilmedi", undefined], ["null", null], ["nesne", { length: 0 }], ["dize", "[]"]])(
    "UYAP Sorgu: READY + liste %s → 'okunamadı' ('Henüz sorgu yapılmamış' denmez), ilk çizimde çökmez",
    (_ad, list) => {
      renderDeck({ uyapQueriesSource: "READY", uyapQueries: list as never });

      expect(badgeOf("UYAP Sorgu")).toBeNull();
      fireEvent.click(deckTab("UYAP Sorgu"));
      expect(screen.getByTestId("uyap-queries-unavailable").getAttribute("data-source-status")).toBe("ERROR");
      expect(screen.queryByText("Henüz sorgu yapılmamış")).toBeNull();
    },
  );

  it.each([["verilmedi", undefined], ["null", null], ["nesne", { length: 0 }], ["dize", "[]"]])(
    "İlişkili: READY + liste %s → 'okunamadı' ('İlişkili dosya yok' denmez), ilk çizimde çökmez",
    (_ad, list) => {
      renderDeck({ relatedCasesSource: "READY", relatedCases: list as never });

      expect(badgeOf("İlişkili")).toBeNull();
      fireEvent.click(deckTab("İlişkili"));
      expect(screen.getByTestId("related-cases-unavailable").getAttribute("data-source-status")).toBe("ERROR");
      expect(screen.queryByText("İlişkili dosya yok")).toBeNull();
    },
  );

  it("READY + [] GERÇEK BOŞ: 'Henüz sorgu yapılmamış' / 'İlişkili dosya yok' aynen", () => {
    renderDeck({ uyapQueriesSource: "READY", uyapQueries: [], relatedCasesSource: "READY", relatedCases: [] });

    fireEvent.click(deckTab("UYAP Sorgu"));
    expect(screen.getByText("Henüz sorgu yapılmamış")).toBeInTheDocument();
    expect(screen.queryByTestId("uyap-queries-unavailable")).toBeNull();
    fireEvent.click(deckTab("İlişkili"));
    expect(screen.getByText("İlişkili dosya yok")).toBeInTheDocument();
    expect(screen.queryByTestId("related-cases-unavailable")).toBeNull();
  });

  it("READY + dolu liste: kayıtlar listelenir, bekleyenler rozete sayılır", () => {
    renderDeck({
      uyapQueriesSource: "READY",
      uyapQueries: [uyapQuery("q1"), uyapQuery("q2")],
      relatedCasesSource: "READY",
      relatedCases: [relatedCase("1")],
    });

    expect(badgeOf("UYAP Sorgu")).toBe("2");
    expect(badgeOf("İlişkili")).toBe("1");
    fireEvent.click(deckTab("İlişkili"));
    expect(screen.getByText("2026/1")).toBeInTheDocument();
  });
});

describe("READY + sonlu olmayan yapılan masraf tutarı → toplam yazılmaz, 'okunamadı'", () => {
  const BAD: Array<[string, unknown]> = [
    ["verilmedi", undefined],
    ["null", null],
    ["dize", "500.00"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];

  it.each(BAD)("tutar %s: 'NaN ₺' / dize bitiştirme / '∞ ₺' yazılmaz; kısmi toplam yazılmaz; çökmez", (_ad, bad) => {
    openFinance({
      actualExpenseSource: "READY",
      financeItems: [tahsilat("c1", 1000), masraf("m1", 350, "Haciz yolluğu"), masraf("m2", bad, "Tebligat gideri")],
    });

    expect(financeCards()["Yapılan Masraf"]).toBe(`Yapılan Masraf${UNREADABLE_CARD}`);
    expect(screen.getByTestId("finance-actual-expense-unavailable").getAttribute("data-source-status")).toBe("ERROR");
    expect(screen.queryByTestId("finance-actual-expense-total")).toBeNull();
    // Geçerli satır da (350) kısmi veri olarak listelenmez ve toplanmaz
    expect(recentList()).toEqual(["Tahsilat c1 | +1.000 ₺"]);
    const text = norm(document.body.textContent);
    expect(text).not.toMatch(/NaN|∞|Infinity|350/);
  });

  it("geçerli tutarlar: toplam ve satırlar yazılır (önceki gösterim)", () => {
    openFinance({
      actualExpenseSource: "READY",
      financeItems: [masraf("m1", 350, "Haciz yolluğu"), masraf("m2", 500, "Tebligat gideri")],
    });

    expect(norm(screen.getByTestId("finance-actual-expense-total").textContent)).toBe("850 ₺");
    expect(recentList()).toEqual(["Haciz yolluğu | -350 ₺", "Tebligat gideri | -500 ₺"]);
  });

  it("READY + masraf satırı yok: gerçek sıfır '0 ₺' (önceki gösterim)", () => {
    openFinance({ actualExpenseSource: "READY" });
    expect(norm(screen.getByTestId("finance-actual-expense-total").textContent)).toBe("0 ₺");
  });
});

describe("READY bakiye -0 → '0 ₺'", () => {
  it("-0 yeşil '0 ₺' yazılır ('-0 ₺' değil)", () => {
    openFinance({ clientBalanceSource: "READY", clientBalance: -0 });

    const shown = screen.getByTestId("finance-client-balance");
    expect(norm(shown.textContent)).toBe("0 ₺");
    expect(shown.className).toContain("text-emerald-700");
  });

  it("gerçek negatif bakiye aynen: '-250 ₺' kırmızı", () => {
    openFinance({ clientBalanceSource: "READY", clientBalance: -250 });

    const shown = screen.getByTestId("finance-client-balance");
    expect(norm(shown.textContent)).toBe("-250 ₺");
    expect(shown.className).toContain("text-red-700");
  });
});
