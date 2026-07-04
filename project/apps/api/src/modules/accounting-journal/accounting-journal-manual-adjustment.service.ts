import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { isOfficeAdminCapacity } from '../policy-engine/effective-permission-mapping';
import { Capacity } from '../policy-engine/types/effective-permission.types';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAccountingJournal } from './accounting-journal.builder';
import { createCanonicalSourceHash } from './accounting-journal-source-hash';
import type {
  AccountingAccountCode,
  AccountingJournalDirection,
  JournalMetadata,
  JournalWriterError,
  ManualAdjustmentJournalLinePayload,
  ManualAdjustmentJournalPayload,
  ManualAdjustmentJournalSource,
  ValidatedJournalEntryDraft,
} from './accounting-journal.types';
import { validateJournalDraft } from './accounting-journal.validators';
import { AccountingJournalWriterService } from './accounting-journal.writer';

const REASON_MIN_LENGTH = 10;

/**
 * Manual adjustments have no upstream financial entity, so the journal source identity is
 * derived entirely from the caller-supplied idempotency key. sourceVersion is a fixed tag
 * (NOT wall-clock derived) so that replaying the same idempotency key produces the same
 * idempotency key + sourceHash and the writer can replay/reject deterministically. Content
 * changes are detected via sourceHash (which is derived from the payload), not sourceVersion.
 */
const MANUAL_ADJUSTMENT_SOURCE_ACTION = 'manual-adjustment' as const;
const MANUAL_ADJUSTMENT_SOURCE_VERSION = 'manual-adjustment:v1';
const MANUAL_ADJUSTMENT_AUTHORIZATION_MODE = 'DIRECT_OFFICE_ADMIN_CAPABILITY';

export interface ManualAdjustmentLineInput {
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: string;
  caseId?: string | null;
  clientId?: string | null;
  caseClientId?: string | null;
}

export interface CreateManualAdjustmentJournalEntryInput {
  idempotencyKey: string;
  sourceName: string;
  reason: string;
  evidenceRef?: string | null;
  amount: string;
  currency: string;
  lines: ManualAdjustmentLineInput[];
}

export interface AccountingJournalManualAdjustmentResult {
  status: 'CREATED' | 'REPLAYED';
  journalEntryId: string;
  idempotencyKey: string;
  sourceVersion: string;
  lineCount: number;
}

@Injectable()
export class AccountingJournalManualAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly journalWriter: AccountingJournalWriterService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalManualAdjustmentController.createManualAdjustment() -> POST /accounting-journal/entries/manual-adjustments (JWT-only HTTP boundary; service enforces PARTNER/MANAGER office-admin gate).
  /// - Manual adjustment source -> builder + validator + writer with idempotent replay; audit written in the same transaction only on CREATED.
  /// </remarks>
  async createManualAdjustment(
    tenantId: string,
    actorUserId: string,
    input: CreateManualAdjustmentJournalEntryInput,
  ): Promise<AccountingJournalManualAdjustmentResult> {
    const normalized = normalizeInput(tenantId, actorUserId, input);
    await this.assertOfficeAdmin(normalized.tenantId, normalized.actorUserId);
    await this.assertLineReferencesInTenant(normalized.tenantId, normalized.lines);

    return this.prisma.$transaction(async (tx) => {
      const source = buildManualAdjustmentSource(normalized);
      const draft = validateBuiltDraft(buildAccountingJournal(source));
      const writeResult = await this.journalWriter.write({ draft }, tx);

      if (!writeResult.ok) {
        throw writerFailureToException(writeResult.errors);
      }

      if (writeResult.output.status === 'CREATED') {
        await this.audit.logInTransaction(tx, {
          tenantId: normalized.tenantId,
          userId: normalized.actorUserId,
          action: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_RECORDED',
          entityType: 'AccountingJournalEntry',
          entityId: writeResult.output.journalEntryId,
          metadata: {
            authorizationMode: MANUAL_ADJUSTMENT_AUTHORIZATION_MODE,
            sourceName: normalized.sourceName,
            journalEntryId: writeResult.output.journalEntryId,
            idempotencyKey: writeResult.output.idempotencyKey,
            sourceVersion: writeResult.output.sourceVersion,
            reason: normalized.reason,
            evidenceRef: normalized.evidenceRef,
            amount: normalized.amount,
            currency: normalized.currency,
            lineCount: writeResult.output.lineCount,
          },
        });
      }

      return {
        status: writeResult.output.status,
        journalEntryId: writeResult.output.journalEntryId,
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
        code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_FORBIDDEN',
        message: 'This manual accounting journal adjustment requires PARTNER or MANAGER office-admin capacity.',
      });
    }
  }

  /**
   * Manual adjustment lines carry free-form caseId/clientId/caseClientId (no upstream DB-loaded
   * source entity to inherit tenant scoping from, unlike every other journal source type). Reject
   * any reference that does not resolve inside the actor's own tenant before a draft is ever built.
   * Mirrors this repo's established tenant-ownership checks: case/client -> NotFoundException
   * (case.service.ts, client.service.ts), caseClient -> BadRequestException (case-fee-agreement.service.ts).
   */
  private async assertLineReferencesInTenant(tenantId: string, lines: NormalizedManualAdjustmentLine[]): Promise<void> {
    const caseIds = distinctNonNull(lines.map((line) => line.caseId));
    const clientIds = distinctNonNull(lines.map((line) => line.clientId));
    const caseClientIds = distinctNonNull(lines.map((line) => line.caseClientId));

    const [ownedCases, ownedClients, ownedCaseClients] = await Promise.all([
      caseIds.length
        ? this.prisma.case.findMany({ where: { id: { in: caseIds }, tenantId }, select: { id: true } })
        : Promise.resolve([]),
      clientIds.length
        ? this.prisma.client.findMany({ where: { id: { in: clientIds }, tenantId }, select: { id: true } })
        : Promise.resolve([]),
      caseClientIds.length
        ? this.prisma.caseClient.findMany({ where: { id: { in: caseClientIds }, client: { tenantId } }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    if (findMissing(caseIds, ownedCases)) {
      throw new NotFoundException({
        code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_CASE_NOT_FOUND',
        message: 'Manual adjustment line references a case that does not exist in this tenant.',
      });
    }

    if (findMissing(clientIds, ownedClients)) {
      throw new NotFoundException({
        code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_CLIENT_NOT_FOUND',
        message: 'Manual adjustment line references a client that does not exist in this tenant.',
      });
    }

    if (findMissing(caseClientIds, ownedCaseClients)) {
      throw new BadRequestException({
        code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_CASE_CLIENT_INVALID',
        message: 'Manual adjustment line references a caseClientId that is invalid or foreign to this tenant.',
      });
    }
  }
}

function distinctNonNull(values: ReadonlyArray<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value !== null)));
}

function findMissing(ids: ReadonlyArray<string>, found: ReadonlyArray<{ id: string }>): string | undefined {
  const foundIds = new Set(found.map((row) => row.id));
  return ids.find((id) => !foundIds.has(id));
}

interface NormalizedManualAdjustmentLine {
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
}

interface NormalizedManualAdjustmentInput {
  tenantId: string;
  actorUserId: string;
  idempotencyKey: string;
  sourceName: string;
  reason: string;
  evidenceRef: string | null;
  amount: string;
  currency: string;
  lines: NormalizedManualAdjustmentLine[];
}

function normalizeInput(
  tenantId: string,
  actorUserId: string,
  input: CreateManualAdjustmentJournalEntryInput,
): NormalizedManualAdjustmentInput {
  const normalizedTenantId = requireTrimmed(tenantId, 'tenantId');
  const normalizedActorUserId = requireTrimmed(actorUserId, 'actorUserId');
  const idempotencyKey = requireTrimmed(input?.idempotencyKey, 'idempotencyKey');
  const sourceName = requireTrimmed(input?.sourceName, 'sourceName');
  const reason = requireTrimmed(input?.reason, 'reason');
  const amount = requireTrimmed(input?.amount, 'amount');
  const currency = requireTrimmed(input?.currency, 'currency');

  if (reason.length < REASON_MIN_LENGTH) {
    throw new BadRequestException({
      code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_REASON_REQUIRED',
      message: `Manual adjustment reason must be at least ${REASON_MIN_LENGTH} characters.`,
    });
  }

  if (!Array.isArray(input?.lines) || input.lines.length === 0) {
    throw new BadRequestException({
      code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_LINES_REQUIRED',
      message: 'Manual adjustment requires at least two balanced lines.',
    });
  }

  return {
    tenantId: normalizedTenantId,
    actorUserId: normalizedActorUserId,
    idempotencyKey,
    sourceName,
    reason,
    evidenceRef: normalizeOptionalString(input?.evidenceRef),
    amount,
    currency,
    lines: input.lines.map(normalizeLine),
  };
}

function normalizeLine(line: ManualAdjustmentLineInput): NormalizedManualAdjustmentLine {
  return {
    accountCode: line.accountCode,
    direction: line.direction,
    amount: requireTrimmed(line?.amount, 'line.amount'),
    caseId: normalizeOptionalString(line?.caseId),
    clientId: normalizeOptionalString(line?.clientId),
    caseClientId: normalizeOptionalString(line?.caseClientId),
  };
}

function buildManualAdjustmentSource(normalized: NormalizedManualAdjustmentInput): ManualAdjustmentJournalSource {
  const occurredAt = new Date().toISOString();
  const payload: ManualAdjustmentJournalPayload = {
    amount: normalized.amount,
    reason: normalized.reason,
    evidenceRef: normalized.evidenceRef,
    lines: normalized.lines.map(toLinePayload),
  };

  const metadata: JournalMetadata = {
    authorizationMode: MANUAL_ADJUSTMENT_AUTHORIZATION_MODE,
    sourceName: normalized.sourceName,
    reason: normalized.reason,
    evidenceRef: normalized.evidenceRef,
  };

  // sourceHash is derived from the authoritative content only (payload + identity). occurredAt
  // and the non-authoritative sourceName are excluded so replays of the same key + same payload
  // hash identically, while any content change produces a mismatch the writer rejects.
  const sourceHash = createCanonicalSourceHash({
    tenantId: normalized.tenantId,
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
    sourceId: normalized.idempotencyKey,
    sourceAction: MANUAL_ADJUSTMENT_SOURCE_ACTION,
    sourceVersion: MANUAL_ADJUSTMENT_SOURCE_VERSION,
    actorId: normalized.actorUserId,
    currency: normalized.currency,
    payload,
  });

  return {
    tenantId: normalized.tenantId,
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
    sourceId: normalized.idempotencyKey,
    sourceVersion: MANUAL_ADJUSTMENT_SOURCE_VERSION,
    sourceAction: MANUAL_ADJUSTMENT_SOURCE_ACTION,
    occurredAt,
    effectiveDate: occurredAt.slice(0, 10),
    actorId: normalized.actorUserId,
    currency: normalized.currency,
    sourceHash,
    metadata,
    payload,
  };
}

function toLinePayload(line: NormalizedManualAdjustmentLine): ManualAdjustmentJournalLinePayload {
  return {
    accountCode: line.accountCode,
    direction: line.direction,
    amount: line.amount,
    caseId: line.caseId,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
  };
}

function validateBuiltDraft(draftResult: ReturnType<typeof buildAccountingJournal>): ValidatedJournalEntryDraft {
  if (!draftResult.ok) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_DRAFT_INVALID',
      message: 'Manual accounting journal adjustment draft could not be built.',
      errors: draftResult.errors,
    });
  }

  const validation = validateJournalDraft(draftResult.draft);
  if (!validation.ok) {
    throw new ConflictException({
      code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_DRAFT_INVALID',
      message: 'Manual accounting journal adjustment draft could not be validated.',
      errors: validation.errors,
    });
  }

  return validation.draft;
}

function requireTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException({
      code: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_INVALID_INPUT',
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

function writerFailureToException(errors: ReadonlyArray<JournalWriterError>): Error {
  const first = errors[0];
  const code = first?.code ?? 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_WRITE_FAILED';
  const message = first?.message ?? 'Manual accounting journal adjustment could not be written.';

  if (code === 'TENANT_MISMATCH') {
    return new ForbiddenException({ code, message, errors });
  }

  return new ConflictException({ code, message, errors });
}
