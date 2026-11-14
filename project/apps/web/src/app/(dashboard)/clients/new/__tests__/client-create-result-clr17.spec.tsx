import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewClientPage from '../page';
import { api } from '@/lib/api';
import { CLIENT_CREATE_RESULT_INVALID_MESSAGE, CLIENT_EXISTING_RETURNED_MESSAGE } from '@/lib/client-create-result';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const saved = { id: 'r17-native', name: 'Sentetik Müvekkil' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { capabilities: { canCreate: true } } } as any);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function submit() {
  render(<NewClientPage />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Sentetik' } });
  fireEvent.change(screen.getByLabelText(/^Soyad/), { target: { value: 'Müvekkil' } });
  fireEvent.change(screen.getByLabelText(/^TCKN/), { target: { value: '10000000214' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
}

describe('CL-R17 — native Client create consumer', () => {
  it.each([0, 1, 2])('notifies before navigating to the existing scoped card (envelope=%s)', async (depth) => {
    let response: any = { ...saved, _existingReturned: true, _reactivated: false };
    for (let i = 0; i < depth; i++) response = { data: response };
    vi.mocked(api.post).mockResolvedValue(response);
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/clients/${saved.id}`));
    expect(window.alert).toHaveBeenCalledExactlyOnceWith(CLIENT_EXISTING_RETURNED_MESSAGE);
    expect(vi.mocked(window.alert).mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
    expect(api.post).toHaveBeenCalledWith('/clients', expect.not.objectContaining({ _existingReturned: expect.anything() }));
  });
  it('keeps new-card navigation without a false duplicate warning', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: saved } } as any);
    await submit(); await waitFor(() => expect(push).toHaveBeenCalledWith(`/clients/${saved.id}`));
    expect(window.alert).not.toHaveBeenCalled();
  });
  it.each([null, { data: [] }, { data: { id: '' } }])('does not navigate or retry an invalid successful response: %j', async (response) => {
    vi.mocked(api.post).mockResolvedValue(response as any);
    await submit(); expect(await screen.findByText(CLIENT_CREATE_RESULT_INVALID_MESSAGE)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it.each([403, 409])('preserves the server rejection without navigation (status=%s)', async (status) => {
    vi.mocked(api.post).mockRejectedValue(Object.assign(new Error('Genel ret'), { status, body: { message: 'İşlem reddedildi' } }));
    await submit(); expect(await screen.findByText('İşlem reddedildi')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
  });
});
