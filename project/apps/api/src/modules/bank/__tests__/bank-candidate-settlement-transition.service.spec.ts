import { ForbiddenException } from '@nestjs/common';
import {
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  BankTransactionCandidateStatus,
} from '@prisma/client';
import {
  BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
  BankCandidateSettlementTransitionService,
} from '../bank-candidate-settlement-transition.service';

const OBSERVED_AT = new Date('2026-07-18T12:00:00.000Z');

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evidence-1',
    tenantId: 'tenant-1',
    idempotencyKey: 'settlement-key-1',
    source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
    outcome: BankSettlementEvidenceOutcome.SETTLED,
    evidenceReference: 'document-ref-1',
    evidenceHash: 'evidence-hash-1',
    actorId: 'actor-1',
    observedAt: OBSERVED_AT,
    recordedAt: new Date('2026-07-18T12:01:00.000Z'),
    supersedesEvidenceId: null,
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transaction-1',
    tenantId: 'tenant-1',
    bankAccountId: 'account-1',
    transactionDate: new Date('2026-07-18T10:00:00.000Z'),
    valueDate: null,
    amount: 100,
    currency: 'TRY',
    transactionType: 'INCOMING',
    candidateStatus: BankTransactionCandidateStatus.PENDING,
    externalSettledAt: null,
    settlementEvidenceId: null,
    counterpartyName: null,
    counterpartyIban: null,
    counterpartyBank: null,
    description: null,
    referenceNo: null,
    bankReferenceId: null,
    isMatched: false,
    matchedCaseId: null,
    matchedCollectionId: null,
    matchedAt: null,
    matchedById: null,
    rawData: null,
    createdAt: new Date('2026-07-18T10:01:00.000Z'),
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    trustedTenantId: 'tenant-1',
    actorUserId: 'actor-1',
    transactionId: 'transaction-1',
    settlementEvidenceId: 'evidence-1',
    idempotencyKey: 'settlement-key-1',
    ...overrides,
  };
}

function build(options: {
  evidence?: unknown;
  candidates?: unknown[];
  updateCount?: number;
} = {}) {
  const evidenceRow = options.evidence ?? evidence();
  const candidates = options.candidates ?? [candidate()];
  const tx = {
    bankSettlementEvidence: {
      findUnique: jest.fn().mockResolvedValue(evidenceRow),
    },
    bankTransaction: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
    collection: { create: jest.fn() },
    accountingJournalEntry: { create: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    ledgerAllocation: { create: jest.fn() },
    collectionAllocation: { create: jest.fn() },
    collectionOverpayment: { create: jest.fn() },
    icrabotTimelineEntry: { create: jest.fn() },
    icrabotOutboxAction: { create: jest.fn() },
  };
  for (const row of candidates) {
    tx.bankTransaction.findFirst.mockResolvedValueOnce(row);
  }
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    bankTransaction: {
      findFirst: jest.fn(),
    },
    bankSettlementEvidence: {
      findUnique: jest.fn(),
    },
  };
  const authorization = {
    assertAuthorized: jest.fn().mockResolvedValue(undefined),
  };
  const audit = {
    logInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BankCandidateSettlementTransitionService(
    prisma as never,
    authorization as never,
    audit as never,
  );

  return { service, prisma, authorization, audit, tx };
}

describe('W2.2C-5 BankCandidateSettlementTransitionService', () => {
  it('projects SETTLED evidence through a tenant-scoped PENDING CAS and one allowlist audit', async () => {
    const { service, authorization, audit, tx } = build();

    await expect(service.transition(input())).resolves.toEqual({
      status: 'TRANSITIONED',
      candidate: {
        id: 'transaction-1',
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: 'evidence-1',
        externalSettledAt: OBSERVED_AT,
      },
    });

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        trustedTenantId: 'tenant-1',
        actorUserId: 'actor-1',
      },
      tx,
    );
    expect(tx.bankSettlementEvidence.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_id: {
          tenantId: 'tenant-1',
          id: 'evidence-1',
        },
      },
    });
    expect(tx.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'transaction-1',
        tenantId: 'tenant-1',
        transactionType: 'INCOMING',
        candidateStatus: BankTransactionCandidateStatus.PENDING,
        settlementEvidenceId: null,
        externalSettledAt: null,
      },
      data: {
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: 'evidence-1',
        externalSettledAt: OBSERVED_AT,
      },
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, {
      tenantId: 'tenant-1',
      action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
      entityType: 'BANK_TRANSACTION',
      entityId: 'transaction-1',
      userId: 'actor-1',
      description: 'Bank candidate settlement status transitioned.',
      metadata: {
        idempotencyKey: 'settlement-key-1',
        evidenceId: 'evidence-1',
        evidenceSource: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
        evidenceOutcome: BankSettlementEvidenceOutcome.SETTLED,
        fromStatus: BankTransactionCandidateStatus.PENDING,
        toStatus: BankTransactionCandidateStatus.SETTLED,
        externalSettledAt: OBSERVED_AT.toISOString(),
      },
    });
    const metadata = audit.logInTransaction.mock.calls[0][1].metadata;
    expect(metadata).not.toHaveProperty('evidenceReference');
    expect(metadata).not.toHaveProperty('evidenceHash');
    expect(metadata).not.toHaveProperty('rawPayload');
    expect(metadata).not.toHaveProperty('iban');
    expect(metadata).not.toHaveProperty('description');
  });

  it('projects REJECTED evidence without a settlement timestamp', async () => {
    const { service, audit, tx } = build({
      evidence: evidence({ outcome: BankSettlementEvidenceOutcome.REJECTED }),
    });

    await expect(service.transition(input())).resolves.toMatchObject({
      status: 'TRANSITIONED',
      candidate: {
        candidateStatus: BankTransactionCandidateStatus.REJECTED,
        externalSettledAt: null,
      },
    });
    expect(tx.bankTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          candidateStatus: BankTransactionCandidateStatus.REJECTED,
          settlementEvidenceId: 'evidence-1',
          externalSettledAt: null,
        },
      }),
    );
    expect(audit.logInTransaction.mock.calls[0][1].metadata).toMatchObject({
      evidenceOutcome: BankSettlementEvidenceOutcome.REJECTED,
      toStatus: BankTransactionCandidateStatus.REJECTED,
      externalSettledAt: null,
    });
  });

  it('returns an exact terminal projection replay without another update or audit', async () => {
    const { service, audit, tx } = build({
      candidates: [
        candidate({
          candidateStatus: BankTransactionCandidateStatus.SETTLED,
          settlementEvidenceId: 'evidence-1',
          externalSettledAt: OBSERVED_AT,
        }),
      ],
    });

    await expect(service.transition(input())).resolves.toMatchObject({
      status: 'REPLAYED',
      candidate: {
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: 'evidence-1',
      },
    });
    expect(tx.bankTransaction.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('resolves a lost same-evidence CAS race as a side-effect-free replay', async () => {
    const { service, audit, tx } = build({
      candidates: [
        candidate(),
        candidate({
          candidateStatus: BankTransactionCandidateStatus.SETTLED,
          settlementEvidenceId: 'evidence-1',
          externalSettledAt: OBSERVED_AT,
        }),
      ],
      updateCount: 0,
    });

    await expect(service.transition(input())).resolves.toMatchObject({
      status: 'REPLAYED',
    });
    expect(tx.bankTransaction.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'legacy NULL',
      row: candidate({ candidateStatus: null }),
      code: 'BANK_SETTLEMENT_CANDIDATE_STATUS_UNKNOWN',
    },
    {
      label: 'OUTGOING',
      row: candidate({
        transactionType: 'OUTGOING',
        candidateStatus: BankTransactionCandidateStatus.PENDING,
      }),
      code: 'BANK_SETTLEMENT_CANDIDATE_DIRECTION_UNSUPPORTED',
    },
    {
      label: 'OUTGOING replay-shaped terminal state',
      row: candidate({
        transactionType: 'OUTGOING',
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: 'evidence-1',
        externalSettledAt: OBSERVED_AT,
      }),
      code: 'BANK_SETTLEMENT_CANDIDATE_DIRECTION_UNSUPPORTED',
    },
    {
      label: 'terminal state with different evidence',
      row: candidate({
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: 'evidence-other',
        externalSettledAt: OBSERVED_AT,
      }),
      code: 'BANK_SETTLEMENT_CANDIDATE_TRANSITION_CONFLICT',
    },
  ])('fails closed for $label without update or audit', async ({ row, code }) => {
    const { service, audit, tx } = build({ candidates: [row] });

    await expect(service.transition(input())).rejects.toMatchObject({
      response: { code },
    });
    expect(tx.bankTransaction.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed for an evidence idempotency mismatch before candidate access', async () => {
    const { service, audit, tx } = build();

    await expect(
      service.transition(input({ idempotencyKey: 'different-key' })),
    ).rejects.toMatchObject({
      response: { code: 'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_CONFLICT' },
    });
    expect(tx.bankTransaction.findFirst).not.toHaveBeenCalled();
    expect(tx.bankTransaction.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when the verifier authorization boundary rejects the actor', async () => {
    const { service, prisma, authorization, audit, tx } = build();
    authorization.assertAuthorized.mockRejectedValueOnce(
      new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_PERMISSION_REQUIRED' }),
    );

    await expect(service.transition(input())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.bankSettlementEvidence.findUnique).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('never writes a Collection, journal, event, outbox, ledger, allocation, or overpayment', async () => {
    const { service, tx } = build();

    await service.transition(input());

    expect(tx.collection.create).not.toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.ledgerAllocation.create).not.toHaveBeenCalled();
    expect(tx.collectionAllocation.create).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    expect(tx.icrabotTimelineEntry.create).not.toHaveBeenCalled();
    expect(tx.icrabotOutboxAction.create).not.toHaveBeenCalled();
  });
});
