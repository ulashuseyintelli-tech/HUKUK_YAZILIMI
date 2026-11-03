import { afterEach, describe, expect, it, vi } from 'vitest';
import { financeApi } from '../finance';

// O-7: masraf dağıtım reddi API sözleşmesi — gerekçe `note` alanında gider (API `reason` okumaz ve gerekçeyi zorunlu tutar).
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('financeApi.rejectExpenseRequest', () => {
  it('POST /expense-requests/:id/reject gövdesinde YALNIZ `note` alanı', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'e1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await financeApi.rejectExpenseRequest('e1', 'Belge eksik');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/expense-requests\/e1\/reject$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ note: 'Belge eksik' });
  });
});
