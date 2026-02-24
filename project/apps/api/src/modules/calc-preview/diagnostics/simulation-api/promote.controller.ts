/**
 * Promote Controller
 *
 * Sprint 3 - Task 2.3
 *
 * POST /v1/incidents/:id/simulations/:runId/promote
 *
 * Guards (same chain as simulation):
 *   FeatureFlag → RBAC → RateLimit
 *
 * RBAC scope: uses SimulationRBACGuard — same guard, no separate/narrow definition.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import {
  Controller,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';
import { PromoteService, PromoteResult } from './promote.service';
import { PromoteResponseDto, PromoteDriftResponseDto, PromoteGuardBlockedResponseDto } from './promote.dto';

// ============================================================================
// Controller
// ============================================================================

@Controller()
export class PromoteController {
  private readonly logger = new Logger(PromoteController.name);

  constructor(private readonly promoteService: PromoteService) {}

  @Post('v1/incidents/:id/simulations/:runId/promote')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard, SimulationRateLimitGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async promote(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
    @SimulationTenant() tenant: SimulationTenantContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PromoteResponseDto | PromoteDriftResponseDto | PromoteGuardBlockedResponseDto> {
    const result = await this.promoteService.promote(incidentId, runId, tenant.userId);

    switch (result.status) {
      case 'ACCEPTED':
      case 'ALREADY_PROMOTED':
        // 202 Accepted (set by @HttpCode)
        return { requestId: result.requestId, createdAt: result.createdAt };

      case 'DRIFT_DETECTED':
        res.status(HttpStatus.CONFLICT);
        return { driftScore: result.driftScore, topContributors: result.topContributors };

      case 'GUARD_BLOCKED':
        res.status(HttpStatus.SERVICE_UNAVAILABLE);
        return { decision: result.guard.decision, reason: result.guard.reason };
    }
  }
}
