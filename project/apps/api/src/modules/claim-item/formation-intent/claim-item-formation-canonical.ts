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
