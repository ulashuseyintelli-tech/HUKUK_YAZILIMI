/**
 * Decision Log Retention Service
 *
 * ## UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — YIKICI YOL KAPATILDI (containment)
 *
 * Bu servisin kendi dokümante ettiği sözleşme şuydu:
 * *"KVKK uyumlu: Kayıtlar silinmez, arşiv tablosuna taşınır."*
 *
 * Gerçek davranış BUNUN TERSİYDİ: `archiveBatch()` yalnızca `deleteMany` çağırıyordu.
 * Hiçbir arşiv yazımı yoktu; `ARCHIVE_TABLE` sabiti hiç kullanılmıyordu ve
 * `CpeDecisionLogArchive` modeli **ne şemada ne de migration'larda mevcuttu**. Servis
 * `PolicyEngineModule` provider'ı olarak kayıtlı olduğundan `@Cron(EVERY_DAY_AT_3AM)`
 * CANLIYDI: 90 günden eski her CPE karar delili (referential legal-hold ile bağlı
 * olanlar hariç) her gece KALICI OLARAK SİLİNİYOR, sonuç ise `archived` diye
 * raporlanıyordu.
 *
 * Owner kuralı (§12): *"legal evidence normal application delete ile yok edilemez"* ve
 * *"Kritik destructive path varsa bounded containment patch uygula; detaylı contract
 * ARCH-4'e bırakılabilir."*
 *
 * Bu nedenle silme KALDIRILDI. Servis artık YALNIZ ÖLÇER ve raporlar; hiçbir CPE karar
 * kaydını silmez veya değiştirmez. Gerçek arşiv/retention sözleşmesi (arşiv modeli,
 * saklama süresi, KVKK minimizasyonu, legal-hold matrisi) ARCH-4'e aittir ve ayrı owner
 * kararı gerektirir — burada İCAT EDİLMEZ.
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
  /** Kayıtların "retention adayı" sayılacağı gün sayısı (ÖLÇÜM eşiği — silme eşiği DEĞİL). */
  RETENTION_DAYS: 90,
};

/**
 * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: yıkıcı retention yolu kapalıdır.
 * Bu sabit bir "feature flag" DEĞİLDİR — env ile açılamaz; yeniden etkinleştirme
 * gerçek bir arşiv sözleşmesi (ARCH-4) ve ayrı owner kararı gerektirir.
 */
export const CPE_DECISION_LOG_DESTRUCTIVE_RETENTION_DISABLED = true;

export interface RetentionSweepResult {
  /** Retention penceresine düşen ve legal-hold ile BAĞLI OLMAYAN kayıt sayısı. */
  eligibleCandidates: number;
  /** Bu koşuda silinen kayıt sayısı. Containment gereği HER ZAMAN 0. */
  deleted: 0;
  /** Yıkıcı yolun kapalı olduğunu makine tarafından okunabilir biçimde bildirir. */
  destructiveDisabled: true;
}

@Injectable()
export class DecisionLogRetentionService {
  private readonly logger = new Logger(DecisionLogRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Her gün gece 03:00'te çalışır.
   *
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: ARTIK HİÇBİR KAYIT SİLMEZ. Yalnızca retention
   * penceresine düşen aday sayısını ölçer ve raporlar (gözlemlenebilirlik korunur).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveOldRecords(): Promise<void> {
    this.logger.log('Starting decision log retention sweep (READ-ONLY)...');

    try {
      const result = await this.sweep();
      this.logger.log(
        `Retention sweep completed. Candidates: ${result.eligibleCandidates}, deleted: 0 ` +
          '(destructive retention disabled — ARCH-4 arşiv sözleşmesi bekleniyor).',
      );
    } catch (error) {
      this.logger.error('Retention sweep failed', error);
    }
  }

  /**
   * Retention penceresine düşen adayları SAYAR. Yazma/silme YOK.
   *
   * Legal-hold: bir `UyapAttemptCpeDecisionLink` satırı tarafından UYAP hukuki delili
   * olarak tutulan karar retention adayı SAYILMAZ (owner O-A, P05C-P02).
   */
  async sweep(): Promise<RetentionSweepResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_CONFIG.RETENTION_DAYS);

    const prismaAny = this.prisma as any;
    const eligibleCandidates = await prismaAny.cpeDecisionLog.count({
      where: {
        createdAt: { lt: cutoffDate },
        uyapAttemptLinks: { none: {} },
      },
    });

    return { eligibleCandidates, deleted: 0, destructiveDisabled: true };
  }

  /**
   * Manuel arşivleme (admin yolu) — CONTAINMENT NEDENİYLE DEVRE DIŞI.
   *
   * Sessiz no-op DEĞİL: çağıran, işlemin yapılmadığını açık bir hatayla öğrenir.
   * "Arşivledim" diyen ama silen bir yol yeniden üretilmez.
   */
  async manualArchive(_daysOld?: number): Promise<never> {
    throw new Error(
      'CPE_DECISION_LOG_RETENTION_DISABLED: CPE karar delili silinemez. ' +
        'Yıkıcı retention yolu UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 ile kapatıldı; ' +
        'gerçek arşiv sözleşmesi ARCH-4 kapsamındadır ve ayrı owner kararı gerektirir.',
    );
  }

  /**
   * Retention istatistikleri. Salt-okunur; davranışı değişmedi.
   */
  async getRetentionStats(): Promise<{
    totalRecords: number;
    oldestRecord: Date | null;
    recordsToArchive: number;
    retentionDays: number;
    destructiveRetentionDisabled: boolean;
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
      destructiveRetentionDisabled: CPE_DECISION_LOG_DESTRUCTIVE_RETENTION_DISABLED,
    };
  }
}
