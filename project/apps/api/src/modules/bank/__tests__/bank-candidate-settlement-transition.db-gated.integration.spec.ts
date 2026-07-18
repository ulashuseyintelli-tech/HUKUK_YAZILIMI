import {
  BankSettlementEvidence,
  BankSettlementEvidenceOutcome,
  BankSettlementEvidenceSource,
  BankTransactionCandidateStatus,
  PermissionGrantEffect,
  PermissionGrantScope,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import {
  BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
  BankCandidateSettlementTransitionService,
} from '../bank-candidate-settlement-transition.service';
import { BankSettlementEvidenceWriterService } from '../bank-settlement-evidence-writer.service';
import {
  SETTLEMENT_VERIFY_PERMISSION_KEY,
  SettlementVerifierAuthorizationService,
} from '../settlement-verifier-authorization.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('W2.2C-5 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

interface Fixture {
  tenantId: string;
  actorUserId: string;
  bankAccountId: string;
  bankTransactionId: string;
  evidenceWriter: BankSettlementEvidenceWriterService;
  transitionService: BankCandidateSettlementTransitionService;
}

describeWithDisposableDb(
  'W2.2C-5 candidate CAS transition - disposable PostgreSQL',
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

    async function createFixture(
      label: string,
      candidate: {
        transactionType?: string;
        candidateStatus?: BankTransactionCandidateStatus | null;
      } = {},
    ): Promise<Fixture> {
      const suffix = randomUUID();
      const tenantId = `w2c5-${label}-${suffix}`;
      const actorUserId = `w2c5-actor-${suffix}`;

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `W2.2C-5 ${label}`,
          slug: `w2c5-${label}-${suffix}`,
        },
      });
      await prisma.user.create({
        data: {
          id: actorUserId,
          tenantId,
          email: `w2c5-${label}-${suffix}@example.test`,
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
          ownerName: 'W2.2C-5 Tenant',
        },
      });
      const transaction = await prisma.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: account.id,
          transactionDate: new Date('2026-07-18T10:00:00.000Z'),
          amount: 100,
          transactionType: candidate.transactionType ?? 'INCOMING',
          candidateStatus:
            candidate.candidateStatus === undefined
              ? BankTransactionCandidateStatus.PENDING
              : candidate.candidateStatus,
        },
      });
      const authorization = new SettlementVerifierAuthorizationService(
        prisma as never,
      );
      const audit = new AuditService(prisma as never);

      return {
        tenantId,
        actorUserId,
        bankAccountId: account.id,
        bankTransactionId: transaction.id,
        evidenceWriter: new BankSettlementEvidenceWriterService(
          prisma as never,
          authorization,
          audit,
        ),
        transitionService: new BankCandidateSettlementTransitionService(
          prisma as never,
          authorization,
          audit,
        ),
      };
    }

    async function appendEvidence(
      fixture: Fixture,
      outcome: BankSettlementEvidenceOutcome,
      label: string,
    ): Promise<BankSettlementEvidence> {
      const idempotencyKey = `${label}-${randomUUID()}`;
      const result = await fixture.evidenceWriter.appendHumanEvidence({
        trustedTenantId: fixture.tenantId,
        actorUserId: fixture.actorUserId,
        idempotencyKey,
        source: BankSettlementEvidenceSource.SETTLEMENT_VERIFIER,
        outcome,
        evidenceReference: `reference:${idempotencyKey}`,
        evidenceHash: `hash:${idempotencyKey}`,
        observedAt: new Date('2026-07-18T11:00:00.000Z'),
      });
      return result.evidence;
    }

    function transitionInput(fixture: Fixture, evidence: BankSettlementEvidence) {
      return {
        trustedTenantId: fixture.tenantId,
        actorUserId: fixture.actorUserId,
        transactionId: fixture.bankTransactionId,
        settlementEvidenceId: evidence.id,
        idempotencyKey: evidence.idempotencyKey,
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

    it('projects SETTLED evidence once, replays without another audit, and creates no financial write', async () => {
      const fixture = await createFixture('settled-replay');
      const evidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.SETTLED,
        'settled-replay',
      );
      const financialBefore = await financialSnapshot(fixture.tenantId);

      const transitioned = await fixture.transitionService.transition(
        transitionInput(fixture, evidence),
      );
      const replayed = await fixture.transitionService.transition(
        transitionInput(fixture, evidence),
      );

      expect(transitioned.status).toBe('TRANSITIONED');
      expect(replayed.status).toBe('REPLAYED');
      const candidate = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      });
      expect(candidate).toMatchObject({
        candidateStatus: BankTransactionCandidateStatus.SETTLED,
        settlementEvidenceId: evidence.id,
      });
      expect(candidate.externalSettledAt).toEqual(evidence.observedAt);
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(1);
      expect(await financialSnapshot(fixture.tenantId)).toEqual(financialBefore);
    });

    it('projects REJECTED evidence without externalSettledAt or financial writes', async () => {
      const fixture = await createFixture('rejected');
      const evidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.REJECTED,
        'rejected',
      );
      const financialBefore = await financialSnapshot(fixture.tenantId);

      await expect(
        fixture.transitionService.transition(transitionInput(fixture, evidence)),
      ).resolves.toMatchObject({
        status: 'TRANSITIONED',
        candidate: {
          candidateStatus: BankTransactionCandidateStatus.REJECTED,
          settlementEvidenceId: evidence.id,
          externalSettledAt: null,
        },
      });
      await expect(
        prisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransactionId },
        }),
      ).resolves.toMatchObject({
        candidateStatus: BankTransactionCandidateStatus.REJECTED,
        settlementEvidenceId: evidence.id,
        externalSettledAt: null,
      });
      expect(await financialSnapshot(fixture.tenantId)).toEqual(financialBefore);
    });

    it('serializes concurrent same-evidence replay to one transition and one audit', async () => {
      const fixture = await createFixture('concurrent-replay');
      const evidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.SETTLED,
        'concurrent-replay',
      );
      const input = transitionInput(fixture, evidence);

      const [first, second] = await Promise.all([
        fixture.transitionService.transition(input),
        fixture.transitionService.transition(input),
      ]);

      expect([first.status, second.status].sort()).toEqual([
        'REPLAYED',
        'TRANSITIONED',
      ]);
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(1);
    });

    it('allows exactly one winner for concurrent competing terminal outcomes', async () => {
      const fixture = await createFixture('concurrent-conflict');
      const settledEvidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.SETTLED,
        'competing-settled',
      );
      const rejectedEvidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.REJECTED,
        'competing-rejected',
      );

      const results = await Promise.allSettled([
        fixture.transitionService.transition(
          transitionInput(fixture, settledEvidence),
        ),
        fixture.transitionService.transition(
          transitionInput(fixture, rejectedEvidence),
        ),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const winner = results.find(
        (result): result is PromiseFulfilledResult<
          Awaited<ReturnType<BankCandidateSettlementTransitionService['transition']>>
        > => result.status === 'fulfilled',
      );
      expect(winner?.value.status).toBe('TRANSITIONED');
      const candidate = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.bankTransactionId },
      });
      expect(candidate.candidateStatus).toBe(winner?.value.candidate.candidateStatus);
      expect(candidate.settlementEvidenceId).toBe(
        winner?.value.candidate.settlementEvidenceId,
      );
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(1);
    });

    it('rejects cross-tenant evidence without changing either tenant', async () => {
      const first = await createFixture('tenant-a');
      const second = await createFixture('tenant-b');
      const secondEvidence = await appendEvidence(
        second,
        BankSettlementEvidenceOutcome.SETTLED,
        'tenant-b',
      );

      await expect(
        first.transitionService.transition({
          ...transitionInput(first, secondEvidence),
          settlementEvidenceId: secondEvidence.id,
          idempotencyKey: secondEvidence.idempotencyKey,
        }),
      ).rejects.toMatchObject({
        response: { code: 'BANK_SETTLEMENT_EVIDENCE_NOT_FOUND' },
      });
      await expect(
        prisma.bankTransaction.findUniqueOrThrow({
          where: { id: first.bankTransactionId },
        }),
      ).resolves.toMatchObject({
        candidateStatus: BankTransactionCandidateStatus.PENDING,
        settlementEvidenceId: null,
        externalSettledAt: null,
      });
      await expect(
        prisma.bankTransaction.findUniqueOrThrow({
          where: { id: second.bankTransactionId },
        }),
      ).resolves.toMatchObject({
        candidateStatus: BankTransactionCandidateStatus.PENDING,
        settlementEvidenceId: null,
        externalSettledAt: null,
      });
    });

    it.each([
      {
        label: 'legacy-null',
        candidate: { candidateStatus: null },
        code: 'BANK_SETTLEMENT_CANDIDATE_STATUS_UNKNOWN',
      },
      {
        label: 'outgoing',
        candidate: {
          transactionType: 'OUTGOING',
          candidateStatus: BankTransactionCandidateStatus.PENDING,
        },
        code: 'BANK_SETTLEMENT_CANDIDATE_DIRECTION_UNSUPPORTED',
      },
    ])('fails closed for $label candidate state', async ({ label, candidate, code }) => {
      const fixture = await createFixture(label, candidate);
      const evidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.SETTLED,
        label,
      );

      await expect(
        fixture.transitionService.transition(transitionInput(fixture, evidence)),
      ).rejects.toMatchObject({ response: { code } });
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(0);
    });

    it('rolls the CAS projection back when transaction-bound audit fails', async () => {
      const fixture = await createFixture('audit-rollback');
      const evidence = await appendEvidence(
        fixture,
        BankSettlementEvidenceOutcome.SETTLED,
        'audit-rollback',
      );
      const financialBefore = await financialSnapshot(fixture.tenantId);
      const service = new BankCandidateSettlementTransitionService(
        prisma as never,
        new SettlementVerifierAuthorizationService(prisma as never),
        {
          logInTransaction: jest
            .fn()
            .mockRejectedValue(new Error('FORCED_TRANSITION_AUDIT_FAILURE')),
        } as never,
      );

      await expect(
        service.transition(transitionInput(fixture, evidence)),
      ).rejects.toThrow('FORCED_TRANSITION_AUDIT_FAILURE');
      await expect(
        prisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransactionId },
        }),
      ).resolves.toMatchObject({
        candidateStatus: BankTransactionCandidateStatus.PENDING,
        settlementEvidenceId: null,
        externalSettledAt: null,
      });
      await expect(
        prisma.auditLog.count({
          where: {
            tenantId: fixture.tenantId,
            action: BANK_CANDIDATE_SETTLEMENT_TRANSITION_AUDIT_ACTION,
          },
        }),
      ).resolves.toBe(0);
      expect(await financialSnapshot(fixture.tenantId)).toEqual(financialBefore);
    });
  },
);
