/**
 * Client Intake 4.7d-1 — client-intel-statement.ts envelope unwrap kanıtı.
 *
 * intel-statement endpoint'leri TEK-ZARF (raw) döner; apiClient HTTP body'yi { data } içine koyar.
 * Doğru unwrap = resp.data (resp.data.data → undefined → react-query ERROR olurdu).
 * Bu test apiClient'i mock'lar (clientIntelStatementApi'yi DEĞİL) → GERÇEK unwrap + path'i kapsar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '@/lib/api/client';
import { clientIntelStatementApi } from '@/lib/api/client-intel-statement';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

describe('clientIntelStatementApi — tek-zarf (raw) unwrap = resp.data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listByCase: raw [] → [] (undefined DEĞİL) + doğru path', async () => {
    get.mockResolvedValue({ data: [] });
    const r = await clientIntelStatementApi.listByCase('case-1');
    expect(r).not.toBeUndefined();
    expect(Array.isArray(r)).toBe(true);
    expect(r).toEqual([]);
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1');
  });

  it('listByCase: raw [{...}] → kayıtlar', async () => {
    get.mockResolvedValue({ data: [{ id: 'cis-1', category: 'INCOME_SOURCE', value: 'müteahhit', status: 'ACTIVE' }] });
    const r = await clientIntelStatementApi.listByCase('case-1');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('cis-1');
    expect(r[0].category).toBe('INCOME_SOURCE');
  });

  it('listByCase: status verilince query string eklenir', async () => {
    get.mockResolvedValue({ data: [] });
    await clientIntelStatementApi.listByCase('case-1', 'SUPERSEDED');
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1?status=SUPERSEDED');
  });

  it('get: raw {...} → obje (undefined DEĞİL) + doğru path', async () => {
    get.mockResolvedValue({ data: { id: 'cis-9', category: 'STRATEGY', value: 'beyan', status: 'ACTIVE' } });
    const r = await clientIntelStatementApi.get('cis-9');
    expect(r).not.toBeUndefined();
    expect(r.id).toBe('cis-9');
    expect(get).toHaveBeenCalledWith('/client-intel-statements/cis-9');
  });

  it('listByCaseAllStatuses: 4 statü paralel çağrılır + birleşir (read-only)', async () => {
    get
      .mockResolvedValueOnce({ data: [{ id: 'a', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ data: [{ id: 'r', status: 'RETRACTED' }] })
      .mockResolvedValueOnce({ data: [{ id: 'f', status: 'FALSE_POSITIVE' }] })
      .mockResolvedValueOnce({ data: [{ id: 's', status: 'SUPERSEDED' }] });
    const r = await clientIntelStatementApi.listByCaseAllStatuses('case-1');
    expect(r).toHaveLength(4);
    expect(r.map((x) => x.status).sort()).toEqual(['ACTIVE', 'FALSE_POSITIVE', 'RETRACTED', 'SUPERSEDED']);
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1?status=ACTIVE');
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1?status=RETRACTED');
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1?status=FALSE_POSITIVE');
    expect(get).toHaveBeenCalledWith('/client-intel-statements/case/case-1?status=SUPERSEDED');
  });
});
