import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  RECEIPT_AUTHORIZATION_SURFACES,
  ReceiptObjectScopeAuthorizationService,
} from '../receipt-object-scope-authorization.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'RCV-P2-WS03-P03 DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('RCV-P2-WS03-P03 authorization no-write evidence - disposable PostgreSQL', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaClient;
  const tenantIds = new Set<string>();
  const tokens = {
    isSecretConfigured: jest.fn().mockReturnValue(true),
    issue: jest.fn().mockResolvedValue({
      token: 'go.confirm.v1.payload.signature',
      expiresAt: '2030-01-01T00:00:00.000Z',
      bindingHash: 'binding-hash',
      nonce: 'nonce-1',
      auditRef: 'nonce-1',
    }),
    consume: jest.fn().mockResolvedValue({ ok: true, result: 'CONSUMED' }),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId } });
      await prisma.icrabotTimelineEntry.deleteMany({ where: { tenantId } });
      await prisma.accountingJournalLine.deleteMany({ where: { tenantId } });
      await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
      await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
      await prisma.collection.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  async function createFixture(label: string, assigned: boolean) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-rcv-p03-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({
      data: { id: tenantId, name: `RCV P03 ${label}`, slug: tenantId },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `${label}-${suffix}@example.test`,
        name: 'Receipt',
        surname: 'Actor',
      },
    });
    const lawyer = await prisma.lawyer.create({
      data: {
        tenantId,
        userId: user.id,
        name: 'Receipt',
        surname: 'Actor',
      },
    });
    const legalCase = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `RCV-P03-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
      },
    });
    if (assigned) {
      await prisma.caseLawyer.create({
        data: { caseId: legalCase.id, lawyerId: lawyer.id },
      });
    }
    return { tenantId, userId: user.id, caseId: legalCase.id };
  }

  async function financialCounts(tenantId: string) {
    const [collections, ledgerEntries, ledgerAllocations, journals, timeline, outbox] =
      await Promise.all([
        prisma.collection.count({ where: { tenantId } }),
        prisma.ledgerEntry.count({ where: { tenantId } }),
        prisma.ledgerAllocation.count({ where: { ledgerEntry: { tenantId } } }),
        prisma.accountingJournalEntry.count({ where: { tenantId } }),
        prisma.icrabotTimelineEntry.count({ where: { tenantId } }),
        prisma.icrabotOutboxAction.count({ where: { tenantId } }),
      ]);
    return { collections, ledgerEntries, ledgerAllocations, journals, timeline, outbox };
  }

  function input(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return {
      tenantId: fixture.tenantId,
      actorUserId: fixture.userId,
      caseId: fixture.caseId,
      surface: RECEIPT_AUTHORIZATION_SURFACES.COLLECTIONS,
      payload: { caseId: fixture.caseId, amount: 100, idempotencyKey: 'idem-1' },
    } as const;
  }

  it('allows an assigned HUMAN without producing any financial mutation', async () => {
    const fixture = await createFixture('allow', true);
    const service = new ReceiptObjectScopeAuthorizationService(prisma as any, tokens as any);

    await expect(service.authorize(input(fixture))).resolves.toEqual({ kind: 'ALLOW' });
    await expect(financialCounts(fixture.tenantId)).resolves.toEqual({
      collections: 0,
      ledgerEntries: 0,
      ledgerAllocations: 0,
      journals: 0,
      timeline: 0,
      outbox: 0,
    });
  });

  it('returns CONFIRM_REQUIRED for a non-member and leaves every financial surface unchanged', async () => {
    const fixture = await createFixture('confirm', false);
    const service = new ReceiptObjectScopeAuthorizationService(prisma as any, tokens as any);

    await expect(service.authorize(input(fixture))).resolves.toMatchObject({
      kind: 'ENVELOPE',
      envelope: { outcome: 'CONFIRM_REQUIRED' },
    });
    await expect(financialCounts(fixture.tenantId)).resolves.toEqual({
      collections: 0,
      ledgerEntries: 0,
      ledgerAllocations: 0,
      journals: 0,
      timeline: 0,
      outbox: 0,
    });
  });

  it('rejects a cross-tenant actor and leaves every financial surface unchanged', async () => {
    const target = await createFixture('target', false);
    const foreign = await createFixture('foreign', true);
    const service = new ReceiptObjectScopeAuthorizationService(prisma as any, tokens as any);

    await expect(
      service.authorize({ ...input(target), actorUserId: foreign.userId }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(financialCounts(target.tenantId)).resolves.toEqual({
      collections: 0,
      ledgerEntries: 0,
      ledgerAllocations: 0,
      journals: 0,
      timeline: 0,
      outbox: 0,
    });
  });

  it('fails closed when tenant-scoped case resolution fails and leaves every financial surface unchanged', async () => {
    const fixture = await createFixture('missing-case', true);
    const service = new ReceiptObjectScopeAuthorizationService(prisma as any, tokens as any);

    await expect(
      service.authorize({ ...input(fixture), caseId: 'missing-case-id' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(financialCounts(fixture.tenantId)).resolves.toEqual({
      collections: 0,
      ledgerEntries: 0,
      ledgerAllocations: 0,
      journals: 0,
      timeline: 0,
      outbox: 0,
    });
  });
});
