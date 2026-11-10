import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpecialCategorySection } from '../SpecialCategorySection';

const caps = vi.fn(), list = vi.fn(), read = vi.fn(), candidates = vi.fn(), grants = vi.fn(), grant = vi.fn(), revoke = vi.fn(), duty = vi.fn();
vi.mock('@/lib/api/client-compliance', async original => ({
  ...await original<typeof import('@/lib/api/client-compliance')>(),
  clientComplianceSpecialCategoryApi: { listRecords: (...a: unknown[]) => list(...a), readRecord: (...a: unknown[]) => read(...a) },
  clientSpecialCategoryAccessApi: {
    capabilities: (...a: unknown[]) => caps(...a), candidates: (...a: unknown[]) => candidates(...a),
    listGrants: (...a: unknown[]) => grants(...a), grant: (...a: unknown[]) => grant(...a),
    revoke: (...a: unknown[]) => revoke(...a), dutyChange: (...a: unknown[]) => duty(...a),
  },
}));
const clients: QueryClient[] = [];
const capability = (manage = false, allowed = true) => ({
  canManage: manage, scope: { clientId: 'c1', caseId: null }, caseScopes: [{ caseId: 'case1', label: 'Synthetic file' }],
  operations: Object.fromEntries(['LIST', 'READ', 'CREATE'].map(op => [op, { allowed, validUntil: allowed ? new Date(Date.now() + 60_000).toISOString() : null }])),
});
function mount(clientId = 'c1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(qc);
  const view = render(<QueryClientProvider client={qc}><SpecialCategorySection clientId={clientId} /></QueryClientProvider>);
  return { ...view, qc, changeClient: (id: string) => view.rerender(<QueryClientProvider client={qc}><SpecialCategorySection clientId={id} /></QueryClientProvider>) };
}
beforeEach(() => {
  for (const fn of [caps, list, read, candidates, grants, grant, revoke, duty]) fn.mockReset();
  caps.mockImplementation(async () => capability());
  list.mockResolvedValue([{ id: 'r1', category: 'HEALTH', createdAt: new Date().toISOString() }]);
  read.mockImplementation(async () => ({ id: 'r1', clientId: 'c1', category: 'HEALTH', content: 'synthetic private content', accessExpiresAt: new Date(Date.now() + 60_000).toISOString() }));
  candidates.mockResolvedValue({ users: [{ id: 'u2', label: 'Synthetic Reader' }], cases: [{ id: 'case1', label: 'Synthetic file' }], truncated: false });
  grants.mockResolvedValue([]); grant.mockResolvedValue({ id: 'g1' }); revoke.mockResolvedValue({ revoked: true }); duty.mockResolvedValue({ revokedGrantCount: 2 });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(qc => qc.clear()); vi.useRealTimers(); });

describe('K7.3 narrow special-category interface', () => {
  it('denied timed access is explicit, not an empty list or success', async () => {
    caps.mockResolvedValue(capability(false, false)); mount();
    expect((await screen.findByRole('alert')).textContent).toContain('geçerli süreli listeleme yetkisi yok');
    expect(list).not.toHaveBeenCalled(); expect(screen.queryByText(/kaydı bulunmuyor/)).toBeNull();
  });
  it('scope selection is sent to both existing consumers without granting other actions', async () => {
    mount(); await screen.findByText('HEALTH');
    fireEvent.change(screen.getByLabelText('Özel veri erişim kapsamı'), { target: { value: 'case1' } });
    await waitFor(() => expect(list).toHaveBeenCalledWith('c1', 'case1'));
    fireEvent.click(await screen.findByRole('button', { name: 'İçeriği aç' }));
    await waitFor(() => expect(read).toHaveBeenCalledWith('r1', 'case1'));
    expect(await screen.findByText('synthetic private content')).toBeTruthy();
  });
  it('a READ denial disables opening even if LIST is granted', async () => {
    const state = capability(); state.operations.READ = { allowed: false, validUntil: null };
    caps.mockResolvedValue(state); mount();
    const button = await screen.findByRole('button', { name: 'İçeriği aç' });
    expect((button as HTMLButtonElement).disabled).toBe(true); expect(read).not.toHaveBeenCalled();
  });
  it('a late response from a previous client is discarded', async () => {
    let release!: (value: unknown) => void;
    read.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const view = mount(); fireEvent.click(await screen.findByRole('button', { name: 'İçeriği aç' }));
    await waitFor(() => expect(read).toHaveBeenCalled());
    view.changeClient('c2'); await screen.findByText('HEALTH');
    await act(async () => release({ id: 'r1', clientId: 'c1', category: 'HEALTH', content: 'previous private content', accessExpiresAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(screen.queryByText('previous private content')).toBeNull();
  });
  it('refresh rejection removes previously opened content and exposes the error', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'İçeriği aç' }));
    await screen.findByText('synthetic private content');
    caps.mockRejectedValue({ response: { status: 403, data: { message: 'Synthetic revoked access' } } });
    fireEvent.click(screen.getByRole('button', { name: 'İzin durumunu yenile' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Synthetic revoked access');
    expect(screen.queryByText('synthetic private content')).toBeNull();
  });
  it('expiry clears plaintext using a controlled clock', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    read.mockResolvedValue({ id: 'r1', clientId: 'c1', category: 'HEALTH', content: 'timed private content', accessExpiresAt: '2026-11-10T10:00:02Z' });
    const view = mount();
    for (let n = 0; n < 5; n++) await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    fireEvent.click(screen.getByRole('button', { name: 'İçeriği aç' }));
    for (let n = 0; n < 5; n++) await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByText('timed private content')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.queryByText('timed private content')).toBeNull();
    expect(view.qc.getMutationCache().getAll().every(m => m.state.data === undefined)).toBe(true);
  });
  it('management alone never renders protected data and requires explicit finite dates', async () => {
    caps.mockResolvedValue(capability(true, false)); mount();
    await screen.findByRole('option', { name: 'Synthetic Reader' });
    expect(list).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Özel veri kullanıcısı'), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Yetki gerekçesi'), { target: { value: 'Synthetic purpose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Süreli yetki ver' }));
    await screen.findByText('Açık başlangıç ve sonlu bitiş seçin.');
    expect(grant).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Yetki başlangıcı'), { target: { value: '2026-11-10T10:00' } });
    fireEvent.change(screen.getByLabelText('Yetki bitişi'), { target: { value: '2026-11-11T10:00' } });
    fireEvent.change(screen.getByLabelText('Özel veri işlemi'), { target: { value: 'READ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Süreli yetki ver' }));
    await waitFor(() => expect(grant).toHaveBeenCalledWith({ clientId: 'c1', subjectUserId: 'u2', operation: 'READ',
      validFrom: new Date('2026-11-10T10:00').toISOString(), validUntil: new Date('2026-11-11T10:00').toISOString(), reason: 'Synthetic purpose' }));
  });
  it('grant rejection is not presented as success', async () => {
    caps.mockResolvedValue(capability(true, false)); grant.mockRejectedValue(new Error('Synthetic stale grant target')); mount();
    await screen.findByRole('option', { name: 'Synthetic Reader' });
    fireEvent.change(screen.getByLabelText('Özel veri kullanıcısı'), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Yetki başlangıcı'), { target: { value: '2026-11-10T10:00' } });
    fireEvent.change(screen.getByLabelText('Yetki bitişi'), { target: { value: '2026-11-11T10:00' } });
    fireEvent.change(screen.getByLabelText('Yetki gerekçesi'), { target: { value: 'Synthetic purpose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Süreli yetki ver' }));
    await screen.findByText('Synthetic stale grant target');
    expect(screen.queryByText('Yetki işlemi tamamlandı.')).toBeNull();
  });
  it('duty change explicitly closes the selected subject and requires a reason', async () => {
    caps.mockResolvedValue(capability(true, false)); mount();
    await screen.findByRole('option', { name: 'Synthetic Reader' });
    fireEvent.change(screen.getByLabelText('Özel veri kullanıcısı'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /görev değişikliği/ }));
    await screen.findByText('Gerekçe zorunludur.'); expect(duty).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Yetki gerekçesi'), { target: { value: 'Duty changed' } });
    fireEvent.click(screen.getByRole('button', { name: /görev değişikliği/ }));
    await waitFor(() => expect(duty).toHaveBeenCalledWith('u2', 'Duty changed'));
  });
});
