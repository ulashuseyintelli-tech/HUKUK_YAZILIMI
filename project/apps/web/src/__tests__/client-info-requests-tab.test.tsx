import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientInfoRequestsTab } from '@/components/client/client-info-requests-tab';
import { api } from '@/lib/api';

let currentUser: { id: string; tenantId: string; role: string } | null = { id: 'user-1', tenantId: 'tenant-1', role: 'USER' };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: currentUser }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      getClientInfoRequestsForCase: vi.fn(),
      sendClientInfoRequestReminder: vi.fn(),
      markClientInfoRequestAsResponded: vi.fn(),
      markClientInfoRequestAsNoResponse: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  getClientInfoRequestsForCase: ReturnType<typeof vi.fn>;
  sendClientInfoRequestReminder: ReturnType<typeof vi.fn>;
  markClientInfoRequestAsResponded: ReturnType<typeof vi.fn>;
  markClientInfoRequestAsNoResponse: ReturnType<typeof vi.fn>;
};

const CASES = [
  { id: 'case-1', fileNumber: '2026/1', caseStatus: 'DERDEST' },
  { id: 'case-2', fileNumber: '2026/2', caseStatus: 'ISLEMDE' },
];

const infoRequest = (over: Record<string, unknown> = {}) => ({
  id: 'ir-1',
  caseId: 'case-1',
  clientId: 'client-1',
  emailTo: 'muvekkil@example.com',
  emailSubject: 'Adres bilgisi talebi',
  emailBody: 'Lütfen güncel adresinizi iletiniz.',
  status: 'SENT',
  sentAt: '2026-06-20T00:00:00.000Z',
  reminderCount: 0,
  ...over,
});

function mockInfoRequests() {
  apiMock.getClientInfoRequestsForCase.mockImplementation(async (caseId: string) => {
    if (caseId === 'case-1') return [infoRequest()];
    if (caseId === 'case-2') {
      return [infoRequest({ id: 'ir-2', caseId: 'case-2', status: 'RESPONDED', respondedAt: '2026-06-25T00:00:00.000Z' })];
    }
    return [];
  });
}

describe('ClientInfoRequestsTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser = { id: 'user-1', tenantId: 'tenant-1', role: 'USER' };
    mockInfoRequests();
  });

  it('no cases empty state and does not fetch', () => {
    render(<ClientInfoRequestsTab cases={[]} />);

    expect(
      screen.getByText('Bilgi talepleri dosya üzerinden gönderilir; bu müvekkile bağlı dosya yok.'),
    ).toBeTruthy();
    expect(apiMock.getClientInfoRequestsForCase).not.toHaveBeenCalled();
  });

  it('one case auto-selects and renders read-only info-request data', async () => {
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    expect(screen.getByText('Dosya: 2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('muvekkil@example.com')).toBeTruthy();
    expect(screen.getByText('Adres bilgisi talebi')).toBeTruthy();
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledWith('case-1');
  });

  it('multiple cases renders selector using file number and status', async () => {
    render(<ClientInfoRequestsTab cases={CASES} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    expect(screen.getByLabelText('Dosya')).toBeTruthy();
    expect(screen.getByText('2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('2026/2 · ISLEMDE')).toBeTruthy();
  });

  it('changing case reloads selected case info-requests', async () => {
    render(<ClientInfoRequestsTab cases={CASES} />);
    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Dosya'), { target: { value: 'case-2' } });

    await waitFor(() => expect(screen.getByText('Yanıtlandı')).toBeTruthy());
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenLastCalledWith('case-2');
    expect(screen.queryByText('Gönderildi')).toBeNull();
  });

  it('renders empty state when case has no info requests', async () => {
    apiMock.getClientInfoRequestsForCase.mockResolvedValueOnce([]);
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Bu dosya için bilgi talebi yok.')).toBeTruthy());
  });

  it('renders error state when fetch fails', async () => {
    apiMock.getClientInfoRequestsForCase.mockRejectedValueOnce(new Error('network'));
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Bilgi talepleri yüklenemedi.')).toBeTruthy());
  });

  it('is read-only: introduces no mutation buttons', async () => {
    render(<ClientInfoRequestsTab cases={[CASES[0]]} />);

    await waitFor(() => expect(screen.getByText('Gönderildi')).toBeTruthy());
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  const actions = { canSendReminder: true, canMarkResponded: true, canMarkNoResponse: true };
  const scopedRow = (over: Record<string, unknown> = {}) => infoRequest({ actions, ...over });
  const openScoped = async (over: Record<string, unknown> = {}) => {
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([scopedRow(over)]);
    const view = render(<ClientInfoRequestsTab clientId="client-1" cases={CASES} />);
    await screen.findByRole('button', { name: 'Yanıtlandı' });
    return view;
  };
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  };

  it('consumes the scoped list and preserves the distinct send and status thresholds', async () => {
    await openScoped({ actions: { ...actions, canSendReminder: false } });
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledWith('case-1', 'client-1');
    expect(screen.queryByRole('button', { name: 'Hatırlat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Yanıt Yok' })).toBeTruthy();
    expect(apiMock.markClientInfoRequestAsResponded).not.toHaveBeenCalled();
  });

  it.each(['VIEWER', 'unknown', null])('hides all actions for missing or disallowed actor %s despite a stale capability', async role => {
    currentUser = role ? { id: 'user-1', tenantId: 'tenant-1', role } : null;
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([scopedRow()]);
    render(<ClientInfoRequestsTab clientId="client-1" cases={[CASES[0]]} />);
    await screen.findByText('Gönderildi');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('requires confirmation, supports cancellation and sends one scoped reminder despite double click', async () => {
    const pending = deferred<ReturnType<typeof infoRequest>>();
    apiMock.sendClientInfoRequestReminder.mockReturnValue(pending.promise);
    await openScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlat' }));
    expect(screen.getByText('Mevcut alıcıya bir hatırlatma e-postası gönderilecek.')).toBeTruthy();
    expect(apiMock.sendClientInfoRequestReminder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('button', { name: 'Hatırlatmayı gönder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlat' }));
    const confirm = screen.getByRole('button', { name: 'Hatırlatmayı gönder' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(apiMock.sendClientInfoRequestReminder).toHaveBeenCalledExactlyOnceWith('ir-1', { clientId: 'client-1', caseId: 'case-1' });
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([scopedRow({ reminderCount: 1 })]);
    await act(async () => { pending.resolve(scopedRow({ emailSent: true, reminderCount: 1 })); });
    await screen.findByText('Bilgi talebi işlemi tamamlandı.');
  });

  it.each(['RESPONDED', 'NO_RESPONSE'])('records %s as a staff status only and reloads the scoped list', async status => {
    await openScoped();
    const fn = status === 'RESPONDED' ? apiMock.markClientInfoRequestAsResponded : apiMock.markClientInfoRequestAsNoResponse;
    fn.mockResolvedValue(scopedRow({ status }));
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([scopedRow({ status })]);
    fireEvent.click(screen.getByRole('button', { name: status === 'RESPONDED' ? 'Yanıtlandı' : 'Yanıt Yok' }));
    expect(screen.getByText('Bu işlem personelin yanıt durumu kaydıdır; doğrulanmış müvekkil onayı değildir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Durumu kaydet' }));
    await screen.findByText('Bilgi talebi işlemi tamamlandı.');
    const scope = { clientId: 'client-1', caseId: 'case-1' };
    expect(fn).toHaveBeenCalledExactlyOnceWith(...(status === 'RESPONDED' ? ['ir-1', 'Personel kaydı: müvekkil yanıt verdi', scope] : ['ir-1', scope]));
    expect(apiMock.sendClientInfoRequestReminder).not.toHaveBeenCalled();
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenLastCalledWith('case-1', 'client-1');
    expect(screen.queryByRole('button', { name: 'Durumu kaydet' })).toBeNull();
  });

  it.each([
    ['CLIENT_INFO_REQUEST_EMAIL_FAILED', 'Hatırlatma gönderilemedi; hatırlatma kaydedilmedi.'],
    ['CLIENT_INFO_REQUEST_EMAIL_OUTCOME_UNKNOWN', 'Gönderim sonucu doğrulanamadı. Yeniden göndermeden önce mevcut sonucu kontrol edin.'],
  ])('handles provider %s without leaking provider text or resending', async (reasonCode, message) => {
    await openScoped();
    apiMock.sendClientInfoRequestReminder.mockRejectedValue(Object.assign(new Error('private provider details'), { body: { reasonCode } }));
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlatmayı gönder' }));
    await screen.findByRole('alert');
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText('private provider details')).toBeNull();
    expect(screen.queryByText('Bilgi talebi işlemi tamamlandı.')).toBeNull();
    expect(apiMock.sendClientInfoRequestReminder).toHaveBeenCalledTimes(1);
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledTimes(1);
  });

  it('does not accept an unverified successful HTTP payload as a reminder success', async () => {
    await openScoped();
    apiMock.sendClientInfoRequestReminder.mockResolvedValue(scopedRow({ reminderCount: 1, emailSent: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlatmayı gönder' }));
    await screen.findByText('Gönderim sonucu doğrulanamadı. Yeniden göndermeden önce mevcut sonucu kontrol edin.');
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Bilgi talebi işlemi tamamlandı.')).toBeNull();
  });

  it('a denied status change is an error, with no success or empty-list substitution', async () => {
    await openScoped();
    apiMock.markClientInfoRequestAsResponded.mockRejectedValue({ status: 403, body: { message: 'private details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yanıtlandı' }));
    fireEvent.click(screen.getByRole('button', { name: 'Durumu kaydet' }));
    await screen.findByText('Durum güncellenemedi. Güncel yetki ve talep durumunu kontrol edin.');
    expect(screen.queryByText('Bilgi talebi işlemi tamamlandı.')).toBeNull();
    expect(screen.queryByText('Bu dosya için bilgi talebi yok.')).toBeNull();
    expect(apiMock.getClientInfoRequestsForCase).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a completed status write from a failed list refresh', async () => {
    await openScoped();
    apiMock.markClientInfoRequestAsNoResponse.mockResolvedValue(scopedRow({ status: 'NO_RESPONSE' }));
    apiMock.getClientInfoRequestsForCase.mockRejectedValue(new Error('refresh failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Yanıt Yok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Durumu kaydet' }));
    await screen.findByText('İşlem tamamlandı; liste yenilenemedi. Tekrar işlem yapmadan güncel kaydı kontrol edin.');
    expect(screen.queryByText('Bilgi talebi işlemi tamamlandı.')).toBeNull();
    expect(apiMock.markClientInfoRequestAsNoResponse).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong-parent list without presenting it as an empty or successful result', async () => {
    apiMock.getClientInfoRequestsForCase.mockResolvedValue([scopedRow({ clientId: 'other-client' })]);
    render(<ClientInfoRequestsTab clientId="client-1" cases={[CASES[0]]} />);
    await screen.findByText('Bilgi talepleri yüklenemedi.');
    expect(screen.queryByText('muvekkil@example.com')).toBeNull();
    expect(screen.queryByText('Bu dosya için bilgi talebi yok.')).toBeNull();
  });

  it('clears old client data and confirmation immediately and rejects a late old-context fetch', async () => {
    const pending = deferred<ReturnType<typeof infoRequest>[]>();
    const view = await openScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Yanıtlandı' }));
    apiMock.getClientInfoRequestsForCase.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
    view.rerender(<ClientInfoRequestsTab clientId="client-2" cases={CASES} />);
    expect(screen.queryByRole('button', { name: 'Durumu kaydet' })).toBeNull();
    expect(screen.queryByText('muvekkil@example.com')).toBeNull();
    view.rerender(<ClientInfoRequestsTab clientId="client-3" cases={CASES} />);
    await screen.findByText('Bu dosya için bilgi talebi yok.');
    await act(async () => { pending.resolve([scopedRow({ clientId: 'client-2' })]); });
    expect(screen.queryByText('muvekkil@example.com')).toBeNull();
    expect(screen.getByText('Bu dosya için bilgi talebi yok.')).toBeTruthy();
    expect(apiMock.markClientInfoRequestAsResponded).not.toHaveBeenCalled();
  });

  it('clears the confirmation when actor role changes and cannot send from that stale confirmation', async () => {
    const view = await openScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Hatırlat' }));
    currentUser = { id: 'user-1', tenantId: 'tenant-1', role: 'VIEWER' };
    view.rerender(<ClientInfoRequestsTab clientId="client-1" cases={CASES} />);
    await screen.findByText('Gönderildi');
    expect(screen.queryByRole('button', { name: 'Hatırlatmayı gönder' })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(apiMock.sendClientInfoRequestReminder).not.toHaveBeenCalled();
  });

  it('uses the actual SDK methods with encoded parent selectors and preserves legacy unscoped calls', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    const invoke = vi.spyOn(actual.api as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request').mockResolvedValue({});
    try {
      const scope = { clientId: 'client /?', caseId: 'case /?' };
      await actual.api.getClientInfoRequestsForCase(scope.caseId, scope.clientId);
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/case/case%20%2F%3F?clientId=client%20%2F%3F');
      await actual.api.sendClientInfoRequestReminder('request /', scope);
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/request%20%2F/reminder?clientId=client+%2F%3F&caseId=case+%2F%3F', { method: 'POST' });
      await actual.api.markClientInfoRequestAsResponded('request /', 'staff note', scope);
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/request%20%2F/respond?clientId=client+%2F%3F&caseId=case+%2F%3F', { method: 'PUT', body: JSON.stringify({ notes: 'staff note' }) });
      await actual.api.markClientInfoRequestAsNoResponse('request /', scope);
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/request%20%2F/no-response?clientId=client+%2F%3F&caseId=case+%2F%3F', { method: 'PUT' });
      await actual.api.getClientInfoRequestsForCase('case-1');
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/case/case-1');
      await actual.api.sendClientInfoRequestReminder('ir-1');
      expect(invoke).toHaveBeenLastCalledWith('/address-discovery/client-info-request/ir-1/reminder', { method: 'POST' });
    } finally { invoke.mockRestore(); }
  });
});
