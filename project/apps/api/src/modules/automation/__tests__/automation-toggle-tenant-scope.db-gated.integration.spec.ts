/**
 * AUTOMATION-TOGGLE-TENANT-GUARD-R01 — AutomationService.toggleAutoMode tenant scope.
 *
 * Unit test (automation-tenant-guard-propagation.spec.ts) Prisma'yı mock'lar; bu dosya
 * atomic `updateMany({ where: { id, tenantId } })` yazma yolunun gerçek bir Postgres üzerinde
 * doğru satırı eşleştirdiğini/reddettiğini ve YABANCI tenant'ın satırına hiçbir koşulda
 * dokunmadığını kanıtlar (mock'un kanıtlayamayacağı şey: gerçek bir cross-tenant update
 * denemesinin veritabanı seviyesinde sıfır etkili olduğu). Fixture-building convention
 * automation-stats-tenant-scope.db-gated.integration.spec.ts'ten izlenir.
 */
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AutomationService } from '../automation.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'Automation toggle tenant scope DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb(
  'AutomationService.toggleAutoMode tenant scope - disposable DB',
  () => {
    jest.setTimeout(30_000);
    let prisma: PrismaClient;
    let service: AutomationService;
    const createdTenantIds = new Set<string>();

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await prisma.$connect();
      service = new AutomationService(prisma as any, {} as any, {} as any, {} as any);
    });

    afterAll(async () => {
      for (const tenantId of createdTenantIds) {
        await cleanupTenant(tenantId);
      }
      await prisma.$disconnect();
    });

    async function cleanupTenant(tenantId: string) {
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      createdTenantIds.delete(tenantId);
    }

    async function buildTenantCaseFixture(
      label: string,
      initial: { isAutoMode: boolean; nextActionAt: Date | null },
    ) {
      const tenantId = `test-autotoggle-${label}-${randomUUID().slice(0, 8)}`;
      createdTenantIds.add(tenantId);

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `Automation Toggle Test ${label}`,
          slug: `test-autotoggle-${label}-${randomUUID().slice(0, 8)}`,
        },
      });

      const client = await prisma.client.create({
        data: { tenantId, displayName: 'Automation Toggle Test Muvekkil', type: 'INDIVIDUAL' },
      });

      const testCase = await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `TEST-AT-${label}-${randomUUID().slice(0, 6)}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          isAutoMode: initial.isAutoMode,
          nextActionAt: initial.nextActionAt,
        },
      });

      return { tenantId, caseId: testCase.id };
    }

    it('Tenant A kendi case\'ini enable eder: isAutoMode=true, nextActionAt set edilir', async () => {
      const tenantA = await buildTenantCaseFixture('a-own-enable', {
        isAutoMode: false,
        nextActionAt: null,
      });

      await service.toggleAutoMode(tenantA.caseId, true, tenantA.tenantId);

      const updated = await prisma.case.findUniqueOrThrow({ where: { id: tenantA.caseId } });
      expect(updated.isAutoMode).toBe(true);
      expect(updated.nextActionAt).not.toBeNull();
    });

    it('Tenant A kendi case\'ini disable eder: isAutoMode=false, nextActionAt null\'a temizlenir', async () => {
      const tenantA = await buildTenantCaseFixture('a-own-disable', {
        isAutoMode: true,
        nextActionAt: new Date(),
      });

      await service.toggleAutoMode(tenantA.caseId, false, tenantA.tenantId);

      const updated = await prisma.case.findUniqueOrThrow({ where: { id: tenantA.caseId } });
      expect(updated.isAutoMode).toBe(false);
      expect(updated.nextActionAt).toBeNull();
    });

    it('Tenant A, Tenant B\'nin case\'ini toggle etmeye çalışır: NotFoundException, Tenant B\'nin satırı HİÇBİR KOŞULDA değişmez', async () => {
      const tenantA = await buildTenantCaseFixture('a-cross', {
        isAutoMode: false,
        nextActionAt: null,
      });
      const originalNextActionAt = new Date('2026-01-01T00:00:00.000Z');
      const tenantB = await buildTenantCaseFixture('b-cross', {
        isAutoMode: false,
        nextActionAt: originalNextActionAt,
      });

      await expect(
        service.toggleAutoMode(tenantB.caseId, true, tenantA.tenantId),
      ).rejects.toThrow(NotFoundException);

      const untouched = await prisma.case.findUniqueOrThrow({ where: { id: tenantB.caseId } });
      expect(untouched.isAutoMode).toBe(false);
      expect(untouched.nextActionAt?.toISOString()).toBe(originalNextActionAt.toISOString());
    });

    it('Var olmayan caseId ile Tenant A çağırır: yabancı-tenant durumuyla AYNI hata sınıfı (enumeration yok)', async () => {
      const tenantA = await buildTenantCaseFixture('a-nonexistent', {
        isAutoMode: false,
        nextActionAt: null,
      });

      await expect(
        service.toggleAutoMode(`nonexistent-${randomUUID()}`, true, tenantA.tenantId),
      ).rejects.toThrow(NotFoundException);
    });

    it('tenantId eksikse gerçek DB\'ye karşı bile hiçbir mutasyon gerçekleşmez (fail-closed önce Prisma çağrılmadan durur)', async () => {
      const tenantA = await buildTenantCaseFixture('a-missing-tenant', {
        isAutoMode: false,
        nextActionAt: null,
      });

      await expect(
        service.toggleAutoMode(tenantA.caseId, true, undefined as any),
      ).rejects.toThrow();

      const untouched = await prisma.case.findUniqueOrThrow({ where: { id: tenantA.caseId } });
      expect(untouched.isAutoMode).toBe(false);
    });
  },
);
