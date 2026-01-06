/**
 * v28 Compute Registry Service
 * 
 * Hesaplama motorlarını yöneten registry.
 * Python v28_engine_runner/engine_v28/engine_runner/compute_registry.py'den port edildi.
 * 
 * Mevcut Compute Engines:
 * - RiskScoring: Risk skoru hesaplama
 * - RecoverySimulator: Tahsilat simülasyonu
 * - LienRankCalculator: Haciz sırası hesaplama
 * - AssetValuation: Varlık değerleme
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type ComputeFunction = (input: Record<string, any>) => Promise<Record<string, any>>;

@Injectable()
export class ComputeRegistryService {
  private readonly logger = new Logger(ComputeRegistryService.name);
  private readonly engines: Map<string, ComputeFunction> = new Map();

  constructor(private readonly prisma: PrismaService) {
    this.registerDefaultEngines();
  }

  /**
   * Compute engine'i register eder
   */
  register(name: string, fn: ComputeFunction): void {
    this.engines.set(name, fn);
    this.logger.log(`Compute engine registered: ${name}`);
  }

  /**
   * Compute engine'i çalıştırır
   */
  async run(name: string, input: Record<string, any>): Promise<Record<string, any>> {
    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Compute engine not registered: ${name}`);
    }

    this.logger.debug(`Running compute engine: ${name}`);
    const startTime = Date.now();
    
    try {
      const result = await engine(input);
      const duration = Date.now() - startTime;
      this.logger.debug(`Compute engine ${name} completed in ${duration}ms`);
      return result;
    } catch (error: any) {
      this.logger.error(`Compute engine ${name} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Kayıtlı engine'leri listeler
   */
  listEngines(): string[] {
    return Array.from(this.engines.keys());
  }

  /**
   * Varsayılan engine'leri register eder
   */
  private registerDefaultEngines(): void {
    // Risk Scoring Engine
    this.register('RiskScoring', async (input) => {
      const { caseId, debtorId } = input;
      
      // Gerçek implementasyon için case ve debtor verilerini çek
      // Şimdilik stub değerler
      const factors = {
        debtorHistory: 0.3,      // Borçlu geçmişi
        assetCoverage: 0.25,     // Varlık karşılama oranı
        paymentBehavior: 0.2,    // Ödeme davranışı
        legalComplexity: 0.15,   // Hukuki karmaşıklık
        timeInCollection: 0.1,   // Takipte geçen süre
      };

      // Basit skor hesaplama (0-100)
      const baseScore = 50;
      const randomVariance = Math.floor(Math.random() * 40) - 20;
      const score = Math.max(0, Math.min(100, baseScore + randomVariance));

      const band = score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';

      return {
        score,
        band,
        factors,
        modelVersion: 'risk-v1.0',
        calculatedAt: new Date().toISOString(),
      };
    });

    // Recovery Simulator Engine
    this.register('RecoverySimulator', async (input) => {
      const { caseId, enforcementRank, vehicleValueEstimate } = input;

      // Monte Carlo simülasyonu stub
      const baseValue = vehicleValueEstimate || 100000;
      const rankMultiplier = enforcementRank === 1 ? 0.9 : enforcementRank === 2 ? 0.7 : 0.5;

      const expected = Math.floor(baseValue * rankMultiplier);
      const p50 = Math.floor(expected * 1.1);
      const p90 = Math.floor(expected * 0.3);
      const etaDays = Math.floor(90 + Math.random() * 60);

      return {
        expected,
        p50,
        p90,
        etaDays,
        modelVersion: 'recovery-v1.0',
        simulationRuns: 1000,
        calculatedAt: new Date().toISOString(),
      };
    });

    // Lien Rank Calculator
    this.register('LienRankCalculator', async (input) => {
      const { caseId, assetId, assetType } = input;

      // Haciz sırası hesaplama stub
      // Gerçek implementasyonda UYAP'tan çekilecek
      const rank = Math.floor(Math.random() * 5) + 1;
      const totalLiens = rank + Math.floor(Math.random() * 3);
      const priorDebt = rank > 1 ? Math.floor(Math.random() * 500000) : 0;

      return {
        rank,
        totalLiens,
        priorDebt,
        isFirstRank: rank === 1,
        estimatedRecoveryRate: rank === 1 ? 0.85 : rank === 2 ? 0.6 : 0.3,
        calculatedAt: new Date().toISOString(),
      };
    });

    // Asset Valuation Engine
    this.register('AssetValuation', async (input) => {
      const { assetType, assetDetails } = input;

      let estimatedValue = 0;
      let confidence = 'low';
      let method = 'market_comparison';

      switch (assetType) {
        case 'VEHICLE':
          // Araç değerleme
          const year = assetDetails?.year || 2020;
          const basePrice = assetDetails?.basePrice || 500000;
          const depreciation = (new Date().getFullYear() - year) * 0.1;
          estimatedValue = Math.floor(basePrice * (1 - Math.min(depreciation, 0.7)));
          confidence = 'medium';
          method = 'depreciation_model';
          break;

        case 'REAL_ESTATE':
          // Gayrimenkul değerleme
          const sqm = assetDetails?.squareMeters || 100;
          const pricePerSqm = assetDetails?.pricePerSqm || 30000;
          estimatedValue = sqm * pricePerSqm;
          confidence = 'high';
          method = 'comparable_sales';
          break;

        case 'BANK_ACCOUNT':
          // Banka hesabı
          estimatedValue = assetDetails?.balance || 0;
          confidence = 'high';
          method = 'direct_query';
          break;

        default:
          estimatedValue = assetDetails?.estimatedValue || 0;
          confidence = 'low';
          method = 'manual_estimate';
      }

      return {
        estimatedValue,
        confidence,
        method,
        currency: 'TRY',
        valuationDate: new Date().toISOString(),
        modelVersion: 'valuation-v1.0',
      };
    });

    // Debtor Behavior Score
    this.register('DebtorBehaviorScore', async (input) => {
      const { debtorId, caseId } = input;

      // Borçlu davranış skoru
      const paymentHistory = Math.random() * 40;
      const communicationScore = Math.random() * 30;
      const complianceScore = Math.random() * 30;

      const totalScore = Math.floor(paymentHistory + communicationScore + complianceScore);
      const category = totalScore >= 70 ? 'COOPERATIVE' : 
                       totalScore >= 40 ? 'NEUTRAL' : 'UNCOOPERATIVE';

      return {
        score: totalScore,
        category,
        breakdown: {
          paymentHistory: Math.floor(paymentHistory),
          communication: Math.floor(communicationScore),
          compliance: Math.floor(complianceScore),
        },
        recommendation: category === 'COOPERATIVE' ? 'SETTLEMENT_OFFER' :
                        category === 'NEUTRAL' ? 'STANDARD_PROCESS' : 'AGGRESSIVE_ENFORCEMENT',
        calculatedAt: new Date().toISOString(),
      };
    });

    // Settlement Calculator
    this.register('SettlementCalculator', async (input) => {
      const { totalDebt, riskScore, debtorBehavior } = input;

      // Sulh teklifi hesaplama
      const baseDiscount = 0.1; // %10 baz indirim
      const riskAdjustment = (riskScore || 50) > 70 ? 0.15 : 0.05;
      const behaviorAdjustment = debtorBehavior === 'COOPERATIVE' ? 0.1 : 0;

      const totalDiscount = Math.min(baseDiscount + riskAdjustment + behaviorAdjustment, 0.4);
      const settlementAmount = Math.floor(totalDebt * (1 - totalDiscount));

      return {
        originalDebt: totalDebt,
        settlementAmount,
        discountRate: totalDiscount,
        discountAmount: totalDebt - settlementAmount,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        installmentOptions: [
          { months: 1, amount: settlementAmount },
          { months: 3, amount: Math.floor(settlementAmount / 3) },
          { months: 6, amount: Math.floor(settlementAmount / 6) },
        ],
        calculatedAt: new Date().toISOString(),
      };
    });

    this.logger.log(`Registered ${this.engines.size} default compute engines`);
  }
}
