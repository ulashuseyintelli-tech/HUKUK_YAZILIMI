import type {
  LegalApplicationComponentType,
  LegalApplicationPlanErrorCode,
} from '../../contracts';

export const REPRESENTATIVE_CORPUS_VERSION = 'RCV-REP-CORPUS/v1' as const;
export const REPRESENTATIVE_CORPUS_CHECKSUM_PREFIX =
  'rcv-representative-corpus:v1:sha256:' as const;

export type RepresentativeCorpusVersion = typeof REPRESENTATIVE_CORPUS_VERSION;

export type RepresentativeCorpusExpectation =
  | 'PLAN'
  | 'SNAPSHOT_REJECTION';

export type RepresentativeCorpusFutureObligation =
  | 'NONE'
  | 'FULL_REVERSAL_EXACT_INVERSE_TPA04E'
  | 'WRITER_REPLAY_NO_NEW_EFFECT_TPA04F'
  | 'WRITER_SEMANTIC_CONFLICT_TPA04F'
  | 'WRITER_CONCURRENCY_SINGLE_WINNER_TPA04F';

export interface RepresentativeCorpusSourceSeed {
  readonly sourceReference: string;
  readonly sourceVersion: string;
}

export interface RepresentativeCorpusBucketSeed {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: string;
  readonly balanceMinor: string;
  readonly priorityRank: number;
  readonly legalBasisRef: string;
  readonly effectivePeriodRef: string;
  readonly interestRuleRef?: string;
}

export interface RepresentativeCorpusScenarioSeed {
  readonly scenarioId: string;
  readonly title: string;
  readonly purpose: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly collectionId: string;
  readonly currency: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
  readonly minorUnit: number;
  readonly receiptAmountMinor: string;
  readonly snapshotAsOfDate: string;
  readonly applicationEffectiveDate: string;
  readonly historyBoundaryRef: string;
  readonly sources: readonly RepresentativeCorpusSourceSeed[];
  readonly buckets: readonly RepresentativeCorpusBucketSeed[];
  readonly envelopeMode: 'CANONICAL' | 'ABSENT';
  readonly commandTenantId?: string;
  readonly commandCurrency?: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
  readonly expectedOutcome: RepresentativeCorpusExpectation;
  readonly expectedErrorCode?: LegalApplicationPlanErrorCode;
  readonly futureObligation: RepresentativeCorpusFutureObligation;
}

export interface RepresentativeCorpusApplicationEvidence {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: string;
  readonly bucketContextKey: string;
  readonly bucketInstanceId: string;
  readonly priorityRank: number;
  readonly sequence: number;
  readonly bucketBeforeMinor: string;
  readonly appliedAmountMinor: string;
  readonly bucketAfterMinor: string;
}

export interface RepresentativeCorpusPlanEvidence {
  readonly kind: 'PLAN';
  readonly planFingerprint: string;
  readonly receiptAmountMinor: string;
  readonly appliedAmountMinor: string;
  readonly heldRemainderMinor: string;
  readonly heldReason?:
    | 'NO_ELIGIBLE_OUTSTANDING'
    | 'EXCESS_OVER_ELIGIBLE_OUTSTANDING';
  readonly applications: readonly RepresentativeCorpusApplicationEvidence[];
}

export interface RepresentativeCorpusRejectionEvidence {
  readonly kind: 'SNAPSHOT_REJECTION';
  readonly errorCode: LegalApplicationPlanErrorCode;
}

export type RepresentativeCorpusOutcomeEvidence =
  | RepresentativeCorpusPlanEvidence
  | RepresentativeCorpusRejectionEvidence;

export interface RepresentativeCorpusScenarioEvidence {
  readonly scenarioId: string;
  readonly title: string;
  readonly purpose: string;
  readonly corpusVersion: RepresentativeCorpusVersion;
  readonly input: {
    readonly tenantId: string;
    readonly caseId: string;
    readonly collectionId: string;
    readonly currency: string;
    readonly minorUnit: number;
    readonly receiptAmountMinor: string;
    readonly applicationEffectiveDate: string;
    readonly snapshotRef: string;
    readonly snapshotHash: string;
    readonly snapshotCanonicalPayload: string;
    readonly idempotencyKey: string;
    readonly commandHash: string;
    readonly envelopeMode: 'CANONICAL' | 'ABSENT';
  };
  readonly outcome: RepresentativeCorpusOutcomeEvidence;
  readonly futureObligation: RepresentativeCorpusFutureObligation;
}

export interface RepresentativeCorpusArtifact {
  readonly corpusVersion: RepresentativeCorpusVersion;
  readonly sourceSnapshotContract: 'CanonicalReceivableApplicationSnapshotV1';
  readonly targetPlanContract: 'LegalApplicationPlan';
  readonly authorityMode: 'TEST_EVIDENCE_ONLY';
  readonly scenarios: readonly RepresentativeCorpusScenarioEvidence[];
  readonly acceptanceMatrix: Readonly<Record<string, readonly string[]>>;
  readonly legacyDisposition: readonly {
    readonly surface: string;
    readonly disposition: string;
    readonly authority: 'PROHIBITED';
  }[];
  readonly task11InputContract: {
    readonly requiredCorpusVersion: RepresentativeCorpusVersion;
    readonly requiredScenarioCount: number;
    readonly requiredChecksumAlgorithm: 'SHA-256';
    readonly requiredChecksumDomain: RepresentativeCorpusVersion;
    readonly runtimeAuthority: 'NONE';
  };
}

export interface GeneratedRepresentativeCorpus {
  readonly artifact: RepresentativeCorpusArtifact;
  readonly canonicalPayload: string;
  readonly checksum: string;
  readonly checksumRef: string;
}

export interface GoldenScenarioVector {
  readonly scenarioId: string;
  readonly outcome: 'PLAN' | LegalApplicationPlanErrorCode;
  readonly appliedAmountMinor?: string;
  readonly heldRemainderMinor?: string;
  readonly heldReason?:
    | 'NO_ELIGIBLE_OUTSTANDING'
    | 'EXCESS_OVER_ELIGIBLE_OUTSTANDING';
  readonly applications?: readonly {
    readonly componentType: LegalApplicationComponentType;
    readonly appliedAmountMinor: string;
    readonly bucketAfterMinor: string;
  }[];
}
