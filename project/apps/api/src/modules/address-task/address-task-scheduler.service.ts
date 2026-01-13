import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AddressTaskService } from './address-task.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressTaskFailureReason } from '@prisma/client';

/**
 * Address Task Scheduler Service
 * 
 * Cron job'lar:
 * - SLA Checker: Her saat çalışır, overdue task'ları işler
 * - Annual Refresh Checker: Günlük çalışır, yıllık adres taleplerini işler
 * - Outbox Publisher: Her 5 dakikada çalışır, pending event'leri yayınlar
 */
@Injectable()
export class AddressTaskSchedulerService {
  private readonly logger = new Logger(AddressTaskSchedulerService.name);

  constructor(
    private readonly addressTaskService: AddressTaskService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * SLA Checker - Her saat çalışır
   * Süresi geçmiş görevleri bulur ve hatırlatma gönderir
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks(): Promise<void> {
    this.logger.log('SLA Checker başlatıldı...');

    try {
      // Süresi geçmiş görevleri bul
      const overdueTasks = await this.addressTaskService.findOverdueTasks();
      this.logger.log(`${overdueTasks.length} adet süresi geçmiş görev bulundu`);

      for (const task of overdueTasks) {
        try {
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
    }
  }

  /**
   * Annual Refresh Checker - Her gün gece yarısı çalışır
   * Yıllık adres taleplerini işler
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
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
    }
  }

  /**
   * Outbox Publisher - Her 5 dakikada çalışır
   * Pending event'leri yayınlar (event-driven mimari için)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
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
