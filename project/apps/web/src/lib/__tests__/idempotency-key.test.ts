import { describe, it, expect, vi, afterEach } from 'vitest';
import { createIdempotencyKey, hasSecureEntropy, InsecureEntropyError } from '../idempotency-key';

/**
 * WSMR-A4c — FİNANSAL IDEMPOTENCY ANAHTARI ÜRETİMİ.
 *
 * Bu anahtar UI'da kalmaz; backend dedupe sözleşmesine gönderilir
 * (`Idempotency-Key` header · offset create/reverse · payout create · tahsilat).
 * `Math.random()` kriptografik değildir: zayıf entropy iki ayrı finansal işlemin
 * aynı anahtarı paylaşmasına ve sunucunun ikincisini "tekrar" sayıp SESSİZCE
 * yutmasına yol açabilir. Bu yüzden fallback KALDIRILDI ve fail-closed yapıldı.
 */

const realCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  vi.restoreAllMocks();
});

const setCrypto = (value: unknown) =>
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true });

describe('createIdempotencyKey', () => {
  it('randomUUID varsa onu kullanir', () => {
    setCrypto({ randomUUID: () => '11111111-2222-4333-8444-555555555555' });
    expect(createIdempotencyKey('payout')).toBe('payout-11111111-2222-4333-8444-555555555555');
  });

  it('randomUUID YOKSA getRandomValues ile RFC4122 v4 uretir', () => {
    setCrypto({
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xab);
        return arr;
      },
    });
    const key = createIdempotencyKey('col');
    expect(key.startsWith('col-')).toBe(true);
    const uuid = key.slice('col-'.length);
    // v4 surum ve variant bitleri dogru yerlestirilmis olmali.
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('GUVENLI ENTROPY YOKSA ATAR — Math.random fallback YOK', () => {
    setCrypto(undefined);
    expect(() => createIdempotencyKey('payout')).toThrow(InsecureEntropyError);
    expect(hasSecureEntropy()).toBe(false);
  });

  it('iki bagimsiz cagri AYNI anahtari paylasmaz', () => {
    setCrypto(realCrypto);
    const keys = new Set(Array.from({ length: 5000 }, () => createIdempotencyKey('offset')));
    expect(keys.size).toBe(5000);
  });

  it('prefix benzersizligi TASIMAZ — entropi cekirdekten gelir', () => {
    setCrypto(realCrypto);
    const a = createIdempotencyKey('x');
    const b = createIdempotencyKey('x');
    expect(a).not.toBe(b);
  });
});
