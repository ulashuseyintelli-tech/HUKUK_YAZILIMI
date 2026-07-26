import { PrismaClient } from '@prisma/client';

/**
 * UYAP-POA-TENANT-SAFETY-I01 (D-1/D-2) — disposable PostgreSQL 16 integration.
 *
 * Owner DECISION-2: YALNIZ TENANT SAFETY DELTA (yeni lifecycle alanı, POA↔Case relation,
 * delegation tablosu YOK). Bu suite `ClientPowerOfAttorney.tenantId` ve `PoaLawyer.tenantId`
 * kısıtlarını UYGULAMA katmanında değil **VERİTABANI** katmanında doğrular:
 *
 *   INV-07: POA tenant'ı client tenant'ı ile aynıdır.
 *   INV-08: PoaLawyer tenant'ı hem POA hem Lawyer tenant'ı ile aynıdır.
 *
 * TEST_DATABASE_URL tanımlı değilse suite atlanır.
 * Ön koşul: disposable postgres:16-alpine (asla paylaşılan 5432) + `prisma migrate deploy`.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('UYAP-POA-TENANT-SAFETY-I01 — DB-level tenant constraints', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Date.now().toString(36);
  const tenantA = `poa-tsA-${S}`;
  const tenantB = `poa-tsB-${S}`;
  const clientA = `poa-cA-${S}`;
  const clientB = `poa-cB-${S}`;
  const lawyerA = `poa-lA-${S}`;
  const lawyerB = `poa-lB-${S}`;
  const poaA = `poa-pA-${S}`;

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tenantA}','TA-${S}','ta-${S}',now(),now()),
      ('${tenantB}','TB-${S}','tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","createdAt","updatedAt") VALUES
      ('${clientA}','${tenantA}','PERSON',now(),now()),
      ('${clientB}','${tenantB}','PERSON',now(),now())`);
    await sql(`INSERT INTO "Lawyer"("id","tenantId","name","surname","createdAt","updatedAt") VALUES
      ('${lawyerA}','${tenantA}','LA','X',now(),now()),
      ('${lawyerB}','${tenantB}','LB','Y',now(),now())`);
  });

  afterAll(async () => {
    // en derinden yukarı: bagli satirlar once
    await sql(`DELETE FROM "PoaLawyer" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`).catch(() => undefined);
    await sql(`DELETE FROM "ClientPowerOfAttorney" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`).catch(() => undefined);
    await sql(`DELETE FROM "Lawyer" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`).catch(() => undefined);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tenantA}','${tenantB}')`).catch(() => undefined);
    await sql(`DELETE FROM "Tenant" WHERE "id" IN ('${tenantA}','${tenantB}')`).catch(() => undefined);
    await prisma.$disconnect();
  });

  const insertPoa = (id: string, tenantId: string, clientId: string) =>
    sql(`INSERT INTO "ClientPowerOfAttorney"("id","tenantId","clientId","createdAt","updatedAt")
         VALUES ('${id}','${tenantId}','${clientId}',now(),now())`);

  const insertPoaLawyer = (id: string, tenantId: string, poaId: string, lawyerId: string) =>
    sql(`INSERT INTO "PoaLawyer"("id","tenantId","poaId","lawyerId") VALUES
         ('${id}','${tenantId}','${poaId}','${lawyerId}')`);

  describe('schema surface', () => {
    it('tenantId her iki tabloda da NOT NULL', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; is_nullable: string }>>(
        `SELECT table_name, is_nullable FROM information_schema.columns
         WHERE table_name IN ('ClientPowerOfAttorney','PoaLawyer') AND column_name = 'tenantId'
         ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(['ClientPowerOfAttorney', 'PoaLawyer']);
      expect(rows.every((r) => r.is_nullable === 'NO')).toBe(true);
    });

    it('composite tenant-safe FK kisitlari mevcut', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
        `SELECT conname FROM pg_constraint
         WHERE conname IN ('ClientPowerOfAttorney_clientId_tenantId_fkey',
                           'PoaLawyer_poaId_tenantId_fkey',
                           'PoaLawyer_lawyerId_tenantId_fkey')
         ORDER BY conname`,
      );
      expect(rows.map((r) => r.conname)).toEqual([
        'ClientPowerOfAttorney_clientId_tenantId_fkey',
        'PoaLawyer_lawyerId_tenantId_fkey',
        'PoaLawyer_poaId_tenantId_fkey',
      ]);
    });
  });

  describe('pozitif — same-tenant zincir', () => {
    it('aynı tenant içinde POA ve PoaLawyer oluşturulabilir', async () => {
      await expect(insertPoa(poaA, tenantA, clientA)).resolves.toBeDefined();
      await expect(insertPoaLawyer(`pl-ok-${S}`, tenantA, poaA, lawyerA)).resolves.toBeDefined();

      const cnt = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*) c FROM "PoaLawyer" WHERE "tenantId" = '${tenantA}'`,
      );
      expect(Number(cnt[0].c)).toBe(1);
    });
  });

  describe('negatif — cross-tenant DB seviyesinde reddedilir', () => {
    it('POA başka tenant\'ın client\'ına bağlanamaz (INV-07)', async () => {
      await expect(insertPoa(`poa-bad-${S}`, tenantA, clientB)).rejects.toThrow(
        /ClientPowerOfAttorney_clientId_tenantId_fkey|foreign key/i,
      );
    });

    it('PoaLawyer başka tenant\'ın lawyer\'ına bağlanamaz (INV-08)', async () => {
      await expect(insertPoaLawyer(`pl-badl-${S}`, tenantA, poaA, lawyerB)).rejects.toThrow(
        /PoaLawyer_lawyerId_tenantId_fkey|foreign key/i,
      );
    });

    it('PoaLawyer başka tenant\'ın POA\'sına bağlanamaz (INV-08)', async () => {
      // tenantB bağlamında tenantA'nın POA'sına bağlanmaya çalışır
      await expect(insertPoaLawyer(`pl-badp-${S}`, tenantB, poaA, lawyerB)).rejects.toThrow(
        /PoaLawyer_poaId_tenantId_fkey|foreign key/i,
      );
    });

    // PostgreSQL `23502` = not_null_violation. Prisma raw hata mesajı kolon adını taşımadığı
    // için (yalnız "Failing row contains (...)") assertion SQLSTATE kodu üzerinden yapılır.
    it('tenantId olmadan POA oluşturulamaz (NOT NULL)', async () => {
      await expect(
        sql(`INSERT INTO "ClientPowerOfAttorney"("id","clientId","createdAt","updatedAt")
             VALUES ('poa-notenant-${S}','${clientA}',now(),now())`),
      ).rejects.toThrow(/23502/);
    });

    it('tenantId olmadan PoaLawyer oluşturulamaz (NOT NULL)', async () => {
      await expect(
        sql(`INSERT INTO "PoaLawyer"("id","poaId","lawyerId") VALUES ('pl-notenant-${S}','${poaA}','${lawyerA}')`),
      ).rejects.toThrow(/23502/);
    });
  });

  describe('tenant query isolation', () => {
    it('tenant-scoped sorgu diğer tenant satırlarını görmez', async () => {
      const poaB = `poa-pB-${S}`;
      await insertPoa(poaB, tenantB, clientB);

      const inA = await prisma.clientPowerOfAttorney.findMany({
        where: { tenantId: tenantA },
        select: { id: true },
      });
      const idsA = inA.map((r) => r.id);
      expect(idsA).toContain(poaA);
      expect(idsA).not.toContain(poaB);
    });
  });
});
