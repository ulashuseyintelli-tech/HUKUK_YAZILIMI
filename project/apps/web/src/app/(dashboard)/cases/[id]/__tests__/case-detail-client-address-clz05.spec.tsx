import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  return { api: new Proxy({}, { get(_target, prop: string) { return registry[prop] ??= vi.fn().mockResolvedValue([]); } }) };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-clz05' }), useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/cases/case-clz05',
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'actor', tenantId: 'tenant-clz05', role: 'USER' }, loading: false }) }));
// Unrelated calculation/intelligence panels use a separate HTTP client.
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async (path: string) => ({ data: path.includes('/calculation-summary') ? null : [] })) } }));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const unexpectedFetch = vi.fn(() => { throw new Error('CL-Z05 forbids real network requests'); });
const clientA = { id: 'client-a', name: 'Müvekkil A', displayName: 'Müvekkil A', type: 'PERSON', isActive: true };
const clientB = { id: 'client-b', name: 'Müvekkil B', displayName: 'Müvekkil B', type: 'PERSON', isActive: true };
const caseBase = { id: 'case-clz05', fileNumber: 'CLZ05/1', principalAmount: 0, debtors: [], lawyers: [], claimItems: [] };
function setCase(...clients: Record<string, unknown>[]) {
  mocked.getCase.mockResolvedValue({ ...caseBase, caseClients: clients.map((client, index) => ({ id: `cc-${index}`, role: 'ALACAKLI', client })) });
}
function renderPage() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cache}><CaseDetailPage /></QueryClientProvider>);
}
async function openClient(name = clientA.displayName) { fireEvent.click(await screen.findByText(name)); }
function closeClient(container: HTMLElement) {
  const button = container.querySelector('svg.lucide-x')?.closest('button');
  if (!button) throw new Error('Client drawer close button missing');
  fireEvent.click(button);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', unexpectedFetch);
  mocked.getCaseDebtors.mockResolvedValue({ summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 }, items: [] });
  mocked.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  mocked.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  mocked.getActiveCaseFeeAgreement.mockResolvedValue(null);
  mocked.getCaseDues.mockResolvedValue([]); mocked.getCaseCollections.mockResolvedValue([]);
  mocked.getCollectionDispositionsByCase.mockResolvedValue([]); mocked.getExpenseThreeViewForCase.mockResolvedValue([]);
  mocked.getCases.mockResolvedValue({ data: [] });
  mocked.getCaseResponsibilityAt.mockResolvedValue({ caseId: caseBase.id, asOf: new Date().toISOString(), operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' }, legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' }, horizon: {} });
  mocked.getCaseResponsibilityHistory.mockResolvedValue({ caseId: caseBase.id, from: null, to: null, events: [], horizon: {} });
  setCase(clientA);
});
afterEach(() => {
  cleanup();
  expect(unexpectedFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('CL-Z05 — canonical client address in the existing case drawer', () => {
  it('CLZ05 displays a structured-only canonical case client without a missing-contact claim', async () => {
    setCase({ ...clientA, resolvedAddress: { line: 'Kanonik Cadde, Kadıköy/İstanbul', source: 'structured' } });
    renderPage(); await openClient();
    expect(await screen.findByText('Kanonik Cadde, Kadıköy/İstanbul')).toBeTruthy();
    expect(screen.queryByText('İletişim bilgisi eksik')).toBeNull();
  });
  it('CLZ05 does not display conflicting flat fields beside the canonical projection', async () => {
    setCase({ ...clientA, address: 'ESKİ YANLIŞ SOKAK', city: 'ESKİ YANLIŞ İL', resolvedAddress: { line: 'Doğru yapısal adres', source: 'structured' } });
    renderPage(); await openClient();
    expect(await screen.findByText('Doğru yapısal adres')).toBeTruthy();
    expect(screen.queryByText('ESKİ YANLIŞ SOKAK')).toBeNull(); expect(screen.queryByText('ESKİ YANLIŞ İL')).toBeNull();
  });
  it.each(['structured', 'none'])('CLZ05 null %s projection never resurrects a legacy address', async source => {
    setCase({ ...clientA, address: 'GERİ GELMEMELİ', resolvedAddress: { line: null, source } });
    renderPage(); await openClient();
    expect(screen.queryByText('GERİ GELMEMELİ')).toBeNull();
    expect(await screen.findByText('İletişim bilgisi eksik')).toBeTruthy();
  });
  it('CLZ05 preserves explicit legacy fallback for an older payload without the new projection', async () => {
    setCase({ ...clientA, address: 'Eski API adresi' });
    renderPage(); await openClient();
    expect(await screen.findByText('Eski API adresi')).toBeTruthy();
  });
  it('CLZ05 supports the existing legacy client entry when caseClients is empty', async () => {
    mocked.getCase.mockResolvedValue({ ...caseBase, caseClients: [], client: { ...clientA, resolvedAddress: { line: 'Tekil bağlantı adresi', source: 'structured' } } });
    renderPage(); await openClient();
    expect(await screen.findByText('Tekil bağlantı adresi')).toBeTruthy();
  });
  it('CLZ05 switching clients displays their own address and removes the previous address', async () => {
    setCase({ ...clientA, resolvedAddress: { line: 'Yalnız A adresi', source: 'structured' } }, { ...clientB, resolvedAddress: { line: 'Yalnız B adresi', source: 'structured' } });
    const { container } = renderPage(); await openClient();
    expect(await screen.findByText('Yalnız A adresi')).toBeTruthy(); closeClient(container);
    await openClient(clientB.displayName);
    expect(await screen.findByText('Yalnız B adresi')).toBeTruthy(); expect(screen.queryByText('Yalnız A adresi')).toBeNull();
  });
  it('CLZ05 an addressless old payload remains an honest missing-contact state', async () => {
    renderPage(); await openClient();
    expect(await screen.findByText('İletişim bilgisi eksik')).toBeTruthy();
  });
  it('CLZ05 a failed case read remains an error and shows no client-address success', async () => {
    mocked.getCase.mockRejectedValue(Object.assign(new Error('Adres bilgisi okunamadı.'), { status: 503, body: { message: 'Adres bilgisi okunamadı.' } }));
    renderPage();
    await waitFor(() => expect(mocked.getCase).toHaveBeenCalled());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Adres bilgisi okunamadı.');
    expect(screen.queryByText(clientA.displayName)).toBeNull();
  });
});
