/**
 * v28 Timeline Service
 * 
 * Dosya bazlı olay kaydı sistemi.
 * Python v28_decision_timeline/db/schema.sql'den port edildi.
 * 
 * Entry Types:
 * - UYAP_EVENT: UYAP'tan gelen ham event
 * - FACT_WRITE: Fact/flag yazma işlemi
 * - COMPUTE: Hesaplama sonucu (risk, recovery)
 * - DECISION: Karar eşleşmesi
 * - ACTION: Outbox'a eklenen action
 * - OUTCOME: Sonuç (başarı/hata)
 * - NOTE: Manuel not
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AggregateVersionAllocator } from '../domain-event-ingest';

export type TimelineEntryType = 
  | 'UYAP_EVENT' 
  | 'FACT_WRITE' 
  | 'COMPUTE' 
  | 'DECISION' 
  | 'ACTION' 
  | 'OUTCOME' 
  | 'NOTE';

export type TimelineSeverity = 'info' | 'warn' | 'critical';
export type TimelineSource = 'uyap' | 'engine' | 'user' | 'system';

export interface AddTimelineParams {
  caseId: string;
  /**
   * spec-15 §1: explicit tenant — ZORUNLU (fail-closed). Çağıran boundary'ler tenantId'yi
   * resolveTenantIdOrThrow ile garanti eder (Phase 2 PR1). Geçici caseId→tenant bridge KALDIRILDI (PR2).
   */
  tenantId: string;
  type: TimelineEntryType;
  title: string;
  severity?: TimelineSeverity;
  body?: Record<string, any>;
  runId?: string;
  source?: TimelineSource;
}

// OpenAPI spec uyumlu response format
export interface TimelineEntryResponse {
  entry_id: string;
  case_id: string;
  ts: string;
  type: TimelineEntryType;
  severity: TimelineSeverity;
  title: string;
  body: Record<string, any> | null;
  run_id: string | null;
  source: TimelineSource;
}

export interface TimelinePageResponse {
  next_cursor: string | null;
  items: TimelineEntryResponse[];
}

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  // Default-param: mevcut DI/instantiation kırılmaz; allocator canonical yazıcı ile TEK kaynak.
  constructor(
    private readonly prisma: PrismaService,
    private readonly versionAllocator: AggregateVersionAllocator = new AggregateVersionAllocator(),
  ) {}

  /**
   * Timeline'a yeni entry ekler
   */
  async addEntry(params: AddTimelineParams): Promise<string> {
    // FAIL-CLOSED (Phase 2 PR2, spec-15 §10 "tenant explicit at write time"):
    // tenantId ZORUNLU. Yoksa NULL yazmak yerine throw. Eski caseId→case.tenantId per-insert
    // bridge KALDIRILDI; tenant çözümü çağıran boundary'lerin sorumluluğu (resolveTenantIdOrThrow).
    if (!params.tenantId) {
      throw new Error(
        `timeline_tenant_required: addEntry tenantId olmadan çağrıldı (caseId=${params.caseId}, type=${params.type})`,
      );
    }
    const tenantId = params.tenantId;

    // aggregateVersion ataması + INSERT atomik olmalı → kendi transaction'ı içinde.
    // Canonical yazıcı (DomainEventIngest) ile AYNI AggregateVersionAllocator: advisory-lock
    // serileştirme + max+1. Sprint 1'den beri aggregateVersion NOT NULL (default yok) olduğu için
    // bu atama olmadan v28 addEntry runtime'da patlardı; allocator ile gap-free trigger uyumlu.
    const entry = await this.prisma.$transaction(async (tx) => {
      const aggregateVersion = await this.versionAllocator.next(tx, params.caseId);
      return (tx as any).icrabotTimelineEntry.create({
        data: {
          caseId: params.caseId,
          tenantId,
          type: params.type,
          title: params.title,
          severity: params.severity || 'info',
          body: params.body || {},
          runId: params.runId,
          source: params.source || 'system',
          aggregateVersion,
        },
      });
    });

    this.logger.debug(`Timeline entry: ${params.type} - ${params.title} (caseId=${params.caseId})`);
    return entry.id;
  }

  /**
   * Dosya için timeline entry'lerini döner (cursor-based pagination)
   * OpenAPI spec: GET /cases/{case_id}/timeline
   */
  async getTimelinePaged(
    caseId: string,
    options?: {
      type?: TimelineEntryType;
      severity?: TimelineSeverity;
      source?: TimelineSource;
      cursor?: string;
      limit?: number;
    },
  ): Promise<TimelinePageResponse> {
    const limit = Math.min(options?.limit || 50, 200);
    const where: any = { caseId };
    
    if (options?.type) where.type = options.type;
    if (options?.severity) where.severity = options.severity;
    if (options?.source) where.source = options.source;

    // Cursor decode: base64(id:timestamp)
    if (options?.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, 'base64').toString('utf-8');
        const [cursorId, cursorTs] = decoded.split(':');
        where.OR = [
          { createdAt: { lt: new Date(cursorTs) } },
          { createdAt: new Date(cursorTs), id: { lt: cursorId } },
        ];
      } catch {
        // Invalid cursor, ignore
      }
    }

    const entries = await (this.prisma as any).icrabotTimelineEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // Fetch one extra to check if there's more
    });

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorData = `${lastItem.id}:${lastItem.createdAt.toISOString()}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return {
      next_cursor: nextCursor,
      items: items.map((e: any) => this.toApiFormat(e)),
    };
  }

  /**
   * Dosya için timeline entry'lerini döner (legacy offset-based)
   */
  async getTimeline(
    caseId: string,
    options?: {
      type?: TimelineEntryType;
      severity?: TimelineSeverity;
      source?: TimelineSource;
      limit?: number;
      offset?: number;
    },
  ): Promise<any[]> {
    const where: any = { caseId };
    if (options?.type) where.type = options.type;
    if (options?.severity) where.severity = options.severity;
    if (options?.source) where.source = options.source;

    return (this.prisma as any).icrabotTimelineEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
      include: {
        run: {
          select: {
            id: true,
            ruleId: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Tek bir timeline entry döner
   */
  async getEntry(entryId: string): Promise<TimelineEntryResponse | null> {
    const entry = await (this.prisma as any).icrabotTimelineEntry.findUnique({
      where: { id: entryId },
    });
    return entry ? this.toApiFormat(entry) : null;
  }

  /**
   * DB formatından API formatına dönüştürür (snake_case)
   */
  private toApiFormat(entry: any): TimelineEntryResponse {
    return {
      entry_id: entry.id,
      case_id: entry.caseId,
      ts: entry.createdAt.toISOString(),
      type: entry.type,
      severity: entry.severity,
      title: entry.title,
      body: entry.body && Object.keys(entry.body).length > 0 ? entry.body : null,
      run_id: entry.runId || null,
      source: entry.source,
    };
  }

  /**
   * Belirli bir run'a ait timeline entry'lerini döner
   */
  async getTimelineByRun(runId: string): Promise<any[]> {
    return (this.prisma as any).icrabotTimelineEntry.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Timeline istatistiklerini döner
   */
  async getStats(caseId: string): Promise<Record<string, number>> {
    const entries = await (this.prisma as any).icrabotTimelineEntry.groupBy({
      by: ['type'],
      where: { caseId },
      _count: true,
    });

    return Object.fromEntries(
      entries.map((e: any) => [e.type, e._count]),
    );
  }

  /**
   * Son N gündeki timeline özeti
   */
  async getRecentSummary(
    caseId: string,
    days = 7,
  ): Promise<{
    totalEntries: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    lastActivity: Date | null;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const entries = await (this.prisma as any).icrabotTimelineEntry.findMany({
      where: {
        caseId,
        createdAt: { gte: since },
      },
      select: {
        type: true,
        severity: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      byType,
      bySeverity,
      lastActivity: entries[0]?.createdAt || null,
    };
  }
}
