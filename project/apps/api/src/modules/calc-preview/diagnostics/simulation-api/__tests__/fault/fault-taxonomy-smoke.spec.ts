/**
 * Failure Taxonomy Smoke Test
 *
 * Validates that error factory functions in simulation-error.types.ts
 * produce the correct HTTP status codes, matching the locked taxonomy
 * in design.md §D6.
 *
 * This is the "single source of truth" gate: if a factory's statusCode
 * changes, this test breaks before any client sees a wrong retry signal.
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D6
 */

import {
  createSimulationDisabledError,
  createDriftDetectedError,
  createEscalationStateConflictError,
  createEvidenceNotFoundError,
  createIncidentNotFoundError,
  createRunNotFoundError,
  createSimulationAlreadyRunningError,
  createForbiddenTenantScopeError,
  SimulationDisabledException,
  EscalationStateConflictException,
  DriftDetectedException,
} from '../../simulation-error.types';

import { FAULT_SCENARIOS } from './fault-injector';

// ============================================================================
// A1 — Error Factory HTTP Status Mapping
// ============================================================================

describe('Failure Taxonomy — HTTP Status Mapping (D6 Lock)', () => {
  describe('Error factory statusCode contracts', () => {
    it('SimulationDisabled → 503', () => {
      const err = createSimulationDisabledError();
      expect(err.statusCode).toBe(503);
      expect(err.details?.errorCode).toBe('SIMULATION_DISABLED');
    });

    it('EscalationStateConflict → 409', () => {
      const err = createEscalationStateConflictError('inc-test');
      expect(err.statusCode).toBe(409);
      expect(err.details?.errorCode).toBe('ESCALATION_STATE_CONFLICT');
    });

    it('DriftDetected → 409', () => {
      const err = createDriftDetectedError('inc-test');
      expect(err.statusCode).toBe(409);
      expect(err.details?.errorCode).toBe('DRIFT_DETECTED');
    });

    it('IncidentNotFound → 404', () => {
      const err = createIncidentNotFoundError('inc-test');
      expect(err.statusCode).toBe(404);
    });

    it('RunNotFound → 404', () => {
      const err = createRunNotFoundError('run-test');
      expect(err.statusCode).toBe(404);
    });

    it('EvidenceNotFound → 404', () => {
      const err = createEvidenceNotFoundError('run-test');
      expect(err.statusCode).toBe(404);
    });

    it('SimulationAlreadyRunning → 409', () => {
      const err = createSimulationAlreadyRunningError('inc-test');
      expect(err.statusCode).toBe(409);
    });

    it('ForbiddenTenantScope → 403', () => {
      const err = createForbiddenTenantScopeError();
      expect(err.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // HttpException class getStatus() contracts
  // ==========================================================================

  describe('HttpException getStatus() contracts', () => {
    it('SimulationDisabledException.getStatus() → 503', () => {
      const ex = new SimulationDisabledException();
      expect(ex.getStatus()).toBe(503);
    });

    it('EscalationStateConflictException.getStatus() → 409', () => {
      const ex = new EscalationStateConflictException('inc-test');
      expect(ex.getStatus()).toBe(409);
    });

    it('DriftDetectedException.getStatus() → 409', () => {
      const ex = new DriftDetectedException('inc-test');
      expect(ex.getStatus()).toBe(409);
    });
  });

  // ==========================================================================
  // A3 — FAULT_SCENARIOS registry consistency
  // ==========================================================================

  describe('FAULT_SCENARIOS registry consistency', () => {
    it('every scenario has a unique id', () => {
      const ids = FAULT_SCENARIOS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every active scenario has expectedHttpClass defined (number or null)', () => {
      for (const s of FAULT_SCENARIOS.filter((s) => s.active)) {
        expect(typeof s.expectedHttpClass === 'number' || s.expectedHttpClass === null).toBe(true);
      }
    });

    it('F1 → 500, F4 → 500, F5 → 202, F10 → 202, F11 → 409, F14 → 503', () => {
      const map: Record<string, number | null> = {
        F1: 500,
        F4: 500,
        F5: 202,
        F10: 202,
        F11: 409,
        F14: 503,
        F3: null,
        F9: null,
        F13: null,
      };

      for (const [id, expected] of Object.entries(map)) {
        const scenario = FAULT_SCENARIOS.find((s) => s.id === id);
        expect(scenario).toBeDefined();
        expect(scenario!.expectedHttpClass).toBe(expected);
      }
    });

    it('inactive scenarios (F6, F7) are tier 2', () => {
      const inactive = FAULT_SCENARIOS.filter((s) => !s.active);
      for (const s of inactive) {
        expect(s.tier).toBe(2);
      }
    });
  });
});
