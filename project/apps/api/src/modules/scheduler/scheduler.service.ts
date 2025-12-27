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
   * Her gün saat 10:00'da çalışır
   * 89 İhbarname sürelerini kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async checkIhbarnameDeadlines() {
    this.logger.log('⏰ 89 İhbarname süre kontrolü başladı...');

    try {
      // 7 günlük cevap süresi dolan ihbarnameleri bul
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 89/1 süresi dolan (89/2 gönderilmemiş)
      const expired89_1 = await this.db.thirdParty.findMany({
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
      });

      // 89/2 süresi dolan (89/3 gönderilmemiş)
      const expired89_2 = await this.db.thirdParty.findMany({
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
      });

      this.logger.log(`📋 89/1 süresi dolan: ${expired89_1.length}, 89/2 süresi dolan: ${expired89_2.length}`);

      // Hatırlatma task'ları oluştur
      for (const tp of expired89_1) {
        await this.createIhbarnameReminderTask(tp, '89/2');
      }

      for (const tp of expired89_2) {
        await this.createIhbarnameReminderTask(tp, '89/3');
      }
    } catch (error) {
      this.logger.error('89 İhbarname kontrolü hatası:', error);
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
    this.logger.log('⏰ Alacak haczi takip kontrolü başladı...');

    try {
      // 30 günden fazla HACIZ_KONDU durumunda bekleyen dış dosyalar
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const pendingExternalCases = await this.db.externalCase.findMany({
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
      });

      this.logger.log(`📋 Takip gerektiren dış dosya: ${pendingExternalCases.length}`);

      for (const ec of pendingExternalCases) {
        await this.createExternalCaseFollowupTask(ec);
      }
    } catch (error) {
      this.logger.error('Alacak haczi takip kontrolü hatası:', error);
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
   * PTT barkod sorgulama ile tebligat durumlarını günceller
   */
  @Cron('0 */4 * * *') // Her 4 saatte bir
  async checkTebligatStatus() {
    this.logger.log('⏰ Tebligat durum kontrolü başladı...');

    try {
      // Gönderilmiş ve barkodu olan tebligatları bul
      const pendingTebligat = await this.db.tebligat.findMany({
        where: {
          status: 'GONDERILDI',
          barcodeNo: { not: null },
          channel: 'PTT',
        },
        take: 50, // Her seferde max 50 tebligat
        orderBy: { sentAt: 'asc' }, // En eski gönderilenden başla
      });

      this.logger.log(`📋 ${pendingTebligat.length} tebligat sorgulanacak`);

      for (const tebligat of pendingTebligat) {
        await this.queryPttBarcode(tebligat);
      }
    } catch (error) {
      this.logger.error('Tebligat kontrolü hatası:', error);
    }
  }

  /**
   * PTT barkod sorgulama (mock - gerçek API entegrasyonu için güncellenmeli)
   */
  private async queryPttBarcode(tebligat: any) {
    try {
      // Mock: Gerçek PTT API entegrasyonu burada yapılacak
      // Şimdilik rastgele sonuç üretiyoruz (test için)
      const mockResults = ['TESLIM_EDILDI', 'IADE_GELDI', 'GONDERILDI'];
      const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];

      // Sadece durum değiştiyse güncelle
      if (randomResult !== 'GONDERILDI') {
        const updateData: any = {
          pttResultDate: new Date(),
        };

        if (randomResult === 'TESLIM_EDILDI') {
          updateData.status = 'TESLIM_EDILDI';
          updateData.deliveredAt = new Date();
          updateData.pttResult = 'TESLIM_EDILDI';
          updateData.nextAction = 'TEBLIG_TAMAMLANDI';
        } else if (randomResult === 'IADE_GELDI') {
          updateData.status = 'IADE_GELDI';
          updateData.returnedAt = new Date();
          updateData.pttResult = 'ADRESTE_BULUNAMADI';
          updateData.nextAction = 'MERNIS_TEBLIGAT';
        }

        await this.db.tebligat.update({
          where: { id: tebligat.id },
          data: updateData,
        });

        this.logger.log(`✅ Tebligat güncellendi: ${tebligat.barcodeNo} -> ${randomResult}`);

        // İade geldiyse task oluştur
        if (randomResult === 'IADE_GELDI') {
          await this.createTebligatFollowupTask(tebligat);
        }
      }
    } catch (error) {
      this.logger.error(`Barkod sorgulama hatası (${tebligat.barcodeNo}):`, error);
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
   * Her gün saat 08:00'da çalışır
   * Vade hatırlatma bildirimleri gönderir
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueReminders() {
    this.logger.log('⏰ Vade hatırlatma kontrolü başladı...');

    try {
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);

      // 3 gün içinde vadesi dolacak alacaklar
      const upcomingDues = await this.db.due.findMany({
        where: {
          dueDate: {
            gte: new Date(),
            lte: threeDaysLater,
          },
          isPaid: false,
        },
        include: {
          case: {
            select: {
              id: true,
              fileNumber: true,
              tenantId: true,
              sorumluPersonelId: true,
            },
          },
        },
      });

      this.logger.log(`📋 ${upcomingDues.length} alacak vadesi yaklaşıyor`);

      // Dosya bazında grupla
      const caseMap = new Map<string, any[]>();
      for (const due of upcomingDues) {
        if (!due.case) continue;
        const existing = caseMap.get(due.case.id) || [];
        existing.push(due);
        caseMap.set(due.case.id, existing);
      }

      // Her dosya için bildirim oluştur
      for (const [caseId, dues] of caseMap) {
        const caseData = dues[0].case;
        const totalAmount = dues.reduce((sum, d) => sum + Number(d.amount || 0), 0);

        await this.db.notification.create({
          data: {
            tenantId: caseData.tenantId,
            userId: caseData.sorumluPersonelId,
            type: 'DUE_REMINDER',
            title: 'Vade Hatırlatması',
            message: `${caseData.fileNumber} dosyasında ${dues.length} alacak kaleminin vadesi 3 gün içinde doluyor. Toplam: ${totalAmount.toLocaleString('tr-TR')} TL`,
            data: { caseId, dueCount: dues.length, totalAmount },
            isRead: false,
          },
        });
      }

      this.logger.log(`✅ ${caseMap.size} dosya için vade hatırlatması oluşturuldu`);
    } catch (error) {
      this.logger.error('Vade hatırlatma hatası:', error);
    }
  }

  /**
   * Her gün gece 02:00'de çalışır
   * Faiz tutarlarını günceller
   */
  @Cron('0 2 * * *') // Her gün saat 02:00
  async updateInterestAmounts() {
    this.logger.log('⏰ Faiz güncelleme başladı...');

    try {
      // Aktif dosyaları al
      const activeCases = await this.db.case.findMany({
        where: {
          caseStatus: { in: ['DERDEST', 'ISLEMDE'] },
          interestRate: { gt: 0 },
          interestStartDate: { not: null },
        },
        select: {
          id: true,
          fileNumber: true,
          principalAmount: true,
          interestRate: true,
          interestStartDate: true,
          calculatedInterest: true,
        },
      });

      this.logger.log(`📋 ${activeCases.length} dosya için faiz hesaplanacak`);

      let updatedCount = 0;
      const today = new Date();

      for (const caseData of activeCases) {
        const startDate = new Date(caseData.interestStartDate);
        const days = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (days <= 0) continue;

        const principal = Number(caseData.principalAmount || 0);
        const rate = Number(caseData.interestRate || 0);
        const newInterest = Math.round((principal * rate * days) / (365 * 100) * 100) / 100;

        // Sadece değişiklik varsa güncelle
        const currentInterest = Number(caseData.calculatedInterest || 0);
        if (Math.abs(newInterest - currentInterest) > 0.01) {
          await this.db.case.update({
            where: { id: caseData.id },
            data: { calculatedInterest: newInterest },
          });
          updatedCount++;
        }
      }

      this.logger.log(`✅ ${updatedCount} dosyada faiz güncellendi`);
    } catch (error) {
      this.logger.error('Faiz güncelleme hatası:', error);
    }
  }
}
