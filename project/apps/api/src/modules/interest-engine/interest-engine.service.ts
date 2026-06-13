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
import { ClaimBucket, Segment, AllocationStep, InterestTypeCode } from './types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from './types/common.types';
import { RateEntry, RateSourceType } from './rates/rate-entry.entity';
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
    // D-A PR-2: orkestratör = saf hesap (computeBalance) + audit side-effect (writeAuditRecord).
    // Public imza KORUNUR (controller + testler etkilenmez); side-effect tek noktada izole.
    const result = this.computeBalance(request, rates, new Date().toISOString());
    result.auditLogId = await this.writeAuditRecord(
      request,
      result,
      result.segments,
      result.allocations,
      rates,
      tenantId,
      userId,
    );
    return result;
  }

  /**
   * Saf hesap çekirdeği (D-A PR-2): I/O yok, side-effect yok, deterministik.
   * Aynı (request, rates, now) → aynı CalculationResult (auditLogId='' döner; audit'i calculate() yazar).
   * `now` ENJEKTE edilir (duvar-saati determinizm sızıntısı yok); asOf zaten request.asOfDate'tedir.
   *
   * @remarks
   * Çağrıldığı yerler:
   * - InterestEngineService.calculate() → orkestratör (audit ile).
   * - (gelecek) preview / case_balance_view projection → audit'siz saf hesap (D-E).
   */
  computeBalance(
    request: CalculationRequest,
    rates: RateEntry[],
    now: string,
  ): CalculationResult {
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
      calculatedAt: now,
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

    // computeBalance SAF: audit YAZMAZ; auditLogId='' döner (calculate() orkestratörü doldurur).
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIEW CALCULATION (Phase 3.1 - Tek Kaynak)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Preview hesaplama - aynı matematik, daha az bürokrasi
   * 
   * calculate() ile AYNI:
   * - Rate lookup
   * - Segment builder
   * - Day count
   * - Rounding
   * 
   * calculate() ile FARKLI:
   * - NO audit log
   * - NO execution record
   * - NO hard policy gate (sadece soft warning)
   * 
   * @see docs/single-source-of-truth-architecture.md - Phase 3.1
   */
  async previewCalculation(params: {
    principalAmount: number;
    startDate: string;
    endDate: string;
    interestType: string;
    fixedRate?: number;
    currency?: string;
    dayCountBasis?: number;
  }): Promise<InterestPreviewResult> {
    const { 
      principalAmount, 
      startDate, 
      endDate, 
      interestType, 
      fixedRate,
      currency = 'TRY',
      dayCountBasis = 365,
    } = params;

    const warnings: PreviewWarning[] = [];

    // 1. Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return {
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'startDate must be before endDate',
        },
      };
    }

    // 2. Get rates for period
    const rates = this.getPreviewRates(interestType, currency, startDate, endDate, fixedRate);
    
    if (rates.length === 0) {
      return {
        success: false,
        error: {
          code: 'RATE_NOT_FOUND',
          message: `Rate not found for interest type: ${interestType}`,
        },
      };
    }

    // 3. Build coverage map - GERÇEK coverage analizi
    const coverage = CoverageMapBuilder.build(rates, startDate, endDate);
    
    // Coverage warnings
    if (coverage.gaps.length > 0) {
      warnings.push({
        code: 'RATE_GAP',
        severity: 'warn',
        message: `Oran tablosunda ${coverage.gaps.length} boşluk tespit edildi`,
        evidence: { 
          gaps: coverage.gaps.slice(0, 3), // Max 3 gap göster
          totalGapDays: coverage.gaps.reduce((sum, g) => sum + g.days, 0),
        },
      });
    }
    
    if (coverage.overlaps.length > 0) {
      warnings.push({
        code: 'RATE_OVERLAP',
        severity: 'info',
        message: 'Oran tablosunda çakışma tespit edildi; en yeni kayıt kullanıldı',
        evidence: { overlaps: coverage.overlaps.slice(0, 3) },
      });
    }

    // 4. Build segments using REAL segment builder
    const claimBucket: ClaimBucket = {
      id: 'preview',
      amount: principalAmount,
      currency: currency as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF',
      startDate,
      interestType: interestType as InterestTypeCode,
      dayCountBasis: dayCountBasis as 365 | 360,
      fixedRate: fixedRate !== undefined ? fixedRate / 100 : undefined, // Convert % to decimal
    };

    const segmentResult = this.segmentBuilder.buildSegments(
      claimBucket,
      endDate,
      rates,
      {
        dayCountBasis: dayCountBasis as 365 | 360,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
      },
    );

    // 5. Truncate segments for light preview (max 20)
    const MAX_PREVIEW_SEGMENTS = 20;
    const truncated = segmentResult.segments.length > MAX_PREVIEW_SEGMENTS;
    const previewSegments = segmentResult.segments.slice(0, MAX_PREVIEW_SEGMENTS);
    
    if (truncated) {
      warnings.push({
        code: 'SEGMENTS_TRUNCATED',
        severity: 'info',
        message: `Önizleme segmentleri kısaltıldı (${segmentResult.segments.length} → ${MAX_PREVIEW_SEGMENTS})`,
        evidence: { 
          totalSegments: segmentResult.segments.length,
          returnedSegments: MAX_PREVIEW_SEGMENTS,
        },
      });
    }

    // 6. Calculate average rate (for summary)
    const totalDays = segmentResult.segments.reduce((sum, s) => sum + s.days, 0);
    const weightedRateSum = segmentResult.segments.reduce(
      (sum, s) => sum + (s.rate * s.days), 0
    );
    const avgRate = totalDays > 0 ? (weightedRateSum / totalDays) * 100 : 0;

    // 7. Return enhanced result
    return {
      success: true,
      data: {
        estimatedInterest: segmentResult.totalInterest,
        currentRate: Math.round(avgRate * 100) / 100, // Weighted average
        days: totalDays,
        interestType,
        dayCountBasis,
        formula: `Segment-based calculation (${previewSegments.length} segments)`,
        // Phase 3.1.1: Segment detayları
        preEnforcementInterest: segmentResult.preEnforcementInterest,
        postEnforcementInterest: segmentResult.postEnforcementInterest,
      },
      // Phase 3.1.1: Segments array (truncated)
      segments: previewSegments.map(s => ({
        startDate: s.periodStart,
        endDate: s.periodEnd,
        days: s.days,
        annualRatePct: Math.round(s.rate * 10000) / 100, // Decimal to %
        principal: s.principal,
        interest: s.segmentInterest,
        phase: s.phase,
        rateSource: s.rateSource,
      })),
      segmentsMeta: {
        total: segmentResult.segments.length,
        returned: previewSegments.length,
        truncated,
      },
      // Phase 3.1.1: Coverage info
      coverage: {
        percent: coverage.coveragePercent,
        totalDays: coverage.totalDays,
        coveredDays: coverage.coveredDays,
        hasGaps: coverage.gaps.length > 0,
        hasOverlaps: coverage.overlaps.length > 0,
      },
      // Phase 3.1.1: Warnings
      warnings,
      versions: {
        engineVersion: ENGINE_VERSION,
        ruleVersion: this.versionPinning.getRuleVersion(),
        rateTableVersion: `${new Date().getFullYear()}.01`, // TODO: gerçek version
      },
    };
  }

  /**
   * Preview için rate'leri getir
   * Gerçek rate table'dan okur
   */
  private getPreviewRates(
    interestType: string, 
    currency: string, 
    startDate: string,
    endDate: string,
    fixedRate?: number,
  ): RateEntry[] {
    // Fixed rate için tek entry döndür
    if (fixedRate !== undefined && (
      interestType === 'COMMERCIAL_FIXED' ||
      interestType === 'CONTRACTUAL'
    )) {
      return [{
        id: 'FIXED',
        interestType: interestType as InterestTypeCode,
        validFrom: startDate,
        validTo: endDate,
        annualRate: fixedRate / 100, // % to decimal
        source: RateSourceType.CONTRACT,
        sourceReference: 'Sabit Oran',
        versionHash: 'fixed-rate',
        createdAt: new Date().toISOString(),
      }];
    }

    // Current rates (2025) - gerçek değerler
    // TODO: RateProviderService'den çekilmeli
    const currentRates: Record<string, number> = {
      'LEGAL_3095': 24,
      'COMMERCIAL_AVANS_3095_2_2': 39.75,
      'TTK_1530': 39.75,
      'MEVDUAT_TL_BANKALARCA': 45,
      'MEVDUAT_TL_KAMU': 42,
      'TEFE_TUFE': 50,
      'REESKONT': 35,
    };

    const rate = currentRates[interestType];
    if (rate === undefined) {
      return [];
    }

    return [{
      id: `${interestType}_2025`,
      interestType: interestType as InterestTypeCode,
      validFrom: '2025-01-01',
      validTo: null, // Open-ended
      annualRate: rate / 100, // % to decimal
      source: RateSourceType.TCMB,
      sourceReference: interestType,
      versionHash: `${interestType}-2025-01`,
      createdAt: new Date().toISOString(),
    }];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW TYPES (Phase 3.1.1 Enhanced)
// ═══════════════════════════════════════════════════════════════════════════

export interface PreviewWarning {
  code: string;
  severity: 'info' | 'warn';
  message: string;
  evidence?: Record<string, unknown>;
}

export interface PreviewSegment {
  startDate: string;
  endDate: string;
  days: number;
  annualRatePct: number;
  principal: number;
  interest: number;
  phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
  rateSource?: string;
}

export interface PreviewCoverage {
  percent: number;
  totalDays: number;
  coveredDays: number;
  hasGaps: boolean;
  hasOverlaps: boolean;
}

export interface InterestPreviewResult {
  success: boolean;
  data?: {
    estimatedInterest: number;
    currentRate: number;
    days: number;
    interestType: string;
    dayCountBasis: number;
    formula: string;
    // Phase 3.1.1: Detaylı breakdown
    preEnforcementInterest?: number;
    postEnforcementInterest?: number;
  };
  // Phase 3.1.1: Segment detayları (truncated)
  segments?: PreviewSegment[];
  segmentsMeta?: {
    total: number;
    returned: number;
    truncated: boolean;
  };
  // Phase 3.1.1: Coverage bilgisi
  coverage?: PreviewCoverage;
  // Phase 3.1.1: Warnings
  warnings?: PreviewWarning[];
  error?: {
    code: string;
    message: string;
  };
  versions?: {
    engineVersion: string;
    ruleVersion: string;
    rateTableVersion?: string;
  };
}
