import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowStage } from "@prisma/client";

export interface RiskFactors {
  debtorAssetScore: number;      // Borçlu varlık skoru (0-25)
  collectionHistoryScore: number; // Tahsilat geçmişi skoru (0-25)
  caseAgeScore: number;          // Dosya yaşı skoru (0-20)
  stageProgressScore: number;    // Aşama ilerleme skoru (0-15)
  debtorBehaviorScore: number;   // Borçlu davranış skoru (0-15)
}

export interface RiskAnalysis {
  overallScore: number;          // 0-100 (düşük = iyi, yüksek = riskli)
  collectionProbability: number; // Tahsilat olasılığı %
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: RiskFactors;
  recommendations: string[];
  suggestedActions: string[];
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private prisma: PrismaService) {}

  // Tam risk analizi yap
  async analyzeCase(caseId: string): Promise<RiskAnalysis> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        collections: true,
        debtors: {
          include: {
            debtor: { include: { assets: true } },
          },
        },
        enforcementActions: true,
        lifecycleEvents: { orderBy: { createdAt: "desc" } },
        notifications: { where: { status: "DELIVERED" } },
      },
    });

    if (!caseData) throw new Error("Case not found");

    const factors = this.calculateFactors(caseData);
    const overallScore = this.calculateOverallScore(factors);
    const collectionProbability = Math.max(0, 100 - overallScore);
    const riskLevel = this.getRiskLevel(overallScore);
    const recommendations = this.generateRecommendations(caseData, factors, riskLevel);
    const suggestedActions = this.suggestActions(caseData, factors);

    // Risk raporu kaydet
    await this.prisma.riskReport.create({
      data: {
        caseId,
        overallScore,
        collectionProb: collectionProbability,
        recommendedAction: recommendations[0] || null,
        factors: factors as any,
        assetAnalysis: this.analyzeAssets(caseData),
        debtorAnalysis: this.analyzeDebtor(caseData),
      },
    });

    return {
      overallScore,
      collectionProbability,
      riskLevel,
      factors,
      recommendations,
      suggestedActions,
    };
  }

  // Risk faktörlerini hesapla
  private calculateFactors(caseData: any): RiskFactors {
    return {
      debtorAssetScore: this.calculateAssetScore(caseData),
      collectionHistoryScore: this.calculateCollectionScore(caseData),
      caseAgeScore: this.calculateAgeScore(caseData),
      stageProgressScore: this.calculateStageScore(caseData),
      debtorBehaviorScore: this.calculateBehaviorScore(caseData),
    };
  }

  // Borçlu varlık skoru (0-25, düşük = iyi)
  private calculateAssetScore(caseData: any): number {
    const assets = caseData.debtors.flatMap((cd: any) => cd.debtor.assets);
    
    if (assets.length === 0) return 25; // Varlık yok = yüksek risk
    
    let score = 25;
    
    // Her varlık türü için puan düş
    const hasProperty = assets.some((a: any) => a.type === "IMMOVABLE");
    const hasVehicle = assets.some((a: any) => a.type === "VEHICLE");
    const hasBankAccount = assets.some((a: any) => a.type === "BANK_ACCOUNT");
    const hasSalary = assets.some((a: any) => a.type === "SALARY");
    
    if (hasProperty) score -= 10;
    if (hasVehicle) score -= 5;
    if (hasBankAccount) score -= 5;
    if (hasSalary) score -= 5;
    
    return Math.max(0, score);
  }

  // Tahsilat geçmişi skoru (0-25, düşük = iyi)
  private calculateCollectionScore(caseData: any): number {
    const totalDebt = Number(caseData.principalAmount || 0);
    const totalCollected = caseData.collections.reduce(
      (sum: number, c: any) => sum + Number(c.amount),
      0
    );
    
    if (totalDebt === 0) return 12; // Orta risk
    
    const collectionRate = totalCollected / totalDebt;
    
    if (collectionRate >= 0.8) return 0;  // %80+ tahsilat = düşük risk
    if (collectionRate >= 0.5) return 8;  // %50-80 = orta-düşük
    if (collectionRate >= 0.2) return 15; // %20-50 = orta-yüksek
    if (collectionRate > 0) return 20;    // %0-20 = yüksek
    return 25;                             // Hiç tahsilat yok
  }

  // Dosya yaşı skoru (0-20, düşük = iyi)
  private calculateAgeScore(caseData: any): number {
    const daysSinceStart = Math.floor(
      (Date.now() - caseData.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceStart < 30) return 0;    // 1 aydan az
    if (daysSinceStart < 90) return 5;    // 1-3 ay
    if (daysSinceStart < 180) return 10;  // 3-6 ay
    if (daysSinceStart < 365) return 15;  // 6-12 ay
    return 20;                             // 1 yıldan fazla
  }

  // Aşama ilerleme skoru (0-15, düşük = iyi)
  private calculateStageScore(caseData: any): number {
    const stageScores: Record<WorkflowStage, number> = {
      INITIAL: 15,
      PAYMENT_ORDER: 12,
      WAITING_RESPONSE: 10,
      OBJECTION: 15,        // İtiraz = risk artışı
      ENFORCEMENT: 8,
      SEIZURE: 5,
      SALE_REQUEST: 3,
      AUCTION: 2,
      COLLECTION: 0,
      PARTIAL_PAYMENT: 5,
      FULL_PAYMENT: 0,
      CLOSED: 0,
      SUSPENDED: 15,
    };
    
    return stageScores[caseData.workflowStage as WorkflowStage] || 10;
  }

  // Borçlu davranış skoru (0-15, düşük = iyi)
  private calculateBehaviorScore(caseData: any): number {
    let score = 7; // Başlangıç
    
    // İtiraz var mı?
    const hasObjection = caseData.lifecycleEvents.some(
      (e: any) => e.stage === WorkflowStage.OBJECTION
    );
    if (hasObjection) score += 5;
    
    // Kısmi ödeme var mı?
    if (caseData.collections.length > 0) score -= 3;
    
    // Tebligat teslim edildi mi?
    if (caseData.notifications.length > 0) score -= 2;
    
    return Math.max(0, Math.min(15, score));
  }

  // Toplam skor hesapla
  private calculateOverallScore(factors: RiskFactors): number {
    return (
      factors.debtorAssetScore +
      factors.collectionHistoryScore +
      factors.caseAgeScore +
      factors.stageProgressScore +
      factors.debtorBehaviorScore
    );
  }

  // Risk seviyesi belirle
  private getRiskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (score < 25) return "LOW";
    if (score < 50) return "MEDIUM";
    if (score < 75) return "HIGH";
    return "CRITICAL";
  }

  // Öneriler oluştur
  private generateRecommendations(
    caseData: any,
    factors: RiskFactors,
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];
    
    if (factors.debtorAssetScore > 15) {
      recommendations.push("Borçlu varlık araştırması yapılmalı");
    }
    
    if (factors.collectionHistoryScore > 15) {
      recommendations.push("Tahsilat stratejisi gözden geçirilmeli");
    }
    
    if (factors.caseAgeScore > 10) {
      recommendations.push("Dosya uzun süredir açık, hızlandırılmalı");
    }
    
    if (caseData.workflowStage === WorkflowStage.OBJECTION) {
      recommendations.push("İtirazın değerlendirilmesi bekleniyor");
    }
    
    if (riskLevel === "CRITICAL") {
      recommendations.push("Uzlaşma veya dosya kapanışı değerlendirilmeli");
    }
    
    if (recommendations.length === 0) {
      recommendations.push("Takip normal seyrinde devam ediyor");
    }
    
    return recommendations;
  }

  // Önerilen işlemler
  private suggestActions(caseData: any, factors: RiskFactors): string[] {
    const actions: string[] = [];
    
    const stage = caseData.workflowStage;
    
    switch (stage) {
      case WorkflowStage.INITIAL:
        actions.push("Ödeme emri gönder");
        break;
      case WorkflowStage.WAITING_RESPONSE:
        actions.push("Tebligat süresini takip et");
        break;
      case WorkflowStage.ENFORCEMENT:
        if (factors.debtorAssetScore < 15) {
          actions.push("Banka haczi uygula");
          actions.push("Araç haczi uygula");
        } else {
          actions.push("Varlık araştırması yap");
        }
        break;
      case WorkflowStage.SEIZURE:
        actions.push("Satış talebi ver");
        break;
    }
    
    return actions;
  }

  // Varlık analizi
  private analyzeAssets(caseData: any): any {
    const assets = caseData.debtors.flatMap((cd: any) => cd.debtor.assets);
    
    return {
      totalCount: assets.length,
      byType: {
        property: assets.filter((a: any) => a.type === "IMMOVABLE").length,
        vehicle: assets.filter((a: any) => a.type === "VEHICLE").length,
        bankAccount: assets.filter((a: any) => a.type === "BANK_ACCOUNT").length,
        salary: assets.filter((a: any) => a.type === "SALARY").length,
        other: assets.filter((a: any) => !["IMMOVABLE", "VEHICLE", "BANK_ACCOUNT", "SALARY"].includes(a.type)).length,
      },
      totalValue: assets.reduce((sum: number, a: any) => sum + Number(a.value || 0), 0),
    };
  }

  // Borçlu analizi
  private analyzeDebtor(caseData: any): any {
    const debtors = caseData.debtors.map((cd: any) => cd.debtor);
    
    return {
      count: debtors.length,
      types: {
        individual: debtors.filter((d: any) => d.type === "INDIVIDUAL").length,
        company: debtors.filter((d: any) => d.type === "COMPANY").length,
      },
    };
  }

  // Dosya için son risk raporu
  async getLatestReport(caseId: string) {
    return this.prisma.riskReport.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Dosya için tüm risk raporları
  async getReportHistory(caseId: string) {
    return this.prisma.riskReport.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  // Yüksek riskli dosyalar
  async getHighRiskCases(tenantId: string, limit = 10) {
    return this.prisma.case.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        riskScore: { gte: 50 },
      },
      orderBy: { riskScore: "desc" },
      take: limit,
      include: {
        client: { select: { name: true } },
        debtors: { include: { debtor: { select: { name: true } } } },
      },
    });
  }

  // Risk istatistikleri
  async getRiskStats(tenantId: string) {
    const cases = await this.prisma.case.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { riskScore: true },
    });
    
    const scores = cases.map((c) => c.riskScore || 50);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length || 0;
    
    return {
      totalCases: cases.length,
      averageRiskScore: Math.round(avgScore),
      distribution: {
        low: scores.filter((s) => s < 25).length,
        medium: scores.filter((s) => s >= 25 && s < 50).length,
        high: scores.filter((s) => s >= 50 && s < 75).length,
        critical: scores.filter((s) => s >= 75).length,
      },
    };
  }
}
