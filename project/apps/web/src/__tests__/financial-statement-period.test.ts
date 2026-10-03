/**
 * Muhasebe Defteri dönemi (financial-statement-period) — Türkiye takvimi gün sınırları, varsayılan dönem, doğrulama.
 *
 * Gün sınırı UTC değil Türkiye takvimidir; tarayıcının / test ortamının saat diliminden bağımsız olmalıdır
 * (sınırlar `Intl` ile Europe/Istanbul üzerinden çözülür).
 */
import { describe, expect, it } from 'vitest';
import {
  checkStatementPeriod,
  defaultStatementPeriod,
  turkeyDayEndIso,
  turkeyDayStartIso,
} from '@/lib/financial-statement-period';

describe('turkeyDayStartIso / turkeyDayEndIso', () => {
  it('1 Mayıs Türkiye günü 30 Nisan 21:00 UTC\'de başlar, 31 Mayıs 23:59:59.999 TSİ\'de biter', () => {
    expect(turkeyDayStartIso('2026-05-01')).toBe('2026-04-30T21:00:00.000Z');
    expect(turkeyDayEndIso('2026-05-01')).toBe('2026-05-01T20:59:59.999Z');
    expect(turkeyDayEndIso('2026-05-31')).toBe('2026-05-31T20:59:59.999Z');
  });

  it('ardışık günlerde boşluk ve çift sayım yoktur (bir günün sonu + 1 ms = sonraki günün başı)', () => {
    for (const day of ['2026-02-27', '2026-02-28', '2026-12-31', '2028-02-28', '2028-02-29']) {
      const next = new Date(`${day}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextDay = next.toISOString().slice(0, 10);
      expect(new Date(turkeyDayEndIso(day)).getTime() + 1).toBe(new Date(turkeyDayStartIso(nextDay)).getTime());
    }
  });

  it('yıl sonu ve artık gün doğru çözülür', () => {
    expect(turkeyDayStartIso('2026-01-01')).toBe('2025-12-31T21:00:00.000Z');
    expect(turkeyDayEndIso('2026-12-31')).toBe('2026-12-31T20:59:59.999Z');
    expect(turkeyDayEndIso('2028-02-28')).toBe('2028-02-28T20:59:59.999Z');
    expect(turkeyDayStartIso('2028-02-29')).toBe('2028-02-28T21:00:00.000Z');
  });

  it('tarihsel yaz saati (2016 öncesi): kış +02:00, yaz +03:00 olarak çözülür', () => {
    expect(turkeyDayStartIso('2015-01-10')).toBe('2015-01-09T22:00:00.000Z'); // EET (+02:00)
    expect(turkeyDayStartIso('2015-07-10')).toBe('2015-07-09T21:00:00.000Z'); // EEST (+03:00)
  });

  it('geçersiz takvim günü fırlatır (sessizce başka güne çevrilmez)', () => {
    expect(() => turkeyDayStartIso('2026-02-30')).toThrow(RangeError);
    expect(() => turkeyDayEndIso('')).toThrow(RangeError);
    expect(() => turkeyDayStartIso('01.05.2026')).toThrow(RangeError);
  });
});

describe('defaultStatementPeriod', () => {
  const NOON_TSI = new Date('2026-06-20T09:00:00.000Z'); // 20 Haziran 12:00 TSİ

  it('başlangıç = takip tarihinin Türkiye günü; bitiş = Türkiye\'de bugün', () => {
    // 2026-01-09T22:00Z = 10 Ocak 01:00 TSİ → Türkiye günü 10 Ocak (UTC günü 9 Ocak olurdu).
    expect(defaultStatementPeriod('2026-01-09T22:00:00.000Z', NOON_TSI)).toEqual({ from: '2026-01-10', to: '2026-06-20' });
  });

  it('TSİ 00:00–02:59 aralığında bugün yeni Türkiye günüdür', () => {
    const justAfterMidnightTsi = new Date('2026-06-20T21:05:00.000Z'); // 21 Haziran 00:05 TSİ
    expect(defaultStatementPeriod(null, justAfterMidnightTsi)).toEqual({ from: '2026-06-21', to: '2026-06-21' });
    // Aynı gün (TSİ 00:10) açılan dosya: başlangıç bitişi aşmaz.
    expect(defaultStatementPeriod('2026-06-20T21:10:00.000Z', justAfterMidnightTsi)).toEqual({
      from: '2026-06-21',
      to: '2026-06-21',
    });
  });

  it('takip tarihi bugünden sonraysa başlangıç bitişe çekilir (varsayılan dönem asla ters olmaz)', () => {
    expect(defaultStatementPeriod('2026-07-15T00:00:00.000Z', NOON_TSI)).toEqual({ from: '2026-06-20', to: '2026-06-20' });
  });

  it('takip tarihi yok ya da okunamıyorsa dönem bugünle başlar', () => {
    expect(defaultStatementPeriod(null, NOON_TSI)).toEqual({ from: '2026-06-20', to: '2026-06-20' });
    expect(defaultStatementPeriod('', NOON_TSI)).toEqual({ from: '2026-06-20', to: '2026-06-20' });
    expect(defaultStatementPeriod('gecersiz-tarih', NOON_TSI)).toEqual({ from: '2026-06-20', to: '2026-06-20' });
  });

  it('varsayılan dönem her durumda geçerlidir (başlangıç ≤ bitiş)', () => {
    for (const opened of [null, '2020-01-01T00:00:00.000Z', '2026-06-20T08:00:00.000Z', '2027-01-01T00:00:00.000Z', 'x']) {
      const { from, to } = defaultStatementPeriod(opened, NOON_TSI);
      expect(checkStatementPeriod(from, to)).toEqual({ ok: true });
    }
  });
});

describe('checkStatementPeriod', () => {
  it('geçerli aralık (aynı gün dahil) ok', () => {
    expect(checkStatementPeriod('2026-06-01', '2026-06-30')).toEqual({ ok: true });
    expect(checkStatementPeriod('2026-06-20', '2026-06-20')).toEqual({ ok: true });
  });

  it('başlangıç > bitiş → ORDER (dönüştürülmez)', () => {
    expect(checkStatementPeriod('2026-07-01', '2026-06-20')).toEqual({ ok: false, reason: 'ORDER' });
  });

  it('boş ya da geçersiz gün → INCOMPLETE', () => {
    expect(checkStatementPeriod('', '2026-06-20')).toEqual({ ok: false, reason: 'INCOMPLETE' });
    expect(checkStatementPeriod('2026-06-01', '')).toEqual({ ok: false, reason: 'INCOMPLETE' });
    expect(checkStatementPeriod('2026-02-30', '2026-03-01')).toEqual({ ok: false, reason: 'INCOMPLETE' });
  });
});
