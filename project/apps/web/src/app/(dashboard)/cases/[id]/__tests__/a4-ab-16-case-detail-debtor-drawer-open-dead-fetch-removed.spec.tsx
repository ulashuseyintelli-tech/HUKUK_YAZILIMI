/**
 * WSMR-A4-AB-16 — `cases/[id]/page.tsx#fetchDebtorDetail` REMOVED (owner GO — koşullu kaldırma).
 *
 * Fresh 5-kapılı erişilebilirlik analizi doğruladı: `selectedDebtorDetail`/`loadingDebtorDetail`
 * state'leri ve onları besleyen `fetchDebtorDetail` fonksiyonu, gerçek `DebtorDetailDrawer`
 * bileşeni KENDİ bağımsız fetch sözleşmesini kullandığı için (WSMR-A4-AB-14'te ayrıca
 * düzeltildi) hiçbir render/prop/mutation tarafından tüketilmiyordu — yalnız yazılıyordu.
 * Bu test dosyası, kaldırmanın (1) borçlu satırına tıklama → drawer açılma davranışını,
 * (2) doğru `caseDebtorId` ile prop geçişini, (3) drawer kapatma akışını BOZMADIĞINI kanıtlar.
 *
 * `DebtorDetailDrawer` bilinçli olarak stub'lanır — kendi iç fetch/render davranışı zaten
 * ayrı bir dosyada (a4-ab-14-debtor-detail-drawer-fetch-load-error.spec.tsx) kapsanıyor; bu
 * dosyanın kapsamı yalnız PARENT sayfanın (page.tsx) drawer'ı NASIL açtığı/kapattığıdır.
 *
 * Seri zincirin 1. halkası (A4-AB-16→20, owner GO).
 */
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

// Proxy YALNIZ `api` istemcisini mock'lar — DebtorRow gibi bileşenlerin doğrudan import
// ettiği DİĞER isimli export'lar (örn. DebtorRoleLabels) `importActual` ile GERÇEK kalır.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { ...actual, api: new Proxy({}, handler) };
});

// DebtorDetailDrawer KASITLI stub'landı — kendi fetch/render sözleşmesi ayrı dosyada
// (a4-ab-14) kapsanıyor. Barrel'daki diğer gerçek export'lar (DebtorRow vb.) korunur.
vi.mock('@/components/debtor', async () => {
  const actual = await vi.importActual<typeof import('@/components/debtor')>('@/components/debtor');
  return {
    ...actual,
    DebtorDetailDrawer: ({ isOpen, caseId, caseDebtorId, onClose }: any) =>
      isOpen ? (
        <div data-testid="debtor-detail-drawer-stub" data-case-id={caseId} data-case-debtor-id={caseDebtorId}>
          <button onClick={onClose}>Kapat (stub)</button>
        </div>
      ) : null,
  };
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

const mocked = api as unknown as {
  getCase: ReturnType<typeof vi.fn>;
  getCaseDebtors: ReturnType<typeof vi.fn>;
  getCaseDebtorDetail: ReturnType<typeof vi.fn>;
  getAddressTasksForCase: ReturnType<typeof vi.fn>;
  getAddressNotesForCase: ReturnType<typeof vi.fn>;
  getActiveCaseFeeAgreement: ReturnType<typeof vi.fn>;
  getCollectionDispositionsByCase: ReturnType<typeof vi.fn>;
  getCaseResponsibilityAt: ReturnType<typeof vi.fn>;
  getCaseResponsibilityHistory: ReturnType<typeof vi.fn>;
};

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [] as unknown[],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const DEBTOR_A = {
  id: 'deb-a', caseDebtorId: 'case-debtor-a', displayName: 'Ali Veli',
  personType: 'REAL', role: 'ASIL_BORCLU', lifecycleStatus: 'ACTIVE',
  serviceStatus: 'READY', serviceLabel: 'Hazır',
  alertCount: 0, alertLevel: 'NONE', issues: [],
};
const DEBTOR_B = {
  id: 'deb-b', caseDebtorId: 'case-debtor-b', displayName: 'Veli Ali',
  personType: 'REAL', role: 'KEFIL', lifecycleStatus: 'ACTIVE',
  serviceStatus: 'READY', serviceLabel: 'Hazır',
  alertCount: 0, alertLevel: 'NONE', issues: [],
};

function applyRealContractDefaults() {
  mocked.getCase.mockResolvedValue(REAL_CASE);
  mocked.getCaseDebtors.mockResolvedValue({
    summary: { total: 2, delivered: 0, pending: 2, returned: 0, danger: 0 },
    items: [DEBTOR_A, DEBTOR_B],
  });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]);
  mocked.getCaseResponsibilityAt.mockResolvedValue({
    caseId: REAL_CASE.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({
    caseId: REAL_CASE.id, from: null, to: null, events: [], horizon: {},
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('WSMR-A4-AB-16: borçlu satırına tıklama → drawer (ölü fetchDebtorDetail kaldırıldıktan sonra)', () => {
  it('[1] satıra tıklanınca drawer AÇILIR, doğru caseId/caseDebtorId ile', async () => {
    applyRealContractDefaults();
    renderPage();

    const row = await screen.findByText('Ali Veli');
    fireEvent.click(row.closest('[role="button"]') as HTMLElement);

    const drawer = await screen.findByTestId('debtor-detail-drawer-stub');
    expect(drawer.getAttribute('data-case-id')).toBe('case-1');
    expect(drawer.getAttribute('data-case-debtor-id')).toBe('case-debtor-a');
  });

  it('[2] farklı satıra tıklanınca DOĞRU/FARKLI caseDebtorId ile açılır (kimlik karışmaz)', async () => {
    applyRealContractDefaults();
    renderPage();

    const row = await screen.findByText('Veli Ali');
    fireEvent.click(row.closest('[role="button"]') as HTMLElement);

    const drawer = await screen.findByTestId('debtor-detail-drawer-stub');
    expect(drawer.getAttribute('data-case-debtor-id')).toBe('case-debtor-b');
  });

  it('[3] drawer kapatılınca crash OLMAZ, isOpen false olur (kaldırılan setSelectedDebtorDetail(null) satırı sorun çıkarmaz)', async () => {
    applyRealContractDefaults();
    renderPage();

    const row = await screen.findByText('Ali Veli');
    fireEvent.click(row.closest('[role="button"]') as HTMLElement);
    await screen.findByTestId('debtor-detail-drawer-stub');

    fireEvent.click(screen.getByText('Kapat (stub)'));

    expect(screen.queryByTestId('debtor-detail-drawer-stub')).not.toBeInTheDocument();
  });

  it('[4] page seviyesinde ARTIK hiçbir kod api.getCaseDebtorDetail çağırmaz (ölü fetchDebtorDetail gerçekten kaldırıldı — drawer stub olduğu için TEK meşru çağıran da devre dışı, toplam çağrı 0 olmalı)', async () => {
    applyRealContractDefaults();
    renderPage();

    const row = await screen.findByText('Ali Veli');
    fireEvent.click(row.closest('[role="button"]') as HTMLElement);
    await screen.findByTestId('debtor-detail-drawer-stub');

    expect(mocked.getCaseDebtorDetail).not.toHaveBeenCalled();
  });
});
