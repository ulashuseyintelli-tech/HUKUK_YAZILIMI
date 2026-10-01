/**
 * K3-L KP-11 (owner kararı 2026-10-01) — hesap tarihinin varsayılanı Türkiye takvimine göre BUGÜN.
 *
 * `new Date().toISOString().split("T")[0]` UTC günüdür: TSİ 00:00–02:59 arasında bir önceki günü verir. Gün burada
 * Europe/Istanbul takviminde `Intl` ile çıkarılır; tarayıcının ya da test ortamının saat diliminden bağımsızdır.
 * Yalnız VARSAYILAN üretir — kullanıcının seçtiği ya da kaydedilmiş tarih (YYYY-MM-DD) olduğu gibi kullanılır.
 *
 * <remarks>
 * Çağrıldığı yerler: HesapOzetiPanel / useCaseCalculation (hesap tarihi), yeni takip sihirbazı (takip ve hesap tarihi,
 * taslak), ProfessionalClaimItemForm, CaseDebtReport, InterestReport, CollectionModal (tahsilat = önizleme hesap tarihi).
 * </remarks>
 */
export const TURKEY_CALENDAR_TIME_ZONE = "Europe/Istanbul";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TURKEY_CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Verilen ANIN Türkiye takvimindeki günü (YYYY-MM-DD). */
export function turkeyCalendarDate(instant: Date): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new RangeError("turkeyCalendarDate: geçersiz tarih");
  }
  const parts = DAY_PARTS.formatToParts(instant);
  const part = (type: "year" | "month" | "day"): string => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (!value) throw new RangeError(`turkeyCalendarDate: ${type} çözülemedi`);
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Türkiye takvimine göre bugün (YYYY-MM-DD). */
export function turkeyToday(now: Date = new Date()): string {
  return turkeyCalendarDate(now);
}

/** Geçerli bir takvim günü (YYYY-MM-DD) mü? Taslaktan geri yüklenen değerin doğrulanması için. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const probe = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === value;
}
