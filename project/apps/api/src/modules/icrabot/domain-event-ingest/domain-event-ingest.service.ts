/**
 * DomainEventIngestService — Phase 2 Sprint 1
 *
 * Central enforcement point for domain event append discipline.
 * HR-39: Event append within same transaction as domain mutation.
 * HR-44: Outbox append in same transaction.
 * HR-45: Domain mutation succeeds only if event append succeeds.
 *
 * This service does exactly 7 things:
 * 1. appendInTransaction(tx, event) — same-tx guarantee
 * 2. aggregate_version increment — monotonic + gap-free
 * 3. caused_by validation — 3 event types
 * 4. actor.type validation — human-required actions
 * 5. occurred_at_confidence validation — header field
 * 6. retroactive_override validation — effective_from guard
 * 7. Outbox row append — same tx
 *
 * NOT a generic enterprise event framework.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DomainEvent } from './domain-event-ingest.types';
import {
  CausedByRequiredError,
  HumanActorRequiredError,
  ConfidenceMissingError,
  EvidenceMissingError,
  RetroactiveOverrideRequiredError,
} from './domain-event-ingest.errors';

// ─── Constants ───────────────────────────────────────────────────────────────

/** HR-23: These event types MUST have caused_by */
const CAUSED_BY_REQUIRED_EVENTS = new Set([
  'PAYMENT_REVERSED',
  'CASE_RESUMED',
  'CASE_REOPENED',
]);

/** HR-26: These event types MUST have actor.type = HUMAN */
const HUMAN_REQUIRED_EVENTS = new Set([
  'CASE_CLOSED',
  'CASE_REOPENED',
  'CASE_SUSPENDED',
  'DEBTOR_IDENTITY_CORRECTED',
  'INTEREST_POLICY_ASSIGNED',
]);

@Injectable()
export class DomainEventIngestService {
  private readonly logger = new Logger(DomainEventIngestService.name);

  /**
   * Append a domain event within an existing Prisma transaction.
   *
   * GUARANTEES (HR-39, HR-44, HR-45):
   * - Event is written in the SAME transaction as domain mutation
   * - Outbox row is written in the SAME transaction
   * - If any step fails, entire transaction rolls back
   * - No half-state: mutation + event + outbox are atomic
   *
   * CALLER RESPONSIBILITY:
   * ```typescript
   * await prisma.$transaction(async (tx) => {
   *   await tx.case.update(...);  // domain mutation
   *   await domainEventIngest.appendInTransaction(tx, event);
   * });
   * ```
   */
  async appendInTransaction(
    tx: Prisma.TransactionClient,
    event: DomainEvent,
  ): Promise<{ aggregateVersion: bigint }> {
    // ── 1. Validate header (HR-34) ──────────────────────────────────────────
    this.validateConfidence(event);

    // ── 2. Validate caused_by (HR-23) ───────────────────────────────────────
    this.validateCausedBy(event);

    // ── 3. Validate actor (HR-26) ───────────────────────────────────────────
    this.validateActor(event);

    // ── 4. Validate retroactive (HR-33) ─────────────────────────────────────
    await this.validateRetroactive(tx, event);

    // ── 5. Compute next aggregate_version (HR-11) ───────────────────────────
    const nextVersion = await this.getNextAggregateVersion(
      tx,
      event.header.aggregateId,
    );

    // ── 6. Write timeline entry (event record) ──────────────────────────────
    // HR-29: recorded_at is server-side (createdAt @default(now()))
    await (tx as any).icrabotTimelineEntry.create({
      data: {
        caseId: event.header.aggregateId,
        // Writer A (spec-15 §1): canonical path — tenantId header'da hazır, doğrudan yaz.
        tenantId: event.header.tenantId,
        type: event.header.eventType,
        severity: 'info',
        title: event.header.eventType,
        body: {
          header: event.header,
          payload: event.payload,
        },
        source: event.header.actor.type === 'EXTERNAL' ? 'uyap' : 'engine',
        aggregateVersion: nextVersion,
      },
    });

    // ── 7. Write outbox row (HR-44: same tx) ────────────────────────────────
    // Only if event has external dispatch implications
    // For now: all events get an outbox entry for downstream consumers
    const idempotencyKey = `evt:${event.header.eventId}`;
    await (tx as any).icrabotOutboxAction.create({
      data: {
        caseId: event.header.aggregateId,
        actionType: `EVENT_PUBLISHED:${event.header.eventType}`,
        idempotencyKey,
        payload: {
          eventId: event.header.eventId,
          eventType: event.header.eventType,
          aggregateId: event.header.aggregateId,
          aggregateVersion: Number(nextVersion),
          occurredAt: event.header.occurredAt,
          tenantId: event.header.tenantId,
        },
      },
    });

    this.logger.debug(
      `Event appended: ${event.header.eventType} v${nextVersion} (case=${event.header.aggregateId})`,
    );

    return { aggregateVersion: nextVersion };
  }

  // ─── Private: Validation Methods ─────────────────────────────────────────

  /** HR-34: occurred_at_confidence mandatory + evidence for EXTERNAL_SIGNED */
  private validateConfidence(event: DomainEvent): void {
    const { occurredAtConfidence, occurredAtEvidence } = event.header;

    if (!occurredAtConfidence) {
      throw new ConfidenceMissingError();
    }

    if (
      occurredAtConfidence === 'EXTERNAL_SIGNED' &&
      !occurredAtEvidence
    ) {
      throw new EvidenceMissingError();
    }
  }

  /** HR-23: caused_by required for specific event types */
  private validateCausedBy(event: DomainEvent): void {
    const { eventType, causedBy } = event.header;

    if (CAUSED_BY_REQUIRED_EVENTS.has(eventType) && !causedBy) {
      throw new CausedByRequiredError(eventType);
    }
  }

  /** HR-26: Human actor required for legal-consequence actions */
  private validateActor(event: DomainEvent): void {
    const { eventType, actor } = event.header;

    if (HUMAN_REQUIRED_EVENTS.has(eventType) && actor.type !== 'HUMAN') {
      throw new HumanActorRequiredError(eventType);
    }
  }

  /**
   * HR-33: If effective_from precedes earliest event for this aggregate,
   * retroactiveOverride is mandatory.
   */
  private async validateRetroactive(
    tx: Prisma.TransactionClient,
    event: DomainEvent,
  ): Promise<void> {
    const effectiveFrom = event.header.effectiveFrom;
    if (!effectiveFrom) return; // defaults to occurredAt, no retroactive concern

    // Find earliest event for this aggregate
    const earliest = await (tx as any).icrabotTimelineEntry.findFirst({
      where: { caseId: event.header.aggregateId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    if (!earliest) return; // first event for this aggregate, no retroactive concern

    const earliestDate = earliest.createdAt.toISOString().split('T')[0];
    if (effectiveFrom < earliestDate && !event.header.retroactiveOverride) {
      throw new RetroactiveOverrideRequiredError(effectiveFrom, earliestDate);
    }
  }

  // ─── Private: Version Management ─────────────────────────────────────────

  /**
   * HR-11: Get next aggregate_version for a case.
   * Returns max(existing) + 1. For first event: returns 1.
   * DB trigger also enforces gap-free (belt + suspenders).
   *
   * CONCURRENCY HARDENING (per-aggregate advisory xact lock):
   *   max+1 tek başına kilitsizdir → aynı caseId'e eşzamanlı iki transaction aynı max'ı
   *   okuyup aynı vN+1'i yazmaya çalışır; @@unique([caseId, aggregateVersion]) + gap-free
   *   trigger bütünlüğü korur (dup/gap YOK) ama loser tx P2002/45011 fırlatır → TÜM domain
   *   mutation rollback olur, retry yoktur (availability bug).
   *   Çözüm: hesaplama öncesi pg_advisory_xact_lock(hashtextextended(caseId,0)). Aynı caseId'e
   *   eşzamanlı append'ler tx içinde serileşir (loser bekler → güncel max'ı okur → doğru
   *   versiyonu alır, hata yok); farklı caseId'ler kilitlenmez; lock tx commit/rollback'te
   *   otomatik bırakılır. Schema/migration gerekmez; UNIQUE + trigger korunur (belt+suspenders).
   *
   *   KAPSAM DIŞI: v28 TimelineService.addEntry dormant second-writer path
   *   (timeline.service.ts:84) aggregateVersion vermeden insert eder; bu strand'de
   *   düzeltilmez — bridge-removal/spec-15 strand'inde ele alınmalı.
   */
  private async getNextAggregateVersion(
    tx: Prisma.TransactionClient,
    caseId: string,
  ): Promise<bigint> {
    // Per-aggregate serialization: aynı caseId'e eşzamanlı append'leri bu tx süresince kilitle.
    // hashtextextended(text, seed) → bigint anahtar; tx sonunda otomatik release.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caseId}, 0))`;

    const result = await (tx as any).icrabotTimelineEntry.aggregate({
      where: { caseId },
      _max: { aggregateVersion: true },
    });

    const currentMax: bigint | null = result._max.aggregateVersion;
    return currentMax ? currentMax + BigInt(1) : BigInt(1);
  }
}
