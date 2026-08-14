import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-1 — DOSYA ÇALIŞMA ALANI: DAĞITIM/MUTABAKAT (dispositions)
 * OKUMA HATASI KISMİ VERİYİ TAM VERİ GİBİ SUNMAZ.
 *
 * `fetchFinanceData`'nın üçüncü, BAĞIMSIZ kaynağı olan
 * `getCollectionDispositionsByCase` eskiden yalnız `console.warn` ile
 * YUTULUYORDU ve `dispositionsRes` hep `[]` dönüyordu. `collectionDispositions`
 * → `operationAccountingRecords`'a beslendiği için bu, "Bu dosyada henüz
 * dağıtım/mutabakat kaydı yok." (operationAccountingEmptyMessage) ile AYNI
 * ekrana düşüyordu — okuma hatası gerçek yoklukla ayırt edilemiyordu (A4o/
 * A4w'de AYNI ailenin farklı örneklerinde zaten düzeltilen kusur).
 *
 * KAPSAM (owner GO — A4-AB-1): YALNIZ bu üçüncü kaynak. `fetchExpenseThreeViewData`,
 * `/cases/stats`, `CollectionPanel`, `ExpenseRequestList`, debtor drawer'ları
 * bu PR'ın DIŞINDA — dokunulmadı.
 */

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

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

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  principalAmount: 15000,
  debtors: [],
  // Tek uygun alacaklı — "Dağıtım Öner" kısayolunun tekil-alacaklı önkoşulu için.
  caseClients: [{ id: 'cc-1', role: 'ALACAKLI', client: { id: 'cl-1', displayName: 'Test Müvekkil' } }],
  lawyers: [],
  claimItems: [],
};

const DISPOSITION_HELD = {
  id: 'disp-1',
  collectionId: 'c1',
  status: 'HELD_PENDING_DISTRIBUTION',
  totalAmount: 1000,
  currency: 'TRY',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const networkError = () => Promise.reject(new Error('network down'));
const statusError = (status: number, message: string) => {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return Promise.reject(e);
};

function applyRealContractDefaults() {
  mocked.getCase.mockResolvedValue(REAL_CASE);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCaseDues.mockResolvedValue([]);
  mocked.getCaseCollections.mockResolvedValue([]);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: REAL_CASE.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({
    caseId: REAL_CASE.id,
    from: null,
    to: null,
    events: [],
    horizon: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

const openAccountingTab = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Dağıtım & Mutabakat/ }));

describe('dispositions — okuma hatası sınıfları', () => {
  it('AG HATASI: "henüz dağıtım/mutabakat kaydı yok" YAZILMAZ, görünür hata + retry çıkar', async () => {
    mocked.getCollectionDispositionsByCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
    await openAccountingTab();
    expect(screen.queryByText('Bu dosyada henüz dağıtım/mutabakat kaydı yok.')).toBeNull();
  });

  it('403: görünür hata çıkar (yetki hatası "kayıt yok" ile karışmaz)', async () => {
    mocked.getCollectionDispositionsByCase.mockImplementation(() => statusError(403, 'Yasak'));
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('500: görünür hata çıkar', async () => {
    mocked.getCollectionDispositionsByCase.mockImplementation(() => statusError(500, 'Sunucu hatası'));
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('MALFORMED gövde (dizi değil): görünür hata çıkar, .map() TypeError\'ı sızmaz', async () => {
    mocked.getCollectionDispositionsByCase.mockResolvedValue({ notAnArray: true } as any);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('PARTIAL-DATA etiketi: banda "Toplam/dağıtım görünümü eksik olabilir" uyarısı eklenir', async () => {
    mocked.getCollectionDispositionsByCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Toplam\/dağıtım görünümü eksik olabilir/.test(a.textContent || ''))).toBe(true);
  });

  it('GERÇEKTEN boş: hata YOK, "henüz dağıtım/mutabakat kaydı yok" DOĞRU', async () => {
    mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
    renderPage();
    await openAccountingTab();

    expect(await screen.findByText('Bu dosyada henüz dağıtım/mutabakat kaydı yok.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('başarılı yükleme: gerçek kayıt görünür, hata YOK, yanlış "tam veri" iddiası üretilmez', async () => {
    mocked.getCollectionDispositionsByCase.mockResolvedValue([DISPOSITION_HELD]);
    renderPage();
    await openAccountingTab();

    expect(await screen.findByText(/Dağıtım bekliyor/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Bu dosyada henüz dağıtım/mutabakat kaydı yok.')).toBeNull();
  });
});

describe('retry — YALNIZ dispositions tekrar denenir (dues/collections yeniden ÇEKİLMEZ)', () => {
  it('retry -> SUCCESS_DATA: gerçek kayıt görünür, hata (stale dahil) tamamen kalkar', async () => {
    let attempt = 0;
    mocked.getCollectionDispositionsByCase.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? networkError() : Promise.resolve([DISPOSITION_HELD]);
    });
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const dispositionAlert = alerts.find((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''));
    expect(dispositionAlert).toBeTruthy();
    const retryBtn = dispositionAlert!.querySelector('button')!;
    fireEvent.click(retryBtn);

    await waitFor(
      () => expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(2),
      { timeout: 5000 },
    );
    await waitFor(
      () =>
        expect(
          screen.queryAllByRole('alert').some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || '')),
        ).toBe(false),
      { timeout: 5000 },
    );
    await openAccountingTab();
    expect(await screen.findByText(/Dağıtım bekliyor/)).toBeTruthy();

    // Retry YALNIZ dispositions'ı tekrar dener — dues/collections yeniden ÇEKİLMEZ.
    expect(mocked.getCaseDues).toHaveBeenCalledTimes(1);
    expect(mocked.getCaseCollections).toHaveBeenCalledTimes(1);
  });
});

describe('çift retry -> tek aktif istek', () => {
  it('hızlı çift tıklama İKİNCİ isteği başlatmaz (in-flight guard)', async () => {
    mocked.getCollectionDispositionsByCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const dispositionAlert = alerts.find((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''));
    const retryBtn = dispositionAlert!.querySelector('button')!;

    expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(1); // yalnız ilk yükleme
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // hemen ikinci tık — buton devre dışı bırakılmış OLMALI

    await waitFor(() => expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // 3 DEĞİL — ikinci tık ikinci bir aktif istek BAŞLATMADI.
    expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(2);
  });
});

describe('unmount sonrası state güncellemesi engellenir', () => {
  it('yanıt unmount SONRASI gelirse React uyarısı/çökme OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveDispositions: (v: unknown) => void;
    mocked.getCollectionDispositionsByCase.mockImplementation(
      () => new Promise((resolve) => { resolveDispositions = resolve; }),
    );

    const { unmount } = renderPage();
    await waitFor(() => expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(1));

    unmount();
    // Bayat yanıt UNMOUNT SONRASI gelir — isMountedRef guard'i state guncellemesini engellemeli.
    resolveDispositions!([DISPOSITION_HELD]);
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('mevcut veri korunur — SONRAKİ okuma hatasında ÖNCEKİ kayıt silinmez', () => {
  it('ilk yükleme başarılı (kayıt görünür) -> dağıtım öner sonrası yenileme dispositions\'ta BAŞARISIZ -> ÖNCEKİ kayıt EKRANDA KALIR + yeni hata bandı çıkar', async () => {
    let dispositionsAttempt = 0;
    mocked.getCollectionDispositionsByCase.mockImplementation(() => {
      dispositionsAttempt += 1;
      return dispositionsAttempt === 1 ? Promise.resolve([DISPOSITION_HELD]) : networkError();
    });
    mocked.recommendCollectionDisposition.mockResolvedValue({ result: 'RECOMMENDED' });

    renderPage();
    await openAccountingTab();
    expect(await screen.findByText(/Dağıtım bekliyor/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: /Dağıtım Öner/ }));

    await waitFor(() => expect(mocked.recommendCollectionDisposition).toHaveBeenCalledTimes(1), { timeout: 5000 });
    // NOT: `refreshCollectionDependentViews` + `fetchCase`'in kendi `loading`
    // bağımlı useEffect'i (page.tsx:1461-1466, bu PR'ın DIŞINDA — dokunulmadı)
    // dispositions'ı BİRDEN FAZLA kez tetikleyebilir (pre-existing davranış).
    // Önemli olan tam sayı DEĞİL, SONUÇ: en az bir tekrar denemesi olmalı ve
    // (in-flight/stale-token guard sayesinde) en son çözülen istek EKRANI
    // belirler — mock'ta 1. deneme BAŞARILI, sonrakiler BAŞARISIZ olduğu için
    // nihai durum hata bandı + korunan önceki kayıt olmalıdır.
    await waitFor(
      () => expect(mocked.getCollectionDispositionsByCase.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 5000 },
    );

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
    // Panel sekmesi recommend->refresh kaskadı sırasında kapanabiliyor
    // (OperationDeck'in kendi iç `activePanel` state'i, bu PR'ın DIŞINDA) —
    // yeniden açmak asıl iddiayı (veri korunuyor mu) DEĞİŞTİRMEZ.
    await openAccountingTab();
    // ÖNCEKİ (başarıyla yüklenmiş) kayıt SİLİNMEDİ — hâlâ ekranda.
    expect(screen.getByText(/Dağıtım bekliyor/)).toBeTruthy();
  });
});
