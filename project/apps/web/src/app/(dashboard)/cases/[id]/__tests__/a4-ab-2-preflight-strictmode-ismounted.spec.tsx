import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AB-2 PREFLIGHT — `isMountedRef` React StrictMode yaşam döngüsü.
 *
 * Owner sorusu: `useRef(true)` + `useEffect(() => { current=true; return () =>
 * { current=false } }, [])` deseni, StrictMode'un (next.config.js:
 * `reactStrictMode: true`, dev'de aktif) setup→cleanup→setup ÇİFT-ÇAĞRI
 * simülasyonunda `current`'ı YANLIŞLIKLA `false` bırakabilir mi?
 *
 * ANALİZ: StrictMode'un mount→cleanup→remount döngüsü TAMAMEN SENKRONDUR
 * (aralarında `await`/microtask YOKTUR) — bu yüzden `isMountedRef`'in
 * kendi effect'i (component'te EN ÜSTTE tanımlı, dolayısıyla ÖNCE çalışır)
 * ikinci (remount) fazında `current`'ı TEKRAR `true`'ya döndürür, ve bu
 * TÜM diğer effect'lerin remount fazı SENKRON olarak tamamlanmadan HİÇBİR
 * async fetch'in promise'i çözülemez (JS tek-thread, mikrotask kuyruğu
 * senkron kodu KESMEZ). Aşağıdaki test bunu DAVRANIŞSAL olarak kanıtlar:
 * StrictMode altında dispositions GERÇEKTEN yüklenir (isMountedRef sahte-
 * pozitif "unmounted" olarak YANLIŞ takılı KALMAZ).
 */

function renderPageStrict() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <CaseDetailPage />
      </QueryClientProvider>
    </StrictMode>,
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

const DISPOSITION = {
  id: 'disp-1',
  collectionId: 'c1',
  status: 'HELD_PENDING_DISTRIBUTION',
  totalAmount: 1000,
  currency: 'TRY',
  createdAt: '2026-08-01T00:00:00.000Z',
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

describe('isMountedRef — StrictMode setup→cleanup→setup', () => {
  it('StrictMode altında dispositions BAŞARIYLA yüklenir (isMountedRef sahte "unmounted" TAKILI KALMAZ)', async () => {
    mocked.getCollectionDispositionsByCase.mockResolvedValue([DISPOSITION]);
    renderPageStrict();

    const tabBtn = await screen.findByRole('button', { name: /Dağıtım & Mutabakat/ }, { timeout: 5000 });
    tabBtn.click();

    // isMountedRef StrictMode dongusunde YANLIS false takili kalsaydi bu
    // veri HICBIR ZAMAN ekrana gelmezdi (catch/then guard'lari sessizce
    // return ederdi) — "henuz kayit yok" ile de KARISMAZDI, sadece SONSUZA
    // KADAR yuklenmemis gorunurdu.
    expect(await screen.findByText(/Dağıtım bekliyor/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('StrictMode altında okuma HATASI da doğru şekilde görünür olur (guard erken false-positive vermez)', async () => {
    mocked.getCollectionDispositionsByCase.mockRejectedValue(new Error('network down'));
    renderPageStrict();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Dağıtım\/mutabakat kayıtları yüklenemedi/.test(a.textContent || ''))).toBe(true);
  });

  it('gerçek unmount SONRASI (StrictMode ile karışmaz) state güncellemesi engellenir', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveDispositions: (v: unknown) => void;
    mocked.getCollectionDispositionsByCase.mockImplementation(
      () => new Promise((resolve) => { resolveDispositions = resolve; }),
    );

    const { unmount } = renderPageStrict();
    await waitFor(() => expect(mocked.getCollectionDispositionsByCase.mock.calls.length).toBeGreaterThan(0));

    unmount();
    resolveDispositions!([DISPOSITION]);
    await new Promise((r) => setTimeout(r, 0));

    const unmountedUpdateWarning = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("Can't perform a React state update on an unmounted component"),
    );
    expect(unmountedUpdateWarning).toBe(false);
    errorSpy.mockRestore();
  });
});
