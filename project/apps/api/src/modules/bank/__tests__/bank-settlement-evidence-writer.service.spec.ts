import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  Prisma,
} from '@prisma/client';
import {
  BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
  BankSettlementEvidenceWriterService,
} from '../bank-settlement-evidence-writer.service';

const OBSERVED_AT = new Date('2026-07-18T12:00:00.000Z');
const RECORDED_AT = new Date('2026-07-18T12:01:00.000Z');

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
    recordedAt: RECORDED_AT,
    supersedesEvidenceId: null,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    trustedTenantId: 'tenant-1',
    actorUserId: 'actor-1',
    idempotencyKey: 'settlement-key-1',
    source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
    outcome: BankSettlementEvidenceOutcome.SETTLED,
    evidenceReference: 'document-ref-1',
    evidenceHash: 'evidence-hash-1',
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function build(existing: unknown = null) {
  const created = evidence();
  const tx = {
    bankSettlementEvidence: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(created),
    },
    bankTransaction: { update: jest.fn() },
    collection: { create: jest.fn() },
    accountingJournalEntry: { create: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    ledgerAllocation: { create: jest.fn() },
    collectionAllocation: { create: jest.fn() },
    collectionOverpayment: { create: jest.fn() },
    icrabotTimelineEntry: { create: jest.fn() },
    icrabotOutboxAction: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const authorization = {
    assertAuthorized: jest.fn().mockResolvedValue(undefined),
  };
  const audit = {
    logInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BankSettlementEvidenceWriterService(
    prisma as never,
    authorization as never,
    audit as never,
  );

  return { service, prisma, authorization, audit, tx, created };
}

describe('W2.2C-4 BankSettlementEvidenceWriterService', () => {
  it('appends one human evidence row and one allowlist-only audit in the same transaction', async () => {
    const { service, prisma, authorization, audit, tx, created } = build();

    await expect(service.appendHumanEvidence(input())).resolves.toEqual({
      status: 'CREATED',
      evidence: created,
    });

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        trustedTenantId: 'tenant-1',
        actorUserId: 'actor-1',
      },
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.bankSettlementEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        idempotencyKey: 'settlement-key-1',
        source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
        outcome: BankSettlementEvidenceOutcome.SETTLED,
        evidenceReference: 'document-ref-1',
        evidenceHash: 'evidence-hash-1',
        actorId: 'actor-1',
        observedAt: OBSERVED_AT,
      }),
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      tx,
      {
        tenantId: 'tenant-1',
        action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
        entityType: 'BANK_SETTLEMENT_EVIDENCE',
        entityId: 'evidence-1',
        userId: 'actor-1',
        description: 'Bank settlement evidence appended.',
        metadata: {
          idempotencyKey: 'settlement-key-1',
          source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
          outcome: BankSettlementEvidenceOutcome.SETTLED,
          evidenceReference: 'document-ref-1',
          evidenceHash: 'evidence-hash-1',
          observedAt: OBSERVED_AT.toISOString(),
        },
      },
    );
    expect(audit.logInTransaction.mock.calls[0][1].metadata).not.toHaveProperty(
      'rawPayload',
    );
    expect(audit.logInTransaction.mock.calls[0][1].metadata).not.toHaveProperty(
      'iban',
    );
    expect(audit.logInTransaction.mock.calls[0][1].metadata).not.toHaveProperty(
      'description',
    );
  });

  it('returns the existing row for same-key same-payload replay without write or audit', async () => {
    const existing = evidence();
    const { service, prisma, audit, tx } = build(existing);

    await expect(service.appendHumanEvidence(input())).resolves.toEqual({
      status: 'REPLAYED',
      evidence: existing,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.bankSettlementEvidence.create).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed for same-key different-payload replay without write or audit', async () => {
    const { service, prisma, audit, tx } = build(
      evidence({ outcome: BankSettlementEvidenceOutcome.REJECTED }),
    );

    await expect(service.appendHumanEvidence(input())).rejects.toMatchObject({
      response: { code: 'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_CONFLICT' },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.bankSettlementEvidence.create).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('resolves a concurrent unique race as a side-effect-free replay', async () => {
    const raced = evidence();
    const { service, prisma, audit, tx } = build();
    tx.bankSettlementEvidence.findUnique.mockResolvedValue(raced);
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique race', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(service.appendHumanEvidence(input())).resolves.toEqual({
      status: 'REPLAYED',
      evidence: raced,
    });
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when the authorization boundary rejects the actor', async () => {
    const { service, prisma, authorization, audit, tx } = build();
    authorization.assertAuthorized.mockRejectedValueOnce(
      new ForbiddenException({ code: 'SETTLEMENT_VERIFIER_PERMISSION_REQUIRED' }),
    );

    await expect(service.appendHumanEvidence(input())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.bankSettlementEvidence.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('keeps provider evidence fail-closed and deferred', async () => {
    const { service, prisma, authorization, audit } = build();

    await expect(
      service.appendHumanEvidence(
        input({
          source: BankSettlementEvidenceSource.VALIDATED_PROVIDER_ATTESTATION,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(authorization.assertAuthorized).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('never mutates a candidate, Collection, or financial/event record', async () => {
    const { service, tx } = build();

    await service.appendHumanEvidence(input());

    expect(tx.bankTransaction.update).not.toHaveBeenCalled();
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
