import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { runBatched } from './scheduler-batch.helper';
import { SchedulerMetricsService } from './scheduler-metrics.service';
import { TebligatService } from '../tebligat/tebligat.service'; // PR-S2: tebligat sonuç senkronu ortak kapı
import { DueType } from '@prisma/client';
import { IntegrationErrorReporter } from '../error-log/integration-error-reporter'; // PR-3
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service'; // P1-I13 (R02-B): NO-NEW-WORK-FOR-PASSIVE
import { SCHEDULER_TIMEZONE } from '../../common/scheduler-timezone';
// C15 PR-4A: cross-tenant taramalar QUERY-LEVEL olarak ACTIVE tenant'a daraltılır;
// "önce hepsini çek sonra ele" YAPILMAZ. Yalnız SEÇİM engellenir — backfill/catch-up
// SAĞLANMAZ (nafaka/89-ihbarname/e-tebligat şerhi PR-4A kapsam beyanındadır).
import { ACTIVE_TENANT_WHERE } from '../tenant/tenant-lifecycle';
import { runWithOverlapGuard, type OverlapGuardResult } from '../../common/scheduler-overlap-guard';
// F02: manuel tetik yetkisi — OWN-13 I02-R3 ile RATIFIYE elevated esigi (isApproverEligible).
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import {
  decideManualSchedulerRun,
  type ManualSchedulerOperation,
  type SchedulerActor,
} from './scheduler-manual-run-policy';

/**
 * F02 — calisma kapsami.
 *  - `undefined`  : GLOBAL (yalniz cron giris noktalari; tum ACTIVE tenant'lar). HTTP bunu SECEMEZ.
 *  - `{ tenantId }`: aktorun tenant'ina daraltilmis manuel calisma.
 */
export type SchedulerScope = { readonly tenantId: string } | undefined;

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
    private readonly errorReporter: IntegrationErrorReporter, // PR-3: cron hataları → ErrorLog (source=CRON)
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService, // P1-I13 (R02-B)
    private readonly officeApproval: OfficeApprovalService, // F02: manuel tetik elevated esigi
  ) {}

  /**
   * F02: manuel calismada secim `where`'ine YALNIZ `tenantId` daraltmasini ekler; GLOBAL
   * kapsamda bos nesne doner. ACTIVE tenant filtresi (`tenant: ACTIVE_TENANT_WHERE`) bilerek
   * call-site'ta LITERAL kalir: C15 PR-4A statik AST kapisi
   * (tenant-lifecycle-cron-predicate.static-guard.spec.ts) bu tanimlayiciyi sorgu cagrisinin
   * alt agacinda arar; helper icine tasinsaydi kalicilik kaniti kaybolurdu.
   * Alt yazimlar (case.update / due.create / decisionLog / caseLifecycle) secilen case'e
   * bagli oldugundan secimin daraltilmasi tum yazimlari ayni tenant sinirinda tutar.
   */
  private manualTenantScope(scope: SchedulerScope): { tenantId?: string } {
    return scope ? { tenantId: scope.tenantId } : {};
  }

  /** PR-3: cron hatasını ErrorLog'a düşür (source=CRON). fire-and-forget + swallow → davranış DEĞİŞMEZ. */
  private reportCronError(operation: string, error: unknown): void {
    void this.errorReporter.report({ source: 'CRON', operation: `scheduler.${operation}`, error });
  }

  // W3-F07: eski per-metod isRunning_* boolean alanları canonical runWithOverlapGuard
  // (common/scheduler-overlap-guard.ts) ile DEĞİŞTİRİLDİ — process-genelinde paylaşılan
  // jobId anahtarlı Set, ayrı ayrı alan bakımı gerektirmez.
  // isRunning_retryFailedUyapRequests zaten kaldırılmıştı — retryFailedUyapRequests
  // UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 ile devre dışı (ölü yol, cron yok).
  // isRunning_sendDueReminders zaten kaldırılmıştı — sendDueReminders F2'de devre dışı (ölü yol).

  /**
   * Her gün saat 09:00'da çalışır
   * Ödeme emri süresi dolan dosyaları kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'SchedulerService.checkPaymentOrderDeadlines', timeZone: SCHEDULER_TIMEZONE })
  async checkPaymentOrderDeadlines(scope?: SchedulerScope): Promise<OverlapGuardResult> {
    const guardResult = await runWithOverlapGuard('SchedulerService.checkPaymentOrderDeadlines', async () => {
      this.logger.log('⏰ Ödeme emri süre kontrolü başladı...');

      try {
        const result = await runBatched(
          (args) =>
            this.db.case.findMany({
              where: {
                tenant: ACTIVE_TENANT_WHERE,
                ...this.manualTenantScope(scope),
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
        this.reportCronError('checkPaymentOrderDeadlines', error);
      }
    }, { onBusy: 'WAIT' }); // F02: manuel/global cakismasinda ATLAMA yerine SIRALA — is kaybi yok, paralellik yok
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] checkPaymentOrderDeadlines already running, skipping');
    }
    return guardResult;
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
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - SchedulerController.checkNafaka() → POST /scheduler/check/nafaka (manuel nafaka dönem kontrolü)
  /// - SchedulerService.processNafakaPeriods() → @Cron('0 8 1 * *') (aylık otomatik nafaka dönem kontrolü)
  /// </remarks>
  @Cron('0 8 1 * *', { name: 'SchedulerService.processNafakaPeriods', timeZone: SCHEDULER_TIMEZONE }) // Her ayın 1'i saat 08:00
  async processNafakaPeriods(scope?: SchedulerScope): Promise<OverlapGuardResult> {
    const guardResult = await runWithOverlapGuard('SchedulerService.processNafakaPeriods', async () => {
      this.logger.log('⏰ Nafaka dönem kontrolü başladı...');

      try {
        const currentMonth = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

        const result = await runBatched(
          (args) =>
            this.db.case.findMany({
              where: {
                tenant: ACTIVE_TENANT_WHERE,
                ...this.manualTenantScope(scope),
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
        this.reportCronError('processNafakaPeriods', error);
      }
    }, { onBusy: 'WAIT' }); // F02: manuel/global cakismasinda ATLAMA yerine SIRALA — is kaybi yok, paralellik yok
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] processNafakaPeriods already running, skipping');
    }
    return guardResult;
  }

  /**
   * Nafaka dosyasına yeni dönem ekle
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - SchedulerService.processNafakaPeriods() → aylık nafaka dosyaları için dönem borcu üretimi
  /// </remarks>
  private async addNafakaPeriod(caseData: any, period: string) {
    const description = `${period} Nafaka`;
    const existingPeriodDue = caseData.dues?.find((d: any) => d.description === description);
    if (existingPeriodDue) {
      this.logger.log(
        `⏭️ ${caseData.fileNumber} - ${period} nafaka zaten mevcut: ${existingPeriodDue.type}`,
      );
      return;
    }

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
        type: DueType.NAFAKA,
        description,
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
  @Cron(CronExpression.EVERY_DAY_AT_10AM, { name: 'SchedulerService.checkMtsReturns', timeZone: SCHEDULER_TIMEZONE })
  async checkMtsReturns(scope?: SchedulerScope): Promise<OverlapGuardResult> {
    const guardResult = await runWithOverlapGuard('SchedulerService.checkMtsReturns', async () => {
      this.logger.log('⏰ MTS dönüş kontrolü başladı...');

      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await runBatched(
          (args) =>
            this.db.case.findMany({
              where: {
                tenant: ACTIVE_TENANT_WHERE,
                ...this.manualTenantScope(scope),
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
        this.reportCronError('checkMtsReturns', error);
      }
    }, { onBusy: 'WAIT' }); // F02: manuel/global cakismasinda ATLAMA yerine SIRALA — is kaybi yok, paralellik yok
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] checkMtsReturns already running, skipping');
    }
    return guardResult;
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
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — DEVRE DIŞI (retry ownership containment).
   *
   * ## Bulgu
   *
   * Bu cron `@Cron(EVERY_6_HOURS)` ile CANLIYDI ve şunu yapıyordu: `UyapRequestLog`
   * satırlarını **tenant sınırı olmadan, tüm tenant'lar arasında** tarayıp
   * `status: FAILED → RETRY` + `retryCount++` yazıyordu.
   *
   * Üç ayrı sorun:
   *
   * 1. **DUPLICATE RETRY STATE OWNERSHIP.** `UyapRequestLog.retryCount`/`status`,
   *    `UyapAttempt` lineage'ından (`providerState`/`legalEffectState`, gap-free
   *    `attemptNumber`) tamamen bağımsız İKİNCİ bir retry state machine'iydi. Owner
   *    kuralı (§7): *"UyapAttempt tek retry owner olmalıdır"* ve *"Aynı retry state
   *    UyapOperation, CpeExecutionRecord veya request log'da bağımsız
   *    source-of-truth OLMAMALIDIR."*
   *
   * 2. **DISPATCHER'I OLMAYAN STATE MACHINE.** Gerçek re-dispatch
   *    `UyapService.retryFailedRequests()` içindeydi ve o metot
   *    UYAP-RETRY-CONTAIN-01 ile HARD DISABLE edilmişti (controller fail-closed,
   *    başka çağıran yok). Yani bu cron satırları `RETRY` durumuna alıyor, hiçbir
   *    şey onları dispatch etmiyor ve satır oradan bir daha ÇIKMIYORDU:
   *    `FAILED → RETRY` tek yönlü, tüketicisiz bir yol. Yan etki olarak
   *    `getStats()` sayımları da bozuluyordu (RETRY ne pending ne failed).
   *
   * 3. **TERMINAL-STATE KORUMASI YOK.** Karar yalnız `UyapRequestLog.status`'a
   *    bakılarak veriliyor, `UyapAttempt`'in terminal provider/legal-effect
   *    durumu HİÇ sorulmuyordu (owner §7: *"terminal success tekrar dispatch
   *    edilemez"*).
   *
   * ## Karar (bounded containment)
   *
   * Cron devre dışı bırakıldı; retry state'i artık HİÇBİR yerden yazılmıyor.
   * Canonical retry sahipliği `UyapAttempt`'tedir. Gerçek retry sözleşmesi
   * (attempt lineage üzerinden eligibility + POA/CPE yeniden değerlendirme +
   * tenant-scoped dispatch) ayrı bir retry-contract birimine aittir ve ayrı owner
   * kararı gerektirir — burada İCAT EDİLMEZ.
   *
   * Sessiz no-op değildir: elle/`runAllChecks` ile çağrılırsa açık uyarı loglar.
   */
  async retryFailedUyapRequests() {
    this.logger.warn(
      '[scheduler] retryFailedUyapRequests DEVRE DIŞI (UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02): ' +
        'UyapRequestLog ikinci bir retry state machine idi ve dispatcher\'ı ' +
        'UYAP-RETRY-CONTAIN-01 ile kapatılmıştı. Canonical retry sahibi UyapAttempt\'tir; ' +
        'retry sözleşmesi ayrı owner kararına bağlıdır.',
    );
    return { disabled: true as const, processed: 0 };
  }

  /**
   * Her gün gece yarısı çalışır
   * Günlük istatistikleri hesaplar
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'SchedulerService.calculateDailyStats', timeZone: SCHEDULER_TIMEZONE })
  async calculateDailyStats() {
    const result = await runWithOverlapGuard('SchedulerService.calculateDailyStats', async () => {
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
        this.reportCronError('calculateDailyStats', error);
      }
    });
    if (result === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] SchedulerService.calculateDailyStats already running, skipping');
    }
  }

  /**
   * Her saat başı çalışır
   * Yaklaşan görevleri kontrol eder
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'SchedulerService.checkUpcomingTasks', timeZone: SCHEDULER_TIMEZONE })
  async checkUpcomingTasks(scope?: SchedulerScope): Promise<OverlapGuardResult> {
    const result = await runWithOverlapGuard('SchedulerService.checkUpcomingTasks', async () => {
      this.logger.log('⏰ Yaklaşan görev kontrolü...');

      try {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const upcomingTasks = await this.db.task.count({
          where: {
            tenant: ACTIVE_TENANT_WHERE,
            ...this.manualTenantScope(scope),
            status: 'PENDING',
            dueDate: { lte: tomorrow },
          },
        });

        if (upcomingTasks > 0) {
          this.logger.log(`⚠️ ${upcomingTasks} görev yarına kadar tamamlanmalı`);
        }
      } catch (error) {
        this.logger.error('Görev kontrolü hatası:', error);
        this.reportCronError('checkUpcomingTasks', error);
      }
    }, { onBusy: 'WAIT' }); // F02: manuel/global cakismasinda ATLAMA yerine SIRALA — is kaybi yok, paralellik yok
    if (result === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] SchedulerService.checkUpcomingTasks already running, skipping');
    }
    return result;
  }

  /**
   * Tüm kontrolleri çalıştır. F02: kapsam parametre ile gelir; manuel yol bunu YALNIZ
   * runManual uzerinden, aktorun tenant'iyla cagirir.
   */
  async runAllChecks(scope?: SchedulerScope) {
    this.logger.log(scope ? `🚀 Tüm kontroller manuel tetiklendi (tenant=${scope.tenantId})` : '🚀 Tüm kontroller tetiklendi...');

    const paymentOrders = await this.checkPaymentOrderDeadlines(scope);
    const mts = await this.checkMtsReturns(scope);
    await this.retryFailedUyapRequests();
    const upcomingTasks = await this.checkUpcomingTasks(scope);

    return { message: 'Tüm kontroller tamamlandı', outcomes: { paymentOrders, mts, upcomingTasks } };
  }

  /**
   * F02 — Manuel tetiklemenin TEK giris kapisi. Cagrildigi yerler:
   *  - SchedulerController.runAll / checkPaymentOrders / checkNafaka / checkMts / checkUyapRetry
   *
   * Sozlesme:
   *  1) Yetki HERHANGI bir DB yazimindan ONCE dogrulanir (VIEWER deny; elevated =
   *     OfficeApprovalService.isApproverEligible — PARTNER veya canApproveOfficeActions;
   *     ADMIN tek basina YETMEZ). Ret = 403 + stabil reasonCode, yan etki YOK.
   *  2) Kapsam HER ZAMAN aktorun tenant'idir; HTTP istegi global kapsam SECEMEZ (bu metod
   *     alt metodlara `undefined` gecirmez).
   *  3) isApproverEligible, aktorun aktif ve AYNI tenant'ta oldugunu zaten dogrular.
   */
  async runManual(operation: ManualSchedulerOperation, actor: SchedulerActor) {
    await this.assertCanRunManual(actor);
    const scope: SchedulerScope = { tenantId: actor.tenantId };
    this.logger.log(`[scheduler] manuel tetik: op=${operation} tenant=${actor.tenantId} user=${actor.userId}`);

    switch (operation) {
      case 'run-all':
        return this.runAllChecks(scope);
      case 'payment-orders': {
        const outcome = await this.checkPaymentOrderDeadlines(scope);
        return { message: 'Ödeme emri kontrolü tamamlandı', outcome };
      }
      case 'nafaka': {
        const outcome = await this.processNafakaPeriods(scope);
        return { message: 'Nafaka dönem kontrolü tamamlandı', outcome };
      }
      case 'mts': {
        const outcome = await this.checkMtsReturns(scope);
        return { message: 'MTS kontrolü tamamlandı', outcome };
      }
      case 'uyap-retry':
        // Devre disi yol (UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02); yetki kapisi yine de uygulanir.
        await this.retryFailedUyapRequests();
        return { message: 'UYAP retry kontrolü tamamlandı' };
      default: {
        const never: never = operation;
        throw new ForbiddenException({ reasonCode: 'SCHEDULER_MANUAL_RUN_DENIED_UNKNOWN_OPERATION', operation: never });
      }
    }
  }

  /** F02: I02-R3 ile AYNI predicate — tenant esitligi + elevated esigi; ret 403 + reasonCode. */
  private async assertCanRunManual(actor: SchedulerActor): Promise<void> {
    if (!actor?.tenantId) {
      throw new ForbiddenException({ reasonCode: 'SCHEDULER_MANUAL_RUN_DENIED_NO_ACTOR' });
    }
    const elevatedAuthority = actor.userId
      ? await this.officeApproval.isApproverEligible(actor.userId, actor.tenantId)
      : false;
    const decision = decideManualSchedulerRun({
      userId: actor.userId,
      role: actor.role,
      elevatedAuthority,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({ reasonCode: decision.reasonCode });
    }
  }

  /**
   * Her gün saat 10:00'da çalışır
   * 89 İhbarname sürelerini kontrol eder
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM, { name: 'SchedulerService.checkIhbarnameDeadlines', timeZone: SCHEDULER_TIMEZONE })
  async checkIhbarnameDeadlines() {
    const guardResult = await runWithOverlapGuard('SchedulerService.checkIhbarnameDeadlines', async () => {
      this.logger.log('⏰ 89 İhbarname süre kontrolü başladı...');

      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 89/1 süresi dolan (89/2 gönderilmemiş)
        const result89_1 = await runBatched(
          (args) =>
            this.db.thirdParty.findMany({
              where: {
                // ThirdParty'de tenant İLİŞKİSİ yok (yalnız skaler); yol: caseDebtor.case.tenant
                caseDebtor: { case: { tenant: ACTIVE_TENANT_WHERE } },
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
                caseDebtor: { case: { tenant: ACTIVE_TENANT_WHERE } },
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
        this.reportCronError('checkIhbarnameDeadlines', error);
      }
    });
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] checkIhbarnameDeadlines already running, skipping');
    }
  }

  /**
   * İhbarname hatırlatma task'ı oluştur
   */
  private async createIhbarnameReminderTask(thirdParty: any, nextIhbarname: string) {
    const caseData = thirdParty.caseDebtor?.case;
    if (!caseData) return;

    // P1-I13 (R02-B, owner "NO-NEW-WORK-FOR-PASSIVE"): passive CaseDebtor için yeni
    // hatırlatma task'ı üretilmez — canlı guard kontrolü (ACT-08 boolean, throw etmeyen;
    // AddressTaskSchedulerService'in zaten kullandığı desenle birebir), diğer kayıtların
    // işlenmesini durdurmadan sessizce atlar. Mevcut task'lara veya geçmiş kayıtlara dokunmaz.
    const isPassive = await this.caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor(
      caseData.tenantId,
      caseData.id,
      thirdParty.caseDebtor.debtorId,
    );
    if (isPassive) {
      this.logger.log(`Skipping ihbarname reminder for passive case debtor: ${caseData.fileNumber}`);
      return;
    }

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
        // G4a (A5 reversal): otomatik görev ATANMAMIŞ doğar (Dosya Sorumlusu DOER değil; assignee=doer sonradan manuel atanır).
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
  @Cron(CronExpression.EVERY_DAY_AT_11AM, { name: 'SchedulerService.checkExternalCaseFollowups', timeZone: SCHEDULER_TIMEZONE })
  async checkExternalCaseFollowups() {
    const guardResult = await runWithOverlapGuard('SchedulerService.checkExternalCaseFollowups', async () => {
      this.logger.log('⏰ Alacak haczi takip kontrolü başladı...');

      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await runBatched(
          (args) =>
            this.db.externalCase.findMany({
              where: {
                caseDebtor: { case: { tenant: ACTIVE_TENANT_WHERE } },
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
        this.reportCronError('checkExternalCaseFollowups', error);
      }
    });
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] checkExternalCaseFollowups already running, skipping');
    }
  }

  /**
   * Dış dosya takip task'ı oluştur
   */
  private async createExternalCaseFollowupTask(externalCase: any) {
    const caseData = externalCase.caseDebtor?.case;
    if (!caseData) return;

    // P1-I13 (R02-B, owner "NO-NEW-WORK-FOR-PASSIVE"): bkz. createIhbarnameReminderTask
    // üzerindeki aynı yorum — passive CaseDebtor için yeni takip task'ı üretilmez.
    const isPassive = await this.caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor(
      caseData.tenantId,
      caseData.id,
      externalCase.caseDebtor.debtorId,
    );
    if (isPassive) {
      this.logger.log(`Skipping external case followup for passive case debtor: ${caseData.fileNumber}`);
      return;
    }

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
        // G4a (A5 reversal): otomatik görev ATANMAMIŞ doğar (Dosya Sorumlusu DOER değil; assignee=doer sonradan manuel atanır).
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
  @Cron('0 */4 * * *', { name: 'SchedulerService.checkTebligatStatus', timeZone: SCHEDULER_TIMEZONE }) // Her 4 saatte bir
  async checkTebligatStatus() {
    const result = await runWithOverlapGuard('SchedulerService.checkTebligatStatus', async () => {
      this.logger.log('⏰ Tebligat durum kontrolü başladı...');

      try {
        // 1) PTT (fiziksel) barkod sorgu
        const pttResult = await runBatched(
          (args) =>
            this.db.tebligat.findMany({
              where: {
                case: { tenant: ACTIVE_TENANT_WHERE },
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
                case: { tenant: ACTIVE_TENANT_WHERE },
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
        this.reportCronError('checkTebligatStatus', error);
      }
    });
    if (result === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] checkTebligatStatus already running, skipping');
    }
  }

  /**
   * PTT barkod sorgulama.
   * NOT_INTEGRATED (P0 güvenlik/hukuki-doğruluk düzeltmesi): gerçek PTT API entegrasyonu
   * henüz yok. Daha önce burada Math.random() ile üretilen sahte TESLIM_EDILDI/IADE_GELDI
   * sonucu, TebligatService.recordPttResult ortak kapısı üzerinden CaseDebtor.serviceStatus'a
   * kadar akıyordu (uydurma tebliğ tarihi → yanlış itiraz süresi/kesinleşme riski). Gerçek
   * entegrasyon gelene kadar durum değiştirilmez; case-seviyesi takip görevi de üretilmez.
   */
  private async queryPttBarcode(tebligat: any) {
    this.logger.warn(
      `PTT barkod sorgu entegrasyonu aktif değil, tebligat ${tebligat.barcodeNo} için durum güncellenmedi (NOT_INTEGRATED)`,
    );
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
