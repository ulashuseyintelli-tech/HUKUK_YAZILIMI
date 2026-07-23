/**
 * DEBTOR-OF01-HISTORY-P04-B — ServiceOccurrenceDeadlineCalculationService unit testleri
 * (Prisma mock). Disposable-DB kanıtı için bkz.
 * service-occurrence-deadline-calculation.db-gated.integration.spec.ts.
 */
import { ServiceOccurrenceServiceDateRole } from "@prisma/client";
import { determineOccurrenceLegalServiceDate } from "../service-occurrence-deadline-rule";
import { ServiceOccurrenceDeadlineCalculationService } from "../service-occurrence-deadline-calculation.service";
import {
  DeadlineInputIncompleteError,
  OccurrenceSupersededError,
  SnapshotWriteFailedError,
} from "../service-occurrence-deadline-calculation.errors";

const BASE_OCCURRED_ON = new Date("2026-01-10T00:00:00.000Z");

describe("determineOccurrenceLegalServiceDate (pure rule function)", () => {
  // TEST-01
  it("TEST-01: DIRECT_DELIVERY doğru legal service date üretir (occurredOn, gecikmesiz)", () => {
    const result = determineOccurrenceLegalServiceDate({
      serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY,
      addressTypeAtOccurrence: "BILINEN",
      occurredOn: BASE_OCCURRED_ON,
    });

    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.calculationRule).toBe("OCCURRENCE_DIRECT_DELIVERY_NO_DELAY");
    expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");
  });

  // TEST-02
  it("TEST-02: MUHTAR_DELIVERY doğru rule path kullanır (occurredOn, TK 20/21 ayrımı YOK — owner kararı)", () => {
    const result = determineOccurrenceLegalServiceDate({
      serviceDateRole: ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY,
      addressTypeAtOccurrence: "MERNIS",
      occurredOn: BASE_OCCURRED_ON,
    });

    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.calculationRule).toBe("OCCURRENCE_MUHTAR_DELIVERY_NO_DELAY");
    expect(result.deadlineReasonCode).toBe("MUHTAR_DELIVERY");
    // addressTypeAtOccurrence (BILINEN vs MERNIS) rejim seçimini ETKİLEMEZ — owner kararı.
    const resultBilinen = determineOccurrenceLegalServiceDate({
      serviceDateRole: ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY,
      addressTypeAtOccurrence: "BILINEN",
      occurredOn: BASE_OCCURRED_ON,
    });
    expect(resultBilinen.deadlineReasonCode).toBe("MUHTAR_DELIVERY");
    expect(resultBilinen.legalServiceDate).toEqual(result.legalServiceDate);
  });

  // TEST-03
  it("TEST-03: PUBLICATION doğru rule path kullanır (occurredOn + 7 gün, TK m.31)", () => {
    const result = determineOccurrenceLegalServiceDate({
      serviceDateRole: ServiceOccurrenceServiceDateRole.PUBLICATION,
      addressTypeAtOccurrence: "MERNIS",
      occurredOn: BASE_OCCURRED_ON,
    });

    const expected = new Date(BASE_OCCURRED_ON);
    expected.setDate(expected.getDate() + 7);
    expect(result.legalServiceDate).toEqual(expected);
    expect(result.calculationRule).toBe("OCCURRENCE_PUBLICATION_PLUS_7_DAYS");
    expect(result.deadlineReasonCode).toBe("ILANEN_M31");
  });

  // TEST-04
  it("TEST-04: null serviceDateRole fail-closed DeadlineInputIncompleteError fırlatır", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate({
        serviceDateRole: null,
        addressTypeAtOccurrence: "BILINEN",
        occurredOn: BASE_OCCURRED_ON,
      }),
    ).toThrow(DeadlineInputIncompleteError);
  });

  // TEST-05
  it("TEST-05: addressTypeAtOccurrence eksikse fail-closed DeadlineInputIncompleteError fırlatır", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate({
        serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY,
        addressTypeAtOccurrence: null,
        occurredOn: BASE_OCCURRED_ON,
      }),
    ).toThrow(DeadlineInputIncompleteError);
  });
});

describe("ServiceOccurrenceDeadlineCalculationService (mocked Prisma)", () => {
  function buildOccurrence(overrides: Record<string, unknown> = {}) {
    return {
      id: "occ-1",
      tenantId: "tenant-1",
      caseId: "case-1",
      caseDebtorId: "cd-1",
      sourceTebligatId: "tb-1",
      status: "ACTIVE",
      serviceDateRole: ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY,
      addressTypeAtOccurrence: "BILINEN",
      occurredOn: BASE_OCCURRED_ON,
      ...overrides,
    };
  }

  function buildPrismaMock(occurrence: any, overrides: Record<string, any> = {}) {
    const legalDeadlineSnapshot = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: "snap-1", ...args.data })),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides.legalDeadlineSnapshot,
    };
    const prisma: any = {
      serviceOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence) },
      legalDeadlineSnapshot,
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
      tebligat: {
        findFirst: jest.fn().mockRejectedValue(new Error("TEST-10: Tebligat MUST NOT be read by this service")),
        findUnique: jest.fn().mockRejectedValue(new Error("TEST-10: Tebligat MUST NOT be read by this service")),
      },
    };
    return prisma;
  }

  function baseCommand(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: "tenant-1",
      serviceOccurrenceId: "occ-1",
      calculationVersion: "occurrence-deadline-v1",
      objectionPeriodDays: 7,
      ...overrides,
    };
  }

  // TEST-06
  it("TEST-06: caller sourceTebligatId belirleyemez — komut arayüzünde alan yok, snapshot occurrence'tan türer", async () => {
    const occurrence = buildOccurrence({ sourceTebligatId: "tb-authoritative" });
    const prisma = buildPrismaMock(occurrence);
    const svc = new ServiceOccurrenceDeadlineCalculationService(prisma);

    // Command tipinde sourceTebligatId YOK; `as any` ile enjekte edilmeye çalışılsa bile
    // servis onu OKUMAZ — yalnız occurrence.sourceTebligatId kullanılır.
    const command = { ...baseCommand(), sourceTebligatId: "tb-caller-supplied-should-be-ignored" } as any;
    const result = await svc.calculateForOccurrence(command);

    expect(result.sourceTebligatId).toBe("tb-authoritative");
    expect(prisma.legalDeadlineSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceTebligatId: "tb-authoritative" }) }),
    );
  });

  // TEST-07
  it("TEST-07: snapshot fields (caseId/caseDebtorId/sourceTebligatId/sourceServiceOccurrenceId) occurrence'tan türetilir", async () => {
    const occurrence = buildOccurrence({
      caseId: "case-derived",
      caseDebtorId: "cd-derived",
      sourceTebligatId: "tb-derived",
      id: "occ-derived",
    });
    const prisma = buildPrismaMock(occurrence);
    const svc = new ServiceOccurrenceDeadlineCalculationService(prisma);

    await svc.calculateForOccurrence(baseCommand({ serviceOccurrenceId: "occ-derived" }));

    expect(prisma.legalDeadlineSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          caseId: "case-derived",
          caseDebtorId: "cd-derived",
          sourceTebligatId: "tb-derived",
          sourceServiceOccurrenceId: "occ-derived",
        }),
      }),
    );
  });

  // TEST-08
  it("TEST-08: SUPERSEDED occurrence OccurrenceSupersededError fırlatır, hiçbir snapshot oluşturulmaz", async () => {
    const occurrence = buildOccurrence({ status: "SUPERSEDED" });
    const prisma = buildPrismaMock(occurrence);
    const svc = new ServiceOccurrenceDeadlineCalculationService(prisma);

    await expect(svc.calculateForOccurrence(baseCommand())).rejects.toThrow(OccurrenceSupersededError);
    expect(prisma.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  // TEST-09
  it("TEST-09: raw Prisma/DB hatası servis sınırı dışına sızmaz — typed SnapshotWriteFailedError'a sarılır", async () => {
    const occurrence = buildOccurrence();
    const prisma = buildPrismaMock(occurrence, {
      legalDeadlineSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error("raw postgres connection reset — internal detail")),
        update: jest.fn().mockResolvedValue(undefined),
      },
    });
    const svc = new ServiceOccurrenceDeadlineCalculationService(prisma);

    await expect(svc.calculateForOccurrence(baseCommand())).rejects.toThrow(SnapshotWriteFailedError);
    await expect(svc.calculateForOccurrence(baseCommand())).rejects.not.toThrow(/raw postgres connection reset/);
  });

  // TEST-10
  it("TEST-10: legacy mutable Tebligat fact'leri calculation input'u olarak kullanılmaz (Tebligat modeli hiç okunmaz)", async () => {
    const occurrence = buildOccurrence();
    const prisma = buildPrismaMock(occurrence);
    const svc = new ServiceOccurrenceDeadlineCalculationService(prisma);

    await svc.calculateForOccurrence(baseCommand());

    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    expect(prisma.tebligat.findUnique).not.toHaveBeenCalled();
  });
});
