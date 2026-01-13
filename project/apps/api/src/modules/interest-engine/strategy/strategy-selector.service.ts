/**
 * Task 2.3 - Strategy Selector Service
 *
 * Case metadata'dan strateji seçimi
 * Requirements: 2.7, 2.8
 */

import { Injectable } from '@nestjs/common';
import {
  CaseType,
  CaseTypeStrategy,
  CaseMetadata,
} from './case-type-strategy.interface';
import { CaseTypeStrategyRegistry } from './case-type-strategy.registry';
import { InterestEngineError, InterestEngineErrorCode } from '../errors/interest-engine-errors';

@Injectable()
export class StrategySelectorService {
  constructor(private readonly registry: CaseTypeStrategyRegistry) {}

  /**
   * Metadata'dan uygun stratejiyi seç
   */
  selectStrategy(metadata: CaseMetadata): CaseTypeStrategy {
    // 1. Explicit caseType varsa direkt kullan
    if (metadata.caseType) {
      const strategy = this.registry.get(metadata.caseType);
      if (strategy) {
        return strategy;
      }
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        `Unknown case type: ${metadata.caseType}`,
        { missingFields: ['caseType'], providedValue: metadata.caseType },
      );
    }

    // 2. Metadata'dan strateji çıkarımı yap
    const inferred = this.inferStrategy(metadata);
    if (inferred) {
      return inferred;
    }

    // 3. Varsayılan strateji (İlamsız Genel)
    const defaultStrategy = this.registry.get(CaseType.ILAMSIZ_GENEL);
    if (defaultStrategy) {
      return defaultStrategy;
    }

    throw new InterestEngineError(
      InterestEngineErrorCode.E_MISSING_REQUIRED,
      'Could not determine case type strategy',
      { missingFields: ['caseType'], metadata },
    );
  }

  /**
   * Metadata'dan strateji çıkarımı
   */
  private inferStrategy(metadata: CaseMetadata): CaseTypeStrategy | null {
    const strategies = this.registry.getAll();

    // Her stratejiyi kontrol et
    for (const strategy of strategies) {
      if (strategy.isApplicable(metadata)) {
        return strategy;
      }
    }

    return null;
  }

  /**
   * Belirli bir case type için strateji al
   */
  getStrategy(caseType: CaseType): CaseTypeStrategy {
    const strategy = this.registry.get(caseType);
    if (!strategy) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        `No strategy registered for case type: ${caseType}`,
        { missingFields: ['caseType'], providedValue: caseType },
      );
    }
    return strategy;
  }

  /**
   * Tüm kayıtlı stratejileri listele
   */
  listStrategies(): Array<{ caseType: CaseType; name: string; description: string }> {
    return this.registry.getAll().map((s) => ({
      caseType: s.caseType,
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Metadata'yı validate et
   */
  validateMetadata(metadata: CaseMetadata): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // caseType varsa geçerli mi kontrol et
    if (metadata.caseType && !this.registry.has(metadata.caseType)) {
      errors.push(`Invalid case type: ${metadata.caseType}`);
    }

    // Currency kontrolü
    if (metadata.currency) {
      const validCurrencies = ['TRY', 'USD', 'EUR', 'GBP'];
      if (!validCurrencies.includes(metadata.currency)) {
        errors.push(`Invalid currency: ${metadata.currency}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
