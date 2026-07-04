import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ClientAccountingMovement,
  ClientMovementsOptions,
  ClientMovementsResult,
  MovementClientEffect,
  MovementSourceType,
} from './client-settlement-read.service';

const ELIGIBLE_ROLES = ['ALACAKLI', 'ORTAK_ALACAKLI'];

const CLIENT_SPECIFIC_JOURNAL_SOURCE_FILTER = [
  { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted' },
  { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded' },
  { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply' },
  { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal' },
] as const;

type ClientSpecificJournalSourceType =
  (typeof CLIENT_SPECIFIC_JOURNAL_SOURCE_FILTER)[number]['sourceType'];

type ClientSpecificJournalSourceAction =
  (typeof CLIENT_SPECIFIC_JOURNAL_SOURCE_FILTER)[number]['sourceAction'];

interface ClientSpecificJournalIdentity {
  sourceType: ClientSpecificJournalSourceType;
  sourceAction: ClientSpecificJournalSourceAction;
}

interface CaseClientRow {
  id: string;
  caseId: string;
  case?: { fileNumber?: string | null } | null;
}

interface JournalMovementLine {
  id: string;
  accountCode: string;
  direction: string;
  amount: { toString(): string };
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  dispositionLineId: string | null;
  payoutId: string | null;
  offsetId: string | null;
  journalEntry: {
    sourceType: string;
    sourceAction: string;
    sourceId: string;
    sourceOccurredAt: Date | null;
    postedAt: Date;
  };
}

@Injectable()
export class ClientAccountingJournalMovementsReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async getMovements(
    tenantId: string,
    clientId: string,
    opts: ClientMovementsOptions = {},
  ): Promise<ClientMovementsResult> {
    const currency = opts.currency || 'TRY';
    const page = Math.max(Number(opts.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(opts.pageSize) || 50, 1), 200);
    const scope: 'client' | 'case' = opts.scope === 'case' && opts.caseId ? 'case' : 'client';
    const from = opts.from ? new Date(opts.from) : null;
    const to = opts.to ? new Date(opts.to) : null;

    const caseClients = await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true, caseId: true, case: { select: { fileNumber: true } } },
    }) as CaseClientRow[];

    let scopedCaseClients = caseClients;
    if (scope === 'case') {
      scopedCaseClients = caseClients.filter((row) => row.caseId === opts.caseId);
    }

    const caseClientIds = scopedCaseClients.map((row) => row.id);
    if (caseClientIds.length === 0) {
      return { items: [], page, pageSize, total: 0 };
    }

    const caseNoByCaseId = new Map<string, string>();
    for (const row of caseClients) {
      if (!caseNoByCaseId.has(row.caseId)) {
        caseNoByCaseId.set(row.caseId, row.case?.fileNumber ?? '');
      }
    }

    const entryDateRange = dateRange(from, to);
    const lines = await this.prisma.accountingJournalLine.findMany({
      where: {
        tenantId,
        accountCode: 'CLIENT_PAYABLE',
        currency,
        caseClientId: { in: caseClientIds },
        ...(scope === 'case' ? { caseId: opts.caseId } : {}),
        journalEntry: {
          tenantId,
          AND: [
            {
              OR: CLIENT_SPECIFIC_JOURNAL_SOURCE_FILTER.map((source) => ({
                sourceType: source.sourceType,
                sourceAction: source.sourceAction,
              })),
            },
            ...(entryDateRange
              ? [
                  {
                    OR: [
                      { sourceOccurredAt: entryDateRange },
                      { sourceOccurredAt: null, postedAt: entryDateRange },
                      { postedAt: entryDateRange },
                    ],
                  },
                ]
              : []),
          ],
        },
      },
      select: {
        id: true,
        accountCode: true,
        direction: true,
        amount: true,
        currency: true,
        caseId: true,
        clientId: true,
        caseClientId: true,
        dispositionLineId: true,
        payoutId: true,
        offsetId: true,
        journalEntry: {
          select: {
            sourceType: true,
            sourceAction: true,
            sourceId: true,
            sourceOccurredAt: true,
            postedAt: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { postedAt: 'desc' } },
        { journalEntryId: 'asc' },
        { lineNo: 'asc' },
      ],
    }) as JournalMovementLine[];

    const movements = lines
      .map((line) => movementFromJournalLine(line, caseNoByCaseId))
      .filter((movement): movement is ClientAccountingMovement => movement !== null)
      .filter((movement) => inDate(new Date(movement.occurredAt), from, to));

    movements.sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        a.sourceType.localeCompare(b.sourceType) ||
        a.sourceId.localeCompare(b.sourceId),
    );

    const total = movements.length;
    const start = (page - 1) * pageSize;
    return { items: movements.slice(start, start + pageSize), page, pageSize, total };
  }
}

function movementFromJournalLine(
  line: JournalMovementLine,
  caseNoByCaseId: Map<string, string>,
): ClientAccountingMovement | null {
  if (line.accountCode !== 'CLIENT_PAYABLE') return null;
  if (!line.caseId || !line.caseClientId) return null;
  const source = clientSpecificJournalIdentity(line.journalEntry.sourceType, line.journalEntry.sourceAction);
  if (!source) return null;

  const sourceType = movementSourceType(source.sourceType);
  const sourceId = movementSourceId(line);
  const occurredAt = line.journalEntry.sourceOccurredAt ?? line.journalEntry.postedAt;
  const clientEffect = movementClientEffect(source.sourceType, source.sourceAction);

  return {
    id: `journal:${line.journalEntry.sourceType}:${line.journalEntry.sourceAction}:${sourceId}:${line.id}`,
    sourceType,
    sourceId,
    scopeGroup: 'CLIENT_SPECIFIC',
    occurredAt: occurredAt.toISOString(),
    caseId: line.caseId,
    caseNo: caseNoByCaseId.get(line.caseId) ?? '',
    caseClientId: line.caseClientId,
    label: movementLabel(source.sourceType, source.sourceAction),
    description: null,
    amount: line.amount.toString(),
    currency: line.currency,
    clientEffect,
    status: movementStatus(source.sourceType, source.sourceAction),
  };
}

function clientSpecificJournalIdentity(
  sourceType: string,
  sourceAction: string,
): ClientSpecificJournalIdentity | null {
  const source = CLIENT_SPECIFIC_JOURNAL_SOURCE_FILTER.find(
    (candidate) => candidate.sourceType === sourceType && candidate.sourceAction === sourceAction,
  );
  return source ? { sourceType: source.sourceType, sourceAction: source.sourceAction } : null;
}

function movementSourceType(sourceType: ClientSpecificJournalSourceType): MovementSourceType {
  if (sourceType === 'COLLECTION_DISPOSITION_LINE') return 'COLLECTION_DISPOSITION';
  if (sourceType === 'CLIENT_PAYOUT') return 'CLIENT_PAYOUT';
  return 'CLIENT_OFFSET';
}

function movementSourceId(line: JournalMovementLine): string {
  if (line.journalEntry.sourceType === 'COLLECTION_DISPOSITION_LINE') {
    return line.dispositionLineId ?? line.journalEntry.sourceId;
  }
  if (line.journalEntry.sourceType === 'CLIENT_PAYOUT') {
    return line.payoutId ?? line.journalEntry.sourceId;
  }
  if (line.journalEntry.sourceType === 'CLIENT_OFFSET') {
    return line.offsetId ?? line.journalEntry.sourceId;
  }
  return line.journalEntry.sourceId;
}

function movementClientEffect(
  sourceType: ClientSpecificJournalSourceType,
  sourceAction: ClientSpecificJournalSourceAction,
): MovementClientEffect {
  if (sourceType === 'COLLECTION_DISPOSITION_LINE') return 'INCREASE_CLIENT_PAYABLE';
  if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'reversal') return 'INCREASE_CLIENT_PAYABLE';
  return 'DECREASE_CLIENT_PAYABLE';
}

function movementLabel(sourceType: ClientSpecificJournalSourceType, sourceAction: ClientSpecificJournalSourceAction): string {
  if (sourceType === 'COLLECTION_DISPOSITION_LINE') return 'Journal: client payable disposition posted';
  if (sourceType === 'CLIENT_PAYOUT') return 'Journal: client payout recorded';
  if (sourceAction === 'reversal') return 'Journal: client offset reversal';
  return 'Journal: client offset applied';
}

function movementStatus(
  sourceType: ClientSpecificJournalSourceType,
  sourceAction: ClientSpecificJournalSourceAction,
): string {
  if (sourceType === 'COLLECTION_DISPOSITION_LINE') return 'POSTED';
  if (sourceType === 'CLIENT_PAYOUT') return 'RECORDED';
  return sourceAction.toUpperCase();
}

function dateRange(from: Date | null, to: Date | null): Prisma.DateTimeFilter | null {
  if (!validDate(from) && !validDate(to)) return null;
  return {
    ...(validDate(from) ? { gte: from as Date } : {}),
    ...(validDate(to) ? { lte: to as Date } : {}),
  };
}

function inDate(date: Date, from: Date | null, to: Date | null): boolean {
  if (!validDate(date)) return false;
  if (validDate(from) && date.getTime() < from.getTime()) return false;
  if (validDate(to) && date.getTime() > to.getTime()) return false;
  return true;
}

function validDate(date: Date | null): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
