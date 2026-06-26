// P3-1b — canonical-json yardımcı testleri (SAF).
import {
  canonicalJsonStringify,
  stableJsonHash,
} from '../guided-edge/canonical-json';

describe('canonical-json (P3-1b substrate)', () => {
  it('[19] stableJsonHash anahtar sırasından BAĞIMSIZDIR', () => {
    const a = { tenantId: 't1', actionCode: 'CHANGE_STATUS', targetRef: 'c1' };
    const b = { targetRef: 'c1', tenantId: 't1', actionCode: 'CHANGE_STATUS' };
    expect(stableJsonHash(a)).toBe(stableJsonHash(b));
  });

  it('[19] canonicalJsonStringify iç içe nesnelerde de anahtar sırasını normalize eder', () => {
    const a = { x: { b: 2, a: 1 }, y: [3, { q: 1, p: 2 }] };
    const b = { y: [3, { p: 2, q: 1 }], x: { a: 1, b: 2 } };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  it('dizi SIRASINI korur (anlamlı sıralama)', () => {
    expect(stableJsonHash([1, 2, 3])).not.toBe(stableJsonHash([3, 2, 1]));
  });

  it('değer farkı farklı hash üretir (tampering tespiti için temel)', () => {
    expect(stableJsonHash({ status: 'CLOSED' })).not.toBe(stableJsonHash({ status: 'ACTIVE' }));
  });

  it('hash deterministiktir (aynı girdi → aynı sha256 hex)', () => {
    const v = { a: 1, b: 'x', c: [true, null] };
    expect(stableJsonHash(v)).toBe(stableJsonHash(v));
    expect(stableJsonHash(v)).toMatch(/^[0-9a-f]{64}$/);
  });
});
