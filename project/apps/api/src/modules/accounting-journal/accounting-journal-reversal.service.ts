import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { isOfficeAdminCapacity } from '../policy-engine/effective-permission-mapping';
import { Capacity } from '../policy-engine/types/effective-permission.types';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAccountingJournal } from './accounting-journal.builder';
import { createCanonicalSourceHash } from './accounting-journal-source-hash';
import type {
  AccountingJournalReversalLinePayload,
  AccountingJournalReversalPayload,
  AccountingJournalReversalSource,
  JournalMetadata,
  JournalWriterError,
  ValidatedJournalEntryDraft,
} from './accounting-journal.types';
import { validateJournalDraft } from './accounting-journal.validators';
import { AccountingJournalWriterService } from './accounting-journal.writer';

const REVERSAL_REASON_MIN_LENGTH = 10;
const REVERSAL_SOURCE_NAME = 'accounting-journal-generic-reversal';
const REVERSAL_AUTHORIZATION_MODE = 'DIRECT_OFFICE_ADMIN_CAPABILITY';

const ORIGINAL_JOURNAL_ENTRY_SELECT = {
  id: true,
  tenantId: true,
  caseId: true,
  currency: true,
  entryType: true,
  sourceType: true,
  sourceId: true,
  sourceAction: true,
  sourceOccurredAt: true,
  postedAt: true,
  postedById: true,
  reversalOfEntryId: true,
  metadata: true,
  reversedByEntry: { select: { id: true } },
  lines: {
    orderBy: { lineNo: 'asc' as const },
    select: {
      lineNo: true,
      accountCode: true,
      direction: true,
      amount: true,
      currency: true,
      caseId: true,
      clientId: true,
      caseClientId: true,
      collectionId: true,
      dispositionLineId: true,
      payoutId: true,
      offsetId: true,
      expenseRequestId: true,
      expensePaymentId: true,
      expenseApplicationId: true,
      balanceLedgerId: true,
    },
  },
} as const;

type OriginalJournalEntry = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof ORIGINAL_JOURNAL_ENTRY_SELECT;
}>;


export interface ReverseAccountingJournalEntryInput {
  reason: string;
  evidenceRef?: string | null;
}

export interface AccountingJournalReversalResult {
  status: 'CREATED' | 'REPLAYED';
  originalJournalEntryId: string;
  reversalJournalEntryId: string;
  idempotencyKey: string;
  sourceVersion: string;
  lineCount: number;
}

@Injectable()
export class AccountingJournalReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly journalWriter: AccountingJournalWriterService,
  ) {}

  async reverseEntry(
    tenantId: string,
    actorUserId: string,
    originalJournalEntryId: string,
    input: ReverseAccountingJournalEntryInput,
  ): Promise<AccountingJournalReversalResult> {
    const normalized = normalizeInput(tenantId, actorUserId, originalJournalEntryId, input);
    await this.assertOfficeAdmin(normalized.tenantId, normalized.actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const original = await tx.accountingJournalEntry.findFirst({
        where: { id: normalized.originalJournalEntryId, tenantId: normalized.tenantId },
        select: ORIGINAL_JOURNAL_ENTRY_SELECT,
      });

      if (!original) {
        throw new NotFoundException({
          code: 'ACCOUNTING_JOURNAL_REVERSAL_ORIGINAL_NOT_FOUND',
          message: 'Accounting journal entry not found.',
        });
      }

      assertReversibleSnapshot(original);

      const source = buildReversalSource(original, normalized.actorUserId, normalized.reason, normalized.evidenceRef);
      const draft = validateBuiltDraft(buildAccountingJournal(source));
      const writeResult = await this.journalWriter.write({ draft }, tx);

      if (!writeResult.ok) {
        throw writerFailureToException(writeResult.errors);
      }

      if (writeResult.output.status === 'CREATED') {
        await this.audit.logInTransaction(tx, {
          tenantId: normalized.tenantId,
          userId: normalized.actorUserId,
          action: 'ACCOUNTING_JOURNAL_ENTRY_REVERSED',
          entityType: 'AccountingJournalEntry',
          entityId: writeResult.output.journalEntryId,
          metadata: {
            authorizationMode: REVERSAL_AUTHORIZATION_MODE,
            sourceName: REVERSAL_SOURCE_NAME,
            originalJournalEntryId: original.id,
            reversalJournalEntryId: writeResult.output.journalEntryId,
            idempotencyKey: writeResult.output.idempotencyKey,
            sourceVersion: writeResult.output.sourceVersion,
            reason: normalized.reason,
            evidenceRef: normalized.evidenceRef,
            lineCount: writeResult.output.lineCount,
            currency: original.currency,
          },
        });
      }

      return {
        status: writeResult.output.status,
        originalJournalEntryId: original.id,
        reversalJournalEntryId: writeResult.output.journalEntryId,
        idempotencyKey: writeResult.output.idempotencyKey,
        sourceVersion: writeResult.output.sourceVersion,
        lineCount: writeResult.output.lineCount,
      };
    });
  }

  private async assertOfficeAdmin(tenantId: string, actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: actorUserId, tenantId, isActive: true },
      select: {
        id: true,
        lawyer: { select: { lawyerRank: true } },
        staffMember: { select: { staffType: true } },
      },
    });

    const capacity = readActorCapacity(user);
    if (!isOfficeAdminCapacity(capacity)) {
      throw new ForbiddenException({
        code: 'ACCOUNTING_JOURNAL_REVERSAL_FORBIDDEN',
        message: 'This accounting journal reversal requires PARTNER or MANAGER office-admin capacity.',
      });
    }
  }
}

interface NormalizedReverseInput {
  tenantId: string;
  actorUserId: string;
  originalJournalEntryId: string;
  reason: string;
  evidenceRef: string | null;
}

function normalizeInput(
  tenantId: string,
  actorUserId: string,
  originalJournalEntryId: string,
  input: ReverseAccountingJournalEntryInput,
): NormalizedReverseInput {
  const normalizedTenantId = requireTrimmed(tenantId, 'tenantId');
  const normalizedActorUserId = requireTrimmed(actorUserId, 'actorUserId');
  const normalizedOriginalId = requireTrimmed(originalJournalEntryId, 'originalJournalEntryId');
  const reason = requireTrimmed(input?.reason, 'reason');

  if (reason.length < REVERSAL_REASON_MIN_LENGTH) {
    throw new BadRequestException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_REASON_REQUIRED',
      message: `Reversal reason must be at least ${REVERSAL_REASON_MIN_LENGTH} characters.`,
    });
  }

  return {
    tenantId: normalizedTenantId,
    actorUserId: normalizedActorUserId,
    originalJournalEntryId: normalizedOriginalId,
    reason,
    evidenceRef: normalizeOptionalString(input?.evidenceRef),
  };
}

function requireTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_INVALID_INPUT',
      message: `${field} is required.`,
    });
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readActorCapacity(user: {
  lawyer: { lawyerRank: string | null } | null;
  staffMember: { staffType: string | null } | null;
} | null): Capacity {
  return (user?.lawyer?.lawyerRank ?? user?.staffMember?.staffType ?? 'UNKNOWN') as Capacity;
}

function assertReversibleSnapshot(original: OriginalJournalEntry): void {
  if (original.entryType === 'ACCOUNTING_JOURNAL_REVERSAL' || original.reversalOfEntryId) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_ORIGINAL_NOT_REVERSIBLE',
      message: 'Accounting journal reversal entries cannot be reversed again.',
    });
  }

  if (original.lines.length === 0) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_ORIGINAL_HAS_NO_LINES',
      message: 'Accounting journal entries without lines cannot be reversed.',
    });
  }
}

function buildReversalSource(
  original: OriginalJournalEntry,
  actorUserId: string,
  reason: string,
  evidenceRef: string | null,
): AccountingJournalReversalSource {
  const sourceVersion = `${normalizeDate(original.postedAt)}:${original.id}:reversal`;
  const occurredAt = new Date().toISOString();
  const payload: AccountingJournalReversalPayload = {
    originalJournalEntryId: original.id,
    originalEntryType: original.entryType,
    originalCaseId: original.caseId,
    originalCurrency: original.currency,
    originalSourceType: original.sourceType,
    originalSourceId: original.sourceId,
    originalSourceAction: original.sourceAction,
    originalSourceVersion: readMetadataString(original.metadata, 'sourceVersion'),
    originalLines: original.lines.map(toReversalLinePayload),
  };

  const metadata: JournalMetadata = {
    authorizationMode: REVERSAL_AUTHORIZATION_MODE,
    sourceName: REVERSAL_SOURCE_NAME,
    originalJournalEntryId: original.id,
    reason,
    evidenceRef,
  };

  const sourceHash = createCanonicalSourceHash({
    tenantId: original.tenantId,
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
    sourceId: original.id,
    sourceAction: 'reversal',
    sourceVersion,
    actorId: actorUserId,
    currency: original.currency,
    payload,
    reason,
    evidenceRef,
  });

  return {
    tenantId: original.tenantId,
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
    sourceId: original.id,
    sourceVersion,
    sourceAction: 'reversal',
    occurredAt,
    effectiveDate: occurredAt.slice(0, 10),
    actorId: actorUserId,
    currency: original.currency,
    sourceHash,
    metadata,
    payload,
  };
}

function validateBuiltDraft(draftResult: ReturnType<typeof buildAccountingJournal>): ValidatedJournalEntryDraft {
  if (!draftResult.ok) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_DRAFT_INVALID',
      message: 'Accounting journal reversal draft could not be built.',
      errors: draftResult.errors,
    });
  }

  const validation = validateJournalDraft(draftResult.draft);
  if (!validation.ok) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_DRAFT_INVALID',
      message: 'Accounting journal reversal draft could not be validated.',
      errors: validation.errors,
    });
  }

  return validation.draft;
}

function toReversalLinePayload(line: OriginalJournalEntry['lines'][number]): AccountingJournalReversalLinePayload {
  return {
    lineNo: line.lineNo,
    accountCode: line.accountCode,
    direction: line.direction,
    amount: line.amount.toFixed(2),
    currency: line.currency,
    caseId: line.caseId,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
    collectionId: line.collectionId,
    dispositionLineId: line.dispositionLineId,
    payoutId: line.payoutId,
    offsetId: line.offsetId,
    expenseRequestId: line.expenseRequestId,
    expensePaymentId: line.expensePaymentId,
    expenseApplicationId: line.expenseApplicationId,
    balanceLedgerId: line.balanceLedgerId,
  };
}


function normalizeDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_REVERSAL_INVALID_ORIGINAL_TIMESTAMP',
      message: 'Original accounting journal postedAt is invalid.',
    });
  }

  return date.toISOString();
}

function readMetadataString(metadata: Prisma.JsonValue | null, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function writerFailureToException(errors: ReadonlyArray<JournalWriterError>): Error {
  const first = errors[0];
  const code = first?.code ?? 'ACCOUNTING_JOURNAL_REVERSAL_WRITE_FAILED';
  const message = first?.message ?? 'Accounting journal reversal could not be written.';

  if (code === 'REVERSAL_ORIGINAL_NOT_FOUND') {
    return new NotFoundException({ code, message, errors });
  }

  if (code === 'TENANT_MISMATCH') {
    return new ForbiddenException({ code, message, errors });
  }

  return new ConflictException({ code, message, errors });
}