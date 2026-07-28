import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { CLIENT_DISCLOSURE_ALLOWED_FIELDS } from '../../client-financial-disclosure/client-financial-disclosure-projection.contract';
import { ClientFinancialDisclosurePortalService } from '../client-financial-disclosure-portal.service';

/**
 * CLIENT-P2-U03-TRACK-B-I06 — portal adaptörü gerçek PostgreSQL suite'i.
 *
 * Adaptörün TEK işi I05 projeksiyonuna delege etmektir. Bu suite kanıtlar ki adaptör
 * kendi sorgusunu/alan seçimini/yetki kararını ÜRETMEZ ve kapsam `portalUserId`
 * üzerinden server tarafında çözülür — token'daki `clientId` KULLANILMAZ.
 */
describeDb('CLIENT-P2-U03-TRACK-B-I06 — portal disclosure adaptörü (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const svc = new ClientFinancialDisclosurePortalService(prisma as never);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `i06-tA-${S}`;
  const clA = `i06-clA-${S}`;
  const clB = `i06-clB-${S}`;
  const caseA = `i06-caseA-${S}`;
  const caseB = `i06-caseB-${S}`;
  const ccA = `i06-ccA-${S}`;
  const ccB = `i06-ccB-${S}`;
  const puA = `i06-puA-${S}`;
  const puB = `i06-puB-${S}`;

  const seed = async (o: {
    key: string; caseId: string; caseClientId: string; status: string;
    version?: number; rootId?: string; current?: boolean; published?: boolean; superseded?: boolean;
  }) => {
    const rootId = o.rootId ?? `i06-root-${o.key}`;
    const vId = `i06-v-${o.key}`;
    if (!o.rootId) {
      await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
        VALUES ('i06-col-${o.key}','${tA}','${o.caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'i06-idem-${o.key}',now())`);
      await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
        VALUES ('i06-disp-${o.key}','${tA}','${o.caseId}','i06-col-${o.key}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
          '${o.caseClientId}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
      await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt")
        VALUES ('i06-dl-${o.key}','i06-disp-${o.key}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now())`);
      await sql(`INSERT INTO "ClientFinancialDisclosure"("id","tenantId","caseId","caseClientId","collectionDispositionId","currency","createdAt","updatedAt")
        VALUES ('${rootId}','${tA}','${o.caseId}','${o.caseClientId}','i06-disp-${o.key}','TRY',now(),now())`);
    }
    await sql(`INSERT INTO "ClientFinancialDisclosureVersion"
      ("id","tenantId","disclosureId","version","status","sourceCollectionId","sourceCollectionAmount","sourceCollectionDate",
       "dispositionTotalAmount","dispositionPostedAt","currency","totalCollected","clientNetAmount","snapshotHash","sourceFingerprint",
       "sendIdempotencyKey","officeApprovedById","officeApprovedAt","contentApprovedById","contentApprovedAt",
       "notificationContent","notificationContentHash","approvedRecipientEmail","providerMessageId","providerAcceptedAt",
       "publishedAt","supersededAt","createdAt","updatedAt")
      VALUES ('${vId}','${tA}','${rootId}',${o.version ?? 1},'${o.status}'::"ClientFinancialDisclosureStatus",
       'i06-src-${o.key}',2500.75,'2026-07-01T09:30:00Z',2500.75,'2026-07-02T10:00:00Z','TRY',2500.75,1750.50,
       '${'e'.repeat(64)}','${'f'.repeat(64)}','i06-sik-${o.key}',
       'i06-approver-SECRET','2026-07-03T10:00:00Z','i06-content-SECRET','2026-07-04T10:00:00Z',
       'GIZLI METIN','${'0'.repeat(64)}','gizli-${o.key}@example.test',
       ${o.published ? `'PROVIDER-SECRET'` : 'NULL'}, ${o.published ? `'2026-07-05T10:00:00Z'` : 'NULL'},
       ${o.published ? `'2026-07-05T10:00:00Z'` : 'NULL'},
       ${o.superseded ? `'2026-07-06T10:00:00Z'` : 'NULL'}, now(), now())`);
    await sql(`INSERT INTO "ClientFinancialDisclosureLine"("id","tenantId","disclosureVersionId","type","amount","sourceDispositionLineId","sortOrder","createdAt")
      VALUES ('i06-l-${o.key}','${tA}','${vId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,'i06-dl-${o.rootId ? o.rootId.replace('i06-root-','') : o.key}',0,now())`);
    if (o.current) {
      await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = '${vId}' WHERE "id" = '${rootId}'`);
    }
    return { rootId, versionId: vId };
  };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES ('${tA}','TA-${S}','i06-ta-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES
      ('${clA}','${tA}','PERSON'::"ClientType",now()), ('${clB}','${tA}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES
      ('${caseA}','${tA}','2026/I06A-${S}','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseB}','${tA}','2026/I06B-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES
      ('${ccA}','${caseA}','${clA}',now()), ('${ccB}','${caseB}','${clB}',now())`);
    await sql(`INSERT INTO "ClientPortalUser"("id","clientId","email","passwordHash","isActive","updatedAt") VALUES
      ('${puA}','${clA}','pua-${S}@example.test','x',true,now()),
      ('${puB}','${clB}','pub-${S}@example.test','x',true,now())`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" = '${tA}'`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'i06-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "ClientPortalUser" WHERE id IN ('${puA}','${puB}')`);
    await sql(`DELETE FROM "CaseClient" WHERE id IN ('${ccA}','${ccB}')`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" = '${tA}'`);
    await sql(`DELETE FROM "Tenant" WHERE id = '${tA}'`);
    await prisma.$disconnect();
  });

  it('[1] güncel yüzey yalnız kendi müvekkilinin yayınlanmış kaydını taşır', async () => {
    const mine = await seed({ key: `a-${S}`, caseId: caseA, caseClientId: ccA, status: 'PUBLISHED', published: true, current: true });
    const other = await seed({ key: `b-${S}`, caseId: caseB, caseClientId: ccB, status: 'PUBLISHED', published: true, current: true });

    const cur = await svc.getCurrent(puA, tA);
    expect(cur.surface).toBe('CURRENT');
    expect(cur.items.map((i) => i.disclosureId)).toContain(mine.versionId);
    expect(cur.items.map((i) => i.disclosureId)).not.toContain(other.versionId);
  });

  it('[2] geçmiş yüzeyi AYRI kayıt kümesidir — iki yüzey KESİŞMEZ', async () => {
    const v1 = await seed({ key: `h1-${S}`, caseId: caseA, caseClientId: ccA, status: 'SUPERSEDED', version: 1, published: true, superseded: true });
    await seed({ key: `h2-${S}`, caseId: caseA, caseClientId: ccA, rootId: v1.rootId, status: 'PUBLISHED', version: 2, published: true, current: true });

    const cur = await svc.getCurrent(puA, tA);
    const his = await svc.getHistory(puA, tA);
    expect(his.surface).toBe('HISTORY');
    expect(his.items.map((i) => i.disclosureId)).toContain(v1.versionId);
    const overlap = cur.items.filter((c) => his.items.some((h) => h.disclosureId === c.disclosureId));
    expect(overlap).toHaveLength(0);
  });

  it('[3] yayınlanmamış kayıt hiçbir yüzeyde GÖRÜNMEZ', async () => {
    const draft = await seed({ key: `d-${S}`, caseId: caseA, caseClientId: ccA, status: 'CONTENT_APPROVED', current: true });
    const cur = await svc.getCurrent(puA, tA);
    const his = await svc.getHistory(puA, tA);
    expect(cur.items.map((i) => i.disclosureId)).not.toContain(draft.versionId);
    expect(his.items.map((i) => i.disclosureId)).not.toContain(draft.versionId);
    await expect(svc.getOne(puA, tA, draft.versionId)).rejects.toThrow();
  });

  it('[4] adaptör §35.14 alan sınırını AYNEN taşır ve sır SIZDIRMAZ', async () => {
    const mine = await seed({ key: `f-${S}`, caseId: caseA, caseClientId: ccA, status: 'PUBLISHED', published: true, current: true });
    const item = await svc.getOne(puA, tA, mine.versionId);
    expect(Object.keys(item).sort()).toEqual([...CLIENT_DISCLOSURE_ALLOWED_FIELDS].sort());
    const serialized = JSON.stringify(item);
    for (const secret of [
      'i06-approver-SECRET', 'i06-content-SECRET', 'GIZLI METIN',
      'PROVIDER-SECRET', 'e'.repeat(64), `i06-sik-f-${S}`, '@example.test',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('[5] başka müvekkilin kaydına doğrudan erişim REDDEDİLİR (portalUserId ile çözülür)', async () => {
    const other = await seed({ key: `x-${S}`, caseId: caseB, caseClientId: ccB, status: 'PUBLISHED', published: true, current: true });
    await expect(svc.getOne(puA, tA, other.versionId)).rejects.toThrow();
    // Sahibi icin erisilebilir — kapi kapsamli, kor degil.
    const own = await svc.getOne(puB, tA, other.versionId);
    expect(own.disclosureId).toBe(other.versionId);
  });

  it('[6] caseId filtresi kapsamı DARALTIR, genişletmez', async () => {
    await seed({ key: `c-${S}`, caseId: caseA, caseClientId: ccA, status: 'PUBLISHED', published: true, current: true });
    // Baska muvekkilin dosyasi verilse bile bos doner.
    expect((await svc.getCurrent(puA, tA, caseB)).items).toHaveLength(0);
    expect((await svc.getCurrent(puA, tA, caseA)).items.length).toBeGreaterThan(0);
  });
});
