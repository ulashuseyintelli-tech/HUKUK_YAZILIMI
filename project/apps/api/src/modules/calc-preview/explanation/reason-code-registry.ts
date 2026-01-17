/**
 * Phase 6A - Reason Code Registry
 * 
 * Static mapping of reason codes to human-readable explanations.
 * Runtime'da değişmez - yeni kod eklemek için bu dosyayı güncelle.
 * 
 * @see .kiro/specs/explainable-policy-preview/requirements.md - Requirement 2
 */

import { Injectable } from '@nestjs/common';
import { ReasonCodeEntry, ExplanationSeverity } from './explanation.types';

// ============================================================================
// MVP REASON CODES (Requirement 2.3)
// ============================================================================

/**
 * MVP için minimum reason code seti.
 * Her kod:
 * - Unique identifier
 * - i18n key (future)
 * - Turkish message
 * - Severity
 * - Suggested action
 * - Source rule (optional)
 */
export const MVP_REASON_CODES: ReasonCodeEntry[] = [
  // ERROR severity codes
  {
    code: 'STATUTE_OF_LIMITATIONS',
    messageKey: 'policy.statute_of_limitations',
    messageTr: 'Zamanaşımı süresi dolmuş olabilir. Alacağın zamanaşımı durumunu kontrol edin.',
    severity: 'ERROR',
    suggestedAction: 'Zamanaşımı süresini hesaplayın veya hukuki danışmanlık alın.',
    sourceRule: 'TBK m.146-161',
  },
  {
    code: 'INVALID_CLAIM_TYPE',
    messageKey: 'policy.invalid_claim_type',
    messageTr: 'Seçilen alacak türü bu işlem için geçerli değil.',
    severity: 'ERROR',
    suggestedAction: 'Alacak türünü kontrol edin ve uygun türü seçin.',
    sourceRule: 'ClaimTypeValidator',
  },
  {
    code: 'AMOUNT_EXCEEDS_LIMIT',
    messageKey: 'policy.amount_exceeds_limit',
    messageTr: 'Talep edilen tutar izin verilen üst limiti aşıyor.',
    severity: 'ERROR',
    suggestedAction: 'Tutarı kontrol edin veya birden fazla takip açmayı değerlendirin.',
    sourceRule: 'AmountLimitValidator',
  },
  {
    code: 'MISSING_REQUIRED_FIELD',
    messageKey: 'policy.missing_required_field',
    messageTr: 'Zorunlu alanlardan biri eksik.',
    severity: 'ERROR',
    suggestedAction: 'Tüm zorunlu alanları doldurun.',
    sourceRule: 'RequiredFieldValidator',
  },
  {
    code: 'DATE_RANGE_INVALID',
    messageKey: 'policy.date_range_invalid',
    messageTr: 'Tarih aralığı geçersiz. Başlangıç tarihi bitiş tarihinden sonra olamaz.',
    severity: 'ERROR',
    suggestedAction: 'Tarihleri kontrol edin ve düzeltin.',
    sourceRule: 'DateRangeValidator',
  },
  
  // WARNING severity codes
  {
    code: 'HIGH_INTEREST_RATE_WARNING',
    messageKey: 'policy.high_interest_rate',
    messageTr: 'Hesaplanan faiz oranı normalden yüksek görünüyor.',
    severity: 'WARNING',
    suggestedAction: 'Faiz türünü ve oranını doğrulayın.',
    sourceRule: 'InterestRateValidator',
  },
  {
    code: 'LONG_INTEREST_PERIOD',
    messageKey: 'policy.long_interest_period',
    messageTr: 'Faiz süresi uzun. Zamanaşımı durumunu kontrol edin.',
    severity: 'WARNING',
    suggestedAction: 'Zamanaşımı süresini hesaplayın.',
    sourceRule: 'InterestPeriodValidator',
  },
  {
    code: 'HIGH_FEE_RATIO',
    messageKey: 'policy.high_fee_ratio',
    messageTr: 'Masraflar anaparaya oranla yüksek görünüyor.',
    severity: 'WARNING',
    suggestedAction: 'Düşük tutarlı takiplerde masraf oranı yüksek olabilir.',
    sourceRule: 'FeeRatioValidator',
  },
  
  // INFO severity codes
  {
    code: 'DEBTOR_COUNT_WARNING',
    messageKey: 'policy.debtor_count',
    messageTr: 'Borçlu sayısı yüksek. Harç hesaplaması etkilenebilir.',
    severity: 'INFO',
    suggestedAction: 'Harç tutarını kontrol edin.',
    sourceRule: 'DebtorCountValidator',
  },
  {
    code: 'MIN_TAKIP_TUTARI',
    messageKey: 'policy.min_takip_tutari',
    messageTr: 'Takip tutarı minimum tutarın altında.',
    severity: 'INFO',
    suggestedAction: 'Düşük tutarlı takipler için masraf/getiri oranını değerlendirin.',
    sourceRule: 'MinAmountValidator',
  },
];

// ============================================================================
// REASON CODE REGISTRY SERVICE (Requirement 2.1)
// ============================================================================

@Injectable()
export class ReasonCodeRegistry {
  private readonly registry: Map<string, ReasonCodeEntry>;

  constructor() {
    this.registry = new Map(MVP_REASON_CODES.map(entry => [entry.code, entry]));
  }

  /**
   * Get reason code entry by code.
   * Returns undefined if code not found.
   */
  get(code: string): ReasonCodeEntry | undefined {
    return this.registry.get(code);
  }

  /**
   * Check if code exists in registry.
   */
  has(code: string): boolean {
    return this.registry.has(code);
  }

  /**
   * Get all registered codes.
   */
  getAllCodes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get all entries.
   */
  getAllEntries(): ReasonCodeEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get codes by severity.
   */
  getCodesBySeverity(severity: ExplanationSeverity): string[] {
    return Array.from(this.registry.values())
      .filter(entry => entry.severity === severity)
      .map(entry => entry.code);
  }

  /**
   * Get registry size.
   */
  get size(): number {
    return this.registry.size;
  }
}
