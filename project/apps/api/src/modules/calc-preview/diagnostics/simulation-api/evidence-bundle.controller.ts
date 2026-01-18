/**
 * Evidence Bundle Controller
 * 
 * Sprint 2F - Task 8.1-8.3
 * 
 * REST endpoints for evidence bundle management:
 * - POST /incidents/:id/runs/:runId/export-bundle
 * - GET /evidence-bundles/:bundleId
 * - GET /evidence-bundles/:bundleId/verify
 * 
 * RED LINE #5: Bundle verify mismatch returns 200 + ok:false
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { EvidenceBundleService } from '../simulation/evidence-bundle.service';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import { canonicalHash } from '../simulation/determinism';
import {
  ExportBundleResponseDto,
  BundleResponseDto,
  VerifyBundleResponseDto,
} from './simulation.dto';
import {
  IncidentNotFoundException,
  RunNotFoundException,
  BundleNotFoundException,
} from './simulation-error.types';
import { EvidenceBundle } from '../simulation/evidence-bundle.types';

// ============================================================================
// In-Memory Bundle Store
// ============================================================================

class BundleStore {
  private readonly store: Map<string, EvidenceBundle> = new Map();

  save(bundle: EvidenceBundle): void {
    this.store.set(bundle.meta.bundleId, bundle);
  }

  get(bundleId: string): EvidenceBundle | null {
    return this.store.get(bundleId) || null;
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// Controller
// ============================================================================

@Controller()
export class EvidenceBundleController {
  private readonly logger = new Logger(EvidenceBundleController.name);
  private readonly bundleStore = new BundleStore();

  constructor(
    private readonly bundleService: EvidenceBundleService,
    private readonly incidentStore: InMemoryIncidentStore,
  ) {}

  // ============================================================================
  // POST /incidents/:id/runs/:runId/export-bundle
  // ============================================================================

  /**
   * Export evidence bundle for a simulation run
   * 
   * Guards: FeatureFlag (503), RBAC (403)
   * 
   * @param incidentId Incident ID
   * @param runId Run ID
   * @param ctx Tenant context
   * @returns ExportBundleResponseDto
   */
  @Post('incidents/:id/runs/:runId/export-bundle')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard)
  async exportBundle(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
    @SimulationTenant() ctx: SimulationTenantContext,
  ): Promise<ExportBundleResponseDto> {
    this.logger.debug('[EvidenceBundleController] POST /export-bundle', {
      incidentId,
      runId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    // 1. Verify incident exists and tenant access
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      throw new IncidentNotFoundException(incidentId);
    }

    if (incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    // 2. Export bundle
    const result = await this.bundleService.exportBundle(incidentId, runId, {
      actor: 'user', // User-initiated export
    });

    if (!result.success) {
      if (result.error === 'INCIDENT_NOT_FOUND') {
        throw new IncidentNotFoundException(incidentId);
      }
      if (result.error === 'NO_RUN_DATA') {
        throw new RunNotFoundException(runId);
      }
      throw new Error(result.errorMessage || 'Failed to export bundle');
    }

    // 3. Store bundle for retrieval
    this.bundleStore.save(result.bundle!);

    this.logger.debug('[EvidenceBundleController] Bundle exported', {
      bundleId: result.bundle!.meta.bundleId,
      contentHash: result.bundle!.contentHash,
    });

    return {
      bundleId: result.bundle!.meta.bundleId,
      contentHash: result.bundle!.contentHash,
    };
  }

  // ============================================================================
  // GET /evidence-bundles/:bundleId
  // ============================================================================

  /**
   * Get evidence bundle by ID
   * 
   * Guards: RBAC (403)
   * 
   * @param bundleId Bundle ID
   * @param ctx Tenant context
   * @returns BundleResponseDto
   */
  @Get('evidence-bundles/:bundleId')
  @UseGuards(SimulationRBACGuard)
  async getBundle(
    @Param('bundleId') bundleId: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<BundleResponseDto> {
    this.logger.debug('[EvidenceBundleController] GET /evidence-bundles/:bundleId', {
      bundleId,
      tenantId: ctx?.tenantId,
    });

    // 1. Get bundle
    const bundle = this.bundleStore.get(bundleId);
    if (!bundle) {
      throw new BundleNotFoundException(bundleId);
    }

    // 2. Verify tenant access (check incident tenant)
    if (ctx && ctx.role !== 'internal-ops') {
      const incident = await this.incidentStore.get(bundle.payload.incidentId);
      if (!incident || incident.tenantId !== ctx.tenantId) {
        throw new BundleNotFoundException(bundleId);
      }
    }

    return {
      meta: {
        bundleId: bundle.meta.bundleId,
        exportedAt: bundle.meta.exportedAt,
        exportedBy: bundle.meta.exportedBy,
        formatVersion: bundle.meta.formatVersion,
      },
      payload: bundle.payload,
      contentHash: bundle.contentHash,
    };
  }

  // ============================================================================
  // GET /evidence-bundles/:bundleId/verify
  // ============================================================================

  /**
   * Verify evidence bundle integrity
   * 
   * RED LINE #5: Returns 200 + ok:false for mismatch (not error)
   * 
   * @param bundleId Bundle ID
   * @returns VerifyBundleResponseDto
   */
  @Get('evidence-bundles/:bundleId/verify')
  async verifyBundle(
    @Param('bundleId') bundleId: string,
  ): Promise<VerifyBundleResponseDto> {
    this.logger.debug('[EvidenceBundleController] GET /evidence-bundles/:bundleId/verify', {
      bundleId,
    });

    // 1. Get bundle
    const bundle = this.bundleStore.get(bundleId);
    if (!bundle) {
      throw new BundleNotFoundException(bundleId);
    }

    // 2. Compute actual hash
    const actualHash = canonicalHash(bundle.payload);
    const expectedHash = bundle.contentHash;
    const ok = actualHash === expectedHash;

    // 3. Log mismatch for audit (RED LINE #5)
    if (!ok) {
      this.logger.warn('[EvidenceBundleController] Bundle integrity mismatch', {
        bundleId,
        expectedHash,
        actualHash,
      });
    }

    // RED LINE #5: 200 OK even for mismatch
    return {
      ok,
      expectedHash,
      actualHash,
    };
  }

  // ============================================================================
  // Testing Helpers
  // ============================================================================

  /**
   * Clear bundle store (for testing)
   */
  clearBundleStore(): void {
    this.bundleStore.clear();
  }

  /**
   * Get bundle directly (for testing)
   */
  getBundleFromStore(bundleId: string): EvidenceBundle | null {
    return this.bundleStore.get(bundleId);
  }
}
