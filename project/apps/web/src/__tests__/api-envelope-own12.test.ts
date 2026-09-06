/**
 * OWN-12 ADIM B (owner D-2 b, 2026-09-06) — TEK CEVAP COZUMLEYICI sozlesmesi.
 *
 * Kural: zarf SOZLESMESI DEGISMEZ (backend tek-zarf/cift-zarf davranisi aynen kalir);
 * yalniz okuma tarafindaki tolerant desen tek yere alinir. Bu suite cozumleyicinin
 * kenar durumlarini kilitler ki 39 elle yazilmis kopyanin yerini guvenle alabilsin.
 */
import { describe, it, expect } from 'vitest';
import { unwrapEnvelope, unwrapList } from '@/lib/api-envelope';

describe('OWN-12 — unwrapEnvelope', () => {
  it('cift zarfi cozer ({data:{data:X}} -> X)', () => {
    expect(unwrapEnvelope({ data: { data: { id: 'c1' } } })).toEqual({ id: 'c1' });
  });

  it('tek zarfi cozer ({data:X} -> X)', () => {
    expect(unwrapEnvelope({ data: { id: 'c1' } })).toEqual({ id: 'c1' });
  });

  it('zarfsiz govdeyi oldugu gibi doner', () => {
    expect(unwrapEnvelope({ id: 'c1' })).toEqual({ id: 'c1' });
  });

  it('dizi govdesini zarf SAYMAZ', () => {
    expect(unwrapEnvelope({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(unwrapEnvelope([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });

  it('iki katmandan derine INMEZ (sozlesme disi)', () => {
    // {data:{data:{data:X}}} → ikinci katmanda durur; ucuncu zarf sozlesme disidir.
    expect(unwrapEnvelope({ data: { data: { data: { id: 'derin' } } } })).toEqual({ data: { id: 'derin' } });
  });

  it('null/undefined govde null doner (cagiran varsayilanini uygular)', () => {
    expect(unwrapEnvelope(null)).toBeNull();
    expect(unwrapEnvelope(undefined)).toBeNull();
    expect(unwrapEnvelope({ data: null })).toBeNull();
    expect(unwrapEnvelope({ data: { data: null } })).toBeNull();
  });

  it('ilkel govdeleri korur', () => {
    expect(unwrapEnvelope({ data: 'metin' })).toBe('metin');
    expect(unwrapEnvelope({ data: { data: 42 } })).toBe(42);
    expect(unwrapEnvelope({ data: false })).toBe(false);
  });
});

describe('OWN-12 — unwrapList', () => {
  it('cift ve tek zarftan diziyi cozer', () => {
    expect(unwrapList({ data: { data: [{ id: 'a' }] } })).toEqual([{ id: 'a' }]);
    expect(unwrapList({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(unwrapList([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });

  it('dizi OLMAYAN govdede BOS dizi doner (arayuz .map ile patlamaz)', () => {
    expect(unwrapList({ data: { id: 'a' } })).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ data: null })).toEqual([]);
    expect(unwrapList(undefined)).toEqual([]);
  });
});
