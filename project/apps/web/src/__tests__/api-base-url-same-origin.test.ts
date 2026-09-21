/**
 * API taban adresi — alan adı derlemeye GÖMÜLMEZ.
 *
 * Ölçülen kusur (2026-09-21): canlı web paketinde `http://localhost:8080` 19 yerde gömülüydü;
 * uzak cihazdaki tarayıcı API'yi kendi makinesinde arıyordu. Bu dosya sözleşmeyi kilitler:
 *  - `NEXT_PUBLIC_API_URL` açıkça verilmişse O kullanılır (mevcut sözleşme korunur),
 *  - verilmemiş + tarayıcı + YEREL OLMAYAN host → AYNI ORIGIN (boş taban, `/api/...`),
 *  - verilmemiş + `localhost`/`127.0.0.1` → `http://localhost:8080` (personel erişimi değişmez),
 *  - sunucu tarafında (window yok) → `http://localhost:8080`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_API_URL;

async function load() {
  vi.resetModules();
  return await import('../lib/api-base-url');
}

function setHostname(hostname: string | null) {
  if (hostname === null) {
    // @ts-expect-error test: sunucu tarafı benzetimi
    delete globalThis.window;
    return;
  }
  // @ts-expect-error test: tarayıcı benzetimi
  globalThis.window = { location: { hostname } };
}

describe('resolveApiBaseUrl', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    setHostname(null);
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_ENV;
    setHostname(null);
  });

  it('env AÇIKÇA verilmişse o kullanılır (yerel olmayan host olsa bile)', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.ornek.tld';
    setHostname('portal.ornek.tld');
    const { resolveApiBaseUrl } = await load();
    expect(resolveApiBaseUrl()).toBe('https://api.ornek.tld');
  });

  it('env değerindeki sondaki eğik çizgi kırpılır', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.ornek.tld//';
    const { resolveApiBaseUrl } = await load();
    expect(resolveApiBaseUrl()).toBe('https://api.ornek.tld');
  });

  it('env YOK + tarayıcı + yerel OLMAYAN host → AYNI ORIGIN (boş taban)', async () => {
    setHostname('form.ornek.tld');
    const { resolveApiBaseUrl } = await load();
    expect(resolveApiBaseUrl()).toBe('');
  });

  it('env YOK + localhost → mevcut varsayılan korunur', async () => {
    setHostname('localhost');
    const { resolveApiBaseUrl, DEFAULT_API_BASE_URL } = await load();
    expect(resolveApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:8080');
  });

  it('env YOK + 127.0.0.1 → mevcut varsayılan korunur', async () => {
    setHostname('127.0.0.1');
    const { resolveApiBaseUrl } = await load();
    expect(resolveApiBaseUrl()).toBe('http://localhost:8080');
  });

  it('sunucu tarafında (window yok) → mevcut varsayılan korunur', async () => {
    setHostname(null);
    const { resolveApiBaseUrl } = await load();
    expect(resolveApiBaseUrl()).toBe('http://localhost:8080');
  });
});

describe('buildApiUrl — dış host ve personel erişimi', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_ENV;
    setHostname(null);
  });

  it('dış host: /api göreli yol üretir (alan adı gömülmez)', async () => {
    setHostname('form.ornek.tld');
    vi.resetModules();
    const { buildApiUrl } = await import('../lib/api-transport');
    expect(buildApiUrl('/portal/cases')).toBe('/api/portal/cases');
  });

  it('localhost: mutlak yol üretir (personel davranışı değişmez)', async () => {
    setHostname('localhost');
    vi.resetModules();
    const { buildApiUrl } = await import('../lib/api-transport');
    expect(buildApiUrl('/portal/cases')).toBe('http://localhost:8080/api/portal/cases');
  });
});
