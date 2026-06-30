import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  JournalMetadata,
  JournalWriterError,
  JournalWriterInput,
  JournalWriterResult,
  ValidatedJournalEntryDraft,
} from './accounting-journal.types';

type AccountingJournalWriteClient = Pick<Prisma.TransactionClient, 'accountingJournalEntry'>;

type ExistingJournalEntry = {
  id: string;
  idempotencyKey: string;
  sourceHash: string | null;
  sourceType: string;
  sourceId: string;
  sourceAction: string;
  _count: { lines: number };
};

@Injectable()
export class AccountingJournalWriterService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - DispositionPostingService.post() -> POST /collection-dispositions/:id/post (CollectionDispositionLine live journal write)
  /// - ClientPayoutService.create() -> POST /client-payouts (ClientPayout RECORDED live journal write)
  /// </remarks>
  async write(input: JournalWriterInput, db: AccountingJournalWriteClient = this.prisma): Promise<JournalWriterResult> {
    return this.writeValidatedDraft(input.draft, db);
  }

  private async writeValidatedDraft(draft: ValidatedJournalEntryDraft, db: AccountingJournalWriteClient): Promise<JournalWriterResult> {
    const existingBySource = await this.findBySource(draft, db);
    if (existingBySource) return this.replayOrRejectExisting(draft, existingBySource);

    const existingByIdempotency = await db.accountingJournalEntry.findFirst({
      where: { tenantId: draft.tenantId, idempotencyKey: draft.idempotencyKey },
      select: existingEntrySelect,
    });
    if (existingByIdempotency) {
      return {
        ok: false,
        errors: [writerError('IDEMPOTENCY_CONFLICT', 'Accounting journal idempotency key already belongs to a different source.', draft, {
          existingSourceType: existingByIdempotency.sourceType,
          existingSourceId: existingByIdempotency.sourceId,
          existingSourceAction: existingByIdempotency.sourceAction,
        })],
      };
    }

    try {
      const created = await db.accountingJournalEntry.create({
        data: {
          tenantId: draft.tenantId,
          caseId: draft.caseId,
          currency: draft.currency,
          entryType: draft.entryType,
          sourceType: draft.sourceType,
          sourceId: draft.sourceId,
          sourceAction: draft.sourceAction,
          idempotencyKey: draft.idempotencyKey,
          sourceHash: draft.sourceHash,
          metadata: journalMetadataWithContract(draft),
          sourceOccurredAt: new Date(draft.sourceOccurredAt),
          postedAt: new Date(draft.sourceOccurredAt),
          postedById: draft.postedById,
          reversalOfEntryId: draft.reversalOf?.journalEntryId ?? null,
          lines: {
            create: draft.lines.map((line) => ({
              tenantId: line.tenantId,
              lineNo: line.lineNo,
              accountCode: line.accountCode,
              direction: line.direction,
              amount: new Prisma.Decimal(line.amount),
              currency: line.currency,
              caseId: line.caseId,
              clientId: line.clientId,
              caseClientId: line.caseClientId,
              collectionId: line.collectionId,
              dispositionLineId: line.dispositionLineId,
              payoutId: line.payoutId,
              offsetId: line.offsetId,
              balanceLedgerId: line.balanceLedgerId,
            })),
          },
        },
        select: { id: true, _count: { select: { lines: true } } },
      });

      return {
        ok: true,
        output: {
          status: 'CREATED',
          journalEntryId: created.id,
          idempotencyKey: draft.idempotencyKey,
          sourceVersion: draft.sourceVersion,
          lineCount: created._count.lines,
        },
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        const racedExisting = await this.findBySource(draft, db);
        if (racedExisting) return this.replayOrRejectExisting(draft, racedExisting);
      }
      return {
        ok: false,
        errors: [writerError('DB_WRITE_FAILED', 'Accounting journal write failed.', draft, {
          errorMessage: error instanceof Error ? error.message : String(error),
        })],
      };
    }
  }

  private async findBySource(draft: ValidatedJournalEntryDraft, db: AccountingJournalWriteClient): Promise<ExistingJournalEntry | null> {
    return db.accountingJournalEntry.findFirst({
      where: {
        tenantId: draft.tenantId,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        sourceAction: draft.sourceAction,
      },
      select: existingEntrySelect,
    });
  }

  private replayOrRejectExisting(draft: ValidatedJournalEntryDraft, existing: ExistingJournalEntry): JournalWriterResult {
    if (existing.idempotencyKey !== draft.idempotencyKey) {
      return {
        ok: false,
        errors: [writerError('SOURCE_VERSION_STALE', 'Accounting journal source/action already exists with a different sourceVersion.', draft, {
          existingIdempotencyKey: existing.idempotencyKey,
        })],
      };
    }

    if (existing.sourceHash && draft.sourceHash && existing.sourceHash !== draft.sourceHash) {
      return {
        ok: false,
        errors: [writerError('SOURCE_HASH_MISMATCH', 'Accounting journal source hash mismatch on replay.', draft, {
          existingSourceHash: existing.sourceHash,
          sourceHash: draft.sourceHash,
        })],
      };
    }

    return {
      ok: true,
      output: {
        status: 'REPLAYED',
        journalEntryId: existing.id,
        idempotencyKey: draft.idempotencyKey,
        sourceVersion: draft.sourceVersion,
        lineCount: existing._count.lines,
      },
    };
  }
}

const existingEntrySelect = {
  id: true,
  idempotencyKey: true,
  sourceHash: true,
  sourceType: true,
  sourceId: true,
  sourceAction: true,
  _count: { select: { lines: true } },
} as const;

function journalMetadataWithContract(draft: ValidatedJournalEntryDraft): Prisma.InputJsonValue {
  return {
    ...draft.metadata,
    sourceVersion: draft.sourceVersion,
    effectiveDate: draft.effectiveDate,
    idempotencyMaterial: draft.idempotencyMaterial,
    validation: draft.validation,
  } as unknown as Prisma.InputJsonValue;
}

function writerError(
  code: JournalWriterError['code'],
  message: string,
  draft: ValidatedJournalEntryDraft,
  details: JournalMetadata = {},
): JournalWriterError {
  return {
    code,
    message,
    idempotencyKey: draft.idempotencyKey,
    details: {
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      sourceAction: draft.sourceAction,
      sourceVersion: draft.sourceVersion,
      ...details,
    },
  };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}