import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Zamanlayıcı Servisi
 * 
 * UYAP iş akışı mantığına uygun otomatik işlemler:
 * - Ödeme emri süre takibi (10 gün)
 * - Nafaka dönem otomasyonu (aylık)
 * - MTS 7 gün kontrolü
 * - Başarısız UYAP isteklerini yeniden deneme
 */

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  // Prisma client'a any olarak erişim (generate sonrası düzelecek)
  private get db(): any {
    return this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  /**
   * Her gün saat 09:00'da çalışır
   * Ödeme emri süresi dolan dosyaları kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkPaymentOrderDeadlines() {
    this.logger.log('⏰ Ödeme emri süre kontrolü başladı...');

    try {
      // nextActionAt tarihi geçmiş ve WAITING_RESPONSE aşamasındaki dosyalar
      const expiredCases = await this.db.case.findMany({
        where: {
          workflowStage: 'WAITING_RESPONSE',
          nextActionAt: { lte: new Date() },
          isAutomationEnabled: true,
          caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
        },
        include: {
          debtors: { include: { debtor: true } },
        },
      });

      this.logger.log(`📋 ${expiredCases.length} dosyada süre dolmuş`);

      for (const caseData of expiredCases) {
        await this.processExpiredPaymentOrder(caseData);
      }
    } catch (error) {
      this.logger.error('Ödeme emri kontrolü hatası:', error);
    }
  }

  /**
   * Süresi dolan ödeme emri için haciz aşamasına geç
   */
  private async processExpiredPaymentOrder(caseData: any) {
    this.logger.log(`🔄 Dosya işleniyor: ${caseData.fileNumber}`);

    // Workflow stage'i güncelle
    await this.db.case.update({
      where: { id: caseData.id },
      data: {
        workflowStage: 'ENFORCEMENT',
        nextAutoAction: 'HACIZ_TALEBI',
        nextActionAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 gün sonra
      },
    });

    // DecisionLog'a kaydet
    await this.db.decisionLog.create({
      data: {
        caseId: caseData.id,
        decisionType: 'NEXT_ACTION',
        decision: 'Ödeme emri süresi doldu - Haciz aşamasına geçildi',
        reasoning: 'Ödeme emri tebliğinden itibaren 10 gün geçti, itiraz yapılmadı',
        isAutomatic: true,
        executedAt: new Date(),
      },
    });

    // Lifecycle event
    await this.db.caseLifecycle.create({
      data: {
        caseId: caseData.id,
        stage: 'ENFORCEMENT',
        action: 'AUTO_STAGE_CHANGE',
        description: 'Ödeme emri süresi doldu, haciz aşamasına geçildi',
        triggeredBy: 'AUTO',
      },
    });

    this.logger.log(`✅ ${caseData.fileNumber} haciz aşamasına geçti`);
  }


  /**
   * Her ayın 1'inde saat 08:00'da çalışır
   * Nafaka dosyalarına yeni dönem alacağı ekler
   */
  @Cron('0 8 1 * *') // Her ayın 1'i saat 08:00
  async processNafakaPeriods() {
    this.logger.log('⏰ Nafaka dönem kontrolü başladı...');

    try {
      // Aktif nafaka dosyaları
      const nafakaCases = await this.db.case.findMany({
        where: {
          subCategory: 'NAFAKA',
          isAutomationEnabled: true,
          caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
        },
        include: {
          dues: true,
        },
      });

      this.logger.log(`📋 ${nafakaCases.length} nafaka dosyası bulundu`);

      const currentMonth = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

      for (const caseData of nafakaCases) {
        await this.addNafakaPeriod(caseData, currentMonth);
      }
    } catch (error) {
      this.logger.error('Nafaka dönem kontrolü hatası:', error);
    }
  }

  /**
   * Nafaka dosyasına yeni dönem ekle
   */
  private async addNafakaPeriod(caseData: any, period: string) {
    // Aylık nafaka tutarını bul (metadata'dan veya son due'dan)
    const monthlyAmount = (caseData.metadata as any)?.monthlyNafaka || 
      caseData.dues?.find((d: any) => d.description?.includes('Aylık'))?.amount ||
      0;

    if (monthlyAmount <= 0) {
      this.logger.warn(`⚠️ ${caseData.fileNumber} için aylık nafaka tutarı bulunamadı`);
      return;
    }

    // Yeni alacak satırı ekle
    await this.db.due.create({
      data: {
        caseId: caseData.id,
        type: 'PRINCIPAL',
        description: `${period} Nafaka`,
        amount: monthlyAmount,
        dueDate: new Date(),
      },
    });

    // DecisionLog'a kaydet
    await this.db.decisionLog.create({
      data: {
        caseId: caseData.id,
        decisionType: 'NEXT_ACTION',
        decision: `Yeni nafaka dönemi eklendi: ${period}`,
        reasoning: 'Aylık nafaka otomasyonu',
        isAutomatic: true,
        executedAt: new Date(),
        inputData: { period, amount: monthlyAmount },
      },
    });

    this.logger.log(`✅ ${caseData.fileNumber} - ${period} nafaka eklendi: ${monthlyAmount} TL`);
  }

  /**
   * Her gün saat 10:00'da çalışır
   * MTS dosyalarında 7 gün kontrolü
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async checkMtsReturns() {
    this.logger.log('⏰ MTS dönüş kontrolü başladı...');

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // MTS dosyaları - 7 günü geçmiş
      const mtsCases = await this.db.case.findMany({
        where: {
          isMtsCase: true,
          mtsReturnDate: { lte: sevenDaysAgo },
          isAutomationEnabled: true,
          caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
          workflowStage: { not: 'ENFORCEMENT' }, // Henüz icra takibine geçmemiş
        },
      });

      this.logger.log(`📋 ${mtsCases.length} MTS dosyasında süre dolmuş`);

      for (const caseData of mtsCases) {
        await this.processMtsReturn(caseData);
      }
    } catch (error) {
      this.logger.error('MTS kontrolü hatası:', error);
    }
  }

  /**
   * MTS'den icra takibine dönüş
   */
  private async processMtsReturn(caseData: any) {
    this.logger.log(`🔄 MTS dönüşü: ${caseData.fileNumber}`);

    await this.db.case.update({
      where: { id: caseData.id },
      data: {
        isMtsCase: false, // Artık normal icra takibi
        workflowStage: 'PAYMENT_ORDER',
        nextAutoAction: 'ODEME_EMRI',
        nextActionAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 gün sonra
      },
    });

    await this.db.decisionLog.create({
      data: {
        caseId: caseData.id,
        decisionType: 'NEXT_ACTION',
        decision: 'MTS süresi doldu - İcra takibine dönüldü',
        reasoning: 'MTS başvurusundan 7 gün geçti, ödeme yapılmadı',
        isAutomatic: true,
        executedAt: new Date(),
      },
    });

    await this.db.caseLifecycle.create({
      data: {
        caseId: caseData.id,
        stage: 'PAYMENT_ORDER',
        action: 'MTS_RETURN',
        description: 'MTS süresi doldu, icra takibine dönüldü',
        triggeredBy: 'AUTO',
      },
    });

    this.logger.log(`✅ ${caseData.fileNumber} icra takibine döndü`);
  }


  /**
   * Her 6 saatte bir çalışır
   * Başarısız UYAP isteklerini yeniden dener
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async retryFailedUyapRequests() {
    this.logger.log('⏰ UYAP retry kontrolü başladı...');

    try {
      const failedRequests = await this.db.uyapRequestLog.findMany({
        where: {
          status: 'FAILED',
          retryCount: { lt: 3 },
        },
        take: 10,
      });

      this.logger.log(`📋 ${failedRequests.length} başarısız istek bulundu`);

      for (const request of failedRequests) {
        await this.db.uyapRequestLog.update({
          where: { id: request.id },
          data: {
            status: 'RETRY',
            retryCount: { increment: 1 },
          },
        });

        // Not: Gerçek retry UyapService'de yapılacak
        this.logger.log(`🔄 Retry kuyruğuna eklendi: ${request.id}`);
      }
    } catch (error) {
      this.logger.error('UYAP retry hatası:', error);
    }
  }

  /**
   * Her gün gece yarısı çalışır
   * Günlük istatistikleri hesaplar
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async calculateDailyStats() {
    this.logger.log('⏰ Günlük istatistik hesaplama başladı...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = await this.db.case.groupBy({
        by: ['caseStatus'],
        _count: true,
      });

      const automationStats = await this.db.decisionLog.count({
        where: {
          isAutomatic: true,
          createdAt: { gte: today },
        },
      });

      this.logger.log(`📊 Günlük istatistikler:`);
      this.logger.log(`   - Dosya durumları: ${JSON.stringify(stats)}`);
      this.logger.log(`   - Bugünkü otomatik işlemler: ${automationStats}`);
    } catch (error) {
      this.logger.error('İstatistik hesaplama hatası:', error);
    }
  }

  /**
   * Her saat başı çalışır
   * Yaklaşan görevleri kontrol eder
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkUpcomingTasks() {
    this.logger.log('⏰ Yaklaşan görev kontrolü...');

    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const upcomingTasks = await this.db.task.count({
        where: {
          status: 'PENDING',
          dueDate: { lte: tomorrow },
        },
      });

      if (upcomingTasks > 0) {
        this.logger.log(`⚠️ ${upcomingTasks} görev yarına kadar tamamlanmalı`);
      }
    } catch (error) {
      this.logger.error('Görev kontrolü hatası:', error);
    }
  }

  /**
   * Manuel tetikleme için - Tüm kontrolleri çalıştır
   */
  async runAllChecks() {
    this.logger.log('🚀 Tüm kontroller manuel tetiklendi...');

    await this.checkPaymentOrderDeadlines();
    await this.checkMtsReturns();
    await this.retryFailedUyapRequests();
    await this.checkUpcomingTasks();

    return { message: 'Tüm kontroller tamamlandı' };
  }

  /**
   * Scheduler durumunu getir
   */
  async getStatus() {
    const [
      pendingPaymentOrders,
      activeMtsCases,
      failedUyapRequests,
      upcomingTasks,
    ] = await Promise.all([
      this.db.case.count({
        where: {
          workflowStage: 'WAITING_RESPONSE',
          nextActionAt: { lte: new Date() },
        },
      }),
      this.db.case.count({
        where: { isMtsCase: true, caseStatus: { in: ['DERDEST', 'ISLEMDE'] } },
      }),
      this.db.uyapRequestLog.count({
        where: { status: 'FAILED', retryCount: { lt: 3 } },
      }),
      this.db.task.count({
        where: {
          status: 'PENDING',
          dueDate: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      pendingPaymentOrders,
      activeMtsCases,
      failedUyapRequests,
      upcomingTasks,
      lastCheck: new Date().toISOString(),
    };
  }
}
