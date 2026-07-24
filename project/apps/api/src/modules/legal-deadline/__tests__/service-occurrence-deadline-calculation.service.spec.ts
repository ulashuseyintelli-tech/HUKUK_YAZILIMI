/**
 * DEBTOR-OF01-HISTORY-P04-B — ServiceOccurrenceDeadlineCalculationService unit testleri
 * (Prisma mock). Disposable-DB kanıtı için bkz.
 * service-occurrence-deadline-calculation.db-gated.integration.spec.ts.
 */
import {
  ServiceOccurrenceRegimeCode,
  ServiceCompletionMode,
  SubstituteRecipientBasis,
} from "@prisma/client";
import { determineOccurrenceLegalServiceDate } from "../service-occurrence-deadline-rule";
import { ServiceOccurrenceDeadlineCalculationService } from "../service-occurrence-deadline-calculation.service";
import {
  DeadlineInputIncompleteError,
  OccurrenceSupersededError,
  SnapshotWriteFailedError,
} from "../service-occurrence-deadline-calculation.errors";

const BASE_OCCURRED_ON = new Date("2026-01-10T00:00:00.000Z");

function occurrenceFacts(overrides: Partial<{
  serviceRegimeCode: ServiceOccurrenceRegimeCode | null;
  serviceCompletionMode: ServiceCompletionMode | null;
  substituteRecipientBasis: SubstituteRecipientBasis | null;
  addressTypeAtOccurrence: string | null;
  occurredOn: Date;
}> = {}) {
  return {
    serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
    serviceCompletionMode: null,
    substituteRecipientBasis: null,
    addressTypeAtOccurrence: "BILINEN",
    occurredOn: BASE_OCCURRED_ON,
    ...overrides,
  };
}

describe("determineOccurrenceLegalServiceDate (LegalServiceDateRuleCore'a delege eder — I03)", () => {
  it("IMMEDIATE_SERVICE + DIRECT_RECIPIENT_DELIVERY: gecikmesiz", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
        serviceCompletionMode: ServiceCompletionMode.DIRECT_RECIPIENT_DELIVERY,
      }),
    );
    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");
  });

  it("IMMEDIATE_SERVICE + DELIVERED_TO_AUTHORIZED_PERSON: gecikmesiz", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
        serviceCompletionMode: ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
      }),
    );
    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");
  });

  it("TK_21_1: completion mode olmadan gecikmesiz", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1 }),
    );
    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.deadlineReasonCode).toBe("TK_21_1");
  });

  it("TK_21_2: completion mode olmadan gecikmesiz", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_2 }),
    );
    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.deadlineReasonCode).toBe("TK_21_2");
  });

  it("DEBTOR-OF01-HISTORY-P04-B-R2-I03 — TK_20_TEMPORARY_ABSENCE + NOTICE_POSTED: +15 gün (STOP-02'nin çözümü)", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
      }),
    );
    const expected = new Date(BASE_OCCURRED_ON);
    expected.setDate(expected.getDate() + 15);
    expect(result.legalServiceDate).toEqual(expected);
    expect(result.deadlineReasonCode).toBe("TK_20");
  });

  it("TK_20_TEMPORARY_ABSENCE + DELIVERED_TO_AUTHORIZED_PERSON: gecikmesiz", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
      }),
    );
    expect(result.legalServiceDate).toEqual(BASE_OCCURRED_ON);
    expect(result.deadlineReasonCode).toBe("TK_20");
  });

  it("TK_20_TEMPORARY_ABSENCE + completion mode eksik: fail-closed DeadlineInputIncompleteError", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate(
        occurrenceFacts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE }),
      ),
    ).toThrow(DeadlineInputIncompleteError);
  });

  it("TK_20_TEMPORARY_ABSENCE + geçersiz completion mode: fail-closed DeadlineInputIncompleteError", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate(
        occurrenceFacts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
          serviceCompletionMode: ServiceCompletionMode.ELECTRONIC_DELIVERY,
        }),
      ),
    ).toThrow(DeadlineInputIncompleteError);
  });

  it("PUBLICATION: +7 gün (TK m.31)", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION }),
    );
    const expected = new Date(BASE_OCCURRED_ON);
    expected.setDate(expected.getDate() + 7);
    expect(result.legalServiceDate).toEqual(expected);
    expect(result.deadlineReasonCode).toBe("ILANEN_M31");
  });

  it("ELECTRONIC: +5 gün", () => {
    const result = determineOccurrenceLegalServiceDate(
      occurrenceFacts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.ELECTRONIC }),
    );
    const expected = new Date(BASE_OCCURRED_ON);
    expected.setDate(expected.getDate() + 5);
    expect(result.legalServiceDate).toEqual(expected);
    expect(result.deadlineReasonCode).toBe("UETS_M7A");
  });

  it.each([SubstituteRecipientBasis.ARTICLE_13, SubstituteRecipientBasis.ARTICLE_16])(
    "substituteRecipientBasis=%s sonucu etkilemez (TK_20+NOTICE_POSTED hâlâ +15 gün)",
    (basis) => {
      const result = determineOccurrenceLegalServiceDate(
        occurrenceFacts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
          serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
          substituteRecipientBasis: basis,
        }),
      );
      const expected = new Date(BASE_OCCURRED_ON);
      expected.setDate(expected.getDate() + 15);
      expect(result.legalServiceDate).toEqual(expected);
    },
  );

  it("serviceRegimeCode null: fail-closed DeadlineInputIncompleteError", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate(occurrenceFacts({ serviceRegimeCode: null })),
    ).toThrow(DeadlineInputIncompleteError);
  });

  it("addressTypeAtOccurrence eksikse fail-closed DeadlineInputIncompleteError", () => {
    expect(() =>
      determineOccurrenceLegalServiceDate(occurrenceFacts({ addressTypeAtOccurrence: null })),
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
      serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
      serviceCompletionMode: null,
      substituteRecipientBasis: null,
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
