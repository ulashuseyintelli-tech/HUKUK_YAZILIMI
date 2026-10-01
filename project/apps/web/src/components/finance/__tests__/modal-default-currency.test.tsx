import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Yeni alacak kalemi / yeni ödeme formu — para birimi VARSAYILANI dosyanın para birimidir.
 *
 * Kusur (sayfa düzeyinde ölçüldü, main 6917e8aa): USD ve EUR dosyada "+ Düzenle" ve "+ Yeni Ödeme" formları para
 * birimini "₺ TRY" seçili açıyordu (form durumu sabit "TRY"; sayfa forma yalnız dosya kimliğini veriyordu). Kullanıcı
 * fark etmeden kaydederse dövizli dosyaya TRY kalem / TRY tahsilat gider; dosya para biriminden farklı tek kalem o
 * dosyaya HER tahsilatı 400 COLLECTION_CURRENCY_MISMATCH ile keser (RCV-COL-CURRENCY-BOUNDARY-01).
 *
 * Kural (politika gerektirmeyen kısım): varsayılan dosyanın para birimidir; seçim KİLİTLENMEZ (kullanıcı değiştirebilir);
 * düzenlemede kaydın kendi değeri korunur. Kalem başına para birimi kuralı (tek / çoklu) bu değişiklikle SEÇİLMEZ.
 */

const createDue = vi.fn();
const updateDue = vi.fn();
const createCollection = vi.fn();
const updateCollection = vi.fn();
const previewCasePayment = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    createDue: (...a: unknown[]) => createDue(...a),
    updateDue: (...a: unknown[]) => updateDue(...a),
    deleteDue: vi.fn(),
    createCollection: (...a: unknown[]) => createCollection(...a),
    updateCollection: (...a: unknown[]) => updateCollection(...a),
    previewCasePayment: (...a: unknown[]) => previewCasePayment(...a),
    cancelCollection: vi.fn(),
  },
}));

import { DueModal } from "../DueModal";
import { CollectionModal } from "../CollectionModal";

type Kind = "due" | "collection";

/** Formu kurar; `record` verilirse düzenleme kipidir. `defaultCurrency` verilmezse prop hiç geçilmez (eski çağrı biçimi). */
function modal(kind: Kind, props: { isOpen?: boolean; defaultCurrency?: string | null; record?: Record<string, unknown> }) {
  const { isOpen = true, record } = props;
  const currencyProp = "defaultCurrency" in props ? { defaultCurrency: props.defaultCurrency } : {};
  return kind === "due" ? (
    <DueModal isOpen={isOpen} onClose={vi.fn()} caseId="case-1" due={record} onSuccess={vi.fn()} {...currencyProp} />
  ) : (
    <CollectionModal isOpen={isOpen} onClose={vi.fn()} caseId="case-1" collection={record} onSuccess={vi.fn()} {...currencyProp} />
  );
}

/** "Para Birimi" etiketinin seçim alanı. Bulunamazsa hata fırlatır. */
function currencySelect(): HTMLSelectElement {
  const select = screen.getByText("Para Birimi").parentElement?.querySelector("select");
  if (!select) throw new Error("para birimi seçim alanı bulunamadı");
  return select as HTMLSelectElement;
}

const selected = () => currencySelect().value;
const optionValues = () => Array.from(currencySelect().options).map((o) => o.value);
const shownLabel = () => currencySelect().options[currencySelect().selectedIndex]?.textContent;

const KINDS: Array<{ kind: Kind; title: string; submit: string; create: typeof createDue; update: typeof updateDue }> = [
  { kind: "due", title: "yeni alacak kalemi formu (DueModal)", submit: "Ekle", create: createDue, update: updateDue },
  { kind: "collection", title: "yeni ödeme formu (CollectionModal)", submit: "Ekle", create: createCollection, update: updateCollection },
];

beforeEach(() => {
  createDue.mockReset().mockResolvedValue({ id: "due-new" });
  updateDue.mockReset().mockResolvedValue({ id: "due-1" });
  createCollection.mockReset().mockResolvedValue({ id: "col-new" });
  updateCollection.mockReset().mockResolvedValue({ id: "col-1" });
  previewCasePayment.mockReset();
});

describe.each(KINDS)("$title — para birimi varsayılanı dosyanın para birimi", ({ kind, submit, create, update }) => {
  it("USD dosyada yeni kayıt formu USD seçili açılır", () => {
    render(modal(kind, { defaultCurrency: "USD" }));

    expect(selected()).toBe("USD");
    expect(shownLabel()).toBe("$ USD");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP"]);
  });

  it("EUR dosyada EUR, GBP dosyada GBP seçili açılır", () => {
    const { unmount } = render(modal(kind, { defaultCurrency: "EUR" }));
    expect(selected()).toBe("EUR");
    unmount();

    render(modal(kind, { defaultCurrency: "GBP" }));
    expect(selected()).toBe("GBP");
  });

  it("dosya para birimi seçenek listesinde yoksa (CHF) listeye eklenir ve seçili gösterilir — alan başka değer göstermez", () => {
    render(modal(kind, { defaultCurrency: "CHF" }));

    expect(selected()).toBe("CHF");
    expect(shownLabel()).toBe("CHF");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP", "CHF"]);
  });

  it("CHF dosyada başka para birimi seçilince CHF seçeneği listede KALIR — kullanıcı dosya para birimine geri dönebilir", () => {
    render(modal(kind, { defaultCurrency: "CHF" }));
    fireEvent.change(currencySelect(), { target: { value: "USD" } });

    expect(selected()).toBe("USD");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP", "CHF"]);
    fireEvent.change(currencySelect(), { target: { value: "CHF" } });
    expect(selected()).toBe("CHF");
  });

  it("değiştirilmeden kaydedilen yeni kayıt dosyanın para birimiyle gönderilir", async () => {
    render(modal(kind, { defaultCurrency: "USD" }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: submit }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toBe("case-1");
    expect(create.mock.calls[0][1]).toMatchObject({ amount: 250, currency: "USD" });
  });

  it("seçim kilitli DEĞİLDİR: kullanıcı başka para birimi seçebilir ve seçtiği gönderilir", async () => {
    render(modal(kind, { defaultCurrency: "USD" }));

    expect(currencySelect().disabled).toBe(false);
    fireEvent.change(currencySelect(), { target: { value: "EUR" } });
    expect(selected()).toBe("EUR");
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: submit }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1]).toMatchObject({ amount: 100, currency: "EUR" });
  });

  it("form kapatılıp yeniden açılınca seçim yine dosyanın para birimine döner", () => {
    const { rerender } = render(modal(kind, { defaultCurrency: "USD" }));
    fireEvent.change(currencySelect(), { target: { value: "EUR" } });
    expect(selected()).toBe("EUR");

    rerender(modal(kind, { isOpen: false, defaultCurrency: "USD" }));
    expect(screen.queryByText("Para Birimi")).toBeNull();
    rerender(modal(kind, { defaultCurrency: "USD" }));

    expect(selected()).toBe("USD");
  });

  it("form açıkken sayfa yeniden çizilirse (dosya para birimi aynı) girilen tutar ve seçilen para birimi SİLİNMEZ", () => {
    const { rerender } = render(modal(kind, { defaultCurrency: "USD" }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "250" } });
    fireEvent.change(currencySelect(), { target: { value: "EUR" } });

    rerender(modal(kind, { defaultCurrency: "USD" }));

    expect((screen.getByPlaceholderText("0.00") as HTMLInputElement).value).toBe("250");
    expect(selected()).toBe("EUR");
  });

  it("dosyanın para birimi form açıkken değişirse (dosya yeniden yüklendi) yeni kayıt formu güncel dosya para birimini gösterir", () => {
    const { rerender } = render(modal(kind, { defaultCurrency: "USD" }));
    expect(selected()).toBe("USD");

    rerender(modal(kind, { defaultCurrency: "EUR" }));

    expect(selected()).toBe("EUR");
  });

  it("düzenlemede kaydın KENDİ para birimi korunur (dosya USD, kayıt EUR) ve o değerle gönderilir", async () => {
    render(modal(kind, { defaultCurrency: "USD", record: { id: "rec-1", type: kind === "due" ? "PRINCIPAL" : "TAHSILAT", amount: 500, currency: "EUR" } }));

    expect(selected()).toBe("EUR");
    fireEvent.click(screen.getByRole("button", { name: "Güncelle" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][2]).toMatchObject({ amount: 500, currency: "EUR" });
    expect(create).not.toHaveBeenCalled();
  });

  it("düzenlemede para birimi alanı taşımayan kayıt şema varsayılanı TRY'dir — dosya para birimine ÇEVRİLMEZ", () => {
    render(modal(kind, { defaultCurrency: "USD", record: { id: "rec-1", type: kind === "due" ? "PRINCIPAL" : "TAHSILAT", amount: 500 } }));

    expect(selected()).toBe("TRY");
  });

  it("düzenlemede kaydın para birimi listede yoksa (CHF) yine kendi değeriyle gösterilir", () => {
    render(modal(kind, { defaultCurrency: "USD", record: { id: "rec-1", type: kind === "due" ? "PRINCIPAL" : "TAHSILAT", amount: 500, currency: "CHF" } }));

    expect(selected()).toBe("CHF");
    expect(shownLabel()).toBe("CHF");
    // başka para birimi seçilse de kaydın kendi para birimi listede kalır (geri dönülebilir)
    fireEvent.change(currencySelect(), { target: { value: "USD" } });
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP", "CHF"]);
  });

  it("düzenlemede dosya para birimi listede yoksa (CHF dosya, EUR kayıt) seçenek olarak sunulur; seçili değer kaydınkidir", () => {
    render(modal(kind, { defaultCurrency: "CHF", record: { id: "rec-1", type: kind === "due" ? "PRINCIPAL" : "TAHSILAT", amount: 500, currency: "EUR" } }));

    expect(selected()).toBe("EUR");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP", "CHF"]);
  });

  it("düzenlemeden yeni kayda geçilince (kayıt bırakılınca) seçim dosyanın para birimine döner", () => {
    const record = { id: "rec-1", type: kind === "due" ? "PRINCIPAL" : "TAHSILAT", amount: 500, currency: "EUR" };
    const { rerender } = render(modal(kind, { defaultCurrency: "USD", record }));
    expect(selected()).toBe("EUR");

    rerender(modal(kind, { defaultCurrency: "USD" }));

    expect(selected()).toBe("USD");
  });

  it("dosya para birimi küçük harf / boşlukla gelse de ISO koduyla seçilir", () => {
    render(modal(kind, { defaultCurrency: " usd " }));

    expect(selected()).toBe("USD");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP"]);
  });
});

describe.each(KINDS)("$title — TL dosyada ve eski çağrı biçiminde davranış DEĞİŞMEDİ", ({ kind, submit, create }) => {
  it("TRY dosyada form TRY seçili açılır; seçenek listesi aynıdır", () => {
    render(modal(kind, { defaultCurrency: "TRY" }));

    expect(selected()).toBe("TRY");
    expect(shownLabel()).toBe("₺ TRY");
    expect(optionValues()).toEqual(["TRY", "USD", "EUR", "GBP"]);
  });

  it("dosya para birimi verilmeyen çağrı (eski biçim) TRY seçili açılır ve TRY gönderir", async () => {
    render(modal(kind, {}));
    expect(selected()).toBe("TRY");

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: submit }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1]).toMatchObject({ amount: 75, currency: "TRY" });
  });

  it("dosya para birimi boş (null / '') gelirse şema varsayılanı TRY seçilir", () => {
    const { unmount } = render(modal(kind, { defaultCurrency: null }));
    expect(selected()).toBe("TRY");
    unmount();

    render(modal(kind, { defaultCurrency: "" }));
    expect(selected()).toBe("TRY");
  });
});

describe("yeni ödeme formu — önizleme de formda seçili para birimini gönderir", () => {
  it("USD dosyada önizleme isteği USD ile gider", async () => {
    previewCasePayment.mockResolvedValue({
      nonPersistent: true,
      caseId: "case-1",
      input: { amount: 500, currency: "USD", caseDebtorId: null },
      acceptance: { wouldAccept: true, blockingReasons: [], warnings: [] },
      balanceImpact: {
        currentOutstandingAmount: 10000,
        paymentAmount: 500,
        appliedAmount: 500,
        overpaymentAmount: 0,
        projectedOutstandingAmount: 9500,
      },
      distributionPreview: { status: "HELD_PENDING_DISTRIBUTION", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    });
    render(modal("collection", { defaultCurrency: "USD" }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));

    await waitFor(() => expect(previewCasePayment).toHaveBeenCalledTimes(1));
    expect(previewCasePayment.mock.calls[0][1]).toMatchObject({ amount: 500, currency: "USD" });
  });
});
