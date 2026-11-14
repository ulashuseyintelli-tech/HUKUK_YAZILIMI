import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ClientsSettingsPage from '../page';
import { api } from '@/lib/api';
import { POA_AUTHORIZATION_DENIED_MESSAGE, POA_DUPLICATE_MESSAGE } from '@/lib/poa-ux';
import { CLIENT_CREATE_RESULT_INVALID_MESSAGE, CLIENT_EXISTING_RETURNED_MESSAGE } from '@/lib/client-create-result';

const fixture = vi.hoisted(() => ({ scan: {} as Record<string, unknown> }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('@/components/client/PoaScannerWizard', () => ({
  PoaScannerWizard: ({ onScanComplete }: { onScanComplete: (result: any) => unknown }) => (
    <button onClick={() => void onScanComplete(fixture.scan)}>CL-R17 tarama sonucu</button>
  ),
}));
vi.mock('@/components/bulk-email-modal', () => ({ BulkEmailModal: () => null }));

const saved = { id: 'clz06-client', type: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', name: 'Sentetik Müvekkil', displayName: 'Sentetik Müvekkil' };
const denied = () => Object.assign(new Error('POA reddedildi'), {
  status: 403, body: { reasonCode: 'CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND' },
});
let unexpectedFetch: ReturnType<typeof vi.fn>;
let unexpectedXhr: ReturnType<typeof vi.spyOn>;
let created: boolean;

beforeEach(() => {
  vi.resetAllMocks(); created = false;
  fixture.scan = { clientType: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', tckn: '10000000214', phone: '05000000000', email: 'clz06@example.invalid', poaNumber: 'Z06-1', notaryName: 'Sentetik Noter' };
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  unexpectedFetch = vi.fn(() => { throw new Error('CL-R17 forbids real fetch'); });
  vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-R17 forbids real XHR'); });
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/clients/lifecycle-eligibility') return { data: { data: { eligible: false, capabilities: { canCreate: true, canUpdateStandard: true, canUpdateSensitive: false, canManageLifecycle: false } } } } as any;
    if (url === '/clients') return { data: { data: created ? [saved] : [] } } as any;
    throw new Error(`Unexpected mocked GET ${url}`);
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === '/clients') { created = true; return { data: { data: saved } } as any; }
    if (url === '/poa') throw denied();
    throw new Error(`Unexpected mocked POST ${url}`);
  });
});

afterEach(() => {
  cleanup();
  expect(unexpectedFetch).not.toHaveBeenCalled();
  expect(unexpectedXhr).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function submitScan() {
  render(<ClientsSettingsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'CL-R17 tarama sonucu' }));
  fireEvent.click(await screen.findByTestId('client-modal-save'));
}

async function expectSavedClientOnly() {
  await waitFor(() => expect(screen.queryByTestId('client-modal-save')).toBeNull());
  expect(await screen.findByText(saved.name)).toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/poa')).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
}


describe('CL-R17 — settings create result consumer', () => {
  it.each([0, 1, 2])('reports the existing card without rewriting its profile (envelope=%s)', async (depth) => {
    let response: any = { ...saved, _existingReturned: true, _reactivated: false };
    for(let i=0;i<depth;i++) response={data:response};
    vi.mocked(api.post).mockImplementation(async (url: string) => { if(url==='/clients'){created=true;return response;} throw denied(); });
    await submitScan(); await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith(CLIENT_EXISTING_RETURNED_MESSAGE);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
    expect(api.put).not.toHaveBeenCalled();
  });
  it.each([null, {data:[]}, {data:{data:{id:''}}}])('does not close, refresh or create POA for an invalid result: %j', async (response) => {
    vi.mocked(api.post).mockResolvedValue(response as any);
    await submitScan();
    await waitFor(()=>expect(window.alert).toHaveBeenCalledWith(CLIENT_CREATE_RESULT_INVALID_MESSAGE));
    expect(api.post).toHaveBeenCalledTimes(1); expect(screen.getByTestId('client-modal-save')).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.filter(([url])=>url==='/clients')).toHaveLength(1);
  });
  it.each([403,409])('preserves a rejected create without a subsequent POA or close (status=%s)', async (status) => {
    vi.mocked(api.post).mockRejectedValue(Object.assign(new Error('Genel işlem reddi'),{status}));
    await submitScan(); await waitFor(()=>expect(window.alert).toHaveBeenCalledWith('Genel işlem reddi'));
    expect(api.post).toHaveBeenCalledTimes(1); expect(screen.getByTestId('client-modal-save')).toBeInTheDocument();
  });
  it('keeps the successful Client outcome and POA warning when list refresh fails',async()=>{
    vi.mocked(api.get).mockImplementation(async(url:string)=>{
      if(url==='/clients/lifecycle-eligibility')return {data:{data:{capabilities:{canCreate:true}}}} as any;
      if(url==='/clients'){if(created)throw new Error('Liste yenileme reddi');return {data:{data:[]}} as any;}
      throw new Error('Unexpected GET '+url);
    });
    await submitScan(); await waitFor(()=>expect(screen.queryByTestId('client-modal-save')).toBeNull());
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
    expect((await screen.findAllByText('Müvekkiller yüklenemedi.')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', {name: 'Tekrar dene'})).toHaveLength(2);
    expect(api.post).toHaveBeenCalledTimes(2); expect(api.put).not.toHaveBeenCalled();
  });
});
