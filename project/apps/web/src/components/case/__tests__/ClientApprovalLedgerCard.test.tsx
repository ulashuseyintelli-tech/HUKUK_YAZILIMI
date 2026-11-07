import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientApprovalLedgerCard } from '../ClientApprovalLedgerCard';
import { clientApprovalApi, type ClientApprovalRecord, type ClientApprovalDetail } from '@/lib/api/client-approval';

const auth = vi.hoisted(() => ({ user: { id: 'actor', tenantId: 'tenant', role: 'USER' } as { id: string; tenantId: string; role: string } | null, loading: false }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api/client-approval', () => ({ clientApprovalApi: { list: vi.fn(), detail: vi.fn() } }));
const list = vi.mocked(clientApprovalApi.list), detail = vi.mocked(clientApprovalApi.detail);
const row = (caseId = 'case'): ClientApprovalRecord => ({ id: 'record', caseId, clientId: 'client', subjectType: 'OPERATION', subjectLabel: null, title: 'Internal record', description: '<img src=x onerror=alert(1)>', status: 'APPROVED', channel: 'PORTAL', requestedById: 'old-staff', decision: null, decisionNote: null,
  createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z', sentAt: null, decidedAt: null, expiresAt: null });
const full = (): ClientApprovalDetail => ({ ...row(), events: [{ id: 'event', eventType: 'APPROVED', fromStatus: 'SENT', toStatus: 'APPROVED', byUserId: null, note: '<b>plain note</b>', createdAt: '2026-01-02T10:00:00Z' }] });
let queryClient: QueryClient;
const view = (caseId = 'case') => <QueryClientProvider client={queryClient}><ClientApprovalLedgerCard caseId={caseId} clients={[{ id: 'client', name: 'Canonical Client' }]} /></QueryClientProvider>;
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Müvekkil onay defteri' }));
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: 'actor', tenantId: 'tenant', role: 'USER' }; auth.loading = false;
  list.mockReset().mockResolvedValue([row()]); detail.mockReset().mockResolvedValue(full());
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('6a read-only staff approval ledger', () => {
  it('does not read until explicitly expanded', () => {
    render(view()); expect(list).not.toHaveBeenCalled(); expect(detail).not.toHaveBeenCalled();
  });
  it('shows canonical client, internal attribution, explicit PORTAL limitation and escaped notes', async () => {
    const { container } = render(view()); open();
    fireEvent.click(await screen.findByRole('button', { name: 'Internal record — Onay kaydı' }));
    const section = await screen.findByRole('region', { name: 'Onay kaydı ayrıntısı' });
    await within(section).findByText('Talebi kaydeden: İç hesap referansı: old-staff');
    expect(screen.getByText('Canonical Client')).toBeInTheDocument();
    expect(screen.getByText(/PORTAL kanal etiketi, doğrulanmış müvekkil kimliği/)).toBeInTheDocument();
    expect(within(section).getByText('Karar alanı: Kayıt yok')).toBeInTheDocument();
    expect(within(section).getByText(/İşleyen hesap bilgisi yok/)).toBeInTheDocument();
    expect(within(section).getByText('<b>plain note</b>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull(); expect(container.querySelector('b')).toBeNull();
    expect(screen.queryByRole('button', { name: /Gönder|Karar ver|Onayla|Reddet|İptal et/ })).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('case', 'tenant'); expect(detail).toHaveBeenCalledWith(row(), 'tenant');
  });
  it('distinguishes a legitimate empty list', async () => {
    list.mockResolvedValue([]); render(view()); open();
    expect(await screen.findByText('Bu dosyada görüntülenebilen onay kaydı bulunmuyor.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('shows refusal, not empty success, and removes previously loaded details on refetch denial', async () => {
    render(view()); open(); fireEvent.click(await screen.findByRole('button', { name: 'Internal record — Onay kaydı' }));
    await screen.findByText('Talebi kaydeden: İç hesap referansı: old-staff');
    list.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['client-approval-ledger'] }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Onay defteri okunamadı');
    expect(screen.queryByText(/old-staff/)).toBeNull(); expect(screen.queryByText(/görüntülenebilen onay kaydı bulunmuyor/)).toBeNull();
  });
  it('does not retain previous actor data when the session changes', async () => {
    const { rerender } = render(view()); open(); await screen.findByRole('button', { name: 'Internal record — Onay kaydı' });
    auth.user = { id: 'other-actor', tenantId: 'other-tenant', role: 'ADMIN' }; list.mockRejectedValue(new Error('Not found'));
    rerender(view()); expect(screen.queryByText('Canonical Client')).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('Onay defteri okunamadı');
    expect(list).toHaveBeenLastCalledWith('case', 'other-tenant');
  });
  it('discards a late response for the previous case', async () => {
    let resolveOld!: (value: ClientApprovalRecord[]) => void;
    list.mockImplementation(caseId => caseId === 'case' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([]));
    const { rerender } = render(view()); open(); await waitFor(() => expect(list).toHaveBeenCalled());
    rerender(view('next-case')); await screen.findByText(/görüntülenebilen onay kaydı bulunmuyor/);
    await act(async () => { resolveOld([row()]); });
    expect(screen.queryByText('Canonical Client')).toBeNull(); expect(detail).not.toHaveBeenCalled();
  });
  it('shows detail refusal without treating stale detail as current', async () => {
    detail.mockRejectedValue(new Error('Parent mismatch')); render(view()); open();
    fireEvent.click(await screen.findByRole('button', { name: 'Internal record — Onay kaydı' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kayıt ayrıntısı okunamadı');
    expect(screen.queryByText(/old-staff/)).toBeNull();
  });
  it('does not attempt an unauthenticated read', async () => {
    auth.user = null; render(view()); open();
    expect(screen.getByRole('alert')).toHaveTextContent('geçerli personel oturumu'); expect(list).not.toHaveBeenCalled();
  });
});
