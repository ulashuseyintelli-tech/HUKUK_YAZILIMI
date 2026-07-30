/**
 * W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01 — Runtime representative matrix (brief §16).
 *
 * DB-free unit (outbox-consumer-tenant-ownership.spec.ts) resolveOutboxActionOwnership +
 * dispatch() gate'ini mock seviyesinde tam kanitlar. Bu dosya AYNI invariant'lari GERCEK
 * Postgres uzerinde, GERCEK ActionHandlerService/OutboxService/TimelineService ile,
 * iki GERCEK tenant + iki GERCEK Case kullanarak dogrular (fixture-building convention
 * service-occurrence-recorded-consumer.db-gated.integration.spec.ts'ten izlenir).
 *
 * Senaryolar (brief §16 A-G):
 *   A. same-tenant happy          -> handler 1 kez, effect +1, action done
 *   B. tenant mismatch            -> handler 0, effect +0, action dead, timeline +0
 *   C. duplicate mismatch (retry) -> ikinci dispatch handler'i TEKRAR cagirmaz
 *   D. stale-claim mismatch       -> stale 'sent' claim recovery sonrasi mismatch AYNI reddedilir
 *   E. replay mismatch (DLQ)      -> dead-letter sonrasi manuel pending-replay AYNI reddedilir
 *   F. missing resource           -> caseId hic yok -> RESOURCE_NOT_FOUND, effect +0
 *   G. transient lookup failure   -> Case sorgusu tek seferlik hata -> markFailed/retry, dead DEGIL
 *
 * Production DB kullanilmaz; TEST_DATABASE_URL disposable Postgres'e isaret eder.
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
    'W3-F02 runtime matrix disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('W3-F02 — outbox consumer tenant ownership, runtime representative matrix (A-G)', () => {
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
    const tenantId = `test-w3f02-${label}-${suffix}`;
    await prisma.tenant.create({
      data: { id: tenantId, name: `W3-F02 Test ${label}`, slug: `test-w3f02-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'W3-F02 Test Müvekkil', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-W3F02-${randomUUID().slice(0, 6)}`,
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

  async function createOutboxRow(params: { caseId: string; tenantId: string; actionType?: string }) {
    const row = await (prisma as any).icrabotOutboxAction.create({
      data: {
        caseId: params.caseId,
        tenantId: params.tenantId,
        actionType: params.actionType ?? 'send_notification',
        idempotencyKey: `w3f02-${randomUUID()}`,
        payload: { type: 'info', recipient: 'all', title: 'W3-F02', message: 'runtime matrix' },
        status: 'pending',
        attemptCount: 0,
      },
    });
    return row.id as string;
  }

  async function notificationCount(caseId: string): Promise<number> {
    return (prisma as any).icrabotNotification.count({ where: { caseId } });
  }

  async function timelineCount(caseId: string): Promise<number> {
    return (prisma as any).icrabotTimelineEntry.count({ where: { caseId } });
  }

  async function readAction(actionId: string) {
    return (prisma as any).icrabotOutboxAction.findUnique({ where: { id: actionId } });
  }

  it('A. SAME-TENANT happy: handler cagrilir, effect +1, action done', async () => {
    const { tenantId, caseId } = await buildTenantWithCase('a');
    const handler = buildRealActionHandler();
    const actionId = await createOutboxRow({ caseId, tenantId });

    const before = await notificationCount(caseId);
    const result = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const after = await notificationCount(caseId);

    expect(result.success).toBe(true);
    expect(after - before).toBe(1);
    expect((await readAction(actionId)).status).toBe('done');
    expect(await timelineCount(caseId)).toBeGreaterThan(0);
  });

  it('B. TENANT MISMATCH: handler cagrilmaz, effect +0, action dead, timeline +0, reason=TENANT_MISMATCH', async () => {
    const owner = await buildTenantWithCase('b-owner');
    const attacker = await buildTenantWithCase('b-attacker');
    const handler = buildRealActionHandler();
    // Attacker tenant'inin outbox satiri, OWNER'in case'ini hedefliyor.
    const actionId = await createOutboxRow({ caseId: owner.caseId, tenantId: attacker.tenantId });

    const beforeOwner = await notificationCount(owner.caseId);
    const beforeOwnerTimeline = await timelineCount(owner.caseId);
    const result = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const afterOwner = await notificationCount(owner.caseId);

    expect(result.success).toBe(false);
    expect(result.deadLettered).toBe(true);
    expect(result.error).toBe('TENANT_MISMATCH');
    expect(afterOwner - beforeOwner).toBe(0); // effect delta 0
    expect(await timelineCount(owner.caseId)).toBe(beforeOwnerTimeline); // timeline delta 0

    const action = await readAction(actionId);
    expect(action.status).toBe('dead');
    expect(action.lastError).toMatchObject({
      reasonCode: 'TENANT_MISMATCH',
      securityRelevant: true,
      declaredTenantId: attacker.tenantId,
      resourceType: 'Case',
      resourceId: owner.caseId,
    });
  });

  it('C. DUPLICATE/REPLAY sonrasi mismatch action: ikinci dispatch handler i TEKRAR cagirmaz', async () => {
    const owner = await buildTenantWithCase('c-owner');
    const attacker = await buildTenantWithCase('c-attacker');
    const handler = buildRealActionHandler();
    const actionId = await createOutboxRow({ caseId: owner.caseId, tenantId: attacker.tenantId });

    const first = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const beforeSecond = await notificationCount(owner.caseId);
    const second = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const afterSecond = await notificationCount(owner.caseId);

    expect(first.deadLettered).toBe(true);
    expect(second.skipped).toBe(true); // claim basarisiz — status zaten 'dead'
    expect(afterSecond - beforeSecond).toBe(0);
  });

  it('D. STALE-CLAIM recovery sonrasi mismatch AYNI sekilde reddedilir', async () => {
    const owner = await buildTenantWithCase('d-owner');
    const attacker = await buildTenantWithCase('d-attacker');
    const handler = buildRealActionHandler();
    const outbox = new OutboxService(prisma as any);
    const actionId = await createOutboxRow({ caseId: owner.caseId, tenantId: attacker.tenantId });

    // Stale claim simulasyonu: satiri 'sent' yap, updatedAt'i gecmise cek.
    await (prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: { status: 'sent', updatedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await outbox.recoverStaleProcessingActions();
    const recovered = await readAction(actionId);
    expect(['pending', 'failed']).toContain(recovered.status); // recovery basarili

    const beforeOwner = await notificationCount(owner.caseId);
    const result = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const afterOwner = await notificationCount(owner.caseId);

    expect(result.error).toBe('TENANT_MISMATCH');
    expect(afterOwner - beforeOwner).toBe(0);
    expect((await readAction(actionId)).status).toBe('dead');
  });

  it('E. REPLAY/DLQ: dead-letter sonrasi manuel pending-replay AYNI sekilde reddedilir', async () => {
    const owner = await buildTenantWithCase('e-owner');
    const attacker = await buildTenantWithCase('e-attacker');
    const handler = buildRealActionHandler();
    const actionId = await createOutboxRow({ caseId: owner.caseId, tenantId: attacker.tenantId });

    await handler.dispatch(actionId, { kind: 'platform' } as const);
    expect((await readAction(actionId)).status).toBe('dead');

    // DLQ/manuel replay: satir 'pending'e geri alinir (retryDeadAction benzeri operasyon).
    await (prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: { status: 'pending', attemptCount: 0 },
    });

    const beforeOwner = await notificationCount(owner.caseId);
    const replayed = await handler.dispatch(actionId, { kind: 'platform' } as const);
    const afterOwner = await notificationCount(owner.caseId);

    expect(replayed.error).toBe('TENANT_MISMATCH');
    expect(afterOwner - beforeOwner).toBe(0);
  });

  it('F. MISSING RESOURCE: caseId hic yok -> RESOURCE_NOT_FOUND, effect +0, securityRelevant:false', async () => {
    const attacker = await buildTenantWithCase('f-attacker');
    const handler = buildRealActionHandler();
    const ghostCaseId = `ghost-${randomUUID()}`;
    const actionId = await createOutboxRow({ caseId: ghostCaseId, tenantId: attacker.tenantId });

    const result = await handler.dispatch(actionId, { kind: 'platform' } as const);

    expect(result.error).toBe('RESOURCE_NOT_FOUND');
    expect(result.deadLettered).toBe(true);
    const action = await readAction(actionId);
    expect(action.status).toBe('dead');
    expect(action.lastError).toMatchObject({ reasonCode: 'RESOURCE_NOT_FOUND', securityRelevant: false });
  });

  it('G. TRANSIENT lookup hatasi: tek seferlik Case sorgu hatasi markFailed/retry yoluna gider, dead DEGIL', async () => {
    const owner = await buildTenantWithCase('g-owner');
    const actionId = await createOutboxRow({ caseId: owner.caseId, tenantId: owner.tenantId });

    // Gercek prisma'yi SARMALAYAN bir proxy: yalniz case.findUnique'in ILK cagrisi
    // reddedilir (transient DB hatasi simulasyonu), geri kalan TUM modeller gercek
    // client'a AYNEN delege edilir.
    let callCount = 0;
    const wrapped = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === 'case') {
          const realCase = Reflect.get(target, prop, receiver);
          return {
            ...realCase,
            findUnique: async (...args: any[]) => {
              callCount += 1;
              if (callCount === 1) throw new Error('simulated transient connection error');
              return (realCase.findUnique as any)(...args);
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const handler = new ActionHandlerService(
      wrapped as any,
      new OutboxService(prisma as any),
      new TimelineService(prisma as any),
      new FactStoreService(prisma as any),
    );

    const result = await handler.dispatch(actionId, { kind: 'platform' } as const);

    expect(result.deadLettered).toBe(false);
    expect(result.retryScheduled).toBe(true);
    expect(result.error).toBe('simulated transient connection error');
    const action = await readAction(actionId);
    expect(action.status).toBe('failed'); // dead DEGIL — retry icin acik birakildi
    expect(callCount).toBe(1);
  });
});
