/**
 * ScenarioRanker Controller
 *
 * Sprint 3 - Task 4.2
 *
 * POST /v1/incidents/:id/simulations/rank
 *
 * Guards: FeatureFlag → RBAC → RateLimit (same chain as simulation).
 * Cache-Control: no-store (admin/ops endpoint).
 *
 * Error mapping:
 *   - Feature flag disabled → 503 SIMULATION_DISABLED
 *   - RBAC unauthorized → 403 FORBIDDEN_TENANT_SCOPE
 *   - Rate limit exceeded → 429 TOO_MANY_SIMULATIONS
 *   - Validation fail → 400 Bad Request
 *   - Success → 200 + RankedResult
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §3
 */

import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';
import { ScenarioRankerService } from './scenario-ranker.service';
import { SimulationFeatureFlagService } from './simulation-feature-flag.service';
import { SimulationDisabledException } from './simulation-error.types';
import {
  ScenarioRankerRequestDto,
  ScenarioRankerResponseDto,
  validateRankRequest,
} from './scenario-ranker.dto';

// ============================================================================
// Controller
// ============================================================================

@Controller()
export class ScenarioRankerController {
  private readonly logger = new Logger(ScenarioRankerController.name);

  constructor(
    private readonly rankerService: ScenarioRankerService,
    private readonly featureFlag: SimulationFeatureFlagService,
  ) {}

  @Post('v1/incidents/:id/simulations/rank')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard, SimulationRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async rank(
    @Param('id') _incidentId: string,
    @Body() body: ScenarioRankerRequestDto,
  ): Promise<ScenarioRankerResponseDto> {
    // Belt-and-suspenders: guard already checks, but service-level safety
    if (!this.featureFlag.isSimulationEnabled()) {
      throw new SimulationDisabledException();
    }

    // Validation
    const errors = validateRankRequest(body);
    if (errors) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: errors,
      });
    }

    const seed = body.seed ?? 0;

    this.logger.debug('[ScenarioRanker] Ranking request', {
      incidentId: _incidentId,
      scenarioCount: body.scenarios.length,
      seed,
    });

    const result = this.rankerService.rank(body.scenarios, seed);

    return result;
  }
}
