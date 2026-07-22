import { PrismaClient } from '@prisma/client';

/**
 * UYAP-OPERATION-ATTEMPT-SCHEMA-FOUNDATION-P05A-R1 — disposable PostgreSQL 16 integration.
 *
 * Tenant-safe composite FK + structural CHECK + uniqueness kısıtlarını UYGULAMA katmanında değil
 * VERİTABANI katmanında (owner D6) doğrular. TEST_DATABASE_URL tanımlı değilse suite atlanır.
 *
 * Ön koşul: disposable postgres:16-alpine (asla paylaşılan 5432) + `prisma migrate deploy`.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('UYAP-OPERATION-ATTEMPT-SCHEMA-P05A-R1 — DB-level constraints', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  // seed edilen parent kimlikleri
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let caseA: string;
  let lawyerA: string;
  let clientA: string;

  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const opInsert = (o: {
    id: string;
    tenantId: string;
    operationType?: string;
    actorUserId: string;
    idempotencyKey: string;
    caseId?: string;
    actingLawyerId?: string;
    representedPartyId?: string;
    version?: number;
  }) => {
    const cols = ['"id"', '"tenantId"', '"operationType"', '"actorUserId"', '"idempotencyKey"', '"updatedAt"'];
    const vals = [
      `'${o.id}'`,
      `'${o.tenantId}'`,
      `'${o.operationType ?? 'HACIZ_TALEBI'}'`,
      `'${o.actorUserId}'`,
      `'${o.idempotencyKey}'`,
      'NOW()',
    ];
    if (o.caseId !== undefined) { cols.push('"caseId"'); vals.push(`'${o.caseId}'`); }
    if (o.actingLawyerId !== undefined) { cols.push('"actingLawyerId"'); vals.push(`'${o.actingLawyerId}'`); }
    if (o.representedPartyId !== undefined) { cols.push('"representedPartyId"'); vals.push(`'${o.representedPartyId}'`); }
    if (o.version !== undefined) { cols.push('"version"'); vals.push(String(o.version)); }
    return sql(`INSERT INTO "UyapOperation" (${cols.join(',')}) VALUES (${vals.join(',')})`);
  };

  const attemptInsert = (a: {
    id: string;
    tenantId: string;
    operationId: string;
    attemptNumber: number;
    previousAttemptId?: string | null;
    startedAt?: string;
    finishedAt?: string;
  }) => {
    const cols = ['"id"', '"tenantId"', '"operationId"', '"attemptNumber"', '"startedAt"', '"updatedAt"'];
    const vals = [
      `'${a.id}'`,
      `'${a.tenantId}'`,
      `'${a.operationId}'`,
      String(a.attemptNumber),
      a.startedAt ? `'${a.startedAt}'` : 'NOW()',
      'NOW()',
    ];
    if (a.previousAttemptId !== undefined) {
      cols.push('"previousAttemptId"');
      vals.push(a.previousAttemptId === null ? 'NULL' : `'${a.previousAttemptId}'`);
    }
    if (a.finishedAt !== undefined) { cols.push('"finishedAt"'); vals.push(`'${a.finishedAt}'`); }
    return sql(`INSERT INTO "UyapAttempt" (${cols.join(',')}) VALUES (${vals.join(',')})`);
  };

  beforeAll(async () => {
    // temiz başlangıç (yalnız yeni tablolar)
    await sql('DELETE FROM "UyapAttempt"');
    await sql('DELETE FROM "UyapOperation"');

    const tA = await prisma.tenant.create({ data: { name: 'P5A Tenant A', slug: `p5a-a-${Date.now()}` } });
    const tB = await prisma.tenant.create({ data: { name: 'P5A Tenant B', slug: `p5a-b-${Date.now()}` } });
    tenantA = tA.id;
    tenantB = tB.id;

    const u = await prisma.user.create({ data: { tenantId: tenantA, email: `actor-${Date.now()}@p5a.test`, name: 'Aktör', surname: 'Kullanıcı' } });
    userA = u.id;
    const c = await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P5A-${Date.now()}`, type: 'GENERAL_EXECUTION' } });
    caseA = c.id;
    const l = await prisma.lawyer.create({ data: { tenantId: tenantA, name: 'Avukat', surname: 'P5A' } });
    lawyerA = l.id;
    const cl = await prisma.client.create({ data: { tenantId: tenantA, type: 'INDIVIDUAL' } });
    clientA = cl.id;
  });

  afterAll(async () => {
    await sql('DELETE FROM "UyapAttempt"');
    await sql('DELETE FROM "UyapOperation"');
    await prisma.client.deleteMany({ where: { id: clientA } });
    await prisma.lawyer.deleteMany({ where: { id: lawyerA } });
    await prisma.case.deleteMany({ where: { id: caseA } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('valid same-tenant operation insert succeeds with all optional parent refs', async () => {
    await expect(
      opInsert({ id: 'op-valid', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'idem-valid', caseId: caseA, actingLawyerId: lawyerA, representedPartyId: clientA }),
    ).resolves.toBeDefined();
  });

  it('duplicate (tenantId, idempotencyKey) is rejected by DB', async () => {
    await opInsert({ id: 'op-idem-1', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'dup-key' });
    await expect(
      opInsert({ id: 'op-idem-2', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'dup-key' }),
    ).rejects.toThrow();
  });

  it('same idempotencyKey across DIFFERENT tenants is allowed', async () => {
    await opInsert({ id: 'op-tA', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'shared-idem' });
    // tenantB'de actor gerektiğinden B altında bir user seed et
    const uB = await prisma.user.create({ data: { tenantId: tenantB, email: `actor-b-${Date.now()}@p5a.test`, name: 'B', surname: 'Aktör' } });
    await expect(
      opInsert({ id: 'op-tB', tenantId: tenantB, actorUserId: uB.id, idempotencyKey: 'shared-idem' }),
    ).resolves.toBeDefined();
    await sql(`DELETE FROM "UyapOperation" WHERE "id" = 'op-tB'`);
    await prisma.user.deleteMany({ where: { id: uB.id } });
  });

  it('operation PK (id) uniqueness is enforced', async () => {
    await opInsert({ id: 'op-pk', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'pk-1' });
    await expect(
      opInsert({ id: 'op-pk', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'pk-2' }),
    ).rejects.toThrow();
  });

  it('cross-tenant Case reference is rejected at DB (composite FK)', async () => {
    // tenantB operasyonu, tenantA'nın case'ine referans veremez
    const uB = await prisma.user.create({ data: { tenantId: tenantB, email: `xt-case-${Date.now()}@p5a.test`, name: 'B', surname: 'X' } });
    await expect(
      opInsert({ id: 'op-xt-case', tenantId: tenantB, actorUserId: uB.id, idempotencyKey: 'xt-case', caseId: caseA }),
    ).rejects.toThrow();
    await prisma.user.deleteMany({ where: { id: uB.id } });
  });

  it('cross-tenant User(actor) reference is rejected at DB (composite FK)', async () => {
    await expect(
      opInsert({ id: 'op-xt-user', tenantId: tenantB, actorUserId: userA, idempotencyKey: 'xt-user' }),
    ).rejects.toThrow();
  });

  it('cross-tenant Lawyer reference is rejected at DB (composite FK)', async () => {
    const uB = await prisma.user.create({ data: { tenantId: tenantB, email: `xt-law-${Date.now()}@p5a.test`, name: 'B', surname: 'X' } });
    await expect(
      opInsert({ id: 'op-xt-law', tenantId: tenantB, actorUserId: uB.id, idempotencyKey: 'xt-law', actingLawyerId: lawyerA }),
    ).rejects.toThrow();
    await prisma.user.deleteMany({ where: { id: uB.id } });
  });

  it('cross-tenant Client(representedParty) reference is rejected at DB (composite FK)', async () => {
    const uB = await prisma.user.create({ data: { tenantId: tenantB, email: `xt-cli-${Date.now()}@p5a.test`, name: 'B', surname: 'X' } });
    await expect(
      opInsert({ id: 'op-xt-cli', tenantId: tenantB, actorUserId: uB.id, idempotencyKey: 'xt-cli', representedPartyId: clientA }),
    ).rejects.toThrow();
    await prisma.user.deleteMany({ where: { id: uB.id } });
  });

  it('operation version must be >= 1 (structural CHECK)', async () => {
    await expect(
      opInsert({ id: 'op-ver0', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'ver0', version: 0 }),
    ).rejects.toThrow();
  });

  describe('attempt-level constraints', () => {
    beforeAll(async () => {
      await opInsert({ id: 'op-att-host', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'att-host' });
      await opInsert({ id: 'op-att-other', tenantId: tenantA, actorUserId: userA, idempotencyKey: 'att-other' });
    });

    it('first attempt (n=1, previousAttemptId NULL) succeeds', async () => {
      await expect(
        attemptInsert({ id: 'att-1', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 1, previousAttemptId: null }),
      ).resolves.toBeDefined();
    });

    it('duplicate (operationId, attemptNumber) is rejected', async () => {
      await expect(
        attemptInsert({ id: 'att-1-dup', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 1, previousAttemptId: null }),
      ).rejects.toThrow();
    });

    it('attemptNumber 0 is rejected (structural CHECK)', async () => {
      await expect(
        attemptInsert({ id: 'att-0', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 0, previousAttemptId: null }),
      ).rejects.toThrow();
    });

    it('first attempt with non-null previousAttemptId is rejected (pairing CHECK)', async () => {
      await expect(
        attemptInsert({ id: 'att-bad-first', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 1, previousAttemptId: 'att-1' }),
      ).rejects.toThrow();
    });

    it('retry attempt (n>1) with NULL previousAttemptId is rejected (pairing CHECK)', async () => {
      await expect(
        attemptInsert({ id: 'att-bad-retry', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 2, previousAttemptId: null }),
      ).rejects.toThrow();
    });

    it('valid retry (n=2, previousAttemptId -> att-1 same operation) succeeds', async () => {
      await expect(
        attemptInsert({ id: 'att-2', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 2, previousAttemptId: 'att-1' }),
      ).resolves.toBeDefined();
    });

    it('previous attempt from a DIFFERENT operation is rejected (composite FK)', async () => {
      await attemptInsert({ id: 'att-other-1', tenantId: tenantA, operationId: 'op-att-other', attemptNumber: 1, previousAttemptId: null });
      await expect(
        attemptInsert({ id: 'att-cross-op', tenantId: tenantA, operationId: 'op-att-host', attemptNumber: 3, previousAttemptId: 'att-other-1' }),
      ).rejects.toThrow();
    });

    it('finishedAt earlier than startedAt is rejected (order CHECK)', async () => {
      await expect(
        attemptInsert({
          id: 'att-badtime',
          tenantId: tenantA,
          operationId: 'op-att-other',
          attemptNumber: 2,
          previousAttemptId: 'att-other-1',
          startedAt: '2026-07-22T12:00:00Z',
          finishedAt: '2026-07-22T11:00:00Z',
        }),
      ).rejects.toThrow();
    });
  });

  it('legacy UyapRequestLog / CpeDecisionLog tables remain queryable (unchanged, no DML applied)', async () => {
    // tablo hâlâ mevcut ve sorgulanabilir; bu faz onlara veri yazmaz
    await expect(prisma.uyapRequestLog.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.cpeDecisionLog.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
