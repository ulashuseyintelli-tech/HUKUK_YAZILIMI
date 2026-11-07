import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { clientFinancialDisclosureApi } from '../client-financial-disclosure';

vi.mock('../client', () => ({ apiClient: { get: vi.fn() } }));
const get = vi.mocked(apiClient.get);
beforeEach(() => { get.mockReset(); });

describe('5a recipient selection API projection', () => {
  it('encodes parent/version and returns only the purpose-bound fields', async () => {
    get.mockResolvedValue({ data: {
      surface: 'OFFICE_RECIPIENT_SELECTION', options: [{ email: 'client@example.test', label: 'Contact', secret: 'hidden' }],
      selectedRecipient: { email: 'client@example.test', providerId: 'hidden' }, internal: 'hidden',
    } } as never);
    expect(await clientFinancialDisclosureApi.getRecipientSelection('client/a', 'version?b')).toEqual({
      surface: 'OFFICE_RECIPIENT_SELECTION', options: [{ email: 'client@example.test', label: 'Contact' }], selectedRecipient: { email: 'client@example.test' },
    });
    expect(get).toHaveBeenCalledWith('/client-financial-disclosures/office/clients/client%2Fa/versions/version%3Fb/recipients');
  });

  it.each([null, {}, { surface: 'OFFICE_DETAIL' }, { surface: 'OFFICE_RECIPIENT_SELECTION', options: [], selectedRecipient: {} },
    { surface: 'OFFICE_RECIPIENT_SELECTION', options: [{}], selectedRecipient: null }])('rejects malformed data instead of turning it into an empty success: %j', async data => {
    get.mockResolvedValue({ data } as never);
    await expect(clientFinancialDisclosureApi.getRecipientSelection('c', 'v')).rejects.toThrow('DISCLOSURE_RECIPIENT_RESPONSE_INVALID');
  });

  it('propagates access refusal rather than an empty list', async () => {
    const refusal = new Error('forbidden');
    get.mockRejectedValue(refusal);
    await expect(clientFinancialDisclosureApi.getRecipientSelection('c', 'v')).rejects.toBe(refusal);
  });
});
