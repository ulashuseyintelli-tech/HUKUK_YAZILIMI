import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseFinanceCard, displayFinanceMoney } from '../CaseFinanceCard';
import { ExpensePaymentAction } from '../ExpensePaymentAction';
import { api } from '@/lib/api';
import { clientAccountingApi } from '@/lib/api/client-accounting';
const identity = vi.hoisted(() => ({ user: { id: 'actor', tenantId: 'tenant', role: 'ADMIN' }, tenant: { id: 'tenant' } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => identity }));
vi.mock('@/lib/api', () => ({ api: { getActualExpenseSummary: vi.fn(), getExpenseRequest: vi.fn(), recordExpensePayment: vi.fn() } }));
vi.mock('@/lib/api/client-accounting', () => ({ clientAccountingApi: { getOutstanding: vi.fn() } }));
vi.mock('@/lib/idempotency-key', () => ({ createIdempotencyKey: vi.fn(() => 'stable-synthetic-key') }));
const context = { caseId: 'case-a', clients: [{ id: 'cc-a', name: 'Client A' }], currencies: ['TRY'], sourceStatus: 'READY' as const };
const summary = (caseId = 'case-a') => ({ caseId, basis: 'TYPED_EXPENSE_ACTUAL' as const, scope: 'CASE' as const, exists: true, totals: [{ currency: 'TRY', amount: '350.00', count: 1 }] });
beforeEach(() => {
  identity.user = { id: 'actor', tenantId: 'tenant', role: 'ADMIN' }; identity.tenant = { id: 'tenant' };
  vi.mocked(api.getActualExpenseSummary).mockResolvedValue(summary());
  vi.mocked(clientAccountingApi.getOutstanding).mockImplementation(async (caseId, caseClientId, currency) => ({ caseId, caseClientId, currency: currency!, outstanding: '600.00' }));
  vi.mocked(api.getExpenseRequest).mockResolvedValue({ id: 'expense', caseId: 'case-a', currency: 'TRY' });
  vi.mocked(api.recordExpensePayment).mockResolvedValue({ id: 'expense', caseId: 'case-a', currency: 'TRY', status: 'PARTIAL' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('M3b/Y3 exact server projections', () => {
  it('shows independent server money without netting', async () => {
    render(<><CaseFinanceCard kind="actual" context={context} /><CaseFinanceCard kind="payable" context={context} /></>);
    await screen.findByText('350,00 TRY'); await screen.findByText('Client A: 600,00 TRY');
    expect(clientAccountingApi.getOutstanding).toHaveBeenCalledWith('case-a', 'cc-a', 'TRY');
    expect(screen.queryByText(/1.150|1.250|850,00/)).toBeNull();
  });
  it('preserves explicit client/currency rows instead of first-client/TRY fallback', async () => {
    render(<CaseFinanceCard kind="payable" context={{ ...context, clients: [...context.clients, { id: 'cc-b', name: 'Client B' }], currencies: ['TRY','USD'] }} />);
    await screen.findByText('Client B: 600,00 USD'); expect(clientAccountingApi.getOutstanding).toHaveBeenCalledTimes(4);
  });
  it('does not convert a missing account or refusal to zero', async () => {
    vi.mocked(api.getActualExpenseSummary).mockResolvedValue({ ...summary(), exists: false, totals: [] });
    const view = render(<CaseFinanceCard kind="actual" context={context} />); await screen.findByText(/hesabı yok/);
    expect(screen.queryByText('0,00 TRY')).toBeNull();
    vi.mocked(api.getActualExpenseSummary).mockRejectedValue(new Error('Erişim reddedildi'));
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' })); await screen.findByRole('alert');
    expect(screen.queryByText('0,00 TRY')).toBeNull(); view.unmount();
  });
  it('rejects malformed/scope-swapped values rather than printing them', async () => {
    vi.mocked(clientAccountingApi.getOutstanding).mockResolvedValue({ caseId: 'case-b', caseClientId: 'cc-a', currency: 'TRY', outstanding: '999.00' });
    render(<CaseFinanceCard kind="payable" context={context} />); await screen.findByRole('alert'); expect(screen.queryByText(/999/)).toBeNull();
  });
  it('clears previous context immediately and ignores a late old response', async () => {
    let finish!: (value: any) => void;
    vi.mocked(api.getActualExpenseSummary).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(summary('case-b'));
    const view = render(<CaseFinanceCard kind="actual" context={context} />);
    view.rerender(<CaseFinanceCard kind="actual" context={{ ...context, caseId: 'case-b' }} />); await screen.findByText('350,00 TRY');
    await act(async () => { finish({ ...summary(), totals: [{ amount: '999.00', currency: 'TRY', count: 1 }] }); });
    expect(screen.queryByText('999,00 TRY')).toBeNull();
  });
  it('renders exact large decimal strings without Number rounding', () => { expect(displayFinanceMoney({ amount: '9007199254740993.10', currency: 'TRY' })).toBe('9.007.199.254.740.993,10 TRY'); });
  it('keeps the actual source independent of unrelated distribution loading and errors', async () => {
    const view = render(<CaseFinanceCard kind="actual" context={context} />);
    await screen.findByText('350,00 TRY');
    view.rerender(<CaseFinanceCard kind="actual" context={{ ...context, sourceStatus: 'LOADING' }} />);
    view.rerender(<CaseFinanceCard kind="actual" context={{ ...context, sourceStatus: 'ERROR', clients: [], currencies: [] }} />);
    expect(screen.getByText('350,00 TRY')).toBeTruthy();
    expect(api.getActualExpenseSummary).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
describe('Expense payment UI identity', () => {
  const open = async () => { fireEvent.click(screen.getByRole('button', { name: 'Ödeme kaydet' })); await screen.findByLabelText('Masraf ödeme tutarı'); };
  const fill = () => { fireEvent.change(screen.getByLabelText('Masraf ödeme tutarı'), { target: { value: '600.00' } }); fireEvent.change(screen.getByLabelText('Masraf ödeme tarihi'), { target: { value: '2026-11-01' } }); };
  it('records and refreshes only after confirmed source-matching success', async () => {
    const refresh = vi.fn(); render(<ExpensePaymentAction expenseId="expense" caseId="case-a" status="PENDING" onRecorded={refresh} />);
    await open(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Ödeme kaydını onayla' })); await screen.findByText(/Ödeme kaydı tamamlandı/);
    expect(refresh).toHaveBeenCalledOnce(); expect(api.recordExpensePayment).toHaveBeenCalledWith('expense', expect.objectContaining({ amount: 600, idempotencyKey: 'stable-synthetic-key' }));
  });
  it('keeps the exact command identity for manual retry and never refreshes on rejection', async () => {
    vi.mocked(api.recordExpensePayment).mockRejectedValue(new Error('409: mevcut avans hesabı gerekli'));
    const refresh = vi.fn(); render(<ExpensePaymentAction expenseId="expense" caseId="case-a" status="PENDING" onRecorded={refresh} />);
    await open(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Ödeme kaydını onayla' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme kaydını onayla' })); await waitFor(() => expect(api.recordExpensePayment).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.recordExpensePayment).mock.calls[0]).toEqual(vi.mocked(api.recordExpensePayment).mock.calls[1]); expect(refresh).not.toHaveBeenCalled();
  });
  it('rejects swapped source and hides VIEWER/payment-closed actions', async () => {
    vi.mocked(api.getExpenseRequest).mockResolvedValue({ id: 'expense', caseId: 'wrong', currency: 'TRY' });
    const view = render(<ExpensePaymentAction expenseId="expense" caseId="case-a" status="PENDING" />); fireEvent.click(screen.getByRole('button')); await screen.findByRole('alert');
    expect(api.recordExpensePayment).not.toHaveBeenCalled(); view.unmount(); identity.user.role = 'VIEWER';
    render(<ExpensePaymentAction expenseId="expense" caseId="case-a" status="PENDING" />); expect(screen.queryByRole('button')).toBeNull();
  });
});
