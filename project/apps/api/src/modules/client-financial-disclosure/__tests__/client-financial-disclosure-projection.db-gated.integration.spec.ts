import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import {
  CLIENT_DISCLOSURE_ALLOWED_FIELDS,
  CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS,
  CLIENT_DISCLOSURE_FORBIDDEN_FIELDS,
  ClientDisclosureProjectionForbiddenError,
  ClientDisclosureProjectionNotFoundError,
} from '../client-financial-disclosure-projection.contract';
import {
  assertProjectionShape,
  ClientFinancialDisclosureProjectionService,
} from '../client-financial-disclosure-projection.service';

/**
 * CLIENT-P2-U03-TRACK-B-I05 — gerçek PostgreSQL yetki projeksiyonu suite'i.
 * Charter §35.7 (yalnız PUBLISHED client-görünür) + §35.14 (alan sınırı, iki AYRI yüzey).
 *
 * TEST_DATABASE_URL yoksa suite atlanır. Canlı `hukuk_db` üzerinde ASLA koşmaz.
 */
describeDb('CLIENT-P2-U03-TRACK-B-I05 — client disclosure projection (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const svc = new ClientFinancialDisclosureProjectionService(prisma);
  const sql = (q: string) => prisma.$executeRawUnsafe(q);

  const S = Math.random().toString(36).slice(2, 10);
  const tA = `i05-tA-${S}`;
  const tB = `i05-tB-${S}`;
  const clA = `i05-clA-${S}`; // yetkili muvekkil (tenant A)
  const clA2 = `i05-clA2-${S}`; // AYNI tenant, BASKA muvekkil
  const clB = `i05-clB-${S}`; // tenant B
  const caseA = `i05-caseA-${S}`;
  const caseA2 = `i05-caseA2-${S}`;
  const ccA = `i05-ccA-${S}`;
  const ccA2 = `i05-ccA2-${S}`;
  const puA = `i05-puA-${S}`; // clA portal kullanicisi
  const puA2 = `i05-puA2-${S}`; // clA2 portal kullanicisi
  const puOff = `i05-puOff-${S}`; // pasif portal kullanicisi (clB)

  /**
   * Disclosure kökü + tek versiyon kurar. Onay/gönderim zinciri I02–I04'te ayrıca
   * kanıtlandığı için burada doğrudan hedef statü yazılır — bu suite YETKİ ve ALAN
   * projeksiyonunu izole eder.
   */
  const seedVersion = async (o: {
    key: string;
    caseId: string;
    caseClientId: string;
    status: string;
    version?: number;
    rootId?: string;
    current?: boolean;
    published?: boolean;
    reversed?: boolean;
    superseded?: boolean;
    supersedesId?: string;
    tenantId?: string;
  }) => {
    const t = o.tenantId ?? tA;
    const rootId = o.rootId ?? `i05-root-${o.key}`;
    const vId = `i05-v-${o.key}`;
    const colId = `i05-col-${o.key}`;
    const dispId = `i05-disp-${o.key}`;
    if (!o.rootId) {
      await sql(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
        VALUES ('${colId}','${t}','${o.caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'i05-idem-${o.key}',now())`);
      await sql(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
        VALUES ('${dispId}','${t}','${o.caseId}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
          '${o.caseClientId}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
      await sql(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
        ('i05-dl-${o.key}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
        ('i05-dl-${o.key}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
      await sql(`INSERT INTO "ClientFinancialDisclosure"("id","tenantId","caseId","caseClientId","collectionDispositionId","currency","createdAt","updatedAt")
        VALUES ('${rootId}','${t}','${o.caseId}','${o.caseClientId}','${dispId}','TRY',now(),now())`);
    }
    await sql(`INSERT INTO "ClientFinancialDisclosureVersion"
      ("id","tenantId","disclosureId","version","status","sourceCollectionId","sourceCollectionAmount","sourceCollectionDate",
       "dispositionTotalAmount","dispositionPostedAt","currency","totalCollected","clientNetAmount","snapshotHash",
       "sourceFingerprint","sendIdempotencyKey","officeApprovedById","officeApprovedAt","contentApprovedById","contentApprovedAt",
       "notificationContent","notificationContentHash","approvedRecipientEmail","providerMessageId","providerAcceptedAt",
       "publishedAt","supersedesVersionId","supersededAt","reversedAt","correctionReason","createdAt","updatedAt")
      VALUES ('${vId}','${t}','${rootId}',${o.version ?? 1},'${o.status}'::"ClientFinancialDisclosureStatus",
       'i05-src-${o.key}',2500.75,'2026-07-01T09:30:00Z',2500.75,'2026-07-02T10:00:00Z','TRY',2500.75,1750.50,
       '${'b'.repeat(64)}','${'c'.repeat(64)}','i05-sik-${o.key}',
       'i05-approver-SECRET','2026-07-03T10:00:00Z','i05-content-approver-SECRET','2026-07-04T10:00:00Z',
       'GIZLI BILDIRIM METNI','${'d'.repeat(64)}','gizli-alici@example.test',
       ${o.published ? `'PROVIDER-MSG-SECRET'` : 'NULL'}, ${o.published ? `'2026-07-05T10:00:00Z'` : 'NULL'},
       ${o.published ? `'2026-07-05T10:00:00Z'` : 'NULL'},
       ${o.supersedesId ? `'${o.supersedesId}'` : 'NULL'},
       ${o.superseded ? `'2026-07-06T10:00:00Z'` : 'NULL'},
       ${o.reversed ? `'2026-07-06T10:00:00Z'` : 'NULL'},
       ${o.reversed || o.superseded ? `'Duzeltme gerekcesi'` : 'NULL'}, now(), now())`);
    await sql(`INSERT INTO "ClientFinancialDisclosureLine"("id","tenantId","disclosureVersionId","type","amount","sourceDispositionLineId","sortOrder","createdAt")
      VALUES ('i05-l-${o.key}-a','${t}','${vId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,'i05-dl-${o.rootId ? o.rootId.replace('i05-root-', '') : o.key}-a',0,now()),
             ('i05-l-${o.key}-b','${t}','${vId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,'i05-dl-${o.rootId ? o.rootId.replace('i05-root-', '') : o.key}-b',1,now())`);
    if (o.current) {
      await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = '${vId}' WHERE "id" = '${rootId}'`);
    }
    return { rootId, versionId: vId };
  };

  const scopeA = { tenantId: tA, portalUserId: puA };

  beforeAll(async () => {
    await sql(`INSERT INTO "Tenant"("id","name","slug","createdAt","updatedAt") VALUES
      ('${tA}','TA-${S}','i05-ta-${S}',now(),now()), ('${tB}','TB-${S}','i05-tb-${S}',now(),now())`);
    await sql(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES
      ('${clA}','${tA}','PERSON'::"ClientType",now()),
      ('${clA2}','${tA}','PERSON'::"ClientType",now()),
      ('${clB}','${tB}','PERSON'::"ClientType",now())`);
    await sql(`INSERT INTO "Case"("id","tenantId","fileNumber","executionFileNumber","type","updatedAt") VALUES
      ('${caseA}','${tA}','2026/I05A-${S}','ICRA-SECRET-A-${S}','GENERAL_EXECUTION'::"CaseType",now()),
      ('${caseA2}','${tA}','2026/I05A2-${S}','ICRA-SECRET-A2-${S}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sql(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES
      ('${ccA}','${caseA}','${clA}',now()), ('${ccA2}','${caseA2}','${clA2}',now())`);
    await sql(`INSERT INTO "ClientPortalUser"("id","clientId","email","passwordHash","isActive","updatedAt") VALUES
      ('${puA}','${clA}','pua-${S}@example.test','x',true,now()),
      ('${puA2}','${clA2}','pua2-${S}@example.test','x',true,now()),
      ('${puOff}','${clB}','puoff-${S}@example.test','x',false,now())`);
  });

  afterAll(async () => {
    await sql(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`UPDATE "ClientFinancialDisclosureVersion" SET "supersedesVersionId" = NULL WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "CollectionDispositionLine" WHERE id LIKE 'i05-dl-%${S}%'`);
    await sql(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Collection" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "ClientPortalUser" WHERE id IN ('${puA}','${puA2}','${puOff}')`);
    await sql(`DELETE FROM "CaseClient" WHERE id IN ('${ccA}','${ccA2}')`);
    await sql(`DELETE FROM "Case" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Client" WHERE "tenantId" IN ('${tA}','${tB}')`);
    await sql(`DELETE FROM "Tenant" WHERE id IN ('${tA}','${tB}')`);
    await prisma.$disconnect();
  });

  // ── §35.7 yalniz PUBLISHED client-gorunur ────────────────────────────────────
  it('[1] yayınlanmamış hiçbir versiyon client’a ULAŞMAZ', async () => {
    for (const status of [
      'DRAFT', 'OFFICE_APPROVAL_PENDING', 'OFFICE_APPROVED',
      'CONTENT_APPROVAL_PENDING', 'CONTENT_APPROVED', 'SEND_PENDING', 'SEND_FAILED', 'CANCELLED',
    ]) {
      const { versionId } = await seedVersion({
        key: `st-${status}-${S}`, caseId: caseA, caseClientId: ccA, status, current: true,
      });
      const cur = await svc.getCurrentSurface(scopeA);
      const his = await svc.getHistorySurface(scopeA);
      expect(cur.items.map((i) => i.disclosureId)).not.toContain(versionId);
      expect(his.items.map((i) => i.disclosureId)).not.toContain(versionId);
      await expect(svc.getById(scopeA, versionId)).rejects.toBeInstanceOf(
        ClientDisclosureProjectionNotFoundError,
      );
    }
  });

  // ── §35.14 iki AYRI yuzey ────────────────────────────────────────────────────
  it('[2] varsayılan yüzey yalnız current-effective, geçmiş yüzeyi yalnız düzeltme/reversal', async () => {
    const v1 = await seedVersion({
      key: `two-1-${S}`, caseId: caseA, caseClientId: ccA,
      status: 'SUPERSEDED', version: 1, published: true, superseded: true,
    });
    const v2 = await seedVersion({
      key: `two-2-${S}`, caseId: caseA, caseClientId: ccA, rootId: v1.rootId,
      status: 'PUBLISHED', version: 2, published: true, current: true, supersedesId: v1.versionId,
    });

    const cur = await svc.getCurrentSurface(scopeA);
    const his = await svc.getHistorySurface(scopeA);
    expect(cur.surface).toBe('CURRENT');
    expect(his.surface).toBe('HISTORY');
    expect(cur.items.map((i) => i.disclosureId)).toContain(v2.versionId);
    expect(cur.items.map((i) => i.disclosureId)).not.toContain(v1.versionId);
    expect(his.items.map((i) => i.disclosureId)).toContain(v1.versionId);
    expect(his.items.map((i) => i.disclosureId)).not.toContain(v2.versionId);
    // §35.14: TEK BIRLESIK LISTE DEGIL — iki yuzey kesismez.
    const overlap = cur.items.filter((c) => his.items.some((h) => h.disclosureId === c.disclosureId));
    expect(overlap).toHaveLength(0);

    const current = cur.items.find((i) => i.disclosureId === v2.versionId);
    expect(current?.isCurrentEffective).toBe(true);
    expect(current?.supersedesDisclosureId).toBe(v1.versionId);
    expect(current?.remittanceStatus).toBe('PUBLISHED');
    const old = his.items.find((i) => i.disclosureId === v1.versionId);
    expect(old?.isCurrentEffective).toBe(false);
    expect(old?.remittanceStatus).toBe('CORRECTED');
    expect(old?.supersededByDisclosureId).toBe(v2.versionId);
    expect(old?.correctionReason).toBe('Duzeltme gerekcesi');
  });

  it('[3] REVERSED versiyon geçmiş yüzeyinde ve REVERSED durumunda görünür', async () => {
    const v = await seedVersion({
      key: `rev-${S}`, caseId: caseA, caseClientId: ccA,
      status: 'REVERSED', published: true, reversed: true, current: true,
    });
    const his = await svc.getHistorySurface(scopeA);
    const item = his.items.find((i) => i.disclosureId === v.versionId);
    expect(item?.remittanceStatus).toBe('REVERSED');
    expect(item?.isReversed).toBe(true);
    expect(item?.isCurrentEffective).toBe(false);
    expect((await svc.getCurrentSurface(scopeA)).items.map((i) => i.disclosureId))
      .not.toContain(v.versionId);
  });

  // ── yetki zinciri ────────────────────────────────────────────────────────────
  it('[4] pasif portal kullanıcısı reddedilir', async () => {
    await expect(svc.getCurrentSurface({ tenantId: tB, portalUserId: puOff })).rejects.toBeInstanceOf(
      ClientDisclosureProjectionForbiddenError,
    );
  });

  it('[5] cross-tenant okuma reddedilir (portal kullanıcısı başka tenant’ta)', async () => {
    await expect(svc.getCurrentSurface({ tenantId: tB, portalUserId: puA })).rejects.toBeInstanceOf(
      ClientDisclosureProjectionForbiddenError,
    );
  });

  it('[6] başka müvekkilin disclosure’ı AYNI tenant içinde bile GÖRÜNMEZ', async () => {
    const other = await seedVersion({
      key: `oth-${S}`, caseId: caseA2, caseClientId: ccA2,
      status: 'PUBLISHED', published: true, current: true,
    });
    const cur = await svc.getCurrentSurface(scopeA);
    expect(cur.items.map((i) => i.disclosureId)).not.toContain(other.versionId);
    await expect(svc.getById(scopeA, other.versionId)).rejects.toBeInstanceOf(
      ClientDisclosureProjectionNotFoundError,
    );
    // Sahibi icin GORUNUR — yetki kapisi kapsamli, kor degil.
    const own = await svc.getCurrentSurface({ tenantId: tA, portalUserId: puA2 });
    expect(own.items.map((i) => i.disclosureId)).toContain(other.versionId);
  });

  it('[7] caseId filtresi client scope’u ile KESİŞİR — başka müvekkilin dosyası boş döner', async () => {
    const cur = await svc.getCurrentSurface({ ...scopeA, caseId: caseA2 });
    expect(cur.items).toHaveLength(0);
  });

  // ── §35.14 alan siniri ───────────────────────────────────────────────────────
  it('[8] çıktı beyaz listeyle BİREBİR aynıdır ve yasak alanların HİÇBİRİNİ taşımaz', async () => {
    const v = await seedVersion({
      key: `fld-${S}`, caseId: caseA, caseClientId: ccA,
      status: 'PUBLISHED', published: true, current: true,
    });
    const item = await svc.getById(scopeA, v.versionId);
    expect(Object.keys(item).sort()).toEqual([...CLIENT_DISCLOSURE_ALLOWED_FIELDS].sort());
    for (const line of item.lines) {
      expect(Object.keys(line).sort()).toEqual([...CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS].sort());
    }
    const serialized = JSON.stringify(item);
    for (const forbidden of CLIENT_DISCLOSURE_FORBIDDEN_FIELDS) {
      expect(Object.keys(item)).not.toContain(forbidden);
    }
    // Degerler de sizmamali: approver kimligi, alici, provider ID, bildirim metni, hash.
    for (const secret of [
      'i05-approver-SECRET', 'i05-content-approver-SECRET', 'gizli-alici@example.test',
      'PROVIDER-MSG-SECRET', 'GIZLI BILDIRIM METNI', 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64),
      `i05-sik-fld-${S}`, `i05-src-fld-${S}`,
      `ICRA-SECRET-A-${S}`, `ICRA-SECRET-A2-${S}`, `2026/I05A2-${S}`,
    ]) {
      expect(serialized).not.toContain(secret);
    }
    // Internal workflow durumu client'a YANSIMAZ.
    expect(serialized).not.toContain('SEND_PENDING');
    expect(serialized).not.toContain('CONTENT_APPROVAL_PENDING');
  });

  it('[9] tutarlar locale-bağımsız canonical string, satırlar sortOrder’a göre curated', async () => {
    const v = await seedVersion({
      key: `amt-${S}`, caseId: caseA, caseClientId: ccA,
      status: 'PUBLISHED', published: true, current: true,
    });
    const item = await svc.getById(scopeA, v.versionId);
    expect(item.totalCollected).toBe('2500.75');
    expect(item.clientNetAmount).toBe('1750.50');
    expect(item.fileNumber).toBe(`2026/I05A-${S}`);
    expect(item.currency).toBe('TRY');
    expect(item.lines.map((l) => l.type)).toEqual(['CLIENT_PAYABLE', 'CONTRACTUAL_FEE_WITHHELD']);
    expect(item.lines.map((l) => l.amount)).toEqual(['1750.50', '750.25']);
    expect(item.approvedAt).toBe('2026-07-04T10:00:00.000Z');
    expect(item.publishedAt).toBe('2026-07-05T10:00:00.000Z');
    expect(item.notifiedAt).toBe('2026-07-05T10:00:00.000Z');
  });

  it('[10] kapsam dışı ve yayınlanmamış kayıt AYNI cevabı üretir — varlık sızmaz', async () => {
    const unpublished = await seedVersion({
      key: `hid-${S}`, caseId: caseA, caseClientId: ccA, status: 'DRAFT',
    });
    const foreign = await seedVersion({
      key: `frn-${S}`, caseId: caseA2, caseClientId: ccA2, status: 'PUBLISHED', published: true, current: true,
    });
    const bodies: string[] = [];
    for (const id of [unpublished.versionId, foreign.versionId, 'hic-olmayan-id']) {
      try {
        await svc.getById(scopeA, id);
        throw new Error('beklenmeyen basari');
      } catch (e) {
        expect(e).toBeInstanceOf(ClientDisclosureProjectionNotFoundError);
        bodies.push(JSON.stringify((e as ClientDisclosureProjectionNotFoundError).getResponse()));
      }
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('[11] şekil guard’ı fazladan alanda fail-closed patlar', () => {
    const base = {
      disclosureId: 'x', version: 1, fileNumber: '2026/1', currency: 'TRY', totalCollected: '1.00',
      clientNetAmount: '1.00', lines: [], approvedAt: null, notifiedAt: null, publishedAt: null,
      isCurrentEffective: true, supersedesDisclosureId: null, supersededByDisclosureId: null,
      isReversed: false, correctionReason: null, remittanceStatus: 'PUBLISHED' as const,
    };
    expect(() => assertProjectionShape(base)).not.toThrow();
    expect(() => assertProjectionShape({ ...base, snapshotHash: 'leak' } as never)).toThrow(
      ClientDisclosureProjectionForbiddenError,
    );
    expect(() =>
      assertProjectionShape({ ...base, lines: [{ type: 'X', amount: '1.00', sortOrder: 0 }] } as never),
    ).toThrow(ClientDisclosureProjectionForbiddenError);
  });
});
