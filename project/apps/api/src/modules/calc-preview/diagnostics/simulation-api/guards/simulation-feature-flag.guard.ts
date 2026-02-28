/**
 * Simulation Feature Flag Guard
 * 
 * Sprint 2F - Task 5.1
 * 
 * RED LINE #1: Mutations 503, reads open
 * - 503 only for POST simulate, POST export-bundle, POST archive
 * - Read endpoints work when flag disabled
 * 
 * Mutation Endpoints (blocked when disabled):
 * - POST /incidents/:id/simulate
 * - POST /incidents/:id/runs/:runId/export-bundle
 * - POST /legal-holds/:snapshotId/archive
 * - POST /v1/incidents/:id/simulations/:runId/promote  (Sprint 3)
 * - POST /v1/incidents/:id/simulations/rank             (Sprint 3)
 * - POST /v1/incidents/:id/simulations                  (Sprint 3 v1 alias)
 * 
 * Read Endpoints (always allowed):
 * - GET /incidents/:id/runs
 * - GET /incidents/:id/runs/latest
 * - GET /incidents/:id/runs/:runId
 * - GET /evidence-bundles/:bundleId
 * - GET /evidence-bundles/:bundleId/verify
 * - GET /legal-holds
 * - GET /legal-holds/stats
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ISimulationFeatureFlagService,
  SimulationFeatureFlagService,
} from '../simulation-feature-flag.service';
import { SimulationDisabledException } from '../simulation-error.types';

// ============================================================================
// Mutation Endpoint Patterns
// ============================================================================

/**
 * Patterns for mutation endpoints that should be blocked when feature is disabled
 */
const MUTATION_PATTERNS = [
  // POST /incidents/:id/simulate
  { method: 'POST', pattern: /\/incidents\/[^/]+\/simulate$/ },
  // POST /incidents/:id/runs/:runId/export-bundle
  { method: 'POST', pattern: /\/incidents\/[^/]+\/runs\/[^/]+\/export-bundle$/ },
  // POST /legal-holds/:snapshotId/archive
  { method: 'POST', pattern: /\/legal-holds\/[^/]+\/archive$/ },
  // Sprint 3: POST /v1/incidents/:id/simulations/:runId/promote
  { method: 'POST', pattern: /\/v1\/incidents\/[^/]+\/simulations\/[^/]+\/promote$/ },
  // Sprint 3: POST /v1/incidents/:id/simulations/rank
  { method: 'POST', pattern: /\/v1\/incidents\/[^/]+\/simulations\/rank$/ },
  // Sprint 3: POST /v1/incidents/:id/simulations (v1 alias for simulate)
  { method: 'POST', pattern: /\/v1\/incidents\/[^/]+\/simulations$/ },
];

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class SimulationFeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(SimulationFeatureFlagGuard.name);
  private featureFlagService: ISimulationFeatureFlagService;

  constructor(@Optional() @Inject('ISimulationFeatureFlagService') featureFlagService?: ISimulationFeatureFlagService) {
    this.featureFlagService = featureFlagService || new SimulationFeatureFlagService();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    
    // If feature is enabled, allow all requests
    if (this.featureFlagService.isSimulationEnabled()) {
      return true;
    }

    // Feature is disabled - check if this is a mutation endpoint
    const isMutation = this.isMutationEndpoint(request.method, request.path);

    if (isMutation) {
      this.logger.warn('[SimulationFeatureFlag] Mutation blocked - feature disabled', {
        method: request.method,
        path: request.path,
      });
      throw new SimulationDisabledException();
    }

    // Read endpoints are allowed even when feature is disabled
    this.logger.debug('[SimulationFeatureFlag] Read allowed - feature disabled', {
      method: request.method,
      path: request.path,
    });
    return true;
  }

  /**
   * Check if the request is a mutation endpoint
   */
  private isMutationEndpoint(method: string, path: string): boolean {
    return MUTATION_PATTERNS.some(
      ({ method: m, pattern }) => method === m && pattern.test(path),
    );
  }

  /**
   * Set feature flag service (for testing)
   */
  setFeatureFlagService(service: ISimulationFeatureFlagService): void {
    this.featureFlagService = service;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a path matches any mutation pattern
 * Exported for testing
 */
export function isMutationPath(method: string, path: string): boolean {
  return MUTATION_PATTERNS.some(
    ({ method: m, pattern }) => method === m && pattern.test(path),
  );
}

/**
 * Get list of mutation patterns
 * Exported for documentation/testing
 */
export function getMutationPatterns(): Array<{ method: string; pattern: RegExp }> {
  return [...MUTATION_PATTERNS];
}
