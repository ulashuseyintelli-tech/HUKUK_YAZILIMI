import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { runBatched } from './scheduler-batch.helper';
import { SchedulerMetricsService } from './scheduler-metrics.service';
import { TebligatService } from '../tebligat/tebligat.service'; // PR-S2: tebligat sonuç senkronu ortak kapı
import { TebligatPttResult } from '../tebligat/dto/tebligat.dto';

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

  // F2 hardening: `db` artık `any` DEĞİL (eski "generate sonrası düzelecek" notu burada çözüldü).
  // `any` iken `this.db.notification` gibi OLMAYAN Prisma delegelerine erişim derleme-zamanı
  // yakalanmıyordu → DUE_REMINDER ölü yolu böyle kaçmıştı. PrismaService tipiyle nonexistent
  // delege artık tsc hatası verir (bu sınıf runtime-ölü-yol shipping'e giremez).
  private get db(): PrismaService {
    return this.prisma;
  }

  constructor(
    private prisma: PrismaService,
    private readonly schedulerMetrics: SchedulerMetricsService,
    private readonly tebligatService: TebligatService, // PR-S2: cron tebligat sonuçları ortak sync yoluna bağlandı
  ) {}

  // --- isRunning guards ---
  private isRunning_checkPaymentOrderDeadlines = false;
  private isRunning_processNafakaPeriods = false;
  private isRunning_checkMtsReturns = false;
  private isRunning_retryFailedUyapRequests = false;
  private isRunning_checkIhbarnameDeadlines = false;
  private isRunning_checkExternalCaseFollowups = false;
  private isRunning_checkTebligatStatus = false;
  // isRunning_sendDueReminders kaldırıldı — sendDueReminders F2'de devre dışı (ölü yol).

  /**
   * Her gün saat 09:00'da çalışır
   * Ödeme emri süresi dolan dosyaları kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkPaymentOrderDeadlines() {
    if (this.isRunning_checkPaymentOrderDeadlines) {
      this.logger.warn('[scheduler] checkPaymentOrderDeadlines already running, skipping');
      return;
    }
    this.isRunning_checkPaymentOrderDeadlines = true;

    this.logger.log('⏰ Ödeme emri süre kontrolü başladı...');

    try {
      const result = await runBatched(
        (args) =>
          this.db.case.findMany({
            where: {
              workflowStage: 'WAITING_RESPONSE',
              nextActionAt: { lte: new Date() },
              isAutomationEnabled: true,
              caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
            },
            include: {
              debtors: { include: { debtor: true } },
            },
            ...args,
          }),
        (caseData) => this.processExpiredPaymentOrder(caseData),
      );

      this.schedulerMetrics.record('checkPaymentOrderDeadlines', result);
      this.logger.log(`📋 ${result.processed} dosyada süre dolmuş (truncated: ${result.truncated})`);
    } catch (error) {
      this.logger.error('Ödeme emri kontrolü hatası:', error);
    } finally {
      this.isRunning_checkPaymentOrderDeadlines = false;
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
    if (this.isRunning_processNafakaPeriods) {
      this.logger.warn('[scheduler] processNafakaPeriods already running, skipping');
      return;
    }
    this.isRunning_processNafakaPeriods = true;

    this.logger.log('⏰ Nafaka dönem kontrolü başladı...');

    try {
      const currentMonth = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

      const result = await runBatched(
        (args) =>
          this.db.case.findMany({
            where: {
              subCategory: 'NAFAKA',
              isAutomationEnabled: true,
              caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
            },
            include: {
              dues: true,
            },
            ...args,
          }),
        (caseData) => this.addNafakaPeriod(caseData, currentMonth),
      );

      this.schedulerMetrics.record('processNafakaPeriods', result);
      this.logger.log(`📋 ${result.processed} nafaka dosyası işlendi (truncated: ${result.truncated})`);
    } catch (error) {
      this.logger.error('Nafaka dönem kontrolü hatası:', error);
    } finally {
      this.isRunning_processNafakaPeriods = false;
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
    if (this.isRunning_checkMtsReturns) {
      this.logger.warn('[scheduler] checkMtsReturns already running, skipping');
      return;
    }
    this.isRunning_checkMtsReturns = true;

    this.logger.log('⏰ MTS dönüş kontrolü başladı...');

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await runBatched(
        (args) =>
          this.db.case.findMany({
            where: {
              isMtsCase: true,
              mtsReturnDate: { lte: sevenDaysAgo },
              isAutomationEnabled: true,
              caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
              workflowStage: { not: 'ENFORCEMENT' },
            },
            ...args,
          }),
        (caseData) => this.processMtsReturn(caseData),
      );

      this.schedulerMetrics.record('checkMtsReturns', result);
      this.logger.log(`📋 ${result.processed} MTS dosyasında süre dolmuş (truncated: ${result.truncated})`);
    } catch (error) {
      this.logger.error('MTS kontrolü hatası:', error);
    } finally {
      this.isRunning_checkMtsReturns = false;
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
    if (this.isRunning_retryFailedUyapRequests) {
      this.logger.warn('[scheduler] retryFailedUyapRequests already running, skipping');
      return;
    }
    this.isRunning_retryFailedUyapRequests = true;

    this.logger.log('⏰ UYAP retry kontrolü başladı...');

    try {
      const result = await runBatched(
        (args) =>
          this.db.uyapRequestLog.findMany({
            where: {
              status: 'FAILED',
              retryCount: { lt: 3 },
            },
            ...args,
          }),
        async (request) => {
          await this.db.uyapRequestLog.update({
            where: { id: request.id },
            data: {
              status: 'RETRY',
              retryCount: { increment: 1 },
            },
          });
          this.logger.log(`🔄 Retry kuyruğuna eklendi: ${request.id}`);
        },
      );

      this.schedulerMetrics.record('retryFailedUyapRequests', result);
      this.logger.log(`📋 ${result.processed} başarısız istek retry'a alındı (truncated: ${result.truncated})`);
    } catch (error) {
      this.logger.error('UYAP retry hatası:', error);
    } finally {
      this.isRunning_retryFailedUyapRequests = false;
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
   * Her gün saat 10:00'da çalışır
   * 89 İhbarname sürelerini kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async checkIhbarnameDeadlines() {
    if (this.isRunning_checkIhbarnameDeadlines) {
      this.logger.warn('[scheduler] checkIhbarnameDeadlines already running, skipping');
      return;
    }
    this.isRunning_checkIhbarnameDeadlines = true;

    this.logger.log('⏰ 89 İhbarname süre kontrolü başladı...');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 89/1 süresi dolan (89/2 gönderilmemiş)
      const result89_1 = await runBatched(
        (args) =>
          this.db.thirdParty.findMany({
            where: {
              ihbarname89_1_date: { lte: sevenDaysAgo },
              ihbarname89_2_date: null,
              responseDate: null,
            },
            include: {
              caseDebtor: {
                include: {
                  case: { select: { id: true, fileNumber: true, tenantId: true } },
                  debtor: { select: { name: true } },
                },
              },
            },
            ...args,
          }),
        (tp) => this.createIhbarnameReminderTask(tp, '89/2'),
      );

      // 89/2 süresi dolan (89/3 gönderilmemiş)
      const result89_2 = await runBatched(
        (args) =>
          this.db.thirdParty.findMany({
            where: {
              ihbarname89_2_date: { lte: sevenDaysAgo },
              ihbarname89_3_date: null,
              responseDate: null,
            },
            include: {
              caseDebtor: {
                include: {
                  case: { select: { id: true, fileNumber: true, tenantId: true } },
                  debtor: { select: { name: true } },
                },
              },
            },
            ...args,
          }),
        (tp) => this.createIhbarnameReminderTask(tp, '89/3'),
      );

      // Toplam sonuçları birleştir ve raporla
      const totalProcessed = result89_1.processed + result89_2.processed;
      const totalBatches = result89_1.batches + result89_2.batches;
      const anyTruncated = result89_1.truncated || result89_2.truncated;
      this.schedulerMetrics.record('checkIhbarnameDeadlines', {
        processed: totalProcessed,
        batches: totalBatches,
        truncated: anyTruncated,
      });

      this.logger.log(`📋 89/1 süresi dolan: ${result89_1.processed}, 89/2 süresi dolan: ${result89_2.processed} (truncated: ${anyTruncated})`);
    } catch (error) {
      this.logger.error('89 İhbarname kontrolü hatası:', error);
    } finally {
      this.isRunning_checkIhbarnameDeadlines = false;
    }
  }

  /**
   * İhbarname hatırlatma task'ı oluştur
   */
  private async createIhbarnameReminderTask(thirdParty: any, nextIhbarname: string) {
    const caseData = thirdParty.caseDebtor?.case;
    if (!caseData) return;

    // Aynı task zaten var mı kontrol et
    const existingTask = await this.db.task.findFirst({
      where: {
        caseId: caseData.id,
        title: { contains: `${nextIhbarname} - ${thirdParty.name}` },
        status: 'PENDING',
      },
    });

    if (existingTask) return;

    // Yeni task oluştur
    await this.db.task.create({
      data: {
        tenantId: caseData.tenantId,
        caseId: caseData.id,
        title: `${nextIhbarname} İhbarname Gönder - ${thirdParty.name}`,
        description: `${caseData.fileNumber} dosyasında ${thirdParty.caseDebtor?.debtor?.name || 'borçlu'} için ${thirdParty.name}'a ${nextIhbarname} haciz ihbarnamesi gönderilmeli. Önceki ihbarname süresi doldu.`,
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 gün içinde
      },
    });

    this.logger.log(`✅ Task oluşturuldu: ${nextIhbarname} - ${thirdParty.name} (${caseData.fileNumber})`);
  }

  /**
   * Alacak haczi (dış dosya) takibi
   */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async checkExternalCaseFollowups() {
    if (this.isRunning_checkExternalCaseFollowups) {
      this.logger.warn('[scheduler] checkExternalCaseFollowups already running, skipping');
      return;
    }
    this.isRunning_checkExternalCaseFollowups = true;

    this.logger.log('⏰ Alacak haczi takip kontrolü başladı...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await runBatched(
        (args) =>
          this.db.externalCase.findMany({
            where: {
              attachmentStatus: { in: ['HACIZ_KONDU', 'CEVAP_BEKLENIYOR'] },
              attachedAt: { lte: thirtyDaysAgo },
            },
            include: {
              caseDebtor: {
                include: {
                  case: { select: { id: true, fileNumber: true, tenantId: true } },
                  debtor: { select: { name: true } },
                },
              },
            },
            ...args,
          }),
        (ec) => this.createExternalCaseFollowupTask(ec),
      );

      this.schedulerMetrics.record('checkExternalCaseFollowups', result);
      this.logger.log(`📋 ${result.processed} dış dosya takip edildi (truncated: ${result.truncated})`);
    } catch (error) {
      this.logger.error('Alacak haczi takip kontrolü hatası:', error);
    } finally {
      this.isRunning_checkExternalCaseFollowups = false;
    }
  }

  /**
   * Dış dosya takip task'ı oluştur
   */
  private async createExternalCaseFollowupTask(externalCase: any) {
    const caseData = externalCase.caseDebtor?.case;
    if (!caseData) return;

    // Aynı task zaten var mı kontrol et
    const existingTask = await this.db.task.findFirst({
      where: {
        caseId: caseData.id,
        title: { contains: `Alacak Haczi Takip - ${externalCase.externalCaseNo}` },
        status: 'PENDING',
      },
    });

    if (existingTask) return;

    // Yeni task oluştur
    await this.db.task.create({
      data: {
        tenantId: caseData.tenantId,
        caseId: caseData.id,
        title: `Alacak Haczi Takip - ${externalCase.externalCaseNo}`,
        description: `${caseData.fileNumber} dosyasında ${externalCase.externalOffice} ${externalCase.externalCaseNo} nolu dış dosyaya konulan haciz 30 günü aştı. Durum sorgulanmalı.`,
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 gün içinde
      },
    });

    this.logger.log(`✅ Task oluşturuldu: Alacak Haczi Takip - ${externalCase.externalCaseNo}`);
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
      expiredIhbarnames,
      pendingExternalCases,
      pendingTebligat,
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
      // 89 ihbarname süresi dolanlar
      this.db.thirdParty.count({
        where: {
          OR: [
            { ihbarname89_1_date: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, ihbarname89_2_date: null, responseDate: null },
            { ihbarname89_2_date: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, ihbarname89_3_date: null, responseDate: null },
          ],
        },
      }),
      // Bekleyen dış dosyalar
      this.db.externalCase.count({
        where: {
          attachmentStatus: { in: ['HACIZ_KONDU', 'CEVAP_BEKLENIYOR'] },
          attachedAt: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Gönderilmiş tebligatlar
      this.db.tebligat.count({
        where: {
          status: 'GONDERILDI',
          barcodeNo: { not: null },
        },
      }),
    ]);

    return {
      pendingPaymentOrders,
      activeMtsCases,
      failedUyapRequests,
      upcomingTasks,
      expiredIhbarnames,
      pendingExternalCases,
      pendingTebligat,
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Her 4 saatte bir çalışır
   * Gönderilmiş tebligatların sonucunu sorgular:
   *  - PTT kanalı  → queryPttBarcode (barkod sorgu) → recordPttResult ortak yolu
   *  - UETS/KEP    → queryElectronicDelivery → recordElectronicResult ortak yolu
   * PR-S2: cron artık db.tebligat.update'i DOĞRUDAN çağırmaz; tüm sonuçlar TebligatService'in
   * ortak senkron kapısından geçer (CaseDebtor.serviceStatus + istihbarat tetiği cron'da da çalışır).
   */
  @Cron('0 */4 * * *') // Her 4 saatte bir
  async checkTebligatStatus() {
    if (this.isRunning_checkTebligatStatus) {
      this.logger.warn('[scheduler] checkTebligatStatus already running, skipping');
      return;
    }
    this.isRunning_checkTebligatStatus = true;

    this.logger.log('⏰ Tebligat durum kontrolü başladı...');

    try {
      // 1) PTT (fiziksel) barkod sorgu
      const pttResult = await runBatched(
        (args) =>
          this.db.tebligat.findMany({
            where: {
              status: 'GONDERILDI',
              barcodeNo: { not: null },
              channel: 'PTT',
            },
            ...args,
          }),
        (tebligat) => this.queryPttBarcode(tebligat),
      );
      this.schedulerMetrics.record('checkTebligatStatus', pttResult);

      // 2) UETS/KEP (elektronik) teslim sorgu — PR-S2: e-tebligat artık cron kapsamında
      const electronicResult = await runBatched(
        (args) =>
          this.db.tebligat.findMany({
            where: {
              status: 'GONDERILDI',
              barcodeNo: { not: null },
              channel: { in: ['UETS', 'KEP'] },
            },
            ...args,
          }),
        (tebligat) => this.queryElectronicDelivery(tebligat),
      );
      this.schedulerMetrics.record('checkTebligatStatus', electronicResult);

      this.logger.log(
        `📋 PTT ${pttResult.processed} + e-tebligat ${electronicResult.processed} sorgulandı ` +
          `(truncated: ${pttResult.truncated || electronicResult.truncated})`,
      );
    } catch (error) {
      this.logger.error('Tebligat kontrolü hatası:', error);
    } finally {
      this.isRunning_checkTebligatStatus = false;
    }
  }

  /**
   * PTT barkod sorgulama (mock - gerçek PTT API entegrasyonu için güncellenecek).
   * PR-S2: Doğrudan db.tebligat.update KALDIRILDI. Mock sonuç → pttResult koduna çevrilir ve
   * TebligatService.recordPttResult ortak kapısından geçirilir → Tebligat.update + CaseDebtor
   * senkronu + istihbarat tetiği AYNI yoldan (B kararı: IADE_GELDI → ADRESTE_BULUNAMADI).
   * İade halinde, recordPttResult'tan SONRA case-seviyesi takip görevi korunur (A kararı).
   */
  private async queryPttBarcode(tebligat: any) {
    try {
      // Mock: Gerçek PTT API entegrasyonu burada yapılacak. Şimdilik rastgele sonuç (test için).
      const mockResults = ['TESLIM_EDILDI', 'IADE_GELDI', 'GONDERILDI'];
      const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];

      // GONDERILDI = sonuç yok → no-op
      if (randomResult === 'GONDERILDI') return;

      // B kararı: mock durumu → tek kapı pttResult koduna eşle
      const pttResult =
        randomResult === 'TESLIM_EDILDI'
          ? TebligatPttResult.TESLIM_EDILDI
          : TebligatPttResult.ADRESTE_BULUNAMADI; // IADE_GELDI

      // Ortak senkron kapısı: Tebligat.update + CaseDebtor.serviceStatus + istihbarat (atomik)
      await this.tebligatService.recordPttResult(tebligat.tenantId, tebligat.id, {
        pttResult,
        pttResultDate: new Date().toISOString(),
      } as any);

      this.logger.log(`✅ Tebligat senkronlandı: ${tebligat.barcodeNo} -> ${randomResult}`);

      // A kararı: İade geldiyse case-seviyesi takip görevi (MERNİS sorgu) recordPttResult'tan SONRA korunur
      if (randomResult === 'IADE_GELDI') {
        await this.createTebligatFollowupTask(tebligat);
      }
    } catch (error) {
      this.logger.error(`Barkod sorgulama hatası (${tebligat.barcodeNo}):`, error);
    }
  }

  /**
   * UETS/KEP elektronik teslim sorgulama (mock plumbing).
   * PR-S2: e-tebligat sonucu ortak kapıdan (recordElectronicResult) geçer → Tebligat.update +
   * CaseDebtor.serviceStatus + istihbarat tetiği. Doğrudan db.tebligat.update YOK.
   */
  private async queryElectronicDelivery(tebligat: any) {
    try {
      await this.tebligatService.recordElectronicResult(tebligat.tenantId, tebligat.id);
      this.logger.log(`✅ E-tebligat senkronlandı: ${tebligat.channel} ${tebligat.barcodeNo}`);
    } catch (error) {
      this.logger.error(`E-tebligat sorgulama hatası (${tebligat.barcodeNo}):`, error);
    }
  }

  /**
   * Tebligat takip task'ı oluştur
   */
  private async createTebligatFollowupTask(tebligat: any) {
    // Case bilgisini al
    const caseData = await this.db.case.findUnique({
      where: { id: tebligat.caseId },
      select: { id: true, fileNumber: true, tenantId: true },
    });

    if (!caseData) return;

    await this.db.task.create({
      data: {
        tenantId: caseData.tenantId,
        caseId: caseData.id,
        title: `Tebligat İade - ${tebligat.recipientName}`,
        description: `${caseData.fileNumber} dosyasında ${tebligat.recipientName}'a gönderilen tebligat iade geldi. MERNİS adresi sorgulanarak yeni tebligat çıkarılmalı.`,
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 gün içinde
      },
    });

    this.logger.log(`✅ Tebligat takip task'ı oluşturuldu: ${caseData.fileNumber}`);
  }

  /**
   * Her gün saat 08:00'da çalışırdı; vade hatırlatma bildirimleri gönderirdi.
   *
   * F2 (DEVRE DIŞI — ölü yol kaldırıldı): Staff in-app bildirim altyapısı YOK.
   * `Notification` Prisma modeli yok (canlı doğrulandı: `prisma.notification === undefined`);
   * userId'ye in-app feed API'si yok; web "bell" tüketicisi yok. Eski gövde
   * `this.db.notification.findFirst/create` çağırıyordu — bu delege RUNTIME'da `undefined`
   * olduğundan cron HER sabah ilk `due`'da TypeError fırlatıp generic "Vade hatırlatma hatası"
   * logluyor, HİÇBİR hatırlatma göndermiyordu (feature çalışıyor görünüp ölüydü).
   *
   * Karar (F2/Option C): olmayan feature'ı bug gibi yamamak yerine ölü yolu kaldır + cron'u
   * devre dışı bırak. Staff in-app vade hatırlatması istenirse AYRI ürün kararı + feature
   * (Notification modeli + API feed + web bell) olarak tasarlanır; o zaman cron yeniden
   * etkinleştirilir. Veri ön-koşulu (`Case.sorumluPersonelId` doluluğu) F1 (#241) ile sağlandı.
   */
  // @Cron(CronExpression.EVERY_DAY_AT_8AM) // DEVRE DIŞI — F2: in-app bildirim altyapısı yok (model/API/UI)
  async sendDueReminders() {
    // Cron devre dışı → normalde çağrılmaz. Elle/yanlışlıkla çağrılırsa sessiz no-op yerine
    // AÇIKÇA logla (ölü yol görünür olsun); gerçek teslim YOK.
    this.logger.warn(
      '[scheduler] sendDueReminders DEVRE DIŞI (F2): in-app bildirim altyapısı yok; vade hatırlatması gönderilmiyor.',
    );
  }

  /**
   * Her gün gece 02:00'de çalışır
   * Faiz tutarlarını günceller
   * 
   * @deprecated Bu cron job devre dışı bırakıldı.
   * Faiz hesaplaması interest-engine üzerinden yapılmalıdır.
   * 
   * Doğru yaklaşım:
   * 1. interest-engine.calculate() çağrısı yapılır
   * 2. Sonuç DB'ye projection olarak yazılır
   * 3. UI/API bu projection'ı okur
   * 
   * Bu job aktif edilecekse interest-engine entegrasyonu yapılmalı.
   * @see ARCHITECTURE.md - Source of Truth Matrix
   * @see interest-engine/interest-engine.service.ts
   */
  // @Cron('0 2 * * *') // DEVRE DIŞI - interest-engine kullanılmalı
  async updateInterestAmounts() {
    this.logger.warn('⚠️ updateInterestAmounts() DEPRECATED - interest-engine kullanın');
    
    // Bu metod artık hesaplama yapmıyor.
    // Faiz hesabı için interest-engine.calculate() kullanılmalı.
    // 
    // Eski kod referans için yorum olarak bırakıldı:
    // const newInterest = (principal * rate * days) / (365 * 100)
    // Bu formül interest-engine/segments/interest-formula.ts'de tek kaynak olarak yaşıyor.
    
    this.logger.log('ℹ️ Faiz güncellemesi için interest-engine projection job\'ı implemente edilmeli');
    return { message: 'DEPRECATED - Use interest-engine', updatedCount: 0 };
  }
}
