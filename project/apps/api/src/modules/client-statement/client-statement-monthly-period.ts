import { resolveSchedulerTimezone } from '../../common/scheduler-timezone';

/**
 * CAD C3-B04 — AYLIK EKSTRE DÖNEMİ (Türkiye saat dilimi).
 *
 * Dönem hesabı SAF ve DETERMİNİSTİKtir: `now` dışarıdan verilir, modül içinde
 * `new Date()` / rastgelelik YOKTUR. Aylık koşunun ürettiği dönem, host/container
 * `process.env.TZ`'sinden bağımsız olarak Türkiye yerel takvimine göre belirlenir —
 * kanonik değer `common/scheduler-timezone.ts` (W3-F03) üzerinden okunur, burada
 * ikinci bir timezone politikası TANIMLANMAZ.
 *
 * "Aylık ekstre" = koşunun çalıştığı andaki Türkiye yerel ayın BİR ÖNCESİ; ay
 * kapanmadan ekstre üretilmez.
 */

export const CLIENT_STATEMENT_MONTHLY_JOB_CLASS = 'client-statement-monthly-delivery';

/** Aylık koşunun cron ifadesi: her ayın 1'i, Türkiye saatiyle 03:00. */
export const CLIENT_STATEMENT_MONTHLY_CRON = '0 3 1 * *';

export interface MonthlyStatementPeriod {
  /** Türkiye yerel ayın kimliği — `YYYY-MM`. Idempotency anahtarlarının bucket'ı budur. */
  periodKey: string;
  /** Ayın ilk günü 00:00:00.000 (Türkiye yerel) — UTC anı olarak. */
  periodStart: Date;
  /** Ayın son günü 23:59:59.999 (Türkiye yerel) — UTC anı olarak. */
  periodEnd: Date;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Bir UTC anının verilen saat dilimindeki takvim alanları. */
function zonedFields(instant: Date, timeZone: string): ZonedFields {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const pick = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`ZONED_FIELD_MISSING: ${type}`);
    return Number(part.value);
  };
  // hour12:false bazı ICU sürümlerinde gece yarısını "24" olarak verir.
  const hour = pick('hour');
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: hour === 24 ? 0 : hour,
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** Verilen anın saat dilimi ofseti (ms). DST varsa ana göre değişir — sabit kabul EDİLMEZ. */
function zonedOffsetMs(instant: Date, timeZone: string): number {
  const f = zonedFields(instant, timeZone);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second, instant.getUTCMilliseconds());
  return asUtc - instant.getTime();
}

/** Yerel takvim alanlarını UTC anına çevirir (iki adımlı ofset düzeltmesiyle — DST sınırına dayanıklı). */
function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffset = zonedOffsetMs(new Date(guess), timeZone);
  const secondOffset = zonedOffsetMs(new Date(guess - firstOffset), timeZone);
  return new Date(guess - secondOffset);
}

/** Ayın gün sayısı (proleptik Gregoryen — Date.UTC ay taşması kullanılır). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Koşu anındaki Türkiye yerel ayın BİR ÖNCEKİ ayını dönem olarak çözer.
 * Ocak'ta koşulursa dönem bir önceki yılın Aralık'ıdır.
 */
export function resolvePreviousMonthPeriod(
  now: Date,
  timeZone: string = resolveSchedulerTimezone(CLIENT_STATEMENT_MONTHLY_JOB_CLASS),
): MonthlyStatementPeriod {
  const current = zonedFields(now, timeZone);
  let year = current.year;
  let month = current.month - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return {
    periodKey: `${year}-${String(month).padStart(2, '0')}`,
    periodStart: zonedTimeToInstant(year, month, 1, 0, 0, 0, 0, timeZone),
    periodEnd: zonedTimeToInstant(year, month, daysInMonth(year, month), 23, 59, 59, 999, timeZone),
  };
}

/**
 * Aynı tenant + müvekkil + dönem için eşzamanlı koşuları SERİLEŞTİREN advisory-lock
 * anahtarı (ClientStatementService.activeLockKey deseninin aylık koşu karşılığı).
 */
export function buildMonthlyStatementLockKey(tenantId: string, clientId: string, periodKey: string): string {
  return ['client-statement-monthly', tenantId, clientId, periodKey].join(':');
}

/**
 * Duplicate GÖNDERİM anahtarı. Biçim, mevcut dispatcher sözleşmesiyle aynıdır
 * (`{templateCode}:{refType}:{refId}:{bucket}`) — böylece aynı anahtar mevcut
 * ClientNotification idempotency kaydına karşı sorgulanabilir.
 */
export function buildMonthlyStatementDedupeKey(statementId: string, periodKey: string): string {
  return `STATEMENT_MONTHLY:ClientStatement:${statementId}:${periodKey}`;
}
