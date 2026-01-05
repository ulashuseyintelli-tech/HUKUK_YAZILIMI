/**
 * COMPUTE PARAMS LOADER SERVICE (v28)
 * 
 * Risk/Recovery compute parametrelerini DB bundle'dan yükler.
 * - bundle_kind='risk' ACTIVE -> risk params
 * - bundle_kind='recovery' ACTIVE -> recovery params
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as yaml from 'js-yaml';

export interface RiskParams {
  block_cost_threshold: number;
  block_execution_threshold: number;
  weights: {
    rank: number;
    prior_claims: number;
    uncertainty: number;
    value_confidence: number;
    lien_activity: number;
  };
}

export interface RecoveryParams {
  min_net_for_cost_actions: number;
  cost_budgets: {
    yakalama_avansi: number;
    satis_avansi: number;
    yeniden_tebligat: number;
  };
}

// Default values
const DEFAULT_RISK_PARAMS: RiskParams = {
  block_cost_threshold: 70,
  block_execution_threshold: 85,
  weights: {
    rank: 0.35,
    prior_claims: 0.20,
    uncertainty: 0.20,
    value_confidence: 0.15,
    lien_activity: 0.10,
  },
};

const DEFAULT_RECOVERY_PARAMS: RecoveryParams = {
  min_net_for_cost_actions: 25000,
  cost_budgets: {
    yakalama_avansi: 6000,
    satis_avansi: 15000,
    yeniden_tebligat: 1200,
  },
};

@Injectable()
export class ComputeParamsLoaderService {
  private readonly logger = new Logger(ComputeParamsLoaderService.name);
  
  private riskCache: { data: RiskParams; loadedAt: Date } | null = null;
  private recoveryCache: { data: RecoveryParams; loadedAt: Date } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private prisma: PrismaService) {}

  /**
   * Load active risk params bundle
   */
  async loadRiskParams(tenantId: string): Promise<RiskParams> {
    if (this.riskCache && Date.now() - this.riskCache.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.riskCache.data;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'RISK',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      this.logger.warn(`No active risk bundle found for tenant ${tenantId}, using defaults`);
      return DEFAULT_RISK_PARAMS;
    }

    const data = this.parseContent(bundle.content);
    const params = data.params?.risk || data.risk || data;
    
    const result: RiskParams = {
      block_cost_threshold: params.block_cost_threshold ?? DEFAULT_RISK_PARAMS.block_cost_threshold,
      block_execution_threshold: params.block_execution_threshold ?? DEFAULT_RISK_PARAMS.block_execution_threshold,
      weights: {
        rank: params.weights?.rank ?? DEFAULT_RISK_PARAMS.weights.rank,
        prior_claims: params.weights?.prior_claims ?? DEFAULT_RISK_PARAMS.weights.prior_claims,
        uncertainty: params.weights?.uncertainty ?? DEFAULT_RISK_PARAMS.weights.uncertainty,
        value_confidence: params.weights?.value_confidence ?? DEFAULT_RISK_PARAMS.weights.value_confidence,
        lien_activity: params.weights?.lien_activity ?? DEFAULT_RISK_PARAMS.weights.lien_activity,
      },
    };

    this.riskCache = { data: result, loadedAt: new Date() };
    return result;
  }

  /**
   * Load active recovery params bundle
   */
  async loadRecoveryParams(tenantId: string): Promise<RecoveryParams> {
    if (this.recoveryCache && Date.now() - this.recoveryCache.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.recoveryCache.data;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'RECOVERY',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      this.logger.warn(`No active recovery bundle found for tenant ${tenantId}, using defaults`);
      return DEFAULT_RECOVERY_PARAMS;
    }

    const data = this.parseContent(bundle.content);
    const params = data.params?.recovery || data.recovery || data;
    
    const result: RecoveryParams = {
      min_net_for_cost_actions: params.min_net_for_cost_actions ?? DEFAULT_RECOVERY_PARAMS.min_net_for_cost_actions,
      cost_budgets: {
        yakalama_avansi: params.cost_budgets?.yakalama_avansi ?? DEFAULT_RECOVERY_PARAMS.cost_budgets.yakalama_avansi,
        satis_avansi: params.cost_budgets?.satis_avansi ?? DEFAULT_RECOVERY_PARAMS.cost_budgets.satis_avansi,
        yeniden_tebligat: params.cost_budgets?.yeniden_tebligat ?? DEFAULT_RECOVERY_PARAMS.cost_budgets.yeniden_tebligat,
      },
    };

    this.recoveryCache = { data: result, loadedAt: new Date() };
    return result;
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
   * Clear caches
   */
  clearCache(): void {
    this.riskCache = null;
    this.recoveryCache = null;
  }
}
