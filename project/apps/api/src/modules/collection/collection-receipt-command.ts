import { BadRequestException } from '@nestjs/common';
import type { EventActor } from '../icrabot/domain-event-ingest/domain-event-ingest.types';
import { CollectionSource, type CreateCollectionDto } from './dto/collection.dto';
import type {
  CollectionCommandProducer,
  CollectionMutationTrace,
  CollectionRequestContext,
} from './collection-audit';

const SOURCE_ID_REQUIRED = new Set<CollectionSource>([
  CollectionSource.BANK_INTEGRATION,
  CollectionSource.BANK_SEIZURE,
  CollectionSource.SALARY_SEIZURE,
  CollectionSource.AUCTION,
  CollectionSource.EXTERNAL_CASE,
  CollectionSource.THIRD_PARTY,
]);

export interface CanonicalCollectionReceiptCommand {
  tenantId: string;
  dto: CreateCollectionDto;
  actor: EventActor;
  producer: CollectionCommandProducer;
  sourceIdentity: {
    type: CollectionSource;
    id: string;
  };
  trace: CollectionMutationTrace;
}

export function resolveCanonicalCollectionReceiptCommand(input: {
  tenantId: string;
  dto: CreateCollectionDto;
  userId?: string;
  requestContext: CollectionRequestContext;
  trace: CollectionMutationTrace;
}): CanonicalCollectionReceiptCommand {
  const tenantId = requireText(input.tenantId, 'COLLECTION_COMMAND_TENANT_REQUIRED');
  const caseId = requireText(input.dto.caseId, 'COLLECTION_COMMAND_CASE_REQUIRED');
  const idempotencyKey = requireText(
    input.dto.idempotencyKey,
    'COLLECTION_COMMAND_IDEMPOTENCY_KEY_REQUIRED',
  );
  const currency = requireText(
    input.dto.currency ?? 'TRY',
    'COLLECTION_COMMAND_CURRENCY_REQUIRED',
  ).toUpperCase();
  const amount = Number(input.dto.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw commandError('COLLECTION_COMMAND_AMOUNT_INVALID');
  }

  const date = new Date(input.dto.date);
  if (Number.isNaN(date.getTime())) {
    throw commandError('COLLECTION_COMMAND_DATE_INVALID');
  }
  if (!input.dto.type) {
    throw commandError('COLLECTION_COMMAND_TYPE_REQUIRED');
  }

  const producer = input.requestContext.producer ?? inferCompatibilityProducer(input.dto.sourceType);
  const actor = input.requestContext.actor ?? inferCompatibilityActor(input.dto.sourceType, input.userId);
  assertActor(actor);

  const sourceType = input.dto.sourceType ?? CollectionSource.MANUAL;
  const sourceId = input.dto.sourceId?.trim() || undefined;
  if (SOURCE_ID_REQUIRED.has(sourceType) && !sourceId) {
    throw commandError('COLLECTION_COMMAND_SOURCE_ID_REQUIRED');
  }

  if (
    (producer === 'BANK_TRANSACTION_MATCH' || producer === 'EXTERNAL_CASE_RECEIPT') &&
    !input.trace.causationId
  ) {
    throw commandError('COLLECTION_COMMAND_CAUSATION_REQUIRED');
  }

  return {
    tenantId,
    dto: {
      ...input.dto,
      caseId,
      idempotencyKey,
      amount,
      currency,
      date: date.toISOString(),
      ...(sourceId ? { sourceId } : {}),
    },
    actor,
    producer,
    sourceIdentity: {
      type: sourceType,
      id: sourceId ?? idempotencyKey,
    },
    trace: {
      ...input.trace,
      producer,
    },
  };
}

function inferCompatibilityProducer(_sourceType?: CollectionSource): CollectionCommandProducer {
  return 'COLLECTION_SERVICE_COMPATIBILITY';
}

function inferCompatibilityActor(sourceType: CollectionSource | undefined, userId?: string): EventActor {
  if (!sourceType || sourceType === CollectionSource.MANUAL || sourceType === CollectionSource.SETTLEMENT) {
    return { type: 'HUMAN', userId: userId || 'unknown' };
  }
  return { type: 'EXTERNAL', externalSystem: sourceType };
}

function assertActor(actor: EventActor): void {
  if (actor.type === 'HUMAN' && (!actor.userId || actor.userId === 'unknown')) {
    throw commandError('COLLECTION_COMMAND_ACTOR_REQUIRED');
  }
  if (actor.type === 'SYSTEM' && !actor.reason?.trim()) {
    throw commandError('COLLECTION_COMMAND_SYSTEM_ACTOR_REASON_REQUIRED');
  }
  if (actor.type === 'EXTERNAL' && !actor.externalSystem?.trim()) {
    throw commandError('COLLECTION_COMMAND_EXTERNAL_ACTOR_REQUIRED');
  }
}

function requireText(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw commandError(code);
  return normalized;
}

function commandError(code: string): BadRequestException {
  return new BadRequestException({
    code,
    message: 'Canonical Collection receipt command doğrulaması başarısız.',
  });
}
