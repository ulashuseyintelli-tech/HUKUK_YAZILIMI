import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientCariView } from '@/components/client-accounting/ClientCariView';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { clientOffsetApi } from '@/lib/api/client-offset';

vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/api/client-accounting', async (original) => {
  const actual = await original<typeof import('@/lib/api/client-accounting')>();
  return { ...actual, clientAccountingApi: { ...actual.clientAccountingApi, getClientSummary: vi.fn() } };
});
vi.mock('@/lib/api/client-offset', async (original) => {
  const actual = await original<typeof import('@/lib/api/client-offset')>();
  return { ...actual, clientOffsetApi: { ...actual.clientOffsetApi, getEligibility: vi.fn() } };
});
vi.mock('@/components/client-accounting/ClientMovementsTable', () => ({ ClientMovementsTable: () => null }));
vi.mock('@/components/client-accounting/ClientLevelStatementSection', () => ({ ClientLevelStatementSection: () => null }));
vi.mock('@/components/client-accounting/OffsetDrawer', () => ({ OffsetDrawer: () => null }));

const money = (amount: string) => formatMoneyString(amount, 'TRY');
const summary = (unpaid: string | undefined = '470') => ({
  clientId: 'c1', currency: 'TRY', needsReview: false,
  clientScoped: { payableNet: '900', paidToClient: '0', expenseRequested: '1000', expensePaid: '200', expenseUnpaid: unpaid ?? '470', offsetApplied: '250', offsettableNetPosition: '430' },
  caseScopedContext: { debtorCollection: '0', pendingDistribution: '0', advanceBalance: '0' },
  caseBreakdown: [{ caseId: 'case-1', caseNumber: 'CASE-A', executionFileNumber: null, role: 'ALACAKLI', payableNet: '900', paidToClient: '0', expenseRequested: '1000', expensePaid: '200', expenseUnpaid: unpaid, debtorCollection: '0', pendingDistribution: '0', advanceBalance: '0', needsReview: false }],
});
let unexpectedFetch: ReturnType<typeof vi.fn>;
let unexpectedXhr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(clientAccountingApi.getClientSummary).mockResolvedValue(summary() as any);
  vi.mocked(clientOffsetApi.getEligibility).mockResolvedValue(null as any);
  unexpectedFetch = vi.fn(() => { throw new Error('CL-R12 forbids real fetch'); });
  vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-R12 forbids real XHR'); });
});
afterEach(() => {
  cleanup(); expect(unexpectedFetch).not.toHaveBeenCalled(); expect(unexpectedXhr).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function show(clientId = 'c1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ClientCariView clientId={clientId} currency="TRY" /></QueryClientProvider>);
}
async function unpaidCell() { return within((await screen.findByText('CASE-A')).closest('tr')!).getAllByRole('cell')[6]; }

describe('CL-R12 — Genel Cari and per-case remaining use the server projection', () => {
  it('renders server 470 in both surfaces instead of deriving 1000 minus 200 as 800', async () => {
    show(); expect(await unpaidCell()).toHaveTextContent(money('470'));
    expect(screen.getAllByText(money('470'))).toHaveLength(2);
    expect(screen.queryByText(money('800'))).toBeNull();
  });
  it.each(['0', '-10', '66.66'])('preserves the server value %s without clamping or recomputing', async (remaining) => {
    vi.mocked(clientAccountingApi.getClientSummary).mockResolvedValue(summary(remaining) as any);
    show(); expect(await unpaidCell()).toHaveTextContent(money(remaining));
  });
  it('does not fall back to requested minus paid for an older response without the new field', async () => {
    const old = summary(); delete (old.caseBreakdown[0] as any).expenseUnpaid;
    vi.mocked(clientAccountingApi.getClientSummary).mockResolvedValue(old as any);
    show(); expect(await unpaidCell()).toHaveTextContent('—');
    expect(await unpaidCell()).toHaveAttribute('title', 'Ödenmemiş masraf doğrulanamadı.');
    expect(screen.queryByText(money('800'))).toBeNull();
  });
  it('does not retain the previous client data when the next client summary is rejected', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const node = (clientId: string) => <QueryClientProvider client={queryClient}><ClientCariView clientId={clientId} currency="TRY" /></QueryClientProvider>;
    const view = render(node('c1')); await unpaidCell();
    vi.mocked(clientAccountingApi.getClientSummary).mockRejectedValue(new Error('403'));
    view.rerender(node('c2'));
    expect(await screen.findByText('Genel cari yüklenemedi.')).toBeInTheDocument();
    expect(screen.queryByText('CASE-A')).toBeNull();
    await waitFor(() => expect(clientAccountingApi.getClientSummary).toHaveBeenCalledWith('c2', 'TRY'));
  });
});
