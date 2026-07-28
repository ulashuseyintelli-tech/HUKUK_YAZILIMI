import { createHash } from 'node:crypto';
import { canonicalJsonStringify, stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { CLAIM_ITEM_SOURCE_PROVENANCE_VERSION } from '../claim-item-source-provenance';
import {
  CLAIM_ITEM_FORMATION_SOURCE_SLOT,
  type ClaimFormationJsonValue,
} from './claim-item-formation-intent.contract';

export interface CanonicalPayload<T extends ClaimFormationJsonValue> {
  readonly canonicalPayload: string;
  readonly hash: string;
  readonly value: T;
}

export function canonicalFormationPayload<T extends ClaimFormationJsonValue>(
  value: T,
): CanonicalPayload<T> {
  return Object.freeze({
    canonicalPayload: canonicalJsonStringify(value),
    hash: stableJsonHash(value),
    value,
  });
}

export function domainSeparatedFormationHash(
  domain: string,
  value: ClaimFormationJsonValue,
): string {
  return createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJsonStringify(value), 'utf8')
    .digest('hex');
}

export function buildCaseDocumentSourceIdentityHash(input: {
  readonly tenantId: string;
  readonly caseId: string;
  readonly documentId: string;
}): string {
  return stableJsonHash({
    version: CLAIM_ITEM_SOURCE_PROVENANCE_VERSION,
    tenantId: input.tenantId,
    caseId: input.caseId,
    sourceType: 'CASE_DOCUMENT',
    sourceId: input.documentId,
    sourceSlot: CLAIM_ITEM_FORMATION_SOURCE_SLOT,
  });
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export interface ClaimItemFormationIntentChecksumInput {
  readonly normalizedInputChecksum: string;
  readonly sourceIdentityHash: string;
  readonly sourceVersionId: string;
  readonly canonicalSourceFingerprint: string;
  readonly sourceResolutionHash: string;
  readonly componentCategory: string;
  readonly componentSubtypeCode: string;
  readonly componentSubtypeVersion: string;
  readonly componentSubtypeChecksum: string;
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly legalBasisChecksum: string;
  readonly legalBasisResolutionHash: string;
  readonly legalBasisProjectionBindingChecksum?: string | null;
  readonly originalAmountMinor: bigint;
  readonly demandedAmountMinor: bigint;
  readonly currency: string;
  readonly minorUnit: number;
  readonly effectiveAt: Date | string;
  readonly liabilityContextHash: string;
  readonly evidenceRefsHash: string;
  readonly provenanceHash: string;
}

export function buildClaimItemFormationIntentChecksum(
  contractVersion: string,
  input: ClaimItemFormationIntentChecksumInput,
): string {
  return domainSeparatedFormationHash(contractVersion, {
    normalizedInputChecksum: input.normalizedInputChecksum,
    sourceIdentityHash: input.sourceIdentityHash,
    sourceVersionId: input.sourceVersionId,
    canonicalSourceFingerprint: input.canonicalSourceFingerprint,
    sourceResolutionHash: input.sourceResolutionHash,
    componentCategory: input.componentCategory,
    componentSubtypeCode: input.componentSubtypeCode,
    componentSubtypeVersion: input.componentSubtypeVersion,
    componentSubtypeChecksum: input.componentSubtypeChecksum,
    legalBasisCode: input.legalBasisCode,
    legalBasisVersion: input.legalBasisVersion,
    legalBasisChecksum: input.legalBasisChecksum,
    legalBasisResolutionHash: input.legalBasisResolutionHash,
    ...(input.legalBasisProjectionBindingChecksum
      ? {
          legalBasisProjectionBindingChecksum:
            input.legalBasisProjectionBindingChecksum,
        }
      : {}),
    originalAmountMinor: input.originalAmountMinor.toString(),
    demandedAmountMinor: input.demandedAmountMinor.toString(),
    currency: input.currency,
    minorUnit: input.minorUnit,
    effectiveAt:
      input.effectiveAt instanceof Date
        ? input.effectiveAt.toISOString()
        : input.effectiveAt,
    liabilityContextHash: input.liabilityContextHash,
    evidenceRefsHash: input.evidenceRefsHash,
    provenanceHash: input.provenanceHash,
  });
}
