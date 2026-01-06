import { Injectable } from '@nestjs/common';
import { RateScheduleService } from './rate-schedule.service';
import {
  InterestCalculationRequest,
  InterestTypeCode,
  PolicyWarning,
  PolicyValidationResult,
  InterestEngineErrorCodes,
} from './types';
import { CaseType, getInterestStrategy } from './interest-strategy.config';

/**
 * Policy Gate Service
 * 
 * Validates calculation inputs and flags anomalies before processing.
 * Implements all validation rules from Yapılacaklar.txt
 */
@Injectable()
export class PolicyGateService {
  // Expected annual rate bounds for sanity checks
  private readonly MIN_EXPECTED_RATE = 0.05; // 5%
  private readonly MAX_EXPECTED_RATE = 0.60; // 60%
  
  // Long segment warning threshold (days)
  private readonly LONG_SEGMENT_THRESHOLD = 180;

  // Sözleşmesel faiz üst sınırı (kamu düzeni)
  // Yargıtay içtihatlarına göre yasal faizin 2-3 katı makul kabul edilir
  private readonly CONTRACTUAL_RATE_MULTIPLIER = 3;

  constructor(private readonly rateSchedule: RateScheduleService) {}

  /**
   * Validate entire calculation request
   */
  async validate(
    request: InterestCalculationRequest,
    tenantId: string,
  ): Promise<PolicyValidationResult> {
    const warnings: PolicyWarning[] = [];

    for (const item of request.principalItems) {
      // Validate interest type match
      const typeWarnings = this.validateInterestTypeMatch(
        item.interestType,
        'GENERAL', // Would come from case
        false, // Would come from case
      );
      warnings.push(...typeWarnings);

      // Validate rate coverage
      const coverageWarnings = await this.validateRateCoverage(
        item.interestType,
        item.startDate,
        request.asOfDate,
        tenantId,
      );
      warnings.push(...coverageWarnings);

      // Validate day count
      const dayWarnings = this.validateDayCount(item.startDate, request.asOfDate, []);
      warnings.push(...dayWarnings);

      // Validate çek rules if applicable
      if (item.ibrazTarihi || item.vadeTarihi) {
        const cekWarnings = this.validateCekRules(
          item.ibrazTarihi || item.startDate,
          item.vadeTarihi || item.startDate,
        );
        warnings.push(...cekWarnings);
      }

      // Validate contractual interest rate limits
      if (item.interestType === InterestTypeCode.CONTRACTUAL) {
        const contractWarnings = await this.validateContractualRateLimit(
          item.startDate,
          tenantId,
        );
        warnings.push(...contractWarnings);
      }
    }

    const hasErrors = warnings.some((w) => w.severity === 'ERROR');

    return {
      valid: !hasErrors,
      warnings,
      canProceed: !hasErrors,
    };
  }

  /**
   * Validate interest type matches case type
   */
  validateInterestTypeMatch(
    interestType: InterestTypeCode,
    caseType: string,
    isCommercial: boolean,
  ): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];

    // Kambiyo takibi için avans faizi beklenir
    if (
      (caseType === 'KAMBIYO' || caseType === 'KAMBIYO_SENEDI') &&
      interestType !== InterestTypeCode.COMMERCIAL_AVANS_3095_2_2
    ) {
      warnings.push({
        code: InterestEngineErrorCodes.INTEREST_TYPE_MISMATCH,
        severity: 'WARNING',
        message: `Kambiyo takibi için ticari avans faizi (3095/2-2) bekleniyor`,
        suggestion: `Faiz türünü COMMERCIAL_AVANS_3095_2_2 olarak değiştirin`,
        field: 'interestType',
      });
    }

    // Ticari alacak için yasal faiz uyarısı
    if (isCommercial && interestType === InterestTypeCode.LEGAL_3095) {
      warnings.push({
        code: InterestEngineErrorCodes.INTEREST_TYPE_MISMATCH,
        severity: 'INFO',
        message: `Ticari alacak için yasal faiz yerine avans faizi kullanılabilir`,
        suggestion: `Daha yüksek oran için COMMERCIAL_AVANS_3095_2_2 kullanın`,
        field: 'interestType',
      });
    }

    return warnings;
  }

  /**
   * Validate rate coverage for period
   */
  async validateRateCoverage(
    interestType: InterestTypeCode,
    startDate: string,
    endDate: string,
    tenantId: string,
  ): Promise<PolicyWarning[]> {
    const warnings: PolicyWarning[] = [];

    const coverage = await this.rateSchedule.checkRateCoverage(
      interestType,
      startDate,
      endDate,
      tenantId,
    );

    if (!coverage.covered) {
      for (const gap of coverage.gaps) {
        warnings.push({
          code: InterestEngineErrorCodes.RATE_GAP,
          severity: 'ERROR',
          message: `Oran serisi eksik: ${gap.from} - ${gap.to}`,
          suggestion: `Manuel oran girişi yapın veya TCMB senkronizasyonu çalıştırın`,
          field: 'interestType',
        });
      }
    }

    // Single rate warning (değişen oran seçili ama segment sayısı 1)
    if (coverage.covered && coverage.rateCount === 1) {
      const days = Math.floor(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (days > 90) {
        warnings.push({
          code: 'SINGLE_RATE_LONG_PERIOD',
          severity: 'WARNING',
          message: `${days} günlük dönemde tek oran kullanılıyor`,
          suggestion: `Bu dönemde oran değişikliği olup olmadığını kontrol edin`,
          field: 'interestType',
        });
      }
    }

    return warnings;
  }

  /**
   * Validate day count for anomalies
   */
  validateDayCount(
    startDate: string,
    endDate: string,
    rateChangeDates: string[],
  ): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Negative days
    if (days < 0) {
      warnings.push({
        code: InterestEngineErrorCodes.NEGATIVE_DAYS,
        severity: 'ERROR',
        message: `Negatif gün sayısı: ${days}`,
        suggestion: `Başlangıç ve bitiş tarihlerini kontrol edin`,
        field: 'startDate',
      });
    }

    // Zero days
    if (days === 0) {
      warnings.push({
        code: InterestEngineErrorCodes.ZERO_DAYS,
        severity: 'WARNING',
        message: `Sıfır gün faiz hesabı`,
        suggestion: `Tarihler aynı, faiz hesaplanmayacak`,
        field: 'startDate',
      });
    }

    // Long segment without rate changes
    if (days > this.LONG_SEGMENT_THRESHOLD && rateChangeDates.length === 0) {
      warnings.push({
        code: InterestEngineErrorCodes.LONG_SEGMENT,
        severity: 'WARNING',
        message: `Uzun segment (${days} gün) oran değişikliği içerebilir`,
        suggestion: `Oran değişikliklerini kontrol edin`,
        field: 'startDate',
      });
    }

    return warnings;
  }

  /**
   * Validate calculated interest is within expected bounds
   */
  validateSanityCheck(
    principal: number,
    calculatedInterest: number,
    days: number,
    minRate: number,
    maxRate: number,
  ): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];

    if (days <= 0 || principal <= 0) {
      return warnings;
    }

    // Calculate expected range
    const minExpected = (principal * this.MIN_EXPECTED_RATE * days) / 365;
    const maxExpected = (principal * this.MAX_EXPECTED_RATE * days) / 365;

    // Check if calculated interest is way outside expected range
    if (calculatedInterest < minExpected * 0.5 || calculatedInterest > maxExpected * 1.5) {
      warnings.push({
        code: InterestEngineErrorCodes.INTEREST_ANOMALY,
        severity: 'WARNING',
        message: `Hesaplanan faiz beklenen aralık dışında`,
        suggestion: `Hesaplamayı manuel doğrulayın`,
      });
    }

    return warnings;
  }

  /**
   * Validate çek-specific rules
   * İbraz tarihi >= vade tarihi kontrolü
   */
  validateCekRules(ibrazTarihi: string, vadeTarihi: string): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];
    const ibraz = new Date(ibrazTarihi);
    const vade = new Date(vadeTarihi);

    // İbraz tarihi vade tarihinden önce olamaz
    if (ibraz < vade) {
      warnings.push({
        code: InterestEngineErrorCodes.IBRAZ_BEFORE_VADE,
        severity: 'ERROR',
        message: `İbraz tarihi (${ibrazTarihi}) vade tarihinden (${vadeTarihi}) önce olamaz`,
        suggestion: `Çek ibraz tarihi en erken vade tarihinde olabilir. Tarihleri kontrol edin.`,
        field: 'ibrazTarihi',
      });
    }

    return warnings;
  }

  /**
   * Validate contractual interest has evidence
   */
  validateContractualInterest(
    interestType: InterestTypeCode,
    hasContractDocument: boolean,
  ): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];

    if (interestType === InterestTypeCode.CONTRACTUAL && !hasContractDocument) {
      warnings.push({
        code: InterestEngineErrorCodes.CONTRACTUAL_NO_EVIDENCE,
        severity: 'ERROR',
        message: `Sözleşmesel faiz için belge gerekli`,
        suggestion: `Sözleşme belgesi ekleyin`,
        field: 'interestType',
      });
    }

    return warnings;
  }

  /**
   * Validate contractual interest rate is within legal limits
   * Kamu düzeni gereği sözleşmesel faiz yasal faizin belirli katını aşamaz
   */
  async validateContractualRateLimit(
    asOfDate: string,
    tenantId: string,
    contractualRate?: number,
  ): Promise<PolicyWarning[]> {
    const warnings: PolicyWarning[] = [];

    if (!contractualRate) {
      return warnings;
    }

    // Get current legal rate
    const legalRate = await this.rateSchedule.getCurrentRate(
      InterestTypeCode.LEGAL_3095,
      tenantId,
    );

    if (legalRate) {
      const maxAllowedRate = legalRate.annualRate * this.CONTRACTUAL_RATE_MULTIPLIER;

      if (contractualRate > maxAllowedRate) {
        warnings.push({
          code: 'CONTRACTUAL_RATE_EXCESSIVE',
          severity: 'WARNING',
          message: `Sözleşmesel faiz oranı (%${(contractualRate * 100).toFixed(2)}) yasal faizin ${this.CONTRACTUAL_RATE_MULTIPLIER} katını (%${(maxAllowedRate * 100).toFixed(2)}) aşıyor`,
          suggestion: `Yargıtay içtihatlarına göre aşırı yüksek sözleşmesel faiz indirilebilir. Oranı gözden geçirin.`,
          field: 'interestType',
        });
      }
    }

    return warnings;
  }

  /**
   * Validate effective rate matches expected rate
   * Sanity band kontrolü - hesaplanan efektif oran beklenen aralıkta mı?
   */
  validateEffectiveRate(
    principal: number,
    totalInterest: number,
    days: number,
    expectedMinRate: number,
    expectedMaxRate: number,
  ): PolicyWarning[] {
    const warnings: PolicyWarning[] = [];

    if (days <= 0 || principal <= 0) {
      return warnings;
    }

    // Calculate effective annual rate
    const effectiveRate = (totalInterest / principal) * (365 / days);

    // Check if effective rate is outside expected band
    if (effectiveRate < expectedMinRate * 0.9 || effectiveRate > expectedMaxRate * 1.1) {
      warnings.push({
        code: 'EFFECTIVE_RATE_ANOMALY',
        severity: 'WARNING',
        message: `Efektif oran (%${(effectiveRate * 100).toFixed(2)}) beklenen aralık dışında (min: %${(expectedMinRate * 100).toFixed(2)}, max: %${(expectedMaxRate * 100).toFixed(2)})`,
        suggestion: `Oran serisi veya gün sayısı hesaplamasını kontrol edin`,
      });
    }

    return warnings;
  }
}
