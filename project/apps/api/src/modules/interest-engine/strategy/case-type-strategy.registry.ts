/**
 * Task 2.2 - CaseTypeStrategy Registry
 *
 * Kambiyo/İlamsız/İlamlı/TTK1530 stratejileri
 * Requirements: 2.1-2.6
 */

import { Injectable } from '@nestjs/common';
import {
  CaseType,
  CaseTypeStrategy,
  ClaimBuildConfig,
  RateConfig,
  PolicyConfig,
  CaseMetadata,
} from './case-type-strategy.interface';
import { InterestTypeCode } from '../types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// KAMBIYO SENEDİ STRATEJİSİ
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class KambiyoSenediStrategy implements CaseTypeStrategy {
  readonly name = 'KambiyoSenediStrategy';
  readonly caseType = CaseType.KAMBIYO_SENEDI;
  readonly description = 'Çek, bono, poliçe alacakları için strateji';

  getClaimConfig(): ClaimBuildConfig {
    return {
      defaultInterestStartRule: 'DUE_DATE',
      defaultInterestType: InterestTypeCode.LEGAL_3095,
      allowedAncillaryTypes: ['KOMISYON', 'PROTESTO_MASRAFI'],
      allowedExpenseTypes: ['YARGILAMA', 'VEKALET', 'ICRA_HARCI'],
    };
  }

  getRateConfig(): RateConfig {
    return {
      allowedRateTypes: [
        InterestTypeCode.LEGAL_3095,
        InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
        InterestTypeCode.CONTRACTUAL,
      ],
      defaultRateType: InterestTypeCode.LEGAL_3095,
      maxContractRateMultiplier: 3,
      allowedCurrencies: ['TRY', 'USD', 'EUR'],
    };
  }

  getPolicyConfig(): PolicyConfig {
    return {
      defaultRoundingScope: 'TOTAL_ONLY',
      defaultRoundingMode: 'HALF_UP',
      defaultClaimPriorityRule: 'OLDEST_DUE_FIRST',
      sameDayPaymentRule: 'START_OF_DAY',
      gapPolicy: 'BLOCK',
    };
  }

  isApplicable(metadata: CaseMetadata): boolean {
    if (metadata.caseType === CaseType.KAMBIYO_SENEDI) return true;
    if (['CEK', 'BONO', 'POLICE'].includes(metadata.claimType || '')) return true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// İLAMSIZ GENEL STRATEJİSİ
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class IlamsizGenelStrategy implements CaseTypeStrategy {
  readonly name = 'IlamsizGenelStrategy';
  readonly caseType = CaseType.ILAMSIZ_GENEL;
  readonly description = 'Genel haciz yolu ile ilamsız icra';

  getClaimConfig(): ClaimBuildConfig {
    return {
      defaultInterestStartRule: 'DEMAND_DATE',
      defaultInterestType: InterestTypeCode.LEGAL_3095,
      allowedAncillaryTypes: ['GECIKME_ZAMMI'],
      allowedExpenseTypes: ['YARGILAMA', 'VEKALET', 'ICRA_HARCI', 'TEBLIGAT'],
    };
  }

  getRateConfig(): RateConfig {
    return {
      allowedRateTypes: [
        InterestTypeCode.LEGAL_3095,
        InterestTypeCode.CONTRACTUAL,
      ],
      defaultRateType: InterestTypeCode.LEGAL_3095,
      maxContractRateMultiplier: 2,
      allowedCurrencies: ['TRY'],
    };
  }

  getPolicyConfig(): PolicyConfig {
    return {
      defaultRoundingScope: 'TOTAL_ONLY',
      defaultRoundingMode: 'HALF_UP',
      defaultClaimPriorityRule: 'OLDEST_DUE_FIRST',
      sameDayPaymentRule: 'START_OF_DAY',
      gapPolicy: 'WARN',
    };
  }

  isApplicable(metadata: CaseMetadata): boolean {
    return metadata.caseType === CaseType.ILAMSIZ_GENEL;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// İLAMLI STRATEJİSİ
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class IlamliStrategy implements CaseTypeStrategy {
  readonly name = 'IlamliStrategy';
  readonly caseType = CaseType.ILAMLI;
  readonly description = 'İlamlı icra takibi';

  getClaimConfig(): ClaimBuildConfig {
    return {
      defaultInterestStartRule: 'DUE_DATE',
      defaultInterestType: InterestTypeCode.LEGAL_3095,
      allowedAncillaryTypes: [],
      allowedExpenseTypes: ['YARGILAMA', 'VEKALET', 'ICRA_HARCI'],
    };
  }

  getRateConfig(): RateConfig {
    return {
      allowedRateTypes: [
        InterestTypeCode.LEGAL_3095,
        InterestTypeCode.CONTRACTUAL,
      ],
      defaultRateType: InterestTypeCode.LEGAL_3095,
      maxContractRateMultiplier: 2,
      allowedCurrencies: ['TRY', 'USD', 'EUR'],
    };
  }

  getPolicyConfig(): PolicyConfig {
    return {
      defaultRoundingScope: 'TOTAL_ONLY',
      defaultRoundingMode: 'HALF_UP',
      defaultClaimPriorityRule: 'OLDEST_DUE_FIRST',
      sameDayPaymentRule: 'START_OF_DAY',
      gapPolicy: 'BLOCK',
    };
  }

  isApplicable(metadata: CaseMetadata): boolean {
    return metadata.caseType === CaseType.ILAMLI;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TTK 1530 STRATEJİSİ
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class TTK1530Strategy implements CaseTypeStrategy {
  readonly name = 'TTK1530Strategy';
  readonly caseType = CaseType.TTK_1530;
  readonly description = 'Ticari işlerde temerrüt faizi (TTK m.1530)';

  getClaimConfig(): ClaimBuildConfig {
    return {
      defaultInterestStartRule: 'DUE_DATE_OR_30D',
      defaultInterestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      allowedAncillaryTypes: ['GECIKME_TAZMINATI'],
      allowedExpenseTypes: ['YARGILAMA', 'VEKALET', 'ICRA_HARCI'],
    };
  }

  getRateConfig(): RateConfig {
    return {
      allowedRateTypes: [
        InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
        InterestTypeCode.LEGAL_3095,
        InterestTypeCode.CONTRACTUAL,
      ],
      defaultRateType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      maxContractRateMultiplier: 3,
      allowedCurrencies: ['TRY', 'USD', 'EUR'],
    };
  }

  getPolicyConfig(): PolicyConfig {
    return {
      defaultRoundingScope: 'TOTAL_ONLY',
      defaultRoundingMode: 'HALF_UP',
      defaultClaimPriorityRule: 'HIGHEST_RATE_FIRST',
      sameDayPaymentRule: 'START_OF_DAY',
      gapPolicy: 'BLOCK',
    };
  }

  isApplicable(metadata: CaseMetadata): boolean {
    if (metadata.caseType === CaseType.TTK_1530) return true;
    if (metadata.isCommercial === true) return true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KİRA ALACAĞI STRATEJİSİ
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class KiraAlacagiStrategy implements CaseTypeStrategy {
  readonly name = 'KiraAlacagiStrategy';
  readonly caseType = CaseType.KIRA_ALACAGI;
  readonly description = 'Kira alacağı takibi';

  getClaimConfig(): ClaimBuildConfig {
    return {
      defaultInterestStartRule: 'DUE_DATE',
      defaultInterestType: InterestTypeCode.LEGAL_3095,
      allowedAncillaryTypes: ['GECIKME_TAZMINATI'],
      allowedExpenseTypes: ['YARGILAMA', 'VEKALET', 'ICRA_HARCI', 'TAHLIYE'],
    };
  }

  getRateConfig(): RateConfig {
    return {
      allowedRateTypes: [
        InterestTypeCode.LEGAL_3095,
        InterestTypeCode.CONTRACTUAL,
      ],
      defaultRateType: InterestTypeCode.LEGAL_3095,
      maxContractRateMultiplier: 1.5,
      allowedCurrencies: ['TRY'],
    };
  }

  getPolicyConfig(): PolicyConfig {
    return {
      defaultRoundingScope: 'TOTAL_ONLY',
      defaultRoundingMode: 'HALF_UP',
      defaultClaimPriorityRule: 'OLDEST_DUE_FIRST',
      sameDayPaymentRule: 'START_OF_DAY',
      gapPolicy: 'WARN',
    };
  }

  isApplicable(metadata: CaseMetadata): boolean {
    return metadata.caseType === CaseType.KIRA_ALACAGI;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class CaseTypeStrategyRegistry {
  private readonly strategies: Map<CaseType, CaseTypeStrategy> = new Map();

  constructor() {
    // Register all strategies
    this.register(new KambiyoSenediStrategy());
    this.register(new IlamsizGenelStrategy());
    this.register(new IlamliStrategy());
    this.register(new TTK1530Strategy());
    this.register(new KiraAlacagiStrategy());
  }

  register(strategy: CaseTypeStrategy): void {
    this.strategies.set(strategy.caseType, strategy);
  }

  get(caseType: CaseType): CaseTypeStrategy | undefined {
    return this.strategies.get(caseType);
  }

  getAll(): CaseTypeStrategy[] {
    return Array.from(this.strategies.values());
  }

  has(caseType: CaseType): boolean {
    return this.strategies.has(caseType);
  }
}
