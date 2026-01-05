/**
 * CASE HEALTH SERVICE (v36)
 * 
 * Dosya sağlık raporu hesaplama.
 * Score + locks + failed jobs + missing bundles + degraded mode
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CaseHealthReport {
  caseId: string;
  uyapDosyaId: string | null;
  workflowStage: string;
  score: number;
  degradedMode: boolean;
  locksOpen: Array<{
    id: string;
    lockType: string;
    reason: string | null;
    createdAt: Date;
  }>;
  failedJobs: Array<{
    id: string;
    recipeId: string;
    lastErrorCode: string | null;
    createdAt: Date;
  }>;
  pausedRecipes: Array<{
    recipeId: string;
    reason: string | null;
  }>;
  bundles: {
    recipeActive: boolean;
    uimapActive: boolean;
    decisionRulesActive: boolean;
    planActive: boolean;
    riskActive: boolean;
    recoveryActive: boolean;
  };
  missingBundles: string[];
}

@Injectable()
export class CaseHealthService {
  private readonly logger = new Logger(CaseHealthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Compute case health report
   */
  async computeCaseHealth(tenantId: string, caseId: string): Promise<CaseHealthReport> {
    // Get case
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        uyapDosyaId: true,
        workflowStage: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Case not found');
    }

    // Use type assertion for Icrabot models (Prisma client may need regeneration)
    const prismaAny = this.prisma as any;

    // Get open locks
    const locks: Array<{ id: string; lockType: string; reason: string | null; createdAt: Date }> = 
      await prismaAny.icrabotLock.findMany({
        where: { caseId, isOpen: true },
        select: {
          id: true,
          lockType: true,
          reason: true,
          createdAt: true,
        },
        take: 20,
      });

    // Get failed jobs
    const failedJobs: Array<{ id: string; recipeId: string; lastErrorCode: string | null; createdAt: Date }> = 
      await prismaAny.icrabotJobRun.findMany({
        where: { caseId, status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          recipeId: true,
          lastErrorCode: true,
          createdAt: true,
        },
        take: 20,
      });

    // Get paused recipes
    const pausedRecipes: Array<{ recipeId: string; reason: string | null }> = 
      await prismaAny.icrabotRecipePause.findMany({
        where: { tenantId, isPaused: true },
        select: {
          recipeId: true,
          reason: true,
        },
      });

    // Check degraded mode
    const systemConfig = await prismaAny.systemConfig.findFirst({
      where: { tenantId, key: 'degraded_mode' },
    });
    const degradedMode = systemConfig?.value 
      ? (systemConfig.value as Record<string, unknown>).enabled === true 
      : false;

    // Check bundle availability
    const bundleChecks = await Promise.all([
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'RECIPE', status: 'ACTIVE' },
      }),
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'UIMAP', status: 'ACTIVE' },
      }),
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'DECISION_RULES', status: 'ACTIVE' },
      }),
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'PLAN', status: 'ACTIVE' },
      }),
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'RISK', status: 'ACTIVE' },
      }),
      prismaAny.icrabotBundle.findFirst({
        where: { tenantId, type: 'RECOVERY', status: 'ACTIVE' },
      }),
    ]);

    const [recipeBundle, uimapBundle, decisionRulesBundle, planBundle, riskBundle, recoveryBundle] = bundleChecks;

    const bundles = {
      recipeActive: !!recipeBundle,
      uimapActive: !!uimapBundle,
      decisionRulesActive: !!decisionRulesBundle,
      planActive: !!planBundle,
      riskActive: !!riskBundle,
      recoveryActive: !!recoveryBundle,
    };

    // Calculate missing bundles
    const missingBundles: string[] = [];
    if (!bundles.recipeActive) missingBundles.push('recipe');
    if (!bundles.uimapActive) missingBundles.push('uimap');
    if (!bundles.decisionRulesActive) missingBundles.push('decision_rules');
    if (!bundles.planActive) missingBundles.push('plan');
    if (!bundles.riskActive) missingBundles.push('risk');
    if (!bundles.recoveryActive) missingBundles.push('recovery');

    // Calculate health score
    let score = 100;
    if (degradedMode) score -= 25;
    score -= Math.min(30, locks.length * 10);
    score -= Math.min(20, failedJobs.length);
    score -= 10 * missingBundles.length;
    score = Math.max(0, score);

    this.logger.log(`Case ${caseId} health score: ${score}`);

    return {
      caseId: caseData.id,
      uyapDosyaId: caseData.uyapDosyaId,
      workflowStage: caseData.workflowStage,
      score,
      degradedMode,
      locksOpen: locks.map((l) => ({
        id: l.id,
        lockType: l.lockType,
        reason: l.reason,
        createdAt: l.createdAt,
      })),
      failedJobs: failedJobs.map((j) => ({
        id: j.id,
        recipeId: j.recipeId,
        lastErrorCode: j.lastErrorCode,
        createdAt: j.createdAt,
      })),
      pausedRecipes: pausedRecipes.map((p) => ({
        recipeId: p.recipeId,
        reason: p.reason,
      })),
      bundles,
      missingBundles,
    };
  }
}
