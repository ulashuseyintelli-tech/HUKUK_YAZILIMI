/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrenceService unit testleri (Prisma mock).
 * Disposable-DB entegrasyon/concurrency testleri için bkz. service-occurrence-write.db-gated.integration.spec.ts.
 */
import { Prisma, ServiceOccurrenceTimePrecision } from "@prisma/client";
import { ServiceOccurrenceService } from "../service-occurrence.service";
import { IdempotencyMode, CreateServiceOccurrenceCommand } from "../service-occurrence.types";
import { ServiceOccurrenceValidationError, ServiceOccurrenceConcurrentWriteConflictError } from "../service-occurrence.errors";

function buildMockPrisma(opts: {
  tebligat?: any;
  existingOccurrence?: any;
  transactionImpl?: (fn: any) => Promise<any>;
} = {}) {
  const txClient = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    serviceOccurrence: {
      findFirst: jest.fn().mockResolvedValue(opts.existingOccurrence ?? null),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "occ-new", status: "ACTIVE", createdAt: new Date(), recordedAt: new Date(), ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    },
  };

  return {
    tebligat: {
      findFirst: jest.fn().mockResolvedValue(
        opts.tebligat === undefined ? { id: "tebligat-1", caseId: "case-1", caseDebtorId: "casedebtor-1" } : opts.tebligat,
      ),
    },
    serviceOccurrence: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "occ-new", status: "ACTIVE", createdAt: new Date(), recordedAt: new Date(), ...data }),
      ),
    },
    $transaction: jest.fn().mockImplementation(opts.transactionImpl ?? ((fn: any) => fn(txClient))),
  } as any;
}

function baseCommand(overrides: Partial<CreateServiceOccurrenceCommand> = {}): CreateServiceOccurrenceCommand {
  return {
    tenantId: "tenant-1",
    sourceTebligatId: "tebligat-1",
    occurrenceType: "POSTAL_DELIVERY_RESULT" as any,
    sourceSystemCode: "PTT",
    sourceCode: "TESLIM_EDILDI",
    occurredOn: new Date("2026-07-20T00:00:00Z"),
    timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY,
    actor: { systemCode: "TEST_SYSTEM" },
    idempotencyMode: IdempotencyMode.NONE,
    ...overrides,
  };
}

describe("ServiceOccurrenceService — unit (Prisma mock)", () => {
  it("TEST-01: parent scope'tan caseId/caseDebtorId türetilir", async () => {
    const prisma = buildMockPrisma({ tebligat: { id: "tebligat-1", caseId: "case-XYZ", caseDebtorId: "cd-XYZ" } });
    const svc = new ServiceOccurrenceService(prisma);

    await svc.createOccurrence(baseCommand());

    expect(prisma.serviceOccurrence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ caseId: "case-XYZ", caseDebtorId: "cd-XYZ" }) }),
    );
  });

  it("TEST-02: caller denormalize scope belirleyemez (inject edilse bile parent'tan türetilen değer kullanılır)", async () => {
    const prisma = buildMockPrisma({ tebligat: { id: "tebligat-1", caseId: "case-REAL", caseDebtorId: "cd-REAL" } });
    const svc = new ServiceOccurrenceService(prisma);

    const maliciousCommand = {
      ...baseCommand(),
      caseId: "case-INJECTED",
      caseDebtorId: "cd-INJECTED",
    } as unknown as CreateServiceOccurrenceCommand;

    await svc.createOccurrence(maliciousCommand);

    expect(prisma.serviceOccurrence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ caseId: "case-REAL", caseDebtorId: "cd-REAL" }) }),
    );
  });

  it("TEST-03: timePrecision=DATE_ONLY iken occurredAt dolu olamaz", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    await expect(
      svc.createOccurrence(baseCommand({ timePrecision: ServiceOccurrenceTimePrecision.DATE_ONLY, occurredAt: new Date() })),
    ).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-04: timePrecision=EXACT_TIME iken occurredAt null reddedilir", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    await expect(
      svc.createOccurrence(baseCommand({ timePrecision: ServiceOccurrenceTimePrecision.EXACT_TIME, occurredAt: null })),
    ).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-05: actor.userId VE actor.systemCode ikisi de yoksa reddedilir", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    await expect(svc.createOccurrence(baseCommand({ actor: {} }))).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-06: normal create ile occurrenceType=LEGACY_BASELINE reddedilir", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    const command = baseCommand({ occurrenceType: "LEGACY_BASELINE" as any });
    await expect(svc.createOccurrence(command)).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-07: normal create ile provenanceStatus=LEGACY_CURRENT_STATE inject edilse bile create data'ya yansımaz", async () => {
    const prisma = buildMockPrisma();
    const svc = new ServiceOccurrenceService(prisma);

    const maliciousCommand = {
      ...baseCommand(),
      provenanceStatus: "LEGACY_CURRENT_STATE",
    } as unknown as CreateServiceOccurrenceCommand;

    await svc.createOccurrence(maliciousCommand);

    const createCall = prisma.serviceOccurrence.create.mock.calls[0][0];
    expect(createCall.data.provenanceStatus).toBeUndefined();
  });

  it("TEST-08: IdempotencyMode.STRONG_SOURCE_HASH sourcePayloadHash olmadan reddedilir", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    await expect(
      svc.createOccurrence(baseCommand({ idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: undefined })),
    ).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-09: idempotencyMode açıkça verilmezse reddedilir", async () => {
    const svc = new ServiceOccurrenceService(buildMockPrisma());
    const command = { ...baseCommand(), idempotencyMode: undefined } as unknown as CreateServiceOccurrenceCommand;
    await expect(svc.createOccurrence(command)).rejects.toThrow(ServiceOccurrenceValidationError);
  });

  it("TEST-10: raw Prisma P2002 hatası typed domain error'a çevrilir", async () => {
    const prisma = buildMockPrisma({
      transactionImpl: async () => {
        throw new Prisma.PrismaClientKnownRequestError("unique race", {
          code: "P2002",
          clientVersion: "5.22.0",
        });
      },
    });
    const svc = new ServiceOccurrenceService(prisma);

    await expect(
      svc.createOccurrence(
        baseCommand({ idempotencyMode: IdempotencyMode.STRONG_SOURCE_HASH, sourcePayloadHash: "hash-abc" }),
      ),
    ).rejects.toThrow(ServiceOccurrenceConcurrentWriteConflictError);
  });
});
