/**
 * COMPUTE MODULES SERVICE (v27-v28)
 * 
 * Risk scoring ve recovery simulation hesaplamaları.
 * Parametreler DB bundle'dan gelir.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ComputeParamsLoaderService, RiskParams, RecoveryParams } from './compute-params-loader.service';

export interface RiskContext {
  our_rank: number;
  value_mid: number;
  confidence: number;
  prior_claims_estimate: number | null;
  unknown_amounts_count: number;
  unknown_activity_count: number;
  missing_rank_info: boolean;
  active_prior_liens_count: number;
}

export interface RiskResult {
  score: number;
  components: {
    rank: number;
    prior_claims: number;
    uncertainty: number;
    value_confidence: number;
    lien_activity: number;
  };
}

export interface RecoveryContext {
  value_low: number;
  value_mid: number;
  value_high: number;
  liquidation_factor: number;
  prior_claims_estimate: number;
  estimated_costs: number;
}

export interface RecoveryResult {
  expected_net_low: number;
  expected_net_mid: number;
  expected_net_high: number;
  flags: {
    ok_for_cost_actions: boolean;
  };
}

@Injectable()
export class ComputeModulesService {
  private readonly logger = new Logger(ComputeModulesService.name);

  constructor(private paramsLoader: ComputeParamsLoaderService) {}

  /**
   * Calculate risk score for an asset
   */
  async riskScoring(tenantId: string, context: RiskContext): Promise<RiskResult> {
    const params = await this.paramsLoader.loadRiskParams(tenantId);
    
    const rankOrder = context.our_rank || 1;
    const valueMid = context.value_mid || 0;
    const confidence = context.confidence || 0.5;
    const priorClaimsEstimate = context.prior_claims_estimate;

    // Calculate component risks
    const rankRisk = Math.min(100, Math.max(0, (rankOrder - 1) * 20));

    let priorClaimsRisk: number;
    if (priorClaimsEstimate === null || valueMid <= 0) {
      priorClaimsRisk = 60;
    } else {
      const ratio = priorClaimsEstimate / Math.max(1, valueMid);
      priorClaimsRisk = Math.min(100, ratio * 100);
    }

    let uncertainty = 0;
    if (context.unknown_amounts_count > 0) uncertainty += 30;
    if (context.unknown_activity_count > 0) uncertainty += 30;
    if (context.missing_rank_info) uncertainty += 25;
    const uncertaintyRisk = Math.min(100, uncertainty);

    const valueConfidenceRisk = Math.min(100, (1 - confidence) * 100);

    let lienActivityRisk: number;
    if (context.active_prior_liens_count === 0) {
      lienActivityRisk = 10;
    } else if (context.active_prior_liens_count <= 2) {
      lienActivityRisk = 40;
    } else {
      lienActivityRisk = 70;
    }

    // Calculate weighted score
    const w = params.weights;
    const score = 
      w.rank * rankRisk +
      w.prior_claims * priorClaimsRisk +
      w.uncertainty * uncertaintyRisk +
      w.value_confidence * valueConfidenceRisk +
      w.lien_activity * lienActivityRisk;

    return {
      score: Math.round(score * 10) / 10,
      components: {
        rank: rankRisk,
        prior_claims: priorClaimsRisk,
        uncertainty: uncertaintyRisk,
        value_confidence: valueConfidenceRisk,
        lien_activity: lienActivityRisk,
      },
    };
  }

  /**
   * Simulate expected recovery from an asset
   */
  async recoverySimulator(tenantId: string, context: RecoveryContext): Promise<RecoveryResult> {
    const params = await this.paramsLoader.loadRecoveryParams(tenantId);
    
    const valueLow = context.value_low || 0;
    const valueMid = context.value_mid || 0;
    const valueHigh = context.value_high || 0;
    const liquidationFactor = context.liquidation_factor || 0.7;
    const priorClaimsEstimate = context.prior_claims_estimate || 0;
    const estimatedCosts = context.estimated_costs || 0;

    const calculateNet = (value: number): number => {
      return Math.max(0, value * liquidationFactor - priorClaimsEstimate - estimatedCosts);
    };

    const expectedNetLow = Math.round(calculateNet(valueLow) * 100) / 100;
    const expectedNetMid = Math.round(calculateNet(valueMid) * 100) / 100;
    const expectedNetHigh = Math.round(calculateNet(valueHigh) * 100) / 100;

    return {
      expected_net_low: expectedNetLow,
      expected_net_mid: expectedNetMid,
      expected_net_high: expectedNetHigh,
      flags: {
        ok_for_cost_actions: expectedNetMid >= params.min_net_for_cost_actions,
      },
    };
  }

  /**
   * Check if risk score blocks cost actions
   */
  async shouldBlockCostActions(tenantId: string, riskScore: number): Promise<boolean> {
    const params = await this.paramsLoader.loadRiskParams(tenantId);
    return riskScore >= params.block_cost_threshold;
  }

  /**
   * Check if risk score blocks execution
   */
  async shouldBlockExecution(tenantId: string, riskScore: number): Promise<boolean> {
    const params = await this.paramsLoader.loadRiskParams(tenantId);
    return riskScore >= params.block_execution_threshold;
  }
}
