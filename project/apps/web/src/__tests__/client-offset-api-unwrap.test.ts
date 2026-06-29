/**
 * TM3 Faz C C-2b FIX — client-offset.ts envelope unwrap regresyon kanıtı.
 *
 * Bug: client-offset API endpoint'leri TEK-ZARF (raw) döner; apiClient HTTP body'yi { data } içine koyar.
 * Doğru unwrap = resp.data. (Yanlış resp.data.data → undefined → react-query v5 ERROR → "Mahsup geçmişi alınamadı".)
 * Bu test apiClient'i mock'lar (clientOffsetApi'yi DEĞİL) → GERÇEK unwrap yolunu kapsar; queryFn undefined DÖNMEZ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '@/lib/api/client';
import { clientOffsetApi } from '@/lib/api/client-offset';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

// apiClient.get/post raw HTTP body'yi { data: <body> } içine koyar (client.ts). Offset API raw döndüğü için
// <body> = ham dizi/obje. clientOffsetApi resp.data ile bunu çıkarmalı (resp.data.data = undefined olurdu).
describe('clientOffsetApi — tek-zarf (raw) unwrap = resp.data (undefined DÖNMEZ)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list: raw [] → [] (undefined DEĞİL)', async () => {
    get.mockResolvedValue({ data: [] });
    const r = await clientOffsetApi.list('cl-1', { currency: 'TRY' });
    expect(r).not.toBeUndefined();
    expect(Array.isArray(r)).toBe(true);
    expect(r).toEqual([]);
  });

  it('list: raw [{...}] → kayıtlar', async () => {
    get.mockResolvedValue({ data: [{ id: 'off-1', kind: 'APPLY', amount: '500' }] });
    const r = await clientOffsetApi.list('cl-1');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('off-1');
  });

  it('getEligibility: raw {clientId,canApply,...} → obje (canApply korunur)', async () => {
    get.mockResolvedValue({ data: { clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [], eligibleExpenseRequests: [{ expenseRequestId: 'er-1' }] } });
    const r = await clientOffsetApi.getEligibility('cl-1', 'TRY');
    expect(r).not.toBeUndefined();
    expect(r.canApply).toBe(true);
    expect(r.eligibleExpenseRequests).toHaveLength(1);
  });

  it('preview: raw {payableBefore,...,netUnchanged} → obje (undefined DEĞİL → react-query error YOK)', async () => {
    post.mockResolvedValue({ data: { payableBefore: '10000', payableAfter: '8000', expenseBefore: '2000', expenseAfter: '0', netBefore: '8000', netAfter: '8000', maxAmount: '2000', netUnchanged: true } });
    const r = await clientOffsetApi.preview({ clientId: 'cl-1', currency: 'TRY', payableCaseId: 'cp', payableCaseClientId: 'cc', expenseCaseId: 'ce', expenseRequestId: 'er', amount: '1000' });
    expect(r).not.toBeUndefined();
    expect(r.payableBefore).toBe('10000');
    expect(r.netUnchanged).toBe(true);
  });

  it('create: raw {created,offsetId} → obje', async () => {
    post.mockResolvedValue({ data: { created: true, offsetId: 'off-9' } });
    const r = await clientOffsetApi.create({ clientId: 'cl-1', currency: 'TRY', payableCaseId: 'cp', payableCaseClientId: 'cc', expenseCaseId: 'ce', expenseRequestId: 'er', amount: '1000', idempotencyKey: 'k1' });
    expect(r).not.toBeUndefined();
    expect(r.created).toBe(true);
    expect(r.offsetId).toBe('off-9');
  });

  it('reverse: raw {created,offsetId,reversesOffsetId} → obje', async () => {
    post.mockResolvedValue({ data: { created: true, offsetId: 'rev-1', reversesOffsetId: 'off-1' } });
    const r = await clientOffsetApi.reverse('off-1', { reason: 'yeterince uzun gerekçe', idempotencyKey: 'rk1' });
    expect(r).not.toBeUndefined();
    expect(r.reversesOffsetId).toBe('off-1');
  });
  it('detail: raw projection → obje ve doğru endpoint', async () => {
    get.mockResolvedValue({ data: { offset: { id: 'off-1' }, sourceSummary: { payable: {}, expense: {} }, auditEvents: [] } });
    const r = await clientOffsetApi.detail('off-1');
    expect(r).not.toBeUndefined();
    expect(r.offset.id).toBe('off-1');
    expect(get).toHaveBeenCalledWith('/client-offsets/off-1/detail');
  });
});
