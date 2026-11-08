import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';

const data = () => ({ expenseRequestId: 'req', caseId: 'case', payments: [{ expensePaymentId: 'pay', originalAmount: '600.00', currency: 'TRY',
  paymentDate: '2026-10-01T10:00:00.000Z', completedAt: null, eligible: true, blockedReason: null }] });
function response(value: unknown, status = 200) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }))); }
afterEach(() => { vi.unstubAllGlobals(); api.clearToken(); });

describe('expense full reversal SDK boundary', () => {
  it('validates the scoped source and sends only a reason without retry or new key', async () => {
    response(data()); expect(await api.getExpensePaymentReversalOptions('req', 'case')).toEqual(data());
    const result = { status: 'CREATED', expenseRequestId: 'req', expensePaymentId: 'pay', expensePaymentReversalId: 'rev', originalAmount: '600.00', currency: 'TRY', completedAt: '2026-11-08T10:00:00.000Z' };
    response(result); expect(await api.reverseExpensePayment('req', 'pay', 'original correction')).toEqual(result);
    expect(fetch).toHaveBeenCalledOnce(); const [path, init] = vi.mocked(fetch).mock.calls[0]; expect(path).toContain('/expense-requests/req/payments/pay/reverse');
    expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual({ reason: 'original correction' });
  });
  it.each([{}, { ...data(), caseId: 'other' }, { ...data(), expenseRequestId: 'other' }, { ...data(), payments: null },
    { ...data(), payments: [...data().payments, ...data().payments] }, { ...data(), payments: [{ ...data().payments[0], currency: '' }] },
    { ...data(), payments: [{ ...data().payments[0], completedAt: '2026-11-08', eligible: true }] }])('rejects malformed or mismatched read %j', async value => {
    response(value); await expect(api.getExpensePaymentReversalOptions('req', 'case')).rejects.toThrow('doğrulanamadı');
  });
  it.each([{}, { status: 'CREATED' }, { status: 'PENDING', expenseRequestId: 'req', expensePaymentId: 'pay' }])('never accepts incomplete success %j', async value => {
    response(value); await expect(api.reverseExpensePayment('req', 'pay', 'original correction')).rejects.toThrow('doğrulanamadı');
  });
  it.each([403, 404, 409])('preserves %s refusal and never converts it to a list or retries', async status => {
    response({ message: 'source denied' }, status); await expect(api.getExpensePaymentReversalOptions('req', 'case')).rejects.toMatchObject({ status }); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([403, 409])('does not retry a refused %s correction command', async status => {
    response({ message: 'source denied' }, status); await expect(api.reverseExpensePayment('req', 'pay', 'original correction')).rejects.toMatchObject({ status }); expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not automatically resend a command after transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));
    await expect(api.reverseExpensePayment('req', 'pay', 'original correction')).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
});
