import { PrismaClient } from '@prisma/client';
import { UyapOperationEvidenceOrchestrator } from './uyap-operation-evidence.orchestrator';
import { UyapOperationWriterService } from './uyap-operation-writer.service';
import { UyapCpeDecisionLinkWriterService } from './uyap-cpe-decision-link-writer.service';
import { UyapOperationIdempotencyConflictError } from './uyap-operation-writer.errors';

/**
 * P05C-P04 — orchestrator TX-1 gerçek DB davranışı (disposable PostgreSQL 16).
 * exact replay reuse, concurrent replay, cross-tenant isolation, atomik rollback.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5442/hukuk_test
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe('P05C-P04 orchestrator — disposable DB', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  // UYAP-AUTHORITY-FRESHNESS-TX-I01: TX-1 artık ilk adımda authority revalidation yapar.
  // Bu dosyanın konusu KOMPOZİSYON/İDEMPOTENCY'dir (replay reuse, conflict, concurrency,
  // rollback); tazelik davranışı gerçek DB üzerinde AYRI spec'te kanıtlanır
  // (`uyap-authority-freshness.db-gated.integration.spec.ts`). Bu yüzden burada
  // "her zaman taze" bir snapshot servisi stub'ı verilir; senaryoların anlamı DEĞİŞMEDİ.
  const alwaysFreshSnapshots = {
    revalidate: async () => ({ fresh: true as const, snapshot: {} as any }),
  };
  const orch = new UyapOperationEvidenceOrchestrator(
    prisma as any,
    { get: () => undefined } as any, // flag config bu testte kullanılmaz (recordEvidence doğrudan çağrılır)
    new UyapOperationWriterService(prisma as any),
    new UyapCpeDecisionLinkWriterService(prisma as any),
    alwaysFreshSnapshots as any,
  );

  let tenantA: string;
  let tenantB: string;
  let caseA: string;
  let userA: string;
  let userB: string;

  const mkDecision = (id: string, caseId: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "CpeDecisionLog" ("id","caseId","actionCode","scope","allowed","code","reason","factsUsedKeys")
       VALUES ($1,$2,'UYAP_SEND','CASE',true,'OK','t',ARRAY[]::text[])`,
      id, caseId,
    );

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');
    const s = Date.now();
    tenantA = (await prisma.tenant.create({ data: { name: 'P04 A', slug: `p04-a-${s}` } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: 'P04 B', slug: `p04-b-${s}` } })).id;
    userA = (await prisma.user.create({ data: { tenantId: tenantA, email: `p04a-${s}@t.test`, name: 'A', surname: 'K' } })).id;
    userB = (await prisma.user.create({ data: { tenantId: tenantB, email: `p04b-${s}@t.test`, name: 'B', surname: 'K' } })).id;
    caseA = (await prisma.case.create({ data: { tenantId: tenantA, fileNumber: `P04-${s}`, type: 'GENERAL_EXECUTION' } })).id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttemptCpeDecisionLink"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapAttempt"');
    await prisma.$executeRawUnsafe('DELETE FROM "UyapOperation"');
    await prisma.$executeRawUnsafe('DELETE FROM "CpeDecisionLog"');
    await prisma.case.deleteMany({ where: { id: caseA } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  const cmd = (over: Partial<Parameters<typeof orch.recordEvidence>[0]> = {}) => ({
    tenantId: tenantA,
    caseId: caseA,
    actorUserId: userA,
    action: 'UYAP_SEND' as const,
    idempotencyToken: 'stable-retry-token-abc',
    cpeDecisionLogId: 'dec-1',
    // UYAP-AUTHORITY-FRESHNESS-TX-I01: TX-1 Phase 1 snapshot'ı ister; bu dosyada
    // revalidation stub'lanmış olduğu için içeriği anlamlı DEĞİLDİR.
    authoritySnapshot: {} as any,
    ...over,
  });

  it('ilk çağrı: operation + attempt#1 + link yazar (atomik)', async () => {
    await mkDecision('dec-1', caseA);
    const r = await orch.recordEvidence(cmd());
    expect(r.operationReused).toBe(false);
    expect(r.firstAttempt.attemptNumber).toBe(1);
    expect(r.link.cpeDecisionLogId).toBe('dec-1');
    expect(r.operation.actorUserId).toBe(userA);
    expect(r.operation.actingLawyerId).toBeNull();
  });

  it('EXACT REPLAY (aynı token) → operation REUSE, duplicate YOK', async () => {
    await mkDecision('dec-2', caseA);
    // aynı token, yeni CPE kararı → operation reuse, yeni decision link'lenir
    const r = await orch.recordEvidence(cmd({ cpeDecisionLogId: 'dec-2' }));
    expect(r.operationReused).toBe(true);
    // tek operation (idempotencyKey aynı)
    const key = `stable-retry-token-abc`;
    void key;
    expect(await prisma.uyapOperation.count({ where: { tenantId: tenantA, actorUserId: userA } })).toBe(1);
  });

  it('aynı token + FARKLI actor (incompatible envelope) → IdempotencyConflictError', async () => {
    await mkDecision('dec-3', caseA);
    // farklı actorUserId → envelope uyuşmaz → conflict (silent reuse YOK)
    await expect(
      orch.recordEvidence(cmd({ cpeDecisionLogId: 'dec-3', actorUserId: userB })),
    ).rejects.toBeInstanceOf(UyapOperationIdempotencyConflictError);
  });

  it('CONCURRENT same-token replay → tek operation', async () => {
    for (let i = 0; i < 5; i++) await mkDecision(`dec-c${i}`, caseA);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        orch.recordEvidence(cmd({ idempotencyToken: 'concurrent-token-xyz', cpeDecisionLogId: `dec-c${i}` })),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(ok.length).toBeGreaterThan(0);
    const opIds = new Set(ok.map((r) => r.value.operation.id));
    expect(opIds.size).toBe(1); // tek operation
  });

  it('CROSS-TENANT same-token izolasyonu → ayrı operation', async () => {
    const caseB = (await prisma.case.create({ data: { tenantId: tenantB, fileNumber: `P04B-${Date.now()}`, type: 'GENERAL_EXECUTION' } })).id;
    await mkDecision('dec-tb', caseB);
    const r = await orch.recordEvidence({
      tenantId: tenantB, caseId: caseB, actorUserId: userB, action: 'UYAP_SEND',
      idempotencyToken: 'stable-retry-token-abc', cpeDecisionLogId: 'dec-tb',
      authoritySnapshot: {} as any,
    });
    // aynı token ama tenantB → ayrı key → ayrı operation (tenantA'nınkinden bağımsız)
    expect(r.operationReused).toBe(false);
    await prisma.uyapAttemptCpeDecisionLink.deleteMany({ where: { caseId: caseB } });
    await prisma.uyapAttempt.deleteMany({ where: { tenantId: tenantB } });
    await prisma.uyapOperation.deleteMany({ where: { tenantId: tenantB } });
    await prisma.cpeDecisionLog.deleteMany({ where: { id: 'dec-tb' } });
    await prisma.case.deleteMany({ where: { id: caseB } });
  });

  it('ATOMİK ROLLBACK: link geçersiz cpeDecisionLogId → operation da yazılmaz', async () => {
    const before = await prisma.uyapOperation.count();
    await expect(
      orch.recordEvidence(cmd({ idempotencyToken: 'rollback-token-999', cpeDecisionLogId: 'YOK-decision' })),
    ).rejects.toThrow();
    // TX-1 atomik: link FK reddi → operation rollback
    expect(await prisma.uyapOperation.count()).toBe(before);
  });
});
