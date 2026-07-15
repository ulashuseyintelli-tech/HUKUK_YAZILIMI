import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ClaimItemSourceIntegrityGuard } from '../claim-item-source-integrity.guard';
import { ClaimItemWriteGateService } from '../claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('RCV-P2-WS01-P04 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('RCV-P2-WS01-P04 source integrity - disposable PostgreSQL', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaClient;
  let router: ClaimItemWriterRouterService;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    router = new ClaimItemWriterRouterService(
      prisma as any,
      new ClaimItemWriteGateService(prisma as any),
    );
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  async function createDueFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-rcv-p04-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `RCV P04 ${label}`,
        slug: `test-rcv-p04-${label}-${suffix}`,
      },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `RCV-P04-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
      },
    });
    const due = await prisma.due.create({
      data: {
        caseId: caseRow.id,
        type: 'PRINCIPAL',
        amount: 100,
        dueDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    return { tenantId, caseId: caseRow.id, dueId: due.id };
  }

  function dueCreateInput(fixture: Awaited<ReturnType<typeof createDueFixture>>) {
    return {
      route: 'DUE_BRIDGE' as const,
      tenantId: fixture.tenantId,
      caseId: fixture.caseId,
      sourceId: fixture.dueId,
      initiatedByUserId: 'system-requester',
      currency: 'TRY',
      data: {
        tenantId: fixture.tenantId,
        caseId: fixture.caseId,
        itemType: 'PRINCIPAL',
        originalAmount: 100,
        demandedAmount: 100,
        collectedAmount: 0,
        amount: 100,
        currency: 'TRY',
        liableDebtorIds: [],
        metadata: { dueSync: { sourceDueId: fixture.dueId } },
      },
    };
  }

  it('serializes concurrent creates and persists exactly one ClaimItem per source identity', async () => {
    const fixture = await createDueFixture('concurrent');
    const results = await Promise.allSettled([
      router.createSystemClaimItem(dueCreateInput(fixture)),
      router.createSystemClaimItem(dueCreateInput(fixture)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ conflictCode: 'DUPLICATE_SOURCE_IDENTITY' });
    expect(await prisma.claimItem.count({ where: { caseId: fixture.caseId } })).toBe(1);
  });

  it('rejects a Due source owned by another case and tenant without writing', async () => {
    const target = await createDueFixture('target');
    const foreign = await createDueFixture('foreign');
    const input = dueCreateInput(target);

    await expect(router.createSystemClaimItem({
      ...input,
      sourceId: foreign.dueId,
      data: {
        ...input.data,
        metadata: { dueSync: { sourceDueId: foreign.dueId } },
      },
    })).rejects.toMatchObject({ conflictCode: 'SOURCE_SCOPE_MISMATCH' });

    expect(await prisma.claimItem.count({ where: { caseId: target.caseId } })).toBe(0);
  });

  it('serializes human and system writers that target the same document/item identity', async () => {
    const fixture = await createDueFixture('document-race');
    const document = await prisma.caseDocument.create({
      data: {
        caseId: fixture.caseId,
        documentType: 'OTHER',
        title: 'P04 source document',
        isSourceDocument: true,
      },
    });
    const baseData = {
      tenantId: fixture.tenantId,
      caseId: fixture.caseId,
      itemType: 'PRINCIPAL',
      originalAmount: 100,
      demandedAmount: 100,
      collectedAmount: 0,
      amount: 100,
      currency: 'TRY',
      liableDebtorIds: [],
      sourceDocumentId: document.id,
      sourceDocumentType: 'SOZLESME',
    };
    const humanGuard = new ClaimItemSourceIntegrityGuard();

    const results = await Promise.allSettled([
      router.createSystemClaimItem({
        route: 'DOCUMENT_AUTO_GENERATOR',
        tenantId: fixture.tenantId,
        caseId: fixture.caseId,
        sourceId: document.id,
        sourceSlot: 'SOZLESME:0:PRINCIPAL',
        initiatedByUserId: 'system-requester',
        data: baseData,
      }),
      prisma.$transaction(async (tx) => {
        const data = await humanGuard.prepareHumanDocumentCreate({
          tenantId: fixture.tenantId,
          caseId: fixture.caseId,
          data: baseData,
        }, tx);
        return tx.claimItem.create({ data: data as any });
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ conflictCode: 'DUPLICATE_SOURCE_IDENTITY' });
    expect(await prisma.claimItem.count({ where: { caseId: fixture.caseId } })).toBe(1);
  });
});
