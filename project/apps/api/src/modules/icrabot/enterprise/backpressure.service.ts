/**
 * BACKPRESSURE SERVICE (v38)
 * 
 * Rate limiting ve backpressure yönetimi.
 * UYAP yavaşladığında sistem kendini kısar.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface BackpressureConfig {
  maxActionsPerMinute: number;
  maxFailRate: number;
  cooldownSecondsOnFail: number;
}

export interface BackpressureStatus {
  isThrottled: boolean;
  currentActionsPerMinute: number;
  currentFailRate: number;
  throttledUntil: Date | null;
  reason: string | null;
}

@Injectable()
export class BackpressureService {
  private readonly logger = new Logger(BackpressureService.name);

  // Default configuration
  private readonly config: BackpressureConfig = {
    maxActionsPerMinute: 60,
    maxFailRate: 0.25,
    cooldownSecondsOnFail: 900, // 15 minutes
  };

  // In-memory throttle state (per tenant)
  private throttleState: Map<string, { until: Date; reason: string }> = new Map();

  // Action counter (per tenant, per minute)
  private actionCounter: Map<string, { count: number; windowStart: Date }> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Record an action (for rate limiting)
   */
  recordAction(tenantId: string): void {
    const now = new Date();
    const key = tenantId;
    const state = this.actionCounter.get(key);

    if (!state || now.getTime() - state.windowStart.getTime() > 60000) {
      // New minute window
      this.actionCounter.set(key, { count: 1, windowStart: now });
    } else {
      state.count++;
    }
  }

  /**
   * Get current actions per minute
   */
  getActionsPerMinute(tenantId: string): number {
    const state = this.actionCounter.get(tenantId);
    if (!state) return 0;

    const now = new Date();
    if (now.getTime() - state.windowStart.getTime() > 60000) {
      return 0;
    }
    return state.count;
  }

  /**
   * Check if system should be throttled
   */
  async checkBackpressure(tenantId: string): Promise<BackpressureStatus> {
    const now = new Date();

    // Check if already throttled
    const throttle = this.throttleState.get(tenantId);
    if (throttle && throttle.until > now) {
      return {
        isThrottled: true,
        currentActionsPerMinute: this.getActionsPerMinute(tenantId),
        currentFailRate: await this.calculateFailRate(tenantId),
        throttledUntil: throttle.until,
        reason: throttle.reason,
      };
    }

    // Check actions per minute
    const actionsPerMinute = this.getActionsPerMinute(tenantId);
    if (actionsPerMinute >= this.config.maxActionsPerMinute) {
      const until = new Date(now.getTime() + 60000); // Throttle for 1 minute
      this.throttleState.set(tenantId, { until, reason: 'Rate limit exceeded' });
      
      this.logger.warn(`Tenant ${tenantId} throttled: rate limit exceeded`);
      
      return {
        isThrottled: true,
        currentActionsPerMinute: actionsPerMinute,
        currentFailRate: await this.calculateFailRate(tenantId),
        throttledUntil: until,
        reason: 'Rate limit exceeded',
      };
    }

    // Check fail rate
    const failRate = await this.calculateFailRate(tenantId);
    if (failRate >= this.config.maxFailRate) {
      const until = new Date(now.getTime() + this.config.cooldownSecondsOnFail * 1000);
      this.throttleState.set(tenantId, { until, reason: 'High fail rate' });
      
      this.logger.warn(`Tenant ${tenantId} throttled: high fail rate (${(failRate * 100).toFixed(1)}%)`);
      
      return {
        isThrottled: true,
        currentActionsPerMinute: actionsPerMinute,
        currentFailRate: failRate,
        throttledUntil: until,
        reason: 'High fail rate',
      };
    }

    // Clear throttle if expired
    if (throttle) {
      this.throttleState.delete(tenantId);
    }

    return {
      isThrottled: false,
      currentActionsPerMinute: actionsPerMinute,
      currentFailRate: failRate,
      throttledUntil: null,
      reason: null,
    };
  }

  /**
   * Calculate fail rate from recent jobs
   */
  private async calculateFailRate(tenantId: string): Promise<number> {
    const prismaAny = this.prisma as any;
    const windowStart = new Date(Date.now() - 15 * 60 * 1000); // Last 15 minutes

    try {
      const [total, failed] = await Promise.all([
        prismaAny.icrabotJobRun?.count({
          where: {
            tenantId,
            finishedAt: { gte: windowStart },
          },
        }) || 0,
        prismaAny.icrabotJobRun?.count({
          where: {
            tenantId,
            status: 'FAILED',
            finishedAt: { gte: windowStart },
          },
        }) || 0,
      ]);

      if (total === 0) return 0;
      return failed / total;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Manually enable throttle (e.g., when UYAP is down)
   */
  enableThrottle(tenantId: string, durationSeconds: number, reason: string): void {
    const until = new Date(Date.now() + durationSeconds * 1000);
    this.throttleState.set(tenantId, { until, reason });
    this.logger.warn(`Tenant ${tenantId} manually throttled: ${reason}`);
  }

  /**
   * Manually disable throttle
   */
  disableThrottle(tenantId: string): void {
    this.throttleState.delete(tenantId);
    this.logger.log(`Tenant ${tenantId} throttle disabled`);
  }

  /**
   * Get current configuration
   */
  getConfig(): BackpressureConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BackpressureConfig>): void {
    Object.assign(this.config, updates);
  }
}
