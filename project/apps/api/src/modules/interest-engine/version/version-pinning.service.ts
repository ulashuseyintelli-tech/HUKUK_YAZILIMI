/**
 * Task 17.2 - Version Pinning Enforcement
 * 
 * Kurallar:
 * - PRODUCTION / LEGAL_REPORT: version pin yok → ERROR
 * - PREVIEW: pin opsiyonel
 * - Pinlenen version: RateVersion hash, Policy version, Rounding config
 */

import { Injectable } from '@nestjs/common';
import { CalculationMode } from '../types/common.types';
import { VersionPinning } from '../types/calculation.types';
import { InterestEngineError } from '../errors/interest-engine-errors';

// Engine version - semantic versioning
export const ENGINE_VERSION = '2.0.0';

// Rule version - strategy config hash
export const RULE_VERSION = 'v2-2026-01';

export interface VersionContext {
  rateTableVersion?: string;
  engineVersion?: string;
  ruleVersion?: string;
}

@Injectable()
export class VersionPinningService {
  /**
   * Enforce version pinning based on calculation mode
   * 
   * PREVIEW: opsiyonel
   * PRODUCTION/LEGAL_REPORT: zorunlu
   */
  enforceVersionPinning(
    mode: CalculationMode,
    versions: VersionContext,
    currentRateTableVersion: string,
  ): VersionPinning {
    // PREVIEW modunda pinning opsiyonel
    if (mode === CalculationMode.PREVIEW) {
      return this.createPinning(versions, currentRateTableVersion, true);
    }

    // PRODUCTION ve LEGAL_REPORT'ta zorunlu kontrol
    const missingVersions: string[] = [];

    // Rate table version kontrolü - otomatik pinleme yapılacak
    const rateTableVersion = versions.rateTableVersion || currentRateTableVersion;
    
    // Engine version kontrolü
    const engineVersion = versions.engineVersion || ENGINE_VERSION;
    
    // Rule version kontrolü
    const ruleVersion = versions.ruleVersion || RULE_VERSION;

    // Eğer hiçbir version sağlanmadıysa ve current da yoksa hata
    if (!rateTableVersion) {
      missingVersions.push('rateTableVersion');
    }

    if (missingVersions.length > 0) {
      throw InterestEngineError.versionNotPinned(mode, missingVersions);
    }

    return this.createPinning(
      { rateTableVersion, engineVersion, ruleVersion },
      currentRateTableVersion,
      !versions.rateTableVersion, // autoPinned if not provided
    );
  }

  /**
   * Create version pinning object
   */
  private createPinning(
    versions: VersionContext,
    currentRateTableVersion: string,
    autoPinned: boolean,
  ): VersionPinning {
    return {
      rateTableVersion: versions.rateTableVersion || currentRateTableVersion,
      engineVersion: versions.engineVersion || ENGINE_VERSION,
      ruleVersion: versions.ruleVersion || RULE_VERSION,
      autoPinned,
      pinnedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate that versions match for reproducibility
   */
  validateVersionMatch(
    expected: VersionPinning,
    actual: VersionContext,
  ): boolean {
    return (
      expected.rateTableVersion === actual.rateTableVersion &&
      expected.engineVersion === actual.engineVersion &&
      expected.ruleVersion === actual.ruleVersion
    );
  }

  /**
   * Get current engine version
   */
  getEngineVersion(): string {
    return ENGINE_VERSION;
  }

  /**
   * Get current rule version
   */
  getRuleVersion(): string {
    return RULE_VERSION;
  }
}
