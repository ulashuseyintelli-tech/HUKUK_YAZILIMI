/**
 * Task 7.1 - Anomaly Detectors
 * 
 * Her detector evidence üretir (tarih aralığı + gün + id)
 */

import { CalculationMode } from '../../types/common.types';
import { CoverageMap, RateGap, RateOverlap } from '../../rates/coverage-map.builder';
import { InterestEngineError, InterestEngineErrorCode } from '../../errors/interest-engine-errors';
import { PolicyWarning } from '../../types/calculation.types';

// ═══════════════════════════════════════════════════════════════════════════
// DETECTOR RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface DetectorResult {
  detected: boolean;
  warning?: PolicyWarning;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectRateGaps(
  coverage: CoverageMap,
  mode: CalculationMode,
): DetectorResult {
  if (coverage.gaps.length === 0) {
    return { detected: false };
  }

  const totalGapDays = coverage.gaps.reduce((sum, g) => sum + g.days, 0);
  const severity = mode === CalculationMode.PREVIEW ? 'WARNING' : 'ERROR';

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_RATE_GAP,
      severity,
      message: `Oran tablosunda ${coverage.gaps.length} boşluk tespit edildi (toplam ${totalGapDays} gün)`,
      suggestion: 'Manuel oran girişi yapın veya TCMB senkronizasyonu çalıştırın',
      evidence: { gaps: coverage.gaps },
    },
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// OVERLAP DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectRateOverlaps(
  coverage: CoverageMap,
  mode: CalculationMode,
): DetectorResult {
  if (coverage.overlaps.length === 0) {
    return { detected: false };
  }

  const severity = mode === CalculationMode.LEGAL_REPORT ? 'ERROR' : 'WARNING';

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_RATE_OVERLAP,
      severity,
      message: `Oran tablosunda ${coverage.overlaps.length} çakışma tespit edildi`,
      suggestion: 'En son eklenen oran kullanılacak',
      evidence: { overlaps: coverage.overlaps },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INFERRED RATE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectInferredRates(
  coverage: CoverageMap,
  mode: CalculationMode,
): DetectorResult {
  if (!coverage.hasInferredRates) {
    return { detected: false };
  }

  // LEGAL_REPORT + hasInferredRates = ERROR (varsaydık mahkemede toxic)
  const severity = mode === CalculationMode.LEGAL_REPORT ? 'ERROR' : 'WARNING';

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_INFERRED_RATE,
      severity,
      message: 'Varsayılan oran kullanıldı - mahkeme modunda kabul edilmez',
      suggestion: 'Eksik oranları manuel girin',
      evidence: { hasInferredRates: true },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NEGATIVE DAYS DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectNegativeDays(
  startDate: string,
  endDate: string,
): DetectorResult {
  const start = new Date(startDate + 'T00:00:00+03:00');
  const end = new Date(endDate + 'T00:00:00+03:00');
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (days >= 0) {
    return { detected: false };
  }

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_NEGATIVE_DAYS,
      severity: 'ERROR',
      message: `Negatif gün sayısı: ${days} (${startDate} → ${endDate})`,
      suggestion: 'Başlangıç ve bitiş tarihlerini kontrol edin',
      evidence: { startDate, endDate, calculatedDays: days },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ZERO DAYS DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectZeroDays(
  startDate: string,
  endDate: string,
): DetectorResult {
  const start = new Date(startDate + 'T00:00:00+03:00');
  const end = new Date(endDate + 'T00:00:00+03:00');
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (days !== 0) {
    return { detected: false };
  }

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_ZERO_DAYS,
      severity: 'WARNING',
      message: `Sıfır gün faiz hesabı (${startDate} → ${endDate})`,
      suggestion: 'Tarihler aynı, faiz hesaplanmayacak',
      evidence: { startDate, endDate },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IBRAZ BEFORE VADE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectIbrazBeforeVade(
  ibrazDate: string | undefined,
  vadeDate: string | undefined,
): DetectorResult {
  if (!ibrazDate || !vadeDate) {
    return { detected: false };
  }

  if (ibrazDate >= vadeDate) {
    return { detected: false };
  }

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_IBRAZ_BEFORE_VADE,
      severity: 'ERROR',
      message: `İbraz tarihi (${ibrazDate}) vade tarihinden (${vadeDate}) önce olamaz`,
      suggestion: 'Çek ibraz tarihi en erken vade tarihinde olabilir',
      evidence: { ibrazDate, vadeDate },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXCESSIVE RATE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectExcessiveRate(
  contractRate: number | undefined,
  legalRate: number,
  multiplier: number = 3,
): DetectorResult {
  if (!contractRate) {
    return { detected: false };
  }

  const maxAllowed = legalRate * multiplier;
  if (contractRate <= maxAllowed) {
    return { detected: false };
  }

  const ratio = contractRate / legalRate;

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_EXCESSIVE_RATE,
      severity: 'WARNING',
      message: `Sözleşmesel faiz (%${(contractRate * 100).toFixed(2)}) yasal faizin ${ratio.toFixed(1)} katı`,
      suggestion: 'Yargıtay içtihatlarına göre aşırı yüksek faiz indirilebilir',
      evidence: { contractRate, legalRate, ratio },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LONG SEGMENT DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectLongSegment(
  segmentDays: number,
  rateCount: number,
  threshold: number = 180,
): DetectorResult {
  if (segmentDays <= threshold || rateCount > 1) {
    return { detected: false };
  }

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_LONG_SEGMENT,
      severity: 'WARNING',
      message: `${segmentDays} günlük segment tek oranla hesaplandı - oran değişikliği eksik olabilir`,
      suggestion: 'Oran değişikliklerini kontrol edin',
      evidence: { segmentDays, rateCount },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST ANOMALY DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export function detectInterestAnomaly(
  effectiveRate: number,
  expectedMin: number = 0.05,
  expectedMax: number = 0.60,
): DetectorResult {
  if (effectiveRate >= expectedMin && effectiveRate <= expectedMax) {
    return { detected: false };
  }

  return {
    detected: true,
    warning: {
      code: InterestEngineErrorCode.E_INTEREST_ANOMALY,
      severity: 'WARNING',
      message: `Hesaplanan faiz oranı (%${(effectiveRate * 100).toFixed(2)}) beklenen aralık dışında`,
      suggestion: 'Hesaplamayı manuel doğrulayın',
      evidence: { effectiveRate, expectedMin, expectedMax },
    },
  };
}
