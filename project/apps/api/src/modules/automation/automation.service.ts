import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { CaseStatus, WorkflowStage, NotificationStatus, LegalCaseStatus, PoaStatus } from "@prisma/client";

// Otomasyon açık olan statüler (C.19)
const AUTOMATION_ENABLED_STATUSES: LegalCaseStatus[] = [
  'DERDEST',
  'ISLEMDE', 
  'DERKENAR',
];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private workflowEngine: WorkflowEngine
  ) {}

  // Her 5 dakikada bir çalışan ana kontrol döngüsü (C.20)
  @Cron(CronExpression.EVERY_5_MINUTES)
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

          await this.workflowEngine.processCase(caseData.id);

          const nextActionAt = await this.workflowEngine.calculateNextActionTime(caseData.id);
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
    } finally {
      this.isProcessing = false;
      this.logger.log("Automation cycle completed");
    }
  }

  // Her gece gün sayacını güncelle (C.23)
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async updateDaysLeft(): Promise<void> {
    this.logger.log("Updating days left for active cases...");

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
  }

  // Her saat başı tebligat sürelerini kontrol et
  @Cron(CronExpression.EVERY_HOUR)
  async checkNotificationExpiries(): Promise<void> {
    this.logger.log("Checking notification expiries...");

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
        await this.workflowEngine.processCase(notification.caseId);
      }
    }

    this.logger.log(
      `Processed ${expiredNotifications.length} expired notifications`
    );
  }

  // Her gün saat 2'de süresi dolan vekaletleri EXPIRED olarak işaretle
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async updateExpiredPoas(): Promise<void> {
    this.logger.log("Checking for expired powers of attorney...");

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
  }

  // Her gün saat 9'da süresi dolmak üzere olan vekaletler için bildirim gönder
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendExpiringPoaNotifications(): Promise<void> {
    this.logger.log("Checking for expiring powers of attorney to notify...");

    const now = new Date();
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    // 7 gün içinde süresi dolacak vekaletleri bul
    const expiringPoas = await this.prisma.clientPowerOfAttorney.findMany({
      where: {
        isLimited: true,
        status: PoaStatus.ACTIVE,
        validUntil: {
          gte: now,
          lte: in30Days,
        },
      },
      include: {
        client: {
          select: { id: true, displayName: true, tenantId: true },
        },
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true, email: true },
            },
          },
        },
      },
    });

    if (expiringPoas.length === 0) {
      this.logger.log("No expiring powers of attorney found");
      return;
    }

    // Tenant bazında grupla
    const poasByTenant = new Map<string, typeof expiringPoas>();
    for (const poa of expiringPoas) {
      const tenantId = poa.client.tenantId;
      if (!poasByTenant.has(tenantId)) {
        poasByTenant.set(tenantId, []);
      }
      poasByTenant.get(tenantId)!.push(poa);
    }

    // Her tenant için bildirim oluştur
    for (const [tenantId, poas] of poasByTenant) {
      try {
        // Tenant'ın admin kullanıcısını bul
        const adminUser = await this.prisma.user.findFirst({
          where: { tenantId, role: 'ADMIN' },
          select: { id: true, email: true },
        });

        if (!adminUser?.email) continue;

        // Bildirim içeriği oluştur
        const urgentPoas = poas.filter(p => {
          const daysLeft = Math.ceil((new Date(p.validUntil!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysLeft <= 7;
        });

        const warningPoas = poas.filter(p => {
          const daysLeft = Math.ceil((new Date(p.validUntil!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return daysLeft > 7 && daysLeft <= 30;
        });

        // Bildirim kuyruğuna ekle
        await this.prisma.notificationQueue.create({
          data: {
            tenantId,
            type: 'POA_EXPIRING',
            channel: 'EMAIL',
            recipient: adminUser.email,
            subject: `⚠️ Süresi Dolmak Üzere Olan Vekaletler (${poas.length} adet)`,
            content: this.buildPoaExpiringEmailBody(urgentPoas, warningPoas),
            status: NotificationStatus.PENDING,
            metadata: {
              urgentCount: urgentPoas.length,
              warningCount: warningPoas.length,
              poaIds: poas.map(p => p.id),
            },
          },
        });

        this.logger.log(`Created POA expiring notification for tenant ${tenantId}: ${poas.length} POAs`);
      } catch (error) {
        this.logger.error(`Failed to create notification for tenant ${tenantId}: ${error}`);
      }
    }
  }

  // Vekalet süresi dolacak e-posta içeriği oluştur
  private buildPoaExpiringEmailBody(
    urgentPoas: any[],
    warningPoas: any[],
  ): string {
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">⚠️ Süresi Dolmak Üzere Olan Vekaletler</h2>
        <p>Aşağıdaki vekaletlerin süresi dolmak üzeredir. Lütfen gerekli işlemleri yapınız.</p>
    `;

    if (urgentPoas.length > 0) {
      html += `
        <h3 style="color: #dc2626; margin-top: 20px;">🔴 Acil (7 gün içinde)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background: #fef2f2;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Müvekkil</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Avukat(lar)</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Bitiş Tarihi</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Kalan</th>
          </tr>
      `;
      for (const poa of urgentPoas) {
        const daysLeft = Math.ceil((new Date(poa.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const lawyerNames = poa.lawyers?.map((l: any) => `${l.lawyer.name} ${l.lawyer.surname}`).join(', ') || '-';
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${poa.client.displayName}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${lawyerNames}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(poa.validUntil).toLocaleDateString('tr-TR')}</td>
            <td style="padding: 8px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${daysLeft} gün</td>
          </tr>
        `;
      }
      html += '</table>';
    }

    if (warningPoas.length > 0) {
      html += `
        <h3 style="color: #d97706; margin-top: 20px;">🟡 Uyarı (30 gün içinde)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background: #fffbeb;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Müvekkil</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Avukat(lar)</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Bitiş Tarihi</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Kalan</th>
          </tr>
      `;
      for (const poa of warningPoas) {
        const daysLeft = Math.ceil((new Date(poa.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const lawyerNames = poa.lawyers?.map((l: any) => `${l.lawyer.name} ${l.lawyer.surname}`).join(', ') || '-';
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${poa.client.displayName}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${lawyerNames}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(poa.validUntil).toLocaleDateString('tr-TR')}</td>
            <td style="padding: 8px; border: 1px solid #ddd; color: #d97706;">${daysLeft} gün</td>
          </tr>
        `;
      }
      html += '</table>';
    }

    html += `
        <p style="margin-top: 20px; color: #666;">
          Bu bildirim otomatik olarak gönderilmiştir. Vekaletleri yönetmek için 
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/clients">Müvekkiller</a> 
          sayfasını ziyaret edin.
        </p>
      </div>
    `;

    return html;
  }

  // Her gün gece yarısı risk skorlarını güncelle
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateRiskScores(): Promise<void> {
    this.logger.log("Updating risk scores...");

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

    // Tahsilat durumu
    const totalCollected = caseData.collections.reduce(
      (sum: number, c: any) => sum + Number(c.amount),
      0
    );
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
      hasCollections: caseData.collections.length > 0,
      caseAge: Math.floor(
        (Date.now() - caseData.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
      currentStage: caseData.workflowStage,
    };
  }

  // Manuel olarak dosya işleme
  async processCaseManually(caseId: string): Promise<void> {
    await this.workflowEngine.processCase(caseId);
  }

  // Otomatik modu aç/kapat
  async toggleAutoMode(caseId: string, enabled: boolean): Promise<void> {
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        isAutoMode: enabled,
        nextActionAt: enabled ? new Date() : null,
      },
    });
  }

  // İstatistikler
  async getAutomationStats(): Promise<any> {
    const [totalAuto, totalProcessed, recentActions] = await Promise.all([
      this.prisma.case.count({ where: { isAutoMode: true } }),
      this.prisma.decisionLog.count({ where: { isAutomatic: true } }),
      this.prisma.decisionLog.findMany({
        where: { isAutomatic: true },
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
