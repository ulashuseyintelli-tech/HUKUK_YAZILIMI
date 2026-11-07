import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExpenseCancelAction } from '../ExpenseCancelAction';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: { cancelExpenseRequest: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const props = { expenseId: 'expense-1', status: 'PENDING', paidAmount: 0, hasPaymentHistory: false };
const fill = () => fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Talep artık gerekli değil  ' } });

describe('unpaid expense cancellation action', () => {
  it('requires a reason, sends the trimmed reason once and refreshes the real source', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.cancelExpenseRequest).mockResolvedValue({ id: props.expenseId, status: 'CANCELLED' });
    render(<ExpenseCancelAction {...props} onCancelled={refresh} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button')); expect(api.cancelExpenseRequest).not.toHaveBeenCalled();
    fill(); fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('status')).textContent).toContain('Gerçekleşmiş masraf ve ödeme kayıtları geri alınmadı');
    expect(api.cancelExpenseRequest).toHaveBeenCalledExactlyOnceWith('expense-1', 'Talep artık gerekli değil');
    expect(refresh).toHaveBeenCalledOnce(); expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([{ hasPaymentHistory: true }, { hasPaymentHistory: undefined }, { paidAmount: 10 }, { paidAmount: undefined }, { status: 'PAID' }, { status: 'PARTIAL' }, { status: 'CANCELLED' }])('does not offer cancellation for unsafe or unknown eligibility %j', override => {
    render(<ExpenseCancelAction {...props} {...override} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(api.cancelExpenseRequest).not.toHaveBeenCalled();
  });
  it('does not duplicate an in-flight command', async () => {
    let complete!: (value: any) => void;
    vi.mocked(api.cancelExpenseRequest).mockReturnValue(new Promise(resolve => { complete = resolve; }));
    render(<ExpenseCancelAction {...props} />); fill();
    fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button'));
    expect(api.cancelExpenseRequest).toHaveBeenCalledOnce();
    complete({ id: props.expenseId, status: 'CANCELLED' }); await screen.findByRole('status');
  });
  it('shows refusal without success or source refresh', async () => {
    const refresh = vi.fn();
    vi.mocked(api.cancelExpenseRequest).mockRejectedValue(Object.assign(new Error('400'), {
      status: 400, body: { statusCode: 400, message: 'Ödeme geçmişi bulunan talep iptal edilemez', error: 'Bad Request' },
    }));
    render(<ExpenseCancelAction {...props} onCancelled={refresh} />); fill(); fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toContain('Ödeme geçmişi');
    expect(screen.queryByRole('status')).toBeNull(); expect(refresh).not.toHaveBeenCalled();
  });
  it.each([{ id: 'another', status: 'CANCELLED' }, { id: props.expenseId, status: 'PENDING' }, null])('does not accept an unrelated or unconfirmed response %j', async response => {
    const refresh = vi.fn(); vi.mocked(api.cancelExpenseRequest).mockResolvedValue(response);
    render(<ExpenseCancelAction {...props} onCancelled={refresh} />); fill(); fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('alert'); expect(screen.queryByRole('status')).toBeNull(); expect(refresh).not.toHaveBeenCalled();
  });
  it('does not carry the old reason/result or invoke refresh after changing the expense identity', async () => {
    let complete!: (value: any) => void; const refresh = vi.fn();
    vi.mocked(api.cancelExpenseRequest).mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const view = render(<ExpenseCancelAction {...props} onCancelled={refresh} />); fill(); fireEvent.click(screen.getByRole('button'));
    view.rerender(<ExpenseCancelAction {...props} expenseId="new-expense" onCancelled={refresh} />);
    complete({ id: props.expenseId, status: 'CANCELLED' });
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));
    expect(screen.queryByRole('status')).toBeNull(); expect(refresh).not.toHaveBeenCalled();
  });
  it('retains confirmed cancellation when only refresh fails and prevents another write', async () => {
    vi.mocked(api.cancelExpenseRequest).mockResolvedValue({ id: props.expenseId, status: 'CANCELLED' });
    render(<ExpenseCancelAction {...props} onCancelled={vi.fn().mockRejectedValue(new Error('read failed'))} />); fill(); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('güncel liste okunamadı'));
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true); expect(api.cancelExpenseRequest).toHaveBeenCalledOnce();
  });
});
