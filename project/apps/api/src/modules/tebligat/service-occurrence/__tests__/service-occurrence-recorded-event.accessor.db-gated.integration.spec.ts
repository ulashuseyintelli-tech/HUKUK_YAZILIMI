/**
 * DEBTOR-OF01-HISTORY-P04-A2 — ServiceOccurrenceRecordedEventAccessor disposable-DB kanıtı.
 * Canonical SERVICE_OCCURRENCE_RECORDED event payload erişim sözleşmesi: outbox action'ın
 * timelineEntryId referansı üzerinden IcrabotTimelineEntry'den TEK canonical kopyayı okur.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { resolveTestDatabaseUrl } from "../../../../../test/test-db-env";
import { DomainEventIngestService } from "../../../icrabot/domain-event-ingest/domain-event-ingest.service";
import { AggregateVersionAllocator } from "../../../icrabot/domain-event-ingest/aggregate-version-allocator";
import { DomainEvent } from "../../../icrabot/domain-event-ingest/domain-event-ingest.types";
import { ActionHandlerService } from "../../../icrabot/v28-engine/action-handler.service";
import { OutboxService } from "../../../icrabot/v28-engine/outbox.service";
import { TimelineService } from "../../../icrabot/v28-engine/timeline.service";
import { FactStoreService } from "../../../icrabot/v28-engine/factstore.service";
import {
  ServiceOccurrenceRecordedEventAccessor,
  ServiceOccurrenceRecordedCanonicalPayload,
} from "../service-occurrence-recorded-event.accessor";
import { ServiceOccurrenceRecordedEventNotFoundError } from "../service-occurrence-recorded-event.errors";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "ServiceOccurrenceRecordedEventAccessor disposable-DB gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("ServiceOccurrenceRecordedEventAccessor — disposable DB", () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buildFixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-p04a2-${label}-${suffix}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: `P04-A2 Test ${label}`, slug: `test-p04a2-${label}-${suffix}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "P04-A2 Test Müvekkil", type: "INDIVIDUAL" },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `TEST-P04A2-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
        isAutoMode: false,
        workflowStage: "PAYMENT_ORDER" as any,
      },
    });

    return { tenantId, caseId: caseRow.id };
  }

  function buildIngest() {
    return new DomainEventIngestService(new AggregateVersionAllocator());
  }

  function serviceOccurrenceRecordedEvent(
    tenantId: string,
    caseId: string,
    overrides: Partial<{ serviceOccurrenceId: string; sourceTebligatId: string; occurrenceType: string; occurredOn: string; recordedAt: string }> = {},
  ): DomainEvent {
    return {
      header: {
        eventId: randomUUID(),
        aggregateType: "Case",
        aggregateId: caseId,
        eventType: "SERVICE_OCCURRENCE_RECORDED",
        occurredAt: new Date().toISOString(),
        occurredAtConfidence: "USER_DECLARED",
        actor: { type: "HUMAN", userId: "test-actor" },
        tenantId,
      },
      payload: {
        serviceOccurrenceId: overrides.serviceOccurrenceId ?? randomUUID(),
        sourceTebligatId: overrides.sourceTebligatId ?? randomUUID(),
        occurrenceType: overrides.occurrenceType ?? "POSTAL_DELIVERY_RESULT",
        occurredOn: overrides.occurredOn ?? new Date().toISOString(),
        recordedAt: overrides.recordedAt ?? new Date().toISOString(),
      },
    } as DomainEvent;
  }

  async function appendAndGetOutboxPayload(tenantId: string, caseId: string, event: DomainEvent) {
    const ingest = buildIngest();
    await prisma.$transaction(async (tx) => {
      await ingest.appendInTransaction(tx as any, event);
    });
    const outboxRow = await (prisma as any).icrabotOutboxAction.findFirstOrThrow({
      where: { caseId, actionType: `EVENT_PUBLISHED:${event.header.eventType}` },
      orderBy: { createdAt: "desc" },
    });
    return outboxRow.payload as Record<string, unknown>;
  }

  // TEST-01/02/03/04
  it("TEST-01/02/03/04: canonical payload eksiksiz erişilebilir — serviceOccurrenceId/tenantId/sourceTebligatId korunur", async () => {
    const fx = await buildFixture("full-access");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fx.tenantId, fx.caseId, event);

    const result: ServiceOccurrenceRecordedCanonicalPayload = await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);

    expect(result.eventId).toBe(event.header.eventId);
    expect(result.tenantId).toBe(fx.tenantId);
    expect(result.serviceOccurrenceId).toBe((event.payload as any).serviceOccurrenceId);
    expect(result.sourceTebligatId).toBe((event.payload as any).sourceTebligatId);
    expect(result.occurrenceType).toBe("POSTAL_DELIVERY_RESULT");
    expect(result.occurredOn).toBe((event.payload as any).occurredOn);
    expect(result.recordedAt).toBe((event.payload as any).recordedAt);
  });

  // TEST-05
  it("TEST-05: eventId replay boyunca sabit kalır (accessor idempotent read — birden fazla çağrı aynı sonucu verir)", async () => {
    const fx = await buildFixture("replay-stable");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fx.tenantId, fx.caseId, event);

    const first = await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);
    const second = await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);
    const third = await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);

    expect(first.eventId).toBe(event.header.eventId);
    expect(second.eventId).toBe(event.header.eventId);
    expect(third.eventId).toBe(event.header.eventId);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  // TEST-06
  it("TEST-06: mevcut collectionId özel davranışı regressionsız kalır (timelineEntryId eklenmesi collectionId'yi bozmaz)", async () => {
    const fx = await buildFixture("collection-regression");
    const ingest = buildIngest();
    const collectionEvent: DomainEvent = {
      header: {
        eventId: randomUUID(),
        aggregateType: "Case",
        aggregateId: fx.caseId,
        eventType: "PAYMENT_RECEIVED",
        occurredAt: new Date().toISOString(),
        occurredAtConfidence: "USER_DECLARED",
        actor: { type: "HUMAN", userId: "test-actor" },
        tenantId: fx.tenantId,
      },
      payload: { collectionId: "coll-test-123" },
    } as DomainEvent;

    await prisma.$transaction(async (tx) => {
      await ingest.appendInTransaction(tx as any, collectionEvent);
    });

    const outboxRow = await (prisma as any).icrabotOutboxAction.findFirstOrThrow({
      where: { caseId: fx.caseId, actionType: "EVENT_PUBLISHED:PAYMENT_RECEIVED" },
    });
    const payload = outboxRow.payload as Record<string, unknown>;

    // Mevcut (P04-A2 öncesi) davranış korunur:
    expect(payload).toHaveProperty("collectionId", "coll-test-123");
    expect(payload).toHaveProperty("eventId", collectionEvent.header.eventId);
    // Yeni, additive alan da mevcut — ikisi birlikte, çakışma yok:
    expect(payload).toHaveProperty("timelineEntryId");
    expect(typeof payload["timelineEntryId"]).toBe("string");
  });

  // TEST-07
  it("TEST-07: mevcut ActionHandlerService.dispatch akışı regressionsız çalışır (timelineEntryId içeren payload ile)", async () => {
    const fx = await buildFixture("handler-regression");
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fx.tenantId, fx.caseId, event);
    const outboxRow = await (prisma as any).icrabotOutboxAction.findFirstOrThrow({
      where: { caseId: fx.caseId, actionType: "EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED" },
    });

    const handlerService = new ActionHandlerService(
      prisma as any,
      new OutboxService(prisma as any),
      new TimelineService(prisma as any),
      new FactStoreService(prisma as any),
    );
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    let receivedPayload: Record<string, unknown> | undefined;
    let resolvedCanonicalPayload: ServiceOccurrenceRecordedCanonicalPayload | undefined;
    // Ham outbox payload'ında serviceOccurrenceId YOKTUR (P04-A2'nin çözdüğü tam da bu) — gerçek
    // bir gelecek handler, context.tenantId'yi kullanarak accessor üzerinden canonical payload'ı
    // çözer. Bu test o entegrasyonun uçtan uca çalıştığını kanıtlar.
    handlerService.register("EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED", async (payload, _caseId, context) => {
      receivedPayload = payload;
      resolvedCanonicalPayload = await accessor.loadCanonicalPayload(payload, context!.tenantId);
      return { serviceOccurrenceId: resolvedCanonicalPayload.serviceOccurrenceId };
    });

    const result = await handlerService.dispatch(outboxRow.id, { kind: 'platform' } as const);

    expect(result.success).toBe(true);
    expect(receivedPayload).toBeDefined();
    expect(receivedPayload).toHaveProperty("timelineEntryId"); // yeni alan handler'a ulaşır, kırmaz
    expect(outboxPayload["timelineEntryId"]).toBe(receivedPayload!["timelineEntryId"]);
    expect(resolvedCanonicalPayload).toBeDefined();
    expect(resolvedCanonicalPayload!.serviceOccurrenceId).toBe((event.payload as any).serviceOccurrenceId);
    expect(result.result).toEqual({ serviceOccurrenceId: (event.payload as any).serviceOccurrenceId });
  });

  // TEST-08
  it("TEST-08: cross-tenant event reference reddedilir", async () => {
    const fxA = await buildFixture("tenant-a");
    const fxB = await buildFixture("tenant-b");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const event = serviceOccurrenceRecordedEvent(fxA.tenantId, fxA.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fxA.tenantId, fxA.caseId, event);

    await expect(accessor.loadCanonicalPayload(outboxPayload, fxB.tenantId)).rejects.toThrow(
      ServiceOccurrenceRecordedEventNotFoundError,
    );
  });

  // TEST-09
  it("TEST-09: canonical event bulunamazsa (eksik/yanlış timelineEntryId) fail-closed typed error oluşur", async () => {
    const fx = await buildFixture("not-found");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);

    await expect(accessor.loadCanonicalPayload({}, fx.tenantId)).rejects.toThrow(
      ServiceOccurrenceRecordedEventNotFoundError,
    );
    await expect(accessor.loadCanonicalPayload(null, fx.tenantId)).rejects.toThrow(
      ServiceOccurrenceRecordedEventNotFoundError,
    );
    await expect(
      accessor.loadCanonicalPayload({ timelineEntryId: "nonexistent-cuid" }, fx.tenantId),
    ).rejects.toThrow(ServiceOccurrenceRecordedEventNotFoundError);
  });

  // TEST-10
  it("TEST-10: dönen payload PII-free sözleşmeye uyar (yalnız 7 beklenen alan, başka hiçbir şey yok)", async () => {
    const fx = await buildFixture("pii-free-shape");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fx.tenantId, fx.caseId, event);

    const result = await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);

    expect(Object.keys(result).sort()).toEqual(
      ["eventId", "occurredOn", "occurrenceType", "recordedAt", "serviceOccurrenceId", "sourceTebligatId", "tenantId"].sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sourceNote");
    expect(serialized).not.toContain("addressText");
    expect(serialized).not.toContain("TCKN");
  });

  // TEST-11
  it("TEST-11: canonical payload erişimi deadline consumer veya snapshot üretimi tetiklemez", async () => {
    const fx = await buildFixture("no-side-effects");
    const accessor = new ServiceOccurrenceRecordedEventAccessor(prisma as any);
    const event = serviceOccurrenceRecordedEvent(fx.tenantId, fx.caseId);
    const outboxPayload = await appendAndGetOutboxPayload(fx.tenantId, fx.caseId, event);

    const snapshotsBefore = await prisma.legalDeadlineSnapshot.count();

    await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);
    await accessor.loadCanonicalPayload(outboxPayload, fx.tenantId);

    const snapshotsAfter = await prisma.legalDeadlineSnapshot.count();
    expect(snapshotsAfter).toBe(snapshotsBefore);
  });
});
