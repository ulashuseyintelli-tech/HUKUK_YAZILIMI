import { createHash } from 'crypto';
import {
  deriveUyapOperationIdempotencyKeyFromHttpToken,
  isCanonicalUyapOperationIdempotencyKey,
  newUyapOperationIdempotencyKey,
} from './uyap-operation-writer.types';
import { UyapOperationWriterValidationError } from './uyap-operation-writer.errors';

/**
 * P05C-P04 (OPTION B + BOUNDED A) — HTTP retry-token → branded key factory.
 */
describe('deriveUyapOperationIdempotencyKeyFromHttpToken', () => {
  const NS = 'tenant-1:UYAP_SEND';
  const TOKEN = 'abc123-req-key-XYZ';

  it('kanonik biçim üretir: UYAP-OP/v1:HTTP:<64-hex>', () => {
    const key = deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN);
    expect(key).toMatch(/^UYAP-OP\/v1:HTTP:[0-9a-f]{64}$/);
    expect(isCanonicalUyapOperationIdempotencyKey(key)).toBe(true);
  });

  it('DETERMINISTIK: aynı namespace+token → aynı key', () => {
    expect(deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN)).toEqual(
      deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN),
    );
  });

  it('digest = sha256(namespace + newline + normalizedToken) (opaque canonicalizasyon, payload hash DEĞİL)', () => {
    const key = deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN);
    const expected = createHash('sha256').update(`${NS}\n${TOKEN}`, 'utf8').digest('hex');
    expect(key).toBe(`UYAP-OP/v1:HTTP:${expected}`);
  });

  it('NAMESPACE İZOLASYONU: farklı tenant → farklı key', () => {
    expect(deriveUyapOperationIdempotencyKeyFromHttpToken('tenant-1:UYAP_SEND', TOKEN)).not.toEqual(
      deriveUyapOperationIdempotencyKeyFromHttpToken('tenant-2:UYAP_SEND', TOKEN),
    );
  });

  it('ACTION İZOLASYONU: farklı action → farklı key', () => {
    expect(deriveUyapOperationIdempotencyKeyFromHttpToken('tenant-1:UYAP_SEND', TOKEN)).not.toEqual(
      deriveUyapOperationIdempotencyKeyFromHttpToken('tenant-1:TRIGGER_HACIZ', TOKEN),
    );
  });

  it('WHITESPACE: yalnız çevresel whitespace normalize edilir', () => {
    expect(deriveUyapOperationIdempotencyKeyFromHttpToken(NS, `  ${TOKEN}  `)).toEqual(
      deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN),
    );
  });

  it('CASE-SENSITIVE: lowercase dönüşümü YAPILMAZ', () => {
    expect(deriveUyapOperationIdempotencyKeyFromHttpToken(NS, 'AbCdEfGh')).not.toEqual(
      deriveUyapOperationIdempotencyKeyFromHttpToken(NS, 'abcdefgh'),
    );
  });

  it('namespace/token karışması yok (newline ayraç)', () => {
    // token charset newline'ı dışladığından iç-namespace kayması collision üretemez
    const k1 = deriveUyapOperationIdempotencyKeyFromHttpToken('a', 'bcdefghij');
    const k2 = deriveUyapOperationIdempotencyKeyFromHttpToken('abc', 'defghijk');
    expect(k1).not.toEqual(k2);
  });

  describe('reddedilen girdiler (typed hata + RAW TOKEN sızmaz)', () => {
    it('boş / whitespace-only token', () => {
      for (const bad of ['', '   ', '\t\n']) {
        expect(() => deriveUyapOperationIdempotencyKeyFromHttpToken(NS, bad)).toThrow(
          UyapOperationWriterValidationError,
        );
      }
    });

    it('çok kısa (<8) / çok uzun (>200)', () => {
      expect(() => deriveUyapOperationIdempotencyKeyFromHttpToken(NS, 'short')).toThrow(
        UyapOperationWriterValidationError,
      );
      expect(() => deriveUyapOperationIdempotencyKeyFromHttpToken(NS, 'x'.repeat(201))).toThrow(
        UyapOperationWriterValidationError,
      );
    });

    it('görünür-ASCII dışı: iç-whitespace / control / unicode reddedilir', () => {
      const nul = String.fromCharCode(0); // control char (0x00)
      for (const bad of ['abc def12', `abc${nul}def`, 'tokenüçlü1', 'a\tbcdefg']) {
        expect(() => deriveUyapOperationIdempotencyKeyFromHttpToken(NS, bad)).toThrow(
          UyapOperationWriterValidationError,
        );
      }
    });

    it('boş namespace', () => {
      expect(() => deriveUyapOperationIdempotencyKeyFromHttpToken('', TOKEN)).toThrow(
        UyapOperationWriterValidationError,
      );
    });

    it('hata mesajı RAW TOKEN plaintext içermez', () => {
      const secret = 'SUPERSECRETTOKEN12345';
      try {
        deriveUyapOperationIdempotencyKeyFromHttpToken(NS, secret + ' '); // charset-red (iç boşluk)
        fail('atmalıydı');
      } catch (e) {
        expect((e as Error).message).not.toContain(secret);
      }
    });
  });

  it('random factory ile aynı brand tipini üretir (her iki form da isCanonical)', () => {
    expect(isCanonicalUyapOperationIdempotencyKey(newUyapOperationIdempotencyKey())).toBe(true);
    expect(isCanonicalUyapOperationIdempotencyKey(deriveUyapOperationIdempotencyKeyFromHttpToken(NS, TOKEN))).toBe(true);
  });
});
