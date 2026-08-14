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
 * WSMR-A4x — DOSYA ÇALIŞMA ALANI: BORÇLU OKUMA HATASI NÖTR "—" İLE AYNI
 * GÖRÜNMEZ.
 *
 * `fetchCaseDebtors` catch dalında yalnız `console.error` ile hatayı
 * yutuyordu. `caseDebtors` boş kalınca render zaten meşru bir eski-veri
 * fallback'ine (`caseDebtorLinks` — `caseData.debtors`, ana dosya
 * yüklemesinden gelen GERÇEK bir ikinci kaynak) düşüyordu — bu davranış
 * DOĞRU ve dokunulmadı. Ama fallback KAYNAĞI DA boşsa (`caseData.debtors`
 * boş dizi), okuma hatası nötr "—" (ne hata ne kayıt-yok iması) ile AYNI
 * ekrana düşüyordu — kullanıcı gerçek bir okuma hatasını "bu dosyada
 * borçlu yok" ile ayırt edemiyordu.
 *
 * Kural: iki kaynak da boşken görünür hata + retry devreye girer.
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
function applyRealContractDefaults(caseOverride: Record<string, unknown> = {}) {
  const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  m.getCase.mockResolvedValue({ ...REAL_CASE, ...caseOverride });
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

const mocked = api as unknown as { getCaseDebtors: ReturnType<typeof vi.fn> };

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [] as unknown[],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const FALLBACK_LINK = {
  id: 'link-1',
  role: 'ASIL_BORCLU',
  debtor: { id: 'deb-1', name: 'Ahmet Yılmaz', displayName: 'Ahmet Yılmaz', tckn: '11111111110' },
};

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Borçlular paneli — iki kaynak da bosken okuma hatası', () => {
  it('AG HATASI + caseData.debtors BOS: notr "—" YAZILMAZ, gorunur hata + retry cikar', async () => {
    applyRealContractDefaults({ debtors: [] });
    mocked.getCaseDebtors.mockImplementation(networkError);
    renderPage();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Borçlular yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('GERCEKTEN bos: hata YOK, notr "—" DOGRU', async () => {
    applyRealContractDefaults({ debtors: [] });
    mocked.getCaseDebtors.mockResolvedValue({
      summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
      items: [],
    });
    renderPage();

    await screen.findAllByText(REAL_CASE.fileNumber);
    // Sayfada baska alanlar icin de "—" placeholder'i var — coklu-eslesme
    // beklenir, tekil sorgu YANLIS varsayimdir.
    expect((await screen.findAllByText('—')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: hata kalkar', async () => {
    applyRealContractDefaults({ debtors: [] });
    let attempt = 0;
    mocked.getCaseDebtors.mockImplementation(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 }, items: [] });
    });
    renderPage();

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' }, { timeout: 5000 });
    fireEvent.click(retryBtns[0]);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 5000 });
  });
});

describe('Borçlular paneli — fallback kaynağı VARKEN okuma hatası (mevcut davranış KORUNUR)', () => {
  it('AG HATASI + caseData.debtors DOLU: eski-veri fallback listesi hala gorunur (regresyon YOK)', async () => {
    applyRealContractDefaults({ debtors: [FALLBACK_LINK] });
    mocked.getCaseDebtors.mockImplementation(networkError);
    renderPage();

    expect(await screen.findByText('Ahmet Yılmaz')).toBeTruthy();
  });
});
