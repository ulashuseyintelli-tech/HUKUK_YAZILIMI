/**
 * G4b-1: SAF rate-requirements deriver — ClaimBucket[] → distinct rate query'leri.
 *
 * Kilitli kararlar (ledger, ulas 2026-06-14):
 *  - Mevcut RateProviderService reuse (G4c çağırır); burada YENİ rate motoru / fetch YOK.
 *  - requiresFixedRate(code)===true (COMMERCIAL_FIXED/CONTRACTUAL) → rate requirement ÜRETME
 *    (segment-builder fixedRate kullanır; rate tablosu gerekmez).
 *  - MERGE: (interestType, currency) bazında birleştir → startDate=min(bucket.startDate), endDate=asOfDate.
 *
 * SAF: DB/RateProvider çağrısı yok. Çıktı G4c'de getRatesForPeriod'a beslenir.
 *
 * <remarks>Çağrıldığı yerler: (G4b-1'de canlı çağıran YOK; ileride G4c orkestrasyon).</remarks>
 */

import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { requiresFixedRate } from '@shared/types';

export interface RateRequirement {
  interestType: InterestTypeCode;
  /** Kapsanması gereken en erken tarih (ISO YYYY-MM-DD). */
  startDate: string;
  /** As-of tarihi (ISO). */
  endDate: string;
  currency: string;
}

/**
 * Değişken oranlı bucket'lardan distinct rate query türetir; fixed-rate bucket'lar HARİÇ.
 * (interestType, currency) bazında merge; startDate = min.
 */
export function deriveRateRequirements(buckets: ClaimBucket[], asOfDate: string): RateRequirement[] {
  const byKey = new Map<string, RateRequirement>();

  for (const b of buckets) {
    if (requiresFixedRate(b.interestType)) continue; // fixed → rate tablosu gerekmez

    const key = `${b.interestType}|${b.currency}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        interestType: b.interestType,
        currency: b.currency,
        startDate: b.startDate,
        endDate: asOfDate,
      });
    } else if (b.startDate < existing.startDate) {
      // ISO YYYY-MM-DD lexicographic = kronolojik; en erken başlangıcı tut.
      existing.startDate = b.startDate;
    }
  }

  return [...byKey.values()];
}
