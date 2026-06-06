/**
 * CHARACTERIZATION TEST — interest-formula.ts
 *
 * Amaç: Bu modülün BUGÜNKÜ sayısal davranışını (float artefaktları dahil) kilitlemek.
 * Bu testler "doğru" değeri değil, "şu an üretilen" değeri sabitler.
 *
 * Money Faz 1 (PR-1) safety-net'i: PR-2'de hot-path refactor yapıldığında
 * bilinçli düzeltmeler bu testleri KIRACAK — bu beklenen ve faydalı sinyaldir.
 * Kırılan her değer review'da "bilinçli yeni doğru değer" olarak ayrıca onaylanır.
 * Sessiz regresyon ile bilinçli düzeltmeyi ayırmak içindir.
 *
 * Kurallar: snapshot yok, tüm para/float sonuçları literal exact assert.
 * Değerler gerçek fonksiyon çıktısından yakalanmıştır (elle hesap değil).
 */

import {
  calculateSegmentInterest,
  roundMoney,
  calculateTotalInterest,
  calculateEffectiveRate,
} from '../interest-formula';
import { RoundingMode, RoundingScope } from '../../types/common.types';

describe('interest-formula characterization (bugünkü davranış kilidi)', () => {
  describe('calculateSegmentInterest — formül: principal * rate * days / basis (yuvarlanmamış)', () => {
    it('S1: tam yıl (100000, 0.45, 365, 365) → 45000', () => {
      expect(calculateSegmentInterest(100000, 0.45, 365, 365)).toBe(45000);
    });

    it('S2: 1 gün (100000, 0.45, 1, 365) → 123.28767123287672 (ham float)', () => {
      expect(calculateSegmentInterest(100000, 0.45, 1, 365)).toBe(123.28767123287672);
    });

    it('S3: guard days=0 (100000, 0.45, 0, 365) → 0', () => {
      expect(calculateSegmentInterest(100000, 0.45, 0, 365)).toBe(0);
    });

    it('S4: 360 basis (100000, 0.45, 30, 360) → 3750', () => {
      expect(calculateSegmentInterest(100000, 0.45, 30, 360)).toBe(3750);
    });

    it('S5: guard principal=0 (0, 0.45, 30, 365) → 0', () => {
      expect(calculateSegmentInterest(0, 0.45, 30, 365)).toBe(0);
    });

    it('S6: guard rate<0 (100000, -0.01, 30, 365) → 0', () => {
      expect(calculateSegmentInterest(100000, -0.01, 30, 365)).toBe(0);
    });

    it('S7: uzun dönem (1000000, 0.50, 3650, 365) → 5000000', () => {
      expect(calculateSegmentInterest(1000000, 0.5, 3650, 365)).toBe(5000000);
    });

    it('S8: yüksek oran (100000, 0.95, 90, 365) → 23424.657534246577 (ham float)', () => {
      expect(calculateSegmentInterest(100000, 0.95, 90, 365)).toBe(23424.657534246577);
    });
  });

  describe('roundMoney — para yuvarlama (float artefaktları dahil kilitli)', () => {
    it('R1: (123.28767123287671, HALF_UP, 2) → 123.29', () => {
      expect(roundMoney(123.28767123287671, RoundingMode.HALF_UP, 2)).toBe(123.29);
    });

    it('R2: (0.005, HALF_UP, 2) → 0.01', () => {
      expect(roundMoney(0.005, RoundingMode.HALF_UP, 2)).toBe(0.01);
    });

    /**
     * ⚠️ R3: FLOAT ARTEFAKTI — bilinçli kilitlenen KUSURLU davranış.
     * 1.005 * 100 = 100.49999999999999 (float) → Math.round → 100 → 1.00.
     * "Doğru" sonuç 1.01 beklenir. PR-2'de minor-unit/bigint ile düzeltilirse
     * bu test KIRILACAK ve 1.01 olarak bilinçli yeniden onaylanacaktır.
     */
    it('R3: (1.005, HALF_UP, 2) → 1 [FLOAT ARTEFAKTI, bilinçli kilit]', () => {
      expect(roundMoney(1.005, RoundingMode.HALF_UP, 2)).toBe(1);
    });

    it('R4: (2.675, HALF_UP, 2) → 2.68', () => {
      expect(roundMoney(2.675, RoundingMode.HALF_UP, 2)).toBe(2.68);
    });

    it('R5: (0.015, BANKERS, 2) → 0.02', () => {
      expect(roundMoney(0.015, RoundingMode.BANKERS, 2)).toBe(0.02);
    });

    it('R6: (0.025, BANKERS, 2) → 0.02 (round-half-to-even)', () => {
      expect(roundMoney(0.025, RoundingMode.BANKERS, 2)).toBe(0.02);
    });

    it('R7: (2.5, BANKERS, 0) → 2 (even)', () => {
      expect(roundMoney(2.5, RoundingMode.BANKERS, 0)).toBe(2);
    });

    it('R8: (3.5, BANKERS, 0) → 4 (even)', () => {
      expect(roundMoney(3.5, RoundingMode.BANKERS, 0)).toBe(4);
    });
  });

  describe('calculateTotalInterest — { total, roundingDifference }', () => {
    const segments = [100.123, 200.456, 300.789];

    it('T1: PER_SEGMENT + HALF_UP → { total: 601.37, roundingDifference: 0.002 }', () => {
      expect(
        calculateTotalInterest(segments, RoundingMode.HALF_UP, RoundingScope.PER_SEGMENT),
      ).toEqual({ total: 601.37, roundingDifference: 0.002 });
    });

    it('T2: TOTAL_ONLY + HALF_UP → { total: 601.37, roundingDifference: 0.002 }', () => {
      expect(
        calculateTotalInterest(segments, RoundingMode.HALF_UP, RoundingScope.TOTAL_ONLY),
      ).toEqual({ total: 601.37, roundingDifference: 0.002 });
    });
  });

  describe('calculateEffectiveRate', () => {
    it('E1: (100000, 45000, 365, 365) → 0.45', () => {
      expect(calculateEffectiveRate(100000, 45000, 365, 365)).toBe(0.45);
    });

    it('E2: guard principal=0 (0, 45000, 365, 365) → 0', () => {
      expect(calculateEffectiveRate(0, 45000, 365, 365)).toBe(0);
    });
  });
});
