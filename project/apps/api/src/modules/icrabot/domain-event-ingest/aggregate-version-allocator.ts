/**
 * AggregateVersionAllocator — IcrabotTimelineEntry.aggregateVersion için TEK kaynak.
 *
 * AMAÇ: Per-case monotonic, gap-free, RACE-SAFE versiyon ataması. Hem canonical yazıcı
 *   (DomainEventIngestService.appendInTransaction) hem v28 yazıcı (TimelineService.addEntry)
 *   bu allocator'ı kullanır → iki ayrı "max+1" mantığı yok (bu borcun kök sebebi tam buydu).
 *
 * NASIL:
 *   1. pg_advisory_xact_lock(hashtextextended(caseId,0)) — aynı caseId'e eşzamanlı append'leri
 *      çağıranın transaction'ı süresince serileştirir; farklı caseId'ler kilitlenmez; lock tx
 *      commit/rollback'te otomatik bırakılır.
 *   2. max(aggregateVersion)+1 (ilk event için 1).
 *   DB tarafı belt+suspenders korur: @@unique([caseId, aggregateVersion]) + gap-free trigger
 *   (enforce_aggregate_version_gap_free). Allocator schema/trigger DEĞİŞTİRMEZ.
 *
 * KONTRAT: Çağıranın AÇIK bir transaction'ı (Prisma.TransactionClient) içinde çağrılmalıdır —
 *   advisory lock ve sonraki INSERT aynı tx'te atomik olmalı (aksi halde lock anında bırakılır
 *   ve race geri döner).
 *
 * Çağrıldığı yerler:
 * - DomainEventIngestService.getNextAggregateVersion() → canonical append (case/collection).
 * - TimelineService.addEntry() → v28 UYAP timeline yazımı (kendi $transaction'ı içinde).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class AggregateVersionAllocator {
  /**
   * Bir case için sıradaki aggregateVersion'ı serileştirilmiş şekilde tahsis eder.
   * MUTLAKA çağıranın transaction'ı içinde çalıştırılmalıdır (bkz. dosya başı KONTRAT).
   */
  async next(tx: Prisma.TransactionClient, caseId: string): Promise<bigint> {
    // Per-aggregate serialization: aynı caseId'e eşzamanlı append'leri bu tx süresince kilitle.
    // hashtextextended(text, seed) → bigint anahtar; tx sonunda otomatik release.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caseId}, 0))`;

    const result = await (tx as any).icrabotTimelineEntry.aggregate({
      where: { caseId },
      _max: { aggregateVersion: true },
    });

    const currentMax: bigint | null = result._max.aggregateVersion;
    return currentMax ? currentMax + BigInt(1) : BigInt(1);
  }
}
