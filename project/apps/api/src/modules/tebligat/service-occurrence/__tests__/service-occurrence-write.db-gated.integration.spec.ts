/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrenceService disposable-DB entegrasyon + concurrency testleri.
 * Unit testler (service-occurrence.service.spec.ts) Prisma'yı mock'lar; bu dosya gerçek bir Postgres
 * üzerinde tenant-isolation, idempotency (STRONG_SOURCE_HASH) ve supersede concurrency'sini kanıtlar.
 */
import { PrismaClient, ServiceOccurrenceTimePrecision } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../../test/test-db-env";
import { ServiceOccurrenceService } from "../service-occurrence.service";
import { IdempotencyMode, CreateServiceOccurrenceCommand, SupersedeServiceOccurrenceCommand } from "../service-occurrence.types";
import {
  ServiceOccurrenceParentNotFoundError,
  ServiceOccurrenceIdempotencyConflictError,
  ServiceOccurrenceValidationError,
  ServiceOccurrenceNotActiveError,
  ServiceOccurrenceAlreadySupersededError,
} from "../service-occurrence.errors";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrenceService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrenceService — disposable DB (write-side)", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  let service: ServiceOccurrenceService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    service = new ServiceOccurrenceService(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-sow-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `ServiceOccurrenceWrite Test ${label}`, slug: `test-sow-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "SOW Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-SOW-${randomUUID().slice(0, 6)}`,
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

  function baseCreateCommand(
    fx: { tenantId: string; tebligatId: string },
    overrides: Partial<CreateServiceOccurrenceCommand> = {},
  ): CreateServiceOccurrenceCommand {
    return {
      tenantId: fx.tenantId,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT" as any,
      sourceSystemCode: "PTT",
      sourceCode: "TESLIM_EDILDI",
      occurredOn: new Date("2026-07-20T00:00:00Z"),
      timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
      addressTypeAtOccurrence: "BILINEN" as any, // DEBTOR-OF01-HISTORY-P04-A1
      actor: { systemCode: "TEST_HARNESS" },
      idempotencyMode: IdempotencyMode.NONE,
      ...overrides,
    };
  }

  // TEST-11
  it("TEST-11: normal occurrence başarıyla oluşturulur", async () => {
    const fx = await buildFixture("happy");
    const result = await service.createOccurrence(baseCreateCommand(fx));

    expect(result.created).toBe(true);
    expect(result.occurrence.tenantId).toBe(fx.tenantId);
    expect(result.occurrence.status).toBe("ACTIVE");
  });

  // TEST-12
  it("TEST-12: cross-tenant Tebligat üzerinden create yapılamaz", async () => {
    const fxA = await buildFixture("tenant-a");
    const fxB = await buildFixture("tenant-b");

    await expect(
      service.createOccurrence(baseCreateCommand({ tenantId: fxB.tenantId, tebligatId: fxA.tebligatId })),
    ).rejects.toThrow(ServiceOccurrenceParentNotFoundError);

    const rows = await prisma.serviceOccurrence.findMany({ where: { sourceTebligatId: fxA.tebligatId, tenantId: fxB.tenantId } });
    expect(rows).toHaveLength(0);
  });

  // TEST-13
  it("TEST-13: caseId/caseDebtorId parent'tan doğru yazılır", async () => {
    const fx = await buildFixture("scope-derivation");
    const result = await service.createOccurrence(baseCreateCommand(fx));

    expect(result.occurrence.caseId).toBe(fx.caseId);
    expect(result.occurrence.caseDebtorId).toBe(fx.caseDebtorId);
  });

  // TEST-14
  it("TEST-14: STRONG_SOURCE_HASH ilk çağrıda yeni occurrence oluşturur", async () => {
    const fx = await buildFixture("strong-hash-first");
    const result = await service.createOccurrence(
      baseCreateCommand(fx, { idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: "hash-001" }),
    );

    expect(result.created).toBe(true);
  });

  // TEST-15
  it("TEST-15: aynı strong key + aynı payload ikinci çağrıda aynı occurrence'ı döndürür; ikinci satır oluşmaz", async () => {
    const fx = await buildFixture("strong-hash-replay");
    const command = baseCreateCommand(fx, { idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: "hash-002" });

    const first = await service.createOccurrence(command);
    const second = await service.createOccurrence(command);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.occurrence.id).toBe(first.occurrence.id);

    const rows = await prisma.serviceOccurrence.findMany({ where: { tenantId: fx.tenantId, sourcePayloadHash: "hash-002" } });
    expect(rows).toHaveLength(1);
  });

  // TEST-16
  it("TEST-16: aynı strong key + farklı payload IDEMPOTENCY_CONFLICT üretir", async () => {
    const fx = await buildFixture("strong-hash-conflict");
    const command = baseCreateCommand(fx, { idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: "hash-003" });
    await service.createOccurrence(command);

    await expect(
      service.createOccurrence({ ...command, sourceCode: "ADRESTE_BULUNAMADI" }),
    ).rejects.toThrow(ServiceOccurrenceIdempotencyConflictError);

    const rows = await prisma.serviceOccurrence.findMany({ where: { tenantId: fx.tenantId, sourcePayloadHash: "hash-003" } });
    expect(rows).toHaveLength(1);
  });

  // TEST-17
  it("TEST-17: iki eşzamanlı aynı strong-key create sonucunda tek DB satırı oluşur", async () => {
    const fx = await buildFixture("strong-hash-race");
    const command = baseCreateCommand(fx, { idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: "hash-race" });

    const [r1, r2] = await Promise.all([service.createOccurrence(command), service.createOccurrence(command)]);

    const createdCount = [r1, r2].filter((r) => r.created).length;
    const reusedCount = [r1, r2].filter((r) => !r.created).length;
    expect(createdCount).toBe(1);
    expect(reusedCount).toBe(1);

    const rows = await prisma.serviceOccurrence.findMany({ where: { tenantId: fx.tenantId, sourcePayloadHash: "hash-race" } });
    expect(rows).toHaveLength(1);
  });

  // TEST-18
  it("TEST-18: IdempotencyMode.NONE ile aynı factual değerlere sahip iki occurrence oluşturulabilir", async () => {
    const fx = await buildFixture("none-mode-duplicate");
    const command = baseCreateCommand(fx, { idempotencyMode: IdempotencyMode.NONE });

    const first = await service.createOccurrence(command);
    const second = await service.createOccurrence(command);

    expect(first.occurrence.id).not.toBe(second.occurrence.id);
    const rows = await prisma.serviceOccurrence.findMany({ where: { tenantId: fx.tenantId, sourceTebligatId: fx.tebligatId } });
    expect(rows).toHaveLength(2);
  });

  function baseSupersedeCommand(
    fx: { tenantId: string },
    previousOccurrenceId: string,
    overrides: Partial<SupersedeServiceOccurrenceCommand> = {},
  ): SupersedeServiceOccurrenceCommand {
    return {
      tenantId: fx.tenantId,
      previousOccurrenceId,
      replacement: {
        occurrenceType: "POSTAL_DELIVERY_RESULT" as any,
        sourceSystemCode: "PTT",
        sourceCode: "ADRESTE_BULUNAMADI",
        occurredOn: new Date("2026-07-21T00:00:00Z"),
        timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
        addressTypeAtOccurrence: "BILINEN" as any, // DEBTOR-OF01-HISTORY-P04-A1
      },
      correctionReasonCode: "DATA_ENTRY_ERROR",
      actor: { systemCode: "TEST_HARNESS" },
      idempotencyMode: IdempotencyMode.NONE,
      ...overrides,
    };
  }

  // TEST-19 + TEST-20 + TEST-21
  it("TEST-19/20/21: ACTIVE occurrence atomik supersede edilir; eski SUPERSEDED, yeni ACTIVE ve bağlı olur", async () => {
    const fx = await buildFixture("supersede-happy");
    const original = await service.createOccurrence(baseCreateCommand(fx));

    const result = await service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id));

    expect(result.previousOccurrence.status).toBe("SUPERSEDED");
    expect(result.newOccurrence.status).toBe("ACTIVE");
    expect(result.newOccurrence.supersedesOccurrenceId).toBe(original.occurrence.id);

    const previousInDb = await prisma.serviceOccurrence.findUniqueOrThrow({ where: { id: original.occurrence.id } });
    expect(previousInDb.status).toBe("SUPERSEDED");
  });

  // TEST-22
  it("TEST-22: supersede correctionReasonCode olmadan reddedilir", async () => {
    const fx = await buildFixture("supersede-no-reason");
    const original = await service.createOccurrence(baseCreateCommand(fx));

    await expect(
      service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id, { correctionReasonCode: "" })),
    ).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  // TEST-23
  it("TEST-23: SUPERSEDED occurrence yeniden supersede edilemez", async () => {
    const fx = await buildFixture("supersede-twice");
    const original = await service.createOccurrence(baseCreateCommand(fx));
    await service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id));

    await expect(
      service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id)),
    ).rejects.toThrow(ServiceOccurrenceNotActiveError);
  });

  // TEST-24 + TEST-25
  it("TEST-24/25: iki eşzamanlı supersede'den yalnız biri başarılı olur, kaybeden hiçbir iz bırakmaz", async () => {
    const fx = await buildFixture("supersede-race");
    const original = await service.createOccurrence(baseCreateCommand(fx));

    const results = await Promise.allSettled([
      service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id, { correctionReasonCode: "RACE_A" })),
      service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id, { correctionReasonCode: "RACE_B" })),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ServiceOccurrenceAlreadySupersededError);

    // TEST-25: kaybeden transaction hiçbir kısmi iz bırakmamalı — tam olarak 1 yeni occurrence,
    // previous tam olarak 1 kez SUPERSEDED olmalı.
    const newRows = await prisma.serviceOccurrence.findMany({ where: { supersedesOccurrenceId: original.occurrence.id } });
    expect(newRows).toHaveLength(1);

    const previousInDb = await prisma.serviceOccurrence.findUniqueOrThrow({ where: { id: original.occurrence.id } });
    expect(previousInDb.status).toBe("SUPERSEDED");
  });

  // TEST-26
  it("TEST-26: create/supersede işlemleri hiçbir LegalDeadlineSnapshot kaydı üretmez", async () => {
    const fx = await buildFixture("no-side-effects");
    const original = await service.createOccurrence(baseCreateCommand(fx));
    await service.supersedeOccurrence(baseSupersedeCommand(fx, original.occurrence.id));

    const snapshotCount = await prisma.legalDeadlineSnapshot.count({ where: { tenantId: fx.tenantId } });
    expect(snapshotCount).toBe(0);
  });
});
