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
 *       artık yıl, addDays round-trip/yıl taşması, format/parse server-local
 *       davranışı, determinePhase SAME_DAY sınırları ve TZ-kırılganlığı kanıtı.
 *
 * TZ KAPSÜLLEME (onaylı karar, 2026-06-07): Proje genelinde TZ pinli DEĞİL
 *       (jest.config / jest.setup / env — hiçbiri). `addDays`, `formatIstanbulDate`,
 *       `parseIstanbulDate.getDate`, `adjustEndDateForPayment(END_OF_DAY)` server-local
 *       TZ'ye duyarlıdır → UTC CI'da off-by-one üretir. Bu suite'in deterministik
 *       kalması için TZ YALNIZ BU SPEC içinde 'Europe/Istanbul'a pinlenir ve afterAll
 *       ile eski değer geri alınır. Production koduna ve jest global config'e DOKUNULMAZ.
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
  // --- TZ kapsülleme: yalnız bu spec içinde, production/jest config'e dokunmadan ---
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Europe/Istanbul';
  });

  afterAll(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // calculateDays — TZ-KARARLI (sabit +03:00 parse üzerinden getTime diff).
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
  // NOT: Istanbul-pinli değerler. UTC altında bu değerler off-by-one olur (latent bug).
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
  // parseIstanbulDate / formatIstanbulDate — mevcut server-local davranışı.
  // toISOString() TZ-DEĞİŞMEZ (mutlak an'ı sabitler); getDate/getHours server-local'dir.
  // ───────────────────────────────────────────────────────────────────────────
  describe('parse/format — mevcut (server-local) davranış', () => {
    it('parseIstanbulDate mutlak an: 2025-01-15 → 2025-01-14T21:00:00.000Z (UTC, TZ-değişmez)', () => {
      expect(parseIstanbulDate('2025-01-15').toISOString()).toBe(
        '2025-01-14T21:00:00.000Z',
      );
    });

    it('parseIstanbulDate server-local alanları (Istanbul): getDate=15, getHours=0', () => {
      const d = parseIstanbulDate('2025-01-15');
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(0);
    });

    it('formatIstanbulDate round-trip (Istanbul): parse→format aynı string', () => {
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
  // TZ-KIRILGANLIK NOTU (assertion YOK — bilinçli karar)
  //
  // legal-time adoption'ının gerekçesi olan latent bug, ayrı standalone harness ile
  // KANITLANDI (Gate 1 inventory, 2026-06-07). TZ=UTC altında MEVCUT davranış:
  //   - addDays('2025-01-01', 5)                 → '2025-01-05'  (Istanbul: '2025-01-06')
  //   - formatIstanbulDate(parse('2025-01-15'))  → '2025-01-14'  (Istanbul: '2025-01-15')
  //   - adjustEndDateForPayment(.., END_OF_DAY)  → '2025-01-15'  (Istanbul: '2025-01-16', +1 gün çöker)
  //   - calculateDays / determinePhase           → KARARLI (sabit +03:00 / string-compare)
  //
  // Bu divergence burada CANLI assert EDİLMEZ: jest/V8 aynı process içinde ikinci bir
  // runtime TZ switch'ini (Istanbul→UTC) güvenilir biçimde uygulamıyor (TZ offset cache);
  // beforeAll'daki tek-yönlü pin çalışır, test-içi yeniden switch güvenilmez/flaky olur.
  // Kanıt harness'ta sabittir; bu suite mevcut (Istanbul) davranışı deterministik kilitler.
});
