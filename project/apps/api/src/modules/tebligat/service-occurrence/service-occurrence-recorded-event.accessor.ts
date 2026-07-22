/**
 * DEBTOR-OF01-HISTORY-P04-A2 — canonical event payload access for the SERVICE_OCCURRENCE_RECORDED
 * outbox action (`EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED`).
 *
 * SOURCE OF TRUTH: the SAME-transaction IcrabotTimelineEntry row that
 * DomainEventIngestService.appendInTransaction() writes alongside the outbox row. The outbox
 * row's own payload carries only a stable `timelineEntryId` reference (Option A, P04-CONTRACT-01
 * §5) — it never holds an independent second copy of domain-specific fields. This accessor is
 * the ONLY place that resolves that reference into the actual canonical payload.
 *
 * Deliberately NOT registered with ActionHandlerService and does NOT read/write LegalDeadlineSnapshot
 * or ServiceOccurrence — a future deadline-consumer task calls this accessor, this task does not
 * build that consumer (owner brief §10).
 */
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ServiceOccurrenceRecordedEventNotFoundError } from "./service-occurrence-recorded-event.errors";

/**
 * Minimal, PII-free canonical payload for a SERVICE_OCCURRENCE_RECORDED event — exactly the
 * fields a deadline consumer needs (owner brief §6). No sourceNote, no raw payload, no debtor
 * identity/address/contact fields, no legal conclusion (tk21Type/legalServiceDate/dueDate).
 */
export interface ServiceOccurrenceRecordedCanonicalPayload {
  eventId: string;
  tenantId: string;
  serviceOccurrenceId: string;
  sourceTebligatId: string;
  occurrenceType: string;
  occurredOn: string;
  recordedAt: string;
}

const EVENT_TYPE = "SERVICE_OCCURRENCE_RECORDED";

@Injectable()
export class ServiceOccurrenceRecordedEventAccessor {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves an `EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED` outbox action's payload into the
   * canonical event payload. `tenantId` MUST be the caller's own fail-closed resolved tenant
   * (e.g. ActionHandlerContext.tenantId) — never the outbox row's own tenantId re-read back to
   * itself, or a cross-tenant reference silently succeeds.
   *
   * Fails closed (ServiceOccurrenceRecordedEventNotFoundError) if: the reference is missing from
   * the outbox payload, the referenced timeline entry doesn't exist, belongs to a different
   * tenant, isn't a SERVICE_OCCURRENCE_RECORDED entry, or its body is missing any of the 7
   * required fields. Never falls back to deriving occurrence identity from mutable Tebligat state,
   * never string-parses a log/note for serviceOccurrenceId.
   */
  async loadCanonicalPayload(
    outboxPayload: Record<string, unknown> | null | undefined,
    tenantId: string,
  ): Promise<ServiceOccurrenceRecordedCanonicalPayload> {
    const timelineEntryId = outboxPayload?.["timelineEntryId"];
    if (typeof timelineEntryId !== "string" || !timelineEntryId) {
      throw new ServiceOccurrenceRecordedEventNotFoundError(
        "outbox payload has no timelineEntryId reference",
      );
    }

    const entry = await (this.prisma as any).icrabotTimelineEntry.findFirst({
      where: { id: timelineEntryId, tenantId },
    });
    if (!entry) {
      throw new ServiceOccurrenceRecordedEventNotFoundError(
        "referenced timeline entry not found for this tenant",
      );
    }
    if (entry.type !== EVENT_TYPE) {
      throw new ServiceOccurrenceRecordedEventNotFoundError(
        `referenced timeline entry is type=${entry.type}, expected ${EVENT_TYPE}`,
      );
    }

    const body = entry.body as { header?: Record<string, unknown>; payload?: Record<string, unknown> } | null;
    const header = body?.header;
    const payload = body?.payload;

    const eventId = header?.["eventId"];
    const headerTenantId = header?.["tenantId"];
    const serviceOccurrenceId = payload?.["serviceOccurrenceId"];
    const sourceTebligatId = payload?.["sourceTebligatId"];
    const occurrenceType = payload?.["occurrenceType"];
    const occurredOn = payload?.["occurredOn"];
    const recordedAt = payload?.["recordedAt"];

    if (
      typeof eventId !== "string" ||
      typeof headerTenantId !== "string" ||
      typeof serviceOccurrenceId !== "string" ||
      typeof sourceTebligatId !== "string" ||
      typeof occurrenceType !== "string" ||
      typeof occurredOn !== "string" ||
      typeof recordedAt !== "string"
    ) {
      throw new ServiceOccurrenceRecordedEventNotFoundError(
        "canonical event body is missing one or more required fields",
      );
    }
    // Belt+suspenders (P01 composite-FK emsali): DB-level tenant filter zaten cross-tenant'ı
    // reddeder — header'ın kendi tenantId'si de eşleşmezse (bozuk/uyumsuz kayıt) fail-closed ol.
    if (headerTenantId !== tenantId) {
      throw new ServiceOccurrenceRecordedEventNotFoundError(
        "timeline entry header tenantId does not match requested tenant",
      );
    }

    return {
      eventId,
      tenantId: headerTenantId,
      serviceOccurrenceId,
      sourceTebligatId,
      occurrenceType,
      occurredOn,
      recordedAt,
    };
  }
}
