import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowStage, EnforcementType } from "@prisma/client";

export interface RuleContext {
  caseId: string;
  currentStage: WorkflowStage;
  daysSinceLastAction: number;
  hasPayment: boolean;
  hasObjection: boolean;
  totalDebt: number;
  collectedAmount: number;
  debtorAssets: any[];
}

export interface RuleResult {
  shouldTrigger: boolean;
  action: string;
  nextStage?: WorkflowStage;
  enforcementType?: EnforcementType;
  reason: string;
  priority: number;
}

@Injectable()
export class RuleEngine {
  private readonly logger = new Logger(RuleEngine.name);

  constructor(private prisma: PrismaService) {}

  // Ana kural değerlendirme fonksiyonu
  async evaluateRules(context: RuleContext): Promise<RuleResult[]> {
    const results: RuleResult[] = [];

    // Kural 1: Ödeme emri sonrası 10 gün geçti, itiraz yok → Haciz talebi
    if (
      context.currentStage === WorkflowStage.WAITING_RESPONSE &&
      context.daysSinceLastAction >= 10 &&
      !context.hasObjection &&
      !context.hasPayment
    ) {
      results.push({
        shouldTrigger: true,
        action: "REQUEST_ENFORCEMENT",
        nextStage: WorkflowStage.ENFORCEMENT,
        reason: "Ödeme emri tebliğinden 10 gün geçti, itiraz veya ödeme yok",
        priority: 1,
      });
    }

    // Kural 2: Haciz aşamasında → Banka sorgulama
    if (
      context.currentStage === WorkflowStage.ENFORCEMENT &&
      context.daysSinceLastAction >= 1
    ) {
      results.push({
        shouldTrigger: true,
        action: "BANK_INQUIRY",
        enforcementType: EnforcementType.BANK_INQUIRY,
        reason: "Haciz aşamasında banka sorgulama yapılmalı",
        priority: 2,
      });
    }

    // Kural 3: Banka sorgulaması yapıldı, bakiye var → Banka haczi
    // Bu kural daha sonra banka cevabına göre tetiklenecek

    // Kural 4: Kısmi ödeme geldi → Kalan borç için devam
    if (
      context.hasPayment &&
      context.collectedAmount < context.totalDebt &&
      context.currentStage !== WorkflowStage.PARTIAL_PAYMENT
    ) {
      results.push({
        shouldTrigger: true,
        action: "UPDATE_STAGE",
        nextStage: WorkflowStage.PARTIAL_PAYMENT,
        reason: "Kısmi ödeme alındı, kalan borç için takip devam edecek",
        priority: 3,
      });
    }

    // Kural 5: Tam ödeme → Dosya kapanışı
    if (context.hasPayment && context.collectedAmount >= context.totalDebt) {
      results.push({
        shouldTrigger: true,
        action: "CLOSE_CASE",
        nextStage: WorkflowStage.FULL_PAYMENT,
        reason: "Tam ödeme alındı, dosya kapatılacak",
        priority: 0,
      });
    }

    // Kural 6: Haciz sonucu varlık bulundu → Satış talebi
    if (
      context.currentStage === WorkflowStage.SEIZURE &&
      context.debtorAssets.length > 0 &&
      context.daysSinceLastAction >= 7
    ) {
      results.push({
        shouldTrigger: true,
        action: "SALE_REQUEST",
        nextStage: WorkflowStage.SALE_REQUEST,
        enforcementType: EnforcementType.SALE_REQUEST,
        reason: "Hacizli varlık mevcut, satış talebi yapılmalı",
        priority: 2,
      });
    }

    // Önceliğe göre sırala
    return results.sort((a, b) => a.priority - b.priority);
  }

  // Tebligat süresi kontrolü
  async checkNotificationExpiry(caseId: string): Promise<RuleResult | null> {
    const notification = await this.prisma.notificationQueue.findFirst({
      where: {
        caseId,
        type: "PAYMENT_ORDER",
        status: "DELIVERED",
        expiresAt: { lte: new Date() },
      },
    });

    if (notification) {
      return {
        shouldTrigger: true,
        action: "NOTIFICATION_EXPIRED",
        nextStage: WorkflowStage.ENFORCEMENT,
        reason: "Ödeme emri süresi doldu",
        priority: 1,
      };
    }

    return null;
  }

  // Kambiyo takibi için özel kurallar
  async evaluateKambiyoRules(context: RuleContext): Promise<RuleResult[]> {
    const results: RuleResult[] = [];

    // Kambiyo takibinde 10 gün yerine 5 gün
    if (
      context.currentStage === WorkflowStage.WAITING_RESPONSE &&
      context.daysSinceLastAction >= 5 &&
      !context.hasObjection
    ) {
      results.push({
        shouldTrigger: true,
        action: "REQUEST_ENFORCEMENT",
        nextStage: WorkflowStage.ENFORCEMENT,
        reason: "Kambiyo takibinde 5 gün geçti, haciz aşamasına geçilebilir",
        priority: 1,
      });
    }

    return results;
  }

  // Kira takibi için özel kurallar
  async evaluateRentalRules(context: RuleContext): Promise<RuleResult[]> {
    const results: RuleResult[] = [];

    // Kira takibinde 30 gün ödeme süresi
    if (
      context.currentStage === WorkflowStage.WAITING_RESPONSE &&
      context.daysSinceLastAction >= 30 &&
      !context.hasPayment
    ) {
      results.push({
        shouldTrigger: true,
        action: "EVICTION_REQUEST",
        reason: "Kira ödemesi 30 gün içinde yapılmadı, tahliye talep edilebilir",
        priority: 1,
      });
    }

    return results;
  }
}
