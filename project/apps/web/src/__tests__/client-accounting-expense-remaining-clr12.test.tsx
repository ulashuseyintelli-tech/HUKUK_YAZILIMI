import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClientAccountingPage from '@/app/(dashboard)/clients/[clientId]/accounting/page';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { apiClient } from '@/lib/api/client';

const nav = vi.hoisted(() => ({ clientId: 'c1', caseId: 'case-1' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ clientId: nav.clientId }), useSearchParams: () => new URLSearchParams({ caseId: nav.caseId }), usePathname: () => '/clients/c1/accounting', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/api/client-accounting', async (original) => {
  const actual = await original<typeof import('@/lib/api/client-accounting')>();
  return { ...actual, clientAccountingApi: { ...actual.clientAccountingApi, getCases: vi.fn(), getOutstanding: vi.fn(), getExpenseSummary: vi.fn(), getCaseBalance: vi.fn(), getDebtorCollectionTotal: vi.fn(), listPayouts: vi.fn(), getClientSummary: vi.fn() } };
});
vi.mock('@/components/client-accounting/PayoutCreateModal', () => ({ PayoutCreateModal: () => null }));
vi.mock('@/components/client-accounting/PendingPayoutRequests', () => ({ PendingPayoutRequests: () => null }));
vi.mock('@/components/client-accounting/StatementSection', () => ({ StatementSection: () => null }));
vi.mock('@/components/client-accounting/ClientCariView', () => ({ ClientCariView: () => null }));
vi.mock('@/components/client-accounting/AccountingTable', () => ({ AccountingTable: () => null }));
vi.mock('@/components/client-accounting/FinancialStatementPanel', () => ({ FinancialStatementPanel: () => null }));

const summary = () => ({ totalRequested: 1000, totalPaid: 200, totalPending: 800, requestCount: 1, paidCount: 0, pendingCount: 1, blockingUnpaid: 800, expenseUnpaid: '470', expenseUnpaidCurrency: 'TRY' });
let unexpectedFetch: ReturnType<typeof vi.fn>;
let unexpectedXhr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks(); nav.clientId = 'c1'; nav.caseId = 'case-1';
  vi.mocked(clientAccountingApi.getCases).mockResolvedValue(['case-1', 'case-2'].map(caseId => ({ caseId, caseClientId: caseId + '-cc', role: 'ALACAKLI', caseNumber: caseId, executionFileNumber: null, currency: 'USD', caseOpenedAt: null })));
  vi.mocked(clientAccountingApi.getOutstanding).mockResolvedValue({ currency: 'USD', outstanding: '300' } as any);
  vi.mocked(clientAccountingApi.getExpenseSummary).mockResolvedValue(summary());
  vi.mocked(clientAccountingApi.getCaseBalance).mockResolvedValue({ exists: false } as any);
  vi.mocked(clientAccountingApi.getDebtorCollectionTotal).mockResolvedValue(0);
  vi.mocked(clientAccountingApi.listPayouts).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  unexpectedFetch = vi.fn(() => { throw new Error('CL-R12 forbids real fetch'); }); vi.stubGlobal('fetch', unexpectedFetch);
  unexpectedXhr = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-R12 forbids real XHR'); });
});
afterEach(() => { cleanup(); expect(unexpectedFetch).not.toHaveBeenCalled(); expect(unexpectedXhr).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const node = () => <QueryClientProvider client={queryClient}><ClientAccountingPage /></QueryClientProvider>;
  return { ...render(node()), node };
}

describe('CL-R12 — selected-case expense card remains case-scoped', () => {
  it('uses the explicit TRY remaining read, not legacy 800 or the USD case currency', async () => {
    show(); expect(await screen.findByText(`Ödenmemiş: ${formatMoneyString('470', 'TRY')}`)).toBeInTheDocument();
    expect(clientAccountingApi.getExpenseSummary).toHaveBeenCalledWith('case-1', 'c1', 'TRY');
    expect(clientAccountingApi.getClientSummary).not.toHaveBeenCalled();
    expect(screen.queryByText(`Ödenmemiş: ${formatMoneyString('800', 'TRY')}`)).toBeNull();
    expect(screen.getByText(formatMoneyString('1000', 'TRY'))).toBeInTheDocument();
    expect(screen.getByText(formatMoneyString('200', 'TRY'))).toBeInTheDocument();
  });
  it.each(['0', '-10', '66.66'])('preserves exact server remaining %s', async (amount) => {
    vi.mocked(clientAccountingApi.getExpenseSummary).mockResolvedValue({ ...summary(), expenseUnpaid: amount });
    show(); expect(await screen.findByText(`Ödenmemiş: ${formatMoneyString(amount, 'TRY')}`)).toBeInTheDocument();
  });
  it.each(['missing', 'wrong currency'])('shows an explicit unknown result for %s instead of a legacy fallback', async (kind) => {
    const data = summary(); if (kind === 'missing') delete (data as any).expenseUnpaid; else data.expenseUnpaidCurrency = 'USD';
    vi.mocked(clientAccountingApi.getExpenseSummary).mockResolvedValue(data);
    show(); expect(await screen.findByText('Ödenmemiş: doğrulanamadı.')).toBeInTheDocument();
    expect(screen.queryByText(`Ödenmemiş: ${formatMoneyString('800', 'TRY')}`)).toBeNull();
  });
  it('discards previous case remaining when the next case request is rejected', async () => {
    const view = show(); await screen.findByText(`Ödenmemiş: ${formatMoneyString('470', 'TRY')}`);
    vi.mocked(clientAccountingApi.getExpenseSummary).mockRejectedValue(new Error('403')); nav.caseId = 'case-2';
    view.rerender(view.node()); await screen.findAllByText('Yüklenemedi.');
    expect(screen.queryByText(`Ödenmemiş: ${formatMoneyString('470', 'TRY')}`)).toBeNull();
    await waitFor(() => expect(clientAccountingApi.getExpenseSummary).toHaveBeenCalledWith('case-2', 'c1', 'TRY'));
    expect(clientAccountingApi.getClientSummary).not.toHaveBeenCalled();
  });
  it('adds the remaining query only when requested; the original client helper call stays legacy', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/client-accounting')>('@/lib/api/client-accounting');
    vi.mocked(apiClient.get).mockResolvedValue({ data: summary() });
    await actual.clientAccountingApi.getExpenseSummary('case-1', 'c1');
    expect(apiClient.get).toHaveBeenLastCalledWith('/expense-requests/case/case-1/summary?clientId=c1');
    await actual.clientAccountingApi.getExpenseSummary('case-1', 'c1', 'TRY');
    expect(apiClient.get).toHaveBeenLastCalledWith('/expense-requests/case/case-1/summary?clientId=c1&remainingCurrency=TRY');
  });
});
