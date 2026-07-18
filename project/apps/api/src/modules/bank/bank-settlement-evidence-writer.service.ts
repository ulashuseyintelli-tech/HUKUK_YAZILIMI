import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  BankSettlementEvidence,
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettlementVerifierAuthorizationService } from './settlement-verifier-authorization.service';

export const BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION =
  'BANK_SETTLEMENT_EVIDENCE_APPENDED' as const;

export interface AppendHumanSettlementEvidenceInput {
  readonly trustedTenantId: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly source: BankSettlementEvidenceSource;
  readonly outcome: BankSettlementEvidenceOutcome;
  readonly evidenceReference: string;
  readonly evidenceHash: string;
  readonly observedAt: Date;
}

export interface AppendHumanSettlementEvidenceResult {
  readonly status: 'CREATED' | 'REPLAYED';
  readonly evidence: BankSettlementEvidence;
}

interface NormalizedHumanSettlementEvidence {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly source: typeof BankSettlementEvidenceSource.SETTLEMENT_VERIFIER;
  readonly outcome: BankSettlementEvidenceOutcome;
  readonly evidenceReference: string;
  readonly evidenceHash: string;
  readonly observedAt: Date;
}

/**
 * W2.2C-4 immutable human settlement-evidence append boundary.
 *
 * Evidence append is deliberately separate from BankTransaction finality
 * projection and candidate transition. This writer creates only one immutable
 * evidence row plus its transaction-bound audit record.
 */
@Injectable()
export class BankSettlementEvidenceWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: SettlementVerifierAuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async appendHumanEvidence(
    input: AppendHumanSettlementEvidenceInput,
  ): Promise<AppendHumanSettlementEvidenceResult> {
    const normalized = normalizeHumanEvidence(input);

    await this.authorization.assertAuthorized({
      trustedTenantId: normalized.tenantId,
      actorUserId: normalized.actorUserId,
    });

    const existing = await this.findReplay(normalized.tenantId, normalized.idempotencyKey);
    if (existing) {
      return replayOrConflict(existing, normalized);
    }

    try {
      const evidence = await this.prisma.$transaction(async (tx) => {
        const created = await tx.bankSettlementEvidence.create({
          data: {
            tenantId: normalized.tenantId,
            idempotencyKey: normalized.idempotencyKey,
            source: normalized.source,
            outcome: normalized.outcome,
            evidenceReference: normalized.evidenceReference,
            evidenceHash: normalized.evidenceHash,
            actorId: normalized.actorUserId,
            observedAt: normalized.observedAt,
            recordedAt: new Date(),
          },
        });

        await this.auditService.logInTransaction(tx, {
          tenantId: normalized.tenantId,
          action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
          entityType: 'BANK_SETTLEMENT_EVIDENCE',
          entityId: created.id,
          userId: normalized.actorUserId,
          description: 'Bank settlement evidence appended.',
          metadata: {
            idempotencyKey: normalized.idempotencyKey,
            source: normalized.source,
            outcome: normalized.outcome,
            evidenceReference: normalized.evidenceReference,
            evidenceHash: normalized.evidenceHash,
            observedAt: normalized.observedAt.toISOString(),
          },
        });

        return created;
      });

      return { status: 'CREATED', evidence };
    } catch (error) {
      if (!isIdempotencyRace(error)) throw error;

      const raced = await this.findReplay(normalized.tenantId, normalized.idempotencyKey);
      if (!raced) throw error;
      return replayOrConflict(raced, normalized);
    }
  }

  private findReplay(tenantId: string, idempotencyKey: string) {
    return this.prisma.bankSettlementEvidence.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
    });
  }
}

function normalizeHumanEvidence(
  input: AppendHumanSettlementEvidenceInput,
): NormalizedHumanSettlementEvidence {
  const tenantId = requiredText(
    input.trustedTenantId,
    'BANK_SETTLEMENT_EVIDENCE_TENANT_REQUIRED',
  );
  const actorUserId = requiredText(
    input.actorUserId,
    'BANK_SETTLEMENT_EVIDENCE_ACTOR_REQUIRED',
  );
  const idempotencyKey = requiredText(
    input.idempotencyKey,
    'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_KEY_REQUIRED',
  );
  const evidenceReference = requiredText(
    input.evidenceReference,
    'BANK_SETTLEMENT_EVIDENCE_REFERENCE_REQUIRED',
  );
  const evidenceHash = requiredText(
    input.evidenceHash,
    'BANK_SETTLEMENT_EVIDENCE_HASH_REQUIRED',
  );

  if (input.source !== BankSettlementEvidenceSource.SETTLEMENT_VERIFIER) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_PROVIDER_EVIDENCE_DEFERRED',
    });
  }
  if (
    input.outcome !== BankSettlementEvidenceOutcome.SETTLED &&
    input.outcome !== BankSettlementEvidenceOutcome.REJECTED
  ) {
    throw new BadRequestException({
      code: 'BANK_SETTLEMENT_EVIDENCE_OUTCOME_INVALID',
    });
  }
  if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) {
    throw new BadRequestException({
      code: 'BANK_SETTLEMENT_EVIDENCE_OBSERVED_AT_INVALID',
    });
  }

  return {
    tenantId,
    actorUserId,
    idempotencyKey,
    source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
    outcome: input.outcome,
    evidenceReference,
    evidenceHash,
    observedAt: new Date(input.observedAt.getTime()),
  };
}

function replayOrConflict(
  existing: BankSettlementEvidence,
  expected: NormalizedHumanSettlementEvidence,
): AppendHumanSettlementEvidenceResult {
  const samePayload =
    existing.source === expected.source &&
    existing.outcome === expected.outcome &&
    existing.evidenceReference === expected.evidenceReference &&
    existing.evidenceHash === expected.evidenceHash &&
    existing.actorId === expected.actorUserId &&
    existing.observedAt.getTime() === expected.observedAt.getTime() &&
    existing.supersedesEvidenceId === null;

  if (!samePayload) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_CONFLICT',
    });
  }

  return { status: 'REPLAYED', evidence: existing };
}

function requiredText(value: string, code: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException({ code });
  }
  return normalized;
}

function isIdempotencyRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
