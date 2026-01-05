/**
 * RISK NET REPORT SERVICE (v37)
 * 
 * Dosya için varlık bazlı risk ve beklenen tahsilat raporu.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AssetRiskItem {
  assetId: string;
  assetType: string;
  assetValue: Record<string, any>;
  risk: {
    score: number;
    level: string;
    factors: Record<string, any>;
  } | null;
  expectedRecovery: {
    grossValue: number;
    netValue: number;
    costs: number;
    probability: number;
  } | null;
}

export interface RiskNetReportResponse {
  caseId: string;
  generatedAt: Date;
  totalAssets: number;
  assets: AssetRiskItem[];
  summary: {
    totalGrossValue: number;
    totalNetValue: number;
    totalCosts: number;
    averageRiskScore: number;
    highRiskCount: number;
  };
}

@Injectable()
export class RiskNetReportService {
  private readonly logger = new Logger(RiskNetReportService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Build risk/net report for a case
   */
  async buildRiskNetReport(tenantId: string, caseId: string): Promise<RiskNetReportResponse> {
    // Verify case exists
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });

    if (!caseData) {
      throw new NotFoundException('Case not found');
    }

    const prismaAny = this.prisma as any;
    const assets: AssetRiskItem[] = [];

    // Get all AssetFound facts
    const assetFacts = await prismaAny.icrabotFact.findMany({
      where: { caseId, factType: 'AssetFound' },
      orderBy: { createdAt: 'desc' },
    });

    // Get computed risk and recovery facts
    const riskFacts = await prismaAny.icrabotFact.findMany({
      where: { caseId, factType: 'Computed', key: 'risk' },
      orderBy: { createdAt: 'desc' },
    });

    const recoveryFacts = await prismaAny.icrabotFact.findMany({
      where: { caseId, factType: 'Computed', key: 'expected_recovery' },
      orderBy: { createdAt: 'desc' },
    });

    // Build asset list with risk and recovery data
    for (const assetFact of assetFacts) {
      const assetValue = assetFact.value as Record<string, any>;
      const assetType = assetValue?.asset_type || 'unknown';

      // Find matching risk fact
      const riskFact = riskFacts.find((r: any) => {
        const rv = r.value as Record<string, any>;
        return rv?.assetId === assetFact.id || rv?.asset_type === assetType;
      });

      // Find matching recovery fact
      const recoveryFact = recoveryFacts.find((r: any) => {
        const rv = r.value as Record<string, any>;
        return rv?.assetId === assetFact.id || rv?.asset_type === assetType;
      });

      const riskValue = riskFact?.value as Record<string, any> | undefined;
      const recoveryValue = recoveryFact?.value as Record<string, any> | undefined;

      assets.push({
        assetId: assetFact.id,
        assetType,
        assetValue,
        risk: riskValue ? {
          score: riskValue.score || 0,
          level: this.getRiskLevel(riskValue.score || 0),
          factors: riskValue.factors || {},
        } : null,
        expectedRecovery: recoveryValue ? {
          grossValue: recoveryValue.gross_value || 0,
          netValue: recoveryValue.net_value || 0,
          costs: recoveryValue.costs || 0,
          probability: recoveryValue.probability || 0,
        } : null,
      });
    }

    // Calculate summary
    const summary = this.calculateSummary(assets);

    this.logger.log(`Risk report for case ${caseId}: ${assets.length} assets`);

    return {
      caseId,
      generatedAt: new Date(),
      totalAssets: assets.length,
      assets,
      summary,
    };
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): string {
    if (score >= 85) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(assets: AssetRiskItem[]): RiskNetReportResponse['summary'] {
    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalCosts = 0;
    let totalRiskScore = 0;
    let riskCount = 0;
    let highRiskCount = 0;

    for (const asset of assets) {
      if (asset.expectedRecovery) {
        totalGrossValue += asset.expectedRecovery.grossValue;
        totalNetValue += asset.expectedRecovery.netValue;
        totalCosts += asset.expectedRecovery.costs;
      }
      if (asset.risk) {
        totalRiskScore += asset.risk.score;
        riskCount++;
        if (asset.risk.score >= 70) {
          highRiskCount++;
        }
      }
    }

    return {
      totalGrossValue,
      totalNetValue,
      totalCosts,
      averageRiskScore: riskCount > 0 ? Math.round(totalRiskScore / riskCount) : 0,
      highRiskCount,
    };
  }
}
