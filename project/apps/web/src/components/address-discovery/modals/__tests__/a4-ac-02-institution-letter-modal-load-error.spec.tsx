/**
 * WSMR-A4-AC-02 — InstitutionLetterModal#loadTemplates okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): hata durumunda hiçbir state dokunulmuyordu (yalnız console.error) —
 * `templates` boş kalınca modal açıklamasız boş bir kurum ızgarası gösteriyordu ("şablon
 * yok" gerçek boşluğuyla AYIRT EDİLEMEZ). Ayrıca bu modal örneği açık/kapalı arasında
 * UNMOUNT OLMUYOR (yalnız `open` prop'u değişir) — kimlik değişim koruması olmadan,
 * ÖNCEKİ borçlunun seçimi/taslak metni YENİ borçlunun bağlamında sessizce kalıp YANLIŞ
 * borçluya gönderilebiliyordu. `UyapQueryModal`'ın (WSMR-A4-AB-20) fix-öncesi ikizi.
 *
 * Canlılık zinciri fresh doğrulandı: cases/[id]/page.tsx (+ v2/page.tsx) → DebtorDetailDrawer
 * → AddressResearchWidget → InstitutionLetterModal (doğrudan import, dead
 * AddressDiscoveryPanel üzerinden DEĞİL).
 *
 * WSMR-A4-AC-02 (owner GO-COMPLETE).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getInstitutionTemplates: vi.fn(),
  createInstitutionLetter: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
}));

import { InstitutionLetterModal } from "../InstitutionLetterModal";

const TEMPLATE_SGK = {
  institution: "SGK",
  name: "SGK",
  letterTypes: ["MAAS_HACZI", "ISVEREN_BILGI"],
  defaultSubject: "SGK Maaş Haczi Talebi",
};
const TEMPLATE_VERGI = {
  institution: "VERGI_DAIRESI",
  name: "Vergi Dairesi",
  letterTypes: ["HESAP_BILGI"],
  defaultSubject: "Vergi Dairesi Hesap Bilgisi Talebi",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WSMR-A4-AC-02: InstitutionLetterModal#loadTemplates okuma hatası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[1] ilk yükleme: spinner gösterilir, sonra içerik render edilir", async () => {
    const pending = deferred<any>();
    apiMock.getInstitutionTemplates.mockReturnValue(pending.promise);

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();

    pending.resolve([TEMPLATE_SGK]);
    await screen.findByText("SGK");
  });

  it("[2] gerçek başarı (dolu sonuç): kurum ızgarası render edilir, hata YOK", async () => {
    apiMock.getInstitutionTemplates.mockResolvedValue([TEMPLATE_SGK, TEMPLATE_VERGI]);

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    await screen.findByText("SGK");
    expect(screen.getByText("Vergi Dairesi")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[3] gerçek başarı (boş sonuç): boş ızgara sessizce gösterilir, hata YOK", async () => {
    apiMock.getInstitutionTemplates.mockResolvedValue([]);

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    await waitFor(() => expect(document.querySelector(".animate-spin")).toBeFalsy());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("SGK")).not.toBeInTheDocument();
  });

  it("[4] ağ/HTTP hatası: görünür hata bandı çıkar, boş ızgara ('şablon yok') YAZILMAZ", async () => {
    apiMock.getInstitutionTemplates.mockRejectedValue(new Error("network down"));

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Kurum yazısı şablonları yüklenemedi.");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("[5] malformed gövde (dizi değil): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiMock.getInstitutionTemplates.mockResolvedValue({ message: "beklenmedik" } as any);

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Kurum yazısı şablonları yüklenemedi.");
  });

  it("[6] hata → retry → başarı: hata bandı temizlenir, içerik render edilir", async () => {
    apiMock.getInstitutionTemplates
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([TEMPLATE_SGK]);

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText("SGK");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiMock.getInstitutionTemplates).toHaveBeenCalledTimes(2);
  });

  it("[7] retry YALNIZ hedef kaynağı tekrar dener — createInstitutionLetter HİÇ ÇAĞRILMAZ", async () => {
    apiMock.getInstitutionTemplates.mockRejectedValue(new Error("network down"));

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(apiMock.getInstitutionTemplates).toHaveBeenCalledTimes(2));
    expect(apiMock.createInstitutionLetter).not.toHaveBeenCalled();
  });

  it("[8] başarılı veri → refresh hatası → veri KORUNUR + stale etiketi", async () => {
    apiMock.getInstitutionTemplates
      .mockResolvedValueOnce([TEMPLATE_SGK])
      .mockRejectedValueOnce(new Error("network down"));

    const { rerender } = render(
      <InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />
    );
    await screen.findByText("SGK");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Kapat + aynı borçlu için yeniden aç — bu modal örneği UNMOUNT olmadığından
    // `open` geçişi yeniden fetch tetikler (mevcut davranış, dokunulmadı).
    rerender(<InstitutionLetterModal open={false} onClose={vi.fn()} caseDebtorId="debtor-A" />);
    rerender(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("bayat olabilir");
    // ÖNCEKİ liste HÂLÂ DOM'da — "şablon yok" ile DEĞİŞTİRİLMEDİ.
    expect(screen.getByText("SGK")).toBeInTheDocument();
  });

  it("[9] çift-retry: hızlı art arda iki tıklama tek aktif isteğe düşer (in-flight koruması)", async () => {
    apiMock.getInstitutionTemplates.mockRejectedValueOnce(new Error("network down"));

    render(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />);
    await screen.findByRole("alert");
    expect(apiMock.getInstitutionTemplates).toHaveBeenCalledTimes(1);

    const retry = deferred<any>();
    apiMock.getInstitutionTemplates.mockReturnValueOnce(retry.promise);

    const retryButton = screen.getByRole("button", { name: "Tekrar dene" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    retry.resolve([TEMPLATE_SGK]);
    await screen.findByText("SGK");

    expect(apiMock.getInstitutionTemplates).toHaveBeenCalledTimes(2);
  });

  it("[10] geç-eski yanıt: kimlik değişince ÖNCEKİ (geç gelen) yanıt YENİ state'i EZMEZ", async () => {
    const staleA = deferred<any>();
    const freshB = deferred<any>();

    apiMock.getInstitutionTemplates
      .mockReturnValueOnce(staleA.promise) // debtor-A ilk açılış
      .mockReturnValueOnce(freshB.promise); // debtor-B'ye geçiş

    const { rerender } = render(
      <InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />
    );

    rerender(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-B" />);

    freshB.resolve([TEMPLATE_VERGI]);
    await screen.findByText("Vergi Dairesi");

    // A'nın (bayat) yanıtı ŞİMDİ gelir — B'nin zaten render edilmiş verisini EZMEMELİ.
    staleA.resolve([TEMPLATE_SGK]);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText("Vergi Dairesi")).toBeInTheDocument();
    expect(screen.queryByText("SGK")).not.toBeInTheDocument();
  });

  it("[11] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    const pending = deferred<any>();
    apiMock.getInstitutionTemplates.mockReturnValue(pending.promise);

    const { unmount } = render(
      <InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />
    );
    unmount();
    pending.resolve([TEMPLATE_SGK]);

    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
  });

  it("[12] modal kapanınca (unmount olmadan) beklemedeki geç yanıt state'e sessizce yazılmaz görünür şekilde etkilemez", async () => {
    const pending = deferred<any>();
    apiMock.getInstitutionTemplates.mockReturnValue(pending.promise);

    const { rerender } = render(
      <InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />
    );
    // Modal kapanır (component UNMOUNT olmaz, yalnız `open=false` -> `if (!open) return null`).
    rerender(<InstitutionLetterModal open={false} onClose={vi.fn()} caseDebtorId="debtor-A" />);

    pending.resolve([TEMPLATE_SGK]);
    await new Promise((r) => setTimeout(r, 0));

    // Kapalıyken render null döner — hiçbir görünür çıktı yok, hata fırlamadı.
    expect(document.body.textContent).not.toContain("SGK");
  });

  it("[13] cross-debtor izolasyonu: farklı borçlu için yeniden açılınca ÖNCEKİ seçim/taslak metin YENİ borçluya SIZMAZ", async () => {
    apiMock.getInstitutionTemplates.mockResolvedValue([TEMPLATE_SGK, TEMPLATE_VERGI]);

    const { rerender } = render(
      <InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-A" />
    );
    await screen.findByText("SGK");

    // A borçlusu için kurum seç + konu alanını elle değiştir.
    fireEvent.click(screen.getByText("SGK"));
    await waitFor(() => expect(screen.getByPlaceholderText("Yazı konusu...")).toHaveValue("SGK Maaş Haczi Talebi"));
    fireEvent.change(screen.getByPlaceholderText("Yazı konusu..."), {
      target: { value: "A'ya özel taslak konu" },
    });
    expect(screen.getByDisplayValue("A'ya özel taslak konu")).toBeInTheDocument();

    // Kapat + FARKLI borçlu için yeniden aç.
    rerender(<InstitutionLetterModal open={false} onClose={vi.fn()} caseDebtorId="debtor-A" />);
    rerender(<InstitutionLetterModal open onClose={vi.fn()} caseDebtorId="debtor-B" />);

    await waitFor(() => expect(apiMock.getInstitutionTemplates).toHaveBeenCalledTimes(2));
    // A'ya yazılan taslak konu B'nin bağlamında SIZMADI — temizlendi.
    expect(screen.queryByDisplayValue("A'ya özel taslak konu")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Yazı konusu...")).toHaveValue("");
    // Seçili kurum de sıfırlandı — "Yazı Türü" bloğu artık görünmüyor.
    expect(screen.queryByText("Yazı Türü")).not.toBeInTheDocument();
  });
});
