/**
 * OD-3 tenant guard — WorkflowEngine.buildContext / processCase disposable-DB entegrasyon testi.
 *
 * Unit testler (workflow-engine-build-context-tenant-guard.spec.ts) Prisma'yı mock'lar; bu dosya
 * composite where clause'ın (Case.id+tenantId) gerçek bir Postgres üzerinde doğru satırı
 * eşleştirdiğini/reddettiğini kanıtlar. Fixture-building convention
 * enforcement-action-guarded-write-path.db-gated.integration.spec.ts'ten (PR-EA-4) izlenir.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { WorkflowEngine } from '../workflow-engine.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('OD-3 tenant guard DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('WorkflowEngine.buildContext/processCase tenant guard - disposable DB (OD-3)', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let engine: WorkflowEngine;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new WorkflowEngine(prisma as any, {} as any, {} as any);
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.enforcementAction.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    createdTenantIds.delete(tenantId);
  }

  async function buildScopedFixture(label: string) {
    const tenantId = `test-od3-${label}-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: `OD-3 Test Tenant ${label}`, slug: `test-od3-${label}-${randomUUID().slice(0, 8)}` },
    });

    const client = await prisma.client.create({
      data: { tenantId, displayName: 'OD-3 Test Muvekkil', type: 'INDIVIDUAL' },
    });

    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-OD3-${randomUUID().slice(0, 6)}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        isAutoMode: false,
      },
    });

    return { tenantId, caseId: caseRow.id };
  }

  it('doğru tenant + doğru caseId → buildContext başarılı, doğru context döner', async () => {
    const { tenantId, caseId } = await buildScopedFixture('happy');

    const context = await engine.buildContext(caseId, tenantId);

    expect(context.caseId).toBe(caseId);
    expect(context.tenantId).toBe(tenantId);
  });

  it('cross-tenant caseId → buildContext NotFoundException fırlatır (gerçek Postgres composite where)', async () => {
    const { caseId } = await buildScopedFixture('victim');
    const { tenantId: attackerTenantId } = await buildScopedFixture('attacker');

    await expect(engine.buildContext(caseId, attackerTenantId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('cross-tenant caseId ile processCase çağrılırsa istisna yutulur, hiçbir mutasyon yapılmaz', async () => {
    const { caseId } = await buildScopedFixture('victim2');
    const { tenantId: attackerTenantId } = await buildScopedFixture('attacker2');

    await expect(engine.processCase(caseId, attackerTenantId)).resolves.toBeUndefined();

    const decisionLogs = await prisma.decisionLog.findMany({ where: { caseId } });
    expect(decisionLogs).toHaveLength(0);

    const untouchedCase = await prisma.case.findUnique({ where: { id: caseId } });
    expect(untouchedCase?.autoActionsCount).toBe(0);
  });
});
