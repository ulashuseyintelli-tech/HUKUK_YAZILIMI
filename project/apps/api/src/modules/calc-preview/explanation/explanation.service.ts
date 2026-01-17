/**
 * Phase 6A - Explanation Service
 * 
 * PolicyEngine sonuçlarını insan-okunabilir açıklamalara çevirir.
 * Karar mekanizmasını DEĞİŞTİRMEZ - sadece açıklar.
 * 
 * Core Invariant: BLOCK → explanations.length > 0
 * 
 * @see .kiro/specs/explainable-policy-preview/requirements.md
 * @see .kiro/specs/explainable-policy-preview/design.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ReasonCodeRegistry } from './reason-code-registry';
import { CalcPreviewMetricsService } from '../metrics/calc-preview-metrics.service';
import { TraceCollectorService } from '../trace';
import {
  PolicyExplanation,
  ExplanationResult,
  PolicyOutcome,
  SeverityCounts,
  PolicyExplanationGeneratedEvent,
  PolicyExplanationFailedEvent,
  UNKNOWN_BLOCK_FALLBACK,
  DEGRADED_MODE_EXPLANATION,
  UNKNOWN_CODE_FALLBACK_TEMPLATE,
  SEVERITY_ORDER,
} from './explanation.types';

// ============================================================================
// INPUT TYPE (from PolicyEngine)
// ============================================================================

/**
 * PolicyEngine.softCheck() sonucu.
 * Bu interface PolicyEngine contract'ından gelir.
 */
export interface PolicySoftCheckResult {
  outcome: PolicyOutcome;
  reasons: PolicyReason[];
  gatesChecked?: string[];
  policyVersion?: string;
  checkedAt?: string;
}

export interface PolicyReason {
  code: string;
  message?: string;
  severity?: string;
  gateCode?: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// EXPLANATION SERVICE
// ============================================================================

@Injectable()
export class ExplanationService {
  private readonly logger = new Logger(ExplanationService.name);

  constructor(
    private readonly reasonCodeRegistry: ReasonCodeRegistry,
    @Optional() private readonly metricsService?: CalcPreviewMetricsService,
    @Optional() private readonly traceCollector?: TraceCollectorService,
  ) {}

  /**
   * PolicyEngine sonucunu açıklamalara çevirir.
   * 
   * @param softCheckResult - PolicyEngine'den gelen sonuç
   * @returns Açıklamalar dizisi (boş olabilir, null OLMAZ)
   * 
   * @invariant BLOCK outcome → explanations.length > 0
   */
  explain(softCheckResult: PolicySoftCheckResult): ExplanationResult {
    try {
      // Step 1: Generate explanations from reason codes
      const explanations = this.generateExplanations(softCheckResult);
      
      // Step 2: Enforce invariant (BLOCK → explanations.length > 0)
      const enforced = this.enforceInvariant(softCheckResult.outcome, explanations);
      
      // Step 3: Emit trace event
      this.emitTraceEvent(softCheckResult, enforced);
      
      return {
        explanations: enforced,
        degraded: false,
      };
    } catch (error) {
      return this.handleDegradedMode(softCheckResult, error as Error);
    }
  }

  /**
   * Generate explanations from policy reasons.
   * PASS → empty array
   * WARN/BLOCK → map reason codes to explanations
   */
  private generateExplanations(result: PolicySoftCheckResult): PolicyExplanation[] {
    // PASS için açıklama yok (Requirement 1.3)
    if (result.outcome === 'PASS') {
      return [];
    }

    // Map reason codes to explanations
    return result.reasons.map(reason => {
      const entry = this.reasonCodeRegistry.get(reason.code);
      
      if (!entry) {
        // Unknown code - use fallback (Requirement 2.2)
        this.recordUnknownCodeMetric(reason.code);
        this.logger.warn(`[ExplanationService] Unknown reason code: ${reason.code}`);
        return this.createFallbackExplanation(reason.code);
      }

      const explanation: PolicyExplanation = {
        reasonCode: reason.code,
        message: entry.messageTr,
        severity: entry.severity,
        suggestedAction: entry.suggestedAction,
      };
      
      // Only add sourceRule if it exists
      if (entry.sourceRule) {
        explanation.sourceRule = entry.sourceRule;
      }
      
      return explanation;
    });
  }

  /**
   * Enforce core invariant: BLOCK → explanations.length > 0
   * 
   * If BLOCK with no explanations, add fallback and log CRITICAL.
   * Also sorts by severity: ERROR > WARNING > INFO
   */
  private enforceInvariant(
    outcome: PolicyOutcome,
    explanations: PolicyExplanation[],
  ): PolicyExplanation[] {
    // CORE INVARIANT: BLOCK → explanations.length > 0 (Requirement 6.1, 6.3)
    if (outcome === 'BLOCK' && explanations.length === 0) {
      this.logger.error(
        '[ExplanationService] INVARIANT VIOLATION: BLOCK with no explanations - adding fallback'
      );
      this.recordFallbackUsedMetric();
      
      return [UNKNOWN_BLOCK_FALLBACK];
    }

    // Sort by severity: ERROR > WARNING > INFO (Requirement 3.2)
    return this.sortBySeverity(explanations);
  }

  /**
   * Sort explanations by severity.
   * Order: ERROR first, then WARNING, then INFO.
   */
  private sortBySeverity(explanations: PolicyExplanation[]): PolicyExplanation[] {
    return [...explanations].sort((a, b) => 
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
  }

  /**
   * Create fallback explanation for unknown reason code.
   * Preserves original code for debugging.
   */
  private createFallbackExplanation(code: string): PolicyExplanation {
    return {
      reasonCode: code,
      message: UNKNOWN_CODE_FALLBACK_TEMPLATE.message,
      severity: UNKNOWN_CODE_FALLBACK_TEMPLATE.severity,
      suggestedAction: UNKNOWN_CODE_FALLBACK_TEMPLATE.suggestedAction,
    };
  }

  /**
   * Handle degraded mode when explanation generation fails.
   * Returns degraded explanation, emits metric and trace event.
   */
  private handleDegradedMode(
    result: PolicySoftCheckResult,
    error: Error,
  ): ExplanationResult {
    this.logger.error('[ExplanationService] Degraded mode activated', { 
      error: error.message,
      outcome: result.outcome,
    });
    
    // Emit metric (Requirement 7.4)
    this.recordDegradedMetric();
    
    // Emit trace event (Requirement 4.5)
    this.emitFailedTraceEvent(result, error);

    return {
      explanations: [DEGRADED_MODE_EXPLANATION],
      degraded: true,
    };
  }

  /**
   * Emit POLICY_EXPLANATION_GENERATED trace event.
   * PII-FREE: No messages, only codes and counts.
   */
  private emitTraceEvent(
    result: PolicySoftCheckResult,
    explanations: PolicyExplanation[],
  ): void {
    if (!this.traceCollector) return;
    
    const severityCounts = this.countSeverities(explanations);
    const fallbackUsed = explanations.some(e => e.reasonCode === 'UNKNOWN_BLOCK_REASON');

    const event: PolicyExplanationGeneratedEvent = {
      eventType: 'POLICY_EXPLANATION_GENERATED',
      timestamp: new Date().toISOString(),
      policyOutcome: result.outcome,
      explanationCount: explanations.length,
      reasonCodes: explanations.map(e => e.reasonCode),
      severityCounts,
      fallbackUsed,
    };

    this.traceCollector.addEvent(event as unknown as { eventType: string; [key: string]: unknown });
  }

  /**
   * Emit POLICY_EXPLANATION_FAILED trace event.
   */
  private emitFailedTraceEvent(
    result: PolicySoftCheckResult,
    error: Error,
  ): void {
    if (!this.traceCollector) return;
    
    const event: PolicyExplanationFailedEvent = {
      eventType: 'POLICY_EXPLANATION_FAILED',
      timestamp: new Date().toISOString(),
      error: error.message,
      policyOutcome: result.outcome,
    };

    this.traceCollector.addEvent(event as unknown as { eventType: string; [key: string]: unknown });
  }

  /**
   * Count explanations by severity.
   */
  private countSeverities(explanations: PolicyExplanation[]): SeverityCounts {
    return {
      error: explanations.filter(e => e.severity === 'ERROR').length,
      warning: explanations.filter(e => e.severity === 'WARNING').length,
      info: explanations.filter(e => e.severity === 'INFO').length,
    };
  }

  // ============================================================================
  // METRICS HELPERS
  // ============================================================================

  private recordUnknownCodeMetric(code: string): void {
    if (!this.metricsService) return;
    // Use existing error recording method
    this.metricsService.recordError({
      tenantId: 'system',
      domain: 'policy',
      code: 'EXPLANATION_UNKNOWN_CODE',
      message: `Unknown reason code: ${code}`,
    });
  }

  private recordFallbackUsedMetric(): void {
    if (!this.metricsService) return;
    this.metricsService.recordFallback({
      tenantId: 'system',
      reason: 'EXPLANATION_FALLBACK_USED',
    });
  }

  private recordDegradedMetric(): void {
    if (!this.metricsService) return;
    this.metricsService.recordFallback({
      tenantId: 'system',
      reason: 'EXPLANATION_DEGRADED',
    });
  }
}
