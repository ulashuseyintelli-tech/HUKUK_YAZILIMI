import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';

describe('CL-R13 existing balance SDK command boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('carries the caller-owned stable credit key unchanged across retries', async () => {
    const call=vi.spyOn(api as any,'request').mockResolvedValue({success:true,newBalance:100,ledgerId:'one'});
    const command={amount:100,currency:'TRY',source:'manual'};
    await api.creditCaseBalance('case-1',command,'stable'); await api.creditCaseBalance('case-1',command,'stable');
    expect(call).toHaveBeenCalledTimes(2);
    for(const args of call.mock.calls) expect(args).toEqual(['/cases/case-1/balance/credit',{method:'POST',headers:{'Idempotency-Key':'stable'},body:JSON.stringify(command)}]);
  });
  it('keeps the existing debit route, payload and response contract', async () => {
    const result={success:true,newBalance:90,ledgerId:'debit',isLow:true};const call=vi.spyOn(api as any,'request').mockResolvedValue(result);
    const command={amount:10,currency:'TRY',source:'manual'};
    await expect(api.debitCaseBalance('case-1',command)).resolves.toEqual(result);
    expect(call).toHaveBeenCalledWith('/cases/case-1/balance/debit',{method:'POST',body:JSON.stringify(command)});
  });
  it('preserves an explicit denial instead of reporting success', async () => {
    vi.spyOn(api as any,'request').mockRejectedValue(new Error('ADVANCE_WRITE_FORBIDDEN'));
    await expect(api.creditCaseBalance('case-1',{amount:100,currency:'TRY',source:'manual'},'key')).rejects.toThrow('ADVANCE_WRITE_FORBIDDEN');
  });
});
