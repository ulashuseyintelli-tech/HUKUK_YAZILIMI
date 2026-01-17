/**
 * Calc Preview Service
 * 
 * Unified preview orchestrator - interest + fee + policy hesaplamalarını
 * TEK trace içinde koordine eder.
 * 
 * Phase 3.1: GERÇEK engine'lere bağlı
 * - InterestEngineService.previewCalculation() kullanır
 * - FeeEngineService.previewCalculation() kullanır
 * - Kendi hesaplama YAPMAZ, sadece orchestrate eder
 * 
 * Phase 4.1: Metrics + Alerting
 * - Latency tracking (p50, p95, p99)
 * - Success rate / Error taxonomy
 * - Fallback rate monitoring
 * - Dependency latency
 * 
 * Phase 5.1: Trace Bundle
 * - TraceContext per request
 * - Dependency call tracking
 * - Cache hit/miss tracking
 * - Circuit breaker state tracking
 * - Evidence collection
 * 
 * Phase 6A: Explainable Policy Preview
 * - ExplanationService integration
 * - Policy explanations in response
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5
 * @see .kiro/specs/explainable-policy-preview - Phase 6A
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { createHash } from 'crypto';
import {
  CalcPreviewRequest,
  CalcPreviewResponse,
  CalcPreviewStatus,
  CalcPreviewError,
  CalcPreviewWarning,
  CalcPreviewVersions,
  InterestPreviewData,
  FeePreviewData,
  PolicyPreviewData,
  PolicySoftWarning,
  UxGuidance,
} from './types';
import { InterestEngineService } from '../interest-engine/interest-engine.service';
import { FeeEngineService } from '../fee-engine/fee-engine.service';
import { CalcPreviewMetricsService } from './metrics/calc-preview-metrics.service';
import { CalcPreviewCircuitBreakerService } from './circuit-breaker';
import { TraceCollectorService, TraceContext, RequestWithTrace } from './trace';
import { ExplanationService } from './explanation';

// ============================================================================
// VERSION CONSTANTS - Tek kaynak
// ============================================================================
const ENGINE_VERSION = '1.0.0';
const RULE_VERSION = '2025.01';
const POLICY_VERSION = '2025.01';

// ============================================================================
// CACHE (Version-Pinned)
// ============================================================================
interface CacheEntry {
  response: CalcPreviewResponse;
  expiresAt: number;
  versions: CalcPreviewVersions;
}

@Injectable()
export class CalcPreviewService {
  private readonly logger = new Logger(CalcPreviewService.name);
  
  // Version-pinned cache
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly interestEngine: InterestEngineService,
    private readonly feeEngine: FeeEngineService,
    @Optional() private readonly metrics?: CalcPreviewMetricsService,
    @Optional() private readonly circuitBreaker?: CalcPreviewCircuitBreakerService,
    @Optional() private readonly traceCollector?: TraceCollectorService,
    @Optional() private readonly explanationService?: ExplanationService,
    @Optional() @Inject(REQUEST) private readonly request?: Request,
  ) {}

  /**
   * Unified preview hesaplama
   * 
   * Interest + Fee + Policy hesaplamalarını aynı trace içinde yapar.
   * Tek versiyon seti döner - mismatch OLMAZ.
   * 
   * ⚠️ Phase 3.1: Artık GERÇEK engine'leri kullanıyor
   * ⚠️ Phase 4.1: Metrics tracking
   * ⚠️ Phase 5.1: Trace bundle collection
   */
  async preview(request: CalcPreviewRequest): Promise<CalcPreviewResponse> {
    const startTime = Date.now();
    const tenantId = request.tenantId || 'default';
    const requestHash = this.generateRequestHash(request);
    const timestamp = new Date().toISOString();
    
    // Phase 5.1: Get trace context from request (set by TraceInterceptor)
    const traceContext = this.getTraceContext();
    
    // Phase 5.1: Set input (PII-free)
    if (traceContext) {
      traceContext.setInput({
        principalAmount: request.principalAmount,
        currency: request.currency || 'TRY',
        interestType: request.interestType,
        startDate: request.startDate,
        endDate: request.endDate,
        caseType: request.caseType,
        debtorCount: request.debtorCount,
        skipInterest: request.skipInterest,
        skipFee: request.skipFee,
        skipPolicy: request.skipPolicy,
      });
    }
    
    // Validation first
    const validationErrors = this.validateRequest(request);
    if (validationErrors.length > 0) {
      // Phase 5.1: Record validation failure
      if (traceContext) {
        traceContext.setResult({ status: 'UNAVAILABLE' });
        traceContext.addWarning({
          code: 'VALIDATION_FAILED',
          severity: 'ERROR',
          message: validationErrors.map(e => e.code).join(', '),
        });
      }
      
      return {
        success: false,
        status: 'UNAVAILABLE',
        versions: this.buildVersions(undefined, undefined),
        errors: validationErrors,
        warnings: [],
        uxGuidance: {
          blocking: false,
          recommendedAction: 'CHECK_INPUT',
          userMessage: 'Lütfen girdiğiniz değerleri kontrol edin',
        },
        cached: false,
        requestHash,
        timestamp,
      };
    }
    
    // Check version-pinned cache
    const versions = this.buildVersions(undefined, undefined); // Initial versions for cache key
    const cacheKey = this.generateCacheKey(tenantId, requestHash, versions);
    
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      const cacheHitDuration = Date.now() - startTime;
      this.logger.debug(`[CalcPreview] Cache hit: ${cacheKey}`);
      
      // Phase 5.1: Record cache hit
      if (traceContext) {
        traceContext.recordCacheHit('rate_provider', false, versions.rateTableVersion);
        traceContext.setResult({ 
          status: cached.status === 'FULL' ? 'OK' : cached.status === 'PARTIAL' ? 'DEGRADED' : 'UNAVAILABLE',
          totals: cached.interest || cached.fee ? {
            interest: cached.interest?.estimatedInterest,
            fees: cached.fee?.estimatedFees,
            total: (cached.interest?.estimatedInterest || 0) + (cached.fee?.estimatedFees || 0),
          } : undefined,
        });
      }
      
      // Phase 4.1: Record cache hit metrics
      if (this.metrics) {
        this.metrics.recordRequest({
          tenantId,
          durationMs: cacheHitDuration,
          status: cached.status === 'FULL' ? 'success' : cached.status === 'PARTIAL' ? 'partial' : 'unavailable',
          cached: true,
        });
        this.metrics.recordDependencyLatency({
          dependency: 'cache',
          durationMs: cacheHitDuration,
          success: true,
          tenantId,
        });
      }
      
      return {
        ...cached,
        cached: true,
        timestamp,
      };
    }
    
    // Phase 5.1: Record cache miss
    if (traceContext) {
      traceContext.recordCacheMiss('rate_provider');
    }
    
    const errors: CalcPreviewError[] = [];
    const warnings: CalcPreviewWarning[] = [];
    
    let interestData: InterestPreviewData | undefined;
    let feeData: FeePreviewData | undefined;
    let policyData: PolicyPreviewData | undefined;
    
    // Versions from engines
    let interestVersions: { engineVersion: string; ruleVersion: string } | undefined;
    let feeVersions: { tariffVersion: string; tariffYear: number } | undefined;
    
    // ========================================================================
    // INTEREST HESAPLAMA - GERÇEK ENGINE (Phase 3.1.1 Enhanced + Circuit Breaker + Trace)
    // ========================================================================
    if (!request.skipInterest) {
      // Phase 4.3: Check circuit breaker
      const circuitAllowed = this.circuitBreaker?.isCallAllowed('interest_engine') ?? true;
      
      // Phase 5.1: Record circuit breaker state
      if (traceContext && this.circuitBreaker) {
        const cbStatus = this.circuitBreaker.getStatus('interest_engine');
        traceContext.recordCircuitState('interest_engine', {
          state: cbStatus.state,
          openedAt: cbStatus.nextRetryAt,
          halfOpenTrials: cbStatus.halfOpenTrials,
          halfOpenFailures: cbStatus.halfOpenFailures,
        });
      }
      
      if (!circuitAllowed) {
        this.logger.warn('[CalcPreview] Interest engine circuit OPEN - skipping');
        errors.push({
          domain: 'interest',
          code: 'CIRCUIT_OPEN',
          message: 'Faiz hesaplama servisi geçici olarak erişilemiyor',
        });
        
        // Phase 5.1: Record skipped call
        if (traceContext && this.traceCollector) {
          this.traceCollector.recordSkippedCall(traceContext, 'interest_engine', 'Circuit breaker OPEN');
        }
      } else {
        // Phase 5.1: Track dependency call
        const depTracker = traceContext?.startDependencyCall('interest_engine');
        
        try {
          const interestStart = Date.now();
          const result = await this.interestEngine.previewCalculation({
            principalAmount: request.principalAmount,
            startDate: request.startDate,
            endDate: request.endDate,
            interestType: request.interestType,
            fixedRate: request.fixedRate,
            currency: request.currency,
          });
          
          // Phase 4.3: Record success
          this.circuitBreaker?.recordSuccess('interest_engine');
          
          // Phase 4.1: Record dependency latency
          if (this.metrics) {
            this.metrics.recordDependencyLatency({
              dependency: 'interest_engine',
              durationMs: Date.now() - interestStart,
              success: true,
              tenantId,
            });
          }
          
          if (result.success && result.data) {
            interestData = {
              estimatedInterest: result.data.estimatedInterest,
              currentRate: result.data.currentRate,
              days: result.data.days,
              interestType: request.interestType,
              // Phase 3.1.1: Detaylı breakdown
              preEnforcementInterest: result.data.preEnforcementInterest,
              postEnforcementInterest: result.data.postEnforcementInterest,
              // Phase 3.1.1: Segments
              segments: result.segments,
              segmentsMeta: result.segmentsMeta,
              // Phase 3.1.1: Coverage
              coverage: result.coverage,
            };
            interestVersions = result.versions;
            
            // Phase 5.1: Complete dependency call - SUCCESS
            depTracker?.complete('SUCCESS', true);
            
            // Phase 3.1.1: Engine warnings'ı genel warnings'a ekle
            if (result.warnings && result.warnings.length > 0) {
              result.warnings.forEach(w => {
                warnings.push({
                  domain: 'interest',
                  code: w.code,
                  message: w.message,
                  severity: w.severity === 'warn' ? 'warning' : 'info',
                });
              });
            }
          } else if (result.error) {
            this.logger.warn(`[CalcPreview] Interest engine error: ${result.error.code}`);
            errors.push({
              domain: 'interest',
              code: result.error.code,
              message: result.error.message,
            });
            
            // Phase 5.1: Complete dependency call - FALLBACK (domain invalid)
            depTracker?.complete('FALLBACK', false, {
              source: 'UNAVAILABLE',
              circuitState: 'CLOSED',
              reason: result.error.code,
            });
          }
        } catch (error) {
          // Phase 4.3: Record failure
          this.circuitBreaker?.recordFailure('interest_engine', error as Error);
          
          // Phase 5.1: Complete dependency call - ERROR
          depTracker?.complete('ERROR', false, {
            source: 'UNAVAILABLE',
            circuitState: 'CLOSED',
            reason: (error as Error).message,
          });
          
          this.logger.error('[CalcPreview] Interest engine exception:', error);
          errors.push({
            domain: 'interest',
            code: 'ENGINE_ERROR',
            message: 'Faiz hesaplama motoru hatası',
          });
        }
      }
    }
    
    // ========================================================================
    // FEE HESAPLAMA - GERÇEK ENGINE (+ Circuit Breaker + Trace)
    // ========================================================================
    if (!request.skipFee) {
      // Phase 4.3: Check circuit breaker
      const circuitAllowed = this.circuitBreaker?.isCallAllowed('fee_engine') ?? true;
      
      // Phase 5.1: Record circuit breaker state
      if (traceContext && this.circuitBreaker) {
        const cbStatus = this.circuitBreaker.getStatus('fee_engine');
        traceContext.recordCircuitState('fee_engine', {
          state: cbStatus.state,
          openedAt: cbStatus.nextRetryAt,
          halfOpenTrials: cbStatus.halfOpenTrials,
          halfOpenFailures: cbStatus.halfOpenFailures,
        });
      }
      
      if (!circuitAllowed) {
        this.logger.warn('[CalcPreview] Fee engine circuit OPEN - skipping');
        errors.push({
          domain: 'fee',
          code: 'CIRCUIT_OPEN',
          message: 'Masraf hesaplama servisi geçici olarak erişilemiyor',
        });
        
        // Phase 5.1: Record skipped call
        if (traceContext && this.traceCollector) {
          this.traceCollector.recordSkippedCall(traceContext, 'fee_engine', 'Circuit breaker OPEN');
        }
      } else {
        // Phase 5.1: Track dependency call
        const depTracker = traceContext?.startDependencyCall('fee_engine');
        
        try {
          const feeStart = Date.now();
          const result = this.feeEngine.previewCalculation({
            principalAmount: request.principalAmount,
            accruedInterest: interestData?.estimatedInterest || 0,
            caseType: request.caseType,
            debtorCount: request.debtorCount,
          });
          
          // Phase 4.3: Record success
          this.circuitBreaker?.recordSuccess('fee_engine');
          
          // Phase 4.1: Record dependency latency
          if (this.metrics) {
            this.metrics.recordDependencyLatency({
              dependency: 'fee_engine',
              durationMs: Date.now() - feeStart,
              success: true,
              tenantId,
            });
          }
          
          if (result.success && result.data) {
            feeData = {
              estimatedFees: result.data.estimatedFees,
              estimatedAttorneyFee: result.data.estimatedAttorneyFee,
              tariffYear: result.data.tariffYear,
              breakdown: result.data.breakdown,
            };
            feeVersions = result.versions;
            
            // Phase 5.1: Complete dependency call - SUCCESS
            depTracker?.complete('SUCCESS', true);
          } else if (result.error) {
            this.logger.warn(`[CalcPreview] Fee engine error: ${result.error.code}`);
            errors.push({
              domain: 'fee',
              code: result.error.code,
              message: result.error.message,
            });
            
            // Phase 5.1: Complete dependency call - FALLBACK
            depTracker?.complete('FALLBACK', false, {
              source: 'UNAVAILABLE',
              circuitState: 'CLOSED',
              reason: result.error.code,
            });
          }
        } catch (error) {
          // Phase 4.3: Record failure
          this.circuitBreaker?.recordFailure('fee_engine', error as Error);
          
          // Phase 5.1: Complete dependency call - ERROR
          depTracker?.complete('ERROR', false, {
            source: 'UNAVAILABLE',
            circuitState: 'CLOSED',
            reason: (error as Error).message,
          });
          
          this.logger.error('[CalcPreview] Fee engine exception:', error);
          errors.push({
            domain: 'fee',
            code: 'ENGINE_ERROR',
            message: 'Masraf hesaplama motoru hatası',
          });
        }
      }
    }
    
    // ========================================================================
    // POLICY PREVIEW (soft gates + Trace + Phase 6A Explanations)
    // ========================================================================
    let explanationsDegraded = false;
    
    if (!request.skipPolicy) {
      // Phase 5.1: Track policy call
      const depTracker = traceContext?.startDependencyCall('policy_engine');
      
      try {
        const policyResult = this.calculatePolicyPreview(request, interestData, feeData);
        policyData = policyResult;
        
        // Phase 6A: Track if explanations are degraded
        // Check if any explanation has EXPLANATION_SERVICE_UNAVAILABLE code
        explanationsDegraded = policyResult.explanations.some(
          e => e.reasonCode === 'EXPLANATION_SERVICE_UNAVAILABLE'
        );
        
        // Phase 5.1: Record policy info
        if (traceContext) {
          traceContext.recordPolicy({
            softCheck: {
              outcome: policyData.softWarnings.length > 0 ? 'WARN' : 'PASS',
              reasons: policyData.softWarnings.map(sw => ({
                code: sw.gateCode,
                severity: sw.severity === 'warning' ? 'warning' : 'info',
              })),
            },
          });
        }
        
        // Phase 5.1: Complete dependency call - SUCCESS
        depTracker?.complete('SUCCESS', true);
        
        // Policy soft warnings'ı genel warnings'a ekle
        if (policyData.softWarnings.length > 0) {
          policyData.softWarnings.forEach(sw => {
            warnings.push({
              domain: 'policy',
              code: sw.gateCode,
              message: sw.message,
              severity: sw.severity,
            });
          });
        }
      } catch (error) {
        // Phase 5.1: Complete dependency call - ERROR
        depTracker?.complete('ERROR', false);
        
        this.logger.error('[CalcPreview] Policy error:', error);
        warnings.push({
          domain: 'policy',
          code: 'POLICY_UNAVAILABLE',
          message: 'Policy kontrolü yapılamadı',
          severity: 'info',
        });
      }
    }
    
    // ========================================================================
    // STATUS & VERSIONS
    // ========================================================================
    const status = this.determineStatus(request, interestData, feeData);
    
    // Build unified versions from engine responses
    const finalVersions = this.buildVersions(interestVersions, feeVersions);
    const finalCacheKey = this.generateCacheKey(tenantId, requestHash, finalVersions);
    
    // Partial durumunda warning ekle
    if (status === 'PARTIAL') {
      warnings.push({
        domain: 'coordinator',
        code: 'PARTIAL_PREVIEW',
        message: interestData 
          ? 'Masraf hesaplanamadı, sadece faiz gösteriliyor'
          : 'Faiz hesaplanamadı, sadece masraf gösteriliyor',
        severity: 'warning',
      });
    }
    
    // UX Guidance belirle
    const uxGuidance = this.determineUxGuidance(status, errors, warnings);
    
    const durationMs = Date.now() - startTime;
    this.logger.log(`[CalcPreview] Completed in ${durationMs}ms, status: ${status}`);
    
    // Phase 5.1: Set final result in trace
    if (traceContext) {
      const traceStatus = status === 'FULL' ? 'OK' : status === 'PARTIAL' ? 'DEGRADED' : 'UNAVAILABLE';
      traceContext.setResult({
        status: traceStatus,
        totals: {
          interest: interestData?.estimatedInterest,
          fees: feeData?.estimatedFees,
          total: (interestData?.estimatedInterest || 0) + (feeData?.estimatedFees || 0),
        },
        breakdownTruncated: interestData?.segmentsMeta?.truncated,
      });
      
      // Add warnings to trace
      warnings.forEach(w => {
        traceContext.addWarning({
          code: w.code,
          severity: w.severity === 'warning' ? 'WARN' : 'INFO',
          message: w.message,
        });
      });
    }
    
    const response: CalcPreviewResponse = {
      success: status !== 'UNAVAILABLE',
      status,
      interest: interestData,
      fee: feeData,
      policy: policyData,
      versions: finalVersions,
      errors,
      warnings,
      uxGuidance,
      cached: false,
      cacheKey: finalCacheKey,
      cacheExpiry: new Date(Date.now() + this.CACHE_TTL_MS).toISOString(),
      requestHash,
      timestamp,
      // Phase 6A: Explanation degraded flag
      explanationsDegraded,
    };
    
    // ========================================================================
    // PHASE 4.1: METRICS RECORDING
    // ========================================================================
    this.recordMetrics({
      tenantId,
      durationMs,
      status,
      cached: false,
      errors,
      warnings,
      interestData,
      feeData,
    });
    
    // Cache'e kaydet (version-pinned)
    if (status !== 'UNAVAILABLE') {
      this.setCache(finalCacheKey, response, finalVersions);
    }
    
    return response;
  }

  /**
   * Record metrics for monitoring (Phase 4.1)
   */
  private recordMetrics(params: {
    tenantId: string;
    durationMs: number;
    status: CalcPreviewStatus;
    cached: boolean;
    errors: CalcPreviewError[];
    warnings: CalcPreviewWarning[];
    interestData?: InterestPreviewData;
    feeData?: FeePreviewData;
  }): void {
    if (!this.metrics) return;

    // Map status to metric status
    const metricStatus = params.status === 'FULL' ? 'success' 
      : params.status === 'PARTIAL' ? 'partial' 
      : 'unavailable';

    // Build labels for Phase 3.1.2 compatibility
    const labels: Record<string, string> = {};
    
    if (params.interestData?.coverage) {
      labels.coverageStatus = params.interestData.coverage.percent === 100 ? 'full' 
        : params.interestData.coverage.percent > 0 ? 'partial' : 'none';
      labels.hasGaps = params.interestData.coverage.hasGaps ? 'true' : 'false';
      labels.hasOverlaps = params.interestData.coverage.hasOverlaps ? 'true' : 'false';
    }
    
    if (params.interestData?.segmentsMeta?.truncated) {
      labels.segmentsTruncated = 'true';
    }
    
    // Check for HIGH_FEE_RATIO warning
    const hasHighFeeRatio = params.warnings.some(w => w.code === 'HIGH_FEE_RATIO');
    if (hasHighFeeRatio) {
      labels.highFeeRatio = 'true';
    }

    // Record request
    this.metrics.recordRequest({
      tenantId: params.tenantId,
      durationMs: params.durationMs,
      status: metricStatus,
      cached: params.cached,
      labels,
    });

    // Record errors
    for (const error of params.errors) {
      this.metrics.recordError({
        tenantId: params.tenantId,
        domain: error.domain as 'interest' | 'fee' | 'policy' | 'validation' | 'network' | 'unknown',
        code: error.code,
        message: error.message,
      });
    }
  }

  /**
   * Build unified versions from engine responses
   * TEK SET - mismatch OLMAZ
   */
  private buildVersions(
    interestVersions?: { engineVersion: string; ruleVersion: string },
    feeVersions?: { tariffVersion: string; tariffYear: number },
  ): CalcPreviewVersions {
    return {
      engineVersion: interestVersions?.engineVersion || ENGINE_VERSION,
      ruleVersion: interestVersions?.ruleVersion || RULE_VERSION,
      rateTableVersion: interestVersions?.ruleVersion || RULE_VERSION,
      tariffVersion: feeVersions?.tariffVersion || `${new Date().getFullYear()}.1`,
      tariffYear: feeVersions?.tariffYear || new Date().getFullYear(),
      policyVersion: POLICY_VERSION,
    };
  }

  /**
   * Request validation
   */
  private validateRequest(request: CalcPreviewRequest): CalcPreviewError[] {
    const errors: CalcPreviewError[] = [];
    
    if (!request.principalAmount || request.principalAmount <= 0) {
      errors.push({
        domain: 'validation',
        code: 'INVALID_PRINCIPAL',
        message: 'principalAmount must be greater than 0',
      });
    }
    
    if (!request.skipInterest) {
      if (!request.startDate || !request.endDate) {
        errors.push({
          domain: 'validation',
          code: 'INVALID_DATES',
          message: 'startDate and endDate are required for interest calculation',
        });
      } else {
        const startDate = new Date(request.startDate);
        const endDate = new Date(request.endDate);
        
        if (startDate >= endDate) {
          errors.push({
            domain: 'validation',
            code: 'INVALID_DATE_RANGE',
            message: 'startDate must be before endDate',
          });
        }
      }
      
      if (!request.interestType) {
        errors.push({
          domain: 'validation',
          code: 'INVALID_INTEREST_TYPE',
          message: 'interestType is required for interest calculation',
        });
      }
    }
    
    return errors;
  }

  /**
   * Policy preview - soft gate kontrolü
   * Blocking değil, sadece uyarı verir
   * 
   * Phase 6A: ExplanationService entegrasyonu
   */
  private calculatePolicyPreview(
    request: CalcPreviewRequest,
    interestData?: InterestPreviewData,
    feeData?: FeePreviewData
  ): PolicyPreviewData {
    const softWarnings: PolicySoftWarning[] = [];
    const passedGates: string[] = [];
    
    // Gate 1: Minimum takip tutarı kontrolü
    const MIN_TAKIP_TUTARI = 500; // TL
    if (request.principalAmount < MIN_TAKIP_TUTARI) {
      softWarnings.push({
        gateCode: 'MIN_TAKIP_TUTARI',
        message: `Takip tutarı minimum ${MIN_TAKIP_TUTARI} TL altında`,
        severity: 'warning',
        suggestion: 'Düşük tutarlı takipler için masraf/getiri oranını değerlendirin',
      });
    } else {
      passedGates.push('MIN_TAKIP_TUTARI');
    }
    
    // Gate 2: Yüksek faiz oranı kontrolü
    if (interestData && interestData.currentRate > 50) {
      softWarnings.push({
        gateCode: 'HIGH_INTEREST_RATE',
        message: `Faiz oranı yüksek (%${interestData.currentRate})`,
        severity: 'info',
        suggestion: 'Faiz türünü ve oranını doğrulayın',
      });
    } else {
      passedGates.push('HIGH_INTEREST_RATE');
    }
    
    // Gate 3: Uzun faiz süresi kontrolü
    if (interestData && interestData.days > 365 * 3) {
      softWarnings.push({
        gateCode: 'LONG_INTEREST_PERIOD',
        message: `Faiz süresi 3 yıldan uzun (${interestData.days} gün)`,
        severity: 'info',
        suggestion: 'Zamanaşımı durumunu kontrol edin',
      });
    } else {
      passedGates.push('LONG_INTEREST_PERIOD');
    }
    
    // Gate 4: Masraf/anapara oranı kontrolü
    if (feeData && request.principalAmount > 0) {
      const feeRatio = feeData.estimatedFees / request.principalAmount;
      if (feeRatio > 0.3) { // %30'dan fazla
        softWarnings.push({
          gateCode: 'HIGH_FEE_RATIO',
          message: `Masraflar anaparanın %${(feeRatio * 100).toFixed(0)}'i`,
          severity: 'warning',
          suggestion: 'Düşük tutarlı takiplerde masraf oranı yüksek olabilir',
        });
      } else {
        passedGates.push('HIGH_FEE_RATIO');
      }
    }
    
    // Phase 6A: Generate explanations using ExplanationService
    const outcome = softWarnings.length > 0 ? 'WARN' : 'PASS';
    const explanationResult = this.generateExplanations(outcome, softWarnings);
    
    return {
      passedGates,
      softWarnings,
      policyVersion: POLICY_VERSION,
      explanations: explanationResult.explanations,
    };
  }

  /**
   * Phase 6A: Generate explanations from soft warnings
   * Uses ExplanationService if available, otherwise returns empty array
   */
  private generateExplanations(
    outcome: 'PASS' | 'WARN' | 'BLOCK',
    softWarnings: PolicySoftWarning[],
  ): { explanations: import('./explanation').PolicyExplanation[]; degraded: boolean } {
    if (!this.explanationService) {
      // ExplanationService not available - return empty explanations
      return { explanations: [], degraded: false };
    }

    // Convert soft warnings to PolicyReason format for ExplanationService
    const reasons = softWarnings.map(sw => ({
      code: sw.gateCode,
      message: sw.message,
      severity: sw.severity === 'warning' ? 'WARNING' : 'INFO',
    }));

    return this.explanationService.explain({
      outcome,
      reasons,
    });
  }

  /**
   * Status belirleme
   */
  private determineStatus(
    request: CalcPreviewRequest,
    interestData?: InterestPreviewData,
    feeData?: FeePreviewData
  ): CalcPreviewStatus {
    const expectInterest = !request.skipInterest;
    const expectFee = !request.skipFee;
    
    const hasInterest = !!interestData;
    const hasFee = !!feeData;
    
    if (expectInterest && expectFee) {
      if (hasInterest && hasFee) return 'FULL';
      if (hasInterest || hasFee) return 'PARTIAL';
      return 'UNAVAILABLE';
    }
    
    if (expectInterest && !expectFee) {
      return hasInterest ? 'FULL' : 'UNAVAILABLE';
    }
    
    if (!expectInterest && expectFee) {
      return hasFee ? 'FULL' : 'UNAVAILABLE';
    }
    
    return 'UNAVAILABLE';
  }

  /**
   * UX Guidance belirleme - UI semantiği backend'den gelir
   */
  private determineUxGuidance(
    status: CalcPreviewStatus,
    errors: CalcPreviewError[],
    warnings: CalcPreviewWarning[]
  ): UxGuidance {
    // UNAVAILABLE - network veya ciddi hata
    if (status === 'UNAVAILABLE') {
      const hasNetworkError = errors.some(e => 
        e.code === 'NETWORK_ERROR' || e.code === 'SERVICE_UNAVAILABLE'
      );
      
      if (hasNetworkError) {
        return {
          blocking: false,
          recommendedAction: 'RETRY',
          retryAfterMs: 3000,
          userMessage: 'Servis geçici olarak erişilemiyor, lütfen tekrar deneyin',
        };
      }
      
      const hasValidationError = errors.some(e => e.domain === 'validation');
      if (hasValidationError) {
        return {
          blocking: false,
          recommendedAction: 'CHECK_INPUT',
          userMessage: 'Lütfen girdiğiniz değerleri kontrol edin',
        };
      }
      
      return {
        blocking: false,
        recommendedAction: 'CONTACT_SUPPORT',
        userMessage: 'Beklenmeyen bir hata oluştu',
      };
    }
    
    // PARTIAL - kısmi sonuç
    if (status === 'PARTIAL') {
      return {
        blocking: false,
        recommendedAction: 'PROCEED',
        userMessage: 'Kısmi önizleme gösteriliyor, kaydetmeden önce tam doğrulama yapılacak',
      };
    }
    
    // FULL - tam sonuç
    const hasPolicyWarning = warnings.some(w => w.domain === 'policy' && w.severity === 'warning');
    
    if (hasPolicyWarning) {
      return {
        blocking: false,
        recommendedAction: 'PROCEED',
        userMessage: 'Önizleme hazır, bazı uyarıları gözden geçirin',
      };
    }
    
    return {
      blocking: false,
      recommendedAction: 'PROCEED',
    };
  }

  // ============================================================================
  // VERSION-PINNED CACHE (with tenant isolation)
  // ============================================================================

  /**
   * Generate cache key with version pinning + tenant isolation
   * Cache key = tenantId:requestHash:versions
   * 
   * ⚠️ GÜVENLİK: tenantId ZORUNLU - farklı tenant'ların cache'i karışmamalı
   */
  private generateCacheKey(
    tenantId: string, 
    requestHash: string, 
    versions: CalcPreviewVersions
  ): string {
    const versionString = [
      versions.engineVersion,
      versions.ruleVersion,
      versions.rateTableVersion,
      versions.tariffVersion,
      versions.policyVersion,
    ].join(':');
    
    return `${tenantId}:${requestHash}:${versionString}`;
  }

  /**
   * Get from cache (version-pinned)
   */
  private getFromCache(cacheKey: string): CalcPreviewResponse | null {
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return null;
    
    // Expired?
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    // Version check - eğer current versions farklıysa cache invalid
    const currentVersions = this.buildVersions(undefined, undefined);
    if (
      entry.versions.engineVersion !== currentVersions.engineVersion ||
      entry.versions.ruleVersion !== currentVersions.ruleVersion
    ) {
      this.logger.warn(`[CalcPreview] Cache invalidated due to version change: ${cacheKey}`);
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.response;
  }

  /**
   * Set cache (version-pinned)
   */
  private setCache(
    cacheKey: string, 
    response: CalcPreviewResponse, 
    versions: CalcPreviewVersions
  ): void {
    this.cache.set(cacheKey, {
      response,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
      versions,
    });
    
    // Cleanup old entries (simple FIFO)
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }

  /**
   * Request hash oluştur
   */
  private generateRequestHash(request: CalcPreviewRequest): string {
    const normalized = JSON.stringify({
      p: request.principalAmount,
      c: request.currency || 'TRY',
      t: request.interestType,
      s: request.startDate,
      e: request.endDate,
      f: request.fixedRate,
      ct: request.caseType,
      dc: request.debtorCount,
      si: request.skipInterest,
      sf: request.skipFee,
      sp: request.skipPolicy,
    });
    
    return createHash('md5').update(normalized).digest('hex').substring(0, 12);
  }

  // ============================================================================
  // TRACE HELPERS (Phase 5.1)
  // ============================================================================

  /**
   * Get trace context from request (set by TraceInterceptor)
   */
  private getTraceContext(): TraceContext | undefined {
    if (!this.request) return undefined;
    return (this.request as RequestWithTrace).traceContext;
  }
}
