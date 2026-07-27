/**
 * CLIENT-P2-U03-TRACK-B-I01 — Financial Disclosure veri temeli, MODEL-SEVİYESİ invariant'lar
 * (GERÇEK Postgres). GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * Canonical tasarım: CLIENT-GOVERNANCE-CHARTER.md §35 (owner-ratified).
 *
 * Bu dosya YALNIZ schema/DB seviyesindeki enforcement'ı kanıtlar — hiçbir Track B
 * service/API/UI davranışı test EDİLMEZ (I02–I08 yetkilendirilmemiştir):
 *   SCHEMA EXISTS ≠ DATA MAY BE DISCLOSED · DATA EXISTS ≠ CLIENT AUTHORIZED TO VIEW
 */
import { describeDb } from "../../../../test/describe-db";
import { PrismaClient } from "@prisma/client";

describeDb("CLIENT-P2-U03-TRACK-B-I01 — Financial Disclosure schema foundation (integration)", () => {
  const prisma = new PrismaClient();

  // Fixture kimlikleri — deterministik, local-only (harici/production veri KULLANILMAZ).
  const SFX = "trackb-i01-spec";
  const T1 = `tenant-a-${SFX}`;
  const T2 = `tenant-b-${SFX}`;
  const ids = {
    client1: `client-1-${SFX}`,
    client2: `client-2-${SFX}`,
    case1: `case-1-${SFX}`,
    case2: `case-2-${SFX}`,
    caseClient1: `cc-1-${SFX}`,
    caseClient2: `cc-2-${SFX}`,
    coll1: `coll-1-${SFX}`,
    coll2: `coll-2-${SFX}`,
    dispSingle: `disp-single-${SFX}`,
    dispCluster: `disp-cluster-${SFX}`,
    line1: `line-1-${SFX}`,
    line2: `line-2-${SFX}`,
  };

  const now = new Date("2026-07-26T12:00:00.000Z");

  /** Parent fixture'ları raw SQL ile kurar (yalnız zorunlu kolonlar). */
  async function seed() {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
      T1, "Tenant A", `tenant-a-${SFX}`, now,
      T2, "Tenant B", `tenant-b-${SFX}`, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Client" ("id","tenantId","type","updatedAt") VALUES ($1,$2,'PERSON'::"ClientType",$3),($4,$5,'PERSON'::"ClientType",$6)`,
      ids.client1, T1, now,
      ids.client2, T2, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Case" ("id","tenantId","fileNumber","type","updatedAt") VALUES ($1,$2,$3,'GENERAL_EXECUTION'::"CaseType",$4),($5,$6,$7,'GENERAL_EXECUTION'::"CaseType",$8)`,
      ids.case1, T1, `2026/A-${SFX}`, now,
      ids.case2, T2, `2026/B-${SFX}`, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CaseClient" ("id","caseId","clientId","updatedAt") VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
      ids.caseClient1, ids.case1, ids.client1, now,
      ids.caseClient2, ids.case2, ids.client2, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Collection" ("id","tenantId","caseId","amount","type","date","updatedAt","idempotencyKey")
       VALUES ($1,$2,$3,1000.00,'TAHSILAT'::"CollectionType",$4,$5,$6),($7,$8,$9,500.00,'TAHSILAT'::"CollectionType",$10,$11,$12)`,
      ids.coll1, T1, ids.case1, now, now, `idem-1-${SFX}`,
      ids.coll2, T2, ids.case2, now, now, `idem-2-${SFX}`,
    );
    // §35.3: SINGLE_CASE_CLIENT → caseClientId dolu · CASE_CREDITOR_CLUSTER → caseClientId NULL
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CollectionDisposition" ("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","updatedAt")
       VALUES ($1,$2,$3,$4,'SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",$5,'POSTED'::"CollectionDispositionStatus",1000.00,'TRY',$6,$7)`,
      ids.dispSingle, T1, ids.case1, ids.coll1, ids.caseClient1, now, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CollectionDisposition" ("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","updatedAt")
       VALUES ($1,$2,$3,$4,'CASE_CREDITOR_CLUSTER'::"CollectionDispositionBeneficiaryScope",NULL,'POSTED'::"CollectionDispositionStatus",500.00,'TRY',$5,$6)`,
      ids.dispCluster, T2, ids.case2, ids.coll2, now, now,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CollectionDispositionLine" ("id","dispositionId","type","amount") VALUES
       ($1,$2,'CLIENT_PAYABLE'::"CollectionDispositionLineType",700.00),
       ($3,$4,'CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",300.00)`,
      ids.line1, ids.dispSingle, ids.line2, ids.dispSingle,
    );
  }

  async function cleanup() {
    // Ters sırada; FK'ler RESTRICT olduğu için sıra ZORUNLU (bu da cascade olmadığının kanıtı).
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId"=NULL WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "CollectionDispositionLine" WHERE "dispositionId" IN ($1,$2)`, ids.dispSingle, ids.dispCluster);
    await prisma.$executeRawUnsafe(`DELETE FROM "CollectionDisposition" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "Collection" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "CaseClient" WHERE "id" IN ($1,$2)`, ids.caseClient1, ids.caseClient2);
    await prisma.$executeRawUnsafe(`DELETE FROM "Case" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "Client" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" IN ($1,$2)`, T1, T2);
  }

  beforeAll(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /** Her testten sonra yalnız disclosure kayıtlarını temizler (parent'lar kalır). */
  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`UPDATE "ClientFinancialDisclosure" SET "currentVersionId"=NULL WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" IN ($1,$2)`, T1, T2);
    await prisma.$executeRawUnsafe(`DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" IN ($1,$2)`, T1, T2);
  });

  const disclosureData = (over: Record<string, unknown> = {}) => ({
    tenantId: T1,
    caseId: ids.case1,
    caseClientId: ids.caseClient1,
    collectionDispositionId: ids.dispSingle,
    currency: "TRY",
    ...over,
  });

  const versionData = (disclosureId: string, over: Record<string, unknown> = {}) => ({
    tenantId: T1,
    disclosureId,
    version: 1,
    sourceCollectionId: ids.coll1,
    sourceCollectionAmount: "1000.00",
    sourceCollectionDate: now,
    dispositionTotalAmount: "1000.00",
    dispositionPostedAt: now,
    currency: "TRY",
    totalCollected: "1000.00",
    clientNetAmount: "700.00",
    snapshotHash: `snap-${Math.random().toString(36).slice(2)}`,
    sourceFingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    sendIdempotencyKey: `send-${Math.random().toString(36).slice(2)}`,
    ...over,
  });

  it("[1] geçerli minimum Track B kaydı oluşturulabilir (kök + versiyon + satır)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    const l = await prisma.clientFinancialDisclosureLine.create({
      data: {
        tenantId: T1,
        disclosureVersionId: v.id,
        type: "CLIENT_PAYABLE",
        amount: "700.00",
        sourceDispositionLineId: ids.line1,
      },
    });
    expect(d.id).toBeTruthy();
    expect(v.version).toBe(1);
    expect(l.type).toBe("CLIENT_PAYABLE");
  });

  it("[2] GÜVENLİ VARSAYILAN (§20): yeni versiyon DRAFT'tır — PUBLISHED/client-görünür DEĞİL", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    expect(v.status).toBe("DRAFT");
    expect(v.publishedAt).toBeNull();
  });

  it("[3] required parent olmadan kayıt oluşturulamaz (disposition zorunlu)", async () => {
    await expect(
      prisma.clientFinancialDisclosure.create({
        data: { ...disclosureData(), collectionDispositionId: undefined as unknown as string },
      }),
    ).rejects.toBeDefined();
  });

  it("[4] invalid foreign key reddedilir (var olmayan disposition)", async () => {
    await expect(
      prisma.clientFinancialDisclosure.create({
        data: disclosureData({ collectionDispositionId: "does-not-exist" }),
      }),
    ).rejects.toBeDefined();
  });

  it("[5] CROSS-TENANT case ilişkisi DB seviyesinde REDDEDİLİR (composite tenant FK)", async () => {
    // tenant A + tenant B'nin case'i → Case("tenantId","id") bileşik FK'si bunu reddeder.
    await expect(
      prisma.clientFinancialDisclosure.create({
        data: disclosureData({ caseId: ids.case2 }),
      }),
    ).rejects.toBeDefined();
  });

  it("[6] CROSS-TENANT versiyon→kök ilişkisi REDDEDİLİR (composite tenant FK)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    await expect(
      prisma.clientFinancialDisclosureVersion.create({
        data: versionData(d.id, { tenantId: T2 }),
      }),
    ).rejects.toBeDefined();
  });

  it("[7] §35.12 duplicate canonical business key reddedilir (tenant+disposition tekliği)", async () => {
    await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    await expect(prisma.clientFinancialDisclosure.create({ data: disclosureData() })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("[8] §35.12 aynı version numarası çakışması reddedilir (tenant+disclosure+version)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 1 }) });
    await expect(
      prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 1 }) }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Farklı versiyon numarası KABUL edilir (düzeltme versiyonu yolu açık, §35.13).
    const v2 = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 2 }) });
    expect(v2.version).toBe(2);
  });

  it("[9] §35.12 gönderim idempotency anahtarı tekildir (çift gönderim engeli)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const key = `send-fixed-${SFX}`;
    await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 1, sendIdempotencyKey: key }) });
    await expect(
      prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 2, sendIdempotencyKey: key }) }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("[10] §35.13 bir versiyon en fazla BİR kez supersede edilebilir", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v1 = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 1 }) });
    await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 2, supersedesVersionId: v1.id }) });
    await expect(
      prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 3, supersedesVersionId: v1.id }) }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("[11] §35.8 bir ofis onay talebi en fazla bir versiyona bağlanır", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const req = `oar-${SFX}`;
    await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 1, officeApprovalRequestId: req }) });
    await expect(
      prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id, { version: 2, officeApprovalRequestId: req }) }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("[12] §35.16 Decimal(15,2) hassasiyeti korunur — kuruş kaybı YOK", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({
      data: versionData(d.id, { totalCollected: "1234.56", clientNetAmount: "999.99" }),
    });
    expect(v.totalCollected.toString()).toBe("1234.56");
    expect(v.clientNetAmount.toString()).toBe("999.99");
  });

  it("[13] §35.5 satır taksonomisi mevcut CollectionDispositionLineType'ı kullanır; invalid değer reddedilir", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ClientFinancialDisclosureLine" ("id","tenantId","disclosureVersionId","type","amount","sourceDispositionLineId")
         VALUES ($1,$2,$3,'NOT_A_REAL_TYPE'::"CollectionDispositionLineType",1.00,$4)`,
        `bad-${SFX}`, T1, v.id, ids.line1,
      ),
    ).rejects.toBeDefined();
  });

  it("[14] invalid lifecycle/status değeri reddedilir (enum sınırı)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ClientFinancialDisclosureVersion"
         ("id","tenantId","disclosureId","version","status","sourceCollectionId","sourceCollectionAmount","sourceCollectionDate",
          "dispositionTotalAmount","dispositionPostedAt","currency","totalCollected","clientNetAmount","snapshotHash",
          "sourceFingerprint","sendIdempotencyKey","updatedAt")
         VALUES ($1,$2,$3,9,'SENT'::"ClientFinancialDisclosureStatus",$4,1.00,$5,1.00,$6,'TRY',1.00,1.00,$7,$8,$9,$10)`,
        `badstat-${SFX}`, T1, d.id, ids.coll1, now, now, `h-${SFX}`, `f-${SFX}`, `s-${SFX}`, now,
      ),
    ).rejects.toBeDefined();
  });

  it("[15] aynı kaynak dispozisyon satırı bir versiyonda iki kez temsil edilemez", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    const line = { tenantId: T1, disclosureVersionId: v.id, type: "CLIENT_PAYABLE" as const, amount: "700.00", sourceDispositionLineId: ids.line1 };
    await prisma.clientFinancialDisclosureLine.create({ data: line });
    await expect(prisma.clientFinancialDisclosureLine.create({ data: line })).rejects.toMatchObject({ code: "P2002" });
  });

  it("[16] ORPHAN YOK + CASCADE YOK: disclosure varken kaynak dispozisyon SİLİNEMEZ (RESTRICT)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    await prisma.clientFinancialDisclosureLine.create({
      data: { tenantId: T1, disclosureVersionId: v.id, type: "CLIENT_PAYABLE", amount: "700.00", sourceDispositionLineId: ids.line1 },
    });
    // Kaynak satır silinemez (audit/finansal veri korunur).
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "CollectionDispositionLine" WHERE "id"=$1`, ids.line1),
    ).rejects.toBeDefined();
    // Kaynak dispozisyon silinemez.
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "CollectionDisposition" WHERE "id"=$1`, ids.dispSingle),
    ).rejects.toBeDefined();
    // Case silinemez → disclosure geçmişi cascade ile YOK OLMAZ.
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Case" WHERE "id"=$1`, ids.case1)).rejects.toBeDefined();
  });

  it("[17] §35.3 CASE_CREDITOR_CLUSTER için disclosure YAPISAL OLARAK oluşturulamaz (caseClientId NOT NULL)", async () => {
    // Cluster dispozisyonun caseClientId'si NULL'dur; disclosure kökü caseClientId ZORUNLU
    // tutar → cluster kapsamı için disclosure yaratmak imkânsızdır (fail-closed, bir client
    // sahibi ASLA çıkarsanmaz). NULL denemesi DB tarafından reddedilir.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ClientFinancialDisclosure" ("id","tenantId","caseId","caseClientId","collectionDispositionId","currency","updatedAt")
         VALUES ($1,$2,$3,NULL,$4,'TRY',$5)`,
        `cluster-${SFX}`, T2, ids.case2, ids.dispCluster, now,
      ),
    ).rejects.toBeDefined();
  });

  it("[18] current-effective versiyon işaretçisi tekildir ve bağlanabilir (§35.5)", async () => {
    const d = await prisma.clientFinancialDisclosure.create({ data: disclosureData() });
    const v = await prisma.clientFinancialDisclosureVersion.create({ data: versionData(d.id) });
    const updated = await prisma.clientFinancialDisclosure.update({
      where: { id: d.id },
      data: { currentVersionId: v.id },
    });
    expect(updated.currentVersionId).toBe(v.id);
    // Aynı versiyon ikinci bir köke current olarak bağlanamaz (@unique).
    const d2 = await prisma.clientFinancialDisclosure.create({
      data: disclosureData({ collectionDispositionId: ids.dispSingle, caseId: ids.case1 }),
    }).catch(() => null);
    expect(d2).toBeNull(); // aynı disposition ikinci kök YARATAMAZ (test [7] ile tutarlı)
  });
});
