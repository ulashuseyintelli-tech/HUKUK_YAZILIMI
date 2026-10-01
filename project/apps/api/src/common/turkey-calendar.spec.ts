/**
 * K3-L KP-11 (owner kararı 2026-10-01) — hesap tarihi varsayılanı Türkiye takvimine göre bugün.
 * Gün sınırı ve UTC dönüşümü regresyonları: TSİ 00:00–02:59 arasında UTC günü bir önceki gündür; yardımcı bunu
 * Europe/Istanbul takvimiyle çözer ve süreç saat diliminden (canlı TZ=UTC) bağımsızdır.
 */
import {
  toTurkeyCalendarDay,
  turkeyCalendarDate,
  turkeyToday,
  turkeyTodayAsUtcMidnight,
} from './turkey-calendar';

describe('K3-L KP-11: Türkiye takvimi günü', () => {
  it.each([
    ['2026-09-30T20:59:59.999Z', '2026-09-30'], // TSİ 23:59:59 — gün henüz bitmedi
    ['2026-09-30T21:00:00.000Z', '2026-10-01'], // TSİ 00:00 — UTC günü hâlâ 30.09
    ['2026-09-30T23:30:00.000Z', '2026-10-01'], // TSİ 02:30 — UTC günü 30.09 olurdu
    ['2026-10-01T00:00:00.000Z', '2026-10-01'], // TSİ 03:00
    ['2026-12-31T21:00:00.000Z', '2027-01-01'], // yıl sınırı
    ['2028-02-28T21:30:00.000Z', '2028-02-29'], // artık gün
  ])('%s → %s', (instant, expected) => {
    expect(turkeyCalendarDate(new Date(instant))).toBe(expected);
    expect(turkeyToday(new Date(instant))).toBe(expected);
  });

  it('UTC günüyle farkı açık: TSİ 02:30 anında UTC günü bir önceki gün, Türkiye günü bugün', () => {
    const instant = new Date('2026-09-30T23:30:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(turkeyToday(instant)).toBe('2026-10-01');
  });

  it('süreç saat diliminden bağımsız (TZ değişse de aynı gün)', () => {
    const previous = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        expect(turkeyToday(new Date('2026-09-30T23:30:00.000Z'))).toBe('2026-10-01');
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it('girdi indirgeme: takvim günü aynen; saatli girdi ANIN Türkiye günü; geçersiz → null', () => {
    expect(toTurkeyCalendarDay('2026-10-01')).toBe('2026-10-01');
    expect(toTurkeyCalendarDay(' 2026-10-01 ')).toBe('2026-10-01');
    expect(toTurkeyCalendarDay('2026-10-01T01:30:00+03:00')).toBe('2026-10-01'); // UTC günü 30.09 olurdu
    expect(toTurkeyCalendarDay('2026-09-30T22:30:00Z')).toBe('2026-10-01');
    expect(toTurkeyCalendarDay('2028-02-29')).toBe('2028-02-29');
    expect(toTurkeyCalendarDay('2026-02-30')).toBeNull();
    expect(toTurkeyCalendarDay('dün')).toBeNull();
  });

  it('UTC gece yarısı temsili tarih alanlarının mevcut biçimiyle aynı', () => {
    expect(turkeyTodayAsUtcMidnight(new Date('2026-09-30T23:30:00.000Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('geçersiz an sessizce bugüne düşmez → RangeError', () => {
    expect(() => turkeyCalendarDate(new Date('geçersiz'))).toThrow(RangeError);
  });
});
