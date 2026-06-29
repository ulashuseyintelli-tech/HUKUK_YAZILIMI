import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClientPayoutManualReversalClosureMethod,
  ClientPayoutManualReversalStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListClientPayoutManualReversalsDto } from './dto/list-client-payout-manual-reversals.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MANUAL_REVERSAL_LIST_SELECT = {
  id: true,
  tenantId: true,
  caseId: true,
  caseClientId: true,
  amount: true,
  currency: true,
  status: true,
  closureMethod: true,
  confidence: true,
  sourceActionId: true,
  collectionId: true,
  collectionDispositionId: true,
  collectionDispositionLineId: true,
  clientPayoutId: true,
  clientPayoutAllocationId: true,
  openedAt: true,
  openedById: true,
  closedAt: true,
  closedById: true,
  cancelledAt: true,
  cancelledById: true,
  note: true,
  closureNote: true,
  evidenceRef: true,
  createdAt: true,
  updatedAt: true,
  case: { select: { id: true, fileNumber: true, executionFileNumber: true, caseDate: true } },
  caseClient: {
    select: {
      id: true,
      clientId: true,
      role: true,
      client: {
        select: {
          id: true,
          displayName: true,
          name: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      },
    },
  },
  collection: { select: { id: true, amount: true, currency: true, status: true, date: true, description: true } },
  collectionDisposition: {
    select: {
      id: true,
      totalAmount: true,
      currency: true,
      status: true,
      postedAt: true,
      manualReversalRequiredAt: true,
    },
  },
  collectionDispositionLine: {
    select: { id: true, type: true, amount: true, caseClientId: true, note: true },
  },
  clientPayout: {
    select: { id: true, amount: true, currency: true, status: true, paidAt: true, paidById: true, note: true },
  },
  clientPayoutAllocation: {
    select: { id: true, amount: true, currency: true, allocatedAt: true, allocatedById: true },
  },
} as const;

type ManualReversalRow = Prisma.ClientPayoutManualReversalGetPayload<{
  select: typeof MANUAL_REVERSAL_LIST_SELECT;
}>;

interface AuditSummary {
  count: number;
  latestAction: string | null;
  latestAt: string | null;
  latestUserId: string | null;
}

interface AuditHistoryItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  description: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
}

export interface ClientPayoutManualReversalListItem {
  id: string;
  caseId: string;
  caseClientId: string;
  clientId: string;
  clientName: string | null;
  caseNumber: string;
  executionFileNumber: string | null;
  amount: string;
  currency: string;
  status: string;
  closureMethod: string | null;
  confidence: string;
  sourceActionId: string | null;
  sourceLinkage: {
    collectionId: string | null;
    collectionDispositionId: string | null;
    collectionDispositionLineId: string | null;
    clientPayoutId: string | null;
    clientPayoutAllocationId: string | null;
  };
  openedAt: string;
  openedById: string | null;
  openAgeDays: number;
  closedAt: string | null;
  closedById: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  notePresent: boolean;
  closureNotePresent: boolean;
  evidenceRef: string | null;
  audit: AuditSummary;
}

export interface ClientPayoutManualReversalDetail extends ClientPayoutManualReversalListItem {
  note: string | null;
  closureNote: string | null;
  sourceDetails: {
    collection: {
      id: string;
      amount: string;
      currency: string;
      status: string;
      date: string;
      description: string | null;
    } | null;
    collectionDisposition: {
      id: string;
      totalAmount: string;
      currency: string;
      status: string;
      postedAt: string | null;
      manualReversalRequiredAt: string | null;
    } | null;
    collectionDispositionLine: {
      id: string;
      type: string;
      amount: string;
      caseClientId: string | null;
      note: string | null;
    } | null;
    clientPayout: {
      id: string;
      amount: string;
      currency: string;
      status: string;
      paidAt: string;
      paidById: string;
      note: string | null;
    } | null;
    clientPayoutAllocation: {
      id: string;
      amount: string;
      currency: string;
      allocatedAt: string;
      allocatedById: string | null;
    } | null;
  };
  auditHistory: AuditHistoryItem[];
}

/**
 * TM47D-5A - Manual reversal operations read model.
 *
 * Read-only boundary: this service projects ClientPayoutManualReversal rows and audit history.
 * It never creates, updates, closes, offsets, mutates ledger/statement/payout records, or writes audit.
 */
@Injectable()
export class ClientPayoutManualReversalReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.list() -> GET /client-payout-manual-reversals (manuel reversal operasyon listesi)
  /// </remarks>
  async list(
    tenantId: string,
    filters: ListClientPayoutManualReversalsDto,
  ): Promise<{ items: ClientPayoutManualReversalListItem[]; page: number; limit: number; total: number }> {
    if (!tenantId) throw new BadRequestException('tenantId yok');
    this.assertEnums(filters);

    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const where = this.buildWhere(tenantId, filters);
    const orderBy = this.buildOrderBy(filters.status);

    const [rows, total] = await Promise.all([
      this.prisma.clientPayoutManualReversal.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: MANUAL_REVERSAL_LIST_SELECT,
      }),
      this.prisma.clientPayoutManualReversal.count({ where }),
    ]);

    const auditSummaries = await this.loadAuditSummaries(tenantId, rows.map((row) => row.id));
    const now = new Date();
    return {
      items: rows.map((row) => this.toListItem(row, auditSummaries.get(row.id), now)),
      page,
      limit,
      total,
    };
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.detail() -> GET /client-payout-manual-reversals/:id (manuel reversal operasyon detayi)
  /// </remarks>
  async detail(tenantId: string, id: string): Promise<ClientPayoutManualReversalDetail> {
    if (!tenantId) throw new BadRequestException('tenantId yok');
    if (!id) throw new BadRequestException('manual reversal id yok');

    const row = await this.prisma.clientPayoutManualReversal.findFirst({
      where: { id, tenantId },
      select: MANUAL_REVERSAL_LIST_SELECT,
    });
    if (!row) throw new NotFoundException('Manual reversal workflow bulunamadi');

    const auditHistory = await this.audit.getEntityHistory(tenantId, 'ClientPayoutManualReversal', id);
    const mappedAudit = auditHistory.map((log) => this.toAuditHistoryItem(log));
    const auditSummary = this.summarizeAudit(mappedAudit);
    const base = this.toListItem(row, auditSummary, new Date());

    return {
      ...base,
      note: row.note ?? null,
      closureNote: row.closureNote ?? null,
      sourceDetails: {
        collection: row.collection
          ? {
              id: row.collection.id,
              amount: row.collection.amount.toString(),
              currency: row.collection.currency,
              status: row.collection.status,
              date: row.collection.date.toISOString(),
              description: row.collection.description ?? null,
            }
          : null,
        collectionDisposition: row.collectionDisposition
          ? {
              id: row.collectionDisposition.id,
              totalAmount: row.collectionDisposition.totalAmount.toString(),
              currency: row.collectionDisposition.currency,
              status: row.collectionDisposition.status,
              postedAt: row.collectionDisposition.postedAt?.toISOString() ?? null,
              manualReversalRequiredAt: row.collectionDisposition.manualReversalRequiredAt?.toISOString() ?? null,
            }
          : null,
        collectionDispositionLine: row.collectionDispositionLine
          ? {
              id: row.collectionDispositionLine.id,
              type: row.collectionDispositionLine.type,
              amount: row.collectionDispositionLine.amount.toString(),
              caseClientId: row.collectionDispositionLine.caseClientId ?? null,
              note: row.collectionDispositionLine.note ?? null,
            }
          : null,
        clientPayout: row.clientPayout
          ? {
              id: row.clientPayout.id,
              amount: row.clientPayout.amount.toString(),
              currency: row.clientPayout.currency,
              status: row.clientPayout.status,
              paidAt: row.clientPayout.paidAt.toISOString(),
              paidById: row.clientPayout.paidById,
              note: row.clientPayout.note ?? null,
            }
          : null,
        clientPayoutAllocation: row.clientPayoutAllocation
          ? {
              id: row.clientPayoutAllocation.id,
              amount: row.clientPayoutAllocation.amount.toString(),
              currency: row.clientPayoutAllocation.currency,
              allocatedAt: row.clientPayoutAllocation.allocatedAt.toISOString(),
              allocatedById: row.clientPayoutAllocation.allocatedById ?? null,
            }
          : null,
      },
      auditHistory: mappedAudit,
    };
  }

  private buildWhere(
    tenantId: string,
    filters: ListClientPayoutManualReversalsDto,
  ): Prisma.ClientPayoutManualReversalWhereInput {
    const where: Prisma.ClientPayoutManualReversalWhereInput = {
      tenantId,
      status: filters.status ?? ClientPayoutManualReversalStatus.OPEN,
    };
    if (filters.caseId) where.caseId = filters.caseId;
    if (filters.caseClientId) where.caseClientId = filters.caseClientId;
    if (filters.clientId) where.caseClient = { clientId: filters.clientId };
    if (filters.currency) where.currency = filters.currency;
    if (filters.closureMethod) where.closureMethod = filters.closureMethod;
    const openedAt = this.dateRange(filters.openedFrom, filters.openedTo);
    if (openedAt) where.openedAt = openedAt;
    const closedAt = this.dateRange(filters.closedFrom, filters.closedTo);
    if (closedAt) where.closedAt = closedAt;
    return where;
  }

  private buildOrderBy(status?: ClientPayoutManualReversalStatus): Prisma.ClientPayoutManualReversalOrderByWithRelationInput[] {
    if (status === ClientPayoutManualReversalStatus.CLOSED) {
      return [{ closedAt: 'desc' }, { openedAt: 'desc' }, { id: 'desc' }];
    }
    return [{ openedAt: 'desc' }, { id: 'desc' }];
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | null {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = this.parseDate(from);
    if (to) range.lte = this.parseDate(to);
    return Object.keys(range).length > 0 ? range : null;
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Gecersiz tarih filtresi');
    return date;
  }

  private assertEnums(filters: ListClientPayoutManualReversalsDto): void {
    if (filters.status && !Object.values(ClientPayoutManualReversalStatus).includes(filters.status)) {
      throw new BadRequestException('status gecersiz');
    }
    if (filters.closureMethod && !Object.values(ClientPayoutManualReversalClosureMethod).includes(filters.closureMethod)) {
      throw new BadRequestException('closureMethod gecersiz');
    }
  }

  private async loadAuditSummaries(tenantId: string, ids: string[]): Promise<Map<string, AuditSummary>> {
    const result = new Map<string, AuditSummary>();
    for (const id of ids) result.set(id, { count: 0, latestAction: null, latestAt: null, latestUserId: null });
    if (ids.length === 0) return result;

    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'ClientPayoutManualReversal',
        entityId: { in: ids },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true, entityId: true, userId: true, createdAt: true },
    });

    for (const log of logs) {
      if (!log.entityId) continue;
      const current = result.get(log.entityId);
      if (!current) continue;
      current.count += 1;
      if (!current.latestAt) {
        current.latestAction = log.action;
        current.latestAt = log.createdAt.toISOString();
        current.latestUserId = log.userId ?? null;
      }
    }
    return result;
  }

  private toListItem(row: ManualReversalRow, audit: AuditSummary | undefined, now: Date): ClientPayoutManualReversalListItem {
    const client = row.caseClient.client;
    return {
      id: row.id,
      caseId: row.caseId,
      caseClientId: row.caseClientId,
      clientId: row.caseClient.clientId,
      clientName: this.clientDisplayName(client),
      caseNumber: row.case.fileNumber,
      executionFileNumber: row.case.executionFileNumber ?? null,
      amount: row.amount.toString(),
      currency: row.currency,
      status: row.status,
      closureMethod: row.closureMethod ?? null,
      confidence: row.confidence,
      sourceActionId: row.sourceActionId ?? null,
      sourceLinkage: {
        collectionId: row.collectionId ?? null,
        collectionDispositionId: row.collectionDispositionId ?? null,
        collectionDispositionLineId: row.collectionDispositionLineId ?? null,
        clientPayoutId: row.clientPayoutId ?? null,
        clientPayoutAllocationId: row.clientPayoutAllocationId ?? null,
      },
      openedAt: row.openedAt.toISOString(),
      openedById: row.openedById ?? null,
      openAgeDays: this.daysOpen(row.openedAt, row.closedAt ?? now),
      closedAt: row.closedAt?.toISOString() ?? null,
      closedById: row.closedById ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledById: row.cancelledById ?? null,
      notePresent: Boolean(row.note),
      closureNotePresent: Boolean(row.closureNote),
      evidenceRef: row.evidenceRef ?? null,
      audit: audit ?? { count: 0, latestAction: null, latestAt: null, latestUserId: null },
    };
  }

  private clientDisplayName(client: ManualReversalRow['caseClient']['client']): string | null {
    const personName = [client.firstName, client.lastName].filter(Boolean).join(' ');
    return client.displayName ?? client.name ?? client.companyName ?? (personName || null);
  }

  private daysOpen(openedAt: Date, endAt: Date): number {
    return Math.max(Math.floor((endAt.getTime() - openedAt.getTime()) / MS_PER_DAY), 0);
  }

  private toAuditHistoryItem(log: Awaited<ReturnType<AuditService['getEntityHistory']>>[number]): AuditHistoryItem {
    return {
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      userId: log.userId ?? null,
      description: log.description ?? null,
      metadata: log.metadata ?? null,
      createdAt: log.createdAt.toISOString(),
    };
  }

  private summarizeAudit(items: AuditHistoryItem[]): AuditSummary {
    const latest = items[0];
    return {
      count: items.length,
      latestAction: latest?.action ?? null,
      latestAt: latest?.createdAt ?? null,
      latestUserId: latest?.userId ?? null,
    };
  }
}
