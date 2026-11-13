import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { loadCaseWizardDraftState, saveCaseWizardDraftState } from '@/lib/case-wizard-draft';
import { POA_AUTHORIZATION_DENIED_MESSAGE } from '@/lib/poa-ux';

const fixture = vi.hoisted(() => ({ scan: {} as Record<string, unknown> }));
vi.mock('@/lib/api', () => ({ api: { getLawyers: vi.fn(), searchDebtors: vi.fn(), getNextFileNumber: vi.fn(), createCase: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(''), usePathname: () => '/cases/new' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'z06-user', tenantId: 'z06-tenant', role: 'USER' }, loading: false }) }));
vi.mock('@/components/client/PoaScannerWizard', () => ({
  PoaScannerWizard: ({ asButton, onScanComplete }: { asButton?: boolean; onScanComplete: (result: any) => unknown }) => (
    <button onClick={() => void onScanComplete(fixture.scan)}>{asButton ? 'CL-Z06 adım-3 tarama' : 'CL-Z06 diğer tarama'}</button>
  ),
}));

const scope = { tenantId: 'z06-tenant', userId: 'z06-user' };
const saved = { id: 'z06-client', type: 'PERSON', name: 'Sentetik Müvekkil', displayName: 'Sentetik Müvekkil' };
const denied = () => Object.assign(new Error('POA reddedildi'), { status: 403, body: { reasonCode: 'CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND' } });
let unexpectedFetch: ReturnType<typeof vi.fn>;
let unexpectedXhr: ReturnType<typeof vi.spyOn>;
let clientGets: number;
let failRefresh: boolean;

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); clientGets = 0; failRefresh = false;
  fixture.scan = { clientType: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', tckn: '10000000214', poaNumber: 'Z06-1', notaryName: 'Sentetik Noter' };
  window.history.replaceState(null, '', '/cases/new');
  saveCaseWizardDraftState({ currentStep: 3, formSelection: { formCode: 'FORM_7', subFormCode: null } }, scope);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  unexpectedFetch = vi.fn(() => { throw new Error('CL-Z06 forbids real fetch'); });
  vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-Z06 forbids real XHR'); });
  vi.mocked(api.getLawyers).mockResolvedValue([]); vi.mocked(api.searchDebtors).mockResolvedValue([]);
  vi.mocked(api.getNextFileNumber).mockResolvedValue('2026/Z06');
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/clients') {
      clientGets++;
      if (failRefresh && clientGets > 1) throw new Error('Liste yenileme reddi');
      return { data: { data: [] } } as any;
    }
    if (url === '/lookups') return { data: { data: { takipTuru: [], asama: [], risk: [], durumEtiketi: [], mahiyetTipi: [] } } } as any;
    return { data: { data: [] } } as any;
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === '/clients') return { data: { data: saved } } as any;
    if (url === '/poa') throw denied();
    throw new Error(`Unexpected mocked POST ${url}`);
  });
});

afterEach(() => {
  cleanup(); localStorage.clear();
  expect(unexpectedFetch).not.toHaveBeenCalled(); expect(unexpectedXhr).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function scan() {
  const view = render(<NewCasePage />);
  await screen.findByText('Müvekkil bulunamadı');
  fireEvent.click(await screen.findByRole('button', { name: 'CL-Z06 adım-3 tarama' }));
  return view;
}

async function expectSelectedClient() {
  await waitFor(() => expect(loadCaseWizardDraftState(scope).creditors).toEqual([
    expect.objectContaining({ id: saved.id, isNew: false }),
  ]));
  expect(screen.getByText(saved.name)).toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  expect(api.createCase).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
}

describe('CL-Z06 — the actual step-3 scan callback exposes partial success', () => {
  it('shows POA authority rejection after client creation and keeps the saved client selected', async () => {
    const view = await scan(); await expectSelectedClient();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE)));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(`Müvekkil "${saved.name}" kaydedildi`));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('vekalet KAYDEDİLMEDİ'));
    expect(vi.mocked(api.post).mock.calls).toEqual([
      ['/clients', expect.not.objectContaining({ poaNumber: expect.anything() })],
      ['/poa', expect.objectContaining({ clientId: saved.id, journalNo: 'Z06-1', lawyerIds: [] })],
    ]);
    view.rerender(<NewCasePage />);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('preserves client selection and visible POA rejection even when subsequent list refresh fails', async () => {
    failRefresh = true;
    await scan(); await expectSelectedClient();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE)));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('liste yenilenemedi'));
    expect(window.alert).not.toHaveBeenCalledWith('Liste yenileme reddi');
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('shows the existing definite POA validation reason rather than client-save failure', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/clients') return { data: saved } as any;
      throw Object.assign(new Error('Geçerlilik tarihi zorunludur'), { status: 400 });
    });
    await scan(); await expectSelectedClient();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Geçerlilik tarihi zorunludur'));
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
  });

  it.each([false, true])('does not report rejection for successful POA creation (suppressed=%s)', async (suppressed) => {
    vi.mocked(api.post).mockImplementation(async (url: string) => ({ data: url === '/clients' ? saved : { id: 'z06-poa', _suppressedDuplicate: suppressed } }) as any);
    await scan(); await expectSelectedClient(); expect(api.post).toHaveBeenCalledTimes(2);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('does not call POA or claim partial success when client creation itself is rejected', async () => {
    vi.mocked(api.post).mockRejectedValue(Object.assign(new Error('Client denied'), { status: 403 }));
    await scan();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Client denied'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(loadCaseWizardDraftState(scope).creditors).toEqual([]);
    expect(api.createCase).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining('kaydedildi'));
  });

  it('does not attempt POA or select an invalid client response without an id', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { name: saved.name } } } as any);
    await scan();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Müvekkil kaydedilemedi - ID alınamadı'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(loadCaseWizardDraftState(scope).creditors).toEqual([]);
    expect(api.createCase).not.toHaveBeenCalled();
  });

  it('does not create a POA when the scan carries only client information', async () => {
    fixture.scan.poaNumber = ''; fixture.scan.notaryName = '';
    await scan(); await expectSelectedClient(); expect(api.post).toHaveBeenCalledTimes(1);
    expect(window.alert).not.toHaveBeenCalled();
  });
});
