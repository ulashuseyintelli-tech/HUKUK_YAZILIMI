/**
 * DEBTOR-OF01-HISTORY-P01 — ServiceOccurrence disposable-DB entegrasyon testi.
 *
 * Bu dosya SADECE schema/migration foundation'ı doğrular (CHECK constraint'ler,
 * immutability/supersession trigger'ları, composite tenant-scoped FK). ServiceOccurrence'in
 * P01'de hiçbir service/controller/DTO katmanı YOKTUR (kasıtlı — bkz. DBP-04 §12.2);
 * bu yüzden testler doğrudan PrismaClient üzerinden çalışır.
 *
 * NOT — cleanup yok: ServiceOccurrence DB seviyesinde kalıcı olarak silinemez (immutable
 * legal-fact tasarımı, prevent_service_occurrence_delete trigger'ı). Bu yüzden bu dosyadaki
 * testler afterAll'da satır silmez; izolasyon her testin kendi benzersiz (randomUUID) tenantId'si
 * ile sağlanır. Disposable container görev sonunda bütünüyle imha edilir.
 */
import { PrismaClient, ServiceOccurrenceType, ServiceOccurrenceTimePrecision, ServiceOccurrenceStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrence disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrence schema — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildBaseFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-so-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `ServiceOccurrence Test ${label}`, slug: `test-so-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "ServiceOccurrence Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-SO-${randomUUID().slice(0, 6)}`,
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
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id },
    });
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

  function baseOccurrenceData(fx: { tenantId: string; caseId: string; caseDebtorId: string | null; tebligatId: string }, overrides: any = {}) {
    return {
      tenantId: fx.tenantId,
      caseId: fx.caseId,
      caseDebtorId: fx.caseDebtorId,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: ServiceOccurrenceType.POSTAL_DELIVERY_RESULT,
      sourceSystemCode: "PTT",
      sourceCode: "TESLIM_EDILDI",
      occurredOn: new Date("2026-07-18T00:00:00Z"),
      timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
      recordedBySystem: "TEST_HARNESS",
      ...overrides,
    };
  }

  // TEST-01: happy path — geçerli bir occurrence oluşturulur.
  it("TEST-01: geçerli alanlarla ServiceOccurrence oluşturur", async () => {
    const fx = await buildBaseFixture("happy");

    const occ = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });

    expect(occ.id).toBeTruthy();
    expect(occ.status).toBe(ServiceOccurrenceStatus.ACTIVE);
    expect(occ.tenantId).toBe(fx.tenantId);
    expect(occ.sourceTebligatId).toBe(fx.tebligatId);
  });

  // TEST-02: tenant-scoped composite FK — başka tenant'ın tebligat'ına cross-tenant atıf reddedilir.
  it("TEST-02: cross-tenant sourceTebligatId composite FK tarafından reddedilir", async () => {
    const fxA = await buildBaseFixture("tenant-a");
    const fxB = await buildBaseFixture("tenant-b");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData({ ...fxB, tebligatId: fxA.tebligatId }),
      }),
    ).rejects.toThrow();

    const rows = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fxA.tebligatId } });
    expect(rows).toHaveLength(0);
  });

  // TEST-03: caseId FK — var olmayan bir case'e atıf reddedilir.
  it("TEST-03: var olmayan caseId FK ihlali nedeniyle reddedilir", async () => {
    const fx = await buildBaseFixture("bad-case");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData({ ...fx, caseId: `nonexistent-case-${randomUUID()}` }),
      }),
    ).rejects.toThrow();
  });

  // TEST-04: caseDebtorId opsiyoneldir — NULL ile oluşturma başarılı olur.
  it("TEST-04: caseDebtorId olmadan (NULL) oluşturma başarılı olur", async () => {
    const fx = await buildBaseFixture("no-casedebtor");

    const occ = await prisma.serviceOccurrence.create({
      data: baseOccurrenceData({ ...fx, caseDebtorId: null }),
    });

    expect(occ.caseDebtorId).toBeNull();
  });

  // TEST-05: occ_time_precision_date_only_check — DATE_ONLY + occurredAt dolu → CHECK ihlali.
  it("TEST-05: timePrecision=DATE_ONLY iken occurredAt dolu olamaz (CHECK)", async () => {
    const fx = await buildBaseFixture("date-only-violation");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, {
          timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
          occurredAt: new Date("2026-07-18T10:00:00Z"),
        }),
      }),
    ).rejects.toThrow(/occ_time_precision_date_only_check/);
  });

  // TEST-06: occ_time_precision_exact_time_check — EXACT_TIME + occurredAt NULL → CHECK ihlali; pozitif durum ayrıca doğrulanır.
  it("TEST-06: timePrecision=EXACT_TIME iken occurredAt zorunludur (CHECK); dolu ise başarılı olur", async () => {
    const fx = await buildBaseFixture("exact-time");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, {
          timePrecision: ServiceOccurrenceTimePrecision.EXACT_TIME,
          occurredAt: null,
        }),
      }),
    ).rejects.toThrow(/occ_time_precision_exact_time_check/);

    const okOcc = await prisma.serviceOccurrence.create({
      data: baseOccurrenceData(fx, {
        timePrecision: ServiceOccurrenceTimePrecision.EXACT_TIME,
        occurredAt: new Date("2026-07-18T10:00:00Z"),
      }),
    });
    expect(okOcc.occurredAt).not.toBeNull();
  });

  // TEST-07: occ_supersedes_requires_reason_check + occ_reason_requires_supersedes_check — iki yönlü invariant.
  it("TEST-07: supersedesOccurrenceId ve correctionReasonCode yalnız birlikte anlamlıdır (CHECK, iki yön)", async () => {
    const fx = await buildBaseFixture("supersede-reason");
    const original = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, { supersedesOccurrenceId: original.id, correctionReasonCode: null }),
      }),
    ).rejects.toThrow(/occ_supersedes_requires_reason_check/);

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, { supersedesOccurrenceId: null, correctionReasonCode: "DATA_ENTRY_ERROR" }),
      }),
    ).rejects.toThrow(/occ_reason_requires_supersedes_check/);

    const okOcc = await prisma.serviceOccurrence.create({
      data: baseOccurrenceData(fx, { supersedesOccurrenceId: original.id, correctionReasonCode: "DATA_ENTRY_ERROR" }),
    });
    expect(okOcc.supersedesOccurrenceId).toBe(original.id);
  });

  // TEST-08: occ_actor_required_check — ne insan ne sistem atıfı olmayan kayıt reddedilir.
  it("TEST-08: recordedByUserId VE recordedBySystem ikisi de NULL olamaz (CHECK)", async () => {
    const fx = await buildBaseFixture("no-actor");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, { recordedBySystem: null, recordedByUserId: null }),
      }),
    ).rejects.toThrow(/occ_actor_required_check/);
  });

  // TEST-09: occ_legacy_baseline_system_check — LEGACY_BASELINE için OD-SO-03 sabitleri zorunludur.
  it("TEST-09: LEGACY_BASELINE kaydı recordedBySystem=LEGACY_MIGRATION + recordedByUserId=NULL zorunlu kılar (CHECK)", async () => {
    const fx = await buildBaseFixture("legacy-baseline");

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, {
          occurrenceType: ServiceOccurrenceType.LEGACY_BASELINE,
          recordedBySystem: "WRONG_SYSTEM",
          recordedByUserId: null,
        }),
      }),
    ).rejects.toThrow(/occ_legacy_baseline_system_check/);

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, {
          occurrenceType: ServiceOccurrenceType.LEGACY_BASELINE,
          recordedBySystem: "LEGACY_MIGRATION",
          recordedByUserId: "some-user-id",
        }),
      }),
    ).rejects.toThrow(/occ_legacy_baseline_system_check/);

    const okOcc = await prisma.serviceOccurrence.create({
      data: baseOccurrenceData(fx, {
        occurrenceType: ServiceOccurrenceType.LEGACY_BASELINE,
        recordedBySystem: "LEGACY_MIGRATION",
        recordedByUserId: null,
        provenanceStatus: "LEGACY_CURRENT_STATE",
      }),
    });
    expect(okOcc.occurrenceType).toBe(ServiceOccurrenceType.LEGACY_BASELINE);
  });

  // TEST-10: supersession bütünlüğü — kendi kendini supersede edemez; aynı hedefi iki kayıt supersede edemez.
  it("TEST-10: bir occurrence kendini supersede edemez (CHECK); aynı occurrence'ı iki kayıt supersede edemez (UNIQUE)", async () => {
    const fx = await buildBaseFixture("supersede-integrity");
    const selfId = randomUUID();

    await expect(
      prisma.serviceOccurrence.create({
        data: {
          ...baseOccurrenceData(fx, { supersedesOccurrenceId: selfId, correctionReasonCode: "DATA_ENTRY_ERROR" }),
          id: selfId,
        },
      }),
    ).rejects.toThrow(/occ_no_self_supersession_check/);

    const original = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });
    await prisma.serviceOccurrence.create({
      data: baseOccurrenceData(fx, { supersedesOccurrenceId: original.id, correctionReasonCode: "FIRST_CORRECTION" }),
    });

    await expect(
      prisma.serviceOccurrence.create({
        data: baseOccurrenceData(fx, { supersedesOccurrenceId: original.id, correctionReasonCode: "SECOND_CORRECTION" }),
      }),
    ).rejects.toThrow();
  });

  // TEST-11: izin verilen tek geçiş — ACTIVE -> SUPERSEDED.
  it("TEST-11: status ACTIVE -> SUPERSEDED geçişine izin verilir", async () => {
    const fx = await buildBaseFixture("allowed-transition");
    const occ = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });

    const updated = await prisma.serviceOccurrence.update({
      where: { id: occ.id },
      data: { status: ServiceOccurrenceStatus.SUPERSEDED },
    });

    expect(updated.status).toBe(ServiceOccurrenceStatus.SUPERSEDED);
  });

  // TEST-12: yasak geçiş — SUPERSEDED -> ACTIVE reddedilir.
  it("TEST-12: status SUPERSEDED -> ACTIVE geçişi reddedilir (trigger)", async () => {
    const fx = await buildBaseFixture("illegal-transition");
    const occ = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });
    await prisma.serviceOccurrence.update({ where: { id: occ.id }, data: { status: ServiceOccurrenceStatus.SUPERSEDED } });

    await expect(
      prisma.serviceOccurrence.update({ where: { id: occ.id }, data: { status: ServiceOccurrenceStatus.ACTIVE } }),
    ).rejects.toThrow(/service_occurrence_illegal_status_transition/);
  });

  // TEST-13: status dışındaki hiçbir factual kolon güncellenemez.
  it("TEST-13: status dışında herhangi bir kolonun güncellenmesi reddedilir (immutability trigger)", async () => {
    const fx = await buildBaseFixture("immutable-field");
    const occ = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });

    await expect(
      prisma.serviceOccurrence.update({ where: { id: occ.id }, data: { sourceCode: "DEGISTIRILDI" } }),
    ).rejects.toThrow(/service_occurrence_immutable_violation/);

    await expect(
      prisma.serviceOccurrence.update({
        where: { id: occ.id },
        data: { status: ServiceOccurrenceStatus.SUPERSEDED, sourceCode: "DEGISTIRILDI" },
      }),
    ).rejects.toThrow(/service_occurrence_immutable_violation/);
  });

  // TEST-14: DELETE her koşulda reddedilir (raise_immutable_error() paylaşılan fonksiyonu).
  it("TEST-14: ServiceOccurrence hiçbir koşulda silinemez (DELETE trigger)", async () => {
    const fx = await buildBaseFixture("no-delete");
    const occ = await prisma.serviceOccurrence.create({ data: baseOccurrenceData(fx) });

    await expect(
      prisma.serviceOccurrence.delete({ where: { id: occ.id } }),
    ).rejects.toThrow(/immutable_violation/);

    const stillThere = await prisma.serviceOccurrence.findUnique({ where: { id: occ.id } });
    expect(stillThere).not.toBeNull();
  });
});
