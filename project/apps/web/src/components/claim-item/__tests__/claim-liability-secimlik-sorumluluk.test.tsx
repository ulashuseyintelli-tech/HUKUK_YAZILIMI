/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — ekranlar (karar günlüğü 2026-11-15).
 *
 * AT-6  Borçlu kartı: seçimsiz kalem "Belirlenmedi"; kesin toplam ile belirlenmemiş toplam AYRI; dosya toplamı borçlu
 *       satırlarından toplanmıyor; tavanlı kalemde borçlu toplamı "belirlenemedi".
 * AT-17 Tahsilat formu: önizleme borçlunun kapasitesini ve aşan tutarı KAYITTAN ÖNCE gösterir; haciz kaynağında engel.
 * AT-26 Seçim: dört seçenek ön seçimsiz; müteselsil kısa yolu dayanak ve onay ister; dosya toplamı tek rakam; geçmiş
 *       görünür; bayrak kapalıyken giriş yok.
 *
 * İstemci HESAP YAPMAZ: bütün rakamlar sunucu yanıtından gösterilir. Tutarlar SENTETİKTİR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  getCaseClaimLiability: vi.fn(),
  previewClaimLiability: vi.fn(),
  requestClaimLiability: vi.fn(),
  getClaimLiabilityHistory: vi.fn(),
  getCaseDebtorLedgerBalances: vi.fn(),
  completeCollectionAllocation: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  previewCasePayment: vi.fn(),
  cancelCollection: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { ClaimItemPanel } from "../ClaimItemPanel";
import { formatShare } from "../ClaimLiabilitySelectionDrawer";
import { DebtorLedgerBalanceCard } from "../../debtor/DebtorLedgerBalanceCard";
import { CollectionModal } from "../../finance/CollectionModal";

const NOTES = { belirlenmedi: "belirlenmedi notu", tavanKapsami: "Tavan yalnız bu kalemin kayıtlı tutarını kapsar.", asanOdeme: "Aşan ödeme başka borçluya aktarılmaz.", isleyenFaiz: "İşleyen faiz borçlu bazında gösterilmez." };

const liabilityState = (secimYazmaAcik: boolean) => ({
  kalemler: [
    {
      claimItemId: "k1", kalemTuru: "PRINCIPAL", aciklama: "Sentetik anapara", paraBirimi: "TRY", kalemDurumu: "ACTIVE",
      sorumlulukTuru: "BELIRLENMEDI", secimId: null, secimSurumu: null, tavanKapsami: null, tutar: 12000, tahsilEdilen: 0,
      ortakKalan: 12000, atifsizMahsup: 0, uzlasiyor: true, engeller: [], borcluGerekli: false, taraflar: [],
    },
    {
      claimItemId: "k2", kalemTuru: "EXPENSE", aciklama: "Sentetik masraf", paraBirimi: "TRY", kalemDurumu: "ACTIVE",
      sorumlulukTuru: "PAYLI", secimId: "s1", secimSurumu: 1, tavanKapsami: null, tutar: 1000, tahsilEdilen: 0,
      ortakKalan: 1000, atifsizMahsup: 0, uzlasiyor: true, engeller: [], borcluGerekli: true, taraflar: [],
    },
  ],
  borclular: [
    { caseDebtorId: "cd-1", debtorId: "b1", ad: "Sentetik Borçlu 1", rol: "ASIL_BORCLU", etkin: true },
    { caseDebtorId: "cd-2", debtorId: "b2", ad: "Sentetik Borçlu 2", rol: "ASIL_BORCLU", etkin: true },
    { caseDebtorId: "cd-3", debtorId: "b3", ad: "Edilgen Borçlu", rol: "ASIL_BORCLU", etkin: false },
  ],
  dosyaKalani: [{ paraBirimi: "TRY", kalan: 13000 }],
  borcluGerekli: true,
  secimYazmaAcik,
  aciklamalar: NOTES,
});

const totals = { principal: 12000, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 1000, fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 13000 };
const ITEMS = [
  { id: "k1", itemType: "PRINCIPAL", amount: 12000, currency: "TRY", description: "Sentetik anapara", status: "ACTIVE", isCalculated: false },
  { id: "k2", itemType: "EXPENSE", amount: 1000, currency: "TRY", description: "Sentetik masraf", status: "ACTIVE", isCalculated: false },
];

function panelYanitlari(secimYazmaAcik: boolean) {
  const summary = {
    caseId: "case-1", currency: "TRY", items: [], totals, calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: 2, totals }],
    },
  };
  apiMock.get.mockImplementation((url: string) => Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: ITEMS } }));
  apiMock.getCaseClaimLiability.mockResolvedValue(liabilityState(secimYazmaAcik));
  apiMock.getClaimLiabilityHistory.mockResolvedValue({
    surumler: [
      { id: "s0", claimItemId: "k1", surum: 1, tur: "MUTESELSIL", durum: "SUPERSEDED", tavanKapsami: null, dayanak: "CONTRACT", dayanakNotu: null, kararZamani: "2026-03-01T09:00:00.000Z", onayTalebiId: "a1", uygulamaTuru: "SINGLE", kapanmaZamani: "2026-03-02T09:00:00.000Z", taraflar: [{ caseDebtorId: "cd-1", ad: "Sentetik Borçlu 1", payAgirligi: null, tavan: null, sinirsiz: false }] },
    ],
  });
}

const previewYaniti = (uygulanabilir: boolean, engeller: unknown[] = []) => ({
  caseId: "case-1", uygulamaTuru: "SINGLE", uygulanabilir, onizlemeOzeti: "ozet-1", aciklamalar: {},
  kalemler: [
    {
      claimItemId: "k1", kalemTuru: "PRINCIPAL", aciklama: "Sentetik anapara", paraBirimi: "TRY", tutar: 12000, tahsilEdilen: 4000, ortakKalan: 8000,
      oncekiTur: "MUTESELSIL", oncekiSecimSurumu: 1, sonrakiTur: "PAYLI", girdiHatalari: [], engeller, degisiklikYok: false,
      borclular: [
        { caseDebtorId: "cd-1", debtorId: "b1", ad: "Sentetik Borçlu 1", borcluHesabinaMahsup: 4000, oncekiKalanSorumluluk: 8000, sonrakiKalanSorumluluk: 2000, sonrakiPay: 6000, sonrakiTavan: null, sonrakiSinirsiz: false },
        { caseDebtorId: "cd-2", debtorId: "b2", ad: "Sentetik Borçlu 2", borcluHesabinaMahsup: 0, oncekiKalanSorumluluk: 8000, sonrakiKalanSorumluluk: 6000, sonrakiPay: 6000, sonrakiTavan: null, sonrakiSinirsiz: false },
      ],
    },
  ],
});

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});
afterEach(() => cleanup());

describe("AT-26 kalem paneli ve seçim çekmecesi", () => {
  it("seçimsiz kalem 'Belirlenmedi' etiketiyle görünür; dosya toplamı tek rakamdır", async () => {
    panelYanitlari(true);
    render(<ClaimItemPanel caseId="case-1" />);
    await screen.findByText("Alacak Kalemleri (2)");
    await waitFor(() => expect(screen.getByTestId("claim-item-liability-k1").textContent).toBe("Sorumluluk: Belirlenmedi"));
    expect(screen.getByTestId("claim-item-liability-k2").textContent).toBe("Sorumluluk: Paylı");
    expect(apiMock.getCaseClaimLiability).toHaveBeenCalledWith("case-1");
  });

  it("bayrak kapalıyken etiket görünür ama seçim girişi YOKTUR; salt okunur panelde de yoktur", async () => {
    panelYanitlari(false);
    render(<ClaimItemPanel caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId("claim-item-liability-k1")).toBeTruthy());
    expect(screen.queryByTestId("claim-item-liability-select-k1")).toBeNull();
    expect(screen.queryByTestId("claim-liability-bulk-actions")).toBeNull();
    cleanup();
    panelYanitlari(true);
    render(<ClaimItemPanel caseId="case-1" readOnly />);
    await waitFor(() => expect(screen.getByTestId("claim-item-liability-k1")).toBeTruthy());
    expect(screen.queryByTestId("claim-item-liability-select-k1")).toBeNull();
  });

  it("dosya sayfasındaki kullanım (salt okunur + düzenleme kipi): kalem ekleme gizli kalır ama seçim girişi GÖRÜNÜR ve çekmece açılır", async () => {
    // Dosya sayfası paneli `readOnly metadataEdit` ile kullanır. Seçim onaya giden bir taleptir; düzenleme kipine bağlıdır.
    panelYanitlari(true);
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await waitFor(() => expect(screen.getByTestId("claim-item-liability-select-k1")).toBeTruthy());
    expect(screen.getByTestId("claim-liability-bulk-actions")).toBeTruthy();
    expect(screen.queryByText("Ana Para Ekle")).toBeNull();
    fireEvent.click(screen.getByTestId("claim-item-liability-select-k1"));
    expect(await screen.findByTestId("claim-liability-drawer")).toBeTruthy();
    // Bayrak kapalıysa aynı kipte de giriş yoktur
    cleanup();
    panelYanitlari(false);
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await waitFor(() => expect(screen.getByTestId("claim-item-liability-k1")).toBeTruthy());
    expect(screen.queryByTestId("claim-item-liability-select-k1")).toBeNull();
    expect(screen.queryByTestId("claim-liability-bulk-actions")).toBeNull();
  });

  it("sorumluluk durumu okunamazsa panel aynen çalışır (etiket gösterilmez)", async () => {
    panelYanitlari(true);
    apiMock.getCaseClaimLiability.mockRejectedValue(new Error("404"));
    render(<ClaimItemPanel caseId="case-1" />);
    await screen.findByText("Alacak Kalemleri (2)");
    expect(screen.queryByTestId("claim-item-liability-k1")).toBeNull();
    expect(screen.getByText("Sentetik anapara")).toBeTruthy();
  });

  it("dört seçenek ön seçimsizdir; önizleme olmadan onaya gönderilemez; önce / sonra sunucudan gösterilir; geçmiş görünür", async () => {
    panelYanitlari(true);
    apiMock.previewClaimLiability.mockResolvedValue(previewYaniti(true));
    apiMock.requestClaimLiability.mockResolvedValue({ applied: false, approvalRequired: true, approvalRequestId: "a2", status: "PENDING_APPROVAL" });
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-k1"));
    await screen.findByTestId("claim-liability-drawer");
    for (const mode of ["JOINT_AND_SEVERAL", "PROPORTIONAL", "CAPPED", "UNDETERMINED"]) {
      expect((screen.getByTestId(`claim-liability-mode-${mode}`) as HTMLInputElement).checked).toBe(false);
    }
    expect((screen.getByTestId("claim-liability-preview-button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("claim-liability-user-choice-note").textContent).toContain("kullanıcı tercihidir");
    // Edilgen borçlu seçenekte yok; hiçbir borçlu ön seçili değil
    fireEvent.click(screen.getByTestId("claim-liability-mode-PROPORTIONAL"));
    expect(screen.queryByText("Edilgen Borçlu")).toBeNull();
    expect((screen.getByTestId("claim-liability-party-cd-1") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-1"));
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-2"));
    fireEvent.click(screen.getByTestId("claim-liability-share-equal"));
    fireEvent.change(screen.getByTestId("claim-liability-basis"), { target: { value: "CONTRACT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    expect(apiMock.previewClaimLiability).toHaveBeenCalledWith("case-1", [
      { claimItemId: "k1", mode: "PROPORTIONAL", basis: "CONTRACT", parties: [{ caseDebtorId: "cd-1", shareWeight: 1 }, { caseDebtorId: "cd-2", shareWeight: 1 }] },
    ]);
    const rows = screen.getAllByTestId("claim-liability-preview-row").map((row) => row.textContent);
    expect(rows[0]).toContain("Sentetik Borçlu 1");
    expect(rows[0]).toContain("4.000,00 TRY");
    expect(rows[0]).toContain("8.000,00 TRY");
    expect(rows[0]).toContain("2.000,00 TRY");
    expect(rows[1]).toContain("6.000,00 TRY");
    // Geçmiş görünür
    expect((await screen.findByTestId("claim-liability-history")).textContent).toContain("Sürüm 1 — Müteselsil");
    // Form değişirse önizleme düşer; onaya yalnız önizlenen seçim gider
    fireEvent.change(screen.getByTestId("claim-liability-basis"), { target: { value: "STATUTE" } });
    expect(screen.queryByTestId("claim-liability-preview")).toBeNull();
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    fireEvent.click(screen.getByTestId("claim-liability-request-button"));
    await waitFor(() => expect(apiMock.requestClaimLiability).toHaveBeenCalledTimes(1));
    expect(apiMock.requestClaimLiability.mock.calls[0][1]).toMatchObject({ onizlemeOzeti: "ozet-1" });
    expect((await screen.findByTestId("claim-liability-notice")).textContent).toContain("onaya gönderildi");
    expect(screen.queryByTestId("claim-liability-drawer")).toBeNull();
  });

  it("geçmişte pay okunur yazılır (yüzde ya da kesir; ham ağırlık DEĞİL); 'Tavan yok' işaretliyken tavan kutusu boş görünür ve gönderilmez", async () => {
    panelYanitlari(true);
    const surum = (over: Record<string, unknown>) => ({
      claimItemId: "k1", tur: "PAYLI", tavanKapsami: null, dayanak: "CONTRACT", dayanakNotu: null, onayTalebiId: "a1", uygulamaTuru: "SINGLE", kapanmaZamani: null, ...over,
    });
    const taraf = (n: number, payAgirligi: number) => ({ caseDebtorId: `cd-${n}`, ad: `Sentetik Borçlu ${n}`, payAgirligi, tavan: null, sinirsiz: false });
    apiMock.getClaimLiabilityHistory.mockResolvedValue({
      surumler: [
        surum({ id: "s2", surum: 2, durum: "ACTIVE", kararZamani: "2026-03-03T09:00:00.000Z", taraflar: [taraf(1, 6000), taraf(2, 4000)] }),
        surum({ id: "s1", surum: 1, durum: "SUPERSEDED", kararZamani: "2026-03-01T09:00:00.000Z", taraflar: [taraf(1, 1), taraf(2, 1), taraf(3, 1)] }),
      ],
    });
    apiMock.previewClaimLiability.mockResolvedValue(previewYaniti(true));
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-k1"));
    const historyText = (await screen.findByTestId("claim-liability-history")).textContent ?? "";
    expect(historyText).toContain("Sentetik Borçlu 1 (pay %60,00)");
    expect(historyText).toContain("Sentetik Borçlu 2 (pay %40,00)");
    // Üçte bir iki ondalıkla tam yazılamaz: yuvarlanmış yüzde yerine kesir.
    expect(historyText).toContain("Sentetik Borçlu 3 (pay 1 / 3)");
    expect(historyText).not.toContain("ağırlık");

    fireEvent.click(screen.getByTestId("claim-liability-mode-CAPPED"));
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-1"));
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-2"));
    const limit2 = () => screen.getByTestId("claim-liability-limit-cd-2") as HTMLInputElement;
    fireEvent.change(screen.getByTestId("claim-liability-limit-cd-1"), { target: { value: "2000" } });
    fireEvent.change(limit2(), { target: { value: "3000" } });
    fireEvent.click(screen.getByTestId("claim-liability-unlimited-cd-2"));
    expect(limit2().disabled).toBe(true);
    expect(limit2().value).toBe("");
    fireEvent.change(screen.getByTestId("claim-liability-basis"), { target: { value: "COURT_JUDGMENT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    expect(apiMock.previewClaimLiability).toHaveBeenLastCalledWith("case-1", [
      expect.objectContaining({ claimItemId: "k1", mode: "CAPPED", parties: [{ caseDebtorId: "cd-1", limitAmount: "2000" }, { caseDebtorId: "cd-2", unlimited: true }] }),
    ]);
    // İşaret kaldırılınca yazılan değer geri gelir (kaybolmaz).
    fireEvent.click(screen.getByTestId("claim-liability-unlimited-cd-2"));
    expect(limit2().disabled).toBe(false);
    expect(limit2().value).toBe("3000");
  });

  it("formatShare: tam ifade edilebilen oran yüzde, edilemeyen kesir; geçersiz toplamda ham değer", () => {
    expect(formatShare(6000, 10000)).toBe("%60,00");
    expect(formatShare(1, 2)).toBe("%50,00");
    expect(formatShare(1, 8)).toBe("%12,50");
    expect(formatShare(1, 3)).toBe("1 / 3");
    expect(formatShare(2, 3)).toBe("2 / 3");
    expect(formatShare(5, 0)).toBe("5");
  });

  it("engel varsa işlem DURUR: engel açıkça yazılır, onaya gönder kapalı kalır", async () => {
    panelYanitlari(true);
    apiMock.previewClaimLiability.mockResolvedValue(
      previewYaniti(false, [{ kod: "UNATTRIBUTED_COLLECTION", debtorId: null, borcluAdi: null, tutar: 4000, sinir: null }]),
    );
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-k1"));
    fireEvent.click(await screen.findByTestId("claim-liability-mode-PROPORTIONAL"));
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    const blocker = await screen.findByTestId("claim-liability-blocker");
    expect(blocker.textContent).toContain("hangi borçlu hesabına yapıldığı kayıtlı değil");
    expect(blocker.textContent).toContain("4.000,00 TRY");
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
    expect(apiMock.requestClaimLiability).not.toHaveBeenCalled();
  });

  it("müteselsil kısa yolu: tür ve etkin borçlular seçili gelir ama dayanak ve onay YİNE istenir; toplu uygulama tek taleptir", async () => {
    panelYanitlari(true);
    apiMock.previewClaimLiability.mockResolvedValue({ ...previewYaniti(true), uygulamaTuru: "BULK" });
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-liability-bulk-joint-button"));
    await screen.findByTestId("claim-liability-drawer");
    expect((screen.getByTestId("claim-liability-mode-JOINT_AND_SEVERAL") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("claim-liability-party-cd-1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("claim-liability-party-cd-2") as HTMLInputElement).checked).toBe(true);
    // Dayanak boş; hiçbir şey kendiliğinden gönderilmedi
    expect((screen.getByTestId("claim-liability-basis") as HTMLSelectElement).value).toBe("");
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
    expect(apiMock.previewClaimLiability).not.toHaveBeenCalled();
    expect(apiMock.requestClaimLiability).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("claim-liability-basis"), { target: { value: "COURT_JUDGMENT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    // İki etkin kalem tek istekte
    expect(apiMock.previewClaimLiability.mock.calls[0][1].map((s: { claimItemId: string }) => s.claimItemId)).toEqual(["k1", "k2"]);
    expect(apiMock.previewClaimLiability.mock.calls[0][1][0]).toMatchObject({ mode: "JOINT_AND_SEVERAL", basis: "COURT_JUDGMENT", parties: [{ caseDebtorId: "cd-1" }, { caseDebtorId: "cd-2" }] });
  });

  it("toplu uygulamada etkin seçimiyle aynı olan kalem ATLANIR: düğme açık kalır, hangi kalemin atlanacağı ve kaç kalemin gönderileceği yazar", async () => {
    panelYanitlari(true);
    const base = previewYaniti(true).kalemler[0];
    apiMock.previewClaimLiability.mockResolvedValue({
      ...previewYaniti(true),
      uygulamaTuru: "BULK",
      uygulanabilir: true,
      uygulanacakKalemSayisi: 1,
      atlananKalemSayisi: 1,
      kalemler: [
        { ...base, claimItemId: "k1", aciklama: "Sentetik anapara", oncekiTur: "MUTESELSIL", sonrakiTur: "MUTESELSIL", degisiklikYok: true },
        { ...base, claimItemId: "k2", aciklama: "Sentetik masraf", oncekiTur: "BELIRLENMEDI", sonrakiTur: "MUTESELSIL", degisiklikYok: false },
      ],
    });
    apiMock.requestClaimLiability.mockResolvedValue({
      applied: false, approvalRequired: true, approvalRequestId: "a9", status: "PENDING_APPROVAL", uygulanacakKalemSayisi: 1, atlananKalemler: ["k1"],
    });
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-liability-bulk-joint-button"));
    fireEvent.change(await screen.findByTestId("claim-liability-basis"), { target: { value: "COURT_JUDGMENT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    expect(screen.getAllByTestId("claim-liability-no-change").map((node) => node.textContent)).toEqual([
      "Seçim mevcut durumla aynı; bu kalem atlanır (talebe girmez).",
    ]);
    expect(screen.getByTestId("claim-liability-skip-summary").textContent).toBe(
      "1 kalem onaya gönderilecek; 1 kalem zaten aynı seçimde olduğu için atlanacak.",
    );
    const requestButton = screen.getByTestId("claim-liability-request-button") as HTMLButtonElement;
    expect(requestButton.disabled).toBe(false);
    fireEvent.click(requestButton);
    await waitFor(() => expect(apiMock.requestClaimLiability).toHaveBeenCalledTimes(1));
    // İstemci kalem ayıklamaz: önizlenen seçimlerin tamamı gider, atlamayı sunucu yapar.
    expect(apiMock.requestClaimLiability.mock.calls[0][1].selections.map((row: { claimItemId: string }) => row.claimItemId)).toEqual(["k1", "k2"]);
    const notice = (await screen.findByTestId("claim-liability-notice")).textContent ?? "";
    expect(notice).toContain("1 kalem için onaya gönderildi");
    expect(notice).toContain("1 kalem zaten aynı seçimde olduğu için atlandı");
  });

  it("toplu uygulamada bütün kalemler zaten aynı seçimdeyse talep gönderilemez ve nedeni yazar; tek kalemde özet satırı çizilmez", async () => {
    panelYanitlari(true);
    const base = previewYaniti(true).kalemler[0];
    apiMock.previewClaimLiability.mockResolvedValueOnce({
      ...previewYaniti(false),
      uygulamaTuru: "BULK",
      uygulanacakKalemSayisi: 0,
      atlananKalemSayisi: 2,
      kalemler: [
        { ...base, claimItemId: "k1", oncekiTur: "MUTESELSIL", sonrakiTur: "MUTESELSIL", degisiklikYok: true },
        { ...base, claimItemId: "k2", aciklama: "Sentetik masraf", oncekiTur: "MUTESELSIL", sonrakiTur: "MUTESELSIL", degisiklikYok: true },
      ],
    });
    const { unmount } = render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-liability-bulk-joint-button"));
    fireEvent.change(await screen.findByTestId("claim-liability-basis"), { target: { value: "COURT_JUDGMENT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    expect(screen.getAllByTestId("claim-liability-no-change").map((node) => node.textContent)).toEqual([
      "Seçim mevcut durumla aynı; değişiklik yok.",
      "Seçim mevcut durumla aynı; değişiklik yok.",
    ]);
    expect(screen.getByTestId("claim-liability-skip-summary").textContent).toBe("Seçilen kalemlerin hepsi zaten bu seçimde; gönderilecek değişiklik yok.");
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
    unmount();

    // Tek kalem: "değişiklik yok" satırı yeter; özet satırı yok.
    panelYanitlari(true);
    apiMock.previewClaimLiability.mockResolvedValueOnce({
      ...previewYaniti(false),
      uygulanacakKalemSayisi: 0,
      atlananKalemSayisi: 1,
      kalemler: [{ ...base, oncekiTur: "MUTESELSIL", sonrakiTur: "MUTESELSIL", degisiklikYok: true }],
    });
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-k1"));
    fireEvent.click(await screen.findByTestId("claim-liability-mode-JOINT_AND_SEVERAL"));
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-1"));
    fireEvent.click(screen.getByTestId("claim-liability-party-cd-2"));
    fireEvent.change(screen.getByTestId("claim-liability-basis"), { target: { value: "CONTRACT" } });
    fireEvent.click(screen.getByTestId("claim-liability-preview-button"));
    await screen.findByTestId("claim-liability-preview");
    expect(screen.getByTestId("claim-liability-no-change").textContent).toBe("Seçim mevcut durumla aynı; değişiklik yok.");
    expect(screen.queryByTestId("claim-liability-skip-summary")).toBeNull();
    expect((screen.getByTestId("claim-liability-request-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("tutarla sınırlı seçilince tavanın yalnız kalem tutarını kapsadığı açıkça yazar; 'kefalet' sözcüğü kullanılmaz", async () => {
    panelYanitlari(true);
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-k1"));
    fireEvent.click(await screen.findByTestId("claim-liability-mode-CAPPED"));
    expect(screen.getByTestId("claim-liability-cap-scope-note").textContent).toContain("yalnız bu kalemin kayıtlı tutarını kapsar");
    expect(screen.getByTestId("claim-liability-drawer").textContent?.toLocaleLowerCase("tr-TR")).not.toContain("kefalet");
  });
});

describe("AT-6 borçlu kartı", () => {
  const kalem = (id: string, aciklama: string, sorumluluk: Record<string, unknown>, kalan: number) => ({
    claimItemId: id, kalemTuru: "PRINCIPAL", aciklama, paraBirimi: "TRY", tutar: 10000, tahsilEdilen: 0, kalan, ortak: true, sorumluluk,
  });
  const s = (tur: string, extra: Record<string, unknown> = {}) => ({
    tur, secimSurumu: null, pay: null, tavan: null, sinirsiz: false, tavanKapsami: null, borcluHesabinaMahsup: 0, kalanSorumluluk: null, ortakKalan: 0, uzlasiyor: true, ...extra,
  });

  it("seçimsiz kalem 'Belirlenmedi'; kesin toplam ile belirlenmemiş toplam ayrı; dosya kalanı borçlu satırlarından toplanmaz", async () => {
    apiMock.getCaseDebtorLedgerBalances.mockResolvedValue({
      kaynak: "KALICI_DEFTER", isleyenFaizDahil: false, not: "işleyen faiz HARİÇTİR", sorumlulukNotu: "sorumluluk notu",
      borclular: [
        {
          caseDebtorId: "cd-1", debtorId: "b1", ad: "Sentetik Borçlu 1", rol: "ASIL_BORCLU", toplamDurumu: "HESAPLANDI",
          kalemler: [
            kalem("k1", "Sentetik anapara", s("BELIRLENMEDI", { ortakKalan: 9200 }), 9200),
            kalem("k2", "Sentetik masraf", s("PAYLI", { pay: 5400, borcluHesabinaMahsup: 400, kalanSorumluluk: 5000, ortakKalan: 8000, secimSurumu: 1 }), 8000),
          ],
          toplamlar: [{ paraBirimi: "TRY", tutar: 15400, tahsilEdilen: 400, kalan: 14200 }],
          sorumlulukOzeti: {
            kesinSorumluluk: { durum: "HESAPLANDI", neden: null, toplamlar: [{ paraBirimi: "TRY", kalan: 5000 }] },
            belirlenmemisOrtakKalan: [{ paraBirimi: "TRY", kalan: 9200 }],
          },
        },
      ],
      sorumlusuBulunamayanKalemler: [],
      mahsubuBekleyenTahsilatlar: [],
      dosyaKalani: [{ paraBirimi: "TRY", kalan: 17200 }],
    });
    render(<DebtorLedgerBalanceCard caseId="case-1" caseDebtorId="cd-1" />);
    await waitFor(() => expect(screen.getAllByTestId("debtor-ledger-line")).toHaveLength(2));
    const lines = screen.getAllByTestId("debtor-ledger-line").map((line) => line.textContent);
    expect(lines[0]).toContain("(Belirlenmedi)");
    expect(lines[0]).toContain("ortak kalan 9.200,00 TRY");
    expect(lines[1]).toContain("Paylı — pay 5.400,00 TRY");
    expect(lines[1]).toContain("kalan sorumluluk 5.000,00 TRY");
    // İki AYRI toplam; tek "Kalan" toplamı gösterilmez
    expect(screen.getByTestId("debtor-ledger-fixed-total").textContent).toContain("5.000,00 TRY");
    expect(screen.getByTestId("debtor-ledger-undetermined-total").textContent).toContain("9.200,00 TRY");
    expect(screen.queryByTestId("debtor-ledger-total")).toBeNull();
    // Dosya kalanı sunucudan gelen tek rakam (5.000 + 9.200 toplamı DEĞİL)
    expect(screen.getByTestId("debtor-ledger-file-total").textContent).toContain("17.200,00 TRY");
    expect(screen.getByTestId("debtor-ledger-file-total").textContent).not.toContain("14.200,00");
  });

  it("tavanlı kalemi olan borçluda borçlu toplamı 'belirlenemedi'; tavanın kapsamı yazar; kalem satırı görünür", async () => {
    apiMock.getCaseDebtorLedgerBalances.mockResolvedValue({
      kaynak: "KALICI_DEFTER", isleyenFaizDahil: false, not: "not",
      borclular: [
        {
          caseDebtorId: "cd-2", debtorId: "b2", ad: "Sentetik Borçlu 2", rol: "ASIL_BORCLU", toplamDurumu: "BELIRLENEMEDI",
          kalemler: [kalem("k1", "Sentetik anapara", s("TUTARLA_SINIRLI", { tavan: 8000, tavanKapsami: "ITEM_AMOUNT", borcluHesabinaMahsup: 3000, kalanSorumluluk: 5000, ortakKalan: 17000 }), 17000)],
          toplamlar: [],
          sorumlulukOzeti: { kesinSorumluluk: { durum: "BELIRLENEMEDI", neden: "TAVANLI_KALEM", toplamlar: [] }, belirlenmemisOrtakKalan: [] },
        },
      ],
      sorumlusuBulunamayanKalemler: [],
      mahsubuBekleyenTahsilatlar: [],
      dosyaKalani: [{ paraBirimi: "TRY", kalan: 17000 }],
    });
    render(<DebtorLedgerBalanceCard caseId="case-1" caseDebtorId="cd-2" />);
    await waitFor(() => expect(screen.getAllByTestId("debtor-ledger-line")).toHaveLength(1));
    expect(screen.getByTestId("debtor-ledger-line").textContent).toContain("tavan 8.000,00 TRY (yalnız bu kalemin tutarı)");
    expect(screen.getByTestId("debtor-ledger-fixed-total").textContent).toContain("belirlenemedi");
    expect(screen.getByTestId("debtor-ledger-fixed-total-reason").textContent).toContain("işleyen faiz ve diğer kalemler kapsam dışıdır");
  });
});

describe("AT-17 tahsilat formu önizlemesi", () => {
  const debtors = [
    { id: "cd-1", role: "ASIL_BORCLU", lifecycleStatus: "ACTIVE", debtor: { name: "Sentetik Borçlu 1" } },
    { id: "cd-2", role: "ASIL_BORCLU", lifecycleStatus: "ACTIVE", debtor: { name: "Sentetik Borçlu 2" } },
  ];
  const onizleme = (liability: Record<string, unknown>, acceptance: Record<string, unknown>) => ({
    nonPersistent: true, caseId: "case-1", input: { amount: 900, currency: "TRY", caseDebtorId: "cd-1" },
    acceptance: { wouldAccept: true, blockingReasons: [], warnings: [], ...acceptance },
    balanceImpact: { currentOutstandingAmount: 500, paymentAmount: 900, appliedAmount: 500, overpaymentAmount: 400, projectedOutstandingAmount: 0 },
    distributionPreview: { status: "HELD_PENDING_DISTRIBUTION", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    liability: { shareOrCapBound: true, debtorCapacityAmount: 500, excessAmount: 400, refundCommandsAvailable: false, ...liability },
  });

  it("borçlu seçilmeden önizlemede mahsubun bekletileceği yazar; borçlu seçilince kapasite ve aşan tutar KAYITTAN ÖNCE gösterilir", async () => {
    apiMock.previewCasePayment.mockResolvedValueOnce({
      ...onizleme({}, { warnings: ["ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED"] }),
      liability: undefined,
    });
    apiMock.previewCasePayment.mockResolvedValueOnce(onizleme({ excessHandling: "DEBTOR_OVERPAYMENT_HELD" }, { warnings: ["LIABILITY_EXCESS_HELD_AS_DEBTOR_OVERPAYMENT"] }));
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} debtors={debtors} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    expect(await screen.findByText(/mahsup bekletilecek/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("collection-payer-select"), { target: { value: "cd-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    const box = await screen.findByTestId("collection-preview-liability");
    expect(box.textContent).toContain("500,00 TRY");
    const excess = screen.getByTestId("collection-preview-liability-excess").textContent;
    expect(excess).toContain("400,00 TRY");
    expect(excess).toContain("başka borçluya aktarılmaz");
    expect(excess).toContain("İade ve başka borca mahsup komutları bu sürümde yoktur");
    // Sorumluluk kutusu pencereyi uzatır: pencere kendi içinde kaymazsa "Ekle" / "İptal" ekran dışında kalır.
    const panel = screen.getByTestId("collection-modal-panel");
    expect(panel.className).toContain("max-h-[90vh]");
    expect(panel.className).toContain("overflow-y-auto");
    expect(panel.contains(screen.getByRole("button", { name: "Ekle" }))).toBe(true);
    expect(apiMock.previewCasePayment.mock.calls[1][1]).toMatchObject({ caseDebtorId: "cd-1", channel: expect.any(String) });
    expect(apiMock.createCollection).not.toHaveBeenCalled();
  });

  it("haciz kaynağında sınırı aşan ödeme: açıklayıcı engel ve tamamının bekletileceği kayıttan önce yazar", async () => {
    apiMock.previewCasePayment.mockResolvedValue(
      onizleme({ excessHandling: "ALLOCATION_HELD_LIMIT_EXCEEDED" }, { wouldAccept: false, blockingReasons: ["LIABILITY_LIMIT_EXCEEDED_RESTRICTED_SOURCE"] }),
    );
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} debtors={debtors} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "900" } });
    fireEvent.change(screen.getByTestId("collection-payer-select"), { target: { value: "cd-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    expect((await screen.findByTestId("collection-preview-liability-held")).textContent).toContain("tamamı mahsup bekletilir");
    expect(screen.getByText(/Haciz \/ icra dairesi kaynaklı bu ödeme seçilen borçlunun sorumluluğunu aşıyor/)).toBeTruthy();
    expect(apiMock.createCollection).not.toHaveBeenCalled();
  });

  it("dağıtım notu bekletmenin NEDENİNE göre yazar: sorumluluk aşımında 'borçlu girilip' demez; borçlu belirtilmemişse eski metin sürer", async () => {
    // Sorumluluk aşımı (borçlu zaten seçili) — sunucu dağıtımı engelli döner.
    apiMock.previewCasePayment.mockResolvedValueOnce({
      ...onizleme({ excessHandling: "ALLOCATION_HELD_LIMIT_EXCEEDED" }, { wouldAccept: false, blockingReasons: ["LIABILITY_LIMIT_EXCEEDED_RESTRICTED_SOURCE"] }),
      distributionPreview: { status: "BLOCKED", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    });
    // Borçlu belirtilmemiş bekletme — sorumluluk bilgisi yok.
    apiMock.previewCasePayment.mockResolvedValueOnce({
      ...onizleme({}, { warnings: ["ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED"] }),
      liability: undefined,
      distributionPreview: { status: "BLOCKED", source: "UNKNOWN", requiresClientSelection: false, lines: [] },
    });
    render(<CollectionModal isOpen onClose={vi.fn()} caseId="case-1" onSuccess={vi.fn()} debtors={debtors} />);
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "900" } });
    fireEvent.change(screen.getByTestId("collection-payer-select"), { target: { value: "cd-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    const limitNote = (await screen.findByTestId("collection-preview-distribution-blocked")).textContent ?? "";
    expect(limitNote).toContain("seçilen borçlunun sorumluluğunu aştığı için");
    expect(limitNote).toContain("borçlu hesabına mahsup edilebilir");
    expect(limitNote).not.toContain("borçlu girilip");

    fireEvent.change(screen.getByTestId("collection-payer-select"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Önizle/ }));
    await waitFor(() =>
      expect(screen.getByTestId("collection-preview-distribution-blocked").textContent).toContain("hesabına ödeme yapılan borçlu girilip"),
    );
  });
});
