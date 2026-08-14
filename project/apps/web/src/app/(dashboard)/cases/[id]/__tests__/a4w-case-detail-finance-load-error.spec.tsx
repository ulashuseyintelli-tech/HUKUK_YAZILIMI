import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
 * WSMR-A4w — DOSYA ÇALIŞMA ALANI: FİNANS OKUMA HATASI SESSİZCE YARIM VERİYİ
 * TAM VERİ GİBİ SUNMAZ.
 *
 * `fetchFinanceData` (dues/collections/dispositions'ı birlikte çeken
 * fonksiyon) catch dalında yalnız `console.error` ile hatayı yutuyordu. Bu
 * İKİ AYRI yanlış sonuç üretiyordu:
 *
 *  1. `dues` boş kalınca "Alacak Kalemleri" paneli SESSİZCE yalnız
 *     `caseData.principalAmount`'ı gösteriyordu — faiz/masraf/vekalet ücreti
 *     gibi GERÇEKTE VAR OLABİLECEK diğer kalemler kayboluyordu; kısmi veri
 *     TAM veri gibi sunuluyordu (borç-tahsilat legal yazılımında ciddi
 *     yanıltma riski).
 *  2. `collections` boş kalınca "Henüz ödeme yok" — okuma hatası gerçek
 *     yoklukla AYNI ekrana düşüyordu (WSMR-A4n/A4o/... ile AYNI aile).
 *
 * Kural: okuma hatası her ikisinde de GÖRÜNÜR olur + retry sunar;
 * `caseData.principalAmount` fallback'i YALNIZ gerçekten-boş (hata YOK)
 * durumda kalır.
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

/** WSMR-A4n'de kurulan gercek-sozlesme varsayilanlari (ayni gerekce, tekrar edilmedi). */
function applyRealContractDefaults() {
  const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  m.getCase.mockResolvedValue(REAL_CASE);
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

const mocked = api as unknown as { getCaseDues: ReturnType<typeof vi.fn>; getCaseCollections: ReturnType<typeof vi.fn> };

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  principalAmount: 15000,
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const DUE = { id: 'd1', type: 'INTEREST', amount: 500 };
const COLLECTION = { id: 'c1', type: 'TAHSILAT', amount: 200, date: '2026-08-01', status: 'ACTIVE' };

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

describe('Alacak Kalemleri (dues) — okuma hatası', () => {
  it('AG HATASI: yalniz "Asıl Alacak" ile DEGISTIRILMEZ, gorunur hata + retry cikar', async () => {
    mocked.getCaseDues.mockImplementation(networkError);
    renderPage();

    // Tam paralel regresyon altinda agir CPU rekabeti nedeniyle varsayilan
    // RTL zaman asimi (1000ms) yetersiz kalabiliyordu (izole calistirmada
    // deterministik gecerken) — timeout genisletildi, davranis DEGISMEDI.
    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Finans verileri yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('GERCEKTEN bos: hata YOK, "Asıl Alacak" fallback DOGRU', async () => {
    mocked.getCaseDues.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Asıl Alacak')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek alacak kalemi gorunur, hata kalkar', async () => {
    let attempt = 0;
    mocked.getCaseDues.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve([DUE]);
    });
    renderPage();

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' }, { timeout: 5000 });
    fireEvent.click(retryBtns[0]);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 5000 });
    await vi.waitFor(() => expect(mocked.getCaseDues).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(await screen.findByText('Faiz', {}, { timeout: 5000 })).toBeTruthy();
  });
});

describe('Ödemeler (collections) — okuma hatası', () => {
  it('AG HATASI: "Henüz ödeme yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getCaseCollections.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Finans verileri yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Henüz ödeme yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Henüz ödeme yok" DOGRU', async () => {
    mocked.getCaseCollections.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Henüz ödeme yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('basarili yukleme: gercek odeme gorunur, hata YOK', async () => {
    mocked.getCaseCollections.mockResolvedValue([COLLECTION]);
    renderPage();

    await screen.findAllByText(REAL_CASE.fileNumber);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText('Henüz ödeme yok')).toBeNull();
  });
});
