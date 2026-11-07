import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { clientApprovalApi } from '../client-approval';

vi.mock('../client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const get = vi.mocked(apiClient.get);
const row = () => ({ id: 'r/a', tenantId: 'tenant', caseId: 'case/a', clientId: 'client', subjectType: 'OPERATION', status: 'APPROVED', channel: 'PORTAL',
  requestedById: 'historical-staff', decision: null, createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z', subjectId: 'untrusted-soft-id', unknownSecret: 'omitted' });
const event = () => ({ id: 'e', approvalRequestId: 'r/a', eventType: 'APPROVED', fromStatus: 'SENT', toStatus: 'APPROVED', byUserId: null, note: '<b>note</b>', createdAt: '2026-01-02T10:00:00Z', providerSecret: 'omitted' });
beforeEach(() => { vi.clearAllMocks(); get.mockReset(); });

describe('6a existing approval read SDK', () => {
  it('encodes the case and whitelists the read projection, preserving unknown decision', async () => {
    get.mockResolvedValue({ data: [row()] } as never);
    const [result] = await clientApprovalApi.list('case/a', 'tenant');
    expect(get).toHaveBeenCalledWith('/client-approvals/case/case%2Fa');
    expect(result).toMatchObject({ id: 'r/a', channel: 'PORTAL', status: 'APPROVED', decision: null, requestedById: 'historical-staff' });
    expect(result).not.toHaveProperty('subjectId'); expect(result).not.toHaveProperty('unknownSecret');
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it('reads exact detail parent and ordered events without exposing extra fields', async () => {
    get.mockResolvedValue({ data: { ...row(), events: [event()] } } as never);
    const result = await clientApprovalApi.detail(row(), 'tenant');
    expect(get).toHaveBeenCalledWith('/client-approvals/r%2Fa');
    expect(result.events[0]).toMatchObject({ byUserId: null, note: '<b>note</b>' });
    expect(result.events[0]).not.toHaveProperty('providerSecret');
  });
  it('returns an empty array only from an actual valid empty response', async () => {
    get.mockResolvedValue({ data: [] }); expect(await clientApprovalApi.list('case/a', 'tenant')).toEqual([]);
  });
  it.each([null, {}, [null], [{ ...row(), tenantId: 'foreign' }], [{ ...row(), caseId: 'wrong' }], [row(), row()], [{ ...row(), status: 'UNKNOWN' }], [{ ...row(), createdAt: 'invalid' }]])('rejects malformed/foreign/duplicate list rather than empty success: %j', async data => {
    get.mockResolvedValue({ data } as never);
    await expect(clientApprovalApi.list('case/a', 'tenant')).rejects.toThrow('CLIENT_APPROVAL_RESPONSE_INVALID');
  });
  it.each([
    { ...row(), id: 'other', events: [] }, { ...row(), clientId: 'other', events: [] }, { ...row(), events: null },
    { ...row(), events: [{ ...event(), approvalRequestId: 'foreign' }] }, { ...row(), events: [event(), event()] },
    { ...row(), events: [{ ...event(), toStatus: 'UNKNOWN' }] },
  ])('rejects mismatched detail/event parent or malformed events: %j', async data => {
    get.mockResolvedValue({ data } as never);
    await expect(clientApprovalApi.detail(row(), 'tenant')).rejects.toThrow('CLIENT_APPROVAL_RESPONSE_INVALID');
  });
  it('propagates an HTTP refusal as refusal', async () => {
    const refusal = Object.assign(new Error('Forbidden'), { status: 403 }); get.mockRejectedValue(refusal);
    await expect(clientApprovalApi.list('case/a', 'tenant')).rejects.toBe(refusal);
    await expect(clientApprovalApi.detail(row(), 'tenant')).rejects.toBe(refusal);
  });
});
