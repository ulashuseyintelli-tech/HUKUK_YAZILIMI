import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AddressTaskService } from './address-task.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressTaskFailureReason } from '@prisma/client';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { SCHEDULER_TIMEZONE } from '../../common/scheduler-timezone';
import { reportCronJobFailure } from '../../common/cron-failure-reporting';
import { IntegrationErrorReporter } from '../error-log/integration-error-reporter';

/**
 * Address Task Scheduler Service
 *
 * Cron job'lar:
 * - SLA Checker: Her saat çalışır, overdue task'ları işler
 * - Annual Refresh Checker: Günlük çalışır, yıllık adres taleplerini işler
 * - Outbox Publisher: Her 5 dakikada çalışır, pending event'leri yayınlar
 *
 * ACT-08 (defense-in-depth): birincil koruma removeCaseDebtor'ın açık AddressTask'ları iptal
 * etmesidir (pratik pencere dar); bu scheduler'ın kendi createTask() çağrıları da (§ AddressTaskService
 * remarks) enforceCaseDebtorLink bayrağını GEÇİRMEZ (ilişki yapısı/mevcut task'tan kopyalama gereği).
 * Bu iki döngü (checkOverdueTasks/checkAnnualRefreshTasks) artık her task için ayrıca PASSIVE
 * CaseDebtor kontrolü yapar — dar-pencere race'inde (deaktivasyon ile bir sonraki cron tick'i
 * arasında) escalation/annual-refresh task'ının pasif borçlu için oluşmasını/ilerlemesini engeller.
 */
@Injectable()
export class AddressTaskSchedulerService {
  private readonly logger = new Logger(AddressTaskSchedulerService.name);

  constructor(
    private readonly addressTaskService: AddressTaskService,
    private readonly prisma: PrismaService,
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
    private readonly errorReporter: IntegrationErrorReporter,
  ) {}

  /**
   * SLA Checker - Her saat çalışır
   * Süresi geçmiş görevleri bulur ve hatırlatma gönderir
   */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: SCHEDULER_TIMEZONE })
  async checkOverdueTasks(): Promise<void> {
    this.logger.log('SLA Checker başlatıldı...');

    try {
      // Süresi geçmiş görevleri bul
      const overdueTasks = await this.addressTaskService.findOverdueTasks();
      this.logger.log(`${overdueTasks.length} adet süresi geçmiş görev bulundu`);

      for (const task of overdueTasks) {
        try {
          // ACT-08: pasif dosya borçlusu için hatırlatma/escalation ilerletilmez (defense-in-depth)
          if (await this.caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor(task.tenantId, task.caseId, task.debtorId)) {
            this.logger.log(`Görev atlandı (pasif dosya borçlusu): ${task.id}`);
            continue;
          }
          // Hatırlatma gönder ve attempt count artır
          await this.addressTaskService.incrementAttempt(task.id);
          this.logger.log(`Hatırlatma gönderildi: ${task.id}`);
        } catch (error) {
          this.logger.error(`Hatırlatma gönderilemedi: ${task.id}`, error);
        }
      }

      // Maksimum denemeye ulaşmış görevleri bul ve escalate et
      const tasksAtMax = await this.addressTaskService.findTasksAtMaxAttempts();
      this.logger.log(`${tasksAtMax.length} adet maksimum denemeye ulaşmış görev bulundu`);

      for (const task of tasksAtMax) {
        try {
          // ACT-08: pasif dosya borçlusu için escalation task'ı oluşturulmaz (defense-in-depth)
          if (await this.caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor(task.tenantId, task.caseId, task.debtorId)) {
            this.logger.log(`Escalation atlandı (pasif dosya borçlusu): ${task.id}`);
            continue;
          }
          // Manuel görev oluştur (ASSIGN_MANUAL_CALL_CLIENT)
          await this.addressTaskService.createTask({
            tenantId: task.tenantId,
            caseId: task.caseId,
            debtorId: task.debtorId,
            taskType: 'ASSIGN_MANUAL_CALL_CLIENT',
            title: 'Müvekkili telefonla ara - adres bilgisi alınamadı',
            description: `${task.title} görevi için 3 hatırlatma gönderildi ancak yanıt alınamadı. Lütfen müvekkili telefonla arayın.`,
          });

          // Orijinal görevi başarısız olarak işaretle
          await this.addressTaskService.failTask(
            task.id,
            AddressTaskFailureReason.SLA_EXCEEDED,
            'Maksimum hatırlatma sayısına ulaşıldı',
          );

          this.logger.log(`Görev escalate edildi: ${task.id}`);
        } catch (error) {
          this.logger.error(`Görev escalate edilemedi: ${task.id}`, error);
        }
      }

      this.logger.log('SLA Checker tamamlandı');
    } catch (error) {
      this.logger.error('SLA Checker hatası:', error);
      reportCronJobFailure(this.errorReporter, 'addressTask.checkOverdueTasks', error);
    }
  }

  /**
   * Annual Refresh Checker - Her gün gece yarısı çalışır
   * Yıllık adres taleplerini işler
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: SCHEDULER_TIMEZONE })
  async checkAnnualRefreshTasks(): Promise<void> {
    this.logger.log('Annual Refresh Checker başlatıldı...');

    try {
      const now = new Date();

      // nextRunAt <= now olan CLIENT_ANNUAL_ADDRESS_REFRESH görevlerini bul
      const annualTasks = await this.prisma.addressTask.findMany({
        where: {
          taskType: 'CLIENT_ANNUAL_ADDRESS_REFRESH',
          status: 'PENDING',
          nextRunAt: { lte: now },
        },
      });

      this.logger.log(`${annualTasks.length} adet yıllık adres talebi görevi bulundu`);

      for (const task of annualTasks) {
        try {
          // ACT-08: pasif dosya borçlusu için yıllık yenileme ilerletilmez (defense-in-depth)
          if (await this.caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor(task.tenantId, task.caseId, task.debtorId)) {
            this.logger.log(`Yıllık yenileme atlandı (pasif dosya borçlusu): ${task.id}`);
            continue;
          }
          // Yeni adres talebi görevi oluştur
          await this.addressTaskService.createTask({
            tenantId: task.tenantId,
            caseId: task.caseId,
            debtorId: task.debtorId,
            taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
            title: 'Yıllık adres güncellemesi talebi',
            description: 'Yıllık adres güncelleme döngüsü kapsamında müvekkilden adres bilgisi talep edilecek',
          });

          // Bir sonraki yıl için nextRunAt güncelle
          const nextYear = new Date(now);
          nextYear.setFullYear(nextYear.getFullYear() + 1);

          await this.prisma.addressTask.update({
            where: { id: task.id },
            data: {
              nextRunAt: nextYear,
              lastRunAt: now,
            },
          });

          this.logger.log(`Yıllık adres talebi oluşturuldu: ${task.id}`);
        } catch (error) {
          this.logger.error(`Yıllık adres talebi oluşturulamadı: ${task.id}`, error);
        }
      }

      this.logger.log('Annual Refresh Checker tamamlandı');
    } catch (error) {
      this.logger.error('Annual Refresh Checker hatası:', error);
      reportCronJobFailure(this.errorReporter, 'addressTask.checkAnnualRefreshTasks', error);
    }
  }

  /**
   * Outbox Publisher - Her 5 dakikada çalışır
   * Pending event'leri yayınlar (event-driven mimari için)
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: SCHEDULER_TIMEZONE })
  async publishOutboxEvents(): Promise<void> {
    this.logger.debug('Outbox Publisher başlatıldı...');

    try {
      // Pending outbox event'lerini bul
      const pendingEvents = await this.prisma.addressOutboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 100, // Batch size
      });

      if (pendingEvents.length === 0) {
        this.logger.debug('İşlenecek outbox event yok');
        return;
      }

      this.logger.log(`${pendingEvents.length} adet outbox event işlenecek`);

      for (const event of pendingEvents) {
        try {
          // Event'i işle (şimdilik sadece log)
          // Gerçek implementasyonda message queue'ya gönderilir
          this.logger.debug(`Event işleniyor: ${event.eventType}`);

          // Event'i processed olarak işaretle
          await this.prisma.addressOutboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
            },
          });
        } catch (error) {
          this.logger.error(`Event işlenemedi: ${event.id}`, error);

          // Attempt count artır
          await this.prisma.addressOutboxEvent.update({
            where: { id: event.id },
            data: {
              attemptCount: { increment: 1 },
              lastError: String(error),
            },
          });
        }
      }

      this.logger.debug('Outbox Publisher tamamlandı');
    } catch (error) {
      this.logger.error('Outbox Publisher hatası:', error);
      reportCronJobFailure(this.errorReporter, 'addressTask.publishOutboxEvents', error);
    }
  }

  /**
   * Manuel tetikleme - SLA kontrolü
   * Test ve debug için kullanılabilir
   */
  async triggerSlaCheck(): Promise<{ overdue: number; escalated: number }> {
    this.logger.log('Manuel SLA kontrolü tetiklendi');
    
    const overdueTasks = await this.addressTaskService.findOverdueTasks();
    const tasksAtMax = await this.addressTaskService.findTasksAtMaxAttempts();

    return {
      overdue: overdueTasks.length,
      escalated: tasksAtMax.length,
    };
  }
}
