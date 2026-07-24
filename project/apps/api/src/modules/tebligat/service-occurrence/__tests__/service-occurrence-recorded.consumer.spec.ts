/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — ServiceOccurrenceRecordedConsumerService unit testleri.
 * Prisma'ya dokunmaz; accessor/ProceedingClassificationService/ServiceOccurrenceDeadlineCalculationService
 * hafif jest.fn() sahteleriyle mock'lanır. Gerçek DB zinciri
 * service-occurrence-recorded-consumer.db-gated.integration.spec.ts'tedir.
 */
import { ProceedingType, JudgmentExecutionType } from "@prisma/client";
import { ServiceOccurrenceRecordedConsumerService } from "../service-occurrence-recorded.consumer";
import { ObjectionPeriodDaysUnresolvedError } from "../service-occurrence-recorded-consumer.errors";
import { ServiceOccurrenceRecordedEventNotFoundError } from "../service-occurrence-recorded-event.errors";
import {
  OccurrenceNotFoundError,
  OccurrenceTenantMismatchError,
} from "../../../legal-deadline/service-occurrence-deadline-calculation.errors";
import { CALCULATION_VERSION } from "../../../legal-deadline/service-occurrence-deadline-calculation.service";

function buildDeps() {
  const accessor = { loadCanonicalPayload: jest.fn() } as any;
  const proceedingClassificationService = { resolveProceedingClassification: jest.fn() } as any;
  const calculationService = { calculateForOccurrence: jest.fn() } as any;
  return { accessor, proceedingClassificationService, calculationService };
}

function buildCanonicalPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-1",
    tenantId: "tenant-1",
    serviceOccurrenceId: "occ-1",
    sourceTebligatId: "teb-1",
    occurrenceType: "POSTAL_DELIVERY_RESULT",
    occurredOn: "2026-01-10",
    recordedAt: "2026-01-11T00:00:00.000Z",
    ...overrides,
  };
}

const CTX = { actionId: "a1", tenantId: "tenant-1", actionType: "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED" };

describe("ServiceOccurrenceRecordedConsumerService", () => {
  it("payload accessor.loadCanonicalPayload(payload, context.tenantId) ile çağrılır", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    calculationService.calculateForOccurrence.mockResolvedValue({ id: "snap-1" });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);

    expect(accessor.loadCanonicalPayload).toHaveBeenCalledWith({ timelineEntryId: "tl-1" }, "tenant-1");
  });

  it("objectionPeriodDays canonical kaynaktan çözülüp calculateForOccurrence'a doğru command ile iletilir", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload({ serviceOccurrenceId: "occ-42" }));
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    calculationService.calculateForOccurrence.mockResolvedValue({ id: "snap-1" });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);

    expect(proceedingClassificationService.resolveProceedingClassification).toHaveBeenCalledWith("tenant-1", "case-1");
    expect(calculationService.calculateForOccurrence).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      serviceOccurrenceId: "occ-42",
      calculationVersion: CALCULATION_VERSION,
      objectionPeriodDays: 7, // GENERAL_EXECUTION kanonik kuralı
    });
  });

  it("duplicate delivery: handle() iki kez çağrılır, calculateForOccurrence iki kez AYNI command ile çağrılır (consumer kendi başına dedup yapmaz — calculator'ın kendi idempotency'sine güvenir)", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    calculationService.calculateForOccurrence.mockResolvedValue({ id: "snap-1" });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);
    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);

    expect(calculationService.calculateForOccurrence).toHaveBeenCalledTimes(2);
    expect(calculationService.calculateForOccurrence.mock.calls[0]).toEqual(calculationService.calculateForOccurrence.mock.calls[1]);
  });

  it("accessor'ın attığı hata (ör. tenant mismatch / event not found) değişmeden yukarı fırlatılır", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockRejectedValue(
      new ServiceOccurrenceRecordedEventNotFoundError("timeline entry header tenantId does not match requested tenant"),
    );
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(
      ServiceOccurrenceRecordedEventNotFoundError,
    );
    expect(proceedingClassificationService.resolveProceedingClassification).not.toHaveBeenCalled();
    expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
  });

  it("ProceedingClassificationService UNRESOLVED (proceedingType boş) dönerse ObjectionPeriodDaysUnresolvedError fail-closed", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue(null);
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(
      ObjectionPeriodDaysUnresolvedError,
    );
    expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
  });

  it("kanonik tabloda kural yoksa (PLEDGE — bilinçli-dışlanmış tür) ObjectionPeriodDaysUnresolvedError fail-closed", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.PLEDGE,
      subTypeCode: null,
    });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(
      ObjectionPeriodDaysUnresolvedError,
    );
    expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
  });

  it("kural bulunur ama objectionDays alanı null'sa (JUDGMENT_ENFORCEMENT:MONEY_OR_SECURITY) ObjectionPeriodDaysUnresolvedError fail-closed — asla varsayılan/tahmini sayıya düşülmez", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.MONEY_OR_SECURITY,
    });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(
      ObjectionPeriodDaysUnresolvedError,
    );
    expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
  });

  it("calculateForOccurrence'ın attığı hata (ör. OccurrenceNotFoundError) değişmeden yukarı fırlatılır", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    calculationService.calculateForOccurrence.mockRejectedValue(new OccurrenceNotFoundError());
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("calculateForOccurrence'ın attığı OccurrenceTenantMismatchError değişmeden yukarı fırlatılır", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
    proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    calculationService.calculateForOccurrence.mockRejectedValue(new OccurrenceTenantMismatchError());
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX)).rejects.toThrow(
      OccurrenceTenantMismatchError,
    );
  });

  it("context.tenantId eksikse hiçbir alt servise dokunmadan fail-closed", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", undefined)).rejects.toThrow();
    expect(accessor.loadCanonicalPayload).not.toHaveBeenCalled();
  });
});
