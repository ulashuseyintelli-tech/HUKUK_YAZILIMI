import {
  UYAP_M01_LEGAL_BASIS_FAILURE_CODES,
  type UyapM01LegalBasisConsumerResult,
  type UyapM01LegalBasisConsumerProjection,
  type UyapM01LegalBasisFailureCode,
} from '../legal-basis/uyap-m01-legal-basis-consumer.service';
import {
  resolveOfficialAlacakKalemiWrapper,
  type AlacakKalemiWrapperResolutionInput,
} from './official-codelist-registry';
import { serializeUyapExchangeCanonical } from './official-canonical-serializer';
import {
  createM01QualifiedOfficialAlacakKalemi,
  createM01QualifiedOfficialExchangeInput,
  type M01QualifiedOfficialAlacakKalemi,
} from './official-exchange-builder';
import type { OfficialDosya, OfficialTaraf } from './official-exchange.types';

const INPUT_KEYS = ['claimRelations', 'dosya', 'taraflar'] as const;
const INTEREST_ITEM_TYPES = new Set(['INTEREST', 'PRE_INTEREST', 'POST_INTEREST']);

export interface UyapStructuredEmissionM01ConsumerPort {
  resolveClaimRelation(rawInput: unknown): Promise<UyapM01LegalBasisConsumerResult>;
}

export interface UyapStructuredEmissionClaimEvidence {
  readonly tenantId: string;
  readonly caseId: string;
  readonly claimItemId: string;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly itemType: string;
  readonly demandedAmount: string;
  readonly currency: string;
  readonly label: string | null;
  readonly description: string | null;
  readonly wrapperContext: AlacakKalemiWrapperResolutionInput;
}

export interface UyapStructuredEmissionClaimEvidenceReaderPort {
  readExactClaimEvidence(
    projection: UyapM01LegalBasisConsumerProjection,
  ): Promise<UyapStructuredEmissionClaimEvidence | null>;
}

export const UYAP_OFFICIAL_STRUCTURED_EMISSION_FAILURE_CODES = [
  ...UYAP_M01_LEGAL_BASIS_FAILURE_CODES,
  'INVALID_INPUT',
  'EMPTY_CLAIM_SET',
  'DUPLICATE_CLAIM_RELATION',
  'SCOPE_MISMATCH',
  'EVIDENCE_SCOPE_MISMATCH',
  'CLAIM_ITEM_NOT_FOUND',
  'MONEY_NOT_EXACT_MINOR_UNIT',
  'INTEREST_NOT_SUPPORTED',
  'WRAPPER_AUTHORITY_REQUIRED',
  'WRAPPER_AMBIGUOUS',
  'BASE_SERIALIZATION_REJECTED',
  'STRUCTURED_SERIALIZATION_REJECTED',
  'ENCODING_REJECTED',
  'AUTHORITY_UNAVAILABLE',
] as const;

export type UyapOfficialStructuredEmissionFailureCode =
  (typeof UYAP_OFFICIAL_STRUCTURED_EMISSION_FAILURE_CODES)[number];

export interface UyapOfficialStructuredEmissionRequest {
  readonly dosya: OfficialDosya;
  readonly taraflar: readonly OfficialTaraf[];
  readonly claimRelations: readonly unknown[];
}

export type UyapOfficialStructuredEmissionResult =
  | {
      readonly status: 'CANONICAL_BYTES';
      readonly bytes: Buffer;
      readonly xml: string;
      readonly evidence: {
        readonly encoding: 'ISO-8859-9';
        readonly roundTripVerified: true;
        readonly byteLength: number;
        readonly encodedBytesSha256: string;
        readonly officialDtdValidated: false;
        readonly officialCodelistConformance: 'REGISTRY_VALIDATED';
        readonly claimCount: number;
        readonly wrapperSequence: readonly ('cek' | 'senet' | 'police' | 'ilam')[];
        readonly legalBasisResolutionHashes: readonly string[];
      };
    }
  | {
      readonly status: 'REJECTED';
      readonly failure: {
        readonly code: UyapOfficialStructuredEmissionFailureCode;
        readonly claimIndex?: number;
      };
    };

export class UyapOfficialAlacakKalemiStructuredEmissionService {
  constructor(
    private readonly m01Consumer: UyapStructuredEmissionM01ConsumerPort,
    private readonly claimEvidenceReader: UyapStructuredEmissionClaimEvidenceReaderPort,
  ) {}

  /**
   * Production callers: none. The pure service is intentionally unwired and default-disabled.
   * It emits only after canonical M01 qualification and server-owned W-01...W-05 resolution.
   */
  async emit(rawInput: unknown): Promise<UyapOfficialStructuredEmissionResult> {
    if (!isStructuredEmissionEnabled()) return fail('FEATURE_DISABLED');
    const input = parseInput(rawInput);
    if (!input) return fail('INVALID_INPUT');
    if (input.claimRelations.length === 0) return fail('EMPTY_CLAIM_SET');

    try {
      // Canonical authority first: no ClaimItem/wrapper read occurs unless every M01 relation passes.
      const m01Results = await Promise.all(
        input.claimRelations.map((relation) => this.m01Consumer.resolveClaimRelation(relation)),
      );
      const failedIndex = m01Results.findIndex((result) => !result.ok);
      if (failedIndex >= 0) {
        const failed = m01Results[failedIndex];
        if (failed.ok) return fail('AUTHORITY_UNAVAILABLE', failedIndex);
        return fail(failed.failure.code, failedIndex);
      }

      const projections = m01Results.map(
        (result) => (result as { readonly ok: true; readonly value: UyapM01LegalBasisConsumerProjection }).value,
      );
      const scopeFailure = validateProjectionScope(projections);
      if (scopeFailure) return fail(scopeFailure.code, scopeFailure.claimIndex);

      const records = await Promise.all(
        projections.map((projection) => this.claimEvidenceReader.readExactClaimEvidence(projection)),
      );

      const qualified: M01QualifiedOfficialAlacakKalemi[] = [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const projection = projections[index];
        if (!record) return fail('CLAIM_ITEM_NOT_FOUND', index);
        if (!evidenceMatchesProjection(record, projection)) {
          return fail('EVIDENCE_SCOPE_MISMATCH', index);
        }
        if (
          INTEREST_ITEM_TYPES.has(record.itemType) ||
          projection.componentCategory === 'INTEREST'
        ) {
          return fail('INTEREST_NOT_SUPPORTED', index);
        }

        const resolution = resolveOfficialAlacakKalemiWrapper({
          ...record.wrapperContext,
        });
        if (resolution.kind === 'AMBIGUOUS') return fail('WRAPPER_AMBIGUOUS', index);
        if (resolution.kind !== 'RESOLVED') return fail('WRAPPER_AUTHORITY_REQUIRED', index);

        const demandedAmount = exactMinorUnitDecimal(record.demandedAmount);
        if (!demandedAmount) return fail('MONEY_NOT_EXACT_MINOR_UNIT', index);

        const issued = createM01QualifiedOfficialAlacakKalemi({
          wrapper: resolution.wrapper,
          claim: {
            id: record.claimItemId,
            alacakKalemAdi: record.label ?? record.description ?? record.itemType,
            alacakKalemTutar: demandedAmount,
            tutarTur: record.currency,
          },
        });
        if (!issued) return fail('WRAPPER_AUTHORITY_REQUIRED', index);
        qualified.push(issued);
      }

      const officialInput = createM01QualifiedOfficialExchangeInput(
        { dosya: input.dosya, taraflar: [...input.taraflar] },
        qualified,
      );
      if (!officialInput) return fail('STRUCTURED_SERIALIZATION_REJECTED');
      const structured = serializeUyapExchangeCanonical(officialInput);
      if (structured.status === 'CODELIST_REJECTED') return fail('BASE_SERIALIZATION_REJECTED');
      if (structured.status === 'SHAPE_REJECTED') {
        return fail('STRUCTURED_SERIALIZATION_REJECTED');
      }
      if (structured.status === 'ENCODING_REJECTED') return fail('ENCODING_REJECTED');

      return {
        status: 'CANONICAL_BYTES',
        bytes: structured.bytes,
        xml: structured.xml,
        evidence: Object.freeze({
          encoding: 'ISO-8859-9',
          roundTripVerified: true,
          byteLength: structured.evidence.byteLength,
          encodedBytesSha256: structured.evidence.encodedBytesSha256,
          officialDtdValidated: false,
          officialCodelistConformance: 'REGISTRY_VALIDATED',
          claimCount: qualified.length,
          wrapperSequence: Object.freeze(qualified.map((claim) => claim.wrapper)),
          legalBasisResolutionHashes: Object.freeze(
            projections.map((projection) => projection.legalBasisResolutionHash),
          ),
        }),
      };
    } catch {
      return fail('AUTHORITY_UNAVAILABLE');
    }
  }
}

function evidenceMatchesProjection(
  evidence: UyapStructuredEmissionClaimEvidence,
  projection: UyapM01LegalBasisConsumerProjection,
): boolean {
  return (
    evidence.tenantId === projection.tenantId &&
    evidence.caseId === projection.caseId &&
    evidence.claimItemId === projection.claimItemId &&
    evidence.snapshotId === projection.snapshotId &&
    evidence.snapshotHash === projection.snapshotHash
  );
}

function isStructuredEmissionEnabled(): boolean {
  return process.env.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED === 'true';
}

function exactMinorUnitDecimal(value: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const magnitude = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  const minor = match[1] === '-' ? -magnitude : magnitude;
  const absolute = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? '-' : '';
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function parseInput(value: unknown): UyapOfficialStructuredEmissionRequest | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    return null;
  }
  if (!isRecord(value.dosya) || !Array.isArray(value.taraflar) || !Array.isArray(value.claimRelations)) {
    return null;
  }
  return value as unknown as UyapOfficialStructuredEmissionRequest;
}

function validateProjectionScope(
  projections: readonly UyapM01LegalBasisConsumerProjection[],
): { readonly code: 'DUPLICATE_CLAIM_RELATION' | 'SCOPE_MISMATCH'; readonly claimIndex: number } | null {
  const first = projections[0];
  const seen = new Set<string>();
  for (let index = 0; index < projections.length; index += 1) {
    const projection = projections[index];
    if (projection.tenantId !== first.tenantId || projection.caseId !== first.caseId) {
      return { code: 'SCOPE_MISMATCH', claimIndex: index };
    }
    const identity = `${projection.tenantId}\u0000${projection.caseId}\u0000${projection.claimItemId}`;
    if (seen.has(identity)) return { code: 'DUPLICATE_CLAIM_RELATION', claimIndex: index };
    seen.add(identity);
  }
  return null;
}

function fail(
  code: UyapOfficialStructuredEmissionFailureCode | UyapM01LegalBasisFailureCode,
  claimIndex?: number,
): UyapOfficialStructuredEmissionResult {
  return {
    status: 'REJECTED',
    failure: claimIndex === undefined ? { code } : { code, claimIndex },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
