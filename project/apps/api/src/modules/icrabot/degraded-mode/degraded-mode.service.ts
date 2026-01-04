/**
 * DEGRADED MODE SERVICE (v19-v21)
 * 
 * Sistem degraded mode'dayken yüksek riskli işlemleri engeller.
 * Selector health istatistiğine göre otomatik aç/kapat.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface DegradedModeStatus {
  isActive: boolean;
  reason?: string;
  activatedAt?: Date;
  activatedBy?: string;
}

export interface SelectorHealthStats {
  totalAttempts: number;
  successCount: number;
  failCount: number;
  failRate: number;
  lastFailedAt?: Date;
}

@Injectable()
export class DegradedModeService {
  private readonly logger = new Logger(DegradedModeService.name);
  
  // Thresholds for auto degraded mode
  private readonly FAIL_RATE_THRESHOLD = 0.3; // 30% fail rate triggers degraded mode
  private readonly MIN_ATTEMPTS_FOR_AUTO = 10; // Minimum attempts before auto-toggle
  private readonly RECOVERY_FAIL_RATE = 0.1; // 10% fail rate to recover

  constructor(private prisma: PrismaService) {}

  /**
   * Check if degraded mode is active for a tenant
   */
  async isActive(tenantId: string): Promise<DegradedModeStatus> {
    const config = await this.prisma.systemConfig.findFirst({
      where: { tenantId, key: 'degraded_mode' },
    });

    if (!config) {
      return { isActive: false };
    }

    const value = config.value as any;
    return {
      isActive: value?.active === true,
      reason: value?.reason,
      activatedAt: value?.activatedAt ? new Date(value.activatedAt) : undefined,
      activatedBy: value?.activatedBy,
    };
  }

  /**
   * Activate degraded mode
   */
  async activate(tenantId: string, reason: string, activatedBy?: string): Promise<void> {
    const value = {
      active: true,
      reason,
      activatedAt: new Date().toISOString(),
      activatedBy,
    };

    await this.prisma.systemConfig.upsert({
      where: { tenantId_key: { tenantId, key: 'degraded_mode' } },
      create: { tenantId, key: 'degraded_mode', value },
      update: { value },
    });

    this.logger.warn(`Degraded mode ACTIVATED for tenant ${tenantId}: ${reason}`);
  }

  /**
   * Deactivate degraded mode
   */
  async deactivate(tenantId: string, deactivatedBy?: string): Promise<void> {
    const value = {
      active: false,
      deactivatedAt: new Date().toISOString(),
      deactivatedBy,
    };

    await this.prisma.systemConfig.upsert({
      where: { tenantId_key: { tenantId, key: 'degraded_mode' } },
      create: { tenantId, key: 'degraded_mode', value },
      update: { value },
    });

    this.logger.log(`Degraded mode DEACTIVATED for tenant ${tenantId}`);
  }

  /**
   * Check if a job should be blocked due to degraded mode
   */
  async shouldBlockJob(tenantId: string, riskLevel: string): Promise<{ blocked: boolean; reason?: string }> {
    const status = await this.isActive(tenantId);
    
    if (!status.isActive) {
      return { blocked: false };
    }

    // Block high-impact jobs in degraded mode
    const blockedLevels = ['HIGH', 'CRITICAL', 'MEDIUM'];
    if (blockedLevels.includes(riskLevel)) {
      return {
        blocked: true,
        reason: `Degraded mode active: ${status.reason}. ${riskLevel} risk jobs are blocked.`,
      };
    }

    return { blocked: false };
  }

  /**
   * Log selector health and auto-toggle degraded mode
   */
  async logSelectorHealth(
    tenantId: string,
    selectorKey: string,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.selectorHealthLog.create({
      data: {
        tenantId,
        selectorKey,
        success,
        errorMessage,
      },
    });

    // Check if we should auto-toggle degraded mode
    await this.autoToggleDegradedMode(tenantId);
  }

  /**
   * Get selector health statistics
   */
  async getSelectorHealthStats(tenantId: string, hours = 24): Promise<SelectorHealthStats> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.prisma.selectorHealthLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
    });

    const totalAttempts = logs.length;
    const successCount = logs.filter(l => l.success).length;
    const failCount = totalAttempts - successCount;
    const failRate = totalAttempts > 0 ? failCount / totalAttempts : 0;
    const lastFailed = logs.filter(l => !l.success).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    return {
      totalAttempts,
      successCount,
      failCount,
      failRate,
      lastFailedAt: lastFailed?.createdAt,
    };
  }

  /**
   * Auto-toggle degraded mode based on selector health
   */
  private async autoToggleDegradedMode(tenantId: string): Promise<void> {
    const stats = await this.getSelectorHealthStats(tenantId, 1); // Last hour

    if (stats.totalAttempts < this.MIN_ATTEMPTS_FOR_AUTO) {
      return; // Not enough data
    }

    const status = await this.isActive(tenantId);

    if (!status.isActive && stats.failRate >= this.FAIL_RATE_THRESHOLD) {
      // Activate degraded mode
      await this.activate(
        tenantId,
        `Auto-activated: ${(stats.failRate * 100).toFixed(1)}% selector fail rate in last hour`,
        'SYSTEM',
      );
    } else if (status.isActive && stats.failRate <= this.RECOVERY_FAIL_RATE) {
      // Deactivate degraded mode
      await this.deactivate(tenantId, 'SYSTEM');
    }
  }
}
