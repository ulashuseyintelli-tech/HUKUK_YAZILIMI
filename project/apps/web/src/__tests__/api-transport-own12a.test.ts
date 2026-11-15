/**
 * OWN-12 ADIM A (owner GO 2026-09-06, Faz 2) — ORTAK TASIMA KATMANI KARAKTERIZASYONU.
 *
 * Bu suite ONCE yazildi: iki HTTP istemcisinin (`lib/api.ts` singleton `api` ve
 * `lib/api/client.ts` `apiClient`) GOZLENEBILIR davranisini kilitler ki ortak tasima
 * katmanina gecis davranis-notr oldugunu KANITLAYABILSIN.
 *
 * Onceki tam-birlestirme denemesi olculerek geri alinmisti: iki istemcinin `try` SINIRLARI
 * farklidir — `api.request` HTTP hatasini da kendi `catch`ine dusurup ag-hatasi raporlamasi
 * ve mesaj donusumu uygular, `apiClient.request` UYGULAMAZ. Bu suite tam da o farki olcer;
 * ortak katman farki SILMEZ, kucuk adaptorlerde tutar.
 *
 * AYRICA: `string[]` mesaj REGRESYONU. Birlestirme oncesi kod `new Error(body.message || ...)`
 * kuruyordu; `Error` yapicisi diziyi metne cevirdigi icin dogrulama hatalari (NestJS
 * ValidationPipe `message: string[]` doner) kullaniciya ULASIYORDU. `buildApiHttpError` yalniz
 * `typeof === 'string'` kabul edince bu detay KAYBOLDU ve kullanici "Bir hata olustu" gordu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildApiHttpError, readErrorBody } from '@/lib/api-error';

describe('OWN-12 A — buildApiHttpError kanonik hata sozlesmesi', () => {
  it('metin mesaji AYNEN tasir; body ve status korunur', () => {
    const body = { message: 'Muvekkil bulunamadi', code: 'CLIENT_NOT_FOUND' };
    const err = buildApiHttpError(body, 404);
    expect(err.message).toBe('Muvekkil bulunamadi');
    expect(err.body).toBe(body);
    expect(err.status).toBe(404);
  });

  it('REGRESYON: dizi mesaji (ValidationPipe) hata METNINE cevrilir — detay KAYBOLMAZ', () => {
    // Birlestirme oncesi davranis: `new Error(['a','b'])` → message "a,b".
    const err = buildApiHttpError({ message: ['tckn gecersiz', 'email zorunlu'] }, 400);
    expect(err.message).toContain('tckn gecersiz');
    expect(err.message).toContain('email zorunlu');
    expect(err.status).toBe(400);
  });

  it('mesaj yoksa varsayilan metin', () => {
    expect(buildApiHttpError({}, 500).message).toBe('Bir hata oluştu');
    expect(buildApiHttpError(null, 500).message).toBe('Bir hata oluştu');
    expect(buildApiHttpError('metin degil nesne', 500).message).toBe('Bir hata oluştu');
    expect(buildApiHttpError({ message: '' }, 500).message).toBe('Bir hata oluştu');
  });

  it('yapisal alanlar (code/reasonCode/candidates/fieldErrors) govde uzerinden ERISILEBILIR', () => {
    const body = {
      message: 'Cakisma',
      code: 'DUPLICATE_IDENTITY',
      reasonCode: 'CLIENT_STATE_CHANGED',
      candidates: [{ id: 'c1' }],
      fieldErrors: { tckn: 'gecersiz' },
    };
    const err = buildApiHttpError(body, 409);
    expect(err.body).toEqual(body);
  });

  it('readErrorBody: JSON olmayan yanit BOS NESNE doner (mevcut davranis)', async () => {
    const notJson = { json: async () => { throw new Error('invalid json'); } } as unknown as Response;
    await expect(readErrorBody(notJson)).resolves.toEqual({});
    const ok = { json: async () => ({ message: 'x' }) } as unknown as Response;
    await expect(readErrorBody(ok)).resolves.toEqual({ message: 'x' });
  });
});

/**
 * IKI ISTEMCININ GOZLENEBILIR DAVRANISI. Fetch ve hata raporlayici taklit edilir; gercek ag
 * cagrisi YOKTUR.
 */
describe('OWN-12 A — iki istemcinin tasima davranisi (karakterizasyon)', () => {
  const reported: any[] = [];

  beforeEach(() => {
    reported.length = 0;
    vi.resetModules();
    vi.doMock('@/lib/error-reporter', () => ({
      reportClientError: (payload: any) => {
        reported.push(payload);
      },
      shouldReportNetworkError: (err: any, endpoint: string | undefined) => {
        // Gercek modulun sozlesmesi: log ucu haric, YALNIZ ag hatasi.
        if (endpoint && endpoint.includes('/error-logs/log')) return false;
        return err instanceof TypeError;
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/error-reporter');
    vi.resetModules();
  });

  function stubFetchResponse(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      })) as any,
    );
  }

  it('HTTP hatasinda IKI istemci de AYNI hata sozlesmesini uretir (message + body + status)', async () => {
    stubFetchResponse(409, { message: 'Cakisma', code: 'DUPLICATE_IDENTITY' });
    const { api } = await import('@/lib/api');
    const { apiClient } = await import('@/lib/api/client');

    const errA: any = await (api as any).request('/clients/x').catch((e: any) => e);
    const errB: any = await apiClient.request('/clients/x').catch((e: any) => e);

    for (const err of [errA, errB]) {
      expect(err.message).toBe('Cakisma');
      expect(err.status).toBe(409);
      expect((err.body as any).code).toBe('DUPLICATE_IDENTITY');
    }
    // HTTP hatasi AG hatasi degildir: hicbir istemci raporlamaz (backend zaten loglar).
    expect(reported).toHaveLength(0);
  });

  it('AG hatasinda `apiClient` HAM hatayi firlatir (mesaj donusumu YOK) ve raporlar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as any);
    const { apiClient } = await import('@/lib/api/client');

    const err: any = await apiClient.request('/clients').catch((e: any) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe('Failed to fetch');
    expect(reported).toHaveLength(1);
    expect(reported[0].endpoint).toContain('web:apiClient');
  });

  it('AG hatasinda `api` KULLANICI MESAJINA cevirir (fark KORUNUR) ve raporlar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as any);
    const { api } = await import('@/lib/api');

    const err: any = await (api as any).request('/clients').catch((e: any) => e);
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err.message).toContain('API sunucusuna bağlanılamıyor');
    expect(reported).toHaveLength(1);
    expect(reported[0].endpoint).toContain('web:api');
  });

  it('BASARILI yanit: iki istemci de govdeyi COZULMEMIS haliyle doner (zarf cozumu cagirana ait)', async () => {
    stubFetchResponse(200, { data: { id: 'c1' } });
    const { api } = await import('@/lib/api');
    const { apiClient } = await import('@/lib/api/client');

    await expect((api as any).request('/clients/c1')).resolves.toEqual({ data: { id: 'c1' } });
    await expect(apiClient.request('/clients/c1')).resolves.toEqual({ data: { id: 'c1' } });
  });

  it('istek kurulumu: /api onekli URL ve Content-Type basligi IKI istemcide de AYNI', async () => {
    stubFetchResponse(200, {});
    const { api } = await import('@/lib/api');
    const { apiClient } = await import('@/lib/api/client');

    await (api as any).request('/clients');
    await apiClient.request('/clients');

    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [url, init] of calls) {
      expect(String(url)).toContain('/api/clients');
      expect((init.headers as any)['Content-Type']).toBe('application/json');
    }
  });

  // --- Basarili yanitin govdesi: GERCEK `Response` ile (govde metni okunabilir) ---
  // Sunucu bir ucta "kayit yok" anlaminda `null` dondugunde yanit 200 + BOS govdedir. Eskiden iki istemci de
  // `response.json()` ile "beklenmeyen JSON sonu" hatasi firlatiyor, ekran basarili okumayi hata gosteriyordu.
  function stubFetchRealResponse(make: () => Response) {
    vi.stubGlobal('fetch', vi.fn(async () => make()) as any);
  }

  async function loadClients() {
    const { api } = await import('@/lib/api');
    const { apiClient } = await import('@/lib/api/client');
    return { api: api as any, apiClient };
  }

  it('BOS govdeli 200: iki istemci de `null` doner (hata FIRLATMAZ)', async () => {
    stubFetchRealResponse(() => new Response(null, { status: 200 }));
    const { api, apiClient } = await loadClients();

    await expect(api.request('/cases/c1/responsible-person')).resolves.toBeNull();
    await expect(apiClient.request('/cases/c1/responsible-person')).resolves.toBeNull();
    // Zarf saran `get` yolu: `{ data: null }`.
    await expect(api.get('/cases/c1/responsible-person')).resolves.toEqual({ data: null });
  });

  it('yalniz bosluk iceren govde ve 204: iki istemci de `null` doner', async () => {
    stubFetchRealResponse(() => new Response('  \n', { status: 200 }));
    let clients = await loadClients();
    await expect(clients.api.request('/x')).resolves.toBeNull();
    await expect(clients.apiClient.request('/x')).resolves.toBeNull();

    stubFetchRealResponse(() => new Response(null, { status: 204 }));
    clients = await loadClients();
    await expect(clients.api.request('/x')).resolves.toBeNull();
    await expect(clients.apiClient.request('/x')).resolves.toBeNull();
  });

  it('DOLU JSON govde eskisi gibi cozulur (JSON `null` ve dizi dahil)', async () => {
    stubFetchRealResponse(() => new Response(JSON.stringify({ data: { id: 'c1' } }), { status: 200 }));
    let clients = await loadClients();
    await expect(clients.api.request('/clients/c1')).resolves.toEqual({ data: { id: 'c1' } });
    await expect(clients.apiClient.request('/clients/c1')).resolves.toEqual({ data: { id: 'c1' } });

    stubFetchRealResponse(() => new Response('null', { status: 200 }));
    clients = await loadClients();
    await expect(clients.api.request('/x')).resolves.toBeNull();

    stubFetchRealResponse(() => new Response('[1,2]', { status: 201 }));
    clients = await loadClients();
    await expect(clients.apiClient.request('/x')).resolves.toEqual([1, 2]);
  });

  it('bos OLMAYAN gecersiz JSON: iki istemci de hata firlatir (sessizce `null` YAPILMAZ)', async () => {
    stubFetchRealResponse(() => new Response('<html>beklenmeyen</html>', { status: 200 }));
    const { api, apiClient } = await loadClients();

    await expect(api.request('/x')).rejects.toBeInstanceOf(SyntaxError);
    await expect(apiClient.request('/x')).rejects.toBeInstanceOf(SyntaxError);
    // Govde cozum hatasi ag hatasi DEGILDIR: raporlanmaz ve kullanici mesajina cevrilmez.
    expect(reported).toHaveLength(0);
  });

  it('BOS govdeli HATA yaniti degismedi: kanonik hata sozlesmesi (status korunur)', async () => {
    stubFetchRealResponse(() => new Response(null, { status: 500 }));
    const { api, apiClient } = await loadClients();

    await expect(api.request('/x')).rejects.toMatchObject({ status: 500 });
    await expect(apiClient.request('/x')).rejects.toMatchObject({ status: 500 });
  });
});
