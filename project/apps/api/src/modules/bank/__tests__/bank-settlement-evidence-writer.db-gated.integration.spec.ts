import { PrismaClient } from '@prisma/client';
import {
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  PermissionGrantEffect,
  PermissionGrantScope,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import {
  BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
  BankSettlementEvidenceWriterService,
} from '../bank-settlement-evidence-writer.service';
import {
  SETTLEMENT_VERIFY_PERMISSION_KEY,
  SettlementVerifierAuthorizationService,
} from '../settlement-verifier-authorization.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('W2.2C-4 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

interface Fixture {
  tenantId: string;
  actorUserId: string;
  bankTransactionId: string;
  service: BankSettlementEvidenceWriterService;
}

describeWithDisposableDb(
  'W2.2C-4 immutable settlement evidence append - disposable DB',
  () => {
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
      const tenantId = `w2c4-${label}-${suffix}`;
      const actorUserId = `w2c4-actor-${suffix}`;

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `W2.2C-4 ${label}`,
          slug: `w2c4-${label}-${suffix}`,
        },
      });
      await prisma.user.create({
        data: {
          id: actorUserId,
          tenantId,
          email: `w2c4-${label}-${suffix}@example.test`,
          name: 'Settlement',
          surname: 'Verifier',
        },
      });
      await prisma.lawyer.create({
        data: {
          tenantId,
          userId: actorUserId,
          name: 'Settlement',
          surname: 'Verifier',
        },
      });
      await prisma.permissionGrant.create({
        data: {
          tenantId,
          subjectUserId: actorUserId,
          permissionKey: SETTLEMENT_VERIFY_PERMISSION_KEY,
          effect: PermissionGrantEffect.ALLOW,
          scope: PermissionGrantScope.GLOBAL,
          grantedByUserId: actorUserId,
        },
      });
      const account = await prisma.bankAccount.create({
        data: {
          tenantId,
          bankCode: 'TEST',
          bankName: 'Disposable Test Bank',
          iban: `TR${suffix.replace(/-/g, '').slice(0, 24)}`,
          ownerType: 'TENANT',
          ownerName: 'W2.2C-4 Tenant',
        },
      });
      const transaction = await prisma.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: account.id,
          transactionDate: new Date('2026-07-18T10:00:00.000Z'),
          amount: 100,
          transactionType: 'INCOMING',
          candidateStatus: 'PENDING',
        },
      });

      return {
        tenantId,
        actorUserId,
        bankTransactionId: transaction.id,
        service: new BankSettlementEvidenceWriterService(
          prisma as never,
          new SettlementVerifierAuthorizationService(prisma as never),
          new AuditService(prisma as never),
        ),
      };
    }

    function appendInput(fixture: Fixture, idempotencyKey: string) {
      return {
        trustedTenantId: fixture.tenantId,
        actorUserId: fixture.actorUserId,
        idempotencyKey,
        source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
        outcome: BankSettlementEvidenceOutcome.SETTLED,
        evidenceReference: `reference:${idempotencyKey}`,
        evidenceHash: `hash:${idempotencyKey}`,
        observedAt: new Date('2026-07-18T11:00:00.000Z'),
      };
    }

    async function financialSnapshot(tenantId: string) {
      const [
        collections,
        journals,
        ledgerEntries,
        ledgerAllocations,
        collectionAllocations,
        overpayments,
        events,
        outbox,
      ] = await Promise.all([
        prisma.collection.count({ where: { tenantId } }),
        prisma.accountingJournalEntry.count({ where: { tenantId } }),
        prisma.ledgerEntry.count({ where: { tenantId } }),
        prisma.ledgerAllocation.count({
          where: { ledgerEntry: { tenantId } },
        }),
        prisma.collectionAllocation.count({
          where: { collection: { tenantId } },
        }),
        prisma.collectionOverpayment.count({ where: { tenantId } }),
        prisma.icrabotTimelineEntry.count({ where: { tenantId } }),
        prisma.icrabotOutboxAction.count({ where: { tenantId } }),
      ]);

      return {
        collections,
        journals,
        ledgerEntries,
        ledgerAllocations,
        collectionAllocations,
        overpayments,
        events,
        outbox,
      };
    }

    it('persists one evidence + audit and replays the same payload without another write', async () => {
      const fixture = await createFixture('replay');
      const input = appendInput(fixture, `same-${randomUUID()}`);
      const candidateBefore = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      });
      const financialBefore = await financialSnapshot(fixture.tenantId);

      const created = await fixture.service.appendHumanEvidence(input);
      const replayed = await fixture.service.appendHumanEvidence(input);

      expect(created.status).toBe('CREATED');
      expect(replayed).toMatchObject({
        status: 'REPLAYED',
        evidence: { id: created.evidence.id },
      });
      await expect(
        prisma.bankSettlementEvidence.count({
          where: {
            tenantId: fixture.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        }),
      ).resolves.toBe(1);
      const audits = await prisma.auditLog.findMany({
        where: {
          tenantId: fixture.tenantId,
          action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
        },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata).toEqual({
        idempotencyKey: input.idempotencyKey,
        source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
        outcome: BankSettlementEvidenceOutcome.SETTLED,
        evidenceReference: input.evidenceReference,
        evidenceHash: input.evidenceHash,
        observedAt: input.observedAt.toISOString(),
      });
      expect(await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      })).toEqual(candidateBefore);
      expect(await financialSnapshot(fixture.tenantId)).toEqual(financialBefore);
    });

    it('serializes concurrent same-key replay to one evidence and one audit', async () => {
      const fixture = await createFixture('concurrent');
      const input = appendInput(fixture, `concurrent-${randomUUID()}`);

      const [first, second] = await Promise.all([
        fixture.service.appendHumanEvidence(input),
        fixture.service.appendHumanEvidence(input),
      ]);

      expect(first.evidence.id).toBe(second.evidence.id);
      expect([first.status, second.status].sort()).toEqual(['CREATED', 'REPLAYED']);
      await expect(
        prisma.bankSettlementEvidence.count({
          where: { tenantId: fixture.tenantId, idempotencyKey: input.idempotencyKey },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(1);
    });

    it('scopes the same idempotency key independently per trusted tenant', async () => {
      const firstFixture = await createFixture('tenant-a');
      const secondFixture = await createFixture('tenant-b');
      const sharedKey = `shared-${randomUUID()}`;

      const [first, second] = await Promise.all([
        firstFixture.service.appendHumanEvidence(appendInput(firstFixture, sharedKey)),
        secondFixture.service.appendHumanEvidence(appendInput(secondFixture, sharedKey)),
      ]);

      expect(first.status).toBe('CREATED');
      expect(second.status).toBe('CREATED');
      expect(first.evidence.id).not.toBe(second.evidence.id);
      await expect(
        prisma.bankSettlementEvidence.count({
          where: { idempotencyKey: sharedKey },
        }),
      ).resolves.toBe(2);
      expect(first.evidence.tenantId).toBe(firstFixture.tenantId);
      expect(second.evidence.tenantId).toBe(secondFixture.tenantId);
    });

    it('fails closed for same-key different-payload without a second evidence or audit', async () => {
      const fixture = await createFixture('conflict');
      const input = appendInput(fixture, `conflict-${randomUUID()}`);
      await fixture.service.appendHumanEvidence(input);

      await expect(
        fixture.service.appendHumanEvidence({
          ...input,
          outcome: BankSettlementEvidenceOutcome.REJECTED,
        }),
      ).rejects.toMatchObject({
        response: { code: 'BANK_SETTLEMENT_EVIDENCE_IDEMPOTENCY_CONFLICT' },
      });
      await expect(
        prisma.bankSettlementEvidence.count({
          where: { tenantId: fixture.tenantId, idempotencyKey: input.idempotencyKey },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(1);
    });

    it('rolls evidence back when transaction-bound audit fails and changes no other row', async () => {
      const fixture = await createFixture('rollback');
      const idempotencyKey = `rollback-${randomUUID()}`;
      const candidateBefore = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      });
      const financialBefore = await financialSnapshot(fixture.tenantId);
      const service = new BankSettlementEvidenceWriterService(
        prisma as never,
        new SettlementVerifierAuthorizationService(prisma as never),
        {
          logInTransaction: jest
            .fn()
            .mockRejectedValue(new Error('FORCED_SETTLEMENT_AUDIT_FAILURE')),
        } as never,
      );

      await expect(
        service.appendHumanEvidence(appendInput(fixture, idempotencyKey)),
      ).rejects.toThrow('FORCED_SETTLEMENT_AUDIT_FAILURE');
      await expect(
        prisma.bankSettlementEvidence.count({
          where: { tenantId: fixture.tenantId, idempotencyKey },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_SETTLEMENT_EVIDENCE_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(0);
      expect(await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      })).toEqual(candidateBefore);
      expect(await financialSnapshot(fixture.tenantId)).toEqual(financialBefore);
    });
  },
);
