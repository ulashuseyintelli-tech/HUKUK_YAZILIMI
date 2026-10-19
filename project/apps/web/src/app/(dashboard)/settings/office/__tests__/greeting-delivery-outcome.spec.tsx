import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficeSettingsPage from '../page';
import { api } from '@/lib/api';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/settings/office', useSearchParams: () => new URLSearchParams('section=greeting') }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
let alert: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  mocked.get.mockImplementation(async (url: string) => {
    if (url === '/office') return { data: { name: 'Test', lawyers: [], bankAccounts: [] } };
    if (url === '/staff') return { data: { data: [] } };
    if (url === '/greetings/today') return { data: { birthdays: [{ id: 'client', displayName: 'Test Client' }], foundingAnniversaries: [], poaAnniversaries: [], specialDays: [], holidayClients: [] } };
    return { data: {} };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Manual greeting UI consumes confirmed delivery results', () => {
  it.each([
    ['failed', [{ channel: 'EMAIL', sent: false, success: false, status: 'FAILED' }]],
    ['pending', [{ channel: 'EMAIL', sent: false, success: false, status: 'PENDING' }]],
    ['contradictory', [{ channel: 'EMAIL', sent: true, success: false }]],
    ['contradictory status', [{ channel: 'EMAIL', sent: true, success: true, status: 'FAILED' }]],
    ['empty', []],
    ['malformed', { success: true }],
    ['wrong channel', [{ channel: 'SMS', sent: true, success: true }]],
  ])('%s result never displays success and never automatically retries', async (_name, result) => {
    mocked.post.mockResolvedValue({ data: result });
    render(<OfficeSettingsPage />);
    const send = await screen.findByRole('button', { name: 'Gönder' });
    fireEvent.click(send);
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert).not.toHaveBeenCalledWith('Tebrik gönderildi.');
    expect(alert.mock.calls[0][0]).toContain('doğrulanamadı');
    expect(mocked.post).toHaveBeenCalledTimes(1);
    expect(mocked.post).toHaveBeenCalledWith('/greetings/send', { clientId: 'client', type: 'BIRTHDAY', channel: 'EMAIL', specialDayId: undefined });
  });

  it('confirmed email result retains the success notification', async () => {
    mocked.post.mockResolvedValue({ data: [{ channel: 'EMAIL', sent: true, success: true, status: 'SENT' }] });
    render(<OfficeSettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Tebrik gönderildi.'));
    expect(mocked.post).toHaveBeenCalledTimes(1);
  });
});
