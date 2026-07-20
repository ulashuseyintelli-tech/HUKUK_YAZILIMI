/**
 * SEC-XTEN-UYAP-STATS-01 — UyapService.getStats tenant scope, gerçek Postgres üzerinde.
 *
 * Unit test (uyap-stats-tenant-scope.spec.ts) Prisma'yı mock'lar; bu dosya tenant-scoped
 * eşitlik filtresinin gerçek bir Postgres üzerinde doğru satırları eşleştirdiğini/reddettiğini
 * ve legacy tenantId=NULL kayıtların hiçbir tenant'ın sonucuna dahil olmadığını kanıtlar.
 * Fixture-building convention automation-stats-tenant-scope.db-gated.integration.spec.ts'ten
 * izlenir.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { UyapService } from '../uyap.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'UYAP stats tenant scope DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb(
  'UyapService.getStats tenant scope - disposable DB',
  () => {
    jest.setTimeout(30_000);
    let prisma: PrismaClient;
    let service: UyapService;
    const createdTenantIds = new Set<string>();

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await prisma.$connect();
      service = new UyapService(prisma as any, {} as any, {} as any, { report: jest.fn() } as any, undefined);
    });

    afterAll(async () => {
      for (const tenantId of createdTenantIds) {
        await cleanupTenant(tenantId);
      }
      await prisma.uyapRequestLog.deleteMany({ where: { tenantId: null, requestType: 'SEC-XTEN-UYAP-STATS-01-legacy' } });
      await prisma.$disconnect();
    });

    async function cleanupTenant(tenantId: string) {
      await prisma.uyapRequestLog.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      createdTenantIds.delete(tenantId);
    }

    async function buildTenantFixture(
      label: string,
      counts: { pending: number; success: number; failed: number },
    ) {
      const tenantId = `test-uyapstats-${label}-${randomUUID().slice(0, 8)}`;
      createdTenantIds.add(tenantId);

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `UYAP Stats Test ${label}`,
          slug: `test-uyapstats-${label}-${randomUUID().slice(0, 8)}`,
        },
      });

      for (let i = 0; i < counts.pending; i++) {
        await prisma.uyapRequestLog.create({
          data: { tenantId, requestType: 'sendPaymentOrder', status: 'PENDING' },
        });
      }
      for (let i = 0; i < counts.success; i++) {
        await prisma.uyapRequestLog.create({
          data: { tenantId, requestType: 'sendPaymentOrder', status: 'SUCCESS' },
        });
      }
      for (let i = 0; i < counts.failed; i++) {
        await prisma.uyapRequestLog.create({
          data: { tenantId, requestType: 'sendPaymentOrder', status: 'FAILED' },
        });
      }

      return { tenantId };
    }

    it('Tenant A çağrısı: yalnız kendi count\'larını döner, Tenant B ve legacy-NULL kayıtları hiç görünmez', async () => {
      const tenantA = await buildTenantFixture('a', { pending: 2, success: 3, failed: 1 });
      const tenantB = await buildTenantFixture('b', { pending: 5, success: 7, failed: 4 });
      // Legacy tenantId=NULL kayıt — hiçbir tenant sonucuna dahil olmamalı.
      await prisma.uyapRequestLog.create({
        data: { requestType: 'SEC-XTEN-UYAP-STATS-01-legacy', status: 'SUCCESS' },
      });

      const result = await service.getStats(tenantA.tenantId);

      expect(result).toEqual({ total: 6, pending: 2, success: 3, failed: 1 });
      // Tenant B'nin toplamı (16) veya legacy dahil toplam (17) hiçbir şekilde sızmaz:
      expect(result.total).not.toBe(16);
      expect(result.total).not.toBe(17);

      const resultB = await service.getStats(tenantB.tenantId);
      expect(resultB).toEqual({ total: 16, pending: 5, success: 7, failed: 4 });
    });

    it('legacy tenantId=NULL kayıtlar hiçbir tenant sonucuna dahil edilmez (izole)', async () => {
      const tenant = await buildTenantFixture('iso', { pending: 1, success: 1, failed: 1 });
      await prisma.uyapRequestLog.create({
        data: { requestType: 'SEC-XTEN-UYAP-STATS-01-legacy', status: 'PENDING' },
      });
      await prisma.uyapRequestLog.create({
        data: { requestType: 'SEC-XTEN-UYAP-STATS-01-legacy', status: 'FAILED' },
      });

      const result = await service.getStats(tenant.tenantId);

      expect(result).toEqual({ total: 3, pending: 1, success: 1, failed: 1 });
    });

    it('tenantId boş/whitespace → fail-closed sıfır sonuç (gerçek Postgres bağlantısına rağmen sorgu HİÇ atılmaz)', async () => {
      await buildTenantFixture('fc', { pending: 1, success: 1, failed: 1 });
      const countSpy = jest.spyOn(prisma.uyapRequestLog, 'count');

      const res1 = await service.getStats('');
      const res2 = await service.getStats('   ');

      expect(res1).toEqual({ total: 0, pending: 0, success: 0, failed: 0 });
      expect(res2).toEqual({ total: 0, pending: 0, success: 0, failed: 0 });
      expect(countSpy).not.toHaveBeenCalled();
      countSpy.mockRestore();
    });
  },
);
