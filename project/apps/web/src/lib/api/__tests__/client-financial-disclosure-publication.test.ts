import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientFinancialDisclosureApi } from '../client-financial-disclosure';
import { apiClient } from '../client';

vi.mock('../client', () => ({ apiClient: { post: vi.fn() } }));

describe('CL-R10 bounded publication results', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['publish', 'retryPublication'] as const)('%s preserves SEND_FAILED instead of implying success and omits provider fields', async command => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { disclosureVersionId: 'v', status: 'SEND_FAILED', replayed: false, providerMessageId: 'secret', sendFailureCode: 'internal' } });
    expect(await clientFinancialDisclosureApi[command]('v')).toEqual({ disclosureVersionId: 'v', status: 'SEND_FAILED', replayed: false });
  });
  it.each([
    undefined,
    { disclosureVersionId: 'wrong-version', status: 'PUBLISHED', replayed: false },
    { disclosureVersionId: 'v', status: 'SEND_PENDING', replayed: false },
    { disclosureVersionId: 'v', status: 'PUBLISHED' },
  ])('rejects absent, mismatched or incomplete publication results: %j', async data => {
    vi.mocked(apiClient.post).mockResolvedValue({ data });
    await expect(clientFinancialDisclosureApi.retryPublication('v')).rejects.toThrow('Publication result unavailable');
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
