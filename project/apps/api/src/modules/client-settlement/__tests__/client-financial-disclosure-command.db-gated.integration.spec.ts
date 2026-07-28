import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { ClientFinancialDisclosureWriterService } from '../../client-financial-disclosure/client-financial-disclosure-writer.service';
import { ClientFinancialDisclosureCommandService } from '../client-financial-disclosure-command.service';
import type { DispositionPostingService } from '../disposition-posting.service';

/**
 * CLIENT-FD-ACT-R01-I03 — yetkili yazma entrypoint'i, gerçek PostgreSQL.
 *
 * Kapsanan: §11 aktivasyon kapısı (varsayılan KAPALI, fail-closed) · §9 yetkilendirme ve
 * IDOR/cross-tenant negatifleri · server-side scope türetimi · idempotency.
 *
 * TEST_DATABASE_URL yoksa suite atlanır. Canlı `hukuk_db` üzerinde ASLA koşmaz.
 */
describeDb('CLIENT-FD-ACT-R01-I03 — disclosure command entrypoint (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new ClientFinancialDisclosureWriterService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `fd3-tA-${S}`;
  const tB = `fd3-tB-${S}`;
  const clA = `fd3-clA-${S}`;
  const clB = `fd3-clB-${S}`;
  const caseA = `fd3-caseA-${S}`;
  const caseB = `fd3-caseB-${S}`;
  const ccA = `fd3-ccA-${S}`;
  const ccB = `fd3-ccB-${S}`;
  const uOk = `fd3-ok-${S}`;
  const uNo = `fd3-no-${S}`;

  /** `isPrepareEligible` sahtesi — bu suite entrypoint'i izole eder, yetki predikatını değil. */
  const eligible = new Set<string>([uOk]);
  const posting = {
    isPrepareEligible: async (userId: string, tenantId: string) =>
      eligible.has(userId) && tenantId === tA,
  } as unknown as DispositionPostingService;

  const svc = new ClientFinancialDisclosureCommandService(prisma as never, writer, posting);

  const ON = () => {
    process.env.CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED = 'true';
  };
  const OFF = () => {
    delete process.env.CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED;
  };

  const seedDisposition = async (o: {
    key: string; tenantId: string; caseId: string; caseClientId: string | null; status?: string;
  }) => {
    const colId = `fd3-col-${o.key}`;
    const dispId = `fd3-disp-${o.key}`;
    await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${o.tenantId}','${o.caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'fd3-idem-${o.key}',now())`);
    await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${o.tenantId}','${o.caseId}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        ${o.caseClientId ? `'${o.caseClientId}'` : 'NULL'},'${o.status ?? 'POSTED'}'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('fd3-dl-${o.key}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('fd3-dl-${o.key}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    return dispId;
  };

  const code = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'NO_ERROR';
    } catch (e) {
      const err = e as { constructor: { name: string }; getResponse?: () => unknown };
      const body = err.getResponse ? JSON.stringify(err.getResponse()) : '';
      const m = /"code":"([A-Z_]+)"/.exec(body);
      return m ? m[1] : err.constructor.name;
    }
  };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tA}','TA-${S}','fd3-ta-${S}',now(),now()), ('${tB}','TB-${S}','fd3-tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES
      ('${clA}','${tA}','PERSON'::"ClientType",now()), ('${clB}','${tB}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES
      ('${caseA}','${tA}','2026/FD3A-${S}','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseB}','${tB}','2026/FD3B-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES
      ('${ccA}','${caseA}','${clA}',now()), ('${ccB}','${caseB}','${clB}',now())`);
    await sql(`INSERT INTO "User"("id","tenantId","email","name","surname","isActive","updatedAt") VALUES
      ('${uOk}','${tA}','${uOk}@example.test','U','${uOk}',true,now()),
      ('${uNo}','${tA}','${uNo}@example.test','U','${uNo}',true,now())`);
  });

  afterAll(async () => {
    OFF();
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'fd3-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "User" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CaseClient" WHERE id IN ('${ccA}','${ccB}')`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Tenant" WHERE id IN ('${tA}','${tB}')`);
    await prisma.$disconnect();
  });

  beforeEach(() => OFF());

  // ── §11 AKTIVASYON KAPISI ─────────────────────────────────────────────────────
  it('[1] varsayılan KAPALI — flag yokken yazma REDDEDİLİR ve hiçbir kayıt oluşmaz', async () => {
    const dispId = await seedDisposition({ key: `g1-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    expect(await code(svc.createFromDisposition(tA, dispId, { userId: uOk }))).toBe(
      'DISCLOSURE_WRITE_NOT_ENABLED',
    );
    expect(await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA, collectionDispositionId: dispId } })).toBe(0);
  });

  it('[2] geçersiz/yanıltıcı flag değerleri AÇMAZ (fail-closed)', async () => {
    const dispId = await seedDisposition({ key: `g2-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    for (const value of ['', '1', 'yes', 'TRUE ', 'on', 'enabled', 'false', 'null']) {
      process.env.CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED = value;
      const expected = value.trim().toLowerCase() === 'true' ? 'NO_ERROR' : 'DISCLOSURE_WRITE_NOT_ENABLED';
      // 'TRUE ' trim+lowercase ile 'true' olur → ACAR; digerleri ACMAZ.
      expect(await code(svc.createFromDisposition(tA, dispId, { userId: uOk }))).toBe(expected);
      if (expected === 'NO_ERROR') break;
    }
    OFF();
  });

  // ── §9 YETKILENDIRME ve IDOR ──────────────────────────────────────────────────
  it('[3] yetkisiz aktör REDDEDİLİR (flag açıkken bile)', async () => {
    ON();
    const dispId = await seedDisposition({ key: `n3-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    expect(await code(svc.createFromDisposition(tA, dispId, { userId: uNo }))).toBe('ForbiddenException');
    expect(await prisma.clientFinancialDisclosure.count({ where: { tenantId: tA, collectionDispositionId: dispId } })).toBe(0);
  });

  it('[4] actor yoksa REDDEDİLİR', async () => {
    ON();
    const dispId = await seedDisposition({ key: `n4-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    expect(await code(svc.createFromDisposition(tA, dispId, {}))).toBe('BadRequestException');
  });

  it('[5] CROSS-TENANT dispozisyon ID’si bulunamaz (varlık sızmaz)', async () => {
    ON();
    const foreign = await seedDisposition({ key: `n5-${S}`, tenantId: tB, caseId: caseB, caseClientId: ccB });
    expect(await code(svc.createFromDisposition(tA, foreign, { userId: uOk }))).toBe('NotFoundException');
    expect(await prisma.clientFinancialDisclosure.count({ where: { collectionDispositionId: foreign } })).toBe(0);
  });

  it('[6] var olmayan dispozisyon AYNI cevabı üretir', async () => {
    ON();
    expect(await code(svc.createFromDisposition(tA, 'hic-olmayan', { userId: uOk }))).toBe('NotFoundException');
  });

  it('[7] POSTED olmayan dispozisyondan bildirim ÜRETİLEMEZ', async () => {
    ON();
    const draft = await seedDisposition({
      key: `n7-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA, status: 'DISTRIBUTION_APPROVED',
    });
    expect(await code(svc.createFromDisposition(tA, draft, { userId: uOk }))).toBe('BadRequestException');
  });

  it('[8] müvekkile bağlı olmayan dispozisyon REDDEDİLİR', async () => {
    ON();
    const noClient = await seedDisposition({ key: `n8-${S}`, tenantId: tA, caseId: caseA, caseClientId: null });
    expect(await code(svc.createFromDisposition(tA, noClient, { userId: uOk }))).toBe('BadRequestException');
  });

  // ── POZITIF: server-side scope + idempotency ─────────────────────────────────
  it('[9] yetkili aktör DRAFT bildirim üretir; scope SERVER TARAFINDA türetilir', async () => {
    ON();
    const dispId = await seedDisposition({ key: `p9-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createFromDisposition(tA, dispId, { userId: uOk });
    expect(r.status).toBe('DRAFT');
    expect(r.version).toBe(1);
    expect(r.replayed).toBe(false);

    const root = await prisma.clientFinancialDisclosure.findFirstOrThrow({
      where: { tenantId: tA, collectionDispositionId: dispId },
      select: { caseId: true, caseClientId: true, tenantId: true },
    });
    // Istemci HICBIR scope alani vermedi; ucu de dispozisyondan turetildi.
    expect(root.tenantId).toBe(tA);
    expect(root.caseId).toBe(caseA);
    expect(root.caseClientId).toBe(ccA);

    const version = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: r.disclosureVersionId },
      select: { status: true, sendIdempotencyKey: true },
    });
    expect(version.status).toBe('DRAFT');
    // Deterministik, caller'dan GELMEYEN anahtar.
    expect(version.sendIdempotencyKey).toBe(`client-financial-disclosure:${dispId}`);
  });

  it('[10] tekrar çağrı ikinci kayıt ÜRETMEZ (idempotent replay)', async () => {
    ON();
    const dispId = await seedDisposition({ key: `p10-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const first = await svc.createFromDisposition(tA, dispId, { userId: uOk });
    const second = await svc.createFromDisposition(tA, dispId, { userId: uOk });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.disclosureVersionId).toBe(first.disclosureVersionId);
    expect(await prisma.clientFinancialDisclosureVersion.count({ where: { tenantId: tA, disclosureId: first.disclosureId } })).toBe(1);
  });

  it('[11] yanıt domain nesnesi / hash / snapshot içeriği DÖNDÜRMEZ', async () => {
    ON();
    const dispId = await seedDisposition({ key: `p11-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    const r = await svc.createFromDisposition(tA, dispId, { userId: uOk });
    expect(Object.keys(r).sort()).toEqual([
      'disclosureId', 'disclosureVersionId', 'replayed', 'status', 'version',
    ]);
    const body = JSON.stringify(r);
    for (const forbidden of ['snapshotHash', 'sourceFingerprint', 'totalCollected', '1750.50', '2500.75', 'sendIdempotencyKey']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('[12] hata tipleri doğru HTTP sınıfına eşlenir', async () => {
    ON();
    const dispId = await seedDisposition({ key: `p12-${S}`, tenantId: tA, caseId: caseA, caseClientId: ccA });
    await expect(svc.createFromDisposition(tA, dispId, { userId: uNo })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.createFromDisposition(tA, 'yok', { userId: uOk })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createFromDisposition(tA, dispId, {})).rejects.toBeInstanceOf(BadRequestException);
    OFF();
    await expect(svc.createFromDisposition(tA, dispId, { userId: uOk })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
