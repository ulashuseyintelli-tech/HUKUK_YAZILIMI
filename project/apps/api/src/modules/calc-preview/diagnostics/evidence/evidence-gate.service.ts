/**
 * Evidence Gate Service
 * 
 * Phase 8 - Sprint 1A
 * 
 * Snapshot kalitesini değerlendirir ve downstream gate'lere geçişi kontrol eder.
 * 
 * Gate hiyerarşisi (hard):
 * EvidenceGate → PolicyGuard → Executor
 * 
 * EvidenceGate fail ⇒ PolicyGuard ve Executor çalıştırılamaz.
 * "policy passed but evidence stale" gibi karma durumlar üretilmez.
 * 
 * @see .kiro/specs/whatif-simulation/requirements.md R1-R8
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  EvidenceSnapshot,
  EvidenceFlag,
  EvidenceGateResult,
  EvidenceMetricType,
  EVIDENCE_THRESHOLDS,
  CRITICAL_EVIDENCE_METRICS,
  sortEvidencePoints,
} from '../diagnostics.types';
import { IClock } from './clock.service';

@Injectable()
export class EvidenceGateService {
  private readonly logger = new Logger(EvidenceGateService.name);

  constructor(private readonly clock: IClock) {}

  /**
   * Evaluate evidence snapshot quality
   * 
   * @param snapshot - Evidence snapshot to evaluate
   * @returns EvidenceGateResult with flags and allow decisions
   * 
   * Hard rules:
   * - snapshotAgeSec > 60 ⇒ STALE_EVIDENCE
   * - freshnessSec > 120 ⇒ STALE_DATA
   * - confidence < 0.5 (critical metrics) ⇒ LOW_CONFIDENCE
   * - Any of above ⇒ allowAutoEscalation=false, allowPromote=false
   */
  evaluate(snapshot: EvidenceSnapshot): EvidenceGateResult {
    const now = this.clock.now();
    const capturedAt = new Date(snapshot.capturedAt);
    const snapshotAgeSec = Math.floor((now.getTime() - capturedAt.getTime()) / 1000);

    // Ensure deterministic point ordering
    const sortedPoints = sortEvidencePoints(snapshot.points);

    // Collect flags
    const snapshotFlags: EvidenceFlag[] = [];
    const pointLevelFlags: Array<{ metric: EvidenceMetricType; flags: EvidenceFlag[] }> = [];

    // 1. Check snapshot age (R5: STALE_EVIDENCE)
    if (snapshotAgeSec > EVIDENCE_THRESHOLDS.STALE_EVIDENCE_THRESHOLD_SEC) {
      snapshotFlags.push('STALE_EVIDENCE');
      this.logger.debug('[EvidenceGate] STALE_EVIDENCE flag set', {
        snapshotId: snapshot.snapshotId,
        snapshotAgeSec,
        threshold: EVIDENCE_THRESHOLDS.STALE_EVIDENCE_THRESHOLD_SEC,
      });
    }

    // 2. Check each point
    for (const point of sortedPoints) {
      const pointFlags: EvidenceFlag[] = [];

      // R7: STALE_DATA (freshnessSec > 120)
      if (point.freshnessSec > EVIDENCE_THRESHOLDS.STALE_DATA_THRESHOLD_SEC) {
        pointFlags.push('STALE_DATA');
        if (!snapshotFlags.includes('STALE_DATA')) {
          snapshotFlags.push('STALE_DATA');
        }
        this.logger.debug('[EvidenceGate] STALE_DATA flag set', {
          snapshotId: snapshot.snapshotId,
          metric: point.metric,
          freshnessSec: point.freshnessSec,
          threshold: EVIDENCE_THRESHOLDS.STALE_DATA_THRESHOLD_SEC,
        });
      }

      // R6: LOW_CONFIDENCE (confidence < 0.5 for critical metrics)
      if (
        CRITICAL_EVIDENCE_METRICS.includes(point.metric) &&
        point.confidence < EVIDENCE_THRESHOLDS.LOW_CONFIDENCE_THRESHOLD
      ) {
        pointFlags.push('LOW_CONFIDENCE');
        if (!snapshotFlags.includes('LOW_CONFIDENCE')) {
          snapshotFlags.push('LOW_CONFIDENCE');
        }
        this.logger.debug('[EvidenceGate] LOW_CONFIDENCE flag set', {
          snapshotId: snapshot.snapshotId,
          metric: point.metric,
          confidence: point.confidence,
          threshold: EVIDENCE_THRESHOLDS.LOW_CONFIDENCE_THRESHOLD,
        });
      }

      if (pointFlags.length > 0) {
        pointLevelFlags.push({ metric: point.metric, flags: pointFlags });
      }
    }

    // R8: Auto gating - any flag blocks auto-escalation and promote
    const hasBlockingFlags = snapshotFlags.length > 0;
    const allowAutoEscalation = !hasBlockingFlags;
    const allowPromote = !hasBlockingFlags;

    // Build result
    const result: EvidenceGateResult = {
      flags: snapshotFlags,
      allowAutoEscalation,
      allowPromote,
      snapshotAgeSec,
      pointLevelFlags,
    };

    // Add blocked reason if not allowed
    if (hasBlockingFlags) {
      result.blockedReason = 'EVIDENCE_GATE_FAILED';
      result.blockedFlags = snapshotFlags;
      this.logger.warn('[EvidenceGate] Gate FAILED', {
        snapshotId: snapshot.snapshotId,
        flags: snapshotFlags,
        allowAutoEscalation,
        allowPromote,
      });
    } else {
      this.logger.debug('[EvidenceGate] Gate PASSED', {
        snapshotId: snapshot.snapshotId,
        snapshotAgeSec,
      });
    }

    return result;
  }

  /**
   * Check if gate result allows proceeding
   * 
   * Use this to enforce gate hierarchy:
   * if (!evidenceGate.canProceed(result)) {
   *   // Do NOT call PolicyGuard or Executor
   *   return blockedResponse;
   * }
   */
  canProceed(result: EvidenceGateResult): boolean {
    return result.allowAutoEscalation && result.allowPromote;
  }

  /**
   * Create a blocked response for when gate fails
   * 
   * Returns deterministic response format:
   * - scenarios: []
   * - ranking: []
   * - blockedReason: "EVIDENCE_GATE_FAILED"
   * - blockedFlags: [...]
   */
  createBlockedResponse(result: EvidenceGateResult): {
    scenarios: never[];
    ranking: never[];
    blockedReason: string;
    blockedFlags: EvidenceFlag[];
    autoEscalationAllowed: false;
    promoteAllowed: false;
    snapshotAgeSec: number;
    flags: EvidenceFlag[];
  } {
    return {
      scenarios: [],
      ranking: [],
      blockedReason: result.blockedReason || 'EVIDENCE_GATE_FAILED',
      blockedFlags: result.blockedFlags || result.flags,
      autoEscalationAllowed: false,
      promoteAllowed: false,
      snapshotAgeSec: result.snapshotAgeSec,
      flags: result.flags,
    };
  }
}
