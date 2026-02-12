/**
 * Promote Endpoint DTOs
 *
 * Sprint 3 - Task 1.1
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { MetricDrift } from '../evidence/drift-utils';

// ============================================================================
// Request
// ============================================================================

/** Body is empty — incidentId and runId come from route params */
export type PromoteRequestDto = Record<string, never>;

// ============================================================================
// Response — 202 Accepted
// ============================================================================

export interface PromoteResponseDto {
  /** Unique promote request ID (UUID) */
  requestId: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}

// ============================================================================
// Response — 409 DRIFT_DETECTED
// ============================================================================

export interface PromoteDriftResponseDto {
  /** Calculated drift score */
  driftScore: number;
  /** Top contributing metrics */
  topContributors: MetricDrift[];
}
