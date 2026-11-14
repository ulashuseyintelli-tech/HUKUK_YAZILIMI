import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { loadCaseWizardDraftState, saveCaseWizardDraftState } from '@/lib/case-wizard-draft';
import { CLIENT_CREATE_RESULT_INVALID_MESSAGE, CLIENT_EXISTING_RETURNED_MESSAGE } from '@/lib/client-create-result';
import { POA_AUTHORIZATION_DENIED_MESSAGE } from '@/lib/poa-ux';

const fixture = vi.hoisted(() => ({ scan: {} as Record<string, unknown> }));
vi.mock('@/lib/api', () => ({ api: { getLawyers: vi.fn(), searchDebtors: vi.fn(), getNextFileNumber: vi.fn(), createCase: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(''), usePathname: () => '/cases/new' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'r17-user', tenantId: 'r17-tenant', role: 'USER' }, loading: false }) }));
vi.mock('@/components/client/PoaScannerWizard', () => ({ PoaScannerWizard: ({ asButton, onScanComplete }: { asButton?: boolean; onScanComplete: (result: any) => unknown }) => <button onClick={() => void onScanComplete(fixture.scan)}>{asButton ? 'R17 step3 scan' : 'R17 other scan'}</button> }));
vi.mock('@/components/case/DocumentSourceSelector', () => ({ DocumentSourceSelector: ({ onPoaScan }: { onPoaScan: (result: any) => unknown }) => <button onClick={() => void onPoaScan(fixture.scan)}>R17 document scan</button> }));

const scope = { tenantId: 'r17-tenant', userId: 'r17-user' };
const saved = { id: 'r17-client', type: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', name: 'Sentetik Müvekkil', displayName: 'Sentetik Müvekkil' };
const modes = ['document', 'step3', 'manual'] as const;
type Mode = typeof modes[number];
let response: unknown;
let rejection: unknown;
let failRefresh: boolean;
let denyPoa: boolean;
let clientGets: number;
let unexpectedFetch: ReturnType<typeof vi.fn>;
let unexpectedXhr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); response = { data: saved }; rejection = null; failRefresh = false; denyPoa = false; clientGets = 0;
  fixture.scan = { clientType: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', tckn: '10000000214', poaNumber: 'R17-1', notaryName: 'Sentetik Noter' };
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  unexpectedFetch = vi.fn(() => { throw new Error('CL-R17 forbids real fetch'); }); vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-R17 forbids real XHR'); });
  vi.mocked(api.getLawyers).mockResolvedValue([]); vi.mocked(api.searchDebtors).mockResolvedValue([]); vi.mocked(api.getNextFileNumber).mockResolvedValue('2026/R17');
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/clients') { clientGets++; if (failRefresh && clientGets > 1) throw new Error('Liste yenileme reddi'); }
    if (url === '/lookups') return { data: { data: { takipTuru: [], asama: [], risk: [], durumEtiketi: [], mahiyetTipi: [] } } } as any;
    return { data: { data: [] } } as any;
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === '/clients') { if (rejection) throw rejection; return response as any; }
    if (url === '/poa') { if (denyPoa) throw Object.assign(new Error('POA reddedildi'), { status: 403, body: { reasonCode: 'CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND' } }); return { data: { id: 'r17-poa' } } as any; }
    throw new Error(`Unexpected mocked POST ${url}`);
  });
});

afterEach(() => {
  cleanup(); localStorage.clear(); expect(unexpectedFetch).not.toHaveBeenCalled(); expect(unexpectedXhr).not.toHaveBeenCalled();
  expect(api.createCase).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function submit(mode: Mode, selected = false) {
  window.history.replaceState(null, '', '/cases/new');
  saveCaseWizardDraftState({ currentStep: mode === 'document' ? 0 : 3, showDocumentSelector: true, formSelection: { formCode: 'FORM_7', subFormCode: null }, ...(selected ? { creditors: [{ ...saved, isNew: false }] } : {}) }, scope);
  const view = render(<NewCasePage />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'));
  if (mode === 'manual') {
    fireEvent.click(await screen.findByRole('button', { name: 'Şahıs Ekle' }));
    const modal = screen.getByText('Yeni Müvekkil Ekle').closest('.max-w-2xl') as HTMLElement;
    const inputs = within(modal).getAllByRole('textbox');
    ['Sentetik', 'Müvekkil', '10000000214'].forEach((value, index) => fireEvent.change(inputs[index], { target: { value } }));
    fireEvent.change(within(modal).getByText('Yevmiye No').parentElement!.querySelector('input')!, { target: { value: 'R17-1' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Kaydet ve Ekle' }));
  } else fireEvent.click(await screen.findByRole('button', { name: mode === 'document' ? 'R17 document scan' : 'R17 step3 scan' }));
  await waitFor(() => expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1));
  return view;
}

async function expectSelected() {
  await waitFor(() => expect(loadCaseWizardDraftState(scope).creditors).toEqual([expect.objectContaining({ id: saved.id, isNew: false })]));
}

describe.each(modes)('CL-R17 — actual wizard create consumer: %s', (mode) => {
  it.each([0, 1, 2])('uses the existing card and reports it (envelope=%s)', async (depth) => {
    response = { ...saved, _existingReturned: true, _reactivated: false };
    for (let i = 0; i < depth; i++) response = { data: response };
    const view = await submit(mode); await expectSelected();
    expect(window.alert).toHaveBeenCalledWith(CLIENT_EXISTING_RETURNED_MESSAGE);
    expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/poa')).toEqual([['/poa', expect.objectContaining({ clientId: saved.id })]]);
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining('Müvekkil "Sentetik Müvekkil" ve vekalet kaydı başarıyla oluşturuldu'));
    view.rerender(<NewCasePage />); expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  });
  it('preserves the new-card flow without a duplicate warning', async () => {
    await submit(mode); await expectSelected(); expect(window.alert).not.toHaveBeenCalledWith(CLIENT_EXISTING_RETURNED_MESSAGE);
    expect(api.post).toHaveBeenCalledTimes(2);
  });
  it('rejects a malformed success before POA, selection or modal close', async () => {
    response = { data: { data: { ...saved, id: '' } } };
    await submit(mode);
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(mode === 'document' ? `Hata: ${CLIENT_CREATE_RESULT_INVALID_MESSAGE}` : CLIENT_CREATE_RESULT_INVALID_MESSAGE));
    expect(loadCaseWizardDraftState(scope).creditors).toEqual([]); expect(api.post).toHaveBeenCalledTimes(1);
    expect(clientGets).toBe(1);
    if (mode === 'manual') expect(screen.getByText('Yeni Müvekkil Ekle')).toBeInTheDocument();
  });
  it.each([403, 409])('preserves a rejected Client operation without subsequent writes (status=%s)', async (status) => {
    rejection = Object.assign(new Error('Genel işlem reddi'), { status });
    await submit(mode); await waitFor(() => expect(window.alert).toHaveBeenCalledWith(mode === 'document' ? 'Hata: Genel işlem reddi' : 'Genel işlem reddi'));
    expect(loadCaseWizardDraftState(scope).creditors).toEqual([]); expect(api.post).toHaveBeenCalledTimes(1); expect(clientGets).toBe(1);
  });
  it('retains the existing Client and visible POA rejection when refresh also fails', async () => {
    response = { data: { data: { ...saved, _existingReturned: true } } }; failRefresh = true; denyPoa = true;
    await submit(mode); await expectSelected();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('liste yenilenemedi')));
    expect(window.alert).toHaveBeenCalledWith(CLIENT_EXISTING_RETURNED_MESSAGE);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
    expect(api.post).toHaveBeenCalledTimes(2);
    if (mode === 'manual') expect(screen.queryByText('Yeni Müvekkil Ekle')).toBeNull();
  });
  it('does not add a second selection of the same canonical Client id', async () => {
    response = { data: { ...saved, _existingReturned: true } };
    await submit(mode, true); await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2)); await expectSelected();
  });
});
