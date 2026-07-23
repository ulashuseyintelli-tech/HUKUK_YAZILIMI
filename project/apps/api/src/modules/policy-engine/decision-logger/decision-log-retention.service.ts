/**
 * Decision Log Retention Service
 * 
 * 90 günden eski kayıtları arşivler.
 * KVKK uyumlu: Kayıtlar silinmez, arşiv tablosuna taşınır.
 * 
 * @see Requirements 13.1, 13.2, 13.3, 13.4
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Retention configuration
 */
const RETENTION_CONFIG = {
  /** Kayıtların tutulacağı gün sayısı */
  RETENTION_DAYS: 90,
  
  /** Her batch'te işlenecek kayıt sayısı */
  BATCH_SIZE: 1000,
  
  /** Arşiv tablosu adı */
  ARCHIVE_TABLE: 'CpeDecisionLogArchive',
};

@Injectable()
export class DecisionLogRetentionService {
  private readonly logger = new Logger(DecisionLogRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Her gün gece 03:00'te çalışır.
   * Eski kayıtları arşivler.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveOldRecords(): Promise<void> {
    this.logger.log('Starting decision log retention job...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_CONFIG.RETENTION_DAYS);

    try {
      let totalArchived = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await this.archiveBatch(cutoffDate);
        totalArchived += result.archived;
        hasMore = result.hasMore;

        if (result.archived > 0) {
          this.logger.log(`Archived ${result.archived} records (total: ${totalArchived})`);
        }
      }

      this.logger.log(`Retention job completed. Total archived: ${totalArchived}`);
    } catch (error) {
      this.logger.error('Retention job failed', error);
    }
  }

  /**
   * Bir batch kayıt arşivler.
   */
  private async archiveBatch(cutoffDate: Date): Promise<{ archived: number; hasMore: boolean }> {
    // Find old records - use any cast for Prisma client compatibility
    const prismaAny = this.prisma as any;
    
    // P05C-P02 REFERENTIAL LEGAL HOLD (owner O-A): bir `UyapAttemptCpeDecisionLink` satırı
    // tarafından UYAP hukuki delili olarak tutulan karar retention'dan MUAFTIR. Bu genel bir
    // "CPE kayıtlarını süresiz sakla" kararı DEĞİLDİR — link ortadan kalkarsa kayıt yeniden
    // normal 90 günlük rejime girer. Filtre hem seçimde hem SİLMEDE uygulanır; böylece seçim
    // ile silme arasında oluşabilecek yeni link yarışı da kapanır. Link FK'sindeki
    // ON DELETE RESTRICT yalnız son savunma hattıdır; asıl filtre BURADIR — cron'un bağlı
    // satır yüzünden topluca hata vermesi kabul edilemez.
    const retentionEligibleWhere = {
      createdAt: { lt: cutoffDate },
      uyapAttemptLinks: { none: {} },
    };

    const oldRecords = await prismaAny.cpeDecisionLog.findMany({
      where: retentionEligibleWhere,
      take: RETENTION_CONFIG.BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (oldRecords.length === 0) {
      return { archived: 0, hasMore: false };
    }

    const ids = oldRecords.map((r: { id: string }) => r.id);

    await this.prisma.$transaction(async (tx: any) => {
      this.logger.debug(`Deleting ${ids.length} unlinked records: ${ids.slice(0, 5).join(', ')}...`);

      // Legal-hold filtresi silmede de tekrarlanır (atomik güvence).
      await tx.cpeDecisionLog.deleteMany({
        where: { id: { in: ids }, ...retentionEligibleWhere },
      });
    });

    return {
      archived: oldRecords.length,
      hasMore: oldRecords.length === RETENTION_CONFIG.BATCH_SIZE,
    };
  }

  /**
   * Manuel arşivleme (admin endpoint için).
   */
  async manualArchive(daysOld?: number): Promise<{ archived: number }> {
    const days = daysOld ?? RETENTION_CONFIG.RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let totalArchived = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await this.archiveBatch(cutoffDate);
      totalArchived += result.archived;
      hasMore = result.hasMore;
    }

    return { archived: totalArchived };
  }

  /**
   * Retention istatistikleri.
   */
  async getRetentionStats(): Promise<{
    totalRecords: number;
    oldestRecord: Date | null;
    recordsToArchive: number;
    retentionDays: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_CONFIG.RETENTION_DAYS);

    const prismaAny = this.prisma as any;

    const [totalRecords, oldestRecord, recordsToArchive] = await Promise.all([
      prismaAny.cpeDecisionLog.count(),
      prismaAny.cpeDecisionLog.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prismaAny.cpeDecisionLog.count({
        where: { createdAt: { lt: cutoffDate } },
      }),
    ]);

    return {
      totalRecords,
      oldestRecord: oldestRecord?.createdAt ?? null,
      recordsToArchive,
      retentionDays: RETENTION_CONFIG.RETENTION_DAYS,
    };
  }
}
