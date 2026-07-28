/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — TX-1 revalidation, GERÇEK DB (disposable PostgreSQL 16).
 *
 * Birim testler mantığı kanıtlar; bu spec **gerçek transaction sınırını** kanıtlar:
 * stale authority hâlinde `UyapOperation` / `UyapAttempt` / `UyapAttemptCpeDecisionLink`
 * için **0 satır** kalır (FR-03/FR-10) ve orphan üretilmez.
 *
 * Tam yetki zinciri gerçek satırlarla kurulur:
 * `Tenant → User → Lawyer → Client → Case → CaseClient → ClientPowerOfAttorney → PoaLawyer`.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5442/hukuk_test
 */
import { PrismaClient } from '@prisma/client';
import { UyapOperationEvidenceOrchestrator } from '../operation-writer/uyap-operation-evidence.orchestrator';
import { UyapOperationWriterService } from '../operation-writer/uyap-operation-writer.service';
import { UyapCpeDecisionLinkWriterService } from '../operation-writer/uyap-cpe-decision-link-writer.service';
import { UyapAuthoritySnapshotService } from './uyap-authority-snapshot.service';
import { UyapSendAuthorityResolverService } from './uyap-send-authority-resolver.service';
import { ActingLawyerResolverService } from '../../lawyer/acting-lawyer-resolver.service';
import { ExpenseBlockReasonService } from '../../expense-block-reason/expense-block-reason.service';
import {
  MockUyapAvailabilityService,
  UyapAvailabilityService,
} from '../../policy-engine/fact-store/uyap-availability.service';
import { UyapAuthorityStaleError } from './uyap-authority-stale.error';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('UYAP-AUTHORITY-FRESHNESS-TX-I01 — gerçek DB TX-1 revalidation', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const availability = new MockUyapAvailabilityService();

  const snapshots = new UyapAuthoritySnapshotService(
    prisma as any,
    new ActingLawyerResolverService(prisma as any),
    new UyapSendAuthorityResolverService(prisma as any),
    new ExpenseBlockReasonService(prisma as any),
    availability as unknown as UyapAvailabilityService,
  );

  const orch = new UyapOperationEvidenceOrchestrator(
    prisma as any,
    { get: () => undefined } as any,
    new UyapOperationWriterService(prisma as any),
    new UyapCpeDecisionLinkWriterService(prisma as any),
    snapshots,
  );

  let tenantId: string;
  let userId: string;
  let lawyerId: string;
  let clientId: string;
  let caseId: string;
  let poaId: string;
  let decisionSeq = 0;

  const mkDecision = async (id: string) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CpeDecisionLog" ("id","caseId","actionCode","scope","allowed","code","reason","factsUsedKeys")
       VALUES ($1,$2,'UYAP_SEND','CASE',true,'OK','t',ARRAY[]::text[])`,
      id,
      caseId,
    );
    return id;
  };

  const cleanEvidence = async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
  };

  const evidenceCounts = async () => ({
    operations: await prisma.uyapOperation.count({ where: { tenantId } }),
    attempts: await prisma.uyapAttempt.count({ where: { tenantId } }),
    links: await prisma.uyapAttemptCpeDecisionLink.count({ where: { tenantId } }),
  });

  /** Phase 1 snapshot — gerçek satırlardan üretilir (server-side). */
  const phase1 = async () => {
    const result = await snapshots.build({
      tenantId,
      authenticatedUserId: userId,
      caseId,
      actionCode: 'UYAP_SEND',
      evaluatedAt: new Date(),
    });
    if (!result.ok) throw new Error(`phase1 snapshot uretilemedi: ${result.failureCode}`);
    return result.snapshot;
  };

  const record = async (snapshot: any, token: string) => {
    const decId = await mkDecision(`fx-dec-${++decisionSeq}`);
    return orch.recordEvidence({
      tenantId,
      caseId,
      actorUserId: userId,
      action: 'UYAP_SEND',
      idempotencyToken: token,
      cpeDecisionLogId: decId,
      authoritySnapshot: snapshot,
    });
  };

  beforeAll(async () => {
    await cleanEvidence();
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');

    const s = Date.now();
    tenantId = (await prisma.tenant.create({ data: { name: 'FX', slug: `fx-${s}` } })).id;
    userId = (
      await prisma.user.create({
        data: { tenantId, email: `fx-${s}@t.test`, name: 'F', surname: 'X' },
      })
    ).id;
    lawyerId = (
      await prisma.lawyer.create({
        data: { tenantId, userId, name: 'Av', surname: 'Test', isActive: true },
      })
    ).id;
    clientId = (
      await prisma.client.create({ data: { tenantId, type: 'PERSON' } })
    ).id;
    caseId = (
      await prisma.case.create({
        data: { tenantId, fileNumber: `FX-${s}`, type: 'GENERAL_EXECUTION', allowUyapActions: true },
      })
    ).id;
    await prisma.caseClient.create({ data: { caseId, clientId } });
    poaId = (
      await prisma.clientPowerOfAttorney.create({
        data: {
          tenantId,
          clientId,
          status: 'ACTIVE',
          isActive: true,
          isLimited: false,
          dateIssued: new Date('2026-01-01T00:00:00.000Z'),
          scopeType: 'GENEL',
        },
      })
    ).id;
    await prisma.poaLawyer.create({ data: { tenantId, poaId, lawyerId } });
  });

  afterAll(async () => {
    await cleanEvidence();
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');
    await prisma.poaLawyer.deleteMany({ where: { tenantId } });
    await prisma.clientPowerOfAttorney.deleteMany({ where: { tenantId } });
    await prisma.caseClient.deleteMany({ where: { caseId } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanEvidence();
    availability.setAvailable(true);
    availability.setExplicitlyConfigured(true);
  });

  it('Phase 1 snapshot gerçek satırlardan üretilir ve digest taşır', async () => {
    const snapshot = await phase1();

    expect(snapshot.authorityDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.actingLawyer.actingLawyerId).toBe(lawyerId);
    expect(snapshot.clientIds).toEqual([clientId]);
    expect(snapshot.authorityEvidence.map((e) => e.poaId)).toEqual([poaId]);
  });

  it('TAZE authority → operation + attempt + link YAZILIR', async () => {
    const snapshot = await phase1();

    const result = await record(snapshot, `fresh-${Date.now()}`);

    expect(result.operationReused).toBe(false);
    expect(await evidenceCounts()).toEqual({ operations: 1, attempts: 1, links: 1 });
  });

  it('FR-03/FR-10: POA azledildi → 0 operation, 0 attempt, 0 link (atomik rollback)', async () => {
    const snapshot = await phase1();

    await prisma.clientPowerOfAttorney.update({
      where: { id: poaId },
      data: { status: 'REVOKED', isActive: false },
    });

    await expect(record(snapshot, `revoke-${Date.now()}`)).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );
    expect(await evidenceCounts()).toEqual({ operations: 0, attempts: 0, links: 0 });

    // geri al
    await prisma.clientPowerOfAttorney.update({
      where: { id: poaId },
      data: { status: 'ACTIVE', isActive: true },
    });
  });

  it('dosya kapatıldı → 0 satır', async () => {
    const snapshot = await phase1();
    await prisma.case.update({ where: { id: caseId }, data: { caseStatus: 'HITAM' } });

    await expect(record(snapshot, `closed-${Date.now()}`)).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );
    expect(await evidenceCounts()).toEqual({ operations: 0, attempts: 0, links: 0 });

    await prisma.case.update({ where: { id: caseId }, data: { caseStatus: 'DERDEST' } });
  });

  it('PoaLawyer ilişkisi silindi → 0 satır', async () => {
    const snapshot = await phase1();
    await prisma.poaLawyer.deleteMany({ where: { poaId, lawyerId } });

    await expect(record(snapshot, `rel-${Date.now()}`)).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );
    expect(await evidenceCounts()).toEqual({ operations: 0, attempts: 0, links: 0 });

    await prisma.poaLawyer.create({ data: { tenantId, poaId, lawyerId } });
  });

  it('Phase 1 SONRASI masraf bloğu açıldı → 0 satır', async () => {
    const snapshot = await phase1();
    const block = await prisma.expenseBlockReason.create({
      data: {
        tenantId,
        caseId,
        blockedActionCode: 'UYAP_SEND',
        reasonCode: 'PAYMENT_NOT_RECEIVED',
        status: 'OPEN',
        createdById: userId,
      },
    });

    await expect(record(snapshot, `block-${Date.now()}`)).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );
    expect(await evidenceCounts()).toEqual({ operations: 0, attempts: 0, links: 0 });

    await prisma.expenseBlockReason.delete({ where: { id: block.id } });
  });

  it('FR-08: sistem erişilebilirliği kapandı → 0 satır', async () => {
    const snapshot = await phase1();
    availability.setAvailable(false);

    await expect(record(snapshot, `avail-${Date.now()}`)).rejects.toMatchObject({
      failureCode: 'SYSTEM_AVAILABILITY_STALE',
    });
    expect(await evidenceCounts()).toEqual({ operations: 0, attempts: 0, links: 0 });
  });

  /**
   * Owner §15 — PERFORMANS: revalidation N+1 ÜRETMEMELİDİR.
   *
   * Sorgu sayısı, POA/client sayısından BAĞIMSIZ olmalıdır: I03 tek `findMany` ile
   * bütün POA'ları `clientId IN (...)` biçiminde çeker, `PoaLawyer` nested select ile
   * aynı sorguda gelir.
   */
  it('§15: snapshot sorgu sayısı client/POA sayısıyla BÜYÜMEZ (N+1 yok)', async () => {
    const countQueries = async (fn: () => Promise<unknown>) => {
      const logged = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
        log: [{ emit: 'event', level: 'query' }],
      });
      let n = 0;
      (logged as any).$on('query', () => { n++; });
      const svc = new UyapAuthoritySnapshotService(
        logged as any,
        new ActingLawyerResolverService(logged as any),
        new UyapSendAuthorityResolverService(logged as any),
        new ExpenseBlockReasonService(logged as any),
        availability as unknown as UyapAvailabilityService,
      );
      await fn.call({ svc });
      const built = await svc.build({
        tenantId,
        authenticatedUserId: userId,
        caseId,
        actionCode: 'UYAP_SEND',
        evaluatedAt: new Date(),
      });
      expect(built.ok).toBe(true);
      await logged.$disconnect();
      return n;
    };

    const withOne = await countQueries(async () => {});

    // İkinci ve üçüncü müvekkil + POA + ilişki ekle.
    const extras: Array<{ clientId: string; poaId: string }> = [];
    for (let i = 0; i < 2; i++) {
      const c = await prisma.client.create({ data: { tenantId, type: 'PERSON' } });
      await prisma.caseClient.create({ data: { caseId, clientId: c.id } });
      const p = await prisma.clientPowerOfAttorney.create({
        data: {
          tenantId,
          clientId: c.id,
          status: 'ACTIVE',
          isActive: true,
          isLimited: false,
          dateIssued: new Date('2026-01-01T00:00:00.000Z'),
          scopeType: 'GENEL',
        },
      });
      await prisma.poaLawyer.create({ data: { tenantId, poaId: p.id, lawyerId } });
      extras.push({ clientId: c.id, poaId: p.id });
    }

    const withThree = await countQueries(async () => {});

    // Sorgu sayısı AYNI kalmalı (bounded, tenant-scoped, sabit sayıda sorgu).
    expect(withThree).toBe(withOne);
    // ÖLÇÜLEN sabit: 9 sorgu (1 client/1 POA ile de, 3 client/3 POA ile de).
    // Bu sayı artarsa N+1 veya gereksiz sorgu eklenmiş demektir → CI kırmızıya döner.
    expect(withOne).toBe(9);

    // temizle
    for (const e of extras) {
      await prisma.poaLawyer.deleteMany({ where: { poaId: e.poaId } });
      await prisma.clientPowerOfAttorney.delete({ where: { id: e.poaId } });
      await prisma.caseClient.deleteMany({ where: { caseId, clientId: e.clientId } });
      await prisma.client.delete({ where: { id: e.clientId } });
    }
  });

  it('FR-12: eşzamanlı aynı idempotency key → TEK operation (stale değilken)', async () => {
    const snapshot = await phase1();
    const token = `concurrent-${Date.now()}`;

    const results = await Promise.allSettled([
      record(snapshot, token),
      record(snapshot, token),
      record(snapshot, token),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => r.value.operation.id)).size).toBe(1);
    expect((await evidenceCounts()).operations).toBe(1);
  });
});
