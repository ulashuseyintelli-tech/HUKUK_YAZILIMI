import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalCaseDetailPage from "@/app/portal/cases/[id]/page";

/**
 * CLIENT-P2-U03-I01 + CLIENT-P2-U03-TRACK-A-I01 + CLIENT-P2-U03-TRACK-A-I02 +
 * CLIENT-P2-U03-TRACK-A-I03 — case-detail sayfasının, backend'in artık explicit-select ile
 * döndüğü daraltılmış response şekline uyumunu doğrular: onaylı alanlar render edilir,
 * kaldırılan description/lifecycle alanları sayfayı ÇÖKERTMEZ ve hiç render edilmez, mevcut
 * loading/404/hata davranışı DEĞİŞMEDİ. Track-A-I01: muvekkilNotu, 12-değerli DebtorRole
 * label-map (+ unexpected-value fallback), debtor lawyer name/barNo render. Track-A-I02:
 * curated `assetQuery` (4 kategori × 5 durum) render. Track-A-I03: Due'nun 14 onaylı alanı —
 * ana alacak işareti, dayanak belge, faiz bilgisi (yalnız saklı alanlar, hesaplama YOK),
 * KDV/BSMV/KKDF göstergeleri, kesinleşme bilgisi (inconsistent-state fail-closed).
 */
const pushMock = vi.fn();
const routerMock = { push: pushMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ id: "case-1" }),
}));

const APPROVED_CASE_DETAIL = {
  id: "case-1",
  fileNumber: "2026/123",
  executionFileNumber: "2026/456",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  workflowStage: "SEIZURE",
  caseDate: "2026-01-01T00:00:00.000Z",
  principalAmount: "1000",
  muvekkilNotu: "Dosyanız aktif olarak takip edilmektedir.",
  debtors: [
    {
      role: "ASIL_BORCLU",
      debtorLawyerName: "Ayşe Vekil",
      debtorLawyerBarNo: "34567",
      assetQuery: {
        vehicle: "FOUND",
        realEstate: "NOT_FOUND",
        bank: "RESULT_PENDING",
        sgkWage: "RESULT_UNAVAILABLE",
        lastQueryAt: "2026-06-15T10:00:00.000Z",
      },
      debtor: { name: "Ahmet Yılmaz", type: "PERSON" },
    },
  ],
  dues: [
    {
      id: "due-1",
      type: "ASIL_ALACAK",
      amount: "1000",
      dueDate: "2026-01-01T00:00:00.000Z",
      currency: "TRY",
      interestType: "YASAL",
      interestRate: "9.5",
      interestStartDate: "2026-01-01T00:00:00.000Z",
      interestEndDate: "2026-06-01T00:00:00.000Z",
      accruesInterest: true,
      sourceDocumentNo: "FTR-2026-001",
      hasKdv: true,
      kdvRate: "20",
      hasBsmv: false,
      hasKkdf: false,
      requiresFinalization: true,
      isFinalized: false,
      finalizationDate: null,
      isPrimary: true,
    },
  ],
};

function dueFixture(overrides: any = {}) {
  return {
    ...APPROVED_CASE_DETAIL,
    dues: [{ ...APPROVED_CASE_DETAIL.dues[0], ...overrides }],
  };
}

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("Portal case detail page — CLIENT-P2-U03-I01 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı case header alanları render edilir (fileNumber, executionFileNumber, caseStatus)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText(/İcra No: 2026\/456/)).toBeTruthy();
    expect(screen.getByText("Derdest")).toBeTruthy();
  });

  it("[1a] CLIENT-POL-F-R01: 'Toplam Alacak' (Σ Due.amount) kartı artık hiç render EDİLMEZ", async () => {
    // ÖNCEKİ HALİ POZİTİFTİ ("...render edilir") — CLIENT-POL-F-R01 ile negatife çevrildi.
    // §34.3 Track A'yı "yalnız SAKLI DEĞERLERİN AS-IS gösterimi (hiçbir hesaplama/türetme/
    // formül olmadan)" ile sınırlar; `dues.reduce(...)` ile üretilen toplam tam olarak
    // §34.3/§34.4'ün Track B'ye devrettiği "hesap dökümü/toplam"dır. §22.11 ayrıca
    // single-object finansal alanların aggregate total'a DÖNÜŞTÜRÜLMESİNİ yasaklar.
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
  });

  it("[1a2] CLIENT-POL-F-R01: çoklu Due kaleminin TOPLAMI hiçbir yerde görünmez (1000+2500=3500 sızmıyor)", async () => {
    // Fixture'ın tek Due'su ile toplam çakışmasın diye ikinci bir kalem eklenir:
    // böylece "toplam" değeri (3.500) tekil kalemlerin hiçbirine eşit olmaz.
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        dues: [
          APPROVED_CASE_DETAIL.dues[0],
          { ...APPROVED_CASE_DETAIL.dues[0], id: "due-2", type: "FAIZ", amount: "2500" },
        ],
      }),
    });
    const { container } = render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());

    const text = container.textContent ?? "";
    expect(text).not.toContain("3.500");
    expect(text).not.toContain("3500");
    // KORUNAN: tekil kalemler AS-IS görünmeye devam eder (§34.2 onaylı Due contract).
    expect(text).toContain("1.000");
    expect(text).toContain("2.500");
  });

  it("[1b] TRACK-B-U00: 'Tahsil Edilen' kartı artık hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
  });

  it("[1c] TRACK-B-U00: 'Tahsilat Oranı' kartı artık hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsilat Oranı")).toBeNull();
  });

  it("[1d] TRACK-B-U00: 'Tahsilatlar' ham tahsilat listesi bölümü artık hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsilatlar")).toBeNull();
    expect(screen.queryByText("Henüz tahsilat yok")).toBeNull();
  });

  it("[1e] TRACK-B-U00: response'ta eski/yabancı bir `collections` alanı olsa bile hiçbir tahsilat tutarı/oranı render edilmez (defansif — API artık göndermiyor, ama sayfa da hiç okumuyor)", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        collections: [{ id: "col-legacy", date: "2026-02-01T00:00:00.000Z", type: "BANKA", amount: "999999" }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText(/999999/)).toBeNull();
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
    expect(screen.queryByText("Tahsilat Oranı")).toBeNull();
    expect(screen.queryByText("BANKA")).toBeNull();
  });

  it("[1f] TRACK-B-U00: `collections` alanı response'ta hiç yokken (yeni gerçek sözleşme) sayfa güvenle render edilir, çökmez", async () => {
    const { collections: _removed, ...withoutCollections } = APPROVED_CASE_DETAIL as any;
    stubFetch({ ok: true, json: async () => withoutCollections });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    // CLIENT-POL-F-R01: eskiden burada 'Toplam Alacak' varlığı doğrulanıyordu; o kart
    // kaldırıldığı için artık kalan non-financial kart ('Aşama') üzerinden doğrulanır.
    expect(screen.getByText("Aşama")).toBeTruthy();
  });

  it("[1g] CLIENT-POL-F-R01: finansal kartlar kaldırıldıktan sonra boş placeholder render edilmez (yalnız 'Aşama' kalır)", async () => {
    // TRACK-B-U00 4→2, CLIENT-POL-F-R01 2→1 koloona indirdi; ikame değer/placeholder yok.
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    const { container } = render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    const statCards = container.querySelectorAll(".grid.grid-cols-1.gap-4 > div");
    expect(statCards.length).toBe(1);
    expect(screen.getByText("Aşama")).toBeTruthy();
    // Yanıltıcı sahte finansal değer de gösterilmemeli.
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("hesaplanamadı")).toBeNull();
  });

  it("[2] onaylı debtor alanları render edilir (debtor.name, debtor.type)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.getByText("Şahıs")).toBeTruthy();
  });

  it("[2a] TRACK-A-I01: muvekkilNotu doluyken 'Müvekkil Notu' bölümü render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Müvekkil Notu")).toBeTruthy());
    expect(screen.getByText("Dosyanız aktif olarak takip edilmektedir.")).toBeTruthy();
  });

  it("[2b] TRACK-A-I01: muvekkilNotu yok/boşken 'Müvekkil Notu' bölümü hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => ({ ...APPROVED_CASE_DETAIL, muvekkilNotu: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.queryByText("Müvekkil Notu")).toBeNull();
  });

  it.each([
    ["ASIL_BORCLU", "Asıl Borçlu"],
    ["MUTESELSIL_KEFIL", "Müteselsil Kefil"],
    ["CIRANTA", "Ciranta"],
    ["MUHATAP", "Muhatap"],
    ["MIRASCI", "Mirasçı"],
    ["TASFIYE_MEMURU", "Tasfiye Memuru"],
    ["IFLAS_MASASI", "İflas Masası"],
  ])("[2c-%s] TRACK-A-I01: DebtorRole '%s' → '%s' Türkçe etiketiyle render edilir", async (role, label) => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role, debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("[2d] TRACK-A-I01: beklenmeyen/gelecek bir DebtorRole değeri sayfayı ÇÖKERTMEZ, nötr fallback gösterir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "FUTURE_UNKNOWN_ROLE_X", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Hukuki Taraf")).toBeTruthy();
    expect(screen.queryByText("FUTURE_UNKNOWN_ROLE_X")).toBeNull();
  });

  it("[2e] TRACK-A-I01: debtor lawyer name + barNo ikisi de varsa birleşik gösterilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.getByText("Av. Ayşe Vekil (Baro No: 34567)")).toBeTruthy();
  });

  it("[2f] TRACK-A-I01: yalnız debtorLawyerName varsa yalnız isim gösterilir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtorLawyerName: "Ayşe Vekil", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Av. Ayşe Vekil")).toBeTruthy();
  });

  it("[2g] TRACK-A-I01: yalnız debtorLawyerBarNo varsa yalnız baro no gösterilir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtorLawyerBarNo: "34567", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Baro No: 34567")).toBeTruthy();
  });

  it("[2h] TRACK-A-I01: debtor lawyer name/barNo ikisi de yoksa boş placeholder satır render edilmez", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.queryByText(/^Av\./)).toBeNull();
    expect(screen.queryByText(/^Baro No:/)).toBeNull();
  });

  it("[2i] TRACK-A-I02: 4 kategori de (Araç/Gayrimenkul/Banka/SGK Maaşı) render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Malvarlığı Sorguları")).toBeTruthy());
    expect(screen.getByText("Araç: Bulgu Var")).toBeTruthy();
    expect(screen.getByText("Gayrimenkul: Bulgu Yok")).toBeTruthy();
    expect(screen.getByText("Banka: Sonuç Bekleniyor")).toBeTruthy();
    expect(screen.getByText("SGK Maaşı: Sonuç Şu An Belirlenemedi")).toBeTruthy();
  });

  it.each([
    ["NOT_QUERIED", "Sorgu Yapılmadı"],
    ["FOUND", "Bulgu Var"],
    ["NOT_FOUND", "Bulgu Yok"],
    ["RESULT_PENDING", "Sonuç Bekleniyor"],
    ["RESULT_UNAVAILABLE", "Sonuç Şu An Belirlenemedi"],
  ])("[2j-%s] TRACK-A-I02: curated durum '%s' → '%s' Türkçe etiketiyle render edilir", async (state, label) => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [
          {
            role: "ASIL_BORCLU",
            assetQuery: { vehicle: state, realEstate: "NOT_QUERIED", bank: "NOT_QUERIED", sgkWage: "NOT_QUERIED", lastQueryAt: null },
            debtor: { name: "Test Borçlu", type: "PERSON" },
          },
        ],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText(`Araç: ${label}`)).toBeTruthy();
  });

  it("[2k] TRACK-A-I02: lastQueryAt doluyken 'Son Malvarlığı Sorgu Güncellemesi' tam olarak bir kez render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Malvarlığı Sorguları")).toBeTruthy());
    expect(screen.getAllByText(/Son Malvarlığı Sorgu Güncellemesi:/)).toHaveLength(1);
  });

  it("[2l] TRACK-A-I02: lastQueryAt null iken timestamp satırı hiç render edilmez", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [
          {
            role: "ASIL_BORCLU",
            assetQuery: { vehicle: "NOT_QUERIED", realEstate: "NOT_QUERIED", bank: "NOT_QUERIED", sgkWage: "NOT_QUERIED", lastQueryAt: null },
            debtor: { name: "Test Borçlu", type: "PERSON" },
          },
        ],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.queryByText(/Son Malvarlığı Sorgu Güncellemesi:/)).toBeNull();
  });

  it("[2m] TRACK-A-I02: ham enum string'leri (YES/UNKNOWN/ERROR) hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Malvarlığı Sorguları")).toBeTruthy());
    expect(screen.queryByText(/^YES$/)).toBeNull();
    expect(screen.queryByText(/^UNKNOWN$/)).toBeNull();
    expect(screen.queryByText(/^ERROR$/)).toBeNull();
    expect(screen.queryByText(/^PENDING$/)).toBeNull();
  });

  it("[2n] TRACK-A-I02: assetQuery yokken (I01-only fixture) sayfa ÇÖKMEZ, bölüm render edilmez", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.queryByText("Malvarlığı Sorguları")).toBeNull();
  });

  it("[3] TRACK-B-U00: ham collection satırları (type/amount/date tablosu) artık hiç render edilmez — önceki 'collection satırları render edilir' testi negatife çevrildi", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsilatlar")).toBeNull();
    expect(screen.queryByText("Açıklama")).toBeNull();
  });

  it("[4] due satırları type/amount ile render edilir, description gösterilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
  });

  it("[4a] TRACK-A-I03: isPrimary=true → 'Ana Alacak Kalemi' işareti render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ana Alacak Kalemi")).toBeTruthy());
  });

  it("[4b] TRACK-A-I03: isPrimary=false → işaret render edilmez", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ isPrimary: false }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
    expect(screen.queryByText("Ana Alacak Kalemi")).toBeNull();
  });

  it("[4c] TRACK-A-I03: sourceDocumentNo doluyken 'Dayanak Belge' render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Dayanak Belge: FTR-2026-001")).toBeTruthy());
  });

  it("[4d] TRACK-A-I03: sourceDocumentNo yokken 'Dayanak Belge' hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ sourceDocumentNo: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
    expect(screen.queryByText(/^Dayanak Belge:/)).toBeNull();
  });

  it.each([
    ["YASAL", "Yasal Faiz"],
    ["SABIT", "Sabit Faiz"],
    ["AVANS", "Avans Faizi"],
    ["TEMERRUT", "Temerrüt Faizi"],
    ["YOKSUN", "Yoksun Kalınan Faiz"],
    ["TICARI", "Ticari Faiz"],
  ])("[4e-%s] TRACK-A-I03: interestType '%s' → 'Faiz Türü: %s' render edilir", async (raw, label) => {
    stubFetch({ ok: true, json: async () => dueFixture({ interestType: raw }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText(`Faiz Türü: ${label}`)).toBeTruthy());
  });

  it("[4f] TRACK-A-I03: beklenmeyen/gelecek bir interestType değeri sayfayı ÇÖKERTMEZ, nötr fallback gösterir", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ interestType: "FUTURE_UNKNOWN_TYPE_X" }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Faiz Türü: Faiz Türü Belirtilmemiş")).toBeTruthy());
    expect(screen.queryByText(/FUTURE_UNKNOWN_TYPE_X/)).toBeNull();
  });

  it("[4g] TRACK-A-I03: accruesInterest=true + tam saklı terimler (tür/oran/başlangıç/bitiş) hepsi render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Faiz Türü: Yasal Faiz")).toBeTruthy());
    expect(screen.getByText("Faiz Oranı: %9.5")).toBeTruthy();
    expect(screen.getByText(/Faiz Başlangıç Tarihi:/)).toBeTruthy();
    expect(screen.getByText(/Faiz Bitiş Tarihi:/)).toBeTruthy();
  });

  it("[4h] TRACK-A-I03: accruesInterest=true + kısmi/null terimler yalnız var olanlar render edilir, sayfa ÇÖKMEZ", async () => {
    stubFetch({
      ok: true,
      json: async () =>
        dueFixture({
          interestType: null,
          interestRate: null,
          interestStartDate: null,
          interestEndDate: null,
        }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
    expect(screen.queryByText(/^Faiz Türü:/)).toBeNull();
    expect(screen.queryByText(/^Faiz Oranı:/)).toBeNull();
    expect(screen.queryByText(/^Faiz Başlangıç Tarihi:/)).toBeNull();
    expect(screen.queryByText(/^Faiz Bitiş Tarihi:/)).toBeNull();
    expect(screen.queryByText("Faiz Uygulanmıyor")).toBeNull();
  });

  it("[4i] TRACK-A-I03: accruesInterest=false → 'Faiz Uygulanmıyor', saklı terimler (varsa) gösterilmez", async () => {
    stubFetch({
      ok: true,
      json: async () => dueFixture({ accruesInterest: false, interestType: "YASAL", interestRate: "9.5" }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Faiz Uygulanmıyor")).toBeTruthy());
    expect(screen.queryByText(/^Faiz Türü:/)).toBeNull();
    expect(screen.queryByText(/^Faiz Oranı:/)).toBeNull();
  });

  it("[4j] TRACK-A-I03: hiçbir faiz hesaplanan tutarı (tahakkuk eden faiz/güncel faiz/gün sayısı) hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Faiz Türü: Yasal Faiz")).toBeTruthy());
    expect(screen.queryByText(/[Tt]ahakkuk/)).toBeNull();
    expect(screen.queryByText(/gün say/i)).toBeNull();
  });

  it("[4k] TRACK-A-I03: KDV dahil + oran doluyken 'KDV Dahil (%oran)' render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("KDV Dahil (%20)")).toBeTruthy());
  });

  it("[4l] TRACK-A-I03: KDV dahil + oran yokken yalnız 'KDV Dahil' render edilir, hiçbir hesaplanan KDV tutarı gösterilmez", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ hasKdv: true, kdvRate: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("KDV Dahil")).toBeTruthy());
    expect(screen.queryByText(/^KDV Dahil \(/)).toBeNull();
  });

  it("[4m] TRACK-A-I03: hasBsmv=true → 'BSMV Uygulanıyor' render edilir", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ hasBsmv: true }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("BSMV Uygulanıyor")).toBeTruthy());
  });

  it("[4n] TRACK-A-I03: hasKkdf=true → 'KKDF Uygulanıyor' render edilir", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ hasKkdf: true }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("KKDF Uygulanıyor")).toBeTruthy());
  });

  it("[4o] TRACK-A-I03: hasKdv/hasBsmv/hasKkdf hepsi false → hiçbir vergi göstergesi render edilmez", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ hasKdv: false, kdvRate: null, hasBsmv: false, hasKkdf: false }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
    expect(screen.queryByText(/^KDV/)).toBeNull();
    expect(screen.queryByText("BSMV Uygulanıyor")).toBeNull();
    expect(screen.queryByText("KKDF Uygulanıyor")).toBeNull();
  });

  it("[4p] TRACK-A-I03: kesinleşme gerekiyor + henüz kesinleşmemiş → 'Kesinleşme Gerekiyor'", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ requiresFinalization: true, isFinalized: false, finalizationDate: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Kesinleşme Gerekiyor")).toBeTruthy());
  });

  it("[4q] TRACK-A-I03: kesinleşti + tarih doluyken 'Kesinleşti (tarih)' render edilir", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ requiresFinalization: true, isFinalized: true, finalizationDate: "2026-05-01T00:00:00.000Z" }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText(/^Kesinleşti \(/)).toBeTruthy());
  });

  it("[4r] TRACK-A-I03: tutarsız kayıt (isFinalized=false + finalizationDate dolu) fail-closed nötr metin gösterir, 'Kesinleşti' İDDİA ETMEZ", async () => {
    stubFetch({
      ok: true,
      json: async () => dueFixture({ requiresFinalization: true, isFinalized: false, finalizationDate: "2026-05-01T00:00:00.000Z" }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Kesinleşme Bilgisi Kontrol Ediliyor")).toBeTruthy());
    expect(screen.queryByText(/^Kesinleşti/)).toBeNull();
    expect(screen.queryByText("Kesinleşme Gerekiyor")).toBeNull();
  });

  it("[4s] TRACK-A-I03: requiresFinalization=false + isFinalized=false + tarih yok → hiçbir kesinleşme satırı render edilmez", async () => {
    stubFetch({ ok: true, json: async () => dueFixture({ requiresFinalization: false, isFinalized: false, finalizationDate: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
    expect(screen.queryByText("Kesinleşme Gerekiyor")).toBeNull();
    expect(screen.queryByText(/^Kesinleşti/)).toBeNull();
    expect(screen.queryByText("Kesinleşme Bilgisi Kontrol Ediliyor")).toBeNull();
  });

  it("[5] raw lifecycle timeline bölümü YOK (\"İşlem Geçmişi\" başlığı render edilmez)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("İşlem Geçmişi")).toBeNull();
  });

  it("[6] kaldırılan alanların (lifecycleEvents/description/id) yokluğu sayfayı ÇÖKERTMEZ", async () => {
    const minimalResponse = {
      fileNumber: "2026/999",
      caseStatus: "ISLEMDE",
      workflowStage: "INITIAL",
      debtors: [],
      dues: [],
    };
    stubFetch({ ok: true, json: async () => minimalResponse });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/999")).toBeTruthy());
    expect(screen.getByText("Borçlu bilgisi yok")).toBeTruthy();
    expect(screen.getByText("Alacak kalemi yok")).toBeTruthy();
  });

  it("[7a] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    stubFetch(new Promise(() => {}));
    const { container } = render(<PortalCaseDetailPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[7b] mevcut 404 davranışı korunur (/portal/cases'e yönlendirir)", async () => {
    stubFetch({ ok: false, status: 404 });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/cases"));
  });

  it("[7c] mevcut genel hata davranışı korunur (\"Dosya bulunamadı\" gösterilir)", async () => {
    stubFetch({ ok: false, status: 500 });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Dosya bulunamadı")).toBeTruthy());
  });
});
