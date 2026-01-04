/**
 * JOB MONITOR SERVICE (v12)
 * 
 * Job/Task izleme ve yönetimi.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  JobRun,
  JobStep,
  JobFilter,
  JobStatus,
  JobMetrics,
  JobAction,
  JobActionRequest,
  JOB_RETRY_CONFIG,
  JOB_STATUS_TRANSITIONS,
  JOB_ALERT_THRESHOLDS,
} from '../config/job-monitor.config';

@Injectable()
export class JobMonitorService {
  constructor(private prisma: PrismaService) {}

  // ==================== JOB QUERIES ====================

  async getJobs(filter: JobFilter, page = 1, pageSize = 50): Promise<{ jobs: JobRun[]; total: number }> {
    const where: any = {
      tenantId: filter.tenantId,
      ...(filter.caseId && { caseId: filter.caseId }),
      ...(filter.debtorId && { debtorId: filter.debtorId }),
      ...(filter.recipeId && { recipeId: filter.recipeId }),
      ...(filter.riskLevel && { riskLevel: filter.riskLevel }),
      ...(filter.status && {
        status: Array.isArray(filter.status) ? { in: filter.status } : filter.status,
      }),
      ...(filter.startedAfter && { startedAt: { gte: filter.startedAfter } }),
      ...(filter.startedBefore && { startedAt: { lte: filter.startedBefore } }),
    };

    const [jobs, total] = await Promise.all([
      this.prisma.icrabotJobRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.icrabotJobRun.count({ where }),
    ]);

    return {
      jobs: jobs.map(this.mapJobRun),
      total,
    };
  }

  async getJob(jobId: string, tenantId: string): Promise<JobRun & { steps: JobStep[] }> {
    const job = await this.prisma.icrabotJobRun.findFirst({
      where: { jobId, tenantId },
      include: { steps: { orderBy: { stepNo: 'asc' } } },
    });

    if (!job) {
      throw new NotFoundException(`Job bulunamadı: ${jobId}`);
    }

    return {
      ...this.mapJobRun(job),
      steps: job.steps.map(this.mapJobStep),
    };
  }

  async getJobSteps(jobId: string, tenantId: string): Promise<JobStep[]> {
    const steps = await this.prisma.icrabotJobStep.findMany({
      where: { jobId },
      orderBy: { stepNo: 'asc' },
    });

    return steps.map(this.mapJobStep);
  }

  // ==================== JOB ACTIONS ====================

  async retryJob(jobId: string, tenantId: string, userId: string): Promise<void> {
    const job = await this.prisma.icrabotJobRun.findFirst({
      where: { jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job bulunamadı: ${jobId}`);
    }

    const allowedStatuses: JobStatus[] = ['failed'];
    if (!allowedStatuses.includes(job.status as JobStatus)) {
      throw new BadRequestException(`Bu durumda retry yapılamaz: ${job.status}`);
    }

    if (job.attempt >= JOB_RETRY_CONFIG.maxAttempts) {
      throw new BadRequestException(`Maksimum deneme sayısına ulaşıldı: ${job.attempt}`);
    }

    await this.prisma.icrabotJobRun.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        attempt: job.attempt + 1,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    // Log action
    await this.logJobAction({
      jobId,
      action: 'retry',
      performedBy: userId,
    });
  }

  async quarantineCase(caseId: string, tenantId: string, userId: string, reason?: string): Promise<void> {
    // Update all pending/failed jobs for this case
    await this.prisma.icrabotJobRun.updateMany({
      where: {
        caseId,
        tenantId,
        status: { in: ['queued', 'running', 'waiting', 'blocked', 'failed'] },
      },
      data: {
        status: 'quarantined',
        lastErrorMessage: reason || 'Manuel karantina',
      },
    });

    // Mark case as quarantined
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        metadata: {
          quarantined: true,
          quarantinedAt: new Date().toISOString(),
          quarantinedBy: userId,
          quarantineReason: reason,
        },
      },
    });

    // Log action
    await this.logJobAction({
      jobId: `case:${caseId}`,
      action: 'quarantine',
      reason,
      performedBy: userId,
    });
  }

  async unquarantineCase(caseId: string, tenantId: string, userId: string): Promise<void> {
    // Update quarantined jobs back to queued
    await this.prisma.icrabotJobRun.updateMany({
      where: {
        caseId,
        tenantId,
        status: 'quarantined',
      },
      data: {
        status: 'queued',
        attempt: 1,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    // Remove quarantine flag from case
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        metadata: {
          quarantined: false,
          unquarantinedAt: new Date().toISOString(),
          unquarantinedBy: userId,
        },
      },
    });

    // Log action
    await this.logJobAction({
      jobId: `case:${caseId}`,
      action: 'unquarantine',
      performedBy: userId,
    });
  }

  async disableRecipeForCase(
    recipeId: string,
    caseId: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.icrabotCaseRecipeOverride.upsert({
      where: {
        caseId_recipeId_tenantId: { caseId, recipeId, tenantId },
      },
      create: {
        caseId,
        recipeId,
        tenantId,
        enabled: false,
        disabledBy: userId,
        disabledAt: new Date(),
      },
      update: {
        enabled: false,
        disabledBy: userId,
        disabledAt: new Date(),
      },
    });

    // Log action
    await this.logJobAction({
      jobId: `recipe:${recipeId}:case:${caseId}`,
      action: 'disable_recipe_for_case',
      performedBy: userId,
    });
  }

  // ==================== METRICS ====================

  async getJobMetrics(tenantId: string, hours = 24): Promise<JobMetrics> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const jobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        tenantId,
        startedAt: { gte: since },
      },
      select: {
        status: true,
        recipeId: true,
        durationMs: true,
      },
    });

    const byStatus: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      waiting: 0,
      blocked: 0,
      done: 0,
      failed: 0,
      quarantined: 0,
    };

    const byRecipe: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const job of jobs) {
      byStatus[job.status as JobStatus]++;
      byRecipe[job.recipeId] = (byRecipe[job.recipeId] || 0) + 1;
      if (job.durationMs) {
        totalDuration += job.durationMs;
        durationCount++;
      }
    }

    const totalJobs = jobs.length;
    const failedJobs = byStatus.failed + byStatus.quarantined;

    return {
      totalJobs,
      byStatus,
      byRecipe,
      avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      failureRate: totalJobs > 0 ? failedJobs / totalJobs : 0,
      quarantinedCount: byStatus.quarantined,
    };
  }

  async checkAlerts(tenantId: string): Promise<{ type: string; severity: 'warning' | 'critical'; message: string }[]> {
    const metrics = await this.getJobMetrics(tenantId);
    const alerts: { type: string; severity: 'warning' | 'critical'; message: string }[] = [];

    // Failure rate alerts
    if (metrics.failureRate >= JOB_ALERT_THRESHOLDS.failureRateCritical) {
      alerts.push({
        type: 'failure_rate',
        severity: 'critical',
        message: `Kritik hata oranı: ${(metrics.failureRate * 100).toFixed(1)}%`,
      });
    } else if (metrics.failureRate >= JOB_ALERT_THRESHOLDS.failureRateWarning) {
      alerts.push({
        type: 'failure_rate',
        severity: 'warning',
        message: `Yüksek hata oranı: ${(metrics.failureRate * 100).toFixed(1)}%`,
      });
    }

    // Quarantine alerts
    if (metrics.quarantinedCount >= JOB_ALERT_THRESHOLDS.quarantinedCountCritical) {
      alerts.push({
        type: 'quarantine',
        severity: 'critical',
        message: `Kritik karantina sayısı: ${metrics.quarantinedCount}`,
      });
    } else if (metrics.quarantinedCount >= JOB_ALERT_THRESHOLDS.quarantinedCountWarning) {
      alerts.push({
        type: 'quarantine',
        severity: 'warning',
        message: `Yüksek karantina sayısı: ${metrics.quarantinedCount}`,
      });
    }

    // Duration alerts
    if (metrics.avgDurationMs >= JOB_ALERT_THRESHOLDS.avgDurationCriticalMs) {
      alerts.push({
        type: 'duration',
        severity: 'critical',
        message: `Kritik ortalama süre: ${(metrics.avgDurationMs / 1000).toFixed(1)}s`,
      });
    } else if (metrics.avgDurationMs >= JOB_ALERT_THRESHOLDS.avgDurationWarningMs) {
      alerts.push({
        type: 'duration',
        severity: 'warning',
        message: `Yüksek ortalama süre: ${(metrics.avgDurationMs / 1000).toFixed(1)}s`,
      });
    }

    return alerts;
  }

  // ==================== HELPERS ====================

  private mapJobRun(job: any): JobRun {
    return {
      jobId: job.jobId,
      caseId: job.caseId,
      debtorId: job.debtorId,
      recipeId: job.recipeId,
      recipeVersion: job.recipeVersion,
      status: job.status as JobStatus,
      riskLevel: job.riskLevel,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      lockBlockedBy: job.lockBlockedBy,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: job.lastErrorMessage,
      tenantId: job.tenantId,
    };
  }

  private mapJobStep(step: any): JobStep {
    return {
      stepId: step.stepId,
      jobId: step.jobId,
      stepNo: step.stepNo,
      actionType: step.actionType,
      uyapNavPath: step.uyapNavPath,
      status: step.status,
      snapshotHash: step.snapshotHash,
      proofRef: step.proofRef,
      createdAt: step.createdAt,
    };
  }

  private async logJobAction(params: {
    jobId: string;
    action: JobAction;
    reason?: string;
    performedBy: string;
  }): Promise<void> {
    await this.prisma.icrabotJobAction.create({
      data: {
        jobId: params.jobId,
        action: params.action,
        reason: params.reason,
        performedBy: params.performedBy,
      },
    });
  }
}
