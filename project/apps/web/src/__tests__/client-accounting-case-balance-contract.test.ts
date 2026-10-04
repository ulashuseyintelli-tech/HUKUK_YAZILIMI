/**
 * `clientAccountingApi.getCaseBalance` — sunucu yanıtı sözleşmesi (owner GO 2026-10-05, karar 5).
 *
 *  - Satır yokken sunucu `exists:false` döner → sarmalayıcı `{ exists:false }` verir; sıfır bakiye ya da TRY UYDURMAZ.
 *  - Satır varsa tutar ve para birimi sunucudan gelir (eski yanıtta `exists` alanı olmayabilir).
 *  - Satır var diye gelip tutar / para birimi eksikse sessizce "0" / "TRY" yazılmaz: hata verilir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiClient: { get } }));

import { clientAccountingApi } from '@/lib/api/client-accounting';

describe('clientAccountingApi.getCaseBalance', () => {
  beforeEach(() => get.mockReset());

  it('exists:false → { exists:false } (değer ve para birimi yok)', async () => {
    get.mockResolvedValue({ data: { exists: false, caseId: 'c1', balance: null, currency: null, lowThreshold: null, isLow: null, recentLedger: [] } });
    const info = await clientAccountingApi.getCaseBalance('c1');
    expect(info).toEqual({ exists: false });
    expect(get).toHaveBeenCalledWith('/cases/c1/balance');
  });

  it('kayıt var (exists:true) → tutar ve para birimi sunucudan', async () => {
    get.mockResolvedValue({ data: { exists: true, balance: '1150', currency: 'USD' } });
    expect(await clientAccountingApi.getCaseBalance('c1')).toEqual({ exists: true, balance: '1150', currency: 'USD' });
  });

  it('eski yanıt (exists alanı yok) + tutar ve para birimi → kayıt var sayılır', async () => {
    get.mockResolvedValue({ data: { balance: '600', currency: 'TRY' } });
    expect(await clientAccountingApi.getCaseBalance('c1')).toEqual({ exists: true, balance: '600', currency: 'TRY' });
  });

  it('sayı olarak gelen tutar dizeye çevrilir; gerçek sıfır bakiye ("0") KORUNUR', async () => {
    get.mockResolvedValue({ data: { exists: true, balance: 0, currency: 'TRY' } });
    expect(await clientAccountingApi.getCaseBalance('c1')).toEqual({ exists: true, balance: '0', currency: 'TRY' });
  });

  it.each([
    ['tutar yok', { exists: true, currency: 'TRY' }],
    ['tutar null', { exists: true, balance: null, currency: 'TRY' }],
    ['para birimi yok', { exists: true, balance: '5' }],
    ['boş yanıt', {}],
  ])('satır var ama %s → sıfır / TRY UYDURULMAZ, hata', async (_label, data) => {
    get.mockResolvedValue({ data });
    await expect(clientAccountingApi.getCaseBalance('c1')).rejects.toThrow(/eksik/);
  });
});
