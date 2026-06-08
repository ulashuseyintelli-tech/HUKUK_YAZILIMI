/**
 * CHARACTERIZATION — day-count-calculator.ts (Gate 1, @hukuk/legal-time strand)
 *
 * AMAÇ: Mevcut native Date davranışını exact-literal değerlerle KİLİTLEMEK.
 *       Bu suite davranış DOĞRULAMAZ; davranışı OLDUĞU GİBİ yakalar.
 *       legal-time adoption'ına geçilirse burada kırılması BEKLENEN değerler,
 *       davranış değişikliğinin bilinçli sinyalleridir.
 *
 * KAPSAM NOTU: Happy-path zaten `__tests__/sprint-2.spec.ts` (satır 90-208, 532)
 *       içinde pinli. Bu suite o testleri TEKRARLAMAZ; boşlukları doldurur:
 *       artık yıl, addDays round-trip/yıl taşması, format/parse UTC-anchored
 *       davranışı, determinePhase SAME_DAY sınırları ve TZ-invariance kanıtı.
 *
 * TZ-INVARIANT (PR-3, 2026-06-08): day-count-calculator artık UTC-anchored
 *       (parseIstanbulDate → UTC midnight; addDays/format → UTC getters/setters).
 *       Tüm fonksiyonlar server-TZ'den BAĞIMSIZ → Istanbul = UTC = her TZ aynı çıktı.
 *       Bu yüzden spec-içi TZ pin KALDIRILDI; alttaki determinizm testi (TZ switch →
 *       eşit) bunu kanıtlar. (Önceki +03:00 anchor TZ-kırılgandı; PR-3 ile giderildi.)
 */

import {
  calculateDays,
  parseIstanbulDate,
  addDays,
  formatIstanbulDate,
  adjustEndDateForPayment,
  determinePhase,
} from '../day-count-calculator';
import { SameDayPaymentRule } from '../../types/common.types';

describe('CHARACTERIZATION: day-count-calculator', () => {
  // (PR-3) TZ pin YOK — fonksiyonlar UTC-anchored, server-TZ'den bağımsız.
  // ───────────────────────────────────────────────────────────────────────────
  // calculateDays — TZ-KARARLI (UTC-anchor getTime diff; her zaman kararlıydı).
  // sprint-2'de olmayan: artık yıl + tarihsel DST-era kararlılığı.
  // ───────────────────────────────────────────────────────────────────────────
  describe('calculateDays — artık yıl + DST-era (boşluk)', () => {
    it('artık yıl: tüm Şubat 2024 = 29 gün', () => {
      expect(calculateDays('2024-02-01', '2024-03-01')).toBe(29);
    });

    it('artık yıl sınırı: 2024-02-28 → 2024-03-01 = 2 gün (29 Şubat dahil)', () => {
      expect(calculateDays('2024-02-28', '2024-03-01')).toBe(2);
    });

    it('artık-olmayan yıl: 2025-02-28 → 2025-03-01 = 1 gün', () => {
      expect(calculateDays('2025-02-28', '2025-03-01')).toBe(1);
    });

    it('tarihsel DST-era (mart 2015): 2015-03-28 → 2015-03-30 = 2 gün (DST kayması yok)', () => {
      expect(calculateDays('2015-03-28', '2015-03-30')).toBe(2);
    });

    it('tarihsel DST-era (ekim 2015): 2015-10-24 → 2015-10-26 = 2 gün (DST kayması yok)', () => {
      expect(calculateDays('2015-10-24', '2015-10-26')).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // addDays — round-trip + yıl taşması (boşluk; sprint-2 yalnız +5 ve ay taşmasını pinler).
  // NOT: PR-3 sonrası TZ-invariant — değerler her TZ'de aynı (eski UTC off-by-one giderildi).
  // ───────────────────────────────────────────────────────────────────────────
  describe('addDays — round-trip + yıl taşması (boşluk)', () => {
    it('round-trip: (+5 sonra -5) başlangıca döner', () => {
      expect(addDays(addDays('2025-01-01', 5), -5)).toBe('2025-01-01');
    });

    it('yıl taşması: 2025-12-31 + 1 = 2026-01-01', () => {
      expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    });

    it('artık gün: 2024-02-28 + 1 = 2024-02-29', () => {
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // parseIstanbulDate / formatIstanbulDate — UTC-anchored (TZ-invariant) davranış.
  // toISOString() UTC gece yarısı; getUTC* alanları TZ-değişmez.
  // ───────────────────────────────────────────────────────────────────────────
  describe('parse/format — UTC-anchored (TZ-invariant) davranış', () => {
    it('parseIstanbulDate mutlak an: 2025-01-15 → 2025-01-15T00:00:00.000Z (UTC gece yarısı)', () => {
      expect(parseIstanbulDate('2025-01-15').toISOString()).toBe(
        '2025-01-15T00:00:00.000Z',
      );
    });

    it('parseIstanbulDate UTC alanları: getUTCDate=15, getUTCHours=0 (TZ-değişmez)', () => {
      const d = parseIstanbulDate('2025-01-15');
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(0);
    });

    it('formatIstanbulDate round-trip: parse→format aynı string', () => {
      expect(formatIstanbulDate(parseIstanbulDate('2025-01-15'))).toBe(
        '2025-01-15',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // adjustEndDateForPayment — END/START_OF_DAY (mevcut anlamsal pin).
  // ───────────────────────────────────────────────────────────────────────────
  describe('adjustEndDateForPayment — ödeme günü kuralı', () => {
    it('END_OF_DAY: ödeme günü faiz işler → +1 gün (2025-01-15 → 2025-01-16)', () => {
      expect(
        adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.END_OF_DAY),
      ).toBe('2025-01-16');
    });

    it('START_OF_DAY: ödeme günü faiz işlemez → değişmez (2025-01-15)', () => {
      expect(
        adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.START_OF_DAY),
      ).toBe('2025-01-15');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // determinePhase — SAME_DAY sınır davranışı (sprint-2'de eksik olan kenar durumlar).
  // Kanonik kural: PRE=[start, enf), POST=[enf, end).
  // ───────────────────────────────────────────────────────────────────────────
  describe('determinePhase — SAME_DAY sınırları (boşluk)', () => {
    it('segmentEnd === enforcement → PRE_ENFORCEMENT (bitiş hariç)', () => {
      expect(determinePhase('2025-01-01', '2025-01-15', '2025-01-15')).toBe(
        'PRE_ENFORCEMENT',
      );
    });

    it('segmentStart === enforcement → POST_ENFORCEMENT (başlangıç dahil)', () => {
      expect(determinePhase('2025-01-15', '2025-01-31', '2025-01-15')).toBe(
        'POST_ENFORCEMENT',
      );
    });

    it('segment enforcement gününü kapsıyor → POST_ENFORCEMENT', () => {
      expect(determinePhase('2025-01-10', '2025-01-20', '2025-01-15')).toBe(
        'POST_ENFORCEMENT',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DETERMİNİZM KANITI (PR-3) — TZ switch'ten BAĞIMSIZ aynı çıktı.
  // UTC-anchored fonksiyonlar process.env.TZ'yi okumaz (getUTC* TZ'den etkilenmez);
  // bu yüzden test-içi TZ switch artık GÜVENİLİR. Eski +03:00 anchor'da off-by-one'dı.
  // ───────────────────────────────────────────────────────────────────────────
  describe('TZ-invariance (PR-3 determinizm kanıtı)', () => {
    const underTZ = <T>(tz: string, fn: () => T): T => {
      const saved = process.env.TZ;
      try {
        process.env.TZ = tz;
        return fn();
      } finally {
        process.env.TZ = saved;
      }
    };

    it('addDays UTC == Istanbul (off-by-one YOK)', () => {
      const utc = underTZ('UTC', () => addDays('2025-01-01', 5));
      const ist = underTZ('Europe/Istanbul', () => addDays('2025-01-01', 5));
      expect(utc).toBe(ist);
      expect(utc).toBe('2025-01-06');
    });

    it('formatIstanbulDate(parse) UTC == Istanbul', () => {
      const utc = underTZ('UTC', () => formatIstanbulDate(parseIstanbulDate('2025-01-15')));
      const ist = underTZ('Europe/Istanbul', () => formatIstanbulDate(parseIstanbulDate('2025-01-15')));
      expect(utc).toBe(ist);
      expect(utc).toBe('2025-01-15');
    });

    it('adjustEndDateForPayment(END_OF_DAY) UTC == Istanbul (+1 gün korunur)', () => {
      const utc = underTZ('UTC', () => adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.END_OF_DAY));
      const ist = underTZ('Europe/Istanbul', () => adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.END_OF_DAY));
      expect(utc).toBe(ist);
      expect(utc).toBe('2025-01-16');
    });
  });
});
