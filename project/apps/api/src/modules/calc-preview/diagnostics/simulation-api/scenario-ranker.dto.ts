/**
 * ScenarioRanker Endpoint DTOs
 *
 * Sprint 3 - Task 4.2
 *
 * Request validation + response shape.
 * Types aligned with scenario-ranker.types.ts (no drift).
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §3
 */

import type {
  ScenarioResult,
  RankedScenario,
  TradeoffExplanation,
} from './scenario-ranker.types';

// ============================================================================
// Request DTO
// ============================================================================

export interface ScenarioRankerRequestDto {
  /** Scenarios to rank (min 0, max 100) */
  scenarios: ScenarioResult[];
  /** Seed for deterministic ranking (default: 0) */
  seed?: number;
}

// ============================================================================
// Response DTO — 200 OK
// ============================================================================

export interface ScenarioRankerResponseDto {
  scenarios: RankedScenario[];
  fronts: RankedScenario[][];
  tradeoffs: TradeoffExplanation[];
}

// ============================================================================
// Validation
// ============================================================================

const MAX_SCENARIOS = 100;

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate request body. Returns null if valid, error list otherwise.
 * Pure function — no side effects.
 */
export function validateRankRequest(body: unknown): ValidationError[] | null {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

  const dto = body as Record<string, unknown>;

  // scenarios: required, array
  if (!Array.isArray(dto.scenarios)) {
    errors.push({ field: 'scenarios', message: 'scenarios must be an array' });
    return errors;
  }

  if (dto.scenarios.length > MAX_SCENARIOS) {
    errors.push({
      field: 'scenarios',
      message: `scenarios must contain at most ${MAX_SCENARIOS} items`,
    });
  }

  // Validate each scenario
  for (let i = 0; i < dto.scenarios.length; i++) {
    const s = dto.scenarios[i];
    if (!s || typeof s !== 'object') {
      errors.push({ field: `scenarios[${i}]`, message: 'must be an object' });
      continue;
    }
    if (typeof s.scenarioId !== 'string' || s.scenarioId.length === 0) {
      errors.push({ field: `scenarios[${i}].scenarioId`, message: 'must be a non-empty string' });
    }
    if (typeof s.riskScore !== 'number' || isNaN(s.riskScore)) {
      errors.push({ field: `scenarios[${i}].riskScore`, message: 'must be a number' });
    }
    if (typeof s.costScore !== 'number' || isNaN(s.costScore)) {
      errors.push({ field: `scenarios[${i}].costScore`, message: 'must be a number' });
    }
  }

  // seed: optional, number
  if (dto.seed !== undefined && (typeof dto.seed !== 'number' || isNaN(dto.seed))) {
    errors.push({ field: 'seed', message: 'seed must be a number' });
  }

  return errors.length > 0 ? errors : null;
}
