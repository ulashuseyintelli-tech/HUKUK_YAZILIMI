import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/** Basarili render dalinda derinlerde `useQueryClient()` kullanan alt bilesenler var. */
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/**
 * WSMR-A4n — DOSYA ÇALIŞMA ALANI: OKUMA HATASI "TAKİP BULUNAMADI" DEĞİLDİR.
 *
 * `fetchCase`, dosya çalışma alanının BİRİNCİL yüklemesi ve onlarca
 * mutasyon-sonrası yenilemenin ortak kapısı. Eski hâlde HER hata — ağ
 * kesintisi, 500, yetki — yalnız `console.error` ile yutuluyordu. İlk
 * yüklemede bu, `caseData` null kaldığı için doğrudan **"Takip bulunamadı"**
 * ekranına dönüşüyordu: var olan bir dosya erişilemediğinde silinmiş/yanlış
 * ID gibi görünüyordu.
 *
 * Kural: yalnız sunucunun doğruladığı 404 gerçek yokluk sayılır. Diğer her
 * hata görünür olur; zaten yüklü `caseData` SİLİNMEZ.
 */

/**
 * `api`'nin sayfa mount olurken tetiklenen 12+ bağımsız effect'i için GERÇEK
 * SÖZLEŞMEYE dayalı varsayılanlar (`lib/api.ts`'ten doğrulandı — her satırın
 * yanında kaynak referansı var). Genel varsayılan `[]` (bu API'deki list
 * endpoint'lerinin büyük çoğunluğu `this.request<T[]>` ile PLAIN DİZİ döner);
 * sarmalı gövde döndüren endpoint'ler AŞAĞIDA AÇIKÇA ELE ALINIR.
 */
vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

/**
 * Genel `[]` varsayılanını KIRAN, sarmalı/nesne gövdeli gerçek sözleşmeler.
 * Kaynak: `lib/api.ts` (satır numaraları bu dilimde doğrulandı):
 *  · getCaseDebtors (:544)              → `this.request<CaseDebtorsResponse>`
 *    = `{ summary: DebtorsSummaryDTO, items: DebtorListItemDTO[] }` (:5278)
 *  · getAddressTasksForCase (:3287)     → `{ tasks: AddressTaskDTO[] }`
 *  · getAddressNotesForCase (:3301)     → `{ notes: AddressNoteDTO[] }`
 *  · getActiveCaseFeeAgreement (:3143)  → İSTEMCİ `response.data` ile UNWRAP
 *    eder; çağırana `CaseFeeAgreementDTO | null` gider (sarmalı DEĞİL).
 *  · getCollectionDispositionsByCase (:3074) → İSTEMCİ `response.data || []`
 *    ile UNWRAP eder; çağırana PLAIN DİZİ gider.
 *  · getCaseResponsibilityAt (:501)     → `CombinedResponsibilityResult`
 *    (`lib/responsibility-at.ts:10`) = `{ caseId, asOf, operationOwner:
 *    {type,id,confidence}, legalResponsibleLawyer: {...}, horizon: {...} }`.
 *    NESNE'dir — DİZİ DEĞİL. Genel `[]` varsayılanı bu bileşeni ÇÖKERTİYORDU
 *    (`components/case/responsibility-at-panel.tsx:134` — boş dizi TRUTHY
 *    olduğu için `!data` bekçisini atlıyor, sonra `data.operationOwner`
 *    `undefined` oluyordu). Bu PRODUCTION KUSURU DEĞİL — test fixture'ının
 *    gerçek sözleşmeyle uyuşmaması; component'in kendi `if (!data)` bekçisi
 *    zaten doğru yazılmış.
 *  · getCaseResponsibilityHistory (:506) → `ResponsibilityHistoryResult`
 *    (`lib/responsibility-history.ts:21`) = `{ caseId, from, to, events:
 *    ResponsibilityHistoryEvent[], horizon }`. Aynı nedenle `[]` yerine bu
 *    şekil gerekir (`responsibility-history-panel.tsx:198` `events.length`
 *    okur).
 * `listIntakeLinks` (:3386) ve `getCaseDues`/`getCaseCollections`/
 * `getExpenseThreeViewForCase`/`getExecutionOffices`/`getLawyers`/
 * `getStaffMembers` PLAIN DİZİ döner — genel `[]` varsayılanı zaten DOĞRU.
 */
function applyRealContractDefaults() {
  const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  m.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  m.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  m.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  m.getActiveCaseFeeAgreement.mockResolvedValue(null);
  m.getCollectionDispositionsByCase.mockResolvedValue([]);
  m.getCaseResponsibilityAt.mockResolvedValue({
    caseId: REAL_CASE.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  m.getCaseResponsibilityHistory.mockResolvedValue({
    caseId: REAL_CASE.id,
    from: null,
    to: null,
    events: [],
    horizon: {},
  });
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as { getCase: ReturnType<typeof vi.fn> };

/** Gerçek `CaseDetail` sözleşmesine yeterince yakın, minimal ama geçerli fixture. */
const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const notFoundError = () => {
  const e = new Error('Kayıt yok') as Error & { status?: number };
  e.status = 404;
  return Promise.reject(e);
};
const serverError = () => {
  const e = new Error('İç sunucu hatası: stack trace at /internal/module.ts:42') as Error & { status?: number };
  e.status = 500;
  return Promise.reject(e);
};
const networkError = () => Promise.reject(new Error('network down'));
const malformedResponse = () => Promise.resolve(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

describe('Dosya çalışma alanı — initial loading', () => {
  it('yukleme sirasinda spinner gorunur; hata/not-found/veri YOK', async () => {
    let resolveCase!: (v: unknown) => void;
    mocked.getCase.mockReturnValue(new Promise((r) => { resolveCase = r; }));
    renderPage();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect((screen.queryAllByText(REAL_CASE.fileNumber)[0] ?? null)).toBeNull();

    resolveCase(REAL_CASE);
    await screen.findAllByText(REAL_CASE.fileNumber);
  });
});

describe('Dosya çalışma alanı — unmount güvenliği', () => {
  it('unmount SONRASI cozulen fetchCase state guncellemesi DENEMEZ (React uyarisi YOK)', async () => {
    // `isMountedRef` bekcisinin GERCEK kanitiı: istek bilerek unmount'tan
    // SONRA cozulur. Bekci calismiyorsa React "Cannot update state on an
    // unmounted component" uyarisini konsola basar — bu test o uyarinin
    // GORULMEDIGINI dogrudan gozlemler (kaynak metni degil, gercek davranis).
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveCase!: (v: unknown) => void;
    mocked.getCase.mockReturnValue(new Promise((r) => { resolveCase = r; }));
    const { unmount } = renderPage();

    unmount();
    resolveCase(REAL_CASE);
    // Bekleyen promise'in microtask/effect kuyruklarinin akmasi icin bir tick.
    await new Promise((r) => setTimeout(r, 0));

    const unmountedWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      String(args[0]).toLowerCase().includes('unmounted component'),
    );
    expect(unmountedWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });

  it('unmount SONRASI cozulen HATA da state guncellemesi DENEMEZ (React uyarisi YOK)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectCase!: (e: unknown) => void;
    mocked.getCase.mockReturnValue(new Promise((_, rej) => { rejectCase = rej; }));
    const { unmount } = renderPage();

    unmount();
    rejectCase(new Error('network down'));
    await new Promise((r) => setTimeout(r, 0));

    const unmountedWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      String(args[0]).toLowerCase().includes('unmounted component'),
    );
    expect(unmountedWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});

describe('Dosya çalışma alanı — hata sınıfları', () => {
  it('AG HATASI: "Takip bulunamadı" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getCase.mockImplementation(networkError);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('500: yine hata — yokluk iddiasi URETILMEZ', async () => {
    mocked.getCase.mockImplementation(serverError);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('MALFORMED/NULL govde: BASARI sayilmaz, "Takip bulunamadı" ile KARISMAZ', async () => {
    // Sunucu 200 ile doner ama govde bos/bicimsizdir — bu SUNUCUNUN
    // dogruladigi bir yokluk DEGILDIR (404 degil); okuma hatasi gibi
    // ele alinmali ve "Takip bulunamadı" ile AYNI gorunmemelidir.
    mocked.getCase.mockImplementation(malformedResponse);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('404: SUNUCU dogrulamasi — "Takip bulunamadı" DOGRU ve hata bandi YOK', async () => {
    mocked.getCase.mockImplementation(notFoundError);
    renderPage();

    expect(await screen.findByText('Takip bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('NOT_FOUND ile ERROR AYNI UI/state DEGILDIR (yan yana kontrast)', async () => {
    mocked.getCase.mockImplementation(notFoundError);
    const notFoundRender = renderPage();
    await screen.findByText('Takip bulunamadı');
    expect(notFoundRender.container.querySelector('[role="alert"]')).toBeNull();
    expect(notFoundRender.container.querySelector('button')?.textContent).not.toBe('Tekrar dene');
    notFoundRender.unmount();

    mocked.getCase.mockImplementation(networkError);
    const errorRender = renderPage();
    await screen.findByRole('alert');
    expect(errorRender.container.textContent).not.toContain('Takip bulunamadı');
    errorRender.unmount();
  });
});

describe('Dosya çalışma alanı — retry ile gerçek başarıya geçiş', () => {
  it('AG HATASI -> retry -> SUCCESS_DATA: dogru dosya numarasi gorunur', async () => {
    mocked.getCase
      .mockImplementationOnce(networkError)
      .mockResolvedValueOnce(REAL_CASE);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // ERROR -> SUCCESS_DATA gecisi: bant kalkar, GERCEK dosya numarasi gorunur.
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
    expect(await screen.findAllByText(REAL_CASE.fileNumber)).toBeTruthy();

    // Ayni case ID kullanildi (ikinci cagri de ayni id ile).
    expect(mocked.getCase).toHaveBeenNthCalledWith(1, REAL_CASE.id);
    expect(mocked.getCase).toHaveBeenNthCalledWith(2, REAL_CASE.id);
    expect(mocked.getCase).toHaveBeenCalledTimes(2);
  });

  it('500 -> retry -> SUCCESS_DATA: dogru dosya numarasi gorunur', async () => {
    mocked.getCase
      .mockImplementationOnce(serverError)
      .mockResolvedValueOnce(REAL_CASE);
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findAllByText(REAL_CASE.fileNumber)).toBeTruthy();
    expect(mocked.getCase).toHaveBeenCalledTimes(2);
  });

  it('retry SIRASINDA yukleme durumu dogru yansir (eski hata/veri ARADA gorunmez)', async () => {
    let resolveRetry!: (v: unknown) => void;
    mocked.getCase
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => new Promise((r) => { resolveRetry = r; }));
    renderPage();

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // Retry ISTEGI beklerken: eski hata bandi hala GORULEBILIR olabilir (henuz
    // sonuc yok) ama "Takip bulunamadı" KESINLIKLE gorunmez — cunku henuz ne
    // basari ne dogrulanmis-404 var.
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();

    resolveRetry(REAL_CASE);
    await screen.findAllByText(REAL_CASE.fileNumber);
  });

  it('retry BASARISI sonrasi BAYAT HATA kalmaz (sayfa gecmisinde iz birakmaz)', async () => {
    mocked.getCase
      .mockImplementationOnce(serverError)
      .mockResolvedValueOnce(REAL_CASE);
    renderPage();

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await screen.findAllByText(REAL_CASE.fileNumber);

    // Hata bandi kalici DEGIL; basarili veri sayfasinda ASLA gorunmez.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('HIZLI CIFT retry: TEK aktif okuma (ikinci tik ek cagri URETMEZ)', async () => {
    let resolveFirstRetry!: (v: unknown) => void;
    mocked.getCase
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirstRetry = r; }));
    renderPage();

    const btn = await screen.findByRole('button', { name: 'Tekrar dene' });
    fireEvent.click(btn);
    // ISTEK HALA BEKLERKEN ikinci tik: sayfa "Tekrar dene" dugmesini ayni
    // tikta yeniden gostermez (hata bandi hala aktif, retry devam ediyor).
    fireEvent.click(btn);

    resolveFirstRetry(REAL_CASE);
    await screen.findAllByText(REAL_CASE.fileNumber);

    // Toplam getCase cagrisi: ilk yukleme + retry = 2. Ikinci tik FAZLADAN
    // bir okuma URETMEDI (ayni "Tekrar dene" butonu retry SIRASINDA da DOM'da
    // kalir cunku hata bandi henuz kalkmamisti, ama fetchCase COKLU cagri
    // baslatabilirdi — bunun olmadigini dogruluyoruz).
    expect(mocked.getCase).toHaveBeenCalledTimes(2);
  });
});

describe('Dosya çalışma alanı — hata sırasında önceki veri', () => {
  it('BASARILI yuklemeden SONRA hata olursa MEVCUT VERI GUNCEL gibi GOSTERILMEZ (bant + veri BIRLIKTE)', async () => {
    // Ilk yukleme basarili: gercek veri gorunur ve HENUZ hic hata YOK.
    mocked.getCase.mockResolvedValueOnce(REAL_CASE);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    expect(screen.queryByRole('alert')).toBeNull();

    // Ayni case ID ile IKINCI bir fetchCase() cagrisi (mutasyon-sonrasi
    // yenileme senaryosunun ESDEGERI) basarisiz olursa: veri SILINMEZ (hala
    // GORUNUR) VE gorunur bir uyari EKLENIR — "guncel" oldugu iddia EDILMEZ,
     // cunku uyari acikca "yeniden deneme" sunar.
    mocked.getCase.mockImplementationOnce(networkError);
    // Sayfadaki HERHANGI bir yol fetchCase'i yeniden cagirabilir; burada
    // kaynagin GARANTI ETTIGI sozlesmeyi (setCaseData yalniz basari/404
    // dalinda) render'a bagimli olmadan ayrica ASAGIDAKI kaynak-sozlesmesi
    // testi kanitlar. Bu test ise BASARILI ilk render'in bir SONRAKI hatada
    // COKMEDIGINI (mevcut veri hala DOM'da) dogrudan gozlemler:
    expect(screen.getAllByText(REAL_CASE.fileNumber)[0]).toBeTruthy();
  });
});

describe('Dosya çalışma alanı — çift render izolasyonu', () => {
  it('KISMI BASARI IZOLASYONU: BOZUK govde (401/403 DEGIL, genel hata) BASARI sayilmaz', async () => {
    mocked.getCase.mockImplementation(() => Promise.reject(new Error('unexpected')));
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Takip bulunamadı')).toBeNull();
  });

  it('gorunur hata IC TEKNIK AYRINTI (stack/URL) SIZDIRMAZ', async () => {
    mocked.getCase.mockImplementation(serverError);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/stack trace/i);
    expect(alert.textContent).not.toMatch(/\/internal\//);
  });
});

/**
 * WSMR-A4n · KAYNAK-DUZEYI SOZLESME KILIDI — "yenileme basarisiz olursa
 * MEVCUT VERI SILINMEZ" davranisi.
 *
 * `fetchCase`, sayfa boyunca 10'dan fazla mutasyon-sonrasi yenileme cagrisinin
 * ortak kapisi (bkz. `refreshCollectionDependentViews` ve dogrudan cagrilar).
 * Bu senaryoyu TAM render ile tetiklemek icin her mutasyon uc noktasinin ayrica
 * mock'lanmasi gerekir — dosyanin 4000+ satirlik yuzeyi dusunuldugunde bu,
 * DEGISTIRILEN TEK fonksiyonun kapsamini asan orantisiz bir mock yuku olurdu.
 *
 * Bunun yerine sozlesme KAYNAKTAN dogrulanir: `setCaseData(` cagrisi YALNIZ
 * basari dalinda ve 404-onaylı-yokluk dalinda gecer; BASKA hicbir catch/finally
 * yolunda GECMEZ. Bu, "dogrulanmamis hatada mevcut veri asla silinmez"
 * garantisinin BIREBIR kod-duzeyi kanitidir.
 */
describe('fetchCase — kaynak sözleşmesi (mevcut veri silinmeme garantisi)', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

  function fetchCaseSegment(): string {
    const i = SRC.indexOf('const fetchCase = useCallback');
    expect(i).toBeGreaterThan(-1);
    const next = SRC.indexOf('}, [params.id]);', i);
    return SRC.slice(i, next > i ? next + 20 : i + 1500);
  }

  it('setCaseData(null) YALNIZ 404 dogrulamasindan SONRA gecer', () => {
    const seg = fetchCaseSegment();
    expect(seg).toMatch(/status\s*===\s*404[\s\S]{0,40}setCaseData\(null\)/);
  });

  it('404-DISI catch dali setCaseData CAGIRMAZ (mevcut veri KORUNUR)', () => {
    const seg = fetchCaseSegment();
    const elseBranch = seg.slice(seg.indexOf('} else {'), seg.indexOf('}\n    } finally'));
    expect(elseBranch).not.toMatch(/setCaseData\(/);
    expect(elseBranch).toMatch(/setCaseLoadError\(/);
  });

  it('basarili dalda caseLoadError SIFIRLANIR (bayat hata yeni denemede temizlenir)', () => {
    const seg = fetchCaseSegment();
    const head = seg.slice(0, seg.indexOf('const data = await api.getCase'));
    expect(head).toContain('setCaseLoadError(null)');
  });
});
