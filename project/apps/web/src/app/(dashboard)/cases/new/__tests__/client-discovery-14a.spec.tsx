import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { loadCaseWizardDraftState, saveCaseWizardDraftState } from '@/lib/case-wizard-draft';

// 14a observes the real page/modal/draft; only network, routing and session are synthetic.
// The existing HTTP/DB suite separately proves why GET /clients may legitimately be empty.
vi.mock('@/lib/api', () => ({ api: {
  getLawyers: vi.fn(), searchDebtors: vi.fn(), getNextFileNumber: vi.fn(),
  get: vi.fn(), post: vi.fn(), put: vi.fn(),
} }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''), usePathname: () => '/cases/new',
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u14a', tenantId: 't14a', role: 'ADMIN' }, loading: false }) }));

const scope = { tenantId: 't14a', userId: 'u14a' };
const linked = { id: 'linked-client', type: 'PERSON', name: 'Linked Synthetic', displayName: 'Linked Synthetic', tckn: '100****46' };
const saved = { id: 'new-unlinked-client', type: 'PERSON', name: 'New Synthetic', displayName: 'New Synthetic', tckn: '10000000214' };
const mocks = api as unknown as Record<'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'get' | 'post' | 'put', ReturnType<typeof vi.fn>>;

function routeClients(rows: unknown[]) {
  mocks.getLawyers.mockResolvedValue([]);
  mocks.searchDebtors.mockResolvedValue([]);
  mocks.getNextFileNumber.mockResolvedValue('2026/14');
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/clients') return { data: { data: rows } };
    if (url === '/lookups') return { data: { data: { takipTuru: [], asama: [], risk: [], durumEtiketi: [], mahiyetTipi: [] } } };
    return { data: { data: [] } };
  });
  mocks.post.mockImplementation(async (url: string) => {
    if (url === '/clients') return { data: { data: saved } };
    throw new Error('14a must not submit a case, POA or other mutation');
  });
}

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  window.history.replaceState(null, '', '/cases/new');
  saveCaseWizardDraftState({ currentStep: 3, formSelection: { formCode: 'FORM_7', subFormCode: null } }, scope);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  // Real network is forbidden; all expected requests go through the mocked API above.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('14a — scoped client discovery in the new-case wizard', () => {
  it('uses GET /clients and presents a successful empty scoped list without inventing an ADMIN fallback', async () => {
    routeClients([]); render(<NewCasePage />);
    expect(await screen.findByText('Müvekkil bulunamadı')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/clients');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.get.mock.calls.filter(([url]) => String(url).startsWith('/clients'))).toEqual([['/clients']]);
  });

  it('shows and selects the linked masked client returned by the same list endpoint', async () => {
    routeClients([linked]); render(<NewCasePage />);
    fireEvent.click(await screen.findByText('Linked Synthetic'));
    await vi.waitFor(() => expect(loadCaseWizardDraftState(scope).creditors).toEqual([
      expect.objectContaining({ id: linked.id, tckn: linked.tckn, isNew: false }),
    ]));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('retains the newly created client from the POST response even though refreshed GET /clients excludes it', async () => {
    routeClients([]); render(<NewCasePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Şahıs Ekle/ }));
    const heading = screen.getByText('Yeni Müvekkil Ekle');
    const modal = heading.parentElement!.parentElement!;
    for (const [label, value] of [[/^Ad\s*\*$/, 'New'], [/^Soyad\s*\*$/, 'Synthetic']] as const) {
      const input = within(modal).getByText((_, element) => element?.tagName === 'LABEL'
        && label.test(element.textContent?.trim() ?? '')).parentElement!.querySelector('input');
      expect(input).not.toBeNull(); fireEvent.change(input!, { target: { value } });
    }
    fireEvent.change(within(modal).getByPlaceholderText('11 haneli'), { target: { value: saved.tckn } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Kaydet ve Ekle' }));
    await vi.waitFor(() => expect(loadCaseWizardDraftState(scope).creditors).toEqual([
      expect.objectContaining({ id: saved.id, name: saved.name, isNew: false }),
    ]));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/clients', expect.objectContaining({ firstName: 'New', lastName: 'Synthetic', tckn: saved.tckn }));
    expect(mocks.get.mock.calls.filter(([url]) => url === '/clients')).toHaveLength(2);
    expect(screen.getByText('Müvekkil bulunamadı')).toBeInTheDocument();
    expect(screen.queryByText('Yeni Müvekkil Ekle')).toBeNull();
    expect(screen.getByText('New Synthetic')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
