/**
 * W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01 — runtime dogrulama.
 *
 * DB-free unit (outbox-webhook-handler-removed.spec.ts) 'webhook' handler'inin
 * kaldirildigini ve producer red'inin mock seviyesinde calistigini kanitlar. Bu
 * dosya AYNI invariant'i GERCEK Postgres uzerinde, GERCEK EngineRunnerService +
 * FactStoreService + TimelineService + OutboxService + ExpressionEvaluatorService
 * + ComputeRegistryService ile, gercek bir Tenant/Client/Case kullanarak dogrular
 * (fixture-building convention outbox-consumer-tenant-ownership.db-gated'ten izlenir).
 *
 * Kanitlanan: 'action: webhook' + kardes 'action: enqueue' iceren TEK bir kural
 * calistirildiginda — webhook icin outbox'a SIFIR satir yazilir, enqueue icin TAM
 * 1 satir yazilir (blast-radius containment gercek DB'de de gecerli), ve gercek
 * bir IcrabotTimelineEntry (severity:'critical') olusur.
 *
 * Production DB kullanilmaz; TEST_DATABASE_URL disposable Postgres'e isaret eder.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../../test/test-db-env';
import { EngineRunnerService, RuleDefinition } from '../engine-runner.service';
import { FactStoreService } from '../factstore.service';
import { TimelineService } from '../timeline.service';
import { OutboxService } from '../outbox.service';
import { ExpressionEvaluatorService } from '../expression-evaluator.service';
import { ComputeRegistryService } from '../compute-registry.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'W3-F01 webhook-rejection runtime gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('W3-F01 — outbox webhook handler removed, producer red (gercek Postgres)', () => {
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
    const tenantId = `test-w3f01-${label}-${suffix}`;
    await prisma.tenant.create({
      data: { id: tenantId, name: `W3-F01 Test ${label}`, slug: `test-w3f01-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'W3-F01 Test Müvekkil', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-W3F01-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        isAutoMode: false,
        workflowStage: 'PAYMENT_ORDER' as any,
      },
    });
    return { tenantId, caseId: caseRow.id };
  }

  function buildRealEngineRunner() {
    return new EngineRunnerService(
      prisma as any,
      new FactStoreService(prisma as any),
      new TimelineService(prisma as any),
      new OutboxService(prisma as any),
      new ExpressionEvaluatorService(),
      new ComputeRegistryService(prisma as any),
    );
  }

  it("'action: webhook' outbox'a SIFIR satir yazar; kardes 'enqueue' TAM 1 satir yazar", async () => {
    const { tenantId, caseId } = await buildTenantWithCase('reject');
    const runner = buildRealEngineRunner();

    const rule: RuleDefinition = {
      rule_id: 'w3-f01-db-gated-webhook-rejection',
      then: {
        decisions: [
          {
            if: 'true',
            then: [
              { action: 'webhook', payload: { url: 'https://example.invalid/hook' } },
              { action: 'enqueue', payload: { queue: 'settlement_offer', case_id: caseId } },
            ],
          },
        ],
      },
    };

    const result = await runner.runForEvent(caseId, { event_id: 'evt-w3f01-1' }, rule, tenantId);

    expect(result.matched).toBe(true);
    expect(result.actionsCreated).toBe(1);

    const webhookRows = await (prisma as any).icrabotOutboxAction.count({
      where: { caseId, actionType: 'webhook' },
    });
    expect(webhookRows).toBe(0);

    const enqueueRows = await (prisma as any).icrabotOutboxAction.count({
      where: { caseId, actionType: 'enqueue' },
    });
    expect(enqueueRows).toBe(1);

    const rejectionEntries = await (prisma as any).icrabotTimelineEntry.findMany({
      where: { caseId, type: 'ACTION', severity: 'critical' },
    });
    expect(rejectionEntries.length).toBe(1);
    expect(rejectionEntries[0].title).toContain('rejected');
    expect(rejectionEntries[0].title).toContain('webhook');
    expect(rejectionEntries[0].tenantId).toBe(tenantId);
  });
});
