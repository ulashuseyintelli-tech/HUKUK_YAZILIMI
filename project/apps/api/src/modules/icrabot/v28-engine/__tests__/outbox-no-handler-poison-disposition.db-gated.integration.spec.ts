/**
 * W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01 — runtime dogrulama.
 *
 * DB-free unit (outbox-no-handler-poison-disposition.spec.ts) terminal kapatmayi
 * mock seviyesinde kanitlar. Bu dosya AYNI invariant'i GERCEK Postgres + GERCEK
 * ActionHandlerService/OutboxService ile, gercek bir Tenant/Client/Case kullanarak
 * dogrular (fixture-building convention W3-F01/W3-F02'den izlenir):
 *
 *   A. Bilinmeyen action tipi tek dispatch'te 'dead' olur (NO_REGISTERED_HANDLER).
 *   B. AYNI satir IKINCI kez dispatch edilirse (poison'un kendisi cron'da tekrar
 *      bulunmus gibi) satir zaten terminal oldugu icin claim basarisiz olur —
 *      TEKRAR dead-letter yazilmaz (idempotent), ve en onemlisi: getPendingActions()
 *      bu satiri BIR DAHA ASLA dondurmez (sonsuz-pending deseni gercekten kirildi).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../../test/test-db-env';
import { ActionHandlerService } from '../action-handler.service';
import { OutboxService } from '../outbox.service';
import { TimelineService } from '../timeline.service';
import { FactStoreService } from '../factstore.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'W3-F05 no-handler poison runtime gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('W3-F05 — handler-siz action gercek Postgres uzerinde terminal kapatilir', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildTenantWithCase(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-w3f05-${label}-${suffix}`;
    await prisma.tenant.create({
      data: { id: tenantId, name: `W3-F05 Test ${label}`, slug: `test-w3f05-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'W3-F05 Test Müvekkil', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-W3F05-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        isAutoMode: false,
        workflowStage: 'PAYMENT_ORDER' as any,
      },
    });
    return { tenantId, caseId: caseRow.id };
  }

  function buildRealActionHandler() {
    return new ActionHandlerService(
      prisma as any,
      new OutboxService(prisma as any),
      new TimelineService(prisma as any),
      new FactStoreService(prisma as any),
    );
  }

  async function createOutboxRow(params: { caseId: string; tenantId: string; actionType: string }) {
    const row = await (prisma as any).icrabotOutboxAction.create({
      data: {
        caseId: params.caseId,
        tenantId: params.tenantId,
        actionType: params.actionType,
        idempotencyKey: `w3f05-${randomUUID()}`,
        payload: { note: 'w3-f05 runtime matrix' },
        status: 'pending',
        attemptCount: 0,
      },
    });
    return row.id as string;
  }

  it('A. bilinmeyen action tipi tek dispatch te terminal (dead) olur, NO_REGISTERED_HANDLER', async () => {
    const { tenantId, caseId } = await buildTenantWithCase('a');
    const svc = buildRealActionHandler();
    const actionId = await createOutboxRow({ caseId, tenantId, actionType: 'EVENT_PUBLISHED:NEVER_REGISTERED_TYPE' });

    const result = await svc.dispatch(actionId, { kind: 'platform' } as const);

    expect(result).toEqual(expect.objectContaining({ success: false, deadLettered: true, error: 'NO_REGISTERED_HANDLER' }));

    const row = await (prisma as any).icrabotOutboxAction.findUnique({ where: { id: actionId } });
    expect(row.status).toBe('dead');
    expect(row.lastError).toEqual(
      expect.objectContaining({ reasonCode: 'NO_REGISTERED_HANDLER', actionType: 'EVENT_PUBLISHED:NEVER_REGISTERED_TYPE' }),
    );
  });

  it('B. dead-lettered poison satiri getPendingActions() tarafindan BIR DAHA ASLA dondurulmez; ikinci dispatch idempotent kalir', async () => {
    const { tenantId, caseId } = await buildTenantWithCase('b');
    const svc = buildRealActionHandler();
    const outbox = new OutboxService(prisma as any);
    const actionId = await createOutboxRow({ caseId, tenantId, actionType: 'EVENT_PUBLISHED:ANOTHER_UNREGISTERED_TYPE' });

    await svc.dispatch(actionId, { kind: 'platform' } as const);

    // "Sonsuz pending" deseni gercekten kirildi mi? — cron'un gercekten kullandigi
    // sorgu (getPendingActions) bu satiri BIR DAHA getirmemeli.
    const stillPending = await outbox.getPendingActions({ kind: 'platform' } as const, 100);
    expect(stillPending.some((r: any) => r.id === actionId)).toBe(false);

    // Ikinci dispatch cagrisi (orn. eski bir in-flight cron batch'i) idempotent —
    // satir zaten terminal oldugu icin claim basarisiz olur, TEKRAR dead-letter
    // yazilmaz (lastError/updatedAt degismez).
    const before = await (prisma as any).icrabotOutboxAction.findUnique({ where: { id: actionId } });
    const secondResult = await svc.dispatch(actionId, { kind: 'platform' } as const);
    const after = await (prisma as any).icrabotOutboxAction.findUnique({ where: { id: actionId } });

    expect(secondResult).toEqual(expect.objectContaining({ success: false, skipped: true }));
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });
});
