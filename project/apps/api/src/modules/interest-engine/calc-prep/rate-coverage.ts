/**
 * K3-L TK-2: SAF oran kapsama denetimi — değişken oranlı kovanın faiz dönemi kendi türündeki oranlarla GÜN GÜN
 * kapsanıyor mu?
 *
 * Kural oran aramasıyla (segments/timeline-generator `findRateForDate`) aynıdır: d günü için kapsayan oran
 * `validFrom ≤ d` ve (`validTo` yok ya da `validTo ≥ d`) olan AYNI türdeki orandır — `validTo` dahildir
 * (rate_schedule yazım kuralı: önceki oran yeni oranın başlangıcından bir gün önce kapanır).
 *
 * Faiz dönemi [başlangıç, hesap tarihi): başlangıç = ibraz tarihi ?? kova başlangıcı (segment kurucuyla aynı).
 * Kapsanmayan gün varsa o kovanın faizi BİLİNMİYOR demektir; komşu/gelecek oran ya da sıfır faiz VARSAYILMAZ,
 * yeni oran veya formül üretilmez. Kararı çağıran (CaseBalanceService) verir.
 *
 * Sabit oranlı türler (requiresFixedRate) oran tablosu kullanmaz → denetlenmez.
 *
 * <remarks>Çağrıldığı yerler: CaseBalanceService.computeCaseBalance() → motor çağrısından önce.</remarks>
 */

import { requiresFixedRate } from '@shared/types';
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { RateEntry } from '../rates/rate-entry.entity';

/** Kapsanmayan dönem; iki uç da DAHİL (ISO YYYY-MM-DD). */
export interface RateCoverageGap {
  from: string;
  to: string;
}

export interface UncoveredRateBucket {
  claimItemId: string;
  amount: number;
  currency: string;
  interestType: InterestTypeCode;
  gaps: RateCoverageGap[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** [from, toExclusive) aralığında kendi türündeki oranlarla kapsanmayan dönemler (uçlar dahil biçimde). */
export function findRateCoverageGaps(
  interestType: InterestTypeCode,
  from: string,
  toExclusive: string,
  rates: ReadonlyArray<RateEntry>,
): RateCoverageGap[] {
  if (from >= toExclusive) return [];
  // Her oran [validFrom, validTo+1) yarı açık aralığıdır; validTo yoksa açık uçlu.
  const intervals = rates
    .filter((rate) => rate.interestType === interestType)
    .map((rate) => ({ start: rate.validFrom, end: rate.validTo ? addDays(rate.validTo, 1) : null }))
    .filter((interval) => interval.end == null || interval.end > interval.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  const gaps: RateCoverageGap[] = [];
  let cursor = from;
  for (const interval of intervals) {
    if (cursor >= toExclusive) break;
    if (interval.end != null && interval.end <= cursor) continue;
    if (interval.start > cursor) {
      const gapEnd = interval.start < toExclusive ? interval.start : toExclusive;
      gaps.push({ from: cursor, to: addDays(gapEnd, -1) });
    }
    if (interval.end == null) {
      cursor = toExclusive;
      break;
    }
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < toExclusive) gaps.push({ from: cursor, to: addDays(toExclusive, -1) });
  return gaps;
}

/**
 * Faiz dönemi kendi türündeki oranlarla tam kapsanmayan değişken oranlı kovalar (kararlı sıra: kova sırası).
 * Boş dizi = bütün değişken oranlı kovalar tam kapsanıyor.
 */
export function findUncoveredRateBuckets(
  buckets: ReadonlyArray<ClaimBucket>,
  rates: ReadonlyArray<RateEntry>,
  asOfDate: string,
): UncoveredRateBucket[] {
  const uncovered: UncoveredRateBucket[] = [];
  for (const bucket of buckets) {
    if (bucket.fixedRate !== undefined || requiresFixedRate(bucket.interestType)) continue;
    const start = bucket.ibrazTarihi || bucket.startDate;
    const gaps = findRateCoverageGaps(bucket.interestType, start, asOfDate, rates);
    if (gaps.length > 0) {
      uncovered.push({
        claimItemId: bucket.id,
        amount: bucket.amount,
        currency: bucket.currency,
        interestType: bucket.interestType,
        gaps,
      });
    }
  }
  return uncovered;
}
