import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TasksPage from '../page';
import { api } from '@/lib/api';

const auth = vi.hoisted(() => ({ user: { id: 'creator', tenantId: 'tenant', role: 'USER' } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock('@/components/scope/ViewScopeBadge', () => ({ ViewScopeBadge: () => null }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn(), cancelTask: vi.fn(), getTaskCancellations: vi.fn() } }));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const baseRows = () => [
  { id: 'a', title: 'Görev A', createdById: 'creator', status: 'PENDING', priority: 'MEDIUM', createdAt: '2026-11-05T10:00:00Z' },
  { id: 'b', title: 'Görev B', createdById: 'other', status: 'PENDING', priority: 'LOW', createdAt: '2026-11-05T10:00:00Z' },
];
let rows = baseRows();
const historyPage = (reason = 'Karar gözden geçirildi', page = 1, totalPages = 1) => ({ data: {
  data: [{ id: `event-${page}`, actorUserId: 'creator', actorName: 'Oluşturan kişi', fromStatus: 'PENDING', toStatus: 'CANCELLED', reason, createdAt: '2026-11-05T12:00:00Z' }],
  meta: { page, limit: 20, total: totalPages === 1 ? 1 : 21, totalPages },
} });

beforeEach(() => {
  auth.user = { id: 'creator', tenantId: 'tenant', role: 'USER' };
  rows = baseRows();
  for (const mock of Object.values(mocked)) mock.mockReset();
  mocked.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/tasks?')) return { data: { data: rows, meta: { total: rows.length, page: 1, limit: 20, totalPages: 1,
      summary: { pending: rows.filter(row => row.status === 'PENDING').length, inProgress: 0, operationalOpen: 0 } } } };
    return { data: { data: [] } };
  });
  mocked.cancelTask.mockImplementation(async (id: string) => {
    rows = rows.map(row => row.id === id ? { ...row, status: 'CANCELLED' } : row);
    return { data: { cancellationId: 'event' } };
  });
  mocked.getTaskCancellations.mockResolvedValue(historyPage());
});
afterEach(cleanup);
const renderTasks = async () => { render(<TasksPage />); await screen.findByText('Görev A'); };
const openCancellation = async () => {
  await renderTasks();
  fireEvent.click(screen.getByRole('button', { name: 'Görev A görevini iptal et' }));
  return screen.getByRole('dialog', { name: 'Görevi gerekçeli iptal et' });
};

describe('2b task cancellation UI', () => {
  it('offers cancellation only to creator/ADMIN; VIEWER and unrelated users gain no action', async () => {
    await renderTasks();
    expect(screen.getByRole('button', { name: 'Görev A görevini iptal et' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Görev B görevini iptal et' })).toBeNull();
    cleanup(); auth.user = { ...auth.user, role: 'ADMIN' };
    await renderTasks();
    expect(screen.getByRole('button', { name: 'Görev B görevini iptal et' })).toBeTruthy();
    cleanup(); auth.user = { ...auth.user, role: 'VIEWER' };
    await renderTasks();
    expect(screen.queryByRole('button', { name: /görevini iptal et/ })).toBeNull();
  });

  it('requires a reason, uses the dedicated action and reloads without physical DELETE', async () => {
    const dialog = await openCancellation();
    expect((within(dialog).getByRole('button', { name: 'İptali kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('İptal gerekçesi'), { target: { value: '  İş artık gerekli değil  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptali kaydet' }));
    await waitFor(() => expect(mocked.cancelTask).toHaveBeenCalledWith('a', 'İş artık gerekli değil'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Görev A')).toBeTruthy();
    expect(screen.getByText('İptal edildi')).toBeTruthy();
    expect(mocked.delete).not.toHaveBeenCalled(); expect(mocked.put).not.toHaveBeenCalled();
  });

  it('a rejected action keeps the dialog/reason and does not claim success', async () => {
    mocked.cancelTask.mockRejectedValue({ status: 403, body: { code: 'TASK_CANCELLATION_FORBIDDEN', message: 'Bu görev kapsamında iptal yetkisi yok.' } });
    const dialog = await openCancellation();
    fireEvent.change(within(dialog).getByLabelText('İptal gerekçesi'), { target: { value: 'Gerekçem' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptali kaydet' }));
    await within(dialog).findByText('Bu görev kapsamında iptal yetkisi yok.');
    expect((within(dialog).getByLabelText('İptal gerekçesi') as HTMLTextAreaElement).value).toBe('Gerekçem');
    expect(screen.queryByText('İptal edildi')).toBeNull();
  });

  it('successful cancellation with failed reload is shown as saved-but-stale', async () => {
    const dialog = await openCancellation();
    mocked.get.mockRejectedValue(new Error('Yenileme yok'));
    fireEvent.change(within(dialog).getByLabelText('İptal gerekçesi'), { target: { value: 'Değişti' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptali kaydet' }));
    await screen.findByText(/Görev İPTAL EDİLDİ, ancak liste yenilenemedi/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.cancelTask).toHaveBeenCalledTimes(1);
  });

  it('pending submit is locked and cannot issue a second cancellation', async () => {
    let release!: (value: unknown) => void;
    mocked.cancelTask.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const dialog = await openCancellation();
    fireEvent.change(within(dialog).getByLabelText('İptal gerekçesi'), { target: { value: 'Gerekçe' } });
    const button = within(dialog).getByRole('button', { name: 'İptali kaydet' });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocked.cancelTask).toHaveBeenCalledTimes(1);
    await act(async () => release({ data: {} }));
  });

  it('history denial is visible and is not presented as an empty history', async () => {
    mocked.getTaskCancellations.mockRejectedValue({ status: 403, body: { message: 'Geçmişe erişim reddedildi' } });
    await renderTasks();
    fireEvent.click(screen.getByRole('button', { name: 'Görev A iptal geçmişi' }));
    await screen.findByText('Geçmişe erişim reddedildi');
    expect(screen.queryByText('Kayıtlı manuel iptal yok.')).toBeNull();
  });

  it('a late response for the closed task never replaces another task history', async () => {
    let release!: (value: unknown) => void;
    mocked.getTaskCancellations.mockImplementation((id: string) => id === 'a' ? new Promise(resolve => { release = resolve; }) : Promise.resolve(historyPage('B gerekçesi')));
    await renderTasks();
    fireEvent.click(screen.getByRole('button', { name: 'Görev A iptal geçmişi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Görev B iptal geçmişi' }));
    await screen.findByText('B gerekçesi');
    await act(async () => release(historyPage('A eski gerekçesi')));
    expect(screen.queryByText('A eski gerekçesi')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'İptal geçmişi — Görev B' })).toBeTruthy();
  });

  it('renders reason as text and loads subsequent history pages explicitly', async () => {
    const reason = '<img src=x onerror=alert(1)>';
    mocked.getTaskCancellations.mockImplementation(async (_id: string, page: number) => historyPage(page === 1 ? reason : 'İkinci sayfa', page, 2));
    await renderTasks();
    fireEvent.click(screen.getByRole('button', { name: 'Görev A iptal geçmişi' }));
    await screen.findByText(reason);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki kayıtlar' }));
    await screen.findByText('İkinci sayfa');
    expect(mocked.getTaskCancellations).toHaveBeenLastCalledWith('a', 2);
    expect(screen.queryByText(reason)).toBeNull();
  });
});
