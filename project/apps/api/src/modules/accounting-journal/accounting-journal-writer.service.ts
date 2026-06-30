import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  JournalEntryDraft,
  JournalWriterError,
  JournalWriterInput,
  JournalWriterResult,
} from './accounting-journal.types';
import { validateJournalDraft } from './accounting-journal.validators';

export interface AccountingJournalEntryRecord {
  id: string;
  sourceHash: string | null;
}

export interface AccountingJournalWriterTransaction {
  accountingJournalEntry: {
    findUnique: (args: unknown) => Promise<AccountingJournalEntryRecord | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
}

export interface AccountingJournalWriterDatabase extends AccountingJournalWriterTransaction {
  $transaction: <T>(
    callback: (tx: AccountingJournalWriterTransaction) => Promise<T>,
  ) => Promise<T>;
}

@Injectable()
export class AccountingJournalWriterService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AccountingJournalWriterService.write() → ACCT-1A focused writer tests; runtime source wiring henüz yok.
  /// - Future accounting source wiring → shadow journal persistence için aynı transaction içine alınabilir.
  /// </remarks>
  async write(
    input: JournalWriterInput,
    database: AccountingJournalWriterDatabase = this
      .prisma as unknown as AccountingJournalWriterDatabase,
  ): Promise<JournalWriterResult> {
    const validation = validateJournalDraft(input.draft);

    if (!validation.ok) {
      return {
        ok: false,
        errors: [
          {
            code: 'VALIDATION_FAILED',
            message: 'Accounting journal draft validation failed.',
            idempotencyKey: input.draft.idempotencyKey ?? null,
            details: {
              validationErrors: validation.errors,
            },
          },
        ],
      };
    }

    const draft = validation.draft;

    try {
      return await database.$transaction(async (tx) => {
        const existing = await this.findExistingEntry(tx, draft);

        if (existing) {
          if (this.sourceHashesMatch(existing.sourceHash, draft.sourceHash)) {
            return this.successResult('REPLAYED', existing.id, draft);
          }

          return {
            ok: false,
            errors: [
              this.sourceHashMismatchError(
                draft,
                existing.sourceHash,
                draft.sourceHash,
              ),
            ],
          };
        }

        const created = await tx.accountingJournalEntry.create({
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
            metadata: this.entryMetadata(draft),
            sourceOccurredAt: new Date(draft.sourceOccurredAt),
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
          select: {
            id: true,
          },
        });

        return this.successResult('CREATED', created.id, draft);
      });
    } catch (error) {
      const conflictReplay = await this.tryResolveUniqueConflictReplay(
        database,
        draft,
        error,
      );

      if (conflictReplay) {
        return conflictReplay;
      }

      return {
        ok: false,
        errors: [
          {
            code: 'DB_WRITE_FAILED',
            message: 'Accounting journal entry could not be persisted.',
            idempotencyKey: draft.idempotencyKey,
            details: {
              errorName:
                error instanceof Error ? error.constructor.name : 'UnknownError',
            },
          },
        ],
      };
    }
  }

  private findExistingEntry(
    tx: AccountingJournalWriterTransaction,
    draft: JournalEntryDraft,
  ): Promise<AccountingJournalEntryRecord | null> {
    return tx.accountingJournalEntry.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: draft.tenantId,
          idempotencyKey: draft.idempotencyKey,
        },
      },
      select: {
        id: true,
        sourceHash: true,
      },
    });
  }

  private async tryResolveUniqueConflictReplay(
    database: AccountingJournalWriterDatabase,
    draft: JournalEntryDraft,
    error: unknown,
  ): Promise<JournalWriterResult | null> {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return null;
    }

    const existing = await this.findExistingEntry(database, draft);

    if (!existing) {
      return {
        ok: false,
        errors: [
          {
            code: 'IDEMPOTENCY_CONFLICT',
            message:
              'Accounting journal unique constraint failed without a replayable entry.',
            idempotencyKey: draft.idempotencyKey,
            details: {},
          },
        ],
      };
    }

    if (this.sourceHashesMatch(existing.sourceHash, draft.sourceHash)) {
      return this.successResult('REPLAYED', existing.id, draft);
    }

    return {
      ok: false,
      errors: [
        this.sourceHashMismatchError(draft, existing.sourceHash, draft.sourceHash),
      ],
    };
  }

  private sourceHashesMatch(
    existingSourceHash: string | null,
    draftSourceHash: string | null,
  ): boolean {
    return (existingSourceHash ?? null) === (draftSourceHash ?? null);
  }

  private sourceHashMismatchError(
    draft: JournalEntryDraft,
    existingSourceHash: string | null,
    draftSourceHash: string | null,
  ): JournalWriterError {
    return {
      code: 'SOURCE_HASH_MISMATCH',
      message:
        'Accounting journal idempotency key already exists with a different source hash.',
      idempotencyKey: draft.idempotencyKey,
      details: {
        tenantId: draft.tenantId,
        existingSourceHash,
        draftSourceHash,
      },
    };
  }

  private entryMetadata(draft: JournalEntryDraft): Prisma.InputJsonValue {
    return {
      ...(draft.metadata ?? {}),
      effectiveDate: draft.effectiveDate,
      sourceVersion: draft.sourceVersion,
      idempotencyMaterial: draft.idempotencyMaterial,
    } as Prisma.InputJsonValue;
  }

  private successResult(
    status: 'CREATED' | 'REPLAYED',
    journalEntryId: string,
    draft: JournalEntryDraft,
  ): JournalWriterResult {
    return {
      ok: true,
      output: {
        status,
        journalEntryId,
        idempotencyKey: draft.idempotencyKey,
        sourceVersion: draft.sourceVersion,
        lineCount: draft.lines.length,
      },
    };
  }
}
