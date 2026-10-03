/**
 * Muhasebe Defteri dönemi — Türkiye takvimine göre gün sınırları, varsayılan dönem ve doğrulama.
 *
 * Neden: panel dönemi `YYYY-MM-DD` tarih girişlerinden kurar. Gün sınırı UTC değil Türkiye takvimidir:
 * "1 Mayıs" = 30 Nisan 21:00 UTC'de başlar, 31 Mayıs 23:59:59.999 TSİ'de biter. Varsayılan "bugün" de Türkiye
 * gününe göredir (UTC günü TSİ 00:00–02:59 arasında bir önceki günü verir). Paylaşılan `turkey-calendar.ts`
 * yalnız KULLANILIR; bu dosya ona dokunmadan dönem sınırlarını üretir.
 *
 * Doğrulama yalnız bildirir; geçersiz aralık sessizce başka bir aralığa ÇEVRİLMEZ (kullanıcının girdiği tarih
 * olduğu gibi kalır, panel hata gösterir). Yalnız VARSAYILAN dönem, başlangıcı bitişin ötesine düşmeyecek biçimde üretilir.
 *
 * <remarks>
 * Çağrıldığı yerler: FinancialStatementPanel (varsayılan dönem, dönem doğrulaması, istek sınırları).
 * </remarks>
 */
import { TURKEY_CALENDAR_TIME_ZONE, isCalendarDay, turkeyCalendarDate, turkeyToday } from '@/lib/turkey-calendar';

const LOCAL_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TURKEY_CALENDAR_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Verilen ANDA Türkiye saatinin UTC'den farkı (dakika). Tarihsel yaz saati dönemleri de `Intl` ile çözülür. */
function turkeyOffsetMinutesAt(instantMs: number): number {
  const parts = LOCAL_PARTS.formatToParts(new Date(instantMs));
  const part = (type: string): number => Number(parts.find((entry) => entry.type === type)?.value);
  const wallAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return Math.round((wallAsUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

/** Türkiye takvimindeki bir günün 00:00:00.000 anı (epoch ms). */
function turkeyDayStartMs(day: string): number {
  if (!isCalendarDay(day)) throw new RangeError('turkeyDayStart: geçersiz takvim günü');
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, 0, 0, 0, 0);
  const first = wall - turkeyOffsetMinutesAt(wall) * 60000;
  return wall - turkeyOffsetMinutesAt(first) * 60000;
}

function nextDay(day: string): string {
  const probe = new Date(`${day}T00:00:00.000Z`);
  probe.setUTCDate(probe.getUTCDate() + 1);
  return probe.toISOString().slice(0, 10);
}

/** Türkiye gününün BAŞLANGICI (ISO, UTC): dönem `from` sınırı. */
export function turkeyDayStartIso(day: string): string {
  return new Date(turkeyDayStartMs(day)).toISOString();
}

/** Türkiye gününün SON milisaniyesi (ISO, UTC): dönem `to` sınırı (sunucu `lte` kullanır). */
export function turkeyDayEndIso(day: string): string {
  return new Date(turkeyDayStartMs(nextDay(day)) - 1).toISOString();
}

export interface StatementPeriodDefaults {
  from: string;
  to: string;
}

/**
 * Varsayılan dönem: başlangıç = dosyanın takip tarihinin Türkiye günü, bitiş = Türkiye'de bugün.
 * Takip tarihi bugünden sonraysa ya da okunamazsa başlangıç bitişe çekilir → varsayılan dönem HER ZAMAN geçerlidir.
 * Takip tarihi bilinmiyorsa dönem bugünle başlar; açılış, bugünden önceki tüm hareketleri taşır.
 */
export function defaultStatementPeriod(caseOpenedAt: string | null, now: Date = new Date()): StatementPeriodDefaults {
  const to = turkeyToday(now);
  const opened = turkeyDayOf(caseOpenedAt);
  const from = opened !== null && opened < to ? opened : to;
  return { from, to };
}

function turkeyDayOf(value: string | null): string | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return turkeyCalendarDate(instant);
}

export type StatementPeriodCheck =
  | { ok: true }
  | { ok: false; reason: 'INCOMPLETE' | 'ORDER' };

/** Kullanıcının girdiği dönemi doğrular; dönüştürmez. `INCOMPLETE`: eksik / geçersiz gün; `ORDER`: başlangıç > bitiş. */
export function checkStatementPeriod(from: string, to: string): StatementPeriodCheck {
  if (!isCalendarDay(from) || !isCalendarDay(to)) return { ok: false, reason: 'INCOMPLETE' };
  if (from > to) return { ok: false, reason: 'ORDER' };
  return { ok: true };
}
