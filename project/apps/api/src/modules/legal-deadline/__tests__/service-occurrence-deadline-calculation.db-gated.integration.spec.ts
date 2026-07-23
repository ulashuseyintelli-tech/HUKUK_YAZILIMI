/**
 * DEBTOR-OF01-HISTORY-P04-B — ServiceOccurrenceDeadlineCalculationService disposable-DB testleri.
 * Unit testler (service-occurrence-deadline-calculation.service.spec.ts) Prisma'yı mock'lar; bu
 * dosya gerçek Postgres üzerinde advisory-lock concurrency, composite-FK binding ve supersede
 * zincirinin gerçek tabloda beklendiği gibi oluştuğunu kanıtlar. Fixture-building convention
 * service-occurrence-write.db-gated.integration.spec.ts'ten izlenir.
 */
import {
  PrismaClient,
  ServiceOccurrenceRegimeCode,
  ServiceOccurrenceServiceDateRole,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { ServiceOccurrenceDeadlineCalculationService } from "../service-occurrence-deadline-calculation.service";
import {
  OccurrenceNotFoundError,
  OccurrenceTenantMismatchError,
  OccurrenceSupersededError,
  SnapshotIdempotencyConflictError,
  DeadlineInputIncompleteError,
} from "../service-occurrence-deadline-calculation.errors";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrenceDeadlineCalculationService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrenceDeadlineCalculationService — disposable DB", () => {
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
    const tenantId = `test-sodc-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `SODC Test ${label}`, slug: `test-sodc-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "SODC Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-SODC-${randomUUID().slice(0, 6)}`,
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
        // DEBTOR-OF01-HISTORY-P04-A1-R2: PR #1547 (merged as #02108e02) independently reconciled
        // this SAME fixture against origin/main's THEN-current enum name (DIRECT_DELIVERY). This
        // PR renames that value to IMMEDIATE_SERVICE (owner decision after duplicate-verification:
        // "keep IMMEDIATE_SERVICE, don't revert to DIRECT_DELIVERY") — DIRECT_DELIVERY is now a
        // dead, never-written enum member (bkz. schema.prisma yorumu).
        serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
        recordedBySystem: "TEST_HARNESS",
        status: "ACTIVE",
        ...overrides,
      },
    });
  }

  function baseCommand(
    fx: { tenantId: string },
    occurrenceId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      tenantId: fx.tenantId,
      serviceOccurrenceId: occurrenceId,
      calculationVersion: "occurrence-deadline-v1",
      objectionPeriodDays: 7,
      ...overrides,
    };
  }

  // TEST-11 + TEST-12
  it("TEST-11/12: ilk hesaplama ACTIVE snapshot oluşturur; sourceServiceOccurrenceId/sourceTebligatId occurrence'tan doğru bağlanır", async () => {
    const fx = await buildFixture("happy");
    const occurrence = await createOccurrence(fx);

    const result = await service.calculateForOccurrence(baseCommand(fx, occurrence.id));

    expect(result.status).toBe("ACTIVE");
    expect(result.sourceServiceOccurrenceId).toBe(occurrence.id);
    expect(result.sourceTebligatId).toBe(fx.tebligatId);
    expect(result.caseId).toBe(fx.caseId);
    expect(result.caseDebtorId).toBe(fx.caseDebtorId);
    expect(result.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(result.dueDate).toEqual(new Date("2026-01-17T00:00:00Z"));
    expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");

    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  // TEST-13
  it("TEST-13: aynı occurrence + aynı version replay idempotent no-op, ikinci satır oluşmaz", async () => {
    const fx = await buildFixture("idempotent-replay");
    const occurrence = await createOccurrence(fx);
    const command = baseCommand(fx, occurrence.id);

    const first = await service.calculateForOccurrence(command);
    const second = await service.calculateForOccurrence(command);

    expect(second.id).toBe(first.id);
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  // TEST-14
  it("TEST-14: aynı occurrence + aynı version, planted FARKLI çıktı → SnapshotIdempotencyConflictError (deterministik-ihlal koruması)", async () => {
    const fx = await buildFixture("output-conflict");
    const occurrence = await createOccurrence(fx);

    // Gerçekte bu durum yalnız bir hata/veri bozulmasıyla oluşabilir (calculation SAF ve
    // deterministiktir) — savunmacı invariant'ı kanıtlamak için ACTIVE bir snapshot doğrudan farklı
    // bir çıktıyla "plant" ediyoruz (aynı occurrence+version, YANLIŞ legalServiceDate).
    await prisma.legalDeadlineSnapshot.create({
      data: {
        tenantId: fx.tenantId,
        caseId: fx.caseId,
        caseDebtorId: fx.caseDebtorId,
        sourceTebligatId: fx.tebligatId,
        sourceServiceOccurrenceId: occurrence.id,
        deadlineType: "OBJECTION_PERIOD",
        legalServiceDate: new Date("2099-01-01T00:00:00Z"),
        dueDate: new Date("2099-01-08T00:00:00Z"),
        calculationRule: "OCCURRENCE_DIRECT_DELIVERY_NO_DELAY",
        calculationVersion: "occurrence-deadline-v1",
        deadlineReasonCode: "DIRECT_DELIVERY",
        status: "ACTIVE",
      },
    });

    await expect(service.calculateForOccurrence(baseCommand(fx, occurrence.id))).rejects.toThrow(
      SnapshotIdempotencyConflictError,
    );
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  // TEST-15 + TEST-16 + TEST-17
  it("TEST-15/16/17: yeni occurrence ile yeniden hesaplama supersede zinciri üretir — eski SUPERSEDED, yeni ACTIVE", async () => {
    const fx = await buildFixture("supersede-chain");
    const occurrence1 = await createOccurrence(fx, { occurredOn: new Date("2026-01-10T00:00:00Z") });
    const first = await service.calculateForOccurrence(baseCommand(fx, occurrence1.id));

    // occurrence1 SUPERSEDED edilir (P02 emsali), occurrence2 yeni ACTIVE occurrence olur — bu,
    // farklı bir occurrence ile meşru bir yeniden hesaplamayı temsil eder.
    await prisma.serviceOccurrence.update({ where: { id: occurrence1.id }, data: { status: "SUPERSEDED" } });
    const occurrence2 = await createOccurrence(fx, {
      occurredOn: new Date("2026-01-15T00:00:00Z"),
      sourceTebligatId: fx.tebligatId,
    });

    const second = await service.calculateForOccurrence(baseCommand(fx, occurrence2.id));

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("ACTIVE");
    expect(second.sourceServiceOccurrenceId).toBe(occurrence2.id);
    expect(second.legalServiceDate).toEqual(new Date("2026-01-15T00:00:00Z"));

    const firstInDb = await prisma.legalDeadlineSnapshot.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstInDb.status).toBe("SUPERSEDED");
    // Supersede edilmiş satırın hesaplanan alanları DEĞİŞMEMİŞ olmalı (immutable).
    expect(firstInDb.legalServiceDate).toEqual(first.legalServiceDate);

    const activeRows = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId, status: "ACTIVE" },
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].id).toBe(second.id);
  });

  // TEST-18
  it("TEST-18: iki eşzamanlı hesaplama (aynı occurrence) advisory lock ile serialize olur — tek ACTIVE satır kalır", async () => {
    const fx = await buildFixture("concurrent-same-occurrence");
    const occurrence = await createOccurrence(fx);
    const command = baseCommand(fx, occurrence.id);

    const [r1, r2] = await Promise.all([
      service.calculateForOccurrence(command),
      service.calculateForOccurrence(command),
    ]);

    expect(r1.id).toBe(r2.id);
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  // TEST-19
  it("TEST-19: mid-transaction failure (bozuk ikinci occurrence) önceki ACTIVE snapshot'ı bozmadan bırakır", async () => {
    const fx = await buildFixture("mid-tx-failure");
    const healthyOccurrence = await createOccurrence(fx);
    const first = await service.calculateForOccurrence(baseCommand(fx, healthyOccurrence.id));

    const brokenOccurrence = await createOccurrence(fx, {
      serviceDateRole: null,
      // DEBTOR-OF01-HISTORY-P04-A1-R2: serviceRegimeCode de birlikte null olmalı (bkz.
      // occ_p04a1r2_regime_code_pairs_with_date_role_check pairing invariant'ı) — "eksik fact"
      // senaryosunun kendisi bunu gerektiriyor, serviceDateRole TEK BAŞINA null bırakılamaz.
      serviceRegimeCode: null,
      sourceTebligatId: fx.tebligatId,
    });

    await expect(service.calculateForOccurrence(baseCommand(fx, brokenOccurrence.id))).rejects.toThrow(
      DeadlineInputIncompleteError,
    );

    const firstInDb = await prisma.legalDeadlineSnapshot.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstInDb.status).toBe("ACTIVE");
    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(1);
  });

  // TEST-20
  it("TEST-20: cross-tenant erişim OccurrenceTenantMismatchError ile reddedilir, hiçbir satır oluşmaz", async () => {
    const fxA = await buildFixture("tenant-a");
    const fxB = await buildFixture("tenant-b");
    const occurrenceA = await createOccurrence(fxA);

    await expect(
      service.calculateForOccurrence(baseCommand(fxB, occurrenceA.id)),
    ).rejects.toThrow(OccurrenceTenantMismatchError);

    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { sourceServiceOccurrenceId: occurrenceA.id } });
    expect(rows).toHaveLength(0);
  });

  // TEST-21
  it("TEST-21: bulunamayan occurrenceId OccurrenceNotFoundError fırlatır", async () => {
    const fx = await buildFixture("not-found");

    await expect(
      service.calculateForOccurrence(baseCommand(fx, "nonexistent-cuid-00000000")),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });

  // TEST-22
  it("TEST-22: SUPERSEDED occurrence hiçbir snapshot üretmez", async () => {
    const fx = await buildFixture("superseded-occurrence");
    const occurrence = await createOccurrence(fx, { status: "SUPERSEDED" });

    await expect(
      service.calculateForOccurrence(baseCommand(fx, occurrence.id)),
    ).rejects.toThrow(OccurrenceSupersededError);

    const rows = await prisma.legalDeadlineSnapshot.findMany({ where: { tenantId: fx.tenantId } });
    expect(rows).toHaveLength(0);
  });

  // TEST-23 + TEST-24
  it("TEST-23/24: farklı Tebligat'a ait legacy (sourceServiceOccurrenceId=null) ACTIVE snapshot'lar birbirini etkilemez", async () => {
    const fxA = await buildFixture("legacy-untouched-a");
    const fxB = await buildFixture("legacy-untouched-b");

    const legacySnapshotA = await prisma.legalDeadlineSnapshot.create({
      data: {
        tenantId: fxA.tenantId,
        caseId: fxA.caseId,
        caseDebtorId: fxA.caseDebtorId,
        sourceTebligatId: fxA.tebligatId,
        sourceServiceOccurrenceId: null,
        deadlineType: "OBJECTION_PERIOD",
        legalServiceDate: new Date("2026-01-05T00:00:00Z"),
        dueDate: new Date("2026-01-12T00:00:00Z"),
        calculationRule: "TK_21_2_NO_DELAY",
        calculationVersion: "legal-deadline-v1",
        deadlineReasonCode: "TK_21_2",
        status: "ACTIVE",
      },
    });
    const legacySnapshotB = await prisma.legalDeadlineSnapshot.create({
      data: {
        tenantId: fxB.tenantId,
        caseId: fxB.caseId,
        caseDebtorId: fxB.caseDebtorId,
        sourceTebligatId: fxB.tebligatId,
        sourceServiceOccurrenceId: null,
        deadlineType: "OBJECTION_PERIOD",
        legalServiceDate: new Date("2026-01-06T00:00:00Z"),
        dueDate: new Date("2026-01-13T00:00:00Z"),
        calculationRule: "TK_21_2_NO_DELAY",
        calculationVersion: "legal-deadline-v1",
        deadlineReasonCode: "TK_21_2",
        status: "ACTIVE",
      },
    });

    // Yalnız fxA'nın Tebligat'ına bağlı yeni bir occurrence ile hesapla — fxA'nın legacy snapshot'ı
    // meşru şekilde supersede edilir (aynı sourceTebligatId, farklı sourceServiceOccurrenceId).
    const occurrenceA = await createOccurrence(fxA);
    const resultA = await service.calculateForOccurrence(baseCommand(fxA, occurrenceA.id));

    expect(resultA.supersedesSnapshotId).toBe(legacySnapshotA.id);
    const legacyAInDb = await prisma.legalDeadlineSnapshot.findUniqueOrThrow({ where: { id: legacySnapshotA.id } });
    expect(legacyAInDb.status).toBe("SUPERSEDED");

    // fxB'nin İLGİSİZ legacy snapshot'ı dokunulmadan ACTIVE kalır.
    const legacyBInDb = await prisma.legalDeadlineSnapshot.findUniqueOrThrow({ where: { id: legacySnapshotB.id } });
    expect(legacyBInDb.status).toBe("ACTIVE");
    expect(legacyBInDb.legalServiceDate).toEqual(legacySnapshotB.legalServiceDate);
  });
});
