import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  readErrorLogRetentionConfig,
  INTERNAL_SOURCES,
  type ErrorLogRetentionConfig,
} from './error-log-retention.config';

// PR-6: Hata logu retention temizliği (config-tabanlı, hard delete, batch).
// MODEL A (K1): çözüm-durumu birincil, kaynak ikincil. unresolved kayıtlar yalnız
// UNRESOLVED_DAYS ile yönetilir (kaynak ne olursa olsun erken silinmez). resolved kayıtlar
// kaynağa göre (FRONTEND/API_INTERNAL/fallback). 4 kategori KARŞILIKLI DIŞLAYAN → çift-silme yok.
// K2 tarih: unresolved→lastSeenAt||createdAt, resolved→resolvedAt||createdAt.
// K3: enabled değilse NO-OP (spam log yok). K6: hard delete, arşiv yok.
@Injectable()
export class ErrorLogRetentionService {
  private readonly logger = new Logger(ErrorLogRetentionService.name);
  // Sonsuz-döngü koruması (batch loop üst sınırı).
  private static readonly MAX_BATCH_ITERATIONS = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  // Günlük 03:30 Europe/Istanbul. Yalnız config.enabled ise siler.
  @Cron('30 3 * * *', { name: 'errorLogRetention', timeZone: 'Europe/Istanbul' })
  async handleCron(): Promise<void> {
    await this.runRetentionCleanup();
  }

  /**
   * Retention temizliğini çalıştırır. Testler bu metodu çağırır.
   * Hata YUTULUR (app düşmez). enabled=false → prisma'ya HİÇ dokunmaz, sessiz no-op.
   */
  async runRetentionCleanup(): Promise<{
    enabled: boolean;
    deleted: number;
    byCategory: Record<string, number>;
  }> {
    const config = readErrorLogRetentionConfig();

    if (!config.enabled) {
      // K3: disabled → no-op, spam log YOK.
      return { enabled: false, deleted: 0, byCategory: {} };
    }

    this.logger.log('Hata logu retention temizliği başladı.');
    const byCategory: Record<string, number> = {
      unresolved: 0,
      resolvedFrontend: 0,
      resolvedApiInternal: 0,
      resolvedFallback: 0,
    };

    try {
      // 1) unresolved → UNRESOLVED_DAYS (floor 7, config'te uygulanmış). Kaynak filtresi YOK.
      byCategory.unresolved = await this.deleteUnresolved(config);

      // 2) resolved + FRONTEND → FRONTEND_DAYS
      byCategory.resolvedFrontend = await this.deleteResolved(config.frontendDays, config.batchSize, {
        source: 'FRONTEND',
      });

      // 3) resolved + {API,UYAP,CRON} → API_INTERNAL_DAYS
      byCategory.resolvedApiInternal = await this.deleteResolved(config.apiInternalDays, config.batchSize, {
        source: { in: [...INTERNAL_SOURCES] },
      });

      // 4) resolved + diğer (fallback) → RESOLVED_DAYS
      byCategory.resolvedFallback = await this.deleteResolved(config.resolvedDays, config.batchSize, {
        source: { notIn: ['FRONTEND', ...INTERNAL_SOURCES] },
      });

      const deleted = Object.values(byCategory).reduce((a, b) => a + b, 0);
      this.logger.log(`Hata logu retention tamamlandı. Silinen=${deleted} ${JSON.stringify(byCategory)}`);
      return { enabled: true, deleted, byCategory };
    } catch (e) {
      // Retention ASLA app'i düşürmez: logla + yut.
      this.logger.error('Hata logu retention temizliği başarısız', e as any);
      const deleted = Object.values(byCategory).reduce((a, b) => a + b, 0);
      return { enabled: true, deleted, byCategory };
    }
  }

  /** unresolved: yaş = lastSeenAt (yoksa createdAt) < cutoff(UNRESOLVED_DAYS). */
  private async deleteUnresolved(config: ErrorLogRetentionConfig): Promise<number> {
    const cutoff = this.cutoffDate(config.unresolvedDays);
    const where = {
      isResolved: false,
      OR: [
        { lastSeenAt: { lt: cutoff } },
        { lastSeenAt: null, createdAt: { lt: cutoff } },
      ],
    };
    return this.deleteInBatches(where, 'lastSeenAt', config.batchSize);
  }

  /** resolved (kaynak filtreli): yaş = resolvedAt (yoksa createdAt) < cutoff(days). */
  private async deleteResolved(days: number, batchSize: number, sourceFilter: object): Promise<number> {
    const cutoff = this.cutoffDate(days);
    const where = {
      isResolved: true,
      ...sourceFilter,
      OR: [
        { resolvedAt: { lt: cutoff } },
        { resolvedAt: null, createdAt: { lt: cutoff } },
      ],
    };
    return this.deleteInBatches(where, 'resolvedAt', batchSize);
  }

  /** Tek devasa deleteMany YOK: id listesi → deleteMany {id in}, sınırlı loop. */
  private async deleteInBatches(where: object, orderByField: string, batchSize: number): Promise<number> {
    let deleted = 0;
    for (let i = 0; i < ErrorLogRetentionService.MAX_BATCH_ITERATIONS; i++) {
      const rows = await this.prisma.errorLog.findMany({
        where,
        select: { id: true },
        take: batchSize,
        orderBy: { [orderByField]: 'asc' },
      });
      if (rows.length === 0) break;
      const ids = rows.map((r: { id: string }) => r.id);
      const res = await this.prisma.errorLog.deleteMany({ where: { id: { in: ids } } });
      deleted += res.count;
      // Son batch (batchSize'dan az) → bitti.
      if (rows.length < batchSize) break;
    }
    return deleted;
  }

  /** now - days. */
  private cutoffDate(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
}
