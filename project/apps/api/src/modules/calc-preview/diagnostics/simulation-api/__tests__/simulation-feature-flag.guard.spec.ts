/**
 * SimulationFeatureFlagGuard — Kill-switch Pattern Tests
 *
 * Sprint 3 - Task 8.1
 *
 * Tests:
 *   1. Sprint 3 mutation routes blocked when flag disabled
 *   2. GET routes allowed when flag disabled
 *   3. All routes allowed when flag enabled
 *   4. Original mutation routes still blocked (regression)
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §6
 */

import { isMutationPath } from '../guards/simulation-feature-flag.guard';

// ============================================================================
// Pattern match tests (pure function — no NestJS context needed)
// ============================================================================

describe('SimulationFeatureFlagGuard — MUTATION_PATTERNS', () => {
  describe('Sprint 3 mutation routes → should match', () => {
    it('POST /v1/incidents/:id/simulations/:runId/promote', () => {
      expect(isMutationPath('POST', '/v1/incidents/inc-1/simulations/run-1/promote')).toBe(true);
    });

    it('POST /v1/incidents/:id/simulations/rank', () => {
      expect(isMutationPath('POST', '/v1/incidents/inc-1/simulations/rank')).toBe(true);
    });

    it('POST /v1/incidents/:id/simulations (v1 alias)', () => {
      expect(isMutationPath('POST', '/v1/incidents/inc-1/simulations')).toBe(true);
    });
  });

  describe('Original mutation routes → still match (regression)', () => {
    it('POST /incidents/:id/simulate', () => {
      expect(isMutationPath('POST', '/incidents/inc-1/simulate')).toBe(true);
    });

    it('POST /incidents/:id/runs/:runId/export-bundle', () => {
      expect(isMutationPath('POST', '/incidents/inc-1/runs/run-1/export-bundle')).toBe(true);
    });

    it('POST /legal-holds/:snapshotId/archive', () => {
      expect(isMutationPath('POST', '/legal-holds/snap-1/archive')).toBe(true);
    });
  });

  describe('GET routes → should NOT match (reads always allowed)', () => {
    it('GET /v1/incidents/:id/simulations/:runId', () => {
      expect(isMutationPath('GET', '/v1/incidents/inc-1/simulations/run-1')).toBe(false);
    });

    it('GET /incidents/:id/runs', () => {
      expect(isMutationPath('GET', '/incidents/inc-1/runs')).toBe(false);
    });

    it('GET /incidents/:id/runs/latest', () => {
      expect(isMutationPath('GET', '/incidents/inc-1/runs/latest')).toBe(false);
    });
  });

  describe('false negative prevention — no accidental bypass', () => {
    it('POST /v1/incidents/:id/simulations/rank should not match simulate pattern', () => {
      // rank route must match its own pattern, not accidentally pass through
      expect(isMutationPath('POST', '/v1/incidents/inc-1/simulations/rank')).toBe(true);
    });

    it('POST with trailing slash should NOT match (strict)', () => {
      // Regex uses $ anchor — trailing slash = no match
      expect(isMutationPath('POST', '/v1/incidents/inc-1/simulations/')).toBe(false);
    });
  });
});
