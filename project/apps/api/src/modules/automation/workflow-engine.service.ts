import { Injectable, Logger, Optional, Inject, forwardRef, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  WorkflowStage,
  TriggerType,
  EnforcementType,
  EnforcementStatus,
  DecisionType,
  CaseDebtorLifecycleStatus,
} from "@prisma/client";
import { RuleEngine, RuleContext, RuleResult } from "./rule-engine.service";
import { ExpenseRequestService } from "../expense-request/expense-request.service";
import { CasePolicyEngine } from "../policy-engine/case-policy-engine.service";
import { ActionCode } from "../policy-engine/types/action-code.enum";
import { LegalPeriodCalculationService } from "../legal-deadline/legal-period-calculation.service";
import { sumConfirmedCollections } from "../../common/collection-confirmed.util";

// Workflow stage to expense stage code mapping
const STAGE_TO_EXPENSE_CODE: Partial<Record<WorkflowStage, string>> = {
  [WorkflowStage.ENFORCEMENT]: 'RE_NOTIFICATION', // Kesinleşme sonrası yeniden tebligat gerekebilir
  [WorkflowStage.SEIZURE]: 'SEIZURE', // Haciz aşaması
  [WorkflowStage.SALE_REQUEST]: 'SALE', // Satış aşaması
};

// Rule action to ActionCode mapping for CPE gate checks
const ACTION_TO_CPE_CODE: Record<string, ActionCode> = {
  'REQUEST_ENFORCEMENT': ActionCode.TRIGGER_HACIZ,
  'BANK_INQUIRY': ActionCode.UYAP_SEND,
  'SALE_REQUEST': ActionCode.UYAP_SEND,
  'EVICTION_REQUEST': ActionCode.UYAP_SEND,
  'CLOSE_CASE': ActionCode.CLOSE_CASE,
};

// PR-EA-4: guarded write-path input contract. tenantId zorunlu (üst çağrı zincirinden taşınır,
// caseId'den yeniden tahmin edilmez); caseDebtorId yalnız çağıran zaten belirli bir CaseDebtor
// biliyorsa verilir — otomatik seçim/tahmin YASAK, verilmezse null-compatible create'e düşer.
export interface CreateEnforcementActionInput {
  tenantId: string;
  caseId: string;
  type: EnforcementType;
  caseDebtorId?: string | null;
}

/**
 * Workflow Engine - Otomatik iş akışı motoru
 * 
 * CPE Entegrasyonu:
 * - Tüm otomatik aksiyonlar CPE gate kontrolünden geçer
 * - HIGH risk aksiyonlar için CPE onayı zorunludur
 * - CPE kararları DecisionLog'a kaydedilir
 * 
 * @see ARCHITECTURE.md
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    private prisma: PrismaService,
    private ruleEngine: RuleEngine,
    private expenseRequestService: ExpenseRequestService,
    @Optional() @Inject(forwardRef(() => CasePolicyEngine))
    private casePolicyEngine?: CasePolicyEngine,
    @Optional()
    private legalPeriodCalculationService?: LegalPeriodCalculationService,
  ) {
    if (this.casePolicyEngine) {
      this.logger.log('WorkflowEngine: CasePolicyEngine entegrasyonu aktif');
    } else {
      this.logger.warn('WorkflowEngine: CasePolicyEngine inject edilemedi, fallback moda geçiliyor');
    }
  }

  // Dosya için bağlam oluştur (OD-3 tenant guard: caseId yalnız verilen tenantId altında aranır,
  // cross-tenant erişim generic NotFoundException ile reddedilir — enumeration yok, PR-EA-4 emsali).
  async buildContext(caseId: string, tenantId: string): Promise<RuleContext> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
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
      throw new NotFoundException("Dosya bulunamadı");
    }

    const lastEvent = caseData.lifecycleEvents[0];
    const daysSinceLastAction = lastEvent
      ? Math.floor(
          (Date.now() - lastEvent.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    const totalDebt = Number(caseData.principalAmount || 0);
    // RCV-COL-CONSUMER-AUTO-01: receipt lifecycle fact'i ile legal balance authority
    // ayridir. Yalniz CONFIRMED Collection "payment exists" kanitidir; gross receipt
    // toplami FULL_PAYMENT/CLOSE_CASE otoritesi olamaz. Official Receivable legal
    // balance runtime'a baglanana kadar payment-derived rule'lar fail-closed no-op olur.
    const collectedAmount = sumConfirmedCollections(caseData.collections);

    const debtorAssets = caseData.debtors.flatMap((cd) => cd.debtor.assets);

    // İtiraz kontrolü
    const hasObjection = caseData.lifecycleEvents.some(
      (e) => e.stage === WorkflowStage.OBJECTION
    );

    return {
      caseId,
      tenantId: caseData.tenantId,
      currentStage: caseData.workflowStage,
      daysSinceLastAction,
      hasPayment: collectedAmount > 0,
      hasObjection,
      totalDebt,
      collectedAmount,
      officialLegalBalanceState: "UNAVAILABLE",
      debtorAssets,
    };
  }

  // Dosyayı işle (OD-3: tenantId zorunlu, buildContext ile aynı guard'a tabi)
  async processCase(caseId: string, tenantId: string): Promise<void> {
    try {
      const context = await this.buildContext(caseId, tenantId);
      const caseData = await this.prisma.case.findFirst({
        where: { id: caseId, tenantId },
        include: {
          formType: true,
          // LRV-03B / DBP-P2-BP-01 all-passive guard'ı için lifecycle dağılımı; ayrı yeni sorgu
          // açmamak adına mevcut caseData sorgusuna eklenir (owner: "duplicate query üretme").
          debtors: { select: { lifecycleStatus: true } },
        },
      });

      if (!caseData || !caseData.isAutoMode) {
        return; // Otomatik mod kapalıysa işleme
      }

      // LRV-03B / DBP-P2-BP-01 (owner OPTION A, 2026-07-17): Dosyadaki TÜM CaseDebtor kayıtları
      // PASSIVE ise case-seviyesi otomasyon fail-closed durur (kontrollü no-op) — hiçbir rule
      // değerlendirilmez, stage değişmez, EnforcementAction yazılmaz, notification/side-effect
      // üretilmez. "Tüm borçlular pasif" ile "borçlu ilişkisi kaydı yok" AYNI durum DEĞİLDİR:
      // debtorless case (length === 0) AS-IS devam eder. Bu guard yeni hukuki istisna (estate/
      // tereke) ÜRETMEZ; yalnız mevcut lifecycle verisini okur. En az bir ACTIVE varsa devam edilir.
      if (
        caseData.debtors.length > 0 &&
        caseData.debtors.every(
          (caseDebtor) =>
            caseDebtor.lifecycleStatus === CaseDebtorLifecycleStatus.PASSIVE,
        )
      ) {
        return; // Tüm dosya borçluları pasif — otomasyon çalıştırılmaz (kontrollü no-op)
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

    // CPE Gate kontrolü (varsa)
    const cpeActionCode = ACTION_TO_CPE_CODE[rule.action];
    let cpeTraceId: string | undefined;
    
    if (this.casePolicyEngine && cpeActionCode) {
      try {
        // DEBTOR-CPE-TENANT-HARDENING-P1-I01: `context.tenantId`, buildContext() icindeki
        // tenant-scoped Case sorgusundan (`where: { id: caseId, tenantId }`) turer —
        // istemci kontrolunde DEGILDIR, canonical tenant otoritesidir.
        const decision = await this.casePolicyEngine.canPerformAction(
          context.tenantId,
          caseId,
          cpeActionCode,
          { source: 'AUTOMATION' },
        );

        cpeTraceId = decision.traceId;

        if (!decision.allowed) {
          this.logger.warn(`CPE blocked automation action ${rule.action} for case ${caseId}: ${decision.reason}`);
          
          // Karar logu oluştur (engellendi)
          await this.prisma.decisionLog.create({
            data: {
              caseId,
              decisionType: DecisionType.NEXT_ACTION,
              decision: `BLOCKED: ${rule.action}`,
              reasoning: `CPE engelledi: ${decision.reason}`,
              inputData: { ...context, cpeTraceId, cpeCode: decision.code } as any,
              isAutomatic: true,
            },
          });
          
          return; // Aksiyonu uygulama
        }

        // Soft warnings varsa logla
        if (decision.warnings && decision.warnings.length > 0) {
          this.logger.warn(`CPE warnings for automation ${rule.action}:`, decision.warnings);
        }
      } catch (error) {
        this.logger.error('CPE kontrolü başarısız:', error);
        // Fail-open for LOW risk, fail-closed for HIGH risk
        const isHighRisk = ['REQUEST_ENFORCEMENT', 'SALE_REQUEST'].includes(rule.action);
        if (isHighRisk) {
          this.logger.error(`HIGH risk action ${rule.action} blocked due to CPE error`);
          return;
        }
        // LOW risk: devam et ama logla
      }
    }

    // Karar logu oluştur
    await this.prisma.decisionLog.create({
      data: {
        caseId,
        decisionType: this.mapActionToDecisionType(rule.action),
        decision: rule.action,
        reasoning: rule.reason,
        inputData: { ...context, cpeTraceId } as any,
        isAutomatic: true,
      },
    });

    // Aşama değişikliği
    if (rule.nextStage) {
      await this.updateCaseStage(caseId, context.tenantId, rule.nextStage, rule.reason);
    }

    // İcra işlemi oluştur
    if (rule.enforcementType) {
      // context.tenantId, buildContext() içinde caseId ile aynı Case sorgusundan gelir — burada
      // yeniden tahmin edilmez, güvenilir üst boundary'den (RuleContext) taşınır (PR-EA-4).
      // Bu zincirde henüz hiçbir rule/context belirli bir CaseDebtor taşımıyor (RuleContext'te
      // debtor-kimliği alanı yok, yalnız debtorAssets flatten listesi) — caseDebtorId bilinçli
      // olarak verilmez, guarded write-path null-compatible create'e düşer (PR-EA-4 D-otomatik-seçim-yok).
      await this.createEnforcementAction({
        tenantId: context.tenantId,
        caseId,
        type: rule.enforcementType,
      });
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

  // Dosya aşamasını güncelle (tenant boundary: caseId yalnız verilen tenantId altında aranır,
  // cross-tenant erişim generic NotFoundException ile reddedilir — mutation gerçekleşmez).
  async updateCaseStage(
    caseId: string,
    tenantId: string,
    newStage: WorkflowStage,
    reason: string,
    triggerType: TriggerType = TriggerType.AUTO
  ): Promise<void> {
    // Get case data for tenant info
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { tenantId: true, clientId: true },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

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

  // RFA-007: aynı caseId+type için AÇIK (terminal olmayan) sayılan statüler. Bunlardan biri varsa
  // yeni action AÇILMAZ → cron tekrarlarında aynı açık aksiyon yığılmaz. Terminal statüler
  // (COMPLETED/FAILED/CANCELLED) yeni action'a izin verir (retry / ileride meşru tekrar).
  private static readonly OPEN_ENFORCEMENT_STATUSES: EnforcementStatus[] = [
    EnforcementStatus.PENDING,
    EnforcementStatus.REQUESTED,
    EnforcementStatus.IN_PROGRESS,
    EnforcementStatus.PARTIAL,
  ];

  // İcra işlemi oluştur (PR-EA-4: guarded write-path — tenantId zorunlu, caseDebtorId verildiyse doğrulanır)
  async createEnforcementAction(
    input: CreateEnforcementActionInput
  ): Promise<void> {
    const { tenantId, caseId, type, caseDebtorId = null } = input;

    await this.prisma.$transaction(async (tx) => {
      // Composite Case doğrulaması — yalnız Case.findUnique({id}) KULLANILMAZ (OD-3 emsali tekrarlanmaz).
      // Cross-tenant/mevcut-olmayan Case aynı generic mesajla reddedilir (enumeration yok).
      const caseRow = await tx.case.findFirst({
        where: { id: caseId, tenantId },
        select: { id: true },
      });
      if (!caseRow) {
        throw new NotFoundException("Dosya bulunamadı");
      }

      // caseDebtorId verildiyse: aynı Case'e ait olduğu VE lifecycle'ının ACTIVE olduğu doğrulanır
      // (LRV-03A / DBP-P2-SEC-P03A — DBP-07 §11 "Passivation Guard Is Universal" invariant'ının bu
      // yazım yoluna uygulanması; CaseDebtorLifecycleGuardService'in 15+ başka write-path'te
      // uyguladığı AYNI invariant). Bugün caseDebtorId hiçbir üretici tarafından verilmediği için
      // (yalnız executeRule() çağırır ve her zaman omit eder) bu kontrol mevcut davranışı
      // DEĞİŞTİRMEZ; ileride caseDebtorId veren bir çağıran eklendiğinde sessiz bug'ı engeller.
      // Tenant bağı zaten doğrulanmış caseId üzerinden transitive olarak sağlanır.
      if (caseDebtorId) {
        const caseDebtorRow = await tx.caseDebtor.findFirst({
          where: { id: caseDebtorId, caseId },
          select: { id: true, lifecycleStatus: true },
        });
        if (!caseDebtorRow) {
          throw new NotFoundException("Borçlu bulunamadı veya bu dosyaya ait değil");
        }
        if (caseDebtorRow.lifecycleStatus === CaseDebtorLifecycleStatus.PASSIVE) {
          throw new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.");
        }
      }

      // RFA-007: status-bazlı duplicate guard (unique constraint DEĞİL — meşru tekrarı kırmaz).
      // Açık aynı tenantId+caseId+type action varsa idempotent no-op. @@unique bilinçli YOK.
      // Mevcut guard dosya-seviyesidir (caseDebtorId'ye göre ayrışmaz — bkz. PR-EA-4 §3.5 sınırlaması,
      // final raporda belgelenir); bu davranış PR-EA-4 kapsamında GENİŞLETİLMEDİ, yalnız tenant-scoped edildi.
      const open = await tx.enforcementAction.findFirst({
        where: { tenantId, caseId, type, status: { in: WorkflowEngine.OPEN_ENFORCEMENT_STATUSES } },
      });
      if (open) {
        this.logger.log(`Açık ${type} enforcement action zaten var (case ${caseId}), yeni açılmadı`);
        return;
      }

      await tx.enforcementAction.create({
        data: {
          tenantId,
          caseId,
          caseDebtorId,
          type,
          status: EnforcementStatus.PENDING,
          requestDate: new Date(),
        },
      });

      this.logger.log(`Enforcement action created for case ${caseId}: ${type}`);
    });
  }

  // Sonraki işlem zamanını hesapla (tenant boundary: caseId yalnız verilen tenantId altında
  // aranır; cross-tenant/bulunmayan Case generic NotFoundException ile reddedilir — enumeration
  // yok, buildContext/createEnforcementAction emsali).
  async calculateNextActionTime(caseId: string, tenantId: string): Promise<Date | null> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        notifications: {
          where: { status: "DELIVERED" },
          orderBy: { deliveredAt: "desc" },
          take: 1,
        },
      },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    const lastNotification = caseData.notifications[0];

    switch (caseData.workflowStage) {
      case WorkflowStage.PAYMENT_ORDER:
      case WorkflowStage.WAITING_RESPONSE: {
        const canonicalDate = await this.computeCanonicalNextActionTime(tenantId, caseId);
        if (canonicalDate) {
          return canonicalDate;
        }
        // Legacy fallback — tebligattan 10 gün sonra. MPB-028(a) PR-5 owner kararı:
        // flag kapalı, servis inject edilmemiş, Tebligat yok veya kanonik motor UNRESOLVED
        // dönerse NotificationQueue yalnız legacy fallback olarak bu davranışı korur.
        if (lastNotification?.deliveredAt) {
          const nextDate = new Date(lastNotification.deliveredAt);
          nextDate.setDate(nextDate.getDate() + 10);
          return nextDate;
        }
        break;
      }

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

  private isLegalTimeCutoverEnabled(): boolean {
    return process.env.LEGAL_TIME_CUTOVER === "true";
  }

  /**
   * MPB-028(a) PR-5 (owner GO-IMPLEMENT, 2026-07-14 — "PR-5 yalnız calculateNextActionTime
   * kapsamında, NotificationQueue yalnız legacy fallback"). Flag açıkken bu case için en son
   * Tebligat kaydı üzerinden kanonik LegalPeriodCalculationService'i (PR-3C) çağırır. Tebligat
   * bulunamazsa, kanonik kural UNRESOLVED dönerse veya flag kapalı/servis inject edilmemişse
   * null döner — çağıran (calculateNextActionTime) bu durumda legacy NotificationQueue
   * formülüne düşer (owner kararı: "NotificationQueue yalnız legacy fallback olarak
   * kalacaktır"). `NotificationService.getPaymentDeadline` (gerçek consumer'ı yok),
   * `RuleEngine.checkNotificationExpiry`, Scheduler'ın otomatik ENFORCEMENT geçişi ve MTS
   * bu PR'ın kapsamı DIŞINDADIR (ayrı canonicalization workstream, owner kararıyla
   * dokunulmaz).
   */
  private async computeCanonicalNextActionTime(tenantId: string, caseId: string): Promise<Date | null> {
    if (!this.isLegalTimeCutoverEnabled() || !this.legalPeriodCalculationService) {
      return null;
    }

    const tebligat = await this.prisma.tebligat.findFirst({
      where: { tenantId, caseId },
      orderBy: { createdAt: "desc" },
    });
    if (!tebligat) {
      return null;
    }

    const result = await this.legalPeriodCalculationService.computeCanonicalLegalPeriod({
      tenantId,
      tebligatId: tebligat.id,
      caseId,
    });

    return result.status === "RESOLVED" ? result.nextActionEligibleDate : null;
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
