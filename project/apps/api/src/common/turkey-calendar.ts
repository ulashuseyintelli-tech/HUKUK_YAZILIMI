/**
 * K3-L KP-11 (owner kararı 2026-10-01) — hesap tarihinin varsayılanı Türkiye takvimine göre BUGÜN.
 *
 * `new Date().toISOString().slice(0, 10)` UTC günüdür: TSİ 00:00–02:59 arasında bir önceki günü verir (ADR-014 I-06
 * gün kesimi). Canlı API süreci TZ=UTC çalıştığı için yerel saat de yardımcı olmaz. Gün burada Europe/Istanbul
 * takviminde `Intl` ile çıkarılır; süreç saat diliminden bağımsızdır.
 *
 * Yalnız VARSAYILAN üretir: kullanıcının ya da kaydın verdiği tarih (YYYY-MM-DD) olduğu gibi kullanılır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - InterestEngineController.getCaseBalance() / getCaseBalanceDisplay() → asOfDate verilmezse
 * - CaseController.getCalculationSummary() → date verilmezse
 * - CasePaymentPreviewService.preview() → paymentDate verilmezse; saatli tarih girdisi TSİ gününe indirgenir
 * - BalanceShadowCompareController.getShadowCompare() / BalanceDisplayShadowDiffController.getShadowDiff()
 * - ReportService.getCaseDebtReport() / getInterestReport() → hesap/bitiş tarihi verilmezse
 * - CaseService.getCalculationSummary() → dosyada takip tarihi yoksa gösterim yedeği
 * </remarks>
 */
export const TURKEY_CALENDAR_TIME_ZONE = 'Europe/Istanbul' as const;

const DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TURKEY_CALENDAR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Verilen ANIN Türkiye takvimindeki günü (YYYY-MM-DD). Geçersiz an → RangeError (sessiz yedek yok). */
export function turkeyCalendarDate(instant: Date): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new RangeError('turkeyCalendarDate: geçersiz tarih');
  }
  const parts = DAY_PARTS.formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day'): string => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (!value) throw new RangeError(`turkeyCalendarDate: ${type} çözülemedi`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Türkiye takvimine göre bugün (YYYY-MM-DD). `now` testte sabitlenir. */
export function turkeyToday(now: Date = new Date()): string {
  return turkeyCalendarDate(now);
}

/**
 * Hesap tarihi girdisini güne indirger. Takvim günü (YYYY-MM-DD) olduğu gibi kalır (geçerli gün olmalı); saat içeren
 * girdi, ANIN Türkiye takvimindeki gününe çevrilir (ör. `2026-10-01T01:30:00+03:00` → `2026-10-01`; UTC günü
 * `2026-09-30` olurdu). Çözülemeyen girdi → null.
 */
export function toTurkeyCalendarDay(value: string): string | null {
  const trimmed = value.trim();
  if (ISO_DAY.test(trimmed)) {
    const probe = new Date(`${trimmed}T00:00:00.000Z`);
    return !Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === trimmed ? trimmed : null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : turkeyCalendarDate(parsed);
}

/** Türkiye takvimi gününün UTC gece yarısı anı — tarih alanlarının mevcut `new Date('YYYY-MM-DD')` temsiliyle aynı. */
export function turkeyTodayAsUtcMidnight(now: Date = new Date()): Date {
  return new Date(`${turkeyToday(now)}T00:00:00.000Z`);
}
