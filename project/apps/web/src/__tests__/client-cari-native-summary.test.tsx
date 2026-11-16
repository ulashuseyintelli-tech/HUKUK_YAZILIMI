import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientCariNativeSummary } from '@/components/client-accounting/ClientCariNativeSummary';
import { ClientCariView } from '@/components/client-accounting/ClientCariView';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { clientOffsetApi } from '@/lib/api/client-offset';

vi.mock('@/components/client-accounting/ClientMovementsTable', () => ({ ClientMovementsTable: (p: any) => <p>Movements: {p.currency}</p> }));
vi.mock('@/components/client-accounting/ClientLevelStatementSection', () => ({ ClientLevelStatementSection: (p: any) => <p>Documents: {p.currency}</p> }));
vi.mock('@/components/client-accounting/OffsetDrawer', () => ({ OffsetDrawer: (p: any) => <p>Offset: {p.currency}</p> }));
function group(currency: string, amount: string) {
  return { clientId: 'c1', currency, clientScoped: { payableNet: amount, paidToClient: '0', expenseRequested: '200',
    expensePaid: '20', expenseUnpaid: '120', offsetApplied: '10', offsettableNetPosition: '470' },
  caseScopedContext: { debtorCollection: '675', pendingDistribution: '-5', allocationHeld: '2', pendingDistributionExcludingHeld: '-7', advanceBalance: '0' },
  needsReview: true, caseBreakdown: [{ caseId: currency, caseNumber: `CASE-${currency}`, executionFileNumber: null, role: 'ALACAKLI',
    currency, payableNet: amount, paidToClient: '0', expenseRequested: '200', expensePaid: '20', expenseUnpaid: '120',
    offsetPayableApplied: '10', offsetExpenseApplied: '10', debtorCollection: '675', pendingDistribution: '-5',
    allocationHeld: '2', pendingDistributionExcludingHeld: '-7', advanceBalance: '0', needsReview: true }] };
}
const payload = () => ({ clientId: 'c1', asOf: '2026-11-16T10:00:00Z', source: 'LEGACY_PROJECTION' as const,
  primarySwitchUnchanged: true as const, groups: [group('TRY', '5000'), group('USD', '100')] });
beforeEach(() => {
  vi.spyOn(clientAccountingApi, 'getClientSummaryByCurrency').mockResolvedValue(payload());
  vi.spyOn(clientAccountingApi, 'getClientSummary').mockResolvedValue({ ...group('TRY', '5000'), caseBreakdown: [] } as any);
  vi.spyOn(clientOffsetApi, 'getEligibility').mockResolvedValue(null as any);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function show(node = <ClientCariNativeSummary clientId="c1" />) {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={q}>{node}</QueryClientProvider>);
}
describe('G2 native-currency read-only cards', () => {
  it('selects a separate currency and its own case rows without adding a common total', async () => {
    show(); const selector = await screen.findByRole('combobox', { name: 'Genel cari para birimi' });
    expect(screen.getByText('CASE-TRY')).toBeInTheDocument();
    expect(screen.getAllByText(formatMoneyString('5000', 'TRY'))).toHaveLength(2);
    fireEvent.change(selector, { target: { value: 'USD' } });
    expect(screen.getByText('CASE-USD')).toBeInTheDocument(); expect(screen.queryByText('CASE-TRY')).toBeNull();
    expect(screen.getAllByText(formatMoneyString('100', 'USD'))).toHaveLength(2);
    expect(screen.queryByText(formatMoneyString('5100', 'TRY'))).toBeNull();
  });
  it('shows server remaining, negative review and HELD separately, without frontend recomputation', async () => {
    show(); const row = (await screen.findByText('CASE-TRY')).closest('tr')!;
    expect(within(row).getAllByRole('cell')[7]).toHaveTextContent(formatMoneyString('120', 'TRY'));
    expect(screen.queryByText(formatMoneyString('180', 'TRY'))).toBeNull();
    expect(screen.getByText(/Mahsubu bekleyen/)).toHaveTextContent(formatMoneyString('2', 'TRY'));
    expect(screen.getByText(/Kontrol gerekli: negatif/)).toBeInTheDocument();
    expect(screen.getByText(/Bu tutarlar dosya genelidir/)).toBeInTheDocument();
  });
  it('distinguishes no records from an actual zero group', async () => {
    vi.mocked(clientAccountingApi.getClientSummaryByCurrency).mockResolvedValueOnce({ ...payload(), groups: [] });
    show(); expect(await screen.findByText(/doğrulanmış mali kayıt yok/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it.each([403, 409])('shows a denied/unavailable %s as an error, not an empty/zero summary', async status => {
    vi.mocked(clientAccountingApi.getClientSummaryByCurrency).mockRejectedValue({ status }); show();
    expect(await screen.findByRole('alert')).toHaveTextContent(/hesaplanamadı veya erişim/);
    expect(screen.queryByText(/doğrulanmış mali kayıt yok/)).toBeNull(); expect(screen.queryByRole('table')).toBeNull();
  });
  it('does not retain the old client rows while the next client request is rejected', async () => {
    const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={q}><ClientCariNativeSummary clientId="c1" /></QueryClientProvider>);
    await screen.findByText('CASE-TRY'); vi.mocked(clientAccountingApi.getClientSummaryByCurrency).mockRejectedValue(new Error('denied'));
    view.rerender(<QueryClientProvider client={q}><ClientCariNativeSummary clientId="c2" /></QueryClientProvider>);
    expect(screen.queryByText('CASE-TRY')).toBeNull(); await screen.findByRole('alert');
  });
  it('does not feed the selected card currency to existing operations, movements or E1/E2 documents', async () => {
    show(<ClientCariView clientId="c1" currency="TRY" nativeSummary />);
    const selector = await screen.findByRole('combobox', { name: 'Genel cari para birimi' });
    fireEvent.change(selector, { target: { value: 'USD' } });
    expect(screen.getByText('Movements: TRY')).toBeInTheDocument();
    expect(screen.getByText('Documents: TRY')).toBeInTheDocument();
    expect(screen.getByText('Offset: TRY')).toBeInTheDocument();
    await waitFor(() => expect(clientAccountingApi.getClientSummary).toHaveBeenCalledWith('c1', 'TRY'));
    expect(clientAccountingApi.getClientSummary).not.toHaveBeenCalledWith('c1', 'USD');
  });
});
