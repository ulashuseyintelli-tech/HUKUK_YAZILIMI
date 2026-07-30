import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CollectionService } from '../../collection/collection.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import {
  BANK_COLLECTION_ADMISSION_AUDIT_ACTION,
  BankService,
} from '../bank.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('W2.2D-3 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

interface Fixture {
  tenantId: string;
  caseId: string;
  otherCaseId: string;
  transactionId: string;
}

describeWithDisposableDb('W2.2D-3 bank match + Collection admission atomicity', () => {
  jest.setTimeout(90_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createFixture(label: string): Promise<Fixture> {
    const suffix = randomUUID();
    const tenantId = `w2d3-${label}-${suffix}`;
    await prisma.tenant.create({
      data: { id: tenantId, name: `W2.2D-3 ${label}`, slug: tenantId },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'Atomicity Client', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `W2D3-${suffix.slice(0, 8)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    const otherCase = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `W2D3-OTHER-${suffix.slice(0, 8)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
      },
    });
    const account = await prisma.bankAccount.create({
      data: {
        tenantId,
        bankCode: 'TEST',
        bankName: 'Atomicity Test Bank',
        iban: `TR${suffix.replace(/-/g, '').slice(0, 24)}`,
        ownerType: 'TENANT',
        ownerName: 'Atomicity Tenant',
      },
    });
    const observedAt = new Date('2026-07-30T09:30:00.000Z');
    const evidence = await prisma.bankSettlementEvidence.create({
      data: {
        tenantId,
        idempotencyKey: `evidence-${suffix}`,
        source: 'SETTLEMENT_VERIFIER',
        outcome: 'SETTLED',
        evidenceReference: `human-verification:${suffix}`,
        evidenceHash: 'a'.repeat(64),
        actorId: `actor-${suffix}`,
        observedAt,
        recordedAt: new Date('2026-07-30T09:31:00.000Z'),
      },
    });
    const transaction = await prisma.bankTransaction.create({
      data: {
        tenantId,
        bankAccountId: account.id,
        transactionDate: new Date('2026-07-30T09:00:00.000Z'),
        valueDate: new Date('2026-07-30T09:00:00.000Z'),
        amount: 500,
        currency: 'TRY',
        transactionType: 'INCOMING',
        candidateStatus: 'SETTLED',
        externalSettledAt: observedAt,
        settlementEvidenceId: evidence.id,
        referenceNo: `REF-${suffix}`,
        bankReferenceId: `BANK-${suffix}`,
      },
    });
    return {
      tenantId,
      caseId: caseRow.id,
      otherCaseId: otherCase.id,
      transactionId: transaction.id,
    };
  }

  function buildService(
    client: PrismaClient,
    options: {
      ingest?: DomainEventIngestService;
      bankAudit?: AuditService;
    } = {},
  ) {
    const collection = new CollectionService(
      client as any,
      options.ingest ?? new DomainEventIngestService(),
      new CaseDebtorLifecycleGuardService(client as any),
    );
    return new BankService(
      {} as any,
      client as any,
      collection,
      options.bankAudit ?? new AuditService(client as any),
    );
  }

  async function snapshot(fixture: Fixture) {
    const [
      transaction,
      collections,
      journals,
      events,
      outbox,
      audits,
    ] = await Promise.all([
      prisma.bankTransaction.findUniqueOrThrow({ where: { id: fixture.transactionId } }),
      prisma.collection.count({ where: { tenantId: fixture.tenantId } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantId } }),
      (prisma as any).icrabotTimelineEntry.count({ where: { tenantId: fixture.tenantId } }),
      (prisma as any).icrabotOutboxAction.count({ where: { tenantId: fixture.tenantId } }),
      prisma.auditLog.count({ where: { tenantId: fixture.tenantId } }),
    ]);
    return {
      matched: transaction.isMatched,
      matchedCaseId: transaction.matchedCaseId,
      matchedCollectionId: transaction.matchedCollectionId,
      collections,
      journals,
      events,
      outbox,
      audits,
    };
  }

  it('Collection, journal, event/outbox, audits and bank projection commit together; retry is write-free', async () => {
    const fixture = await createFixture('success');
    const service = buildService(prisma);

    const first = await service.matchTransaction(
      fixture.transactionId,
      fixture.caseId,
      'actor-1',
      fixture.tenantId,
      'corr-success',
    );
    const afterFirst = await snapshot(fixture);
    expect(first.collection).toMatchObject({
      id: afterFirst.matchedCollectionId,
      caseId: fixture.caseId,
      sourceType: 'BANK_INTEGRATION',
      sourceId: fixture.transactionId,
    });
    expect(afterFirst).toMatchObject({
      matched: true,
      matchedCaseId: fixture.caseId,
      collections: 1,
      journals: 1,
      events: 1,
      outbox: 1,
      audits: 2,
    });
    const matchAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: fixture.tenantId,
        action: BANK_COLLECTION_ADMISSION_AUDIT_ACTION,
      },
    });
    expect(matchAudit).toMatchObject({
      entityId: fixture.transactionId,
      userId: 'actor-1',
      correlationId: 'corr-success',
      metadata: {
        bankTransactionId: fixture.transactionId,
        collectionId: first.collection.id,
        caseId: fixture.caseId,
        fromBankStatus: 'SETTLED',
        toBankStatus: 'SETTLED',
        fromMatchState: 'UNMATCHED',
        toMatchState: 'MATCHED',
        amount: '500',
        currency: 'TRY',
        operationId: 'corr-success',
      },
    });

    await expect(
      service.matchTransaction(
        fixture.transactionId,
        fixture.caseId,
        'actor-1',
        fixture.tenantId,
        'corr-retry',
      ),
    ).resolves.toMatchObject({ collection: { id: first.collection.id } });
    expect(await snapshot(fixture)).toEqual(afterFirst);
  });

  it('bank projection failure rolls the complete Collection side-effect chain back', async () => {
    const fixture = await createFixture('projection-rollback');
    const faultClient = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await faultClient.$connect();
    faultClient.$use(async (params, next) => {
      if (params.model === 'BankTransaction' && params.action === 'updateMany') {
        throw new Error('FORCED_BANK_PROJECTION_FAILURE');
      }
      return next(params);
    });

    try {
      await expect(
        buildService(faultClient).matchTransaction(
          fixture.transactionId,
          fixture.caseId,
          'actor-1',
          fixture.tenantId,
        ),
      ).rejects.toThrow('FORCED_BANK_PROJECTION_FAILURE');
      expect(await snapshot(fixture)).toEqual({
        matched: false,
        matchedCaseId: null,
        matchedCollectionId: null,
        collections: 0,
        journals: 0,
        events: 0,
        outbox: 0,
        audits: 0,
      });
    } finally {
      await faultClient.$disconnect();
    }
  });

  it('event/outbox failure rolls Collection and bank projection back', async () => {
    const fixture = await createFixture('event-rollback');
    const ingest = {
      appendInTransaction: jest.fn(async () => {
        throw new Error('FORCED_EVENT_OUTBOX_FAILURE');
      }),
    } as unknown as DomainEventIngestService;

    await expect(
      buildService(prisma, { ingest }).matchTransaction(
        fixture.transactionId,
        fixture.caseId,
        'actor-1',
        fixture.tenantId,
      ),
    ).rejects.toThrow('FORCED_EVENT_OUTBOX_FAILURE');
    expect(await snapshot(fixture)).toEqual({
      matched: false,
      matchedCaseId: null,
      matchedCollectionId: null,
      collections: 0,
      journals: 0,
      events: 0,
      outbox: 0,
      audits: 0,
    });
  });

  it('transaction-bound bank audit failure rolls every prior write back', async () => {
    const fixture = await createFixture('audit-rollback');
    const bankAudit = {
      logInTransaction: jest.fn(async () => {
        throw new Error('FORCED_BANK_AUDIT_FAILURE');
      }),
    } as unknown as AuditService;

    await expect(
      buildService(prisma, { bankAudit }).matchTransaction(
        fixture.transactionId,
        fixture.caseId,
        'actor-1',
        fixture.tenantId,
      ),
    ).rejects.toThrow('FORCED_BANK_AUDIT_FAILURE');
    expect(await snapshot(fixture)).toEqual({
      matched: false,
      matchedCaseId: null,
      matchedCollectionId: null,
      collections: 0,
      journals: 0,
      events: 0,
      outbox: 0,
      audits: 0,
    });
  });

  it('concurrent same-target retries serialize to one Collection and one match audit', async () => {
    const fixture = await createFixture('concurrency');
    const firstClient = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    const secondClient = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);

    try {
      const [first, second] = await Promise.all([
        buildService(firstClient).matchTransaction(
          fixture.transactionId,
          fixture.caseId,
          'actor-1',
          fixture.tenantId,
          'corr-concurrent-1',
        ),
        buildService(secondClient).matchTransaction(
          fixture.transactionId,
          fixture.caseId,
          'actor-1',
          fixture.tenantId,
          'corr-concurrent-2',
        ),
      ]);
      expect(first.collection.id).toBe(second.collection.id);
      expect(await snapshot(fixture)).toMatchObject({
        matched: true,
        matchedCaseId: fixture.caseId,
        collections: 1,
        journals: 1,
        events: 1,
        outbox: 1,
        audits: 2,
      });
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
    }
  });

  it('legacy partial state with an existing canonical Collection is replayed and linked without duplicate writes', async () => {
    const fixture = await createFixture('partial-recovery');
    const transaction = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id: fixture.transactionId },
    });
    const collectionService = new CollectionService(
      prisma as any,
      new DomainEventIngestService(),
      new CaseDebtorLifecycleGuardService(prisma as any),
    );
    const existing = await collectionService.create(
      fixture.tenantId,
      {
        caseId: fixture.caseId,
        idempotencyKey: `bank-transaction:${fixture.transactionId}`,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        type: 'BANK_TRANSFER',
        channel: 'BANKA',
        date: transaction.transactionDate.toISOString(),
        valueDate: transaction.valueDate?.toISOString(),
        sourceType: 'BANK_INTEGRATION',
        sourceId: fixture.transactionId,
        description: `Banka hareketi: ${transaction.description || transaction.referenceNo || ''}`,
        receiptNo: transaction.referenceNo || undefined,
      } as any,
      'actor-1',
      {
        producer: 'BANK_TRANSACTION_MATCH',
        causationId: `bank-transaction:${fixture.transactionId}`,
        actor: { type: 'HUMAN', userId: 'actor-1' },
      },
    );
    const partial = await snapshot(fixture);
    expect(partial).toMatchObject({
      matched: false,
      collections: 1,
      journals: 1,
      events: 1,
      outbox: 1,
      audits: 1,
    });

    const recovered = await buildService(prisma).matchTransaction(
      fixture.transactionId,
      fixture.caseId,
      'actor-1',
      fixture.tenantId,
    );
    expect(recovered.collection.id).toBe(existing.id);
    expect(await snapshot(fixture)).toMatchObject({
      matched: true,
      matchedCollectionId: existing.id,
      collections: 1,
      journals: 1,
      events: 1,
      outbox: 1,
      audits: 2,
    });
  });

  it('same candidate cannot be redirected to a different target case', async () => {
    const fixture = await createFixture('target-conflict');
    const service = buildService(prisma);
    await service.matchTransaction(
      fixture.transactionId,
      fixture.caseId,
      'actor-1',
      fixture.tenantId,
    );
    const beforeConflict = await snapshot(fixture);

    await expect(
      service.matchTransaction(
        fixture.transactionId,
        fixture.otherCaseId,
        'actor-1',
        fixture.tenantId,
      ),
    ).rejects.toMatchObject({ response: { code: 'BANK_TRANSACTION_ALREADY_MATCHED' } });
    expect(await snapshot(fixture)).toEqual(beforeConflict);
  });
});
