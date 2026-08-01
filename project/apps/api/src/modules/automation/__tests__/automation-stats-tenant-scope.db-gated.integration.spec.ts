/**
 * SEC-XTEN-AUTOMATION-STATS-01 — AutomationService.getAutomationStats tenant scope.
 *
 * Unit test (automation-tenant-guard-propagation.spec.ts) Prisma'yı mock'lar; bu dosya
 * tenant-scoped where clause'ın gerçek bir Postgres üzerinde doğru satırları eşleştirdiğini/
 * reddettiğini kanıtlar. Özellikle DecisionLog'un kendi tenantId kolonu OLMADIĞI (yalnız
 * caseId FK'si üzerinden case.tenantId'ye ulaşılabildiği) için relation-filter'ın (`case:
 * { tenantId }`) gerçekten çalıştığını, mock'un kanıtlayamayacağı şekilde doğrular. Fixture-
 * building convention workflow-engine-remaining-tenant-boundaries.db-gated.integration.spec.ts'
 * ten izlenir.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AutomationService } from '../automation.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'Automation stats tenant scope DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb(
  'AutomationService.getAutomationStats tenant scope - disposable DB',
  () => {
    jest.setTimeout(30_000);
    let prisma: PrismaClient;
    let service: AutomationService;
    const createdTenantIds = new Set<string>();

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await prisma.$connect();
      service = new AutomationService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    });

    afterAll(async () => {
      for (const tenantId of createdTenantIds) {
        await cleanupTenant(tenantId);
      }
      await prisma.$disconnect();
    });

    async function cleanupTenant(tenantId: string) {
      await prisma.decisionLog.deleteMany({ where: { case: { tenantId } } });
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      createdTenantIds.delete(tenantId);
    }

    async function buildTenantFixture(label: string, automaticDecisionCount: number) {
      const tenantId = `test-autostats-${label}-${randomUUID().slice(0, 8)}`;
      createdTenantIds.add(tenantId);

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `Automation Stats Test ${label}`,
          slug: `test-autostats-${label}-${randomUUID().slice(0, 8)}`,
        },
      });

      const client = await prisma.client.create({
        data: { tenantId, displayName: 'Automation Stats Test Muvekkil', type: 'INDIVIDUAL' },
      });

      const autoCase1 = await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `TEST-AS-${label}-AUTO1-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          isAutoMode: true,
        },
      });
      const autoCase2 = await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `TEST-AS-${label}-AUTO2-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          isAutoMode: true,
        },
      });
      // isAutoMode:false — totalAutoCases'e girmemeli.
      await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `TEST-AS-${label}-MANUAL-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          isAutoMode: false,
        },
      });

      const caseIds = [autoCase1.id, autoCase2.id];
      const baseTime = Date.now();
      for (let i = 0; i < automaticDecisionCount; i++) {
        await prisma.decisionLog.create({
          data: {
            caseId: caseIds[i % caseIds.length],
            decisionType: 'NEXT_ACTION',
            decision: `test-decision-${i}`,
            isAutomatic: true,
            createdAt: new Date(baseTime - i * 1000),
          },
        });
      }
      // isAutomatic:false — totalAutoActions'a/recentActions'a girmemeli.
      await prisma.decisionLog.create({
        data: {
          caseId: autoCase1.id,
          decisionType: 'NEXT_ACTION',
          decision: 'manual-decision',
          isAutomatic: false,
        },
      });

      return { tenantId, fileNumbers: [autoCase1.fileNumber, autoCase2.fileNumber] };
    }

    it('Tenant A çağrısı: yalnız Tenant A count/recentActions döner, Tenant B dosya numarası hiç görünmez', async () => {
      const tenantA = await buildTenantFixture('a', 3);
      const tenantB = await buildTenantFixture('b', 5);

      const result = await service.getAutomationStats(tenantA.tenantId);

      expect(result.totalAutoCases).toBe(2);
      expect(result.totalAutoActions).toBe(3);
      expect(result.recentActions).toHaveLength(3);
      for (const action of result.recentActions) {
        expect(tenantA.fileNumbers).toContain(action.case.fileNumber);
        expect(tenantB.fileNumbers).not.toContain(action.case.fileNumber);
      }
      const timestamps = result.recentActions.map((a: any) => new Date(a.createdAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((x, y) => y - x)); // createdAt desc korunur
    });

    it('Tenant B çağrısı (simetrik): yalnız Tenant B count/recentActions döner, Tenant A dosya numarası hiç görünmez', async () => {
      const tenantA = await buildTenantFixture('a2', 2);
      const tenantB = await buildTenantFixture('b2', 4);

      const result = await service.getAutomationStats(tenantB.tenantId);

      expect(result.totalAutoCases).toBe(2);
      expect(result.totalAutoActions).toBe(4);
      expect(result.recentActions).toHaveLength(4);
      for (const action of result.recentActions) {
        expect(tenantB.fileNumbers).toContain(action.case.fileNumber);
        expect(tenantA.fileNumbers).not.toContain(action.case.fileNumber);
      }
    });

    it('take:10 cap + response contract korunur (backward compatible shape)', async () => {
      const tenant = await buildTenantFixture('cap', 15);

      const result = await service.getAutomationStats(tenant.tenantId);

      expect(result).toHaveProperty('totalAutoCases');
      expect(result).toHaveProperty('totalAutoActions');
      expect(result).toHaveProperty('recentActions');
      expect(result.totalAutoActions).toBe(15);
      expect(result.recentActions).toHaveLength(10);
    });
  },
);
