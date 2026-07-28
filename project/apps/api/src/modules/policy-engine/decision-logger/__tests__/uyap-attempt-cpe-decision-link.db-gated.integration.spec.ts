import { PrismaClient } from '@prisma/client';
import { DecisionLogRetentionService } from '../decision-log-retention.service';

/**
 * UYAP-ATTEMPT-CPE-DECISION-LINK-P05C-P02 — disposable PostgreSQL 16 integration.
 *
 * Kanitlar: (1) uc composite FK case-attribution zincirini KAPATIR, (2) cardinality
 * 1 attempt -> N karar ve ayni kararin ikinci attempt'e baglanmasi DB'de REDDEDILIR,
 * (3) parent silmeleri fail-closed (RESTRICT), (4) retention bagli kaydi SILMEZ ve
 * bagli satir yuzunden HATA VERMEZ, (5) link kalkinca kayit normal rejime doner.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5435/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('P05C-P02 — link + legal hold (DB)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  let tenantA: string;
  let tenantB: string;
  let caseA: string;
  let caseOther: string;
  let userA: string;

  const OLD = new Date('2020-01-01T00:00:00Z'); // cutoff'un cok oncesi

  const mkOperation = async (id: string, tenantId: string, caseId: string | null, actorUserId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "UyapOperation" ("id","tenantId","caseId","operationType","actorUserId","idempotencyKey","updatedAt")
       VALUES ($1,$2,$3,'HACIZ_TALEBI',$4,$5,NOW())`,
      id,
      tenantId,
      caseId,
      actorUserId,
      `idem-${id}`,
    );

  const mkAttempt = async (id: string, tenantId: string, operationId: string, n: number, prev: string | null) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "UyapAttempt" ("id","tenantId","operationId","attemptNumber","previousAttemptId","startedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      id,
      tenantId,
      operationId,
      n,
      prev,
    );

  const mkDecision = async (id: string, caseId: string, createdAt: Date) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "CpeDecisionLog" ("id","caseId","actionCode","scope","allowed","code","reason","factsUsedKeys","createdAt")
       VALUES ($1,$2,'UYAP_QUERY','CASE',true,'OK','test',ARRAY[]::text[],$3)`,
      id,
      caseId,
      createdAt,
    );

  const mkLink = async (id: string, tenantId: string, caseId: string, operationId: string, attemptId: string, decisionId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "UyapAttemptCpeDecisionLink" ("id","tenantId","caseId","operationId","attemptId","cpeDecisionLogId","linkedAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      id,
      tenantId,
      caseId,
      operationId,
      attemptId,
      decisionId,
    );

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');

    const s = Date.now();
    tenantA = (await prisma.tenant.create({ data: { name: 'P02 A', slug: `p02-a-${s}` } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: 'P02 B', slug: `p02-b-${s}` } })).id;
    userA = (await prisma.user.create({ data: { tenantId: tenantA, email: `p02-${s}@t.test`, name: 'A', surname: 'K' } })).id;
    caseA = (await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P02-${s}`, type: 'GENERAL_EXECUTION' } })).id;
    caseOther = (await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P02-O-${s}`, type: 'GENERAL_EXECUTION' } })).id;

    await mkOperation('op-1', tenantA, caseA, userA);
    await mkAttempt('att-1', tenantA, 'op-1', 1, null);
    await mkAttempt('att-2', tenantA, 'op-1', 2, 'att-1');
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

  describe('cardinality', () => {
    it('1 attempt -> N karar baglanabilir', async () => {
      await mkDecision('d-1', caseA, new Date());
      await mkDecision('d-2', caseA, new Date());
      await expect(mkLink('l-1', tenantA, caseA, 'op-1', 'att-1', 'd-1')).resolves.toBeDefined();
      await expect(mkLink('l-2', tenantA, caseA, 'op-1', 'att-1', 'd-2')).resolves.toBeDefined();
      expect(await prisma.uyapAttemptCpeDecisionLink.count({ where: { attemptId: 'att-1' } })).toBe(2);
    });

    it('AYNI karar BASKA attempt e baglanamaz (UYAP-CONST-002 tasima yasagi)', async () => {
      await expect(mkLink('l-3', tenantA, caseA, 'op-1', 'att-2', 'd-1')).rejects.toThrow();
    });

    it('AYNI karar ayni attempt e ikinci kez baglanamaz', async () => {
      await expect(mkLink('l-4', tenantA, caseA, 'op-1', 'att-1', 'd-1')).rejects.toThrow();
    });
  });

  describe('case attribution zinciri (uc composite FK)', () => {
    it('BASKA dosyanin karari baglanamaz — attempt in operation i caseA da', async () => {
      await mkDecision('d-other', caseOther, new Date());
      // link.caseId = caseOther verilirse operation FK, caseA verilirse decision FK reddeder
      await expect(mkLink('l-x1', tenantA, caseOther, 'op-1', 'att-1', 'd-other')).rejects.toThrow();
      await expect(mkLink('l-x2', tenantA, caseA, 'op-1', 'att-1', 'd-other')).rejects.toThrow();
    });

    it('cross-tenant link reddedilir', async () => {
      await mkDecision('d-t', caseA, new Date());
      await expect(mkLink('l-x3', tenantB, caseA, 'op-1', 'att-1', 'd-t')).rejects.toThrow();
    });

    it('attempt baska bir operation a aitmis gibi baglanamaz', async () => {
      await mkOperation('op-2', tenantA, caseA, userA);
      await mkDecision('d-op2', caseA, new Date());
      await expect(mkLink('l-x4', tenantA, caseA, 'op-2', 'att-1', 'd-op2')).rejects.toThrow();
    });
  });

  describe('delete fail-closed (RESTRICT)', () => {
    it('bagli karar SILINEMEZ', async () => {
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "CpeDecisionLog" WHERE id = 'd-1'`)).rejects.toThrow();
    });

    it('bagli attempt SILINEMEZ', async () => {
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "UyapAttempt" WHERE id = 'att-1'`)).rejects.toThrow();
    });

    it('bagli operation SILINEMEZ (attempt cascade i RESTRICT e carpar)', async () => {
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "UyapOperation" WHERE id = 'op-1'`)).rejects.toThrow();
    });
  });

  describe('referential legal hold — retention', () => {
    const service = () => new DecisionLogRetentionService(prisma as any);

    // UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: retention cron'u ARTIK HICBIR KAYDI SILMEZ.
    // Onceki hal "arsivler" diyip `deleteMany` cagiriyordu; `CpeDecisionLogArchive`
    // modeli sema/migration'da HIC YOKTU -> 90 gunden eski her CPE karar delili her
    // gece KALICI olarak imha ediliyordu. Yikici yol kapatildi (owner §12 containment);
    // gercek arsiv sozlesmesi ARCH-4'e aittir.
    it('ESKI + BAGLI karar silinmez; ESKI + BAGSIZ karar da SILINMEZ; cron HATA VERMEZ', async () => {
      await mkDecision('d-old-linked', caseA, OLD);
      await mkDecision('d-old-unlinked', caseA, OLD);
      await mkLink('l-hold', tenantA, caseA, 'op-1', 'att-2', 'd-old-linked');

      await expect(service().archiveOldRecords()).resolves.toBeUndefined();

      expect(await prisma.cpeDecisionLog.findUnique({ where: { id: 'd-old-linked' } })).not.toBeNull();
      expect(await prisma.cpeDecisionLog.findUnique({ where: { id: 'd-old-unlinked' } })).not.toBeNull();
    });

    it('legal-hold ADAY SAYIMI: bagli karar aday DEGIL, bagsiz karar adaydir', async () => {
      const withHold = await service().sweep();
      expect(withHold.deleted).toBe(0);
      expect(withHold.destructiveDisabled).toBe(true);
      // `d-old-unlinked` aday; `d-old-linked` legal-hold nedeniyle aday degil.
      expect(withHold.eligibleCandidates).toBeGreaterThanOrEqual(1);

      await prisma.$executeRawUnsafe(`DELETE FROM "UyapAttemptCpeDecisionLink" WHERE id = 'l-hold'`);

      const withoutHold = await service().sweep();
      // Link kalkinca kayit NORMAL rejime doner (aday sayisi artar) — ama yine SILINMEZ.
      expect(withoutHold.eligibleCandidates).toBeGreaterThan(withHold.eligibleCandidates);
      expect(await prisma.cpeDecisionLog.findUnique({ where: { id: 'd-old-linked' } })).not.toBeNull();
    });

    it('manualArchive CAGRILAMAZ — sessiz no-op degil, acik hata', async () => {
      await expect(service().manualArchive(1)).rejects.toThrow(
        /CPE_DECISION_LOG_RETENTION_DISABLED/,
      );
    });

    it('legal-hold filtresi deleteMany seviyesinde de uygulanir (atomik)', async () => {
      await mkDecision('d-atomic', caseA, OLD);
      await mkLink('l-atomic', tenantA, caseA, 'op-1', 'att-2', 'd-atomic');

      // id acikca verilse dahi bagli satir silinmez
      const res = await prisma.cpeDecisionLog.deleteMany({
        where: { id: { in: ['d-atomic'] }, createdAt: { lt: new Date() }, uyapAttemptLinks: { none: {} } },
      });
      expect(res.count).toBe(0);
      expect(await prisma.cpeDecisionLog.findUnique({ where: { id: 'd-atomic' } })).not.toBeNull();
    });
  });
});
