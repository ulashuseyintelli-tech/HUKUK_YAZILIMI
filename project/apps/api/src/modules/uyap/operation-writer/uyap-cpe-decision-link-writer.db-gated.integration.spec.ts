import { PrismaClient } from '@prisma/client';
import { UyapCpeDecisionLinkWriterService } from './uyap-cpe-decision-link-writer.service';
import { LinkCpeDecisionCommand } from './uyap-cpe-decision-link-writer.types';
import {
  UyapCpeDecisionLinkConflictError,
  UyapCpeDecisionLinkIntegrityError,
} from './uyap-cpe-decision-link-writer.errors';

/**
 * UYAP-CPE-DECISION-LINK-WRITER-P05C-P03 — disposable PostgreSQL 16 integration.
 *
 * Kanitlar: idempotent replay, conflicting-duplicate reddi, esszamanli same-decision race,
 * cross-tenant/case/attempt reddi (composite FK), transaction rollback atomikligi,
 * standalone + caller-tx yollari.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5441/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('UYAP-P05C-P03 link writer — disposable DB', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const service = new UyapCpeDecisionLinkWriterService(prisma as any);

  let tenantA: string;
  let tenantB: string;
  let caseA: string;
  let caseOther: string;
  let userA: string;

  const mkOperation = (id: string, tenantId: string, caseId: string, actorUserId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "UyapOperation" ("id","tenantId","caseId","operationType","actorUserId","idempotencyKey","updatedAt")
       VALUES ($1,$2,$3,'HACIZ_TALEBI',$4,$5,NOW())`,
      id, tenantId, caseId, actorUserId, `idem-${id}`,
    );
  // pairing CHECK (M1): attemptNumber=1 → previousAttemptId NULL; n>1 → NOT NULL.
  const mkAttempt = (id: string, tenantId: string, operationId: string, n: number, prev: string | null) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "UyapAttempt" ("id","tenantId","operationId","attemptNumber","previousAttemptId","startedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      id, tenantId, operationId, n, prev,
    );
  const mkDecision = (id: string, caseId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "CpeDecisionLog" ("id","caseId","actionCode","scope","allowed","code","reason","factsUsedKeys")
       VALUES ($1,$2,'UYAP_QUERY','CASE',true,'OK','t',ARRAY[]::text[])`,
      id, caseId,
    );

  let cmd: LinkCpeDecisionCommand;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');

    const s = Date.now();
    tenantA = (await prisma.tenant.create({ data: { name: 'P03 A', slug: `p03-a-${s}` } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: 'P03 B', slug: `p03-b-${s}` } })).id;
    userA = (await prisma.user.create({ data: { tenantId: tenantA, email: `p03-${s}@t.test`, name: 'A', surname: 'K' } })).id;
    caseA = (await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P03-${s}`, type: 'GENERAL_EXECUTION' } })).id;
    caseOther = (await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P03-O-${s}`, type: 'GENERAL_EXECUTION' } })).id;

    await mkOperation('op-1', tenantA, caseA, userA);
    await mkAttempt('att-1', tenantA, 'op-1', 1, null);
    await mkAttempt('att-2', tenantA, 'op-1', 2, 'att-1');

    cmd = { tenantId: tenantA, caseId: caseA, operationId: 'op-1', attemptId: 'att-1', cpeDecisionLogId: 'dec-1' };
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');
    await prisma.case.deleteMany({ where: { id: { in: [caseA, caseOther] } } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('yeni link CREATED yazar', async () => {
    await mkDecision('dec-1', caseA);
    const r = await service.linkAttempt(cmd);
    expect(r.created).toBe(true);
    expect(r.reason).toBe('CREATED');
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-1' } })).toBe(1);
  });

  it('exact replay → IDEMPOTENT_REPLAY, yeni satir YOK', async () => {
    const r = await service.linkAttempt(cmd);
    expect(r.created).toBe(false);
    expect(r.reason).toBe('IDEMPOTENT_REPLAY');
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-1' } })).toBe(1);
  });

  it('ayni karar FARKLI attempt’e → HARD CONFLICT (fail-closed)', async () => {
    await expect(service.linkAttempt({ ...cmd, attemptId: 'att-2' })).rejects.toThrow(
      UyapCpeDecisionLinkConflictError,
    );
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-1' } })).toBe(1);
  });

  it('esszamanli same-decision same-relation race → tam 1 CREATED, kalanlar IDEMPOTENT_REPLAY', async () => {
    await mkDecision('dec-race', caseA);
    const raceCmd = { ...cmd, cpeDecisionLogId: 'dec-race' };
    const results = await Promise.all(Array.from({ length: 6 }, () => service.linkAttempt(raceCmd)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'IDEMPOTENT_REPLAY')).toHaveLength(5);
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-race' } })).toBe(1);
  });

  it('cross-tenant reddi (composite FK integrity error)', async () => {
    await mkDecision('dec-xt', caseA);
    await expect(
      service.linkAttempt({ ...cmd, cpeDecisionLogId: 'dec-xt', tenantId: tenantB }),
    ).rejects.toThrow(UyapCpeDecisionLinkIntegrityError);
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-xt' } })).toBe(0);
  });

  it('cross-case reddi — karar caseA’da ama link caseOther iddiasi', async () => {
    await mkDecision('dec-xc', caseA);
    await expect(
      service.linkAttempt({ ...cmd, cpeDecisionLogId: 'dec-xc', caseId: caseOther }),
    ).rejects.toThrow(UyapCpeDecisionLinkIntegrityError);
  });

  it('cross-attempt reddi — attempt baska operation iddiasi', async () => {
    await mkOperation('op-2', tenantA, caseA, userA);
    await mkDecision('dec-xa', caseA);
    await expect(
      service.linkAttempt({ ...cmd, cpeDecisionLogId: 'dec-xa', operationId: 'op-2' }),
    ).rejects.toThrow(UyapCpeDecisionLinkIntegrityError);
  });

  it('linkWithinTransaction caller-tx’e kompoze olur ve ROLLBACK propagate eder', async () => {
    await mkDecision('dec-rb', caseA);
    await expect(
      prisma.$transaction(async (tx) => {
        await service.linkWithinTransaction(tx, { ...cmd, cpeDecisionLogId: 'dec-rb' });
        throw new Error('caller-rollback');
      }),
    ).rejects.toThrow('caller-rollback');
    expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { cpeDecisionLogId: 'dec-rb' } })).toBe(0);
  });

  it('writer UyapRequestLog/CpeDecisionLog’a YAZMAZ (yalniz link tablosu)', async () => {
    const before = await prisma.cpeDecisionLog.count();
    await mkDecision('dec-noside', caseA);
    await service.linkAttempt({ ...cmd, cpeDecisionLogId: 'dec-noside' });
    // yeni CpeDecisionLog yalniz mkDecision ile (+1), writer ekstra yazmadi
    expect(await prisma.cpeDecisionLog.count()).toBe(before + 1);
  });
});
