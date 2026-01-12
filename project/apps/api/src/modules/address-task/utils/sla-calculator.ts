/**
 * SLA Hesaplama Kuralları
 * - Tüm SLA süreleri takvim günü (calendar day) olarak hesaplanır
 * - "3 gün" = 72 saat
 * - Hatırlatmalar 22:00-08:00 arası gönderilmez (sabaha kuyruklanır)
 */

/**
 * SLA süresi (saat cinsinden)
 */
export const SLA_HOURS = {
  CLIENT_RESPONSE: 72, // 3 gün = 72 saat
  MANUAL_TASK: 24, // 1 gün = 24 saat
  ANNUAL_REFRESH: 365 * 24, // 1 yıl
};

/**
 * Hatırlatma gönderilmeyecek saat aralığı
 */
export const QUIET_HOURS = {
  START: 22, // 22:00
  END: 8, // 08:00
};

/**
 * Verilen saatten itibaren SLA bitiş tarihini hesapla
 */
export function calculateDueAt(fromDate: Date, hours: number): Date {
  const dueAt = new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
  return dueAt;
}

/**
 * 3 günlük SLA bitiş tarihini hesapla
 */
export function calculateClientResponseDueAt(fromDate: Date = new Date()): Date {
  return calculateDueAt(fromDate, SLA_HOURS.CLIENT_RESPONSE);
}

/**
 * Manuel görev için 1 günlük SLA bitiş tarihini hesapla
 */
export function calculateManualTaskDueAt(fromDate: Date = new Date()): Date {
  return calculateDueAt(fromDate, SLA_HOURS.MANUAL_TASK);
}

/**
 * Yıllık yenileme tarihini hesapla
 */
export function calculateAnnualRefreshAt(fromDate: Date = new Date()): Date {
  return calculateDueAt(fromDate, SLA_HOURS.ANNUAL_REFRESH);
}

/**
 * Şu anki saat sessiz saat aralığında mı?
 */
export function isQuietHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= QUIET_HOURS.START || hour < QUIET_HOURS.END;
}

/**
 * Sessiz saat aralığındaysa, sabah 08:00'e ayarla
 */
export function adjustForQuietHours(date: Date): Date {
  if (!isQuietHours(date)) {
    return date;
  }
  
  const adjusted = new Date(date);
  
  // Eğer gece yarısından sonra ise (00:00-08:00), aynı gün 08:00
  if (adjusted.getHours() < QUIET_HOURS.END) {
    adjusted.setHours(QUIET_HOURS.END, 0, 0, 0);
  }
  // Eğer gece yarısından önce ise (22:00-23:59), ertesi gün 08:00
  else {
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(QUIET_HOURS.END, 0, 0, 0);
  }
  
  return adjusted;
}

/**
 * SLA'nın aşılıp aşılmadığını kontrol et
 */
export function isSlaExceeded(dueAt: Date | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  return now > dueAt;
}

/**
 * Kalan süreyi insan okunabilir formatta döndür
 */
export function formatRemainingTime(dueAt: Date | null, now: Date = new Date()): string {
  if (!dueAt) return '';
  
  const diffMs = dueAt.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  
  if (diffMs < 0) {
    // Gecikmiş
    const absDays = Math.abs(diffDays);
    const absHours = Math.abs(remainingHours);
    
    if (absDays > 0) {
      return `${absDays} gün ${absHours} saat gecikmiş`;
    }
    return `${absHours} saat gecikmiş`;
  }
  
  // Kalan süre
  if (diffDays > 0) {
    return `${diffDays} gün ${remainingHours} saat kaldı`;
  }
  return `${diffHours} saat kaldı`;
}
