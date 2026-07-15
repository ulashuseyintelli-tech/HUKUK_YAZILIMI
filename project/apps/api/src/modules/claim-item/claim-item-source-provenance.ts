import { type CanonicalWriteEnvelopeV1 } from '../../common/canonical-write-envelope';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
  type ClaimItemSystemWriterRoute,
} from './claim-item-writer-routes';

export const CLAIM_ITEM_SOURCE_PROVENANCE_VERSION = 1 as const;
export const CLAIM_ITEM_SOURCE_PROVENANCE_METADATA_KEY =
  'canonicalSourceProvenance' as const;

export const CLAIM_ITEM_INGRESS_SOURCES = [
  'DUE',
  'CASE_INSTRUMENT',
  'CASE_DOCUMENT',
  'RULE_ENGINE',
  'DOCUMENT_GENERATOR',
  'PRECAUTIONARY_COST',
  'BACKFILL',
  'SYSTEM_GENERATED_CLAIM_ITEM',
] as const;

export type ClaimItemIngressSource = (typeof CLAIM_ITEM_INGRESS_SOURCES)[number];
export type ConcreteClaimItemIngressSource = Exclude<
  ClaimItemIngressSource,
  'SYSTEM_GENERATED_CLAIM_ITEM'
>;

export type ClaimItemCanonicalSourceType =
  | 'DUE'
  | 'CASE_INSTRUMENT'
  | 'CASE_DOCUMENT'
  | 'RULE_ENGINE'
  | 'PRECAUTIONARY_COST';

export type ClaimItemIngressExecutionBoundary =
  | 'P03_ROUTER'
  | 'OFFICE_APPROVAL_EXECUTOR'
  | 'AUTHORIZED_BACKFILL_SCRIPT'
  | 'CLASSIFICATION_ONLY';

export interface ClaimItemIngressMappingEntry {
  readonly canonicalSourceType: ClaimItemCanonicalSourceType | 'SYSTEM_GENERATED_CLAIM_ITEM';
  readonly envelopeSourceType: string | null;
  readonly actorType: 'HUMAN' | 'SYSTEM';
  readonly policyRef: string | null;
  readonly writerRoute: ClaimItemSystemWriterRoute | null;
  readonly executionBoundary: ClaimItemIngressExecutionBoundary;
}

function mappingEntry(
  entry: ClaimItemIngressMappingEntry,
): Readonly<ClaimItemIngressMappingEntry> {
  return Object.freeze({ ...entry });
}

/**
 * WS02-P01 ingress inventory expressed as an executable, immutable mapping.
 *
 * `SYSTEM_GENERATED_CLAIM_ITEM` is an umbrella classification, not a new writer.
 * Concrete SYSTEM ingress remains limited to the five P03 routes and the already
 * existing, separately guarded backfill script.
 */
export const CLAIM_ITEM_INGRESS_MAPPING = Object.freeze({
  DUE: mappingEntry({
    canonicalSourceType: 'DUE',
    envelopeSourceType: 'DUE_BRIDGE',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-008',
    writerRoute: 'DUE_BRIDGE',
    executionBoundary: 'P03_ROUTER',
  }),
  CASE_INSTRUMENT: mappingEntry({
    canonicalSourceType: 'CASE_INSTRUMENT',
    envelopeSourceType: 'CASE_INSTRUMENT',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-002',
    writerRoute: 'CASE_INSTRUMENT_GENERATOR',
    executionBoundary: 'P03_ROUTER',
  }),
  CASE_DOCUMENT: mappingEntry({
    canonicalSourceType: 'CASE_DOCUMENT',
    envelopeSourceType: 'USER_DOCUMENT',
    actorType: 'HUMAN',
    policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
    writerRoute: null,
    executionBoundary: 'OFFICE_APPROVAL_EXECUTOR',
  }),
  RULE_ENGINE: mappingEntry({
    canonicalSourceType: 'RULE_ENGINE',
    envelopeSourceType: 'RULE_ENGINE_GENERATOR',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-002',
    writerRoute: 'RULE_ENGINE_GENERATOR',
    executionBoundary: 'P03_ROUTER',
  }),
  DOCUMENT_GENERATOR: mappingEntry({
    canonicalSourceType: 'CASE_DOCUMENT',
    envelopeSourceType: 'DOCUMENT_AUTO_GENERATOR',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-002',
    writerRoute: 'DOCUMENT_AUTO_GENERATOR',
    executionBoundary: 'P03_ROUTER',
  }),
  PRECAUTIONARY_COST: mappingEntry({
    canonicalSourceType: 'PRECAUTIONARY_COST',
    envelopeSourceType: 'PRECAUTIONARY_COST',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-002',
    writerRoute: 'PRECAUTIONARY_COST_WRITER',
    executionBoundary: 'P03_ROUTER',
  }),
  BACKFILL: mappingEntry({
    canonicalSourceType: 'DUE',
    envelopeSourceType: 'DUE_BACKFILL',
    actorType: 'SYSTEM',
    policyRef: 'REC-AUTH-008',
    writerRoute: null,
    executionBoundary: 'AUTHORIZED_BACKFILL_SCRIPT',
  }),
  SYSTEM_GENERATED_CLAIM_ITEM: mappingEntry({
    canonicalSourceType: 'SYSTEM_GENERATED_CLAIM_ITEM',
    envelopeSourceType: null,
    actorType: 'SYSTEM',
    policyRef: null,
    writerRoute: null,
    executionBoundary: 'CLASSIFICATION_ONLY',
  }),
} satisfies Record<ClaimItemIngressSource, Readonly<ClaimItemIngressMappingEntry>>);

const SYSTEM_ROUTE_INGRESS = Object.freeze({
  DUE_BRIDGE: 'DUE',
  CASE_INSTRUMENT_GENERATOR: 'CASE_INSTRUMENT',
  DOCUMENT_AUTO_GENERATOR: 'DOCUMENT_GENERATOR',
  RULE_ENGINE_GENERATOR: 'RULE_ENGINE',
  PRECAUTIONARY_COST_WRITER: 'PRECAUTIONARY_COST',
} satisfies Record<ClaimItemSystemWriterRoute, ConcreteClaimItemIngressSource>);

export function claimItemIngressForSystemRoute(
  route: ClaimItemSystemWriterRoute,
): ConcreteClaimItemIngressSource {
  return SYSTEM_ROUTE_INGRESS[route];
}

export interface ClaimItemSourceIdentityV1 {
  readonly version: typeof CLAIM_ITEM_SOURCE_PROVENANCE_VERSION;
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceType: ClaimItemCanonicalSourceType;
  readonly sourceId: string;
  readonly sourceSlot: string;
  readonly identityHash: string;
}

export interface ClaimItemCreatedByAuthorityV1 {
  readonly actorType: 'HUMAN' | 'SYSTEM';
  readonly actorRef: string;
  readonly policyRef: string | null;
  readonly legalBasisRef: string | null;
  readonly approvalRequestId: string | null;
}

export interface ClaimItemSourceProvenanceV1 {
  readonly version: typeof CLAIM_ITEM_SOURCE_PROVENANCE_VERSION;
  readonly sourceIdentity: Readonly<ClaimItemSourceIdentityV1>;
  readonly provenance: Readonly<{
    ingress: ConcreteClaimItemIngressSource;
    generationClass: 'HUMAN_GENERATED_CLAIM_ITEM' | 'SYSTEM_GENERATED_CLAIM_ITEM';
    envelopeSourceType: string;
    evidenceRefs: readonly string[];
  }>;
  readonly createdByAuthority: Readonly<ClaimItemCreatedByAuthorityV1>;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly canonicalSourceMetadata: Readonly<{
    executionBoundary: Exclude<ClaimItemIngressExecutionBoundary, 'CLASSIFICATION_ONLY'>;
    writerRoute: ClaimItemSystemWriterRoute | null;
    sourceSlot: string;
    commandId: string;
    idempotencyKey: string;
    effectiveAt: string;
  }>;
}

export interface BuildClaimItemSourceProvenanceInput {
  readonly ingress: ConcreteClaimItemIngressSource;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
  readonly sourceSlot?: string;
}

export class ClaimItemSourceProvenanceValidationError extends TypeError {
  constructor(message: string) {
    super(`ClaimItem source provenance v1: ${message}`);
    this.name = 'ClaimItemSourceProvenanceValidationError';
  }
}

const OPAQUE_SOURCE_SLOT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const DEFAULT_SOURCE_SLOT = 'PRIMARY';

/**
 * Projects the P01 CanonicalWriteEnvelope into the WS02-P01 source/provenance
 * contract. It does not authorize or persist a writer; those responsibilities
 * remain with P02/P03, OfficeApproval and the existing backfill boundary.
 */
export function buildClaimItemSourceProvenanceV1(
  input: BuildClaimItemSourceProvenanceInput,
): ClaimItemSourceProvenanceV1 {
  const mapping = CLAIM_ITEM_INGRESS_MAPPING[input.ingress];
  const envelope = input.envelope;
  const sourceSlot = input.sourceSlot ?? DEFAULT_SOURCE_SLOT;

  if (!OPAQUE_SOURCE_SLOT.test(sourceSlot)) {
    fail('sourceSlot must be a bounded opaque reference');
  }
  if (envelope.target.aggregateType !== 'ClaimItem') {
    fail('envelope target must be ClaimItem');
  }
  if (envelope.source.sourceId === undefined) {
    fail('envelope sourceId is required');
  }
  if (envelope.source.sourceType !== mapping.envelopeSourceType) {
    fail(`ingress ${input.ingress} does not match envelope sourceType`);
  }
  if (envelope.actor.type !== mapping.actorType) {
    fail(`ingress ${input.ingress} does not match envelope actor type`);
  }
  if (envelope.authority.policyRef !== mapping.policyRef) {
    fail(`ingress ${input.ingress} does not match envelope policy authority`);
  }
  if (mapping.writerRoute !== null) {
    if (envelope.actor.type !== 'SYSTEM' || envelope.actor.system !== mapping.writerRoute) {
      fail(`ingress ${input.ingress} does not match its P03 writer route`);
    }
  } else if (input.ingress === 'CASE_DOCUMENT') {
    if (envelope.actor.type !== 'HUMAN' || envelope.authority.approvalRequestId === undefined) {
      fail('CASE_DOCUMENT requires HUMAN actor and OfficeApproval authority');
    }
  } else if (
    input.ingress === 'BACKFILL' &&
    (envelope.actor.type !== 'SYSTEM' || envelope.actor.system !== 'DUE_BACKFILL')
  ) {
    fail('BACKFILL requires the existing DUE_BACKFILL script authority');
  }

  const identityHash = stableJsonHash({
    version: CLAIM_ITEM_SOURCE_PROVENANCE_VERSION,
    tenantId: envelope.tenantId,
    caseId: envelope.caseId,
    sourceType: mapping.canonicalSourceType,
    sourceId: envelope.source.sourceId,
    sourceSlot,
  });
  const sourceIdentity = Object.freeze({
    version: CLAIM_ITEM_SOURCE_PROVENANCE_VERSION,
    tenantId: envelope.tenantId,
    caseId: envelope.caseId,
    sourceType: mapping.canonicalSourceType as ClaimItemCanonicalSourceType,
    sourceId: envelope.source.sourceId,
    sourceSlot,
    identityHash,
  });
  const provenance = Object.freeze({
    ingress: input.ingress,
    generationClass:
      envelope.actor.type === 'HUMAN'
        ? ('HUMAN_GENERATED_CLAIM_ITEM' as const)
        : ('SYSTEM_GENERATED_CLAIM_ITEM' as const),
    envelopeSourceType: envelope.source.sourceType,
    evidenceRefs: Object.freeze([...envelope.source.evidenceRefs]),
  });
  const actorRef =
    envelope.actor.type === 'HUMAN'
      ? `user:${envelope.actor.userId}`
      : `system:${envelope.actor.system}`;
  const createdByAuthority = Object.freeze({
    actorType: envelope.actor.type as 'HUMAN' | 'SYSTEM',
    actorRef,
    policyRef: envelope.authority.policyRef ?? null,
    legalBasisRef: envelope.authority.legalBasisRef ?? null,
    approvalRequestId: envelope.authority.approvalRequestId ?? null,
  });
  const canonicalSourceMetadata = Object.freeze({
    executionBoundary: mapping.executionBoundary as Exclude<
      ClaimItemIngressExecutionBoundary,
      'CLASSIFICATION_ONLY'
    >,
    writerRoute: mapping.writerRoute,
    sourceSlot,
    commandId: envelope.commandId,
    idempotencyKey: envelope.idempotencyKey,
    effectiveAt: envelope.effectiveAt,
  });

  return Object.freeze({
    version: CLAIM_ITEM_SOURCE_PROVENANCE_VERSION,
    sourceIdentity,
    provenance,
    createdByAuthority,
    createdAt: envelope.occurredAt,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId ?? null,
    canonicalSourceMetadata,
  });
}

function fail(message: string): never {
  throw new ClaimItemSourceProvenanceValidationError(message);
}
