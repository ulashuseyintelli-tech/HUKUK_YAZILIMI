/**
 * WorkflowEngine remaining tenant boundaries — calculateNextActionTime / updateCaseStage
 * disposable-DB entegrasyon testi.
 *
 * Unit testler (workflow-engine-remaining-tenant-boundaries.spec.ts) Prisma'yı mock'lar; bu dosya
 * composite where clause'ın (Case.id+tenantId) gerçek bir Postgres üzerinde doğru satırı
 * eşleştirdiğini/reddettiğini ve cross-tenant updateCaseStage'in hiçbir mutasyon yapmadığını
 * kanıtlar. Fixture-building convention workflow-engine-build-context-tenant-guard.db-gated.
 * integration.spec.ts'ten (OD-3) izlenir.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { WorkflowEngine } from '../workflow-engine.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'WorkflowEngine remaining tenant boundaries DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb(
  'WorkflowEngine.calculateNextActionTime/updateCaseStage tenant guard - disposable DB',
  () => {
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
      await prisma.caseLifecycle.deleteMany({ where: { case: { tenantId } } });
      await prisma.enforcementAction.deleteMany({ where: { case: { tenantId } } });
      await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.debtor.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      createdTenantIds.delete(tenantId);
    }

    async function buildScopedFixture(label: string, workflowStage: string) {
      const tenantId = `test-wf-tb-${label}-${randomUUID().slice(0, 8)}`;
      createdTenantIds.add(tenantId);

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `WF Tenant Boundary Test ${label}`,
          slug: `test-wf-tb-${label}-${randomUUID().slice(0, 8)}`,
        },
      });

      const client = await prisma.client.create({
        data: { tenantId, displayName: 'WF Tenant Boundary Test Muvekkil', type: 'INDIVIDUAL' },
      });

      const caseRow = await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `TEST-WFTB-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          isAutoMode: false,
          workflowStage: workflowStage as any,
        },
      });

      return { tenantId, caseId: caseRow.id };
    }

    it('calculateNextActionTime: doğru tenant + doğru caseId → doğru tarih döner', async () => {
      const { tenantId, caseId } = await buildScopedFixture('cnat-happy', 'ENFORCEMENT');

      const result = await engine.calculateNextActionTime(caseId, tenantId);

      expect(result).toBeInstanceOf(Date);
    });

    it('calculateNextActionTime: cross-tenant caseId → NotFoundException (gerçek Postgres composite where)', async () => {
      const { caseId } = await buildScopedFixture('cnat-victim', 'ENFORCEMENT');
      const { tenantId: attackerTenantId } = await buildScopedFixture('cnat-attacker', 'ENFORCEMENT');

      await expect(engine.calculateNextActionTime(caseId, attackerTenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updateCaseStage: doğru tenant + doğru caseId → stage update + lifecycle kaydı gerçekleşir', async () => {
      const { tenantId, caseId } = await buildScopedFixture('ucs-happy', 'PAYMENT_ORDER');

      await engine.updateCaseStage(caseId, tenantId, 'OBJECTION' as any, 'test reason');

      const updatedCase = await prisma.case.findUnique({ where: { id: caseId } });
      expect(updatedCase?.workflowStage).toBe('OBJECTION');

      const lifecycleRows = await prisma.caseLifecycle.findMany({ where: { caseId } });
      expect(lifecycleRows).toHaveLength(1);
      expect(lifecycleRows[0].stage).toBe('OBJECTION');
    });

    it('updateCaseStage: cross-tenant caseId → NotFoundException fırlatılır, hiçbir mutasyon yapılmaz', async () => {
      const { caseId } = await buildScopedFixture('ucs-victim', 'PAYMENT_ORDER');
      const { tenantId: attackerTenantId } = await buildScopedFixture('ucs-attacker', 'PAYMENT_ORDER');

      await expect(
        engine.updateCaseStage(caseId, attackerTenantId, 'OBJECTION' as any, 'test reason'),
      ).rejects.toThrow(NotFoundException);

      const untouchedCase = await prisma.case.findUnique({ where: { id: caseId } });
      expect(untouchedCase?.workflowStage).toBe('PAYMENT_ORDER'); // değişmedi

      const lifecycleRows = await prisma.caseLifecycle.findMany({ where: { caseId } });
      expect(lifecycleRows).toHaveLength(0); // mutasyon gerçekleşmedi
    });
  },
);
