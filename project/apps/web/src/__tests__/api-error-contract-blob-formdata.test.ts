/**
 * OWN-12 ADIM A (owner GO 2026-09-06, Faz 4) — FormData ve blob yollarinin KANONIK hata sozlesmesi.
 *
 * `lib/api.ts` icindeki dort yol hala hatayi ELLE kuruyordu:
 *   - blob GET            → `new Error("İndirme hatası")`         (govde ve durum kodu KAYBOLUYORDU)
 *   - FormData POST       → `new Error(error.message || "...")`   (govde ve durum kodu KAYBOLUYORDU)
 *   - UYAP XML indirme    → `new Error(error.message || '...')`
 *   - UYAP toplu indirme  → `new Error(error.message || '...')`
 * Bu suite dort yolun da `buildApiHttpError` sozlesmesine baglandigini kilitler:
 * `message` metni AYNEN korunur, `body` ve `status` ARTIK TASINIR.
 *
 * Ayrica korunmasi gerekenler olculur: multipart `Content-Type` gonderilmez (boundary'yi
 * tarayici koyar), basarili blob donusu degismez, ag hatasi raporlamasi bozulmaz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildApiHttpError } from '@/lib/api-error';

describe('OWN-12 A — buildApiHttpError varsayilan mesaj parametresi', () => {
  it('govdede mesaj varsa fallback KULLANILMAZ', () => {
    const err = buildApiHttpError({ message: 'Sunucu mesaji' }, 400, 'XML indirme hatası');
    expect(err.message).toBe('Sunucu mesaji');
  });

  it('govdede mesaj yoksa VERILEN fallback kullanilir', () => {
    const err = buildApiHttpError({}, 500, 'XML indirme hatası');
    expect(err.message).toBe('XML indirme hatası');
    expect(err.status).toBe(500);
  });

  it('fallback verilmezse mevcut varsayilan DEGISMEZ', () => {
    expect(buildApiHttpError({}, 500).message).toBe('Bir hata oluştu');
  });
});

describe('OWN-12 A — api.ts FormData / blob yollari', () => {
  const reported: any[] = [];

  beforeEach(() => {
    reported.length = 0;
    vi.resetModules();
    vi.doMock('@/lib/error-reporter', () => ({
      reportClientError: (p: any) => {
        reported.push(p);
      },
      shouldReportNetworkError: (err: any) => err instanceof TypeError,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/error-reporter');
    vi.resetModules();
  });

  function stubFetch(status: number, body: unknown, blob = false) {
    const fn = vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      blob: async () => (blob ? new Blob(['x']) : undefined),
    }));
    vi.stubGlobal('fetch', fn as any);
    return fn;
  }

  it('blob GET hatasi: mesaj KORUNUR, body ve status ARTIK TASINIR', async () => {
    stubFetch(403, { message: 'Yetkiniz yok', code: 'FORBIDDEN' });
    const { api } = await import('@/lib/api');

    const err: any = await (api as any).get('/x/y', { responseType: 'blob' }).catch((e: any) => e);
    expect(err.message).toBe('Yetkiniz yok');
    expect(err.status).toBe(403);
    expect((err.body as any).code).toBe('FORBIDDEN');
  });

  it('blob GET: govde mesajsizsa mevcut "İndirme hatası" metni KORUNUR', async () => {
    stubFetch(500, {});
    const { api } = await import('@/lib/api');

    const err: any = await (api as any).get('/x/y', { responseType: 'blob' }).catch((e: any) => e);
    expect(err.message).toBe('İndirme hatası');
    expect(err.status).toBe(500);
  });

  it('blob GET basarili: Blob DONER (davranis degismedi)', async () => {
    stubFetch(200, {}, true);
    const { api } = await import('@/lib/api');

    const res: any = await (api as any).get('/x/y', { responseType: 'blob' });
    expect(res.data).toBeInstanceOf(Blob);
  });

  it('FormData POST hatasi: kanonik sozlesme + multipart Content-Type GONDERILMEZ', async () => {
    const fetchMock = stubFetch(422, { message: 'Dosya reddedildi', fieldErrors: { file: 'buyuk' } });
    const { api } = await import('@/lib/api');

    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'a.txt');
    const err: any = await (api as any).post('/upload', fd).catch((e: any) => e);

    expect(err.message).toBe('Dosya reddedildi');
    expect(err.status).toBe(422);
    expect((err.body as any).fieldErrors).toEqual({ file: 'buyuk' });

    // Boundary'yi tarayici koyar: Content-Type basligi ELLE GONDERILMEZ.
    const init = fetchMock.mock.calls[0][1] as any;
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBe(fd);
  });

  it('UYAP tek XML indirme: mesaj metni KORUNUR, status TASINIR', async () => {
    stubFetch(404, {});
    const { api } = await import('@/lib/api');

    const err: any = await (api as any).downloadCaseXml('case-1').catch((e: any) => e);
    expect(err.message).toBe('XML indirme hatası');
    expect(err.status).toBe(404);
  });

  it('UYAP toplu XML indirme: mesaj metni KORUNUR, sunucu mesaji oncelikli', async () => {
    stubFetch(409, { message: 'Toplu is kilitli' });
    const { api } = await import('@/lib/api');

    const err: any = await (api as any).downloadBatchXml(['c1']).catch((e: any) => e);
    expect(err.message).toBe('Toplu is kilitli');
    expect(err.status).toBe(409);
  });

  it('HTTP hatasi AG hatasi degildir: bu yollarda raporlama YAPILMAZ', async () => {
    stubFetch(500, { message: 'x' });
    const { api } = await import('@/lib/api');
    await (api as any).downloadCaseXml('case-1').catch(() => undefined);
    expect(reported).toHaveLength(0);
  });
});
