/**
 * OPS CONTROLLER (v32)
 * 
 * Operasyon ekibi için yönetim endpoint'leri:
 * - Queue dashboard
 * - Recipe pause/unpause
 * - Job cancel
 * - SLA boost
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecipePauseService } from './recipe-pause.service';
import { SlaBoostService } from './sla-boost.service';
import { QueuePolicyLoaderService } from '../scheduler/queue-policy-loader.service';

interface PauseRecipeDto {
  recipeId: string;
  reason?: string;
}

interface UnpauseRecipeDto {
  recipeId: string;
}

interface CancelJobDto {
  jobId: string;
}

interface QueueDashboardResponse {
  policy: Record<string, unknown>;
  countsByStatus: Array<{ status: string; count: number }>;
  countsByRisk: Array<{ riskLevel: string; count: number }>;
  topRecipes: Array<{ recipeId: string; count: number }>;
  pausedRecipes: Array<{ recipeId: string; reason: string | null }>;
}

@Controller('icrabot/ops')
@UseGuards(JwtAuthGuard)
export class OpsController {
  constructor(
    private prisma: PrismaService,
    private recipePauseService: RecipePauseService,
    private slaBoostService: SlaBoostService,
    private queuePolicyLoader: QueuePolicyLoaderService,
  ) {}

  /**
   * GET /icrabot/ops/queue-dashboard
   * Queue durumu özeti
   */
  @Get('queue-dashboard')
  async getQueueDashboard(
    @CurrentUser() user: { tenantId: string },
  ): Promise<QueueDashboardResponse> {
    const { tenantId } = user;

    // Load queue policy
    const policy = await this.queuePolicyLoader.loadActivePolicy(tenantId);

    // Count by status - use raw query to avoid type issues
    const statusCounts = await (this.prisma as any).icrabotJobRun.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    });

    // Count by risk level
    const riskCounts = await (this.prisma as any).icrabotJobRun.groupBy({
      by: ['riskLevel'],
      where: { tenantId },
      _count: { id: true },
    });

    // Top 20 recipes by job count
    const topRecipes = await (this.prisma as any).icrabotJobRun.groupBy({
      by: ['recipeId'],
      where: { tenantId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });

    // Paused recipes
    const pausedRecipes = await this.recipePauseService.getPausedRecipes(tenantId);

    return {
      policy: policy as unknown as Record<string, unknown>,
      countsByStatus: (statusCounts as any[]).map((s: any) => ({
        status: s.status,
        count: s._count.id,
      })),
      countsByRisk: (riskCounts as any[]).map((r: any) => ({
        riskLevel: r.riskLevel,
        count: r._count.id,
      })),
      topRecipes: (topRecipes as any[]).map((r: any) => ({
        recipeId: r.recipeId,
        count: r._count.id,
      })),
      pausedRecipes: pausedRecipes.map((p) => ({
        recipeId: p.recipeId,
        reason: p.reason,
      })),
    };
  }

  /**
   * POST /icrabot/ops/pause-recipe
   * Recipe'yi duraklat
   */
  @Post('pause-recipe')
  async pauseRecipe(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: PauseRecipeDto,
  ) {
    if (!dto.recipeId) {
      throw new BadRequestException('recipeId gerekli');
    }

    const result = await this.recipePauseService.pauseRecipe(
      user.tenantId,
      dto.recipeId,
      dto.reason,
    );

    return {
      ok: true,
      recipeId: result.recipeId,
      paused: result.isPaused,
      reason: result.reason,
    };
  }

  /**
   * POST /icrabot/ops/unpause-recipe
   * Recipe'yi devam ettir
   */
  @Post('unpause-recipe')
  async unpauseRecipe(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: UnpauseRecipeDto,
  ) {
    if (!dto.recipeId) {
      throw new BadRequestException('recipeId gerekli');
    }

    const result = await this.recipePauseService.unpauseRecipe(
      user.tenantId,
      dto.recipeId,
    );

    return {
      ok: true,
      recipeId: result.recipeId,
      paused: result.isPaused,
    };
  }

  /**
   * POST /icrabot/ops/cancel-job
   * Job'u iptal et
   */
  @Post('cancel-job')
  async cancelJob(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CancelJobDto,
  ) {
    if (!dto.jobId) {
      throw new BadRequestException('jobId gerekli');
    }

    const job = await (this.prisma as any).icrabotJobRun.findFirst({
      where: {
        tenantId: user.tenantId,
        jobId: dto.jobId,
      },
    });

    if (!job) {
      throw new NotFoundException('Job bulunamadı');
    }

    if (job.status === 'DONE' || job.status === 'FAILED') {
      throw new BadRequestException('Job zaten tamamlanmış');
    }

    await (this.prisma as any).icrabotJobRun.update({
      where: { id: job.id },
      data: {
        status: 'QUARANTINED',
        lastErrorCode: 'CANCELLED',
        lastErrorMessage: 'Ops tarafından iptal edildi',
      },
    });

    return {
      ok: true,
      jobId: job.jobId,
      status: 'QUARANTINED',
    };
  }

  /**
   * POST /icrabot/ops/apply-sla-boost
   * SLA boost'u tüm queued job'lara uygula
   */
  @Post('apply-sla-boost')
  async applySlaBoost(@CurrentUser() user: { tenantId: string }) {
    const updatedCount = await this.slaBoostService.applyBoostToQueuedJobs(
      user.tenantId,
    );

    return {
      ok: true,
      updatedCount,
    };
  }

  /**
   * GET /icrabot/ops/paused-recipes
   * Duraklatılmış recipe'leri listele
   */
  @Get('paused-recipes')
  async getPausedRecipes(@CurrentUser() user: { tenantId: string }) {
    const paused = await this.recipePauseService.getPausedRecipes(user.tenantId);

    return {
      ok: true,
      recipes: paused,
    };
  }
}
