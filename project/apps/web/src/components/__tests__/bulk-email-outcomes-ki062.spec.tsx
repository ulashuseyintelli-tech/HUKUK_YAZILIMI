import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkEmailModal } from '../bulk-email-modal';
import { api } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));
const recipients = [{ id: 'c1', name: 'Synthetic A', email: 'a@example.test' }, { id: 'c2', name: 'Synthetic B', email: 'b@example.test' }];
const privateError = 'private-recipient@example.test PRIVATE-PROVIDER-SECRET';
let onClose: ReturnType<typeof vi.fn>;
let logged: ReturnType<typeof vi.spyOn>;
let alerted: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(api.post).mockReset(); onClose = vi.fn();
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  alerted = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(document.body.textContent).not.toContain(privateError);
  expect(logged).not.toHaveBeenCalled(); expect(alerted).not.toHaveBeenCalled();
  cleanup(); vi.restoreAllMocks();
});
function open() { return render(<BulkEmailModal isOpen onClose={onClose} recipients={recipients} type="clients" />); }
function fill() {
  fireEvent.change(screen.getByPlaceholderText('E-posta konusu'), { target: { value: 'Synthetic subject' } });
  fireEvent.change(screen.getByPlaceholderText('E-posta içeriği...'), { target: { value: 'Synthetic body' } });
  return screen.getByRole('button', { name: /Gönder \(2\)/ });
}
function reply(sent: number, failed: number) { return { success: true, details: { sent, failed, errors: [privateError] } }; }
function expectRequest() {
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/client-notifications/bulk-email', { recipients: ['c1', 'c2'], subject: 'Synthetic subject', message: 'Synthetic body', type: 'clients' });
}

describe('KI-062 bulk-email actual consumer outcomes', () => {
  it.each([1, 2])('reports only complete counts as server acceptance (envelope=%s)', async depth => {
    let response: unknown = reply(2, 0); for (let i = 0; i < depth; i++) response = { data: response };
    vi.mocked(api.post).mockResolvedValueOnce(response as any);
    open(); fireEvent.click(fill());
    const result = await screen.findByRole('status');
    expect(result.textContent).toContain('Sunucu kabulü: 2. Başarısız/belirsiz sonuç: 0.');
    expect(result.textContent).toContain('Alıcıya teslim teyidi değildir.');
    expectRequest(); expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sunucu kabul etti' })).toBeDisabled();
  });
  it.each([[1, 1], [0, 2]])('keeps %s/%s partial or failed outcomes visible without whole-group replay', async (sent, failed) => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: reply(sent, failed) } as any);
    open(); fireEvent.click(fill());
    expect((await screen.findByRole('alert')).textContent).toContain(`Sunucu kabulü: ${sent}. Başarısız/belirsiz sonuç: ${failed}.`);
    expect(screen.getByDisplayValue('Synthetic body')).toBeInTheDocument();
    expect(screen.queryByText('Gönderildi')).toBeNull(); expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sonuç alındı' })); expectRequest();
  });
  it.each([null, {}, { success: true }, reply(0, 0), reply(1, 0), reply(-1, 3), reply(0.5, 1.5),
    { success: true, details: { sent: '2', failed: 0 } }, { ...reply(2, 0), success: false }])(
    'does not treat a malformed, incomplete or unaccounted 2xx as all-success: %j', async body => {
      vi.mocked(api.post).mockResolvedValueOnce({ data: body } as any); open(); fireEvent.click(fill());
      expect((await screen.findByRole('alert')).textContent).toContain('sonucu doğrulanamadı');
      expect(screen.queryByRole('status')).toBeNull(); expect(onClose).not.toHaveBeenCalled(); expectRequest();
    },
  );
  it.each([403, 500, undefined])('shows a safe rejection/unknown result (status=%s), never raw diagnostics', async status => {
    vi.mocked(api.post).mockRejectedValueOnce(status ? buildApiHttpError({ message: privateError }, status) : new Error(privateError));
    open(); fireEvent.click(fill());
    expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'yetkiniz yok' : 'sonucu alınamadı');
    expect(onClose).not.toHaveBeenCalled(); expectRequest();
  });
  it('locks duplicate same-tick submission until the first response completes', async () => {
    let release!: (v: any) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    open(); const button = fill(); act(() => { button.click(); button.click(); }); expectRequest();
    await act(async () => { release({ data: reply(1, 1) }); });
    await screen.findByRole('alert'); expectRequest();
  });
  it('rejects a late response from a closed selection and clears prior inputs on reopen', async () => {
    let release!: (v: any) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = open(); fireEvent.click(fill()); expectRequest();
    view.rerender(<BulkEmailModal isOpen={false} onClose={onClose} recipients={recipients} type="clients" />);
    view.rerender(<BulkEmailModal isOpen onClose={onClose} recipients={recipients} type="clients" />);
    await act(async () => { release({ data: reply(2, 0) }); });
    expect(screen.queryByRole('status')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByPlaceholderText('E-posta konusu')).toHaveValue('');
    expect(screen.getByPlaceholderText('E-posta içeriği...')).toHaveValue(''); expectRequest();
  });
});
