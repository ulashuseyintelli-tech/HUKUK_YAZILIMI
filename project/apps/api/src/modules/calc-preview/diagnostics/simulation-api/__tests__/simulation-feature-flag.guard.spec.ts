/**
 * Simulation Feature Flag Guard - Property & Unit Tests
 * 
 * Sprint 2F - Tasks 5.2, 5.3
 * 
 * Property Tests:
 * - Property 1: Feature Flag Blocks Mutations
 * - Property 2: Feature Flag Allows Reads
 * 
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
 */

import { ExecutionContext } from '@nestjs/common';
import * as fc from 'fast-check';
import {
  SimulationFeatureFlagGuard,
  isMutationPath,
} from '../guards/simulation-feature-flag.guard';
import { MockSimulationFeatureFlagService } from '../simulation-feature-flag.service';
import { SimulationDisabledException } from '../simulation-error.types';

describe('SimulationFeatureFlagGuard', () => {
  let guard: SimulationFeatureFlagGuard;
  let mockFeatureFlag: MockSimulationFeatureFlagService;

  beforeEach(() => {
    mockFeatureFlag = new MockSimulationFeatureFlagService();
    guard = new SimulationFeatureFlagGuard(mockFeatureFlag);
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockContext = (method: string, path: string): ExecutionContext => {
    const request = {
      method,
      path,
      headers: {},
      query: {},
      params: {},
      ip: '127.0.0.1',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  // ============================================================================
  // Mutation Endpoints (blocked when disabled)
  // ============================================================================

  const MUTATION_ENDPOINTS = [
    { method: 'POST', path: '/incidents/inc-123/simulate', name: 'simulate' },
    { method: 'POST', path: '/incidents/inc-456/runs/run-789/export-bundle', name: 'export-bundle' },
    { method: 'POST', path: '/legal-holds/snap-123/archive', name: 'archive' },
  ];

  // ============================================================================
  // Read Endpoints (always allowed)
  // ============================================================================

  const READ_ENDPOINTS = [
    { method: 'GET', path: '/incidents/inc-123/runs', name: 'list runs' },
    { method: 'GET', path: '/incidents/inc-123/runs/latest', name: 'latest run' },
    { method: 'GET', path: '/incidents/inc-123/runs/run-456', name: 'run detail' },
    { method: 'GET', path: '/evidence-bundles/bundle-123', name: 'get bundle' },
    { method: 'GET', path: '/evidence-bundles/bundle-123/verify', name: 'verify bundle' },
    { method: 'GET', path: '/legal-holds', name: 'list legal holds' },
    { method: 'GET', path: '/legal-holds/stats', name: 'legal holds stats' },
  ];

  // ============================================================================
  // Property 1: Feature Flag Blocks Mutations
  // **Validates: Requirements 1.2, 1.3, 1.4**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 1: Feature Flag Blocks Mutations', () => {
    it('should return 503 for any mutation when disabled', () => {
      mockFeatureFlag.setEnabled(false);

      for (const { method, path } of MUTATION_ENDPOINTS) {
        const context = createMockContext(method, path);
        expect(() => guard.canActivate(context)).toThrow(SimulationDisabledException);
      }
    });

    it('should block mutations with any incident/run/snapshot ID when disabled', () => {
      mockFeatureFlag.setEnabled(false);

      fc.assert(
        fc.property(
          fc.record({
            incidentId: fc.uuid(),
            runId: fc.uuid(),
            snapshotId: fc.uuid(),
          }),
          ({ incidentId, runId, snapshotId }) => {
            // Test simulate endpoint
            const simulateCtx = createMockContext('POST', `/incidents/${incidentId}/simulate`);
            expect(() => guard.canActivate(simulateCtx)).toThrow(SimulationDisabledException);

            // Test export-bundle endpoint
            const exportCtx = createMockContext('POST', `/incidents/${incidentId}/runs/${runId}/export-bundle`);
            expect(() => guard.canActivate(exportCtx)).toThrow(SimulationDisabledException);

            // Test archive endpoint
            const archiveCtx = createMockContext('POST', `/legal-holds/${snapshotId}/archive`);
            expect(() => guard.canActivate(archiveCtx)).toThrow(SimulationDisabledException);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should allow mutations when feature is enabled', () => {
      mockFeatureFlag.setEnabled(true);

      for (const { method, path } of MUTATION_ENDPOINTS) {
        const context = createMockContext(method, path);
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  // ============================================================================
  // Property 2: Feature Flag Allows Reads
  // **Validates: Requirements 1.5, 1.6, 1.7**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 2: Feature Flag Allows Reads', () => {
    it('should allow all read endpoints when disabled', () => {
      mockFeatureFlag.setEnabled(false);

      for (const { method, path } of READ_ENDPOINTS) {
        const context = createMockContext(method, path);
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('should allow reads with any incident/run/bundle ID when disabled', () => {
      mockFeatureFlag.setEnabled(false);

      fc.assert(
        fc.property(
          fc.record({
            incidentId: fc.uuid(),
            runId: fc.uuid(),
            bundleId: fc.uuid(),
          }),
          ({ incidentId, runId, bundleId }) => {
            // Test list runs
            const listCtx = createMockContext('GET', `/incidents/${incidentId}/runs`);
            expect(guard.canActivate(listCtx)).toBe(true);

            // Test latest run
            const latestCtx = createMockContext('GET', `/incidents/${incidentId}/runs/latest`);
            expect(guard.canActivate(latestCtx)).toBe(true);

            // Test run detail
            const detailCtx = createMockContext('GET', `/incidents/${incidentId}/runs/${runId}`);
            expect(guard.canActivate(detailCtx)).toBe(true);

            // Test get bundle
            const bundleCtx = createMockContext('GET', `/evidence-bundles/${bundleId}`);
            expect(guard.canActivate(bundleCtx)).toBe(true);

            // Test verify bundle
            const verifyCtx = createMockContext('GET', `/evidence-bundles/${bundleId}/verify`);
            expect(guard.canActivate(verifyCtx)).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should allow all read endpoints when enabled', () => {
      mockFeatureFlag.setEnabled(true);

      for (const { method, path } of READ_ENDPOINTS) {
        const context = createMockContext(method, path);
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  // ============================================================================
  // isMutationPath Helper Tests
  // ============================================================================

  describe('isMutationPath helper', () => {
    it('should correctly identify mutation paths', () => {
      // Mutations
      expect(isMutationPath('POST', '/incidents/inc-1/simulate')).toBe(true);
      expect(isMutationPath('POST', '/incidents/inc-1/runs/run-1/export-bundle')).toBe(true);
      expect(isMutationPath('POST', '/legal-holds/snap-1/archive')).toBe(true);

      // Non-mutations
      expect(isMutationPath('GET', '/incidents/inc-1/simulate')).toBe(false);
      expect(isMutationPath('GET', '/incidents/inc-1/runs')).toBe(false);
      expect(isMutationPath('POST', '/incidents/inc-1/runs')).toBe(false);
      expect(isMutationPath('GET', '/legal-holds')).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle paths with special characters in IDs', () => {
      mockFeatureFlag.setEnabled(false);

      // UUID-like IDs
      const ctx1 = createMockContext('POST', '/incidents/550e8400-e29b-41d4-a716-446655440000/simulate');
      expect(() => guard.canActivate(ctx1)).toThrow(SimulationDisabledException);

      // Alphanumeric IDs
      const ctx2 = createMockContext('POST', '/incidents/INC123ABC/simulate');
      expect(() => guard.canActivate(ctx2)).toThrow(SimulationDisabledException);
    });

    it('should not block unrelated POST endpoints', () => {
      mockFeatureFlag.setEnabled(false);

      // These should NOT be blocked (not simulation mutations)
      const unrelatedPaths = [
        '/incidents/inc-1/comments',
        '/users/login',
        '/api/other',
      ];

      for (const path of unrelatedPaths) {
        const context = createMockContext('POST', path);
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('should handle feature flag toggle during runtime', () => {
      // Start enabled
      mockFeatureFlag.setEnabled(true);
      const ctx = createMockContext('POST', '/incidents/inc-1/simulate');
      expect(guard.canActivate(ctx)).toBe(true);

      // Disable
      mockFeatureFlag.setEnabled(false);
      expect(() => guard.canActivate(ctx)).toThrow(SimulationDisabledException);

      // Re-enable
      mockFeatureFlag.setEnabled(true);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
