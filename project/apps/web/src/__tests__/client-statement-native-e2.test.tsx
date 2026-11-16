import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeClientStatementSection } from '@/components/client-accounting/NativeClientStatementSection';
import { ClientLevelStatementSection } from '@/components/client-accounting/ClientLevelStatementSection';
import { nativeStatementApi, type NativeStatementSet } from '@/lib/api/client-statement-native';
import { clientStatementApi } from '@/lib/api/client-statement';

vi.mock('@/lib/api/client-statement-native', () => ({ nativeStatementApi: { list: vi.fn(), create: vi.fn(), supersede: vi.fn(), void: vi.fn(), retry: vi.fn(), pdf: vi.fn() } }));
vi.mock('@/lib/api/client-statement', async original => ({ ...await original<typeof import('@/lib/api/client-statement')>(),
  clientStatementApi: { listByClient: vi.fn(), get: vi.fn(), createClientLevel: vi.fn() } }));
const fixture: NativeStatementSet = { id: 'set1', clientId: 'client1', status: 'ACTIVE', memberCount: 2, memberHash: 'test',
  periodStart: '2026-09-30T21:00:00.000Z', periodEnd: '2026-10-31T20:59:59.999Z', sourceCutAt: '2026-11-01T01:00:00Z',
  documents: ['TRY', 'USD'].map(currency => ({ id: currency, currency, renderHash: 'test', render: { currency, openingBalance: currency === 'TRY' ? '5000' : '100', closingBalance: currency === 'TRY' ? '5000' : '100',
    lines: [{ lineDate: '2026-10-10T10:00:00Z', label: 'Faiz', note: 'Bilgi', debit: '0', credit: '0', runningBalance: currency === 'TRY' ? '5000' : '100', isInformational: true, informationalAmount: '8', fileReference: { value: '2026/1' } }] } })) };
const api = vi.mocked(nativeStatementApi);
function mount(clientId = 'client1') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={cache}><NativeClientStatementSection key={clientId} clientId={clientId} /></QueryClientProvider>), cache };
}
beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue([]); api.create.mockResolvedValue(fixture); vi.mocked(clientStatementApi.listByClient).mockResolvedValue([]); });

describe('E2 set UI and canonical client context', () => {
  it('a source cut before period end is explicit and cannot imply monthly readiness', async () => {
    api.list.mockResolvedValue([{ ...fixture, sourceCutAt: '2026-10-15T10:00:00Z' }]); mount();
    await screen.findByText(/Aylık teslim için dönem kapandıktan sonra seti yenileyin/); expect(api.retry).not.toHaveBeenCalled();
  });
  it('the existing statement screen exposes E2 explicitly without replacing or auto-loading legacy/E2 data', async () => {
    const cache = new QueryClient();
    render(<QueryClientProvider client={cache}><ClientLevelStatementSection clientId="client1" currency="TRY" cases={[]} /></QueryClientProvider>);
    await screen.findByText(/Henüz genel ekstre yok/); expect(api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Para birimi başına ekstreler' }));
    await screen.findByRole('heading', { name: 'Para birimi başına ekstre setleri' }); expect(api.list).toHaveBeenCalledWith('client1');
    expect(clientStatementApi.createClientLevel).not.toHaveBeenCalled();
  });
  it('shows two native currencies with no converted common total and marks accrued interest as noncash', async () => {
    api.list.mockResolvedValue([fixture]); mount(); await screen.findByText(/2 belge/);
    expect(screen.getByText('TRY', { selector: 'strong' })).toBeInTheDocument(); expect(screen.getByText('USD', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/5[.,]100/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Satırları göster / gizle' }));
    const usd = screen.getByRole('table', { name: 'USD ekstre satırları' });
    expect(within(usd).getByText(/bakiyeye dahil değil/)).toBeInTheDocument(); expect(usd.textContent).not.toContain('₺');
  });
  it('month generation uses the same Turkey calendar boundaries and never triggers send/retry', async () => {
    mount(); await screen.findByText('Henüz belge seti yok.');
    fireEvent.change(screen.getByLabelText('Ekstre ayı'), { target: { value: '2026-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Belge seti oluştur' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('client1', { periodStart: fixture.periodStart, periodEnd: fixture.periodEnd }));
    expect(api.retry).not.toHaveBeenCalled();
  });
  it.each([403, 409, 500])('generation %s cannot be presented as success or an empty accepted result', async status => {
    api.create.mockRejectedValue(Object.assign(new Error('server'), { status })); mount(); await screen.findByText('Henüz belge seti yok.');
    fireEvent.click(screen.getByRole('button', { name: 'Belge seti oluştur' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(status === 403 ? 'erişilemiyor' : 'tamamlanamadı'));
    expect(screen.queryByText('Para birimi başına belge seti oluşturuldu. Gönderim başlatılmadı.')).not.toBeInTheDocument();
  });
  it('a committed financial set with PDF failure is explicit and never claims sent or rolled back', async () => {
    api.create.mockResolvedValue({ ...fixture, artifactOutcome: 'FAILED' }); mount(); await screen.findByText('Henüz belge seti yok.');
    fireEvent.click(screen.getByRole('button', { name: 'Belge seti oluştur' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Belge seti kaydedildi; PDF seti hazır değil. Gönderim yapılmadı.'));
  });
  it('read denial is a visible error, not an empty list', async () => {
    api.list.mockRejectedValue(Object.assign(new Error('denied'), { status: 403 })); mount();
    await screen.findByRole('alert'); expect(screen.queryByText('Henüz belge seti yok.')).not.toBeInTheDocument();
  });
  it('client changes clear old financial data and a delayed old PDF cannot download in the new context', async () => {
    api.list.mockImplementation(async id => id === 'client1' ? [fixture] : []);
    let release!: (value: Blob) => void; api.pdf.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const old = mount(); await screen.findByText(/2 belge/);
    fireEvent.click(screen.getByRole('button', { name: 'USD PDF' })); await waitFor(() => expect(api.pdf).toHaveBeenCalledTimes(1));
    old.rerender(<QueryClientProvider client={old.cache}><NativeClientStatementSection key="client2" clientId="client2" /></QueryClientProvider>);
    await screen.findByText('Henüz belge seti yok.'); expect(screen.queryByRole('button', { name: 'USD PDF' })).not.toBeInTheDocument();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await act(async () => release(new Blob(['%PDF-test'], { type: 'application/pdf' }))); expect(click).not.toHaveBeenCalled(); click.mockRestore();
  });
  it.each([false, true])('disabled/unresolved monthly recovery (enabled=%s) cannot claim delivery success', async enabled => {
    api.list.mockResolvedValue([{ ...fixture, artifactOutcome: 'COMPLETE', deliveries: [{ status: 'FAILED', attempts: 1, nextRetryAt: null, sentAt: null }] }]);
    api.retry.mockResolvedValue({ enabled, target: enabled ? { outcome: 'RECONCILIATION_REQUIRED' } : null });
    mount(); await screen.findByText(/Aylık teslim: Başarısız/);
    fireEvent.click(screen.getByRole('button', { name: 'Kayıtlı aylık teslimi uzlaştır / tekrar dene' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('İşlem tamamlanamadı.'));
    expect(screen.queryByText('Aylık teslimin kayıtlı sonucu doğrulandı.')).not.toBeInTheDocument();
  });
});
