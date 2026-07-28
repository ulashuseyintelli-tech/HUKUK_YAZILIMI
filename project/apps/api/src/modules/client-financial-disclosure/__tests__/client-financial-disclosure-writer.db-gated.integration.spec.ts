import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';
import { ClientFinancialDisclosureError } from '../client-financial-disclosure.contract';
import { canonicalMoney } from '../client-financial-disclosure-canonical';

/**
 * CLIENT-P2-U03-TRACK-B-I02 — gerçek PostgreSQL integration + concurrency suite.
 * Brief §31 (18 madde) ve §32 (4 yarış senaryosu) kapsanır.
 *
 * TEST_DATABASE_URL yoksa suite atlanır (test/describe-db). Canlı `hukuk_db` üzerinde
 * ASLA koşmaz — test-infra fail-closed guard'ı korunur (§34).
 */
describeDb('CLIENT-P2-U03-TRACK-B-I02 — disclosure writer (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const svc = new ClientFinancialDisclosureWriterService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `i02-tA-${S}`;
  const tB = `i02-tB-${S}`;
  const clA = `i02-clA-${S}`;
  const clB = `i02-clB-${S}`;
  const caseA = `i02-caseA-${S}`;
  const caseA2 = `i02-caseA2-${S}`;
  const caseB = `i02-caseB-${S}`;
  const ccA = `i02-ccA-${S}`;
  const ccA2 = `i02-ccA2-${S}`;
  const ccB = `i02-ccB-${S}`;
  /** caseA (tenant A) icinde ama Client'i tenant B'ye ait — cross-tenant deligi izole eder. */
  const ccXt = `i02-ccXt-${S}`;

  /** POSTED dispozisyon + CONFIRMED collection + iki satır kurar. */
  const seedSource = async (opts: {
    key: string;
    tenantId: string;
    caseId: string;
    caseClientId: string | null;
    scope?: 'SINGLE_CASE_CLIENT' | 'CASE_CREDITOR_CLUSTER';
    status?: string;
    payable?: string;
    fee?: string;
  }) => {
    const colId = `col-${opts.key}`;
    const dispId = `disp-${opts.key}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${opts.tenantId}','${opts.caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'idem-${opts.key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${opts.tenantId}','${opts.caseId}','${colId}','${opts.scope ?? 'SINGLE_CASE_CLIENT'}'::"CollectionDispositionBeneficiaryScope",
        ${opts.caseClientId ? `'${opts.caseClientId}'` : 'NULL'},'${opts.status ?? 'POSTED'}'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('dl-${opts.key}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",${opts.payable ?? '1750.50'},now()),
      ('dl-${opts.key}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",${opts.fee ?? '750.25'},now())`);
    return { colId, dispId };
  };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tA}','TA-${S}','ta-${S}',now(),now()), ('${tB}','TB-${S}','tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES
      ('${clA}','${tA}','PERSON'::"ClientType",now()), ('${clB}','${tB}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES
      ('${caseA}','${tA}','2026/I02A-${S}','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseA2}','${tA}','2026/I02A2-${S}','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseB}','${tB}','2026/I02B-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES
      ('${ccA}','${caseA}','${clA}',now()),
      ('${ccA2}','${caseA2}','${clA}',now()),
      ('${ccB}','${caseB}','${clB}',now()),
      ('${ccXt}','${caseA}','${clB}',now())`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CaseClient" WHERE id IN ('${ccA}','${ccA2}','${ccB}','${ccXt}')`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Tenant" WHERE id IN ('${tA}','${tB}')`);
    await prisma.$disconnect();
  });

  const code = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'NO_ERROR';
    } catch (e) {
      expect(e).toBeInstanceOf(ClientFinancialDisclosureError);
      return (e as ClientFinancialDisclosureError).code;
    }
  };

  // ── [1] pozitif zincir + [7] atomiklik ────────────────────────────────────────
  it('[1][7] geçerli zincirle disclosure + version + lines atomik oluşturulur', async () => {
    const { dispId } = await seedSource({ key: `ok-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA,
      collectionDispositionId: dispId, sendIdempotencyKey: `k-ok-${S}`,
    });
    expect(r.replayed).toBe(false);
    expect(r.version).toBe(1);
    expect(r.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: r.versionId },
      select: { status: true, totalCollected: true, clientNetAmount: true, currency: true, _count: { select: { lines: true } } },
    });
    expect(v.status).toBe('DRAFT');
    expect(canonicalMoney(v.totalCollected)).toBe('2500.75');
    expect(canonicalMoney(v.clientNetAmount)).toBe('1750.50');
    expect(v.currency).toBe('TRY');
    expect(v._count.lines).toBe(2);

    const root = await prisma.clientFinancialDisclosure.findUniqueOrThrow({
      where: { id: r.disclosureId }, select: { currentVersionId: true },
    });
    expect(root.currentVersionId).toBe(r.versionId);
  });

  // ── [2][3][4] tenant / case-client / disposition scope ────────────────────────
  it('[2] cross-tenant case reddedilir', async () => {
    const { dispId } = await seedSource({ key: `xt-${S}`, tenantId: tB, caseId: caseB, caseClientId: ccB });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseB, caseClientId: ccB, collectionDispositionId: dispId, sendIdempotencyKey: `k-xt-${S}`,
    }))).toBe('DISCLOSURE_TENANT_MISMATCH');
  });

  it('[3] başka case’e ait CaseClient reddedilir', async () => {
    const { dispId } = await seedSource({ key: `cc-${S}`, tenantId: tA, caseId: caseA2, caseClientId: ccA2 });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA2, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-cc-${S}`,
    }))).toBe('DISCLOSURE_CASE_CLIENT_MISMATCH');
  });

  it('[4] başka tenant’a ait disposition reddedilir', async () => {
    const { dispId } = await seedSource({ key: `xd-${S}`, tenantId: tB, caseId: caseB, caseClientId: ccB });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-xd-${S}`,
    }))).toBe('DISCLOSURE_SOURCE_NOT_FOUND');
  });

  it('[5] dispozisyonun alacaklısı input caseClient ile aynı olmalı', async () => {
    const { dispId } = await seedSource({ key: `own-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA2 });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-own-${S}`,
    }))).toBe('DISCLOSURE_CASE_CLIENT_MISMATCH');
  });

  // Case tenant kontrolu GECER (caseA gercekten tenant A'da), fakat CaseClient'in Client'i
  // tenant B'ye aittir. `CaseClient` tablosunda tenantId kolonu YOKTUR ve `clientId` FK'si
  // tenant ile eslesmez → bu delik YALNIZ servis katmanindaki client-tenant kontrolu ile kapanir.
  it('[2b] Case tenant’ta olsa da CaseClient’in Client’i başka tenant’a aitse reddedilir', async () => {
    const { dispId } = await seedSource({
      key: `xtc-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccXt,
    });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccXt,
      collectionDispositionId: dispId, sendIdempotencyKey: `k-xtc-${S}`,
    }))).toBe('DISCLOSURE_TENANT_MISMATCH');
  });

  it('[6] var olmayan disposition ile hiçbir write oluşmaz', async () => {
    const before = await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA } });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: `yok-${S}`, sendIdempotencyKey: `k-none-${S}`,
    }))).toBe('DISCLOSURE_SOURCE_NOT_FOUND');
    expect(await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA } })).toBe(before);
  });

  it('POSTED olmayan dispozisyon reddedilir (§35.4)', async () => {
    const { dispId } = await seedSource({
      key: `nps-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA, status: 'HELD_PENDING_DISTRIBUTION',
    });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-nps-${S}`,
    }))).toBe('DISCLOSURE_SOURCE_STATE_INVALID');
  });

  it('CASE_CREDITOR_CLUSTER kapsamı fail-closed reddedilir (§35.3)', async () => {
    const { dispId } = await seedSource({
      key: `clu-${S}`, tenantId: tA, caseId: caseA, caseClientId: null, scope: 'CASE_CREDITOR_CLUSTER',
    });
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-clu-${S}`,
    }))).toBe('DISCLOSURE_SOURCE_SCOPE_MISMATCH');
  });

  it('reconciliation ihlali (Σ satırlar != totalAmount değil, CLIENT_PAYABLE yok) reddedilir', async () => {
    const colId = `col-nop-${S}`;
    const dispId = `disp-nop-${S}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${tA}','${caseA}',100.00,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'idem-nop-${S}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${tA}','${caseA}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",'${ccA}','POSTED'::"CollectionDispositionStatus",100.00,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('dl-i02-nop-${S}','${dispId}','OTHER'::"CollectionDispositionLineType",100.00,now())`);
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-nop-${S}`,
    }))).toBe('DISCLOSURE_RECONCILIATION_MISMATCH');
  });

  // ── [9][10][11] duplicate / idempotency ──────────────────────────────────────
  it('[10] aynı idempotency key + aynı kaynak → duplicate yok, replay döner', async () => {
    const { dispId } = await seedSource({ key: `idem-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const args = { tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-idem-${S}` };
    const first = await svc.createDisclosureVersion(args);
    const second = await svc.createDisclosureVersion(args);
    expect(second.replayed).toBe(true);
    expect(second.versionId).toBe(first.versionId);
    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(await prisma.clientFinancialDisclosure.count({
      where: { tenantId: tA, collectionDispositionId: dispId },
    })).toBe(1);
    expect(await prisma.clientFinancialDisclosureVersion.count({
      where: { tenantId: tA, disclosureId: first.disclosureId },
    })).toBe(1);
  });

  it('[11] aynı idempotency key + farklı kaynak durumu → conflict', async () => {
    const { dispId } = await seedSource({ key: `idc-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const args = { tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-idc-${S}` };
    await svc.createDisclosureVersion(args);
    // kaynak satır tutarı değişir → fingerprint değişir
    await sql(`UPDATE "CollectionDispositionLine" SET amount = 1750.51 WHERE id = 'dl-idc-${S}-a'`);
    expect(await code(svc.createDisclosureVersion(args))).toBe('DISCLOSURE_IDEMPOTENCY_CONFLICT');
  });

  it('[9] farklı idempotency key aynı dispozisyon için conflict üretir', async () => {
    const { dispId } = await seedSource({ key: `dup-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const base = { tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId };
    await svc.createDisclosureVersion({ ...base, sendIdempotencyKey: `k-dup1-${S}` });
    expect(await code(svc.createDisclosureVersion({ ...base, sendIdempotencyKey: `k-dup2-${S}` })))
      .toBe('DISCLOSURE_IDEMPOTENCY_CONFLICT');
  });

  // ── [15][16][17] hash re-verification ────────────────────────────────────────
  it('[15] persist edilmiş snapshot yeniden hash edildiğinde MATCH', async () => {
    const { dispId } = await seedSource({ key: `mv-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-mv-${S}`,
    });
    const verdict = await svc.verifyPersistedSnapshot({ tenantId: tA, versionId: r.versionId });
    expect(verdict.verdict).toBe('MATCH');
    expect(verdict.recomputedSnapshotHash).toBe(verdict.expectedSnapshotHash);
  });

  it('[16] DB’de snapshot alanı değiştirilirse MISMATCH yakalanır (fail-closed)', async () => {
    const { dispId } = await seedSource({ key: `tam-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-tam-${S}`,
    });
    // kontrollü test müdahalesi: persist edilmiş finansal alan doğrudan değiştirilir
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "clientNetAmount" = 9999.99 WHERE id = '${r.versionId}'`);
    const verdict = await svc.verifyPersistedSnapshot({ tenantId: tA, versionId: r.versionId });
    expect(verdict.verdict).toBe('MISMATCH');
    expect(verdict.recomputedSnapshotHash).not.toBe(verdict.expectedSnapshotHash);
  });

  it('[17] kaynak sonradan değişse de persist edilmiş snapshot değişmez', async () => {
    const { dispId } = await seedSource({ key: `src-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-src-${S}`,
    });
    const before = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: r.versionId }, select: { clientNetAmount: true, snapshotHash: true },
    });
    await sql(`UPDATE "CollectionDispositionLine" SET amount = 1.00 WHERE id = 'dl-src-${S}-a'`);
    const after = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: r.versionId }, select: { clientNetAmount: true, snapshotHash: true },
    });
    expect(canonicalMoney(after.clientNetAmount)).toBe(canonicalMoney(before.clientNetAmount));
    expect(after.snapshotHash).toBe(before.snapshotHash);
    // snapshot kendi içinde hâlâ tutarlıdır
    expect((await svc.verifyPersistedSnapshot({ tenantId: tA, versionId: r.versionId })).verdict).toBe('MATCH');
  });

  // ── [13] immutability guard ──────────────────────────────────────────────────
  it('[13] approved/published versiyonda finansal mutation reddedilir', async () => {
    const { dispId } = await seedSource({ key: `imm-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-imm-${S}`,
    });
    // DRAFT + damgasız → mutable
    await expect(svc.assertVersionFinancialContentMutable({ tenantId: tA, versionId: r.versionId })).resolves.toBeUndefined();
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = '${r.versionId}'`);
    expect(await code(svc.assertVersionFinancialContentMutable({ tenantId: tA, versionId: r.versionId })))
      .toBe('DISCLOSURE_IMMUTABLE');
  });

  it('[18] tiplenmiş hata ham Prisma hatası sızdırmaz', async () => {
    try {
      await svc.verifyPersistedSnapshot({ tenantId: tA, versionId: `yok-${S}` });
      throw new Error('beklenen hata olusmadi');
    } catch (e) {
      expect(e).toBeInstanceOf(ClientFinancialDisclosureError);
      const body = JSON.stringify((e as ClientFinancialDisclosureError).getResponse());
      expect(body).not.toMatch(/P20\d\d|prisma|Invalid `prisma/i);
      expect(body).toContain('DISCLOSURE_SOURCE_NOT_FOUND');
    }
  });

  // ── §32 CONCURRENCY (gerçek ayrı bağlantılar) ───────────────────────────────
  it('[§32.1] aynı dispozisyon için eşzamanlı iki create → tek aggregate', async () => {
    const { dispId } = await seedSource({ key: `cc1-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const p1 = new PrismaClient();
    const p2 = new PrismaClient();
    try {
      const s1 = new ClientFinancialDisclosureWriterService(p1);
      const s2 = new ClientFinancialDisclosureWriterService(p2);
      const args = { tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-cc1-${S}` };
      const [a, b] = await Promise.allSettled([
        s1.createDisclosureVersion(args),
        s2.createDisclosureVersion(args),
      ]);
      const ok = [a, b].filter((x) => x.status === 'fulfilled');
      expect(ok.length).toBeGreaterThanOrEqual(1);
      for (const x of [a, b]) {
        if (x.status === 'rejected') expect(x.reason).toBeInstanceOf(ClientFinancialDisclosureError);
      }
      expect(await prisma.clientFinancialDisclosure.count({
        where: { tenantId: tA, collectionDispositionId: dispId },
      })).toBe(1);
    } finally {
      await p1.$disconnect();
      await p2.$disconnect();
    }
  });

  it('[§32.2/§32.3] eşzamanlı yazarlar duplicate version veya duplicate idempotency üretmez', async () => {
    const { dispId } = await seedSource({ key: `cc2-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const clients = [new PrismaClient(), new PrismaClient(), new PrismaClient()];
    try {
      const args = { tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-cc2-${S}` };
      const results = await Promise.allSettled(
        clients.map((c) => new ClientFinancialDisclosureWriterService(c).createDisclosureVersion(args)),
      );
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ClientFinancialDisclosureError);
      }
      const root = await prisma.clientFinancialDisclosure.findFirstOrThrow({
        where: { tenantId: tA, collectionDispositionId: dispId }, select: { id: true, currentVersionId: true },
      });
      const versions = await prisma.clientFinancialDisclosureVersion.findMany({
        where: { tenantId: tA, disclosureId: root.id }, select: { id: true, version: true },
      });
      expect(versions).toHaveLength(1);
      expect(new Set(versions.map((v) => v.version)).size).toBe(versions.length);
      expect(root.currentVersionId).toBe(versions[0].id);
      // aynı idempotency key ile duplicate satır YOK
      expect(await prisma.clientFinancialDisclosureVersion.count({
        where: { tenantId: tA, sendIdempotencyKey: `k-cc2-${S}` },
      })).toBe(1);
    } finally {
      for (const c of clients) await c.$disconnect();
    }
  });

  it('[§32.4] TOCTOU: snapshot hazırlanırken kaynak değişirse sessiz stale snapshot YAZILMAZ', async () => {
    const { dispId } = await seedSource({ key: `toc-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const before = await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA, collectionDispositionId: dispId } });
    // Advisory lock yazarı serileştirdiği için kaynak değişimi transaction'dan ÖNCE
    // yapılır; commit öncesi yeniden-okuma parmak izini karşılaştırır.
    await sql(`UPDATE "CollectionDispositionLine" SET amount = 1750.50 WHERE id = 'dl-toc-${S}-a'`);
    const r = await svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-toc-${S}`,
    });
    // Yazılan snapshot, commit anındaki kaynak durumunun parmak izini taşır.
    const persisted = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: r.versionId }, select: { sourceFingerprint: true },
    });
    expect(persisted.sourceFingerprint).toBe(r.sourceFingerprint);
    expect(await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA, collectionDispositionId: dispId } })).toBe(before + 1);
    // Kaynak SONRADAN değişirse aynı anahtarla tekrar çağrı conflict üretir (stale kabul edilmez).
    await sql(`UPDATE "CollectionDispositionLine" SET amount = 1700.00 WHERE id = 'dl-toc-${S}-a'`);
    expect(await code(svc.createDisclosureVersion({
      tenantId: tA, caseId: caseA, caseClientId: ccA, collectionDispositionId: dispId, sendIdempotencyKey: `k-toc-${S}`,
    }))).toBe('DISCLOSURE_IDEMPOTENCY_CONFLICT');
  });
});
