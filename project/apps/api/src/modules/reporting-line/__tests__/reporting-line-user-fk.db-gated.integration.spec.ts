import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';

/**
 * OFFICE-P2-CAP02-REPORTINGLINE-USER-FK-HARDENING-I01 — DB integrity regression.
 *
 * ReportingLine.actorUserId / managerUserId eskiden çıplak String kolonlardı: hiçbir
 * foreign key yoktu, dolayısıyla var olmayan veya BAŞKA TENANT'a ait bir User id'si
 * veritabanı seviyesinde kabul ediliyordu. Koruma yalnız servis katmanındaydı ve
 * doğrudan SQL yazan her yol onu atlıyordu.
 *
 * Bu suite iki tenant-safe composite FK'nin gerçekten uygulandığını kanıtlar:
 *   ReportingLine(tenantId, actorUserId)   -> User(tenantId, id)  NOT NULL, RESTRICT
 *   ReportingLine(tenantId, managerUserId) -> User(tenantId, id)  NULLABLE, RESTRICT
 *
 * Prisma client üzerinden değil ham SQL ile yazar: amaç servis/ORM davranışını değil,
 * VERİTABANI garantisini doğrulamaktır.
 */
describeDb('ReportingLine <-> User tenant-safe composite FK', () => {
  const prisma = new PrismaClient();

  // Suite'e özgü, çakışmayan sabitler.
  const T1 = 'rl-fk-tenant-1';
  const T2 = 'rl-fk-tenant-2';
  const U_ACTOR = 'rl-fk-user-actor';
  const U_MANAGER = 'rl-fk-user-manager';
  const U_OTHER_TENANT = 'rl-fk-user-other-tenant';

  const insertLine = (
    id: string,
    tenantId: string,
    actorUserId: string,
    managerUserId: string | null,
    disposition: 'MANAGED' | 'TOP_LEVEL',
  ) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "ReportingLine"
         (id, "tenantId", "actorUserId", "managerUserId", disposition, "validFrom", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"ReportingLineDisposition", now(), now(), now())`,
      id,
      tenantId,
      actorUserId,
      managerUserId,
      disposition,
    );

  const cleanup = async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ReportingLine" WHERE "tenantId" IN ($1, $2)`,
      T1,
      T2,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "User" WHERE "tenantId" IN ($1, $2)`,
      T1,
      T2,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id IN ($1, $2)`, T1, T2);
  };

  beforeAll(async () => {
    await cleanup();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Tenant"(id, name, slug, "createdAt", "updatedAt")
       VALUES ($1, 'RL FK Tenant 1', $1, now(), now()),
              ($2, 'RL FK Tenant 2', $2, now(), now())`,
      T1,
      T2,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User"(id, "tenantId", email, name, surname, role, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $4, 'actor@rl-fk.test',   'Actor',   'User', 'USER',  true, now(), now()),
              ($2, $4, 'manager@rl-fk.test', 'Manager', 'User', 'ADMIN', true, now(), now()),
              ($3, $5, 'other@rl-fk.test',   'Other',   'User', 'USER',  true, now(), now())`,
      U_ACTOR,
      U_MANAGER,
      U_OTHER_TENANT,
      T1,
      T2,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ReportingLine" WHERE "tenantId" IN ($1, $2)`,
      T1,
      T2,
    );
  });

  describe('kabul edilmesi gerekenler', () => {
    it('aynı tenant içindeki actor ve manager ile MANAGED satırı yazılabilir', async () => {
      await expect(
        insertLine('rl-fk-ok-managed', T1, U_ACTOR, U_MANAGER, 'MANAGED'),
      ).resolves.toBe(1);
    });

    it('TOP_LEVEL satırı manager NULL ile yazılabilir (nullable FK denetlenmez)', async () => {
      await expect(
        insertLine('rl-fk-ok-toplevel', T1, U_ACTOR, null, 'TOP_LEVEL'),
      ).resolves.toBe(1);
    });
  });

  describe('foreign key tarafından reddedilmesi gerekenler', () => {
    it('var olmayan actor reddedilir', async () => {
      await expect(
        insertLine('rl-fk-bad-actor', T1, 'rl-fk-nonexistent', U_MANAGER, 'MANAGED'),
      ).rejects.toThrow(/ReportingLine_tenantId_actorUserId_fkey/);
    });

    it('var olmayan manager reddedilir', async () => {
      await expect(
        insertLine('rl-fk-bad-manager', T1, U_ACTOR, 'rl-fk-nonexistent', 'MANAGED'),
      ).rejects.toThrow(/ReportingLine_tenantId_managerUserId_fkey/);
    });

    it('CROSS-TENANT actor reddedilir — asıl kazanım', async () => {
      await expect(
        insertLine('rl-fk-xt-actor', T1, U_OTHER_TENANT, U_MANAGER, 'MANAGED'),
      ).rejects.toThrow(/ReportingLine_tenantId_actorUserId_fkey/);
    });

    it('CROSS-TENANT manager reddedilir — asıl kazanım', async () => {
      await expect(
        insertLine('rl-fk-xt-manager', T1, U_ACTOR, U_OTHER_TENANT, 'MANAGED'),
      ).rejects.toThrow(/ReportingLine_tenantId_managerUserId_fkey/);
    });

    it('hiyerarşide referansı olan User silinemez (ON DELETE RESTRICT)', async () => {
      await insertLine('rl-fk-restrict', T1, U_ACTOR, U_MANAGER, 'MANAGED');
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id = $1`, U_ACTOR),
      ).rejects.toThrow(/ReportingLine_tenantId_actorUserId_fkey/);
    });
  });

  describe('mevcut DB garantileri bozulmadı (regresyon)', () => {
    it('MANAGED + manager NULL hâlâ CHECK tarafından reddedilir', async () => {
      await expect(
        insertLine('rl-fk-check', T1, U_ACTOR, null, 'MANAGED'),
      ).rejects.toThrow(/reporting_line_disposition_manager_ck/);
    });

    it('aynı actor için ikinci aktif satır hâlâ partial unique tarafından reddedilir', async () => {
      await insertLine('rl-fk-uniq-1', T1, U_ACTOR, U_MANAGER, 'MANAGED');
      // NOT: Prisma raw-query hatası unique ihlalinde index ADINI değil ihlal edilen
      // ANAHTARI raporlar (SQLSTATE 23505). Bu yüzden reporting_line_one_active_per_actor
      // adına değil, kısmi indeksin koruduğu anahtara göre doğrulanır.
      await expect(
        insertLine('rl-fk-uniq-2', T1, U_ACTOR, U_MANAGER, 'MANAGED'),
      ).rejects.toThrow(/23505[\s\S]*"tenantId", "actorUserId"[\s\S]*already exists/);
    });
  });
});
