import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-2 — DOSYA ÇALIŞMA ALANI: MASRAF ÜÇLÜ-GÖRÜNÜM (expense-three-view)
 * OKUMA HATASI SESSİZCE EKSİK VERİYİ TAM/BOŞ GİBİ SUNMAZ.
 *
 * `getExpenseThreeViewForCase` TEK bir kaynak; her öğesi ÜÇ ayrı panele
 * (`tasks`, `financeItems`, `muvekkilTalepleri`) besleniyor. Bu paneller
 * BAŞKA kaynaklarla da (addressTasks/addressNotes/collections) beslendiği
 * için okuma hatasında panel TAMAMEN boş görünmeyebilir — ama masraf
 * kalemleri SESSİZCE kaybolur ve kullanıcı bunu "bu dosyada masraf yok"
 * sanabilir. Eskiden `console.error` ile YUTULUYORDU, `expenseThreeViewData`
 * hep `[]` dönüyordu.
 *
 * KAPSAM (owner GO — A4-AB-2): YALNIZ `fetchExpenseThreeViewData` /
 * `getExpenseThreeViewForCase`.
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
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const COLLECTION = { id: 'coll-1', type: 'TAHSILAT', amount: 500, date: '2026-08-01', status: 'ACTIVE', description: 'Elden tahsilat' };

const EXPENSE_ITEM = {
  task: {
    id: 'exp-task-1',
    title: 'Bilirkişi ücreti öde',
    description: 'Bilirkişi ücreti ödenmesi gerekiyor',
    status: 'BEKLIYOR',
    dueDate: '2026-08-20',
    priority: 'MEDIUM',
  },
  finance: {
    id: 'exp-fin-1',
    totalAmount: 750,
    date: '2026-08-05',
    description: 'Bilirkişi masrafı',
    status: 'PENDING',
    paidAmount: 0,
    remainingAmount: 750,
    items: [],
  },
  clientRequest: {
    id: 'exp-req-1',
    content: 'Bilirkişi ücreti için müvekkilden onay istendi',
    amount: 750,
    status: 'BEKLIYOR',
    createdAt: '2026-08-05T10:00:00.000Z',
  },
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
  mocked.getCaseCollections.mockResolvedValue([COLLECTION]);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getExpenseThreeViewForCase.mockResolvedValue([]);
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

const openTasksTab = async () => fireEvent.click(await screen.findByRole('button', { name: /Yapılacaklar/ }));
const openFinanceTab = async () => fireEvent.click(await screen.findByRole('button', { name: /^Finans$/ }));
const openClientRequestsTab = async () => fireEvent.click(await screen.findByRole('button', { name: /Müvekkil Talepleri/ }));

function findExpenseAlert(alerts: HTMLElement[]) {
  return alerts.find((a) => /Masraf görev\/talep\/finans verileri yüklenemedi/.test(a.textContent || ''));
}

describe('expense-three-view — okuma hatası sınıfları', () => {
  it('AG HATASI: görünür hata + retry çıkar, DİĞER kaynaklar (collections) ETKİLENMEZ', async () => {
    mocked.getExpenseThreeViewForCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findExpenseAlert(alerts)).toBeTruthy();

    // Baska bir kaynaktan (collections) gelen finans ogesi ETKILENMEDI.
    await openFinanceTab();
    expect(await screen.findByText('Elden tahsilat')).toBeTruthy();
  });

  it('403: görünür hata çıkar', async () => {
    mocked.getExpenseThreeViewForCase.mockImplementation(() => statusError(403, 'Yasak'));
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findExpenseAlert(alerts)).toBeTruthy();
  });

  it('500: görünür hata çıkar', async () => {
    mocked.getExpenseThreeViewForCase.mockImplementation(() => statusError(500, 'Sunucu hatası'));
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findExpenseAlert(alerts)).toBeTruthy();
  });

  it('MALFORMED gövde (dizi değil): görünür hata çıkar, .map()/.filter() TypeError\'ı sızmaz', async () => {
    mocked.getExpenseThreeViewForCase.mockResolvedValue({ notAnArray: true } as any);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findExpenseAlert(alerts)).toBeTruthy();
  });

  it('GERÇEKTEN boş: hata YOK, paneller diğer kaynaklarla doğru çalışır', async () => {
    mocked.getExpenseThreeViewForCase.mockResolvedValue([]);
    renderPage();
    await openFinanceTab();

    expect(await screen.findByText('Elden tahsilat')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('başarılı yükleme: gerçek masraf kalemi HER ÜÇ panelde görünür, hata YOK', async () => {
    mocked.getExpenseThreeViewForCase.mockResolvedValue([EXPENSE_ITEM]);
    renderPage();

    await openTasksTab();
    expect(await screen.findByText('Bilirkişi ücreti öde')).toBeTruthy();

    await openFinanceTab();
    expect(await screen.findByText('Bilirkişi masrafı')).toBeTruthy();

    await openClientRequestsTab();
    expect(await screen.findByText('Masraf Talebi')).toBeTruthy();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('retry — YALNIZ expense-three-view tekrar denenir (diğer okumalar/mutation ÇAĞRILMAZ)', () => {
  it('retry -> SUCCESS_DATA: gerçek kayıt görünür, hata tamamen kalkar', async () => {
    let attempt = 0;
    mocked.getExpenseThreeViewForCase.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? networkError() : Promise.resolve([EXPENSE_ITEM]);
    });
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const expenseAlert = findExpenseAlert(alerts)!;
    const retryBtn = expenseAlert.querySelector('button')!;
    fireEvent.click(retryBtn);

    await waitFor(() => expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await waitFor(
      () => expect(screen.queryAllByRole('alert').some((a) => /Masraf görev\/talep\/finans/.test(a.textContent || ''))).toBe(false),
      { timeout: 5000 },
    );

    await openTasksTab();
    expect(await screen.findByText('Bilirkişi ücreti öde')).toBeTruthy();

    // Retry YALNIZ bu kaynağı tekrar dener — dues/collections/dispositions/adres yeniden ÇEKİLMEZ.
    expect(mocked.getCaseDues).toHaveBeenCalledTimes(1);
    expect(mocked.getCaseCollections).toHaveBeenCalledTimes(1);
    expect(mocked.getCollectionDispositionsByCase).toHaveBeenCalledTimes(1);
    expect(mocked.getAddressTasksForCase).toHaveBeenCalledTimes(1);
  });
});

describe('çift retry -> tek aktif istek', () => {
  it('hızlı çift tıklama İKİNCİ isteği başlatmaz (in-flight guard)', async () => {
    mocked.getExpenseThreeViewForCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const retryBtn = findExpenseAlert(alerts)!.querySelector('button')!;

    expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalledTimes(1);
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn);

    await waitFor(() => expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalledTimes(2);
  });
});

describe('unmount sonrası state güncellemesi engellenir', () => {
  it('yanıt unmount SONRASI gelirse React uyarısı/çökme OLUŞMAZ', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveExpense: (v: unknown) => void;
    mocked.getExpenseThreeViewForCase.mockImplementation(
      () => new Promise((resolve) => { resolveExpense = resolve; }),
    );

    const { unmount } = renderPage();
    await waitFor(() => expect(mocked.getExpenseThreeViewForCase).toHaveBeenCalledTimes(1));

    unmount();
    resolveExpense!([EXPENSE_ITEM]);
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('mevcut veri korunur — SONRAKİ okuma hatasında ÖNCEKİ kayıt silinmez', () => {
  it('ilk yükleme başarılı (kayıt görünür) -> sayfa üstü "Yenile" sonrası expense-three-view BAŞARISIZ -> ÖNCEKİ kayıt EKRANDA KALIR + yeni hata bandı çıkar', async () => {
    let attempt = 0;
    mocked.getExpenseThreeViewForCase.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.resolve([EXPENSE_ITEM]) : networkError();
    });
    renderPage();

    await openTasksTab();
    expect(await screen.findByText('Bilirkişi ücreti öde')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Sayfa-genel "Yenile" (fetchCase) tıklanır — bu, `loading` durumunu
    // değiştirerek `fetchExpenseThreeViewData`'yı tetikleyen useEffect'i
    // (params.id/loading bağımlılığı) YENİDEN çalıştırır. Bu turda kaynak
    // BAŞARISIZ olacak şekilde mocklandı.
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));

    await waitFor(() => expect(mocked.getExpenseThreeViewForCase.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 5000 });

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(findExpenseAlert(alerts)).toBeTruthy();
    // ÖNCEKİ (başarıyla yüklenmiş) kayıt SİLİNMEDİ — hâlâ ekranda.
    await openTasksTab();
    expect(screen.getByText('Bilirkişi ücreti öde')).toBeTruthy();
  });
});

describe('yanlış toplam/sıfır iddiası oluşmaz', () => {
  it('okuma hatasında hata bandı "eksik olabilir" der — sessizce 0/tam veri iddiası YOK', async () => {
    mocked.getExpenseThreeViewForCase.mockImplementation(networkError);
    renderPage();

    // Finans özetindeki "Masraf Talep" toplamı (financeItems.filter(MASRAF_TALEP)
    // reduce) okuma hatasında da render edilir (0 ₺) — AMA bu değer artık YALNIZ
    // başına değil, "eksik olabilir" diyen görünür bir hata bandıyla BİRLİKTE
    // sunulur; kullanıcı 0'ın kesin bir olgu mu yoksa okunamamış veri mi
    // olduğunu bandı okuyarak ayırt edebilir.
    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    const expenseAlert = findExpenseAlert(alerts);
    expect(expenseAlert).toBeTruthy();
    expect(expenseAlert!.textContent).toMatch(/eksik olabilir/);
  });
});
