import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/**
 * WSMR-A4y — DOSYA ÇALIŞMA ALANI: ADRES GÖREVİ/NOT OKUMA HATASI OPERASYON
 * MASASI'NDA SESSİZCE BOŞ GÖRÜNMEZ.
 *
 * `fetchAddressTasksAndNotes` catch dalında yalnız `console.error` ile
 * hatayı yutuyordu. `addressTasks`/`addressNotes` boş kalınca Operasyon
 * Masası'nın (`OperationDeck`) görev/talep/not listeleri SESSİZCE boş
 * kalıyordu — okuma hatası gerçekten-boş ile ayırt edilemiyordu.
 *
 * Kural: okuma hatası Operasyon Masası'nın hemen üstünde görünür bant +
 * retry ile bildirilir.
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

function applyRealContractDefaults() {
  const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  m.getCase.mockResolvedValue(REAL_CASE);
  m.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
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

const mocked = api as unknown as {
  getAddressTasksForCase: ReturnType<typeof vi.fn>;
  getAddressNotesForCase: ReturnType<typeof vi.fn>;
};

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

describe('Operasyon Masası — adres görev/not okuma hatası', () => {
  it('AG HATASI (tasks): gorunur hata + retry cikar', async () => {
    mocked.getAddressTasksForCase.mockImplementation(networkError);
    mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Adres görevleri yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('AG HATASI (notes): gorunur hata + retry cikar', async () => {
    mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
    mocked.getAddressNotesForCase.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Adres görevleri yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('GERCEKTEN bos: hata YOK', async () => {
    mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
    mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
    renderPage();

    await screen.findAllByText(REAL_CASE.fileNumber);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('retry -> SUCCESS_DATA: hata kalkar', async () => {
    let attempt = 0;
    mocked.getAddressTasksForCase.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve({ tasks: [] });
    });
    mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
    renderPage();

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' }, { timeout: 5000 });
    fireEvent.click(retryBtns[0]);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 5000 });
  });
});
