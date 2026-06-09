/**
 * Unit test — TBK100 minor-unit helper (doc 18 + doc 25).
 *
 * Pinlenen politika: HALF_UP away-from-zero, exact decimal-scale (kuruş).
 * Özellikle float-scale tuzağı (1550.025 → 155003n) exact-literal ile kilitlenir.
 */
import { toCents, fromCents } from '../minor-unit';

describe('minor-unit helper (doc 25 policy)', () => {
  describe('toCents — HALF_UP away-from-zero', () => {
    it('sub-cent HALF_UP (pozitif)', () => {
      expect(toCents(0.004)).toBe(0n);
      expect(toCents(0.005)).toBe(1n);
      expect(toCents(0.014)).toBe(1n);
      expect(toCents(0.015)).toBe(2n);
    });

    it('sub-cent away-from-zero (negatif)', () => {
      expect(toCents(-0.004)).toBe(0n);
      expect(toCents(-0.005)).toBe(-1n);
    });

    it('float-scale tuzağı: exact decimal-scale ile doğru cents', () => {
      // 1550.0200000000002 float-dust → 155002n (yukarı yuvarlanmaz)
      expect(toCents(1550.0200000000002)).toBe(155002n);
      // 1550.025 → 155002.5 → HALF_UP away → 155003n (naif *100 yanlışlıkla 155002 verirdi)
      expect(toCents(1550.025)).toBe(155003n);
    });

    it('tam değerler', () => {
      expect(toCents(0)).toBe(0n);
      expect(toCents(1)).toBe(100n);
      expect(toCents(1550.02)).toBe(155002n);
      expect(toCents(-1550.02)).toBe(-155002n);
    });
  });

  describe('fromCents', () => {
    it('temel çevrimler', () => {
      expect(fromCents(0n)).toBe(0);
      expect(fromCents(1n)).toBe(0.01);
      expect(fromCents(-1n)).toBe(-0.01);
      expect(fromCents(100n)).toBe(1);
      expect(fromCents(155003n)).toBe(1550.03);
      expect(fromCents(155002n)).toBe(1550.02);
    });
  });

  describe('round-trip', () => {
    it('toCents → fromCents kuruş hassasiyetinde döner', () => {
      expect(fromCents(toCents(1550.025))).toBe(1550.03);
      expect(fromCents(toCents(0.005))).toBe(0.01);
      expect(fromCents(toCents(1550.0200000000002))).toBe(1550.02);
    });
  });
});
