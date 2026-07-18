import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BankSettlementEvidence,
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  BankTransaction,
  BankTransactionCandidateStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettlementVerifierAuthorizationService } from './settlement-verifier-authorization.service';

export const BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION =
  'BANK_CANDIDATE_SETTLEMENT_TRANSITIONED' as const;

export interface TransitionBankCandidateSettlementInput {
  readonly trustedTenantId: string;
  readonly actorUserId: string;
  readonly transactionId: string;
  readonly settlementEvidenceId: string;
  readonly idempotencyKey: string;
}

export interface BankCandidateSettlementProjection {
  readonly id: string;
  readonly candidateStatus:
    | typeof BankTransactionCandidateStatus.SETTLED
    | typeof BankTransactionCandidateStatus.REJECTED;
  readonly settlementEvidenceId: string;
  readonly externalSettledAt: Date | null;
}

export interface TransitionBankCandidateSettlementResult {
  readonly status: 'TRANSITIONED' | 'REPLAYED';
  readonly candidate: BankCandidateSettlementProjection;
}

interface NormalizedTransitionInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly transactionId: string;
  readonly settlementEvidenceId: string;
  readonly idempotencyKey: string;
}

interface TransitionTarget {
  readonly status:
    | typeof BankTransactionCandidateStatus.SETTLED
    | typeof BankTransactionCandidateStatus.REJECTED;
  readonly externalSettledAt: Date | null;
}

/**
 * W2.2C-5 candidate-finality projection boundary.
 *
 * This service consumes one immutable, tenant-scoped human settlement evidence
 * record and performs only the BankTransaction PENDING -> terminal CAS plus its
 * transaction-bound audit. It deliberately creates no Collection or financial
 * record.
 */
@Injectable()
export class BankCandidateSettlementTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: SettlementVerifierAuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async transition(
    input: TransitionBankCandidateSettlementInput,
  ): Promise<TransitionBankCandidateSettlementResult> {
    const normalized = normalizeTransitionInput(input);

    await this.authorization.assertAuthorized({
      trustedTenantId: normalized.tenantId,
      actorUserId: normalized.actorUserId,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const evidence = await tx.bankSettlementEvidence.findUnique({
          where: {
            tenantId_id: {
              tenantId: normalized.tenantId,
              id: normalized.settlementEvidenceId,
            },
          },
        });
        assertUsableEvidence(evidence, normalized);

        const target = transitionTarget(evidence);
        const candidate = await tx.bankTransaction.findFirst({
          where: {
            id: normalized.transactionId,
            tenantId: normalized.tenantId,
          },
        });
        if (!candidate) {
          throw new NotFoundException({
            code: 'BANK_SETTLEMENT_CANDIDATE_NOT_FOUND',
          });
        }
        assertIncomingCandidate(candidate);

        const replay = replayProjection(candidate, evidence, target);
        if (replay) {
          return { status: 'REPLAYED' as const, candidate: replay };
        }
        assertPendingCandidate(candidate);

        const updated = await tx.bankTransaction.updateMany({
          where: {
            id: normalized.transactionId,
            tenantId: normalized.tenantId,
            transactionType: 'INCOMING',
            candidateStatus: BankTransactionCandidateStatus.PENDING,
            settlementEvidenceId: null,
            externalSettledAt: null,
          },
          data: {
            candidateStatus: target.status,
            settlementEvidenceId: evidence.id,
            externalSettledAt: target.externalSettledAt,
          },
        });

        if (updated.count === 0) {
          const raced = await tx.bankTransaction.findFirst({
            where: {
              id: normalized.transactionId,
              tenantId: normalized.tenantId,
            },
          });
          if (!raced) {
            throw new NotFoundException({
              code: 'BANK_SETTLEMENT_CANDIDATE_NOT_FOUND',
            });
          }
          const racedReplay = replayProjection(raced, evidence, target);
          if (racedReplay) {
            return { status: 'REPLAYED' as const, candidate: racedReplay };
          }
          throw transitionConflict();
        }

        await this.auditService.logInTransaction(tx, {
          tenantId: normalized.tenantId,
          action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          entityType: 'BANK_TRANSACTION',
          entityId: normalized.transactionId,
          userId: normalized.actorUserId,
          description: 'Bank candidate settlement status transitioned.',
          metadata: {
            idempotencyKey: evidence.idempotencyKey,
            evidenceId: evidence.id,
            evidenceSource: evidence.source,
            evidenceOutcome: evidence.outcome,
            fromStatus: BankTransactionCandidateStatus.PENDING,
            toStatus: target.status,
            externalSettledAt: target.externalSettledAt?.toISOString() ?? null,
          },
        });

        return {
          status: 'TRANSITIONED' as const,
          candidate: {
            id: normalized.transactionId,
            candidateStatus: target.status,
            settlementEvidenceId: evidence.id,
            externalSettledAt: target.externalSettledAt,
          },
        };
      });
    } catch (error) {
      if (!isUniqueRace(error)) throw error;

      const consumed = await this.prisma.bankTransaction.findFirst({
        where: {
          tenantId: normalized.tenantId,
          settlementEvidenceId: normalized.settlementEvidenceId,
        },
      });
      if (!consumed) throw error;
      if (consumed?.id === normalized.transactionId) {
        const evidence = await this.prisma.bankSettlementEvidence.findUnique({
          where: {
            tenantId_id: {
              tenantId: normalized.tenantId,
              id: normalized.settlementEvidenceId,
            },
          },
        });
        if (evidence) {
          const target = transitionTarget(evidence);
          const replay = replayProjection(consumed, evidence, target);
          if (replay) {
            return { status: 'REPLAYED', candidate: replay };
          }
        }
      }
      throw new ConflictException({
        code: 'BANK_SETTLEMENT_EVIDENCE_ALREADY_CONSUMED',
      });
    }
  }
}

function normalizeTransitionInput(
  input: TransitionBankCandidateSettlementInput,
): NormalizedTransitionInput {
  return {
    tenantId: requiredText(
      input.trustedTenantId,
      'BANK_SETTLEMENT_TRANSITION_TENANT_REQUIRED',
    ),
    actorUserId: requiredText(
      input.actorUserId,
      'BANK_SETTLEMENT_TRANSITION_ACTOR_REQUIRED',
    ),
    transactionId: requiredText(
      input.transactionId,
      'BANK_SETTLEMENT_TRANSITION_TRANSACTION_REQUIRED',
    ),
    settlementEvidenceId: requiredText(
      input.settlementEvidenceId,
      'BANK_SETTLEMENT_TRANSITION_EVIDENCE_REQUIRED',
    ),
    idempotencyKey: requiredText(
      input.idempotencyKey,
      'BANK_SETTLEMENT_TRANSITION_IDEMPOTENCY_KEY_REQUIRED',
    ),
  };
}

function assertUsableEvidence(
  evidence: BankSettlementEvidence | null,
  input: NormalizedTransitionInput,
): asserts evidence is BankSettlementEvidence {
  if (!evidence) {
    throw new NotFoundException({
      code: 'BANK_SETTLEMENT_EVIDENCE_NOT_FOUND',
    });
  }
  if (evidence.idempotencyKey !== input.idempotencyKey) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_CONFLICT',
    });
  }
  if (evidence.source !== BankSettlementEvidenceSource.SETTLEMENT_VERIFIER) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_PROVIDER_EVIDENCE_DEFERRED',
    });
  }
  if (
    evidence.outcome !== BankSettlementEvidenceOutcome.SETTLED &&
    evidence.outcome !== BankSettlementEvidenceOutcome.REJECTED
  ) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_EVIDENCE_OUTCOME_INVALID',
    });
  }
}

function transitionTarget(evidence: BankSettlementEvidence): TransitionTarget {
  if (evidence.outcome === BankSettlementEvidenceOutcome.SETTLED) {
    return {
      status: BankTransactionCandidateStatus.SETTLED,
      externalSettledAt: new Date(evidence.observedAt.getTime()),
    };
  }
  return {
    status: BankTransactionCandidateStatus.REJECTED,
    externalSettledAt: null,
  };
}

function assertPendingCandidate(candidate: BankTransaction): void {
  if (candidate.candidateStatus === null) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_CANDIDATE_STATUS_UNKNOWN',
    });
  }
  if (candidate.candidateStatus !== BankTransactionCandidateStatus.PENDING) {
    throw transitionConflict();
  }
  if (
    candidate.settlementEvidenceId !== null ||
    candidate.externalSettledAt !== null
  ) {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_CANDIDATE_PROJECTION_CONFLICT',
    });
  }
}

function assertIncomingCandidate(candidate: BankTransaction): void {
  if (candidate.transactionType !== 'INCOMING') {
    throw new ConflictException({
      code: 'BANK_SETTLEMENT_CANDIDATE_DIRECTION_UNSUPPORTED',
    });
  }
}

function replayProjection(
  candidate: BankTransaction,
  evidence: BankSettlementEvidence,
  target: TransitionTarget,
): BankCandidateSettlementProjection | null {
  const sameStatus = candidate.candidateStatus === target.status;
  const sameEvidence = candidate.settlementEvidenceId === evidence.id;
  const sameTime =
    target.externalSettledAt === null
      ? candidate.externalSettledAt === null
      : candidate.externalSettledAt?.getTime() === target.externalSettledAt.getTime();

  if (!sameStatus || !sameEvidence || !sameTime) return null;

  return {
    id: candidate.id,
    candidateStatus: target.status,
    settlementEvidenceId: evidence.id,
    externalSettledAt: target.externalSettledAt,
  };
}

function transitionConflict(): ConflictException {
  return new ConflictException({
    code: 'BANK_SETTLEMENT_CANDIDATE_TRANSITION_CONFLICT',
  });
}

function requiredText(value: string, code: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException({ code });
  }
  return normalized;
}

function isUniqueRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
