/**
 * DEBTOR-SERVICE-OCCURRENCE-SNAPSHOT-INVARIANT-P1-I08 (eski roadmap TASK 07).
 *
 * INVARIANT: her (tenantId, sourceTebligatId) icin en fazla BIR ACTIVE
 * LegalDeadlineSnapshot olabilir (bkz. service-occurrence-deadline-calculation-lock.ts
 * yorumu). Bugune kadar bu YALNIZ application-level pg_advisory_xact_lock ile
 * korunuyordu; DB seviyesinde HICBIR engel yoktu (ANALYZE fazinda ampirik olarak
 * kanitlandi: app-katmanini bypass eden dogrudan INSERT ile iki ACTIVE satir
 * basariyla olusturulabiliyordu). Bu dosya iki seyi kanitlar:
 *   1) Migration `LegalDeadlineSnapshot_one_active_per_tebligat` DB seviyesinde
 *      artik BU bosluğu kapatiyor (bypass eden yazim reddedilir).
 *   2) Yeni constraint, GERCEK/DOGRU yazicinin (calculateForOccurrence) mevcut
 *      supersede-then-insert sirasiyla CATISMAZ — mevcut idempotent/supersede
 *      davranisi degismeden calisir (regresyon degil).
 *
 * ServiceOccurrence icin KASITLI OLARAK benzer bir test/constraint YOKTUR — o
 * modelin kendi (farkli) invariant'i zaten @unique(supersedesOccurrenceId) ile
 * korunuyor; "ayni tebligat icin coklu ACTIVE occurrence" BILINCLI tasarimdir
 * (bkz. migration.sql yorumu, owner brief S10).
 */
import { PrismaClient, ServiceOccurrenceRegimeCode, ServiceOccurrenceServiceDateRole } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { ServiceOccurrenceDeadlineCalculationService } from "../service-occurrence-deadline-calculation.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "LegalDeadlineSnapshot invariant disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("LegalDeadlineSnapshot — DB-level snapshot invariant (I08)", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: ServiceOccurrenceDeadlineCalculationService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    service = new ServiceOccurrenceDeadlineCalculationService(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ldsi-${label}-${suffix}`;

    await prisma.tenant.create({ data: { id: tenantId, name: `LDSI Test ${label}`, slug: `test-ldsi-${label}-${suffix}` } });
    const client = await prisma.client.create({ data: { tenantId, displayName: "LDSI Test Müvekkil", type: "INDIVIDUAL" } });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-LDSI-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: "PAYMENT_ORDER" as any,
      },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, type: "INDIVIDUAL", firstName: "Test", lastName: "Borçlu", name: "Test Borçlu" },
    });
    const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: caseRow.id, debtorId: debtor.id } });
    const tebligat = await prisma.tebligat.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
        tebligatType: "ODEME_EMRI",
        addressType: "BILINEN",
        addressText: "Test Adres No:1",
        recipientName: "Test Borçlu",
        channel: "PTT",
      },
    });

    return { tenantId, caseId: caseRow.id, caseDebtorId: caseDebtor.id, tebligatId: tebligat.id };
  }

  async function createOccurrence(
    fx: { tenantId: string; caseId: string; caseDebtorId: string; tebligatId: string },
    overrides: Record<string, unknown> = {},
  ) {
    return prisma.serviceOccurrence.create({
      data: {
        tenantId: fx.tenantId,
        caseId: fx.caseId,
        caseDebtorId: fx.caseDebtorId,
        sourceTebligatId: fx.tebligatId,
        occurrenceType: "POSTAL_DELIVERY_RESULT",
        sourceSystemCode: "PTT",
        sourceCode: "TESLIM_EDILDI",
        occurredOn: new Date("2026-01-10T00:00:00Z"),
        timePrecision: "DATE_ONLY",
        addressTypeAtOccurrence: "BILINEN",
        serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY,
        serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
        recordedBySystem: "TEST_HARNESS",
        status: "ACTIVE",
        ...overrides,
      },
    });
  }

  function baseCommand(fx: { tenantId: string }, occurrenceId: string, overrides: Record<string, unknown> = {}) {
    return {
      tenantId: fx.tenantId,
      serviceOccurrenceId: occurrenceId,
      calculationVersion: "occurrence-deadline-v1",
      objectionPeriodDays: 7,
      ...overrides,
    };
  }

  // ============================================================
  // NEGATIVE CONTROL — app-katmanini TAMAMEN bypass eden dogrudan INSERT.
  // Bu, ANALYZE fazinda migration-ONCESI ampirik olarak BASARILI olan
  // senaryonun AYNISIdir; migration-SONRASI DB'nin artik reddettigini kanitlar.
  // ============================================================
  it("BYPASS-DENY: app-katmanini atlayan dogrudan ikinci ACTIVE INSERT, DB tarafindan reddedilir", async () => {
    const fx = await buildFixture("bypass-deny");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "LegalDeadlineSnapshot"
        (id,"tenantId","caseId","sourceTebligatId","deadlineType","legalServiceDate","dueDate","calculationRule","calculationVersion","deadlineReasonCode","status","calculatedAt","createdAt")
       VALUES ($1,$2,$3,$4,'OBJECTION_PERIOD', now(), now() + interval '7 day', 'RULE_A', 'v1', 'REASON_A', 'ACTIVE', now(), now())`,
      "snap-bypass-a-" + randomUUID().slice(0, 8), fx.tenantId, fx.caseId, fx.tebligatId,
    );

    const secondInsert = prisma.$executeRawUnsafe(
      `INSERT INTO "LegalDeadlineSnapshot"
        (id,"tenantId","caseId","sourceTebligatId","deadlineType","legalServiceDate","dueDate","calculationRule","calculationVersion","deadlineReasonCode","status","calculatedAt","createdAt")
       VALUES ($1,$2,$3,$4,'OBJECTION_PERIOD', now(), now() + interval '10 day', 'RULE_B', 'v1', 'REASON_B', 'ACTIVE', now(), now())`,
      "snap-bypass-b-" + randomUUID().slice(0, 8), fx.tenantId, fx.caseId, fx.tebligatId,
    );

    await expect(secondInsert).rejects.toMatchObject({
      code: "P2010",
      meta: expect.objectContaining({ code: "23505" }),
    });
    // Hata mesaji AYRICA yeni index'i isaret etmeli — rastgele baska bir FK/CHECK
    // ihlaliyle karistirilmasin (yanlis-pozitif testi engeller).
    await expect(secondInsert.catch((e: any) => e)).resolves.toMatchObject({
      meta: expect.objectContaining({
        message: expect.stringContaining('("tenantId", "sourceTebligatId")'),
      }),
    });

    const activeCount = await prisma.legalDeadlineSnapshot.count({
      where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId, status: "ACTIVE" },
    });
    expect(activeCount).toBe(1);
  });

  // ============================================================
  // REGRESYON — gercek yazicinin (calculateForOccurrence) mevcut idempotent/
  // supersede davranisi yeni constraint ile DEGISMEDEN calisir.
  // ============================================================
  it("REGRESYON: gerçek yazıcı ile idempotent replay hâlâ no-op (yeni constraint'e çarpmaz)", async () => {
    const fx = await buildFixture("regression-idempotent");
    const occurrence = await createOccurrence(fx);
    const command = baseCommand(fx, occurrence.id);

    const first = await service.calculateForOccurrence(command);
    const second = await service.calculateForOccurrence(command);

    expect(second.id).toBe(first.id);
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  it("REGRESYON: gerçek yazıcı ile supersede zinciri hâlâ çalışır (yeni ACTIVE, eski SUPERSEDED — index'e takılmaz)", async () => {
    const fx = await buildFixture("regression-supersede");
    const occurrence1 = await createOccurrence(fx, { occurredOn: new Date("2026-01-10T00:00:00Z") });
    const first = await service.calculateForOccurrence(baseCommand(fx, occurrence1.id));

    await prisma.serviceOccurrence.update({ where: { id: occurrence1.id }, data: { status: "SUPERSEDED" } });
    const occurrence2 = await createOccurrence(fx, { occurredOn: new Date("2026-01-15T00:00:00Z") });

    const second = await service.calculateForOccurrence(baseCommand(fx, occurrence2.id));

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("ACTIVE");

    const activeRows = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId, status: "ACTIVE" },
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].id).toBe(second.id);
  });

  // ============================================================
  // CONCURRENCY — iki FARKLI occurrence icin AYNI tebligat'a eszamanli
  // calculateForOccurrence cagrisi: advisory lock serialize eder, sonunda
  // tam olarak 1 ACTIVE kalir (kaybeden supersede edilir, hata FIRLATMAZ —
  // "farkli occurrence" dali meşru yeniden-hesaplama sayilir).
  // ============================================================
  it("CONCURRENCY: aynı tebligat için eşzamanlı iki farklı-occurrence hesaplaması sonunda tam 1 ACTIVE bırakır", async () => {
    const fx = await buildFixture("concurrency-race");
    const occA = await createOccurrence(fx, { sourceCode: "RACE_A", occurredOn: new Date("2026-01-10T00:00:00Z") });
    const occB = await createOccurrence(fx, { sourceCode: "RACE_B", occurredOn: new Date("2026-01-12T00:00:00Z") });

    const results = await Promise.allSettled([
      service.calculateForOccurrence(baseCommand(fx, occA.id)),
      service.calculateForOccurrence(baseCommand(fx, occB.id)),
    ]);

    // Advisory lock ikisini de serialize eder — ikisi de basarili olabilir (biri
    // digerini supersede eder) VEYA transient conflict ile biri reddedilebilir;
    // her iki durumda da DB'de kalici olarak tam 1 ACTIVE olmalidir (asil kanit).
    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilledCount).toBeGreaterThanOrEqual(1);

    const activeRows = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId, status: "ACTIVE" },
    });
    expect(activeRows).toHaveLength(1);

    const allRows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(allRows.length).toBeGreaterThanOrEqual(1);
    expect(allRows.length).toBeLessThanOrEqual(2);
  });

  // ============================================================
  // Farklı tenant / farklı tebligat: constraint sahnenin dışına SIZMAZ.
  // ============================================================
  it("İZOLASYON: farklı tebligat için ikinci ACTIVE snapshot serbestçe oluşturulabilir (constraint tebligat-scoped)", async () => {
    const fxA = await buildFixture("isolation-a");
    const fxB = await buildFixture("isolation-b");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "LegalDeadlineSnapshot"
        (id,"tenantId","caseId","sourceTebligatId","deadlineType","legalServiceDate","dueDate","calculationRule","calculationVersion","deadlineReasonCode","status","calculatedAt","createdAt")
       VALUES ($1,$2,$3,$4,'OBJECTION_PERIOD', now(), now() + interval '7 day', 'RULE_A', 'v1', 'REASON_A', 'ACTIVE', now(), now())`,
      "snap-iso-a-" + randomUUID().slice(0, 8), fxA.tenantId, fxA.caseId, fxA.tebligatId,
    );
    // Farklı tebligatId (fxB) — aynı index anahtarına GİRMEZ, çakışma beklenmez.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "LegalDeadlineSnapshot"
          (id,"tenantId","caseId","sourceTebligatId","deadlineType","legalServiceDate","dueDate","calculationRule","calculationVersion","deadlineReasonCode","status","calculatedAt","createdAt")
         VALUES ($1,$2,$3,$4,'OBJECTION_PERIOD', now(), now() + interval '7 day', 'RULE_A', 'v1', 'REASON_A', 'ACTIVE', now(), now())`,
        "snap-iso-b-" + randomUUID().slice(0, 8), fxB.tenantId, fxB.caseId, fxB.tebligatId,
      ),
    ).resolves.toBeDefined();
  });
});
