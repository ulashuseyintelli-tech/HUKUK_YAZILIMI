import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LegalBasisExactVersionResolverPort,
  type ExactLegalBasisBindingV1,
  type ResolveExactLegalBasisFailureCode,
} from '../../claim-item/formation-intent/claim-item-formation-resolver.ports';
import type {
  ClaimFormationJsonValue,
  ClaimItemFormationComponentCategory,
} from '../../claim-item/formation-intent/claim-item-formation-intent.contract';
import {
  assertLegalBasisProjectionBindingMatches,
  LegalBasisProjectionBindingContractError,
  parseLegalBasisProjectionBindingV1,
  type LegalBasisProjectionBindingPayloadV1,
} from '../../claim-item/formation-intent/legal-basis-projection-binding.contract';
import {
  canonicalJsonStringify,
  stableJsonHash,
} from '../../permission-diagnostics/guided-edge/canonical-json';
import { isUyapM01LegalBasisConsumerEnabled } from './uyap-m01-legal-basis-consumer.activation';

const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const INPUT_KEYS = [
  'caseId',
  'claimItemId',
  'snapshotHash',
  'snapshotId',
  'tenantId',
] as const;

export const UYAP_M01_LEGAL_BASIS_FAILURE_CODES = [
  'RELEASE_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'CHECKSUM_MISMATCH',
  'NOT_EFFECTIVE',
  'COMPONENT_MISMATCH',
  'SOURCE_INCOMPATIBLE',
  'EVIDENCE_INCOMPATIBLE',
  'LIABILITY_INCOMPATIBLE',
  'CLAIM_RELATION_MISSING',
  'TENANT_MISMATCH',
  'CASE_MISMATCH',
  'FEATURE_DISABLED',
] as const;

export type UyapM01LegalBasisFailureCode =
  (typeof UYAP_M01_LEGAL_BASIS_FAILURE_CODES)[number];

export interface UyapM01ClaimRelationInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly claimItemId: string;
  readonly snapshotId: string;
  readonly snapshotHash: string;
}

export interface UyapM01LegalBasisConsumerProjection {
  readonly tenantId: string;
  readonly caseId: string;
  readonly claimItemId: string;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly releaseChecksum: string;
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly legalBasisChecksum: string;
  readonly effectiveAt: string;
  readonly componentCategory: string;
  readonly componentSubtypeCode: string;
  readonly componentSubtypeVersion: string;
  readonly sourceType: string;
  readonly evidenceClasses: readonly string[];
  readonly liabilityContextHash: string;
  readonly legalBasisResolutionHash: string;
}

export type UyapM01LegalBasisConsumerResult =
  | { readonly ok: true; readonly value: UyapM01LegalBasisConsumerProjection }
  | {
      readonly ok: false;
      readonly failure: { readonly code: UyapM01LegalBasisFailureCode };
    };

type SnapshotRecord = NonNullable<
  Awaited<ReturnType<PrismaService['claimFormationSnapshot']['findUnique']>>
>;

interface ParsedLiabilityContext {
  readonly liabilityType: string;
  readonly liableDebtorRefs: readonly string[];
  readonly payload: ClaimFormationJsonValue;
}

@Injectable()
export class UyapM01LegalBasisConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LegalBasisExactVersionResolverPort)
    private readonly resolver: LegalBasisExactVersionResolverPort,
  ) {}

  /**
   * Production callers: none. This dormant module-local entry point is reserved
   * for a separately authorized UYAP successor after both activation flags are
   * explicitly enabled.
   */
  async resolveClaimRelation(rawInput: unknown): Promise<UyapM01LegalBasisConsumerResult> {
    if (!isUyapM01LegalBasisConsumerEnabled()) return fail('FEATURE_DISABLED');
    const input = parseInput(rawInput);
    if (!input) return fail('CLAIM_RELATION_MISSING');

    const snapshot = await this.prisma.claimFormationSnapshot.findUnique({
      where: { id: input.snapshotId },
    });
    if (!snapshot) return fail('CLAIM_RELATION_MISSING');
    if (snapshot.tenantId !== input.tenantId) return fail('TENANT_MISMATCH');
    if (snapshot.caseId !== input.caseId) return fail('CASE_MISMATCH');
    if (snapshot.claimItemId !== input.claimItemId) return fail('CLAIM_RELATION_MISSING');
    if (
      snapshot.snapshotHash !== input.snapshotHash ||
      !canonicalPayloadMatches(snapshot.snapshotCanonicalPayload, snapshot.snapshotHash)
    ) {
      return fail('CHECKSUM_MISMATCH');
    }

    const projection = readProjectionBinding(snapshot);
    if (!projection) return fail('CHECKSUM_MISMATCH');
    const identityFailure = validatePersistedIdentity(snapshot, projection);
    if (identityFailure) return fail(identityFailure);
    const temporalFailure = validateTemporalContext(snapshot, projection);
    if (temporalFailure) return fail(temporalFailure);

    const evidenceClasses = exactOpaqueList(
      projection.decisionProjection.requiredEvidenceTypes,
    );
    if (!evidenceClasses) return fail('EVIDENCE_INCOMPATIBLE');
    if (
      !canonicalPayloadMatches(
        snapshot.evidenceRefsCanonicalPayload,
        snapshot.evidenceRefsHash,
      )
    ) {
      return fail('EVIDENCE_INCOMPATIBLE');
    }

    const liability = readLiability(snapshot);
    if (!liability) return fail('LIABILITY_INCOMPATIBLE');
    if (
      !projection.decisionProjection.liabilityCompatibility.allowedLiabilityTypes.includes(
        liability.liabilityType,
      )
    ) {
      return fail('LIABILITY_INCOMPATIBLE');
    }

    // The immutable binding contains the canonical source candidates, not a
    // caller-selectable source. Re-resolve every exact candidate and accept
    // only the single result whose resolution hash matches the snapshot.
    const sourceCandidates = exactOpaqueList(
      projection.decisionProjection.requiredSourceTypes,
    );
    if (!sourceCandidates) return fail('SOURCE_INCOMPATIBLE');

    const attempts = await Promise.all(
      sourceCandidates.map(async (sourceType) => ({
        sourceType,
        result: await this.resolver.resolveExactVersion({
          tenantId: snapshot.tenantId,
          caseId: snapshot.caseId,
          legalBasisCode: snapshot.legalBasisCode,
          requestedVersion: snapshot.legalBasisVersion,
          effectiveAt: snapshot.effectiveAt.toISOString(),
          componentCategory:
            snapshot.componentCategory as ClaimItemFormationComponentCategory,
          componentSubtypeCode: snapshot.componentSubtypeCode,
          documentType: sourceType,
          evidenceClasses,
          liabilityContext: liability.payload,
        }),
      })),
    );

    const exactMatches = attempts.filter(
      (attempt): attempt is {
        readonly sourceType: string;
        readonly result: { readonly ok: true; readonly value: ExactLegalBasisBindingV1 };
      } =>
        attempt.result.ok &&
        resolvedBindingMatches(
          snapshot,
          projection,
          attempt.sourceType,
          attempt.result.value,
        ),
    );
    if (exactMatches.length !== 1) {
      return fail(classifyResolutionFailure(attempts, projection));
    }

    const match = exactMatches[0];
    return {
      ok: true,
      value: Object.freeze({
        tenantId: snapshot.tenantId,
        caseId: snapshot.caseId,
        claimItemId: snapshot.claimItemId,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.snapshotHash,
        releaseId: match.result.value.registryReleaseId,
        releaseVersion: match.result.value.projectionAuthority.releaseVersion,
        releaseChecksum: match.result.value.registryReleaseChecksum,
        legalBasisCode: match.result.value.legalBasisCode,
        legalBasisVersion: match.result.value.legalBasisVersion,
        legalBasisChecksum: match.result.value.legalBasisChecksum,
        effectiveAt: snapshot.effectiveAt.toISOString(),
        componentCategory: match.result.value.componentCategory,
        componentSubtypeCode: match.result.value.componentSubtypeCode,
        componentSubtypeVersion: match.result.value.componentSubtypeVersion,
        sourceType: match.sourceType,
        evidenceClasses: Object.freeze([...evidenceClasses]),
        liabilityContextHash: snapshot.liabilityContextHash,
        legalBasisResolutionHash: match.result.value.resolutionHash,
      }),
    };
  }
}

function parseInput(raw: unknown): UyapM01ClaimRelationInput | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    return null;
  }
  for (const key of INPUT_KEYS) {
    if (typeof raw[key] !== 'string' || !OPAQUE_REFERENCE.test(raw[key] as string)) return null;
  }
  if (!SHA256_HEX.test(raw.snapshotHash as string)) return null;
  return raw as unknown as UyapM01ClaimRelationInput;
}

function readProjectionBinding(snapshot: SnapshotRecord): LegalBasisProjectionBindingPayloadV1 | null {
  if (
    !snapshot.legalBasisProjectionBindingContractVersion ||
    !snapshot.legalBasisProjectionBindingCanonicalPayload ||
    !snapshot.legalBasisProjectionBindingChecksum
  ) {
    return null;
  }
  try {
    return parseLegalBasisProjectionBindingV1({
      contractVersion: snapshot.legalBasisProjectionBindingContractVersion as '1',
      canonicalPayload: snapshot.legalBasisProjectionBindingCanonicalPayload,
      checksum: snapshot.legalBasisProjectionBindingChecksum,
    }).payload;
  } catch (error) {
    if (!(error instanceof LegalBasisProjectionBindingContractError)) throw error;
    return null;
  }
}

function validatePersistedIdentity(
  snapshot: SnapshotRecord,
  projection: LegalBasisProjectionBindingPayloadV1,
): UyapM01LegalBasisFailureCode | null {
  const authority = projection.authorityIdentity;
  if (authority.releaseId !== snapshot.legalBasisRegistryReleaseId) {
    return 'RELEASE_NOT_FOUND';
  }
  if (
    String(authority.legalBasisVersion) !== snapshot.legalBasisVersion ||
    String(authority.subtypeVersion) !== snapshot.componentSubtypeVersion
  ) {
    return 'VERSION_NOT_FOUND';
  }
  if (
    authority.releaseChecksum !== snapshot.legalBasisRegistryReleaseChecksum ||
    authority.legalBasisChecksum !== snapshot.legalBasisChecksum ||
    authority.subtypeChecksum !== snapshot.componentSubtypeChecksum
  ) {
    return 'CHECKSUM_MISMATCH';
  }
  if (
    authority.legalBasisCode !== snapshot.legalBasisCode ||
    projection.decisionProjection.canonicalComponentCategory !== snapshot.componentCategory ||
    authority.subtypeCode !== snapshot.componentSubtypeCode
  ) {
    return 'COMPONENT_MISMATCH';
  }
  return null;
}

function validateTemporalContext(
  snapshot: SnapshotRecord,
  projection: LegalBasisProjectionBindingPayloadV1,
): UyapM01LegalBasisFailureCode | null {
  const effectiveAt = snapshot.effectiveAt.getTime();
  const startsAt = Date.parse(projection.temporalContext.authorityEffectiveAt);
  const endsAt = projection.temporalContext.authorityEffectiveUntil
    ? Date.parse(projection.temporalContext.authorityEffectiveUntil)
    : null;
  if (
    !Number.isFinite(effectiveAt) ||
    !Number.isFinite(startsAt) ||
    effectiveAt < startsAt ||
    (endsAt !== null && (!Number.isFinite(endsAt) || effectiveAt >= endsAt))
  ) {
    return 'NOT_EFFECTIVE';
  }
  return null;
}

function readLiability(snapshot: SnapshotRecord): ParsedLiabilityContext | null {
  if (
    !canonicalPayloadMatches(
      snapshot.liabilityContextCanonicalPayload,
      snapshot.liabilityContextHash,
    )
  ) {
    return null;
  }
  const payload = JSON.parse(snapshot.liabilityContextCanonicalPayload) as unknown;
  if (!isRecord(payload) || typeof payload.liabilityType !== 'string') return null;
  const liableDebtorRefs = exactOpaqueList(payload.liableDebtorRefs);
  if (!liableDebtorRefs) return null;
  return {
    liabilityType: payload.liabilityType,
    liableDebtorRefs,
    payload: payload as ClaimFormationJsonValue,
  };
}

function resolvedBindingMatches(
  snapshot: SnapshotRecord,
  projection: LegalBasisProjectionBindingPayloadV1,
  sourceType: string,
  resolved: ExactLegalBasisBindingV1,
): boolean {
  if (
    resolved.registryReleaseId !== snapshot.legalBasisRegistryReleaseId ||
    resolved.projectionAuthority.releaseVersion !== String(projection.authorityIdentity.releaseVersion) ||
    resolved.registryReleaseChecksum !== snapshot.legalBasisRegistryReleaseChecksum ||
    resolved.legalBasisCode !== snapshot.legalBasisCode ||
    resolved.legalBasisVersion !== snapshot.legalBasisVersion ||
    resolved.legalBasisChecksum !== snapshot.legalBasisChecksum ||
    resolved.componentCategory !== snapshot.componentCategory ||
    resolved.componentSubtypeCode !== snapshot.componentSubtypeCode ||
    resolved.componentSubtypeVersion !== snapshot.componentSubtypeVersion ||
    resolved.componentSubtypeChecksum !== snapshot.componentSubtypeChecksum ||
    resolved.resolutionContractVersion !== snapshot.legalBasisResolutionContractVersion ||
    resolved.resolutionHash !== snapshot.legalBasisResolutionHash ||
    !sameStringSet(
      resolved.requiredEvidenceClasses,
      projection.decisionProjection.requiredEvidenceTypes,
    ) ||
    !resolved.allowedDocumentTypes.includes(sourceType) ||
    !resolved.liabilityCompatible
  ) {
    return false;
  }
  try {
    assertLegalBasisProjectionBindingMatches(
      {
        contractVersion: snapshot.legalBasisProjectionBindingContractVersion as '1',
        canonicalPayload: snapshot.legalBasisProjectionBindingCanonicalPayload as string,
        checksum: snapshot.legalBasisProjectionBindingChecksum as string,
      },
      resolved,
      snapshot.createdAt.toISOString(),
    );
    return true;
  } catch (error) {
    if (!(error instanceof LegalBasisProjectionBindingContractError)) throw error;
    return false;
  }
}

function classifyResolutionFailure(
  attempts: readonly {
    readonly sourceType: string;
    readonly result:
      | { readonly ok: true; readonly value: ExactLegalBasisBindingV1 }
      | { readonly ok: false; readonly failure: { readonly code: ResolveExactLegalBasisFailureCode } };
  }[],
  projection: LegalBasisProjectionBindingPayloadV1,
): UyapM01LegalBasisFailureCode {
  const successful = attempts.filter(
    (attempt): attempt is {
      readonly sourceType: string;
      readonly result: { readonly ok: true; readonly value: ExactLegalBasisBindingV1 };
    } => attempt.result.ok,
  );
  if (successful.length > 0) {
    if (
      successful.some(
        ({ result }) =>
          !sameStringSet(
            result.value.requiredEvidenceClasses,
            projection.decisionProjection.requiredEvidenceTypes,
          ),
      )
    ) {
      return 'EVIDENCE_INCOMPATIBLE';
    }
    if (
      successful.some(
        ({ sourceType, result }) => !result.value.allowedDocumentTypes.includes(sourceType),
      )
    ) {
      return 'SOURCE_INCOMPATIBLE';
    }
    if (successful.some(({ result }) => !result.value.liabilityCompatible)) {
      return 'LIABILITY_INCOMPATIBLE';
    }
    return 'CHECKSUM_MISMATCH';
  }
  const failures = attempts.map((attempt) =>
    attempt.result.ok ? null : attempt.result.failure.code,
  );
  if (failures.includes('CHECKSUM_MISMATCH') || failures.includes('FINGERPRINT_MISMATCH')) {
    return 'CHECKSUM_MISMATCH';
  }
  if (failures.includes('RELEASE_NOT_FOUND') || failures.includes('AUTHORITY_UNAVAILABLE')) {
    return 'RELEASE_NOT_FOUND';
  }
  if (failures.includes('REVOKED') || failures.includes('SUPERSEDED')) {
    return 'NOT_EFFECTIVE';
  }
  if (failures.includes('VERSION_NOT_FOUND')) return 'VERSION_NOT_FOUND';
  return 'SOURCE_INCOMPATIBLE';
}

function canonicalPayloadMatches(payload: string, expectedHash: string): boolean {
  if (!SHA256_HEX.test(expectedHash)) return false;
  try {
    const parsed = JSON.parse(payload) as ClaimFormationJsonValue;
    return canonicalJsonStringify(parsed) === payload && stableJsonHash(parsed) === expectedHash;
  } catch {
    return false;
  }
}

function exactOpaqueList(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 64 ||
    value.some((entry) => typeof entry !== 'string' || !OPAQUE_REFERENCE.test(entry)) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return Object.freeze([...(value as string[])]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: UyapM01LegalBasisFailureCode): UyapM01LegalBasisConsumerResult {
  return { ok: false, failure: { code } };
}
