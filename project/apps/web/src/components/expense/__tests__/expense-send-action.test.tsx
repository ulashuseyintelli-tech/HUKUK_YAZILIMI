import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExpenseSendAction } from '../ExpenseSendAction';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: { sendExpenseEmail: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('existing expense row send action', () => {
  it('requests approval for the existing row and exposes the inbox without claiming a send', async () => {
    vi.mocked(api.sendExpenseEmail).mockResolvedValue({ success: false, approvalRequired: true, approvalRequestId: 'a', approvalStatus: 'PENDING_APPROVAL', message: 'E-posta gönderilmedi; iç onay bekleniyor.' });
    render(<ExpenseSendAction expenseId="existing" status="PENDING" />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('link', { name: /Onay Kutusu/ });
    expect(api.sendExpenseEmail).toHaveBeenCalledExactlyOnceWith('existing'); expect(screen.getByRole('alert').textContent).toContain('gönderilmedi');
  });
  it('does not retain the previous expense response after the row identity changes', async () => {
    let complete!: (value: unknown) => void;
    vi.mocked(api.sendExpenseEmail).mockReturnValue(new Promise(resolve => { complete = resolve; }) as never);
    const view = render(<ExpenseSendAction expenseId="old" status="PENDING" />); fireEvent.click(screen.getByRole('button'));
    view.rerender(<ExpenseSendAction expenseId="new" status="PENDING" />);
    complete({ success: true, message: 'OLD EXPENSE ACCEPTED' });
    await waitFor(() => expect(screen.queryByText('OLD EXPENSE ACCEPTED')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('renders an explicit refusal and does not turn it into an empty/success result', async () => {
    vi.mocked(api.sendExpenseEmail).mockRejectedValue(Object.assign(new Error('403'), { status: 403, body: { code: 'EXPENSE_SEND_DENIED', message: 'Masraf gönderimine izin yok.' } }));
    render(<ExpenseSendAction expenseId="denied" status="PENDING" />); fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toContain('Masraf gönderimine izin yok.'); expect(screen.queryByRole('status')).toBeNull();
  });
});
