import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  WorkflowStage,
  TriggerType,
  EnforcementType,
  EnforcementStatus,
  DecisionType,
} from "@prisma/client";
import { RuleEngine, RuleContext, RuleResult } from "./rule-engine.service";
import { ExpenseRequestService } from "../expense-request/expense-request.service";

// Workflow stage to expense stage code mapping
const STAGE_TO_EXPENSE_CODE: Partial<Record<WorkflowStage, string>> = {
  [WorkflowStage.ENFORCEMENT]: 'RE_NOTIFICATION', // Kesinleşme sonrası yeniden tebligat gerekebilir
  [WorkflowStage.SEIZURE]: 'SEIZURE', // Haciz aşaması
  [WorkflowStage.SALE_REQUEST]: 'SALE', // Satış aşaması
};

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    private prisma: PrismaService,
    private ruleEngine: RuleEngine,
    private expenseRequestService: ExpenseRequestService,
  ) {}

  // Dosya için bağlam oluştur
  async buildContext(caseId: string): Promise<RuleContext> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        collections: true,
        debtors: {
          include: {
            debtor: {
              include: { assets: true },
            },
          },
        },
        lifecycleEvents: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        enforcementActions: {
          where: { status: EnforcementStatus.COMPLETED },
        },
      },
    });

    if (!caseData) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const lastEvent = caseData.lifecycleEvents[0];
    const daysSinceLastAction = lastEvent
      ? Math.floor(
          (Date.now() - lastEvent.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    const totalDebt = Number(caseData.principalAmount || 0);
    const collectedAmount = caseData.collections.reduce(
      (sum, c) => sum + Number(c.amount),
      0
    );

    const debtorAssets = caseData.debtors.flatMap((cd) => cd.debtor.assets);

    // İtiraz kontrolü
    const hasObjection = caseData.lifecycleEvents.some(
      (e) => e.stage === WorkflowStage.OBJECTION
    );

    return {
      caseId,
      currentStage: caseData.workflowStage,
      daysSinceLastAction,
      hasPayment: collectedAmount > 0,
      hasObjection,
      totalDebt,
      collectedAmount,
      debtorAssets,
    };
  }

  // Dosyayı işle
  async processCase(caseId: string): Promise<void> {
    try {
      const context = await this.buildContext(caseId);
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        include: { formType: true },
      });

      if (!caseData || !caseData.isAutoMode) {
        return; // Otomatik mod kapalıysa işleme
      }

      // Form tipine göre özel kuralları değerlendir
      let rules: RuleResult[] = [];

      if (caseData.formType?.isKambiyo) {
        rules = await this.ruleEngine.evaluateKambiyoRules(context);
      } else if (caseData.formType?.isRental) {
        rules = await this.ruleEngine.evaluateRentalRules(context);
      } else {
        rules = await this.ruleEngine.evaluateRules(context);
      }

      // Tebligat süresi kontrolü
      const notificationRule =
        await this.ruleEngine.checkNotificationExpiry(caseId);
      if (notificationRule) {
        rules.push(notificationRule);
      }

      // Tetiklenmesi gereken kuralları uygula
      for (const rule of rules.filter((r) => r.shouldTrigger)) {
        await this.executeRule(caseId, rule, context);
      }
    } catch (error) {
      this.logger.error(`Error processing case ${caseId}:`, error);
    }
  }

  // Kuralı uygula
  private async executeRule(
    caseId: string,
    rule: RuleResult,
    context: RuleContext
  ): Promise<void> {
    this.logger.log(`Executing rule for case ${caseId}: ${rule.action}`);

    // Karar logu oluştur
    await this.prisma.decisionLog.create({
      data: {
        caseId,
        decisionType: this.mapActionToDecisionType(rule.action),
        decision: rule.action,
        reasoning: rule.reason,
        inputData: context as any,
        isAutomatic: true,
      },
    });

    // Aşama değişikliği
    if (rule.nextStage) {
      await this.updateCaseStage(caseId, rule.nextStage, rule.reason);
    }

    // İcra işlemi oluştur
    if (rule.enforcementType) {
      await this.createEnforcementAction(caseId, rule.enforcementType);
    }

    // Otomatik işlem sayacını güncelle
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        autoActionsCount: { increment: 1 },
        lastAutoActionAt: new Date(),
      },
    });
  }

  // Dosya aşamasını güncelle
  async updateCaseStage(
    caseId: string,
    newStage: WorkflowStage,
    reason: string,
    triggerType: TriggerType = TriggerType.AUTO
  ): Promise<void> {
    // Get case data for tenant info
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { tenantId: true, clientId: true },
    });

    await this.prisma.$transaction([
      this.prisma.case.update({
        where: { id: caseId },
        data: { workflowStage: newStage },
      }),
      this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: newStage,
          action: `Aşama değişikliği: ${newStage}`,
          description: reason,
          triggeredBy: triggerType,
        },
      }),
    ]);

    this.logger.log(`Case ${caseId} stage updated to ${newStage}`);

    // Aşama değişikliğinde otomatik masraf seti oluştur (arka planda)
    const expenseStageCode = STAGE_TO_EXPENSE_CODE[newStage];
    if (expenseStageCode && caseData?.tenantId && caseData?.clientId) {
      this.expenseRequestService
        .createStageExpenseSet(caseId, expenseStageCode, caseData.tenantId, 'system')
        .then(() => {
          this.logger.log(`Otomatik ${expenseStageCode} masrafları oluşturuldu: ${caseId}`);
        })
        .catch((err) => {
          // Zaten varsa veya başka hata olursa sessizce devam et
          this.logger.warn(`Otomatik masraf seti oluşturulamadı (${expenseStageCode}): ${err.message}`);
        });
    }
  }

  // İcra işlemi oluştur
  async createEnforcementAction(
    caseId: string,
    type: EnforcementType
  ): Promise<void> {
    await this.prisma.enforcementAction.create({
      data: {
        caseId,
        type,
        status: EnforcementStatus.PENDING,
        requestDate: new Date(),
      },
    });

    this.logger.log(`Enforcement action created for case ${caseId}: ${type}`);
  }

  // Sonraki işlem zamanını hesapla
  async calculateNextActionTime(caseId: string): Promise<Date | null> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        notifications: {
          where: { status: "DELIVERED" },
          orderBy: { deliveredAt: "desc" },
          take: 1,
        },
      },
    });

    if (!caseData) return null;

    const lastNotification = caseData.notifications[0];

    switch (caseData.workflowStage) {
      case WorkflowStage.PAYMENT_ORDER:
      case WorkflowStage.WAITING_RESPONSE:
        // Tebligattan 10 gün sonra
        if (lastNotification?.deliveredAt) {
          const nextDate = new Date(lastNotification.deliveredAt);
          nextDate.setDate(nextDate.getDate() + 10);
          return nextDate;
        }
        break;

      case WorkflowStage.ENFORCEMENT:
        // 1 gün sonra banka sorgulama
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;

      case WorkflowStage.SEIZURE:
        // 7 gün sonra satış talebi
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        return weekLater;
    }

    return null;
  }

  private mapActionToDecisionType(action: string): DecisionType {
    const mapping: Record<string, DecisionType> = {
      REQUEST_ENFORCEMENT: DecisionType.NEXT_ACTION,
      BANK_INQUIRY: DecisionType.ENFORCEMENT_TYPE,
      UPDATE_STAGE: DecisionType.NEXT_ACTION,
      CLOSE_CASE: DecisionType.CASE_CLOSURE,
      SALE_REQUEST: DecisionType.ENFORCEMENT_TYPE,
      NOTIFICATION_EXPIRED: DecisionType.NEXT_ACTION,
      EVICTION_REQUEST: DecisionType.NEXT_ACTION,
    };
    return mapping[action] || DecisionType.NEXT_ACTION;
  }
}
