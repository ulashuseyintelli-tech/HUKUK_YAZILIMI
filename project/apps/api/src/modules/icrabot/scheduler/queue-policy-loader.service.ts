/**
 * QUEUE POLICY LOADER SERVICE (v31)
 * 
 * Queue policy bundle'dan concurrency ve quota ayarlarını yükler.
 * bundle_kind='queue_policy' olan ACTIVE ParamBundle kullanılır.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as yaml from 'js-yaml';

export interface RiskQueueConfig {
  max_running: number;
  priority_boost: number;
}

export interface QueuePolicy {
  global_concurrency: number;
  per_case_concurrency: number;
  per_case_write_concurrency: number;
  risk_queues: Record<string, RiskQueueConfig>;
}

// Default policy
const DEFAULT_POLICY: QueuePolicy = {
  global_concurrency: 20,
  per_case_concurrency: 6,
  per_case_write_concurrency: 1,
  risk_queues: {
    HIGH_IMPACT_WRITE: { max_running: 1, priority_boost: -10 },
    CONTROLLED_WRITE: { max_running: 3, priority_boost: -5 },
    READ_ONLY: { max_running: 30, priority_boost: 0 },
  },
};

@Injectable()
export class QueuePolicyLoaderService {
  private readonly logger = new Logger(QueuePolicyLoaderService.name);
  private cache: { data: QueuePolicy; loadedAt: Date } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private prisma: PrismaService) {}

  /**
   * Load active queue policy
   */
  async loadActivePolicy(tenantId: string): Promise<QueuePolicy> {
    if (this.cache && Date.now() - this.cache.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.cache.data;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'QUEUE_POLICY',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      this.logger.warn(`No active queue_policy bundle for tenant ${tenantId}, using defaults`);
      return DEFAULT_POLICY;
    }

    const data = this.parseContent(bundle.content);
    const policy = data.policy || data;

    const result: QueuePolicy = {
      global_concurrency: Number(policy.global_concurrency) || DEFAULT_POLICY.global_concurrency,
      per_case_concurrency: Number(policy.per_case_concurrency) || DEFAULT_POLICY.per_case_concurrency,
      per_case_write_concurrency: Number(policy.per_case_write_concurrency) || DEFAULT_POLICY.per_case_write_concurrency,
      risk_queues: this.parseRiskQueues(policy.risk_queues),
    };

    this.cache = { data: result, loadedAt: new Date() };
    return result;
  }

  /**
   * Parse risk queues config
   */
  private parseRiskQueues(riskQueues: any): Record<string, RiskQueueConfig> {
    if (!riskQueues || typeof riskQueues !== 'object') {
      return DEFAULT_POLICY.risk_queues;
    }

    const result: Record<string, RiskQueueConfig> = {};
    for (const [key, value] of Object.entries(riskQueues)) {
      const v = value as any;
      // Normalize key to uppercase
      const normalizedKey = key.toUpperCase().replace(/-/g, '_');
      result[normalizedKey] = {
        max_running: Number(v?.max_running) || 10,
        priority_boost: Number(v?.priority_boost) || 0,
      };
    }
    return result;
  }

  /**
   * Get priority boost for a risk level
   */
  async getPriorityBoost(tenantId: string, riskLevel: string): Promise<number> {
    const policy = await this.loadActivePolicy(tenantId);
    const normalizedRisk = riskLevel.toUpperCase().replace(/-/g, '_');
    return policy.risk_queues[normalizedRisk]?.priority_boost || 0;
  }

  /**
   * Check if global concurrency limit is reached
   */
  async isGlobalLimitReached(tenantId: string): Promise<boolean> {
    const policy = await this.loadActivePolicy(tenantId);
    
    const runningCount = await this.prisma.icrabotJobRun.count({
      where: {
        tenantId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
    });

    return runningCount >= policy.global_concurrency;
  }

  /**
   * Check if per-case concurrency limit is reached
   */
  async isCaseLimitReached(tenantId: string, caseId: string): Promise<boolean> {
    const policy = await this.loadActivePolicy(tenantId);
    
    const runningCount = await this.prisma.icrabotJobRun.count({
      where: {
        tenantId,
        caseId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
    });

    return runningCount >= policy.per_case_concurrency;
  }

  /**
   * Check if per-case write concurrency limit is reached
   */
  async isCaseWriteLimitReached(tenantId: string, caseId: string): Promise<boolean> {
    const policy = await this.loadActivePolicy(tenantId);
    
    const runningCount = await this.prisma.icrabotJobRun.count({
      where: {
        tenantId,
        caseId,
        status: { in: ['QUEUED', 'RUNNING'] },
        riskLevel: { in: ['CONTROLLED_WRITE', 'HIGH_IMPACT_WRITE'] },
      },
    });

    return runningCount >= policy.per_case_write_concurrency;
  }

  /**
   * Check if risk queue limit is reached
   */
  async isRiskQueueLimitReached(tenantId: string, riskLevel: string): Promise<boolean> {
    const policy = await this.loadActivePolicy(tenantId);
    const normalizedRisk = riskLevel.toUpperCase().replace(/-/g, '_');
    const riskConfig = policy.risk_queues[normalizedRisk];
    
    if (!riskConfig) {
      return false;
    }

    const runningCount = await this.prisma.icrabotJobRun.count({
      where: {
        tenantId,
        status: { in: ['QUEUED', 'RUNNING'] },
        riskLevel: normalizedRisk as any,
      },
    });

    return runningCount >= riskConfig.max_running;
  }

  /**
   * Parse YAML or JSON content
   */
  private parseContent(content: string): any {
    try {
      return yaml.load(content) || {};
    } catch {
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = null;
  }
}
