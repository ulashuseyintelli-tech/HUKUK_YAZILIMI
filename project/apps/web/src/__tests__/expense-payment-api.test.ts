import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type ExpensePaymentCommand, type ExpenseReceiptPaymentCommand } from '@/lib/api';

describe('Expense payment command transport identity', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); api.setToken(null); });

  it.each(['payment', 'receive', 'legacy-alias'] as const)('%s preserves caller key/date/payload across explicit retries', async route => {
    api.setToken('synthetic-token');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'request', status: 'PARTIAL' } }) });
    vi.stubGlobal('fetch', fetch);
    const payment: ExpensePaymentCommand = { idempotencyKey: 'stable-command', amount: 60, paymentDate: '2026-10-01T10:30:00.000Z', method: 'BANK_TRANSFER', reference: 'bank-ref', notes: 'same notes' };
    const { amount, ...identity } = payment;
    const receipt: ExpenseReceiptPaymentCommand = { ...identity, paidAmount: amount, receiptDocId: 'legacy-opaque-reference' };
    const body = route === 'payment' ? payment : receipt;
    const invoke = () => route === 'payment' ? api.recordExpensePayment('request', payment)
      : route === 'receive' ? api.receiveExpenseRequest('request', receipt) : api.markExpenseRequestAsReceived('request', receipt);
    await invoke(); await invoke();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, second] = fetch.mock.calls;
    expect(String(first[0])).toContain(`/api/expense-requests/request/${route === 'payment' ? 'payment' : 'receive'}`);
    expect(first[1].method).toBe('POST');
    expect(first[1].headers.Authorization).toBe('Bearer synthetic-token');
    expect(JSON.parse(first[1].body)).toEqual(body);
    expect(second[1].body).toBe(first[1].body);
    expect(JSON.parse(second[1].body).paymentDate).toBe(payment.paymentDate);
    expect(JSON.parse(second[1].body).idempotencyKey).toBe(payment.idempotencyKey);
  });
});
