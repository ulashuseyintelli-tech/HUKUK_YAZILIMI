import { ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { PoaExpiryDeliveryService } from "./poa-expiry-delivery.service";
import { DebtorCrossCaseNotificationService } from "../debtor/debtor-cross-case-notification.service";
import { CaseStatus, WorkflowStage, NotificationStatus, LegalCaseStatus, PoaStatus } from "@prisma/client";
import { filterConfirmedCollections, sumConfirmedCollections } from "../../common/collection-confirmed.util";
import { SCHEDULER_TIMEZONE } from "../../common/scheduler-timezone";
import { reportCronJobFailure } from "../../common/cron-failure-reporting";
import { IntegrationErrorReporter } from "../error-log/integration-error-reporter";

// Otomasyon açık olan statüler (C.19)
const AUTOMATION_ENABLED_STATUSES: LegalCaseStatus[] = [
  'DERDEST',
  'ISLEMDE',
  'DERKENAR',
];

/** POA expiry bildirim cron'u default-OFF; owner explicit ON kararı bekler (migration deploy'dan bağımsız). */
export function isPoaExpiryNotificationEnabled(): boolean {
  return process.env.POA_EXPIRY_NOTIFICATION_ENABLED?.toLowerCase() === 'true';
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private workflowEngine: WorkflowEngine,
    private poaExpiryDeliveryService: PoaExpiryDeliveryService,
    private debtorCrossCaseNotificationService: DebtorCrossCaseNotificationService,
    private errorReporter: IntegrationErrorReporter
  ) {}

  // Her 5 dakikada bir çalışan ana kontrol döngüsü (C.20)
  @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: SCHEDULER_TIMEZONE })
  async processPendingCases(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn("Previous job still running, skipping...");
      return;
    }

    this.isProcessing = true;
    this.logger.log("Starting automation cycle...");

    try {
      // Otomatik modda olan ve işlem zamanı gelen dosyaları bul (C.19-20)
      const casesToProcess = await this.prisma.case.findMany({
        where: {
          isAutoMode: true,
          isAutomationEnabled: true, // Yeni flag kontrolü
          status: CaseStatus.ACTIVE,
          caseStatus: { in: AUTOMATION_ENABLED_STATUSES }, // Statü kontrolü
          OR: [
            { nextActionAt: { lte: new Date() } },
            { nextActionAt: null },
          ],
        },
        take: 50,
        orderBy: { nextActionAt: "asc" },
      });

      this.logger.log(`Found ${casesToProcess.length} cases to process`);

      for (const caseData of casesToProcess) {
        try {
          // UYAP işlem kontrolü (C.21)
          if (!caseData.allowUyapActions) {
            this.logger.log(`Case ${caseData.id} skipped - UYAP actions disabled`);
            continue;
          }

          // 4. Madde talep kontrolü (C.22)
          if (!caseData.hasArticle4Request && caseData.workflowStage === 'PAYMENT_ORDER') {
            this.logger.log(`Case ${caseData.id} skipped - Article 4 request required`);
            await this.prisma.decisionLog.create({
              data: {
                caseId: caseData.id,
                decisionType: 'NEXT_ACTION',
                decision: 'Ödeme emri üretilemedi - 4. madde talebi gerekli',
                isAutomatic: true,
              },
            });
            continue;
          }

          await this.workflowEngine.processCase(caseData.id, caseData.tenantId);

          const nextActionAt = await this.workflowEngine.calculateNextActionTime(caseData.id, caseData.tenantId);
          if (nextActionAt) {
            await this.prisma.case.update({
              where: { id: caseData.id },
              data: { nextActionAt },
            });
          }
        } catch (error) {
          this.logger.error(`Error processing case ${caseData.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error("Automation cycle hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.processPendingCases", error);
    } finally {
      this.isProcessing = false;
      this.logger.log("Automation cycle completed");
    }
  }

  // Her gece gün sayacını güncelle (C.23)
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: SCHEDULER_TIMEZONE })
  async updateDaysLeft(): Promise<void> {
    this.logger.log("Updating days left for active cases...");

    try {
      const activeCases = await this.prisma.case.findMany({
        where: {
          status: CaseStatus.ACTIVE,
          caseStatus: { in: AUTOMATION_ENABLED_STATUSES },
          nextActionAt: { not: null },
        },
        select: { id: true, nextActionAt: true },
      });

      for (const caseData of activeCases) {
        if (caseData.nextActionAt) {
          const daysLeft = Math.ceil(
            (caseData.nextActionAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          await this.prisma.case.update({
            where: { id: caseData.id },
            data: { daysLeft: Math.max(0, daysLeft) },
          });
        }
      }

      this.logger.log(`Updated days left for ${activeCases.length} cases`);
    } catch (error) {
      this.logger.error("Gün sayacı güncelleme hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.updateDaysLeft", error);
    }
  }

  // Her saat başı tebligat sürelerini kontrol et
  @Cron(CronExpression.EVERY_HOUR, { timeZone: SCHEDULER_TIMEZONE })
  async checkNotificationExpiries(): Promise<void> {
    this.logger.log("Checking notification expiries...");

    try {
      const expiredNotifications = await this.prisma.notificationQueue.findMany({
        where: {
          status: NotificationStatus.DELIVERED,
          expiresAt: { lte: new Date() },
        },
        include: { case: true },
      });

      for (const notification of expiredNotifications) {
        // Bildirimi süresi dolmuş olarak işaretle
        await this.prisma.notificationQueue.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.EXPIRED },
        });

        // Dosya otomatik moddaysa işle
        if (notification.case?.isAutoMode && notification.caseId) {
          await this.workflowEngine.processCase(notification.caseId, notification.case.tenantId);
        }
      }

      this.logger.log(
        `Processed ${expiredNotifications.length} expired notifications`
      );
    } catch (error) {
      this.logger.error("Bildirim süre kontrolü hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.checkNotificationExpiries", error);
    }
  }

  // DBND-D6A-2-SURFACE: Her saat başı süresi dolan (PENDING, expiresAt geçmiş) paylaşılan-borçlu
  // çapraz-dosya bildirimlerini EXPIRED'a çevir. İş mantığı DebtorCrossCaseNotificationService'te
  // kalır (bu metod yalnız orkestrasyon) — PoaExpiryDeliveryService ile aynı idiom, migration/yeni
  // model YOK.
  @Cron(CronExpression.EVERY_HOUR, { timeZone: SCHEDULER_TIMEZONE })
  async expireCrossCaseNotifications(): Promise<void> {
    try {
      const count = await this.debtorCrossCaseNotificationService.expireStaleNotifications();
      if (count > 0) {
        this.logger.log(`Expired ${count} debtor cross-case notification(s)`);
      }
    } catch (error) {
      this.logger.error("Çapraz-dosya bildirim süresi kontrolü hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.expireCrossCaseNotifications", error);
    }
  }

  // DBND-D6-INACTIVE-RECIPIENT-SWEEP: Her saat başı, alıcısı artık deaktive olmuş (User.isActive=
  // false) PENDING çapraz-dosya bildirimlerini erken EXPIRED'a çevirir. İş mantığı
  // DebtorCrossCaseNotificationService'te kalır; migration/yeni model YOK.
  @Cron(CronExpression.EVERY_HOUR, { timeZone: SCHEDULER_TIMEZONE })
  async expireInactiveRecipientCrossCaseNotifications(): Promise<void> {
    try {
      const count = await this.debtorCrossCaseNotificationService.expireStaleNotificationsForInactiveRecipients();
      if (count > 0) {
        this.logger.log(`Expired ${count} debtor cross-case notification(s) for inactive recipients`);
      }
    } catch (error) {
      this.logger.error("Deaktif alıcı çapraz-dosya bildirim süpürme hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.expireInactiveRecipientCrossCaseNotifications", error);
    }
  }

  // Her gün saat 2'de süresi dolan vekaletleri EXPIRED olarak işaretle
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: SCHEDULER_TIMEZONE })
  async updateExpiredPoas(): Promise<void> {
    this.logger.log("Checking for expired powers of attorney...");

    try {
      const now = new Date();

      const result = await this.prisma.clientPowerOfAttorney.updateMany({
        where: {
          isLimited: true,
          status: PoaStatus.ACTIVE,
          validUntil: { lt: now },
        },
        data: {
          status: PoaStatus.EXPIRED,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} powers of attorney as EXPIRED`);
      } else {
        this.logger.log("No expired powers of attorney found");
      }
    } catch (error) {
      this.logger.error("Vekalet süresi kontrolü hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.updateExpiredPoas", error);
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - Nest Schedule.Cron() → EVERY_DAY_AT_9AM (POA expiry gerçek teslimat tick)
  /// </remarks>
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: SCHEDULER_TIMEZONE })
  async sendExpiringPoaNotifications(): Promise<void> {
    if (!isPoaExpiryNotificationEnabled()) return;

    this.logger.log("Checking for expiring powers of attorney to notify...");

    try {
      const result = await this.poaExpiryDeliveryService.sendExpiringPoaNotifications();

      this.logger.log(
        `POA expiry delivery completed: scanned=${result.scanned}, recipients=${result.recipients}, ` +
          `sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`,
      );
    } catch (error) {
      this.logger.error("Vekalet süre bitimi bildirim hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.sendExpiringPoaNotifications", error);
    }
  }
  // Her gün gece yarısı risk skorlarını güncelle
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: SCHEDULER_TIMEZONE })
  async updateRiskScores(): Promise<void> {
    this.logger.log("Updating risk scores...");

    try {
      const activeCases = await this.prisma.case.findMany({
        where: { status: CaseStatus.ACTIVE },
        include: {
          collections: true,
          debtors: {
            include: {
              debtor: { include: { assets: true } },
            },
          },
        },
      });

      for (const caseData of activeCases) {
        const riskScore = this.calculateRiskScore(caseData);

        await this.prisma.case.update({
          where: { id: caseData.id },
          data: { riskScore },
        });

        // Risk raporu oluştur
        await this.prisma.riskReport.create({
          data: {
            caseId: caseData.id,
            overallScore: riskScore,
            collectionProb: this.calculateCollectionProbability(caseData),
            recommendedAction: this.getRecommendedAction(riskScore),
            factors: this.getRiskFactors(caseData),
          },
        });
      }

      this.logger.log(`Updated risk scores for ${activeCases.length} cases`);
    } catch (error) {
      this.logger.error("Risk skoru güncelleme hatası:", error);
      reportCronJobFailure(this.errorReporter, "automation.updateRiskScores", error);
    }
  }

  // Risk skoru hesaplama (0-100)
  private calculateRiskScore(caseData: any): number {
    let score = 50; // Başlangıç skoru

    // Borçlu varlıkları
    const totalAssets = caseData.debtors.reduce(
      (sum: number, cd: any) => sum + cd.debtor.assets.length,
      0
    );
    if (totalAssets > 0) score -= 10;
    if (totalAssets > 3) score -= 10;

    // Tahsilat durumu (yalnız CONFIRMED tahsilat sayılır)
    const totalCollected = sumConfirmedCollections(caseData.collections);
    const totalDebt = Number(caseData.principalAmount || 0);
    if (totalDebt > 0) {
      const collectionRate = totalCollected / totalDebt;
      score -= Math.floor(collectionRate * 30);
    }

    // Dosya yaşı
    const daysSinceStart = Math.floor(
      (Date.now() - caseData.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceStart > 180) score += 10;
    if (daysSinceStart > 365) score += 10;

    // Aşama
    if (caseData.workflowStage === WorkflowStage.OBJECTION) score += 15;
    if (caseData.workflowStage === WorkflowStage.SEIZURE) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  // Tahsilat olasılığı hesaplama
  private calculateCollectionProbability(caseData: any): number {
    const riskScore = this.calculateRiskScore(caseData);
    return Math.max(0, 100 - riskScore);
  }

  // Önerilen işlem
  private getRecommendedAction(riskScore: number): string {
    if (riskScore < 30) return "Tahsilat bekleniyor, takip devam";
    if (riskScore < 50) return "Haciz işlemlerine devam";
    if (riskScore < 70) return "Satış talebi değerlendirilmeli";
    return "Dosya kapanışı veya uzlaşma değerlendirilmeli";
  }

  // Risk faktörleri
  private getRiskFactors(caseData: any): any {
    return {
      hasAssets:
        caseData.debtors.reduce(
          (sum: number, cd: any) => sum + cd.debtor.assets.length,
          0
        ) > 0,
      hasCollections: filterConfirmedCollections(caseData.collections).length > 0,
      caseAge: Math.floor(
        (Date.now() - caseData.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
      currentStage: caseData.workflowStage,
    };
  }

  // Manuel olarak dosya işleme
  async processCaseManually(caseId: string, tenantId: string): Promise<void> {
    await this.workflowEngine.processCase(caseId, tenantId);
  }

  // Otomatik modu aç/kapat
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AutomationController.toggleAutoMode() -> POST /automation/cases/:id/toggle-auto
  /// </remarks>
  async toggleAutoMode(caseId: string, enabled: boolean, tenantId: string): Promise<void> {
    // AUTOMATION-TOGGLE-TENANT-GUARD-R01: tenant context yoksa fail-closed, sorgu hiç çalışmaz
    // (SEC-TENANT-HARDEN-P01 / address-task.service.ts ile aynı desen).
    if (!tenantId) {
      throw new ForbiddenException("Tenant context required");
    }

    // Atomic tenant-scoped write: check-then-write TOCTOU'dan kaçınmak için tek updateMany.
    const result = await this.prisma.case.updateMany({
      where: {
        id: caseId,
        tenantId,
      },
      data: {
        isAutoMode: enabled,
        nextActionAt: enabled ? new Date() : null,
      },
    });

    if (result.count === 0) {
      // Var olmayan dosya ile başka tenant'a ait dosya aynı generic hatayı üretir (enumeration yok).
      throw new NotFoundException("Dosya bulunamadı");
    }
    if (result.count > 1) {
      // id primary key olduğundan yapısal olarak imkansız; sessizce başarı sayılmaz.
      throw new InternalServerErrorException(
        `toggleAutoMode: beklenmeyen updateMany count=${result.count} (caseId=${caseId})`
      );
    }
  }

  // İstatistikler
  async getAutomationStats(tenantId: string): Promise<any> {
    // SEC-XTEN-AUTOMATION-STATS-01: tenant context yoksa fail-closed (sorgu hiç çalışmaz).
    if (!tenantId) {
      return { totalAutoCases: 0, totalAutoActions: 0, recentActions: [] };
    }

    const [totalAuto, totalProcessed, recentActions] = await Promise.all([
      this.prisma.case.count({ where: { isAutoMode: true, tenantId } }),
      this.prisma.decisionLog.count({ where: { isAutomatic: true, case: { tenantId } } }),
      this.prisma.decisionLog.findMany({
        where: { isAutomatic: true, case: { tenantId } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { case: { select: { fileNumber: true } } },
      }),
    ]);

    return {
      totalAutoCases: totalAuto,
      totalAutoActions: totalProcessed,
      recentActions,
    };
  }
}
