import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { DomainEventIngestService } from "../icrabot/domain-event-ingest";
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  createCanonicalSourceHash,
  type CollectionJournalSource,
  type ValidatedJournalEntryDraft,
  validateJournalDraft,
} from "../accounting-journal";
import { CancelCollectionDto, CollectionStatus } from "./dto/collection.dto";
import { AuditService } from "../audit/audit.service";
import {
  COLLECTION_AUDIT_ACTION,
  createCollectionMutationTrace,
  logCollectionMutationInTransaction,
  type CollectionMutationTrace,
} from "./collection-audit";

export const COLLECTION_VOID_ACTION_CODE = "COLLECTION_VOID";
export const COLLECTION_VOID_TARGET_TYPE = "COLLECTION";

export interface CollectionVoidSavedIntent {
  caseId: string;
  collectionId: string;
  cancelReason: string;
  correlationId?: string;
}

export interface CollectionCancelExecutorDeps {
  domainEventIngestService: DomainEventIngestService;
  journalWriter: AccountingJournalWriterService;
  auditService?: AuditService;
}

export interface ExecuteCollectionCancelInput {
  tenantId: string;
  id: string;
  dto: CancelCollectionDto;
  actorUserId: string;
  expectedCaseId?: string;
  trace?: CollectionMutationTrace;
  approvalRequestId?: string;
}

const PAYMENT_REVERSED_EVENT_NAMESPACE = "PAYMENT_REVERSED:v1";
const PAYMENT_RECEIVED_EVENT_NOT_FOUND = "PAYMENT_RECEIVED_EVENT_NOT_FOUND";
const PAYMENT_RECEIVED_EVENT_NOT_FOUND_MESSAGE =
  "Original PAYMENT_RECEIVED event not found for collection reversal.";

export function buildCollectionVoidIntent(input: {
  caseId: string;
  collectionId: string;
  cancelReason: string;
  correlationId?: string;
}): CollectionVoidSavedIntent {
  return {
    caseId: input.caseId,
    collectionId: input.collectionId,
    cancelReason: input.cancelReason,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  };
}

export async function executeCollectionCancelInTransaction(
  tx: Prisma.TransactionClient,
  deps: CollectionCancelExecutorDeps,
  input: ExecuteCollectionCancelInput,
) {
  const { tenantId, id, dto, actorUserId, expectedCaseId } = input;
  const trace = input.trace ?? createCollectionMutationTrace(undefined, input.approvalRequestId);
  const collection = await (tx.collection as any).findFirst({
    where: { id, tenantId, ...(expectedCaseId ? { caseId: expectedCaseId } : {}) },
  });

  if (!collection) {
    throw new NotFoundException("Tahsilat bulunamadı");
  }

  if (collection.status === CollectionStatus.CANCELLED) {
    throw new BadRequestException("Tahsilat zaten iptal edilmiş");
  }
  if (collection.status !== CollectionStatus.CONFIRMED) {
    throw new BadRequestException("Tahsilat iptal onayı yalnız confirmed/posted tahsilatlar için kullanılabilir");
  }

  const originalPaymentEvent = await (tx.icrabotTimelineEntry as any).findFirst({
    where: {
      tenantId,
      caseId: collection.caseId,
      type: "PAYMENT_RECEIVED",
      body: {
        path: ["payload", "collectionId"],
        equals: collection.id,
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const originalPaymentEventId = getTimelineEventId(originalPaymentEvent);
  if (!originalPaymentEventId) {
    throw paymentReceivedEventNotFound();
  }

  const originalRecordedJournal = await (tx.accountingJournalEntry as any).findFirst({
    where: {
      tenantId,
      sourceType: "COLLECTION",
      sourceId: collection.id,
      sourceAction: "recorded",
      entryType: "COLLECTION_CASH_RECEIPT_RECORDED",
    },
    select: { id: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
  const originalRecordedSourceVersion = readJournalSourceVersion(originalRecordedJournal?.metadata);
  if (!originalRecordedJournal || !originalRecordedSourceVersion) {
    throw new ConflictException({
      errorCode: "COLLECTION_CASH_RECEIPT_RECORDED_JOURNAL_MISSING",
      message: "Collection cancel requires original recorded accounting journal evidence.",
      collectionId: collection.id,
    });
  }

  const originalLedger = await (tx.ledgerEntry as any).findFirst({
    where: {
      tenantId,
      caseId: collection.caseId,
      collectionId: collection.id,
      entryType: "PAYMENT",
      status: "CONFIRMED",
    },
    include: {
      allocations: true,
      reversedByLedgerEntry: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const cancelledAt = new Date();
  const cancelledCollection = await (tx.collection as any).update({
    where: { id },
    data: {
      status: CollectionStatus.CANCELLED,
      cancelledAt,
      cancelReason: dto.cancelReason,
    },
  });

  const reversalLedgerEntryIds: string[] = [];
  let reversalAllocationCount = 0;
  if (originalLedger && !originalLedger.reversedByLedgerEntry) {
    const reversalLedger = await (tx.ledgerEntry as any).create({
      data: {
        tenantId,
        caseId: collection.caseId,
        collectionId: collection.id,
        reversesLedgerEntryId: originalLedger.id,
        entryType: "REVERSAL",
        amount: -Number(originalLedger.amount),
        currency: originalLedger.currency,
        entryDate: new Date(),
        effectiveDate: originalLedger.effectiveDate,
        description: `Collection cancellation reversal for ${collection.id}`,
        referenceNo: originalLedger.referenceNo,
        sourceType: "COLLECTION_CANCEL",
        sourceId: collection.id,
        status: "CONFIRMED",
        metadata: {
          correlationId: trace.correlationId,
          commandId: trace.commandId,
          ...(trace.causationId ? { causationId: trace.causationId } : {}),
        },
        allocations: {
          create: (originalLedger.allocations || []).map((allocation: any) => ({
            claimItemId: allocation.claimItemId,
            amount: -Number(allocation.amount),
            allocationOrder: allocation.allocationOrder,
          })),
        },
      },
    });
    reversalLedgerEntryIds.push(reversalLedger.id);
    reversalAllocationCount = originalLedger.allocations?.length ?? 0;

    for (const allocation of originalLedger.allocations || []) {
      const amount = Number(allocation.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      await (tx.claimItem as any).updateMany({
        where: {
          id: allocation.claimItemId,
          tenantId,
          caseId: collection.caseId,
        },
        data: {
          collectedAmount: {
            decrement: amount,
          },
        },
      });

      await (tx.claimItem as any).updateMany({
        where: {
          id: allocation.claimItemId,
          tenantId,
          caseId: collection.caseId,
          collectedAmount: { lt: 0 },
        },
        data: {
          collectedAmount: 0,
        },
      });
    }
  }

  const reversedOverpayments = input.approvalRequestId
    ? await (tx as any).collectionOverpayment.findMany({
        where: {
          tenantId,
          caseId: collection.caseId,
          collectionId: collection.id,
          status: "HELD",
        },
        select: { id: true },
      })
    : [];
  await (tx as any).collectionOverpayment.updateMany({
    where: {
      tenantId,
      caseId: collection.caseId,
      collectionId: collection.id,
      status: "HELD",
    },
    data: {
      status: "REVERSED",
      remainingAmount: 0,
      reversedAt: cancelledAt,
    },
  });

  const cancelJournalEntryId = await writeCollectionCancelJournal(
    tx,
    deps.journalWriter,
    tenantId,
    actorUserId,
    cancelledCollection,
    cancelledAt,
    originalRecordedSourceVersion,
    trace,
  );

  const reversedEventId = paymentReversedEventId(tenantId, collection.id);
  await deps.domainEventIngestService.appendInTransaction(tx, {
    header: {
      eventId: reversedEventId,
      aggregateType: "Case",
      aggregateId: collection.caseId,
      eventType: "PAYMENT_REVERSED",
      occurredAt: cancelledAt.toISOString(),
      occurredAtConfidence: "SYSTEM_VERIFIED",
      actor: {
        type: "HUMAN",
        userId: actorUserId,
      },
      causedBy: originalPaymentEventId,
      correlationId: trace.correlationId,
      commandId: trace.commandId,
      ...(trace.causationId ? { causationId: trace.causationId } : {}),
      tenantId,
    },
    payload: {
      tenantId,
      caseId: collection.caseId,
      collectionId: collection.id,
      reversedAt: cancelledAt.toISOString(),
      cancelReason: dto.cancelReason,
    },
  });

  if (input.approvalRequestId) {
    if (!deps.auditService) {
      throw new ConflictException('COLLECTION_VOID audit dependency is not available.');
    }
    await logCollectionMutationInTransaction(deps.auditService, tx, {
      tenantId,
      collectionId: collection.id,
      action: COLLECTION_AUDIT_ACTION.VOID_EXECUTED,
      trace,
      evidence: {
        caseId: collection.caseId,
        status: cancelledCollection.status,
        actor: { type: 'HUMAN', userId: actorUserId },
        amount: cancelledCollection.amount?.toString?.() ?? String(cancelledCollection.amount),
        currency: cancelledCollection.currency || 'TRY',
        occurredAt: cancelledAt.toISOString(),
        journalEntryIds: [cancelJournalEntryId],
        ledgerEntryIds: reversalLedgerEntryIds,
        ledgerAllocationCount: reversalAllocationCount,
        eventId: reversedEventId,
        outboxIdempotencyKey: `evt:${reversedEventId}`,
        overpaymentId: reversedOverpayments[0]?.id,
        approvalRequestId: input.approvalRequestId,
      },
    });
  }

  return cancelledCollection;
}

function deterministicUuid(...parts: string[]): string {
  const bytes = createHash("sha256").update(parts.join("\u001f")).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function paymentReversedEventId(tenantId: string, collectionId: string): string {
  return deterministicUuid(PAYMENT_REVERSED_EVENT_NAMESPACE, tenantId, collectionId);
}

function paymentReceivedEventNotFound(): ConflictException {
  return new ConflictException({
    errorCode: PAYMENT_RECEIVED_EVENT_NOT_FOUND,
    message: PAYMENT_RECEIVED_EVENT_NOT_FOUND_MESSAGE,
  });
}

function getTimelineEventBody(event: any): { header?: Record<string, unknown>; payload?: Record<string, unknown> } {
  if (!event?.body || typeof event.body !== "object") return {};
  return event.body as { header?: Record<string, unknown>; payload?: Record<string, unknown> };
}

function getTimelineEventId(event: any): string | undefined {
  const eventId = getTimelineEventBody(event).header?.eventId;
  return typeof eventId === "string" && eventId.trim() ? eventId : undefined;
}

function readJournalSourceVersion(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const sourceVersion = (metadata as { sourceVersion?: unknown }).sourceVersion;
  return typeof sourceVersion === "string" && sourceVersion.trim() ? sourceVersion : null;
}

function coerceDate(value: unknown, fallback: unknown): Date {
  const candidate = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (candidate && !Number.isNaN(candidate.getTime())) return candidate;
  const fallbackDate = fallback instanceof Date ? fallback : fallback ? new Date(String(fallback)) : null;
  if (fallbackDate && !Number.isNaN(fallbackDate.getTime())) return fallbackDate;
  return new Date();
}

async function writeCollectionCancelJournal(
  tx: any,
  journalWriter: AccountingJournalWriterService,
  tenantId: string,
  actorUserId: string,
  collection: any,
  cancelledAt: Date,
  originalRecordedSourceVersion: string,
  trace: CollectionMutationTrace,
): Promise<string> {
  const draft = buildCollectionCashJournalDraft({
    tenantId,
    actorUserId,
    collection: { ...collection, cancelledAt },
    kind: "CANCEL",
    sourceAction: "cancel",
    sourceVersionSuffix: "CANCEL",
    originalRecordedSourceVersion,
    trace,
  });
  const write = await journalWriter.write({ draft }, tx);
  if (!write.ok) {
    throw new ConflictException("Collection cancel journal write failed: " + write.errors.map((error) => error.code).join(", "));
  }
  return write.output.journalEntryId;
}

function buildCollectionCashJournalDraft(params: {
  tenantId: string;
  actorUserId: string | undefined;
  collection: any;
  kind: "RECORDED" | "CANCEL";
  sourceAction: "recorded" | "cancel";
  sourceVersionSuffix: "RECORDED" | "CANCEL";
  originalRecordedSourceVersion: string | null;
  trace?: CollectionMutationTrace;
}): ValidatedJournalEntryDraft {
  const { tenantId, actorUserId, collection, kind, sourceAction, sourceVersionSuffix, originalRecordedSourceVersion, trace } = params;
  const occurredAt = kind === "RECORDED"
    ? coerceDate(collection.date, collection.createdAt)
    : coerceDate(collection.cancelledAt, collection.updatedAt);
  const sourceVersionDate = kind === "RECORDED"
    ? coerceDate(collection.createdAt, occurredAt)
    : coerceDate(collection.cancelledAt, occurredAt);
  const occurredAtIso = occurredAt.toISOString();
  const sourceVersion = `${sourceVersionDate.toISOString()}:${collection.id}:${sourceVersionSuffix}`;
  const effectiveDate = coerceDate(kind === "RECORDED" ? (collection.valueDate ?? collection.date) : (collection.cancelledAt ?? occurredAt), occurredAt)
    .toISOString()
    .slice(0, 10);
  const amount = collection.amount?.toString?.() ?? String(collection.amount);
  const currency = collection.currency || "TRY";
  const payload: CollectionJournalSource["payload"] = {
    kind,
    amount,
    caseId: collection.caseId,
    collectionId: collection.id,
    collectionStatus: kind === "RECORDED" ? "CONFIRMED" : "CANCELLED",
    debtorId: collection.caseDebtorId ?? null,
    originalRecordedSourceVersion,
  };
  const source: CollectionJournalSource = {
    tenantId,
    sourceType: "COLLECTION",
    sourceId: collection.id,
    sourceVersion,
    sourceAction,
    occurredAt: occurredAtIso,
    effectiveDate,
    actorId: actorUserId ?? null,
    currency,
    sourceHash: createCanonicalSourceHash({
      tenantId,
      sourceType: "COLLECTION",
      sourceId: collection.id,
      sourceAction,
      sourceVersion,
      occurredAt: occurredAtIso,
      effectiveDate,
      actorId: actorUserId ?? null,
      currency,
      payload,
    }),
    metadata: {
      sourceName: "collection",
      status: kind,
      ...(trace ? { correlationId: trace.correlationId, commandId: trace.commandId } : {}),
      ...(trace?.causationId ? { causationId: trace.causationId } : {}),
    },
    payload,
  };

  const built = buildAccountingJournal(source);
  if (!built.ok) {
    throw new ConflictException(`Collection journal mapping failed: ${built.errors.map((error) => error.code).join(", ")}`);
  }

  const validated = validateJournalDraft(built.draft);
  if (!validated.ok) {
    throw new ConflictException(`Collection journal validation failed: ${validated.errors.map((error) => error.code).join(", ")}`);
  }

  return validated.draft;
}
