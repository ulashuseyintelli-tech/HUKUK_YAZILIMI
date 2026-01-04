/**
 * DECISION ENGINE SERVICE (v23)
 * 
 * Fact türlerine göre bir sonraki recipe'leri job olarak enqueue eder.
 * MVP: Sabit mapping kullanır.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface DecisionRule {
  factType: string;
  condition?: string;
  nextRecipes: string[];
  priority?: number;
}

// MVP: Sabit decision rules
const MVP_DECISION_RULES: DecisionRule[] = [
  // Asset found -> prepare haciz
  {
    factType: 'AssetFound',
    condition: "asset_type == 'vehicle'",
    nextRecipes: ['PrepareVehicleSeizure', 'CalculateLienRank'],
    priority: 10,
  },
  {
    factType: 'AssetFound',
    condition: "asset_type == 'bank_account'",
    nextRecipes: ['PrepareBankSeizure'],
    priority: 10,
  },
  {
    factType: 'AssetFound',
    condition: "asset_type == 'real_estate'",
    nextRecipes: ['PrepareRealEstateSeizure', 'CalculateLienRank'],
    priority: 10,
  },
  // Tebligat delivered -> check finalization
  {
    factType: 'TebligatDelivered',
    nextRecipes: ['DetectFinalizationCandidate'],
    priority: 20,
  },
  // Finalization detected -> run asset queries
  {
    factType: 'FinalizationDetected',
    nextRecipes: ['RunAssetQueriesBatch'],
    priority: 30,
  },
  // Haciz placed -> track results
  {
    factType: 'HacizPlaced',
    nextRecipes: ['TrackHacizResults', 'PostLienStrategy'],
    priority: 40,
  },
  // Payment received -> evaluate closure
  {
    factType: 'PaymentReceived',
    nextRecipes: ['SyncTahsilat', 'EvaluateCaseClosure'],
    priority: 50,
  },
];

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Process new facts and create next jobs
   */
  async processNewFacts(caseId: string, tenantId: string): Promise<string[]> {
    // Get unprocessed facts
    const facts = await this.prisma.icrabotFact.findMany({
      where: {
        caseId,
        tenantId,
        processed: false,
      },
      orderBy: { createdAt: 'asc' },
    });

    const createdJobIds: string[] = [];

    for (const fact of facts) {
      const nextRecipes = this.getNextRecipes(fact.factType, fact.value as Record<string, any>);

      for (const recipeId of nextRecipes) {
        // Check if job already exists
        const existingJob = await this.prisma.icrabotJobRun.findFirst({
          where: {
            caseId,
            tenantId,
            recipeId,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
        });

        if (existingJob) {
          continue;
        }

        // Create new job
        const jobId = `job_${caseId}_${recipeId}_${Date.now()}`;
        await this.prisma.icrabotJobRun.create({
          data: {
            jobId,
            caseId,
            tenantId,
            recipeId,
            recipeVersion: 1,
            status: 'QUEUED',
            riskLevel: 'MEDIUM',
            attempt: 0,
            maxAttempts: 4,
          },
        });

        createdJobIds.push(jobId);
        this.logger.debug(`Created job ${jobId} from fact ${fact.factType}`);
      }

      // Mark fact as processed
      await this.prisma.icrabotFact.update({
        where: { id: fact.id },
        data: { processed: true },
      });
    }

    return createdJobIds;
  }

  /**
   * Get next recipes based on fact type and value
   */
  private getNextRecipes(factType: string, value: Record<string, any>): string[] {
    const matchingRules = MVP_DECISION_RULES
      .filter(rule => rule.factType === factType)
      .filter(rule => !rule.condition || this.evaluateCondition(rule.condition, value))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    // Return recipes from first matching rule
    return matchingRules[0]?.nextRecipes || [];
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateCondition(condition: string, value: Record<string, any>): boolean {
    const match = condition.match(/(\w+)\s*(==|!=)\s*['"]([^'"]+)['"]/);
    if (!match) return true;

    const [, field, operator, expected] = match;
    const actual = value[field];

    switch (operator) {
      case '==':
        return String(actual) === expected;
      case '!=':
        return String(actual) !== expected;
      default:
        return true;
    }
  }

  /**
   * Get decision rules (for admin panel)
   */
  getDecisionRules(): DecisionRule[] {
    return MVP_DECISION_RULES;
  }
}
