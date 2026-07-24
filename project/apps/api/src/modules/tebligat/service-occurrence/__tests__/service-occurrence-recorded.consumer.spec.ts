/**
 * DEBTOR-OF01-HISTORY-P04-C-I01/I02 — ServiceOccurrenceRecordedConsumerService unit testleri.
 * Prisma'ya dokunmaz; accessor/ProceedingClassificationService/ServiceOccurrenceDeadlineCalculationService
 * hafif jest.fn() sahteleriyle mock'lanır. Gerçek DB zinciri
 * service-occurrence-recorded-consumer.db-gated.integration.spec.ts'tedir.
 *
 * P04-C-I02: 5 kalıcı domain hatasının (ObjectionPeriodDaysUnresolvedError,
 * DeadlineInputIncompleteError, OccurrenceSupersededError, OccurrenceTenantMismatchError,
 * SnapshotIdempotencyConflictError) NonRetryableOutboxError'a SARILDIĞI; bu 5 tür DIŞINDAKİ HER
 * ŞEYİN (OccurrenceNotFoundError, bilinmeyen/beklenmeyen hatalar) DEĞİŞMEDEN propagate edildiği
 * doğrulanır.
 */
import { ProceedingType, JudgmentExecutionType } from "@prisma/client";
import { ServiceOccurrenceRecordedConsumerService } from "../service-occurrence-recorded.consumer";
import { ObjectionPeriodDaysUnresolvedError } from "../service-occurrence-recorded-consumer.errors";
import { ServiceOccurrenceRecordedEventNotFoundError } from "../service-occurrence-recorded-event.errors";
import { NonRetryableOutboxError } from "../../../icrabot/v28-engine/non-retryable-outbox.error";
import {
  OccurrenceNotFoundError,
  OccurrenceTenantMismatchError,
  OccurrenceSupersededError,
  DeadlineInputIncompleteError,
  SnapshotIdempotencyConflictError,
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

function buildHappyDeps(overrides: Record<string, unknown> = {}) {
  const { accessor, proceedingClassificationService, calculationService } = buildDeps();
  accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload(overrides));
  proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
    proceedingType: ProceedingType.GENERAL_EXECUTION,
    subTypeCode: null,
  });
  return { accessor, proceedingClassificationService, calculationService };
}

const CTX = { actionId: "a1", tenantId: "tenant-1", actionType: "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED" };

describe("ServiceOccurrenceRecordedConsumerService", () => {
  it("payload accessor.loadCanonicalPayload(payload, context.tenantId) ile çağrılır", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
    calculationService.calculateForOccurrence.mockResolvedValue({ id: "snap-1" });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);

    expect(accessor.loadCanonicalPayload).toHaveBeenCalledWith({ timelineEntryId: "tl-1" }, "tenant-1");
  });

  it("objectionPeriodDays canonical kaynaktan çözülüp calculateForOccurrence'a doğru command ile iletilir", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps({ serviceOccurrenceId: "occ-42" });
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
    const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
    calculationService.calculateForOccurrence.mockResolvedValue({ id: "snap-1" });
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);
    await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX);

    expect(calculationService.calculateForOccurrence).toHaveBeenCalledTimes(2);
    expect(calculationService.calculateForOccurrence.mock.calls[0]).toEqual(calculationService.calculateForOccurrence.mock.calls[1]);
  });

  it("accessor'ın attığı hata (ör. tenant mismatch / event not found) değişmeden yukarı fırlatılır — NonRetryableOutboxError'a SARILMAZ (P04-C-I02 kapsamı yalnız calculation-katmanı hatalarıdır)", async () => {
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

  describe("P04-C-I02: 5 kalıcı hata NonRetryableOutboxError'a sarılır", () => {
    it("ProceedingClassificationService UNRESOLVED (proceedingType boş) → NonRetryableOutboxError (cause=ObjectionPeriodDaysUnresolvedError)", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildDeps();
      accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
      proceedingClassificationService.resolveProceedingClassification.mockResolvedValue(null);
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(ObjectionPeriodDaysUnresolvedError);
      expect(error.reasonCode).toBe("OBJECTION_PERIOD_DAYS_UNRESOLVED");
      expect(error.securityRelevant).toBe(false);
      expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
    });

    it("kanonik tabloda kural yoksa (PLEDGE — bilinçli-dışlanmış tür) → NonRetryableOutboxError (cause=ObjectionPeriodDaysUnresolvedError)", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildDeps();
      accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
      proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
        proceedingType: ProceedingType.PLEDGE,
        subTypeCode: null,
      });
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(ObjectionPeriodDaysUnresolvedError);
      expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
    });

    it("kural bulunur ama objectionDays alanı null'sa (JUDGMENT_ENFORCEMENT:MONEY_OR_SECURITY) → NonRetryableOutboxError (cause=ObjectionPeriodDaysUnresolvedError) — asla varsayılan/tahmini sayıya düşülmez", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildDeps();
      accessor.loadCanonicalPayload.mockResolvedValue(buildCanonicalPayload());
      proceedingClassificationService.resolveProceedingClassification.mockResolvedValue({
        proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
        subTypeCode: JudgmentExecutionType.MONEY_OR_SECURITY,
      });
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(ObjectionPeriodDaysUnresolvedError);
      expect(calculationService.calculateForOccurrence).not.toHaveBeenCalled();
    });

    it("calculateForOccurrence DeadlineInputIncompleteError atarsa (eksik/uyumsuz legal facts — incompatible completion mode dahil) → NonRetryableOutboxError", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      calculationService.calculateForOccurrence.mockRejectedValue(
        new DeadlineInputIncompleteError("IMMEDIATE_SERVICE does not accept serviceCompletionMode=NOTICE_POSTED"),
      );
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(DeadlineInputIncompleteError);
      expect(error.reasonCode).toBe("DEADLINE_INPUT_INCOMPLETE");
      expect(error.securityRelevant).toBe(false);
    });

    it("calculateForOccurrence OccurrenceSupersededError atarsa → NonRetryableOutboxError", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      calculationService.calculateForOccurrence.mockRejectedValue(new OccurrenceSupersededError());
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(OccurrenceSupersededError);
      expect(error.reasonCode).toBe("OCCURRENCE_SUPERSEDED");
      expect(error.securityRelevant).toBe(false);
    });

    it("calculateForOccurrence OccurrenceTenantMismatchError atarsa → NonRetryableOutboxError VE securityRelevant=true", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      calculationService.calculateForOccurrence.mockRejectedValue(new OccurrenceTenantMismatchError());
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(OccurrenceTenantMismatchError);
      expect(error.reasonCode).toBe("OCCURRENCE_TENANT_MISMATCH");
      expect(error.securityRelevant).toBe(true);
    });

    it("calculateForOccurrence SnapshotIdempotencyConflictError atarsa → NonRetryableOutboxError", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      calculationService.calculateForOccurrence.mockRejectedValue(new SnapshotIdempotencyConflictError());
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error: NonRetryableOutboxError = await consumer
        .handle({ timelineEntryId: "tl-1" }, "case-1", CTX)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableOutboxError);
      expect(error.cause).toBeInstanceOf(SnapshotIdempotencyConflictError);
      expect(error.reasonCode).toBe("SNAPSHOT_IDEMPOTENCY_CONFLICT");
      expect(error.securityRelevant).toBe(false);
    });
  });

  describe("P04-C-I02: 5 tür DIŞINDAKİ hatalar NonRetryableOutboxError'a SARILMAZ (bilinmeyen hata non-retryable sayılmaz)", () => {
    it("calculateForOccurrence OccurrenceNotFoundError atarsa değişmeden yukarı fırlatılır (brief'in non-retryable listesinde YOK)", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      calculationService.calculateForOccurrence.mockRejectedValue(new OccurrenceNotFoundError());
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error = await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX).catch((e) => e);

      expect(error).toBeInstanceOf(OccurrenceNotFoundError);
      expect(error).not.toBeInstanceOf(NonRetryableOutboxError);
    });

    it("calculateForOccurrence beklenmeyen/bilinmeyen bir Error atarsa (ör. transient Prisma/infrastructure hatası) değişmeden yukarı fırlatılır — marker'a ÇEVRİLMEZ", async () => {
      const { accessor, proceedingClassificationService, calculationService } = buildHappyDeps();
      const infraError = new Error("connection reset by peer");
      calculationService.calculateForOccurrence.mockRejectedValue(infraError);
      const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

      const error = await consumer.handle({ timelineEntryId: "tl-1" }, "case-1", CTX).catch((e) => e);

      expect(error).toBe(infraError);
      expect(error).not.toBeInstanceOf(NonRetryableOutboxError);
    });
  });

  it("context.tenantId eksikse hiçbir alt servise dokunmadan fail-closed", async () => {
    const { accessor, proceedingClassificationService, calculationService } = buildDeps();
    const consumer = new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);

    await expect(consumer.handle({ timelineEntryId: "tl-1" }, "case-1", undefined)).rejects.toThrow();
    expect(accessor.loadCanonicalPayload).not.toHaveBeenCalled();
  });
});
