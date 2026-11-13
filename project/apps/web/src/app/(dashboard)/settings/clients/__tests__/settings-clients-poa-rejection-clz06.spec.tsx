import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ClientsSettingsPage from '../page';
import { api } from '@/lib/api';
import { POA_AUTHORIZATION_DENIED_MESSAGE, POA_DUPLICATE_MESSAGE } from '@/lib/poa-ux';

const fixture = vi.hoisted(() => ({ scan: {} as Record<string, unknown> }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('@/components/client/PoaScannerWizard', () => ({
  PoaScannerWizard: ({ onScanComplete }: { onScanComplete: (result: any) => unknown }) => (
    <button onClick={() => void onScanComplete(fixture.scan)}>CL-Z06 tarama sonucu</button>
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
  unexpectedFetch = vi.fn(() => { throw new Error('CL-Z06 forbids real fetch'); });
  vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-Z06 forbids real XHR'); });
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
  fireEvent.click(await screen.findByRole('button', { name: 'CL-Z06 tarama sonucu' }));
  fireEvent.click(await screen.findByTestId('client-modal-save'));
}

async function expectSavedClientOnly() {
  await waitFor(() => expect(screen.queryByTestId('client-modal-save')).toBeNull());
  expect(await screen.findByText(saved.name)).toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/poa')).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled(); expect(api.delete).not.toHaveBeenCalled();
}

describe('CL-Z06 — settings save preserves the client and exposes POA rejection', () => {
  it('reaches the POA 403 after a successful client create and visibly explains partial success', async () => {
    await submitScan(); await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(`Müvekkil "${saved.name}" kaydedildi`));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('vekalet KAYDEDİLMEDİ'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('yeniden oluşturulmaz'));
    const [clientCall, poaCall] = vi.mocked(api.post).mock.calls;
    expect(clientCall[0]).toBe('/clients'); expect(clientCall[1]).not.toHaveProperty('poaNumber');
    expect(poaCall).toEqual(['/poa', expect.objectContaining({ clientId: saved.id, poaNumber: 'Z06-1', canCollect: true })]);
  });

  it('also exposes a manual-form POA rejection without requiring the scan consumer', async () => {
    render(<ClientsSettingsPage />);
    fireEvent.click(await screen.findByTestId('client-manual-create'));
    const panel = screen.getByText('Yeni Müvekkil').closest('.max-w-2xl') as HTMLElement;
    const boxes = within(panel).getAllByRole('textbox');
    fireEvent.change(boxes[0], { target: { value: 'Sentetik' } });
    fireEvent.change(boxes[1], { target: { value: 'Müvekkil' } });
    fireEvent.change(boxes[2], { target: { value: '10000000214' } });
    const journalLabel = within(panel).getByText('Yevmiye No');
    fireEvent.change(journalLabel.parentElement!.querySelector('input')!, { target: { value: 'MANUAL-Z06' } });
    fireEvent.click(screen.getByTestId('client-modal-save'));
    fireEvent.click(await screen.findByRole('button', { name: 'Eksik Kaydet ve Görev Oluştur' }));
    await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
  });

  it('preserves a definite POA validation failure message after the client has saved', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/clients') { created = true; return { data: saved } as any; }
      throw Object.assign(new Error('Geçerlilik tarihi zorunludur'), { status: 400 });
    });
    await submitScan(); await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Geçerlilik tarihi zorunludur'));
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
  });

  it('does not warn of rejection when the POA write succeeds', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/clients') created = true;
      return { data: url === '/clients' ? saved : { id: 'poa-z06' } } as any;
    });
    await submitScan(); await expectSavedClientOnly(); expect(window.alert).not.toHaveBeenCalled();
  });

  it('keeps the existing successful duplicate-suppression warning', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/clients') created = true;
      return { data: url === '/clients' ? saved : { _suppressedDuplicate: true } } as any;
    });
    await submitScan(); await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith(POA_DUPLICATE_MESSAGE);
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining('KAYDEDİLMEDİ'));
  });

  it('still exposes POA rejection when client creation returned the existing scoped client', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/clients') { created = true; return { data: { data: { ...saved, _existingReturned: true } } } as any; }
      throw denied();
    });
    await submitScan(); await expectSavedClientOnly();
    expect(window.alert).toHaveBeenCalledWith('Bu müvekkil zaten kayıtlı; yeni kayıt açılmadı, mevcut kart kullanıldı.');
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(POA_AUTHORIZATION_DENIED_MESSAGE));
  });

  it('does not attempt POA creation when the client itself is rejected', async () => {
    vi.mocked(api.post).mockRejectedValue(Object.assign(new Error('Client denied'), { status: 403 }));
    await submitScan();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Client denied'));
    expect(api.post).toHaveBeenCalledTimes(1); expect(screen.getByTestId('client-modal-save')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining('kaydedildi'));
  });

  it('does not manufacture a POA request for a client without POA information', async () => {
    fixture.scan.poaNumber = ''; fixture.scan.notaryName = '';
    await submitScan();
    await waitFor(() => expect(screen.queryByTestId('client-modal-save')).toBeNull());
    expect(api.post).toHaveBeenCalledTimes(1); expect(window.alert).not.toHaveBeenCalled();
  });
});
