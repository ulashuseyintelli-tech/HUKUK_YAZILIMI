import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpensePaymentReversalAction } from '../ExpensePaymentReversalAction';
import { api } from '@/lib/api';

const identity = vi.hoisted(() => ({ user: { id: 'actor-1', tenantId: 'tenant-1' }, tenant: { id: 'tenant-1' } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => identity }));
vi.mock('@/lib/api', () => ({ api: { getExpensePaymentReversalOptions: vi.fn(), reverseExpensePayment: vi.fn() } }));
const props = { expenseId: 'request-1', caseId: 'case-1' };
const source = () => ({ expenseRequestId: props.expenseId, caseId: props.caseId, payments: [{ expensePaymentId: 'payment-1',
  originalAmount: '600.00', currency: 'TRY', paymentDate: '2026-10-01T10:00:00.000Z', eligible: true, completedAt: null, blockedReason: null }] });
const completed = () => ({ status: 'CREATED' as const, expenseRequestId: props.expenseId, expensePaymentId: 'payment-1',
  expensePaymentReversalId: 'reversal-1', originalAmount: '600.00', currency: 'TRY', completedAt: '2026-11-08T10:00:00.000Z' });
const open = async () => { fireEvent.click(screen.getByRole('button', { name: 'Ödeme düzeltme kaydını aç' })); await screen.findByRole('combobox'); };
const confirm = () => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'payment-1' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Yanlış ödemenin tam düzeltmesi  ' } });
  fireEvent.click(screen.getByRole('checkbox'));
};
beforeEach(() => {
  identity.user = { id: 'actor-1', tenantId: 'tenant-1' }; identity.tenant = { id: 'tenant-1' };
  vi.mocked(api.getExpensePaymentReversalOptions).mockResolvedValue(source()); vi.mocked(api.reverseExpensePayment).mockResolvedValue(completed());
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('source-bound full expense payment correction', () => {
  it('requires original payment, reason and explicit full confirmation; refreshes the real source once', async () => {
    const refresh = vi.fn(); render(<ExpensePaymentReversalAction {...props} onReversed={refresh} />); await open();
    expect((screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' }) as HTMLButtonElement).disabled).toBe(true);
    confirm(); fireEvent.click(screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' }));
    await screen.findByRole('status'); expect(api.reverseExpensePayment).toHaveBeenCalledExactlyOnceWith('request-1', 'payment-1', 'Yanlış ödemenin tam düzeltmesi');
    expect(refresh).toHaveBeenCalledOnce(); expect(screen.getByText(/özgün ödeme geçmiştedir/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it.each([403, 404, 409, 500])('a %s rejection is never empty or success and has no automatic retry', async status => {
    const refresh = vi.fn(); vi.mocked(api.reverseExpensePayment).mockRejectedValue(Object.assign(new Error('Kaynak reddedildi'), { status }));
    render(<ExpensePaymentReversalAction {...props} onReversed={refresh} />); await open(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' })); await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull(); expect(screen.queryByText('Bu talepte kayıtlı ödeme yok.')).toBeNull();
    expect(refresh).not.toHaveBeenCalled(); expect(api.reverseExpensePayment).toHaveBeenCalledOnce(); expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('read refusal is an error, never an empty history', async () => {
    vi.mocked(api.getExpensePaymentReversalOptions).mockRejectedValue(new Error('Erişim reddedildi'));
    render(<ExpensePaymentReversalAction {...props} />); fireEvent.click(screen.getByRole('button')); await screen.findByRole('alert');
    expect(screen.queryByText('Bu talepte kayıtlı ödeme yok.')).toBeNull(); expect(api.reverseExpensePayment).not.toHaveBeenCalled();
  });
  it('shows insufficient source balance and completed history without an enabled command', async () => {
    const data = source(); data.payments[0] = { ...data.payments[0], eligible: false, blockedReason: 'EXPENSE_PAYMENT_REVERSAL_INSUFFICIENT_BALANCE' } as any;
    vi.mocked(api.getExpensePaymentReversalOptions).mockResolvedValue(data);
    render(<ExpensePaymentReversalAction {...props} />); fireEvent.click(screen.getByRole('button')); await screen.findByText('600.00 TRY — Kaynak dosya avans bakiyesi yetersiz.');
    expect(screen.queryByRole('textbox')).toBeNull(); expect(api.reverseExpensePayment).not.toHaveBeenCalled();
  });
  it('retains completed acknowledgement when subsequent source refresh fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('read failed'));
    vi.mocked(api.reverseExpensePayment).mockResolvedValue({ ...completed(), status: 'REPLAYED' });
    render(<ExpensePaymentReversalAction {...props} onReversed={refresh} />); await open(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('güncel liste okunamadı'));
    expect(api.reverseExpensePayment).toHaveBeenCalledOnce(); expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each(['case', 'request', 'actor', 'tenant'])('discards a late read after %s changes', async kind => {
    let resolve!: (value: any) => void; vi.mocked(api.getExpensePaymentReversalOptions).mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<ExpensePaymentReversalAction {...props} />); fireEvent.click(screen.getByRole('button'));
    if (kind === 'actor') identity.user = { ...identity.user, id: 'actor-2' };
    if (kind === 'tenant') identity.tenant = { id: 'tenant-2' };
    view.rerender(<ExpensePaymentReversalAction {...props} caseId={kind === 'case' ? 'case-2' : props.caseId} expenseId={kind === 'request' ? 'request-2' : props.expenseId} />);
    await act(async () => { resolve(source()); }); expect(screen.queryByRole('combobox')).toBeNull(); expect(screen.queryByText(/600.00/)).toBeNull();
  });
  it('a late unmounted command never refreshes another screen', async () => {
    const refresh = vi.fn(); let resolve!: (value: any) => void;
    vi.mocked(api.reverseExpensePayment).mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<ExpensePaymentReversalAction {...props} onReversed={refresh} />); await open(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' })); view.unmount(); await act(async () => { resolve(completed()); });
    expect(refresh).not.toHaveBeenCalled();
  });
  it('rejects a mismatched successful financial acknowledgement', async () => {
    const refresh = vi.fn(); vi.mocked(api.reverseExpensePayment).mockResolvedValue({ ...completed(), currency: 'USD' });
    render(<ExpensePaymentReversalAction {...props} onReversed={refresh} />); await open(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Tam Ters Kayıt Yap' })); await screen.findByRole('alert'); expect(refresh).not.toHaveBeenCalled();
  });
});
