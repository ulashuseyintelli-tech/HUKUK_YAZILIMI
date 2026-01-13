/**
 * Task 13.1 - Interest Engine Main Service (Orchestration)
 * 
 * calculate() metodu: strategy → rate → segments → policy → allocation → report → audit
 * 
 * Pipeline:
 * 1. Validate input
 * 2. Select strategy based on case type
 * 3. Get rates for period (using strategy config)
 * 4. Policy Gate validation (using strategy config)
 * 5. Build segments
 * 6. Allocate payments (if any)
 * 7. Generate report
 * 8. Write audit record
 */

import { Injectable, Optional } from '@nestjs/common';
import { 
  CalculationRequest, 
  CalculationResult, 
  generateInputHash,
} from './types/calculation.types';
import { ClaimBucket, Segment, AllocationStep } from './types/domain.types';
import { CalculationMode } from './types/common.types';
import { RateEntry } from './rates/rate-entry.entity';
import { CoverageMapBuilder } from './rates/coverage-map.builder';
import { generateRateTableVersion } from './rates/rate-version-hash';
import { PolicyGateV2Service } from './policy-gate/policy-gate-v2.service';
import { SegmentBuilderService, SegmentBuildResult } from './segments/segment-builder.service';
import { 
  AllocationEngineService, 
  AllocationOptions,
  ClaimDebtState,
} from './allocation/allocation-engine.service';
import { ClaimPriorityRule } from './allocation/claim-priority.service';
import { LegalReportRendererService } from './reporter/legal-report-renderer.service';
import { AuditWriterService } from './audit/audit-writer.service';
import { InterestEngineError, InterestEngineErrorCode } from './errors/interest-engine-errors';
import { VersionPinningService } from './version/version-pinning.service';
import { StrategySelectorService } from './strategy/strategy-selector.service';
import { CaseTypeStrategy, CaseMetadata } from './strategy/case-type-strategy.interface';

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE VERSION
// ═══════════════════════════════════════════════════════════════════════════

export const ENGINE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST ENGINE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class InterestEngineService {
  constructor(
    private readonly policyGate: PolicyGateV2Service,
    private readonly segmentBuilder: SegmentBuilderService,
    private readonly allocationEngine: AllocationEngineService,
    private readonly reportRenderer: LegalReportRendererService,
    private readonly auditWriter: AuditWriterService,
    private readonly versionPinning: VersionPinningService,
    @Optional() private readonly strategySelector?: StrategySelectorService,
  ) {}

  /**
   * Main calculation entry point
   * 
   * Pipeline:
   * 1. Validate input & generate hash
   * 2. Select strategy based on case metadata
   * 3. Get rates for period (using strategy config)
   * 4. Policy Gate validation (using strategy config)
   * 5. Build segments for each claim
   * 6. Allocate payments (if any)
   * 7. Generate result
   * 8. Write audit record
   */
  async calculate(
    request: CalculationRequest,
    rates: RateEntry[],
    tenantId: string,
    userId?: string,
  ): Promise<CalculationResult> {
    // 1. Validate input & generate hash
    this.validateRequest(request);
    const inputHash = generateInputHash(request);

    // 2. Select strategy based on case metadata (if strategy selector available)
    const strategy = this.selectStrategy(request);
    const strategyConfig = strategy ? {
      rateConfig: strategy.getRateConfig(),
      policyConfig: strategy.getPolicyConfig(),
      claimConfig: strategy.getClaimConfig(),
    } : null;

    // 3. Apply strategy defaults to request options (if not explicitly set)
    const effectiveOptions = this.applyStrategyDefaults(request.options, strategyConfig);

    // 4. Build coverage map
    const coverageMap = CoverageMapBuilder.build(
      rates,
      request.claimBuckets[0].startDate,
      request.asOfDate,
    );

    // 5. Generate rate table version hash
    const rateTableVersion = generateRateTableVersion(rates);

    // 6. Version pinning
    const versions = this.versionPinning.enforceVersionPinning(
      request.mode,
      {},
      rateTableVersion,
    );

    // 7. Policy Gate validation (using strategy config for gap policy)
    const policyResult = this.policyGate.validate(
      { ...request, options: effectiveOptions },
      coverageMap,
    );

    // Check if blocked
    if (!policyResult.canProceed) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_RATE_GAP,
        'Hesaplama politika kuralları nedeniyle engellendi',
        { 
          gaps: coverageMap.gaps,
          blockedBy: policyResult.blockedBy,
        },
      );
    }

    // 8. Build segments for each claim
    const segmentResults = this.buildAllSegments(request, rates, effectiveOptions);

    // 9. Allocate payments (if any)
    let allocationResult: { steps: AllocationStep[]; finalDebtStates: ClaimDebtState[] } | undefined;
    if (request.payments && request.payments.length > 0) {
      allocationResult = this.allocatePayments(request, segmentResults, effectiveOptions);
    }

    // 10. Calculate totals
    const { totalInterest, preEnforcementInterest, postEnforcementInterest } = 
      this.calculateTotals(segmentResults);

    const allSegments = this.collectAllSegments(segmentResults);
    const totalDue = this.calculateTotalDue(request.claimBuckets, totalInterest, allocationResult);

    // 11. Generate result
    const result: CalculationResult = {
      caseId: request.caseId,
      calculatedAt: new Date().toISOString(),
      asOfDate: request.asOfDate,
      totalInterest,
      totalDue,
      preEnforcementInterest,
      postEnforcementInterest,
      segments: allSegments,
      allocations: allocationResult?.steps,
      policyWarnings: policyResult.warnings,
      legalText: this.generateLegalText(request, allSegments),
      interestType: request.claimBuckets[0].interestType,
      auditLogId: '', // Will be set after audit write
      inputHash,
      rateTableVersion: versions.rateTableVersion,
      engineVersion: versions.engineVersion,
      ruleVersion: versions.ruleVersion,
      dayCountRule: `Actual/${effectiveOptions.dayCountBasis}`,
      sameDayPaymentRule: effectiveOptions.sameDayPaymentRule,
      roundingMode: effectiveOptions.roundingMode,
      roundingScope: effectiveOptions.roundingScope,
      gapPolicy: effectiveOptions.gapPolicy,
      claimPriorityRule: effectiveOptions.claimPriorityRule,
      // Strategy info (if used)
      strategyUsed: strategy?.name,
    };

    // 12. Write audit record
    const auditLogId = await this.writeAuditRecord(
      request,
      result,
      allSegments,
      allocationResult?.steps,
      rates,
      tenantId,
      userId,
    );
    result.auditLogId = auditLogId;

    return result;
  }

  /**
   * Select strategy based on case metadata
   */
  private selectStrategy(request: CalculationRequest): CaseTypeStrategy | null {
    if (!this.strategySelector) {
      return null;
    }

    const metadata: CaseMetadata = {
      caseType: request.caseType,
      claimType: request.claimBuckets[0]?.claimType,
      isCommercial: request.isCommercial,
      currency: request.claimBuckets[0]?.currency,
    };

    try {
      return this.strategySelector.selectStrategy(metadata);
    } catch {
      // If strategy selection fails, continue without strategy
      return null;
    }
  }

  /**
   * Apply strategy defaults to request options
   */
  private applyStrategyDefaults(
    options: CalculationRequest['options'],
    strategyConfig: {
      rateConfig: ReturnType<CaseTypeStrategy['getRateConfig']>;
      policyConfig: ReturnType<CaseTypeStrategy['getPolicyConfig']>;
      claimConfig: ReturnType<CaseTypeStrategy['getClaimConfig']>;
    } | null,
  ): CalculationRequest['options'] {
    if (!strategyConfig) {
      return options;
    }

    const { policyConfig } = strategyConfig;

    return {
      ...options,
      // Apply strategy defaults only if not explicitly set
      roundingScope: options.roundingScope || policyConfig.defaultRoundingScope as 'TOTAL_ONLY' | 'PER_SEGMENT',
      roundingMode: options.roundingMode || policyConfig.defaultRoundingMode as 'HALF_UP' | 'FLOOR' | 'CEIL',
      claimPriorityRule: options.claimPriorityRule || policyConfig.defaultClaimPriorityRule as ClaimPriorityRule,
      sameDayPaymentRule: options.sameDayPaymentRule || policyConfig.sameDayPaymentRule as 'START_OF_DAY' | 'END_OF_DAY',
      gapPolicy: options.gapPolicy || policyConfig.gapPolicy as 'BLOCK' | 'WARN' | 'IGNORE',
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private validateRequest(request: CalculationRequest): void {
    if (!request.caseId) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        'Dosya numarası zorunludur',
        { missingFields: ['caseId'] },
      );
    }

    if (!request.claimBuckets || request.claimBuckets.length === 0) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        'En az bir alacak kalemi zorunludur',
        { missingFields: ['claimBuckets'] },
      );
    }

    if (!request.asOfDate) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        'Hesap tarihi zorunludur',
        { missingFields: ['asOfDate'] },
      );
    }
  }

  private buildAllSegments(
    request: CalculationRequest,
    rates: RateEntry[],
    effectiveOptions: CalculationRequest['options'],
  ): Map<string, SegmentBuildResult> {
    const results = new Map<string, SegmentBuildResult>();

    for (const claim of request.claimBuckets) {
      const result = this.segmentBuilder.buildSegments(
        claim,
        request.asOfDate,
        rates,
        {
          enforcementDate: request.enforcementDate,
          paymentDates: request.payments?.map(p => p.date),
          dayCountBasis: effectiveOptions.dayCountBasis,
          roundingMode: effectiveOptions.roundingMode,
          roundingScope: effectiveOptions.roundingScope,
          sameDayPaymentRule: effectiveOptions.sameDayPaymentRule,
        },
      );
      results.set(claim.id, result);
    }

    return results;
  }

  private allocatePayments(
    request: CalculationRequest,
    segmentResults: Map<string, SegmentBuildResult>,
    effectiveOptions: CalculationRequest['options'],
  ): { steps: AllocationStep[]; finalDebtStates: ClaimDebtState[] } {
    const initialSegments = new Map<string, Segment[]>();
    for (const [claimId, result] of segmentResults) {
      initialSegments.set(claimId, result.segments);
    }

    const allocationOptions: AllocationOptions = {
      claimPriorityRule: effectiveOptions.claimPriorityRule || ClaimPriorityRule.OLDEST_DUE_FIRST,
      ancillaryPriority: effectiveOptions.ancillaryPriority,
    };

    const result = this.allocationEngine.allocateMultiplePayments(
      request.payments!,
      request.claimBuckets,
      initialSegments,
      allocationOptions,
    );

    return {
      steps: result.steps,
      finalDebtStates: result.finalDebtStates,
    };
  }

  private calculateTotals(
    segmentResults: Map<string, SegmentBuildResult>,
  ): { totalInterest: number; preEnforcementInterest: number; postEnforcementInterest: number } {
    let totalInterest = 0;
    let preEnforcementInterest = 0;
    let postEnforcementInterest = 0;

    for (const result of segmentResults.values()) {
      totalInterest += result.totalInterest;
      preEnforcementInterest += result.preEnforcementInterest;
      postEnforcementInterest += result.postEnforcementInterest;
    }

    return { totalInterest, preEnforcementInterest, postEnforcementInterest };
  }

  private collectAllSegments(segmentResults: Map<string, SegmentBuildResult>): Segment[] {
    const allSegments: Segment[] = [];
    for (const result of segmentResults.values()) {
      allSegments.push(...result.segments);
    }
    return allSegments;
  }

  private calculateTotalDue(
    claims: ClaimBucket[],
    totalInterest: number,
    allocationResult?: { steps: AllocationStep[]; finalDebtStates: ClaimDebtState[] },
  ): number {
    const totalPrincipal = claims.reduce((sum, c) => sum + c.amount, 0);
    
    if (allocationResult) {
      // Calculate remaining debt after allocations
      let remainingPrincipal = 0;
      let remainingInterest = 0;
      
      for (const state of allocationResult.finalDebtStates) {
        remainingPrincipal += state.debtState.principal;
        remainingInterest += state.debtState.accruedInterest;
      }
      
      return remainingPrincipal + remainingInterest;
    }
    
    return totalPrincipal + totalInterest;
  }

  private generateLegalText(request: CalculationRequest, segments: Segment[]): string {
    const rates = [...new Set(segments.map(s => ({ rate: s.rate, source: s.rateSource })))];
    
    return `${request.claimBuckets[0].interestType} uyarınca hesaplanan faiz. ` +
      `Uygulanan oranlar: ${rates.map(r => `%${(r.rate * 100).toFixed(2)}`).join(', ')}. ` +
      `Gün sayımı: Actual/${request.options.dayCountBasis}.`;
  }

  private async writeAuditRecord(
    request: CalculationRequest,
    result: CalculationResult,
    segments: Segment[],
    allocations: AllocationStep[] | undefined,
    rates: RateEntry[],
    tenantId: string,
    userId?: string,
  ): Promise<string> {
    // Write main record
    const recordId = await this.auditWriter.writeRecord({
      caseId: request.caseId,
      inputHash: result.inputHash,
      request: request as unknown as Record<string, unknown>,
      totalInterest: result.totalInterest,
      totalDue: result.totalDue,
      segmentCount: segments.length,
      warningCount: result.policyWarnings.length,
      rateTableVersion: result.rateTableVersion,
      engineVersion: result.engineVersion,
      ruleVersion: result.ruleVersion,
      mode: request.mode,
      calculatedAt: result.calculatedAt,
    }, tenantId, userId);

    // Write trace for LEGAL_REPORT mode
    if (request.mode === CalculationMode.LEGAL_REPORT) {
      await this.auditWriter.writeTrace(
        recordId,
        segments,
        allocations,
        rates,
      );
    }

    return recordId;
  }
}
