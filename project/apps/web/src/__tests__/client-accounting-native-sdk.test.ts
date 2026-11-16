import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { clientAccountingApi } from '@/lib/api/client-accounting';

function summary() { return { clientId: 'c1', asOf: '2026-11-16T10:00:00Z', source: 'LEGACY_PROJECTION', primarySwitchUnchanged: true,
  groups: [{ clientId: 'c1', currency: 'TRY', needsReview: false, caseBreakdown: [],
    clientScoped: { payableNet: '5000', paidToClient: '0', expenseRequested: '200', expensePaid: '20', expenseUnpaid: '120',
      offsetApplied: '10', offsettableNetPosition: '470' },
    caseScopedContext: { debtorCollection: '675', pendingDistribution: '0', allocationHeld: '0', pendingDistributionExcludingHeld: '0', advanceBalance: '0' } }] }; }
afterEach(() => vi.restoreAllMocks());
describe('G2 SDK complete native summary contract', () => {
  it('uses the additive route and preserves precise Decimal strings without calling legacy or FX', async () => {
    const data = summary(); data.groups[0].clientScoped.payableNet = '9999999999999.99';
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data } } as any);
    expect(await clientAccountingApi.getClientSummaryByCurrency('c1')).toEqual(data);
    expect(get).toHaveBeenCalledExactlyOnceWith('/clients/c1/accounting/summary/by-currency');
  });
  it.each(['wrong client', 'unknown source', 'missing remaining', 'NaN', 'duplicate currency', 'invalid currency', 'missing timestamp'])('rejects %s instead of inventing zero', async invalid => {
    const data: any = summary();
    if (invalid === 'wrong client') data.clientId = 'another';
    if (invalid === 'unknown source') data.source = 'JOURNAL';
    if (invalid === 'missing remaining') delete data.groups[0].clientScoped.expenseUnpaid;
    if (invalid === 'NaN') data.groups[0].clientScoped.payableNet = 'NaN';
    if (invalid === 'duplicate currency') data.groups.push(structuredClone(data.groups[0]));
    if (invalid === 'invalid currency') data.groups[0].currency = 'usd';
    if (invalid === 'missing timestamp') delete data.asOf;
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data } } as any);
    await expect(clientAccountingApi.getClientSummaryByCurrency('c1')).rejects.toThrow('CLIENT_ACCOUNTING_NATIVE_SUMMARY_UNAVAILABLE');
  });
  it('does not replace HTTP denial with an empty successful payload', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('403'));
    await expect(clientAccountingApi.getClientSummaryByCurrency('c1')).rejects.toThrow('403');
  });
});
