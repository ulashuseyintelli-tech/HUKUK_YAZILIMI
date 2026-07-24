/**
 * DEBTOR-OF01-HISTORY-P04-C-I01 — producer(recordPttResult şeklinde event)→outbox→
 * ServiceOccurrenceRecordedRegistrar/ConsumerService→LegalDeadlineSnapshot uçtan uca disposable-DB
 * kanıtı. Unit testler (service-occurrence-recorded.consumer.spec.ts) tüm alt servisleri mock'lar;
 * bu dosya GERÇEK ActionHandlerService.dispatch + GERÇEK accessor/ProceedingClassificationService/
 * ServiceOccurrenceDeadlineCalculationService ile gerçek Postgres üzerinde çalışır. Fixture-building
 * convention service-occurrence-deadline-calculation.db-gated.integration.spec.ts'ten izlenir.
 */
import { PrismaClient, ProceedingType, ServiceOccurrenceServiceDateRole } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../../test/test-db-env";
import { DomainEventIngestService } from "../../../icrabot/domain-event-ingest/domain-event-ingest.service";
import { AggregateVersionAllocator } from "../../../icrabot/domain-event-ingest/aggregate-version-allocator";
import { DomainEvent } from "../../../icrabot/domain-event-ingest/domain-event-ingest.types";
import { ActionHandlerService } from "../../../icrabot/v28-engine/action-handler.service";
import { OutboxService } from "../../../icrabot/v28-engine/outbox.service";
import { TimelineService } from "../../../icrabot/v28-engine/timeline.service";
import { FactStoreService } from "../../../icrabot/v28-engine/factstore.service";
import { ServiceOccurrenceRecordedEventAccessor } from "../service-occurrence-recorded-event.accessor";
import { ServiceOccurrenceRecordedConsumerService } from "../service-occurrence-recorded.consumer";
import { ServiceOccurrenceRecordedRegistrar } from "../service-occurrence-recorded.registrar";
import { NonRetryableOutboxError } from "../../../icrabot/v28-engine/non-retryable-outbox.error";
import { ProceedingClassificationService } from "../../../legal-deadline/proceeding-classification.service";
import {
  ServiceOccurrenceDeadlineCalculationService,
  CALCULATION_VERSION,
} from "../../../legal-deadline/service-occurrence-deadline-calculation.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrenceRecordedConsumerService disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrenceRecordedConsumerService — disposable DB (producer→outbox→consumer)", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string, proceedingType: ProceedingType | null) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-sorc-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `SORC Test ${label}`, slug: `test-sorc-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "SORC Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-SORC-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: "PAYMENT_ORDER" as any,
        proceedingType: proceedingType ?? undefined,
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

  async function createOccurrence(fx: { tenantId: string; caseId: string; caseDebtorId: string; tebligatId: string }) {
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
        serviceRegimeCode: "IMMEDIATE_SERVICE",
        recordedBySystem: "TEST_HARNESS",
        status: "ACTIVE",
      },
    });
  }

  function buildIngest() {
    return new DomainEventIngestService(new AggregateVersionAllocator());
  }

  function serviceOccurrenceRecordedEvent(
    tenantId: string,
    caseId: string,
    occurrence: { id: string; sourceTebligatId: string; occurrenceType: string; occurredOn: Date; recordedAt: Date },
  ): DomainEvent {
    return {
      header: {
        eventId: randomUUID(),
        aggregateType: "Case",
        aggregateId: caseId,
        eventType: "SERVICE_OCCURRENCE_RECORDED",
        occurredAt: occurrence.occurredOn.toISOString(),
        occurredAtConfidence: "USER_DECLARED",
        actor: { type: "HUMAN", userId: "test-actor" },
        tenantId,
      },
      payload: {
        serviceOccurrenceId: occurrence.id,
        sourceTebligatId: occurrence.sourceTebligatId,
        occurrenceType: occurrence.occurrenceType,
        occurredOn: occurrence.occurredOn.toISOString(),
        recordedAt: occurrence.recordedAt.toISOString(),
      },
    } as DomainEvent;
  }

  async function appendAndGetOutboxRow(tenantId: string, caseId: string, event: DomainEvent) {
    const ingest = buildIngest();
    await prisma.$transaction(async (tx) => {
      await ingest.appendInTransaction(tx as any, event);
    });
    return (prisma as any).icrabotOutboxAction.findFirstOrThrow({
      where: { caseId, tenantId, actionType: `EVENT_PUBLISHED:${event.header.eventType}` },
      orderBy: { createdAt: "desc" },
    });
  }

  function buildRealConsumer() {
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const proceedingClassificationService = new ProceedingClassificationService(prisma as any);
    const calculationService = new ServiceOccurrenceDeadlineCalculationService(prisma as any);
    return new ServiceOccurrenceRecordedConsumerService(accessor, proceedingClassificationService, calculationService);
  }

  function buildRealActionHandler() {
    return new ActionHandlerService(
      prisma as any,
      new OutboxService(prisma as any),
      new TimelineService(prisma as any),
      new FactStoreService(prisma as any),
    );
  }

  it("uçtan uca: producer event → outbox → GERÇEK registrar/consumer → doğru ACTIVE LegalDeadlineSnapshot", async () => {
    const fx = await buildFixture("happy", ProceedingType.GENERAL_EXECUTION);
    const occurrence = await createOccurrence(fx);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId, {
      id: occurrence.id,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT",
      occurredOn: occurrence.occurredOn,
      recordedAt: occurrence.recordedAt,
    });
    const outboxRow = await appendAndGetOutboxRow(fx.tenantId, fx.caseId, event);

    const consumerService = buildRealConsumer();
    const handlerService = buildRealActionHandler();
    new ServiceOccurrenceRecordedRegistrar(handlerService, consumerService).onModuleInit();

    const result = await handlerService.dispatch(outboxRow.id);

    expect(result.success).toBe(true);
    const snapshot = await prisma.legalDeadlineSnapshot.findFirst({
      where: { tenantId: fx.tenantId, sourceServiceOccurrenceId: occurrence.id, status: "ACTIVE" },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.calculationVersion).toBe(CALCULATION_VERSION);
    expect(snapshot!.calculationRule).toBe("IMMEDIATE_SERVICE_NO_DELAY");
    expect(snapshot!.deadlineReasonCode).toBe("DIRECT_DELIVERY");
    expect(snapshot!.legalServiceDate.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(snapshot!.dueDate.toISOString().slice(0, 10)).toBe("2026-01-17"); // GENERAL_EXECUTION objectionDays=7
    expect(snapshot!.sourceTebligatId).toBe(fx.tebligatId);
    expect(snapshot!.caseId).toBe(fx.caseId);
  });

  it("duplicate delivery: aynı canonical event iki kez consumer.handle() ile işlenir — TEK ACTIVE snapshot kalır (calculator idempotency)", async () => {
    const fx = await buildFixture("dup", ProceedingType.GENERAL_EXECUTION);
    const occurrence = await createOccurrence(fx);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId, {
      id: occurrence.id,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT",
      occurredOn: occurrence.occurredOn,
      recordedAt: occurrence.recordedAt,
    });
    const outboxRow = await appendAndGetOutboxRow(fx.tenantId, fx.caseId, event);
    const outboxPayload = outboxRow.payload as Record<string, unknown>;
    const consumerService = buildRealConsumer();
    const ctx = { actionId: outboxRow.id, tenantId: fx.tenantId, actionType: outboxRow.actionType };

    await consumerService.handle(outboxPayload, fx.caseId, ctx);
    await consumerService.handle(outboxPayload, fx.caseId, ctx);

    const activeSnapshots = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceServiceOccurrenceId: occurrence.id, status: "ACTIVE" },
    });
    expect(activeSnapshots).toHaveLength(1);
    const allSnapshots = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceServiceOccurrenceId: occurrence.id },
    });
    expect(allSnapshots).toHaveLength(1); // supersede zinciri de oluşmadı — gerçek no-op
  });

  it("Case.proceedingType boş (sınıflandırılmamış dosya) — NonRetryableOutboxError fail-closed, hiçbir LegalDeadlineSnapshot yazılmaz", async () => {
    const fx = await buildFixture("unresolved", null);
    const occurrence = await createOccurrence(fx);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId, {
      id: occurrence.id,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT",
      occurredOn: occurrence.occurredOn,
      recordedAt: occurrence.recordedAt,
    });
    const outboxRow = await appendAndGetOutboxRow(fx.tenantId, fx.caseId, event);
    const outboxPayload = outboxRow.payload as Record<string, unknown>;
    const consumerService = buildRealConsumer();
    const ctx = { actionId: outboxRow.id, tenantId: fx.tenantId, actionType: outboxRow.actionType };

    await expect(consumerService.handle(outboxPayload, fx.caseId, ctx)).rejects.toThrow(
      NonRetryableOutboxError,
    );

    const snapshots = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceServiceOccurrenceId: occurrence.id },
    });
    expect(snapshots).toHaveLength(0);
  });

  it("DEBTOR-OF01-HISTORY-P04-C-I02: Case.proceedingType boş + GERÇEK ActionHandlerService.dispatch → outbox action GERÇEK Postgres'te ilk denemede status=dead (attemptCount=1, güvenli lastError)", async () => {
    const fx = await buildFixture("nonretryable-dispatch", null);
    const occurrence = await createOccurrence(fx);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId, {
      id: occurrence.id,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT",
      occurredOn: occurrence.occurredOn,
      recordedAt: occurrence.recordedAt,
    });
    const outboxRow = await appendAndGetOutboxRow(fx.tenantId, fx.caseId, event);

    const consumerService = buildRealConsumer();
    const handlerService = buildRealActionHandler();
    new ServiceOccurrenceRecordedRegistrar(handlerService, consumerService).onModuleInit();

    const result = await handlerService.dispatch(outboxRow.id);

    expect(result.success).toBe(false);
    expect(result.deadLettered).toBe(true);
    const dispatchedRow = await (prisma as any).icrabotOutboxAction.findUniqueOrThrow({ where: { id: outboxRow.id } });
    expect(dispatchedRow.status).toBe("dead");
    expect(dispatchedRow.attemptCount).toBe(1); // ilk ve tek deneme — max-attempt (8) beklenmedi
    expect(dispatchedRow.nextRetryAt).toBeNull();
    expect(dispatchedRow.lastError.reasonCode).toBe("OBJECTION_PERIOD_DAYS_UNRESOLVED");
    expect(dispatchedRow.lastError.securityRelevant).toBe(false);
    expect(JSON.stringify(dispatchedRow.lastError)).not.toMatch(/prisma|postgres|stack/i);

    const snapshots = await prisma.legalDeadlineSnapshot.findMany({
      where: { tenantId: fx.tenantId, sourceServiceOccurrenceId: occurrence.id },
    });
    expect(snapshots).toHaveLength(0);
  });

  it("gerçek ActionHandlerService.dispatch akışı: no-handler poison'a düşmez, SERVICE_OCCURRENCE_RECORDED tüketilir", async () => {
    const fx = await buildFixture("dispatch-consumed", ProceedingType.GENERAL_EXECUTION);
    const occurrence = await createOccurrence(fx);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId, {
      id: occurrence.id,
      sourceTebligatId: fx.tebligatId,
      occurrenceType: "POSTAL_DELIVERY_RESULT",
      occurredOn: occurrence.occurredOn,
      recordedAt: occurrence.recordedAt,
    });
    const outboxRow = await appendAndGetOutboxRow(fx.tenantId, fx.caseId, event);

    const consumerService = buildRealConsumer();
    const handlerService = buildRealActionHandler();
    new ServiceOccurrenceRecordedRegistrar(handlerService, consumerService).onModuleInit();
    const result = await handlerService.dispatch(outboxRow.id);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    const dispatchedRow = await (prisma as any).icrabotOutboxAction.findUniqueOrThrow({ where: { id: outboxRow.id } });
    expect(dispatchedRow.status).not.toBe("pending");
  });
});
