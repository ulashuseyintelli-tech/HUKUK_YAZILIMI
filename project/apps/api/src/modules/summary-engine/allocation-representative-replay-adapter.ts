import { createHash } from 'node:crypto';
import type {
  Adr014LocalReadOnlyRepresentativeRunner,
  Adr014RepresentativeEvidenceReader,
  Adr014RepresentativeExecutionContext,
  Adr014RepresentativeLocalSource,
  Adr014RepresentativeObservation,
  Adr014RepresentativeReadOnlyQueryPort,
  Adr014RepresentativeReadResult,
  Adr014RepresentativeRunnerConfig,
  Adr014RepresentativeStopSignal,
} from '../../scripts/adr014-local-read-only-representative-runner';
import {
  createAdr014LocalReadOnlyRepresentativeRunner,
} from '../../scripts/adr014-local-read-only-representative-runner';
import {
  type AllocationComparisonResult,
  type AllocationComparisonRow,
  buildAllocationComparisonContext,
  classifyAllocationComparison,
} from './allocation-drift-baseline';
import {
  ALLOCATION_EVIDENCE_CONTRACT_VERSION,
  COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1,
  type AllocationEvidenceVectorRow,
  type AllocationFrozenInputV1,
  type FrozenAllocationEvidenceVector,
  buildAllocationFrozenInputFingerprint,
  classifyFrozenAllocationParity,
} from './allocation-evidence-qualification';

export const ALLOCATION_REPRESENTATIVE_REPLAY_CONTRACT_VERSION =
  'RCV-WS04-P03-V1' as const;
export const ALLOCATION_REPRESENTATIVE_DATASET_CONTRACT_VERSION =
  'RCV-WS04-P03-DATASET-V1' as const;
export const ALLOCATION_REPRESENTATIVE_REPLAY_DEFAULT_MODE = 'DISABLED' as const;

export type AllocationRepresentativeReplayMode =
  | 'DISABLED'
  | 'TEST_ONLY'
  | 'OWNER_AUTHORIZED_LOCAL';

export type AllocationRepresentativeDatasetSource =
  | 'SYNTHETIC_FIXTURE'
  | 'DISPOSABLE_POSTGRESQL'
  | 'REPRESENTATIVE';

export type AllocationRepresentativeReplayBlockerCode =
  | 'ADAPTER_DISABLED'
  | 'INVALID_DATASET_MANIFEST'
  | 'DATASET_MANIFEST_CHECKSUM_MISMATCH'
  | 'DATASET_SOURCE_NOT_ALLOWED_FOR_MODE'
  | 'DATA_ACCESS_NOT_AUTHORIZED'
  | 'EVIDENCE_EXECUTION_NOT_AUTHORIZED'
  | 'PRODUCTION_OBSERVATION_FORBIDDEN'
  | 'READ_ONLY_BOUNDARY_REQUIRED'
  | 'NO_EGRESS_BOUNDARY_REQUIRED'
  | 'SOURCE_PAYLOAD_INVALID'
  | 'SOURCE_SELECTION_DUPLICATE'
  | 'SOURCE_SELECTION_NOT_MANIFESTED'
  | 'PII_SAFE_OUTPUT_VIOLATION'
  | 'ABORT_REQUESTED';

export interface AllocationRepresentativeDatasetManifestV1 {
  readonly contractVersion: typeof ALLOCATION_REPRESENTATIVE_DATASET_CONTRACT_VERSION;
  readonly manifestStatus: 'TEST_FIXTURE' | 'OWNER_APPROVED';
  readonly sourceClassification: AllocationRepresentativeDatasetSource;
  readonly selectionShape: 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT';
  readonly privacyBoundary: 'PII_SAFE_REFERENCES_ONLY';
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly datasetVersion: string;
  readonly selectionUniverseReference: string;
  readonly selectionMethodReference: string;
  readonly distributionalBaseReference: string;
  readonly edgeCaseSupplementReference: string;
  readonly selectionSetReference: string;
  readonly recordCountReference: string;
  readonly ownerReference: string;
  readonly reviewReference: string;
  readonly supersedesManifestReference: string | null;
  readonly approvedAt: string | null;
  readonly selectionReferences: readonly string[];
  readonly checksum: string;
}

export interface AllocationRepresentativeExecutionGateV1 {
  readonly mode: AllocationRepresentativeReplayMode;
  readonly dataAccess: 'AUTHORIZED' | 'NOT_AUTHORIZED';
  readonly evidenceExecution: 'AUTHORIZED' | 'NOT_AUTHORIZED';
  readonly productionObservation: 'NOT_AUTHORIZED';
  readonly sourceAccess: 'READ_ONLY';
  readonly networkBoundary: 'NO_EGRESS';
}

export interface AllocationRepresentativeReplaySourceRowV1 {
  readonly selectionReference: string;
  readonly comparisonContext:
    | 'COMPLETE'
    | 'PERSISTED_LEGAL_ALLOCATION_ABSENT';
  readonly frozenInput: AllocationFrozenInputV1;
  readonly persistedLegalAllocation: FrozenAllocationEvidenceVector;
  readonly runtimeAllocation: FrozenAllocationEvidenceVector;
  readonly collectedAmountCache: readonly AllocationEvidenceVectorRow[];
  readonly collectionAllocationProjection: readonly AllocationEvidenceVectorRow[];
  readonly heldOverpayment: readonly AllocationEvidenceVectorRow[];
  readonly legacyAllocatorActivated: boolean;
  readonly collectionAllocationFallback:
    | 'NONE'
    | 'WITHOUT_LEDGER'
    | 'WHILE_LEDGER_PRESENT';
}

export interface AllocationRepresentativeReplayRowProvider {
  readRows(
    queryPort: Adr014RepresentativeReadOnlyQueryPort,
    datasetManifest: Readonly<AllocationRepresentativeDatasetManifestV1>,
    context: Readonly<Adr014RepresentativeExecutionContext>,
    stopSignal: Adr014RepresentativeStopSignal,
  ): Promise<readonly AllocationRepresentativeReplaySourceRowV1[]>;
}

export interface AllocationRepresentativeReplaySafeRecordV1 {
  readonly observationReference: string;
  readonly sourceReference: string;
  readonly frozenInputFingerprint: string;
  readonly persistedRuntime: AllocationComparisonResult['classification'];
  readonly collectedAmountCache: AllocationComparisonResult['classification'];
  readonly collectionAllocationProjection: AllocationComparisonResult['classification'];
  readonly legacyAllocatorActivation: 'NOT_OBSERVED' | 'OBSERVED';
  readonly collectionAllocationFallback:
    | 'NONE'
    | 'WITHOUT_LEDGER'
    | 'WHILE_LEDGER_PRESENT';
  readonly vectorChecksums: Readonly<{
    persistedLegalAllocation: string;
    runtimeAllocation: string;
    collectedAmountCache: string;
    collectionAllocationProjection: string;
    heldOverpayment: string;
  }>;
  readonly recordChecksum: string;
}

export interface AllocationRepresentativeReplayEvidenceManifestV1 {
  readonly contractVersion: typeof ALLOCATION_REPRESENTATIVE_REPLAY_CONTRACT_VERSION;
  readonly taskId: 'RCV-P2-WS04-P03';
  readonly p02ContractVersion: typeof ALLOCATION_EVIDENCE_CONTRACT_VERSION;
  readonly status: 'CAPTURED_NOT_ACCEPTED';
  readonly authority: 'NONE';
  readonly representativeEvidenceAccepted: false;
  readonly productionObservation: 'NOT_AUTHORIZED';
  readonly source: 'LOCAL_ONLY';
  readonly sourceAccess: 'READ_ONLY';
  readonly transaction: 'REPEATABLE_READ_READ_ONLY';
  readonly network: 'NO_EGRESS';
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly accessAuthorizationReference: string;
  readonly executionAuthorizationReference: string;
  readonly executionPlanReference: string;
  readonly datasetManifestChecksum: string;
  readonly consumerManifestChecksum: string;
  readonly recordCount: number;
  readonly resultCounts: Readonly<Record<
    AllocationComparisonResult['classification'],
    number
  >>;
  readonly records: readonly AllocationRepresentativeReplaySafeRecordV1[];
  readonly checksum: string;
}

export interface AllocationRepresentativeReplayQualification {
  readonly evidenceManifest: AllocationRepresentativeReplayEvidenceManifestV1;
  readonly readResult: Adr014RepresentativeReadResult;
}

export interface AllocationRepresentativeReplayReadiness {
  readonly status: 'READY' | 'DISABLED' | 'BLOCKED';
  readonly blockerCodes: readonly AllocationRepresentativeReplayBlockerCode[];
}

export class AllocationRepresentativeReplayError extends Error {
  constructor(
    readonly blockerCodes: readonly AllocationRepresentativeReplayBlockerCode[],
  ) {
    super(`RCV_WS04_P03_BLOCKED:${blockerCodes.join(',')}`);
    this.name = 'AllocationRepresentativeReplayError';
  }
}

export type AllocationRepresentativeConsumerClass =
  | 'RECONCILED_CACHE'
  | 'COMPATIBILITY'
  | 'DISPLAY_ONLY'
  | 'API_CONTRACT'
  | 'NEGATIVE_REFERENCE'
  | 'OUTSIDE_CLAIM_ITEM_CACHE';

export const ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1 = Object.freeze([
  ...COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1.map((entry) => Object.freeze({
    surface: 'BACKEND' as const,
    path: `apps/api/${entry.path}`,
    classification: entry.classification as AllocationRepresentativeConsumerClass,
    access: entry.access,
  })),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/lib/api.ts',
    classification: 'API_CONTRACT' as const,
    access: 'DECLARATION' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/case-detail/MiniFinanceWidget.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/case-detail/OperationalRow.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/case/case-comparison-summary.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/case/case-summary-report.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/claim-item/ClaimItemPanel.tsx',
    classification: 'NEGATIVE_REFERENCE' as const,
    access: 'NEGATIVE_REFERENCE' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/dashboard/case-stat-cards.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/dashboard/collection-target-tracker.tsx',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE' as const,
    access: 'NON_CLAIM_ITEM' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/dashboard/collection-target.tsx',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE' as const,
    access: 'NON_CLAIM_ITEM' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/reports/case-comparison-chart.tsx',
    classification: 'DISPLAY_ONLY' as const,
    access: 'READ' as const,
  }),
  Object.freeze({
    surface: 'WEB' as const,
    path: 'apps/web/src/components/reports/custom-report-builder.tsx',
    classification: 'API_CONTRACT' as const,
    access: 'DECLARATION' as const,
  }),
] as const);

export const ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_CHECKSUM =
  sha256(canonicalize(ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1));

const FULL_SHA = /^[0-9a-f]{40}$/;
const OPAQUE_REFERENCE =
  /^(?:adr014-ref:v1:[a-z0-9-]+:[0-9a-f]{32}|rcv-ws04-p03-ref:v1:[a-z0-9-]+:[0-9a-f]{64})$/;
const SELECTION_REFERENCE = /^rcv-ws04-p03-record:v1:[0-9a-f]{64}$/;
const FORBIDDEN_OUTPUT_KEY =
  /^(?:tenantId|caseId|paymentId|claimItemId|currency|metadata|payload|name|email|phone|address|nationalId|identityNumber|freeText|.*AmountMinor)$/i;
const RAW_IDENTIFIER_VALUE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\d{11})$/i;

export function buildAllocationRepresentativeDatasetManifest(
  input: Omit<AllocationRepresentativeDatasetManifestV1, 'checksum'>,
): AllocationRepresentativeDatasetManifestV1 {
  const body = normalizeDatasetManifestBody(input);
  return Object.freeze({
    ...body,
    checksum: sha256(canonicalize(body)),
  });
}

export function validateAllocationRepresentativeReplayReadiness(
  datasetManifest: Readonly<AllocationRepresentativeDatasetManifestV1>,
  gate: Readonly<AllocationRepresentativeExecutionGateV1>,
): AllocationRepresentativeReplayReadiness {
  const blockers: AllocationRepresentativeReplayBlockerCode[] = [];
  if (gate.mode === 'DISABLED') blockers.push('ADAPTER_DISABLED');
  if (gate.sourceAccess !== 'READ_ONLY') blockers.push('READ_ONLY_BOUNDARY_REQUIRED');
  if (gate.networkBoundary !== 'NO_EGRESS') blockers.push('NO_EGRESS_BOUNDARY_REQUIRED');
  if (gate.productionObservation !== 'NOT_AUTHORIZED') {
    blockers.push('PRODUCTION_OBSERVATION_FORBIDDEN');
  }

  let normalized: Omit<AllocationRepresentativeDatasetManifestV1, 'checksum'> | undefined;
  try {
    normalized = normalizeDatasetManifestBody(datasetManifest);
  } catch (_error) {
    blockers.push('INVALID_DATASET_MANIFEST');
  }
  if (normalized && sha256(canonicalize(normalized)) !== datasetManifest.checksum) {
    blockers.push('DATASET_MANIFEST_CHECKSUM_MISMATCH');
  }

  if (gate.mode === 'TEST_ONLY') {
    if (
      datasetManifest.sourceClassification !== 'SYNTHETIC_FIXTURE' &&
      datasetManifest.sourceClassification !== 'DISPOSABLE_POSTGRESQL'
    ) {
      blockers.push('DATASET_SOURCE_NOT_ALLOWED_FOR_MODE');
    }
  }
  if (gate.mode === 'OWNER_AUTHORIZED_LOCAL') {
    if (
      datasetManifest.sourceClassification !== 'REPRESENTATIVE' ||
      datasetManifest.manifestStatus !== 'OWNER_APPROVED'
    ) {
      blockers.push('DATASET_SOURCE_NOT_ALLOWED_FOR_MODE');
    }
    if (gate.dataAccess !== 'AUTHORIZED') blockers.push('DATA_ACCESS_NOT_AUTHORIZED');
    if (gate.evidenceExecution !== 'AUTHORIZED') {
      blockers.push('EVIDENCE_EXECUTION_NOT_AUTHORIZED');
    }
  }

  const unique = [...new Set(blockers)];
  return Object.freeze({
    status: unique.length === 0
      ? 'READY'
      : unique.length === 1 && unique[0] === 'ADAPTER_DISABLED'
        ? 'DISABLED'
        : 'BLOCKED',
    blockerCodes: Object.freeze(unique),
  });
}

export function mapAllocationRepresentativeSourceRow(
  row: Readonly<AllocationRepresentativeReplaySourceRowV1>,
): Readonly<{
  frozenInput: AllocationFrozenInputV1;
  frozenInputFingerprint: string;
  persistedLegalAllocation: FrozenAllocationEvidenceVector;
  runtimeAllocation: FrozenAllocationEvidenceVector;
  collectedAmountCache: readonly AllocationEvidenceVectorRow[];
  collectionAllocationProjection: readonly AllocationEvidenceVectorRow[];
  heldOverpayment: readonly AllocationEvidenceVectorRow[];
}> {
  if (!SELECTION_REFERENCE.test(row.selectionReference)) {
    throw new AllocationRepresentativeReplayError(['SOURCE_PAYLOAD_INVALID']);
  }
  const frozenInputFingerprint = buildAllocationFrozenInputFingerprint(row.frozenInput);
  if (row.persistedLegalAllocation.fingerprint !== frozenInputFingerprint) {
    throw new AllocationRepresentativeReplayError(['SOURCE_PAYLOAD_INVALID']);
  }
  if (
    row.comparisonContext === 'PERSISTED_LEGAL_ALLOCATION_ABSENT' &&
    row.persistedLegalAllocation.rows.length > 0
  ) {
    throw new AllocationRepresentativeReplayError(['SOURCE_PAYLOAD_INVALID']);
  }
  if (
    row.collectionAllocationFallback === 'WITHOUT_LEDGER' &&
    row.comparisonContext !== 'PERSISTED_LEGAL_ALLOCATION_ABSENT'
  ) {
    throw new AllocationRepresentativeReplayError(['SOURCE_PAYLOAD_INVALID']);
  }
  for (const rows of [
    row.persistedLegalAllocation.rows,
    row.runtimeAllocation.rows,
    row.collectedAmountCache,
    row.collectionAllocationProjection,
    row.heldOverpayment,
  ]) {
    assertVectorRows(rows);
  }
  return Object.freeze({
    frozenInput: row.frozenInput,
    frozenInputFingerprint,
    persistedLegalAllocation: row.persistedLegalAllocation,
    runtimeAllocation: row.runtimeAllocation,
    collectedAmountCache: Object.freeze([...row.collectedAmountCache]),
    collectionAllocationProjection: Object.freeze([
      ...row.collectionAllocationProjection,
    ]),
    heldOverpayment: Object.freeze([...row.heldOverpayment]),
  });
}

export function qualifyAllocationRepresentativeRows(
  input: Readonly<{
    rows: readonly AllocationRepresentativeReplaySourceRowV1[];
    datasetManifest: AllocationRepresentativeDatasetManifestV1;
    context: Adr014RepresentativeExecutionContext;
  }>,
): AllocationRepresentativeReplayQualification {
  const selectionUniverse = new Set(input.datasetManifest.selectionReferences);
  const seen = new Set<string>();
  const records = input.rows.map((row) => {
    if (seen.has(row.selectionReference)) {
      throw new AllocationRepresentativeReplayError(['SOURCE_SELECTION_DUPLICATE']);
    }
    seen.add(row.selectionReference);
    if (!selectionUniverse.has(row.selectionReference)) {
      throw new AllocationRepresentativeReplayError(['SOURCE_SELECTION_NOT_MANIFESTED']);
    }
    const mapped = mapAllocationRepresentativeSourceRow(row);
    const persistedRuntime = classifyFrozenAllocationParity({
      tenantId: mapped.frozenInput.tenantId,
      caseId: mapped.frozenInput.caseId,
      currency: mapped.frozenInput.currency,
      canonical: mapped.persistedLegalAllocation,
      candidate: row.comparisonContext === 'PERSISTED_LEGAL_ALLOCATION_ABSENT'
        ? { ...mapped.runtimeAllocation, fingerprint: null }
        : mapped.runtimeAllocation,
      allowedDivergence: toComparisonRows(mapped.heldOverpayment),
    });
    const comparisonContext = buildAllocationComparisonContext({
      tenantId: mapped.frozenInput.tenantId,
      caseId: mapped.frozenInput.caseId,
      currency: mapped.frozenInput.currency,
      frozenInputId: mapped.frozenInputFingerprint,
    });
    const candidateContext = row.comparisonContext ===
      'PERSISTED_LEGAL_ALLOCATION_ABSENT'
      ? { ...comparisonContext, frozenInputId: undefined }
      : comparisonContext;
    const collectedAmountCache = classifyAllocationComparison({
      canonical: toClaimComparisonRows(mapped.persistedLegalAllocation.rows),
      candidate: toClaimComparisonRows(mapped.collectedAmountCache),
      canonicalContext: comparisonContext,
      candidateContext,
    });
    const collectionAllocationProjection = classifyAllocationComparison({
      canonical: toBucketComparisonRows(mapped.persistedLegalAllocation.rows),
      candidate: toBucketComparisonRows(mapped.collectionAllocationProjection),
      allowedDivergence: toBucketComparisonRows(mapped.heldOverpayment),
      canonicalContext: comparisonContext,
      candidateContext,
    });
    return safeRecord({
      row,
      mapped,
      persistedRuntime,
      collectedAmountCache,
      collectionAllocationProjection,
    });
  }).sort((left, right) =>
    left.observationReference.localeCompare(right.observationReference));

  const resultCounts = Object.freeze({
    EQUALITY: records.filter((record) => recordResult(record) === 'EQUALITY').length,
    ALLOWED_DIVERGENCE: records.filter(
      (record) => recordResult(record) === 'ALLOWED_DIVERGENCE',
    ).length,
    NOT_COMPARABLE: records.filter(
      (record) => recordResult(record) === 'NOT_COMPARABLE',
    ).length,
    FAIL_CLOSED_DRIFT: records.filter(
      (record) => recordResult(record) === 'FAIL_CLOSED_DRIFT',
    ).length,
  });
  const body = {
    contractVersion: ALLOCATION_REPRESENTATIVE_REPLAY_CONTRACT_VERSION,
    taskId: 'RCV-P2-WS04-P03' as const,
    p02ContractVersion: ALLOCATION_EVIDENCE_CONTRACT_VERSION,
    status: 'CAPTURED_NOT_ACCEPTED' as const,
    authority: 'NONE' as const,
    representativeEvidenceAccepted: false as const,
    productionObservation: 'NOT_AUTHORIZED' as const,
    source: 'LOCAL_ONLY' as const,
    sourceAccess: 'READ_ONLY' as const,
    transaction: 'REPEATABLE_READ_READ_ONLY' as const,
    network: 'NO_EGRESS' as const,
    canonicalSha: input.context.canonicalSha,
    environmentReference: input.context.environmentReference,
    sessionReference: input.context.sessionReference,
    manifestReference: input.context.manifestReference,
    accessAuthorizationReference: input.context.accessAuthorizationReference,
    executionAuthorizationReference: input.context.executionAuthorizationReference,
    executionPlanReference: input.context.executionPlanReference,
    datasetManifestChecksum: input.datasetManifest.checksum,
    consumerManifestChecksum: ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_CHECKSUM,
    recordCount: records.length,
    resultCounts,
    records: Object.freeze(records),
  };
  assertPiiSafeAllocationReplayOutput(body);
  const evidenceManifest = Object.freeze({
    ...body,
    checksum: sha256(canonicalize(body)),
  });
  const observations = Object.freeze(records.map(toObservation));
  return Object.freeze({
    evidenceManifest,
    readResult: Object.freeze({ observations }),
  });
}

export function createAllocationRepresentativeReplayReader(
  provider: AllocationRepresentativeReplayRowProvider,
  datasetManifest: Readonly<AllocationRepresentativeDatasetManifestV1>,
  gate: Readonly<AllocationRepresentativeExecutionGateV1> = Object.freeze({
    mode: ALLOCATION_REPRESENTATIVE_REPLAY_DEFAULT_MODE,
    dataAccess: 'NOT_AUTHORIZED',
    evidenceExecution: 'NOT_AUTHORIZED',
    productionObservation: 'NOT_AUTHORIZED',
    sourceAccess: 'READ_ONLY',
    networkBoundary: 'NO_EGRESS',
  }),
): Adr014RepresentativeEvidenceReader {
  return Object.freeze({
    async read(
      queryPort: Adr014RepresentativeReadOnlyQueryPort,
      context: Readonly<Adr014RepresentativeExecutionContext>,
      stopSignal: Adr014RepresentativeStopSignal,
    ): Promise<Adr014RepresentativeReadResult> {
      const readiness = validateAllocationRepresentativeReplayReadiness(
        datasetManifest,
        gate,
      );
      if (readiness.status !== 'READY') {
        throw new AllocationRepresentativeReplayError(readiness.blockerCodes);
      }
      if (stopSignal.isAbortRequested()) {
        throw new AllocationRepresentativeReplayError(['ABORT_REQUESTED']);
      }
      const rows = await provider.readRows(
        queryPort,
        datasetManifest,
        context,
        stopSignal,
      );
      if (stopSignal.isAbortRequested()) {
        throw new AllocationRepresentativeReplayError(['ABORT_REQUESTED']);
      }
      return qualifyAllocationRepresentativeRows({
        rows,
        datasetManifest,
        context,
      }).readResult;
    },
  });
}

export function createAllocationRepresentativeReplayRunner(
  source: Adr014RepresentativeLocalSource,
  provider: AllocationRepresentativeReplayRowProvider,
  datasetManifest: Readonly<AllocationRepresentativeDatasetManifestV1>,
  config?: Readonly<Adr014RepresentativeRunnerConfig>,
  gate?: Readonly<AllocationRepresentativeExecutionGateV1>,
): Adr014LocalReadOnlyRepresentativeRunner {
  const reader = createAllocationRepresentativeReplayReader(
    provider,
    datasetManifest,
    gate,
  );
  return config === undefined
    ? createAdr014LocalReadOnlyRepresentativeRunner(source, reader)
    : createAdr014LocalReadOnlyRepresentativeRunner(source, reader, config);
}

export function assertPiiSafeAllocationReplayOutput(value: unknown): void {
  const violations: string[] = [];
  inspectSafeOutput(value, '$', violations);
  if (violations.length > 0) {
    throw new AllocationRepresentativeReplayError(['PII_SAFE_OUTPUT_VIOLATION']);
  }
}

function safeRecord(input: Readonly<{
  row: AllocationRepresentativeReplaySourceRowV1;
  mapped: ReturnType<typeof mapAllocationRepresentativeSourceRow>;
  persistedRuntime: AllocationComparisonResult;
  collectedAmountCache: AllocationComparisonResult;
  collectionAllocationProjection: AllocationComparisonResult;
}>): AllocationRepresentativeReplaySafeRecordV1 {
  const vectorChecksums = Object.freeze({
    persistedLegalAllocation: checksumRows(input.mapped.persistedLegalAllocation.rows),
    runtimeAllocation: checksumRows(input.mapped.runtimeAllocation.rows),
    collectedAmountCache: checksumRows(input.mapped.collectedAmountCache),
    collectionAllocationProjection: checksumRows(
      input.mapped.collectionAllocationProjection,
    ),
    heldOverpayment: checksumRows(input.mapped.heldOverpayment),
  });
  const body = {
    observationReference: `adr014-observation:v1:${sha256(canonicalize({
      selectionReference: input.row.selectionReference,
      frozenInputFingerprint: input.mapped.frozenInputFingerprint,
      vectorChecksums,
    }))}`,
    sourceReference: input.row.selectionReference,
    frozenInputFingerprint: input.mapped.frozenInputFingerprint,
    persistedRuntime: input.persistedRuntime.classification,
    collectedAmountCache: input.collectedAmountCache.classification,
    collectionAllocationProjection: input.collectionAllocationProjection.classification,
    legacyAllocatorActivation: input.row.legacyAllocatorActivated
      ? 'OBSERVED' as const
      : 'NOT_OBSERVED' as const,
    collectionAllocationFallback: input.row.collectionAllocationFallback,
    vectorChecksums,
  };
  return Object.freeze({
    ...body,
    recordChecksum: sha256(canonicalize(body)),
  });
}

function recordResult(
  record: AllocationRepresentativeReplaySafeRecordV1,
): AllocationComparisonResult['classification'] {
  if (
    record.legacyAllocatorActivation === 'OBSERVED' ||
    record.collectionAllocationFallback === 'WHILE_LEDGER_PRESENT' ||
    [
      record.persistedRuntime,
      record.collectedAmountCache,
      record.collectionAllocationProjection,
    ].includes('FAIL_CLOSED_DRIFT')
  ) {
    return 'FAIL_CLOSED_DRIFT';
  }
  if (
    [
      record.persistedRuntime,
      record.collectedAmountCache,
      record.collectionAllocationProjection,
    ].includes('NOT_COMPARABLE')
  ) {
    return 'NOT_COMPARABLE';
  }
  if (
    [
      record.persistedRuntime,
      record.collectedAmountCache,
      record.collectionAllocationProjection,
    ].includes('ALLOWED_DIVERGENCE')
  ) {
    return 'ALLOWED_DIVERGENCE';
  }
  return 'EQUALITY';
}

function toObservation(
  record: AllocationRepresentativeReplaySafeRecordV1,
): Adr014RepresentativeObservation {
  const result = recordResult(record);
  return Object.freeze({
    observationReference: record.observationReference,
    result: result === 'FAIL_CLOSED_DRIFT'
      ? 'NON_ZERO_FINANCIAL_DIFFERENCE'
      : result === 'NOT_COMPARABLE'
        ? 'NOT_COMPARABLE'
        : 'MATCH',
    primaryDisplaySafety: result === 'FAIL_CLOSED_DRIFT'
      ? 'UNSAFE'
      : result === 'NOT_COMPARABLE'
        ? 'NOT_EVALUATED'
        : 'SAFE',
  });
}

function normalizeDatasetManifestBody(
  input: Omit<AllocationRepresentativeDatasetManifestV1, 'checksum'> |
    AllocationRepresentativeDatasetManifestV1,
): Omit<AllocationRepresentativeDatasetManifestV1, 'checksum'> {
  if (input.contractVersion !== ALLOCATION_REPRESENTATIVE_DATASET_CONTRACT_VERSION) {
    throw new Error('DATASET_CONTRACT_VERSION_MISMATCH');
  }
  if (!FULL_SHA.test(input.canonicalSha)) throw new Error('CANONICAL_SHA_INVALID');
  if (
    !['TEST_FIXTURE', 'OWNER_APPROVED'].includes(input.manifestStatus) ||
    !['SYNTHETIC_FIXTURE', 'DISPOSABLE_POSTGRESQL', 'REPRESENTATIVE']
      .includes(input.sourceClassification)
  ) {
    throw new Error('DATASET_CLASSIFICATION_INVALID');
  }
  if (
    input.selectionShape !== 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT' ||
    input.privacyBoundary !== 'PII_SAFE_REFERENCES_ONLY'
  ) {
    throw new Error('DATASET_BOUNDARY_INVALID');
  }
  const references = [
    input.environmentReference,
    input.sessionReference,
    input.manifestReference,
    input.selectionUniverseReference,
    input.selectionMethodReference,
    input.distributionalBaseReference,
    input.edgeCaseSupplementReference,
    input.selectionSetReference,
    input.recordCountReference,
    input.ownerReference,
    input.reviewReference,
  ];
  if (!references.every((reference) => OPAQUE_REFERENCE.test(reference))) {
    throw new Error('DATASET_REFERENCE_INVALID');
  }
  if (
    input.supersedesManifestReference !== null &&
    !OPAQUE_REFERENCE.test(input.supersedesManifestReference)
  ) {
    throw new Error('DATASET_SUPERSESSION_REFERENCE_INVALID');
  }
  if (!input.datasetVersion.trim()) throw new Error('DATASET_VERSION_REQUIRED');
  if (
    input.manifestStatus === 'OWNER_APPROVED' &&
    input.approvedAt === null
  ) {
    throw new Error('DATASET_APPROVAL_TIMESTAMP_REQUIRED');
  }
  const approvedAt = input.approvedAt === null
    ? null
    : normalizeInstant(input.approvedAt);
  if (
    input.selectionReferences.length === 0 ||
    !input.selectionReferences.every((reference) =>
      SELECTION_REFERENCE.test(reference))
  ) {
    throw new Error('DATASET_SELECTION_REFERENCE_INVALID');
  }
  const selectionReferences = [...input.selectionReferences].sort();
  if (new Set(selectionReferences).size !== selectionReferences.length) {
    throw new Error('DATASET_SELECTION_REFERENCE_DUPLICATE');
  }
  return Object.freeze({
    contractVersion: ALLOCATION_REPRESENTATIVE_DATASET_CONTRACT_VERSION,
    manifestStatus: input.manifestStatus,
    sourceClassification: input.sourceClassification,
    selectionShape: input.selectionShape,
    privacyBoundary: input.privacyBoundary,
    canonicalSha: input.canonicalSha,
    environmentReference: input.environmentReference,
    sessionReference: input.sessionReference,
    manifestReference: input.manifestReference,
    datasetVersion: input.datasetVersion.trim(),
    selectionUniverseReference: input.selectionUniverseReference,
    selectionMethodReference: input.selectionMethodReference,
    distributionalBaseReference: input.distributionalBaseReference,
    edgeCaseSupplementReference: input.edgeCaseSupplementReference,
    selectionSetReference: input.selectionSetReference,
    recordCountReference: input.recordCountReference,
    ownerReference: input.ownerReference,
    reviewReference: input.reviewReference,
    supersedesManifestReference: input.supersedesManifestReference,
    approvedAt,
    selectionReferences: Object.freeze(selectionReferences),
  });
}

function assertVectorRows(rows: readonly AllocationEvidenceVectorRow[]): void {
  for (const row of rows) {
    if (
      !row.claimItemId ||
      !row.legalBucket ||
      !Number.isInteger(row.allocationOrder) ||
      row.allocationOrder < 0 ||
      !/^-?\d+$/.test(row.amountMinor)
    ) {
      throw new AllocationRepresentativeReplayError(['SOURCE_PAYLOAD_INVALID']);
    }
  }
}

function toComparisonRows(
  rows: readonly AllocationEvidenceVectorRow[],
): AllocationComparisonRow[] {
  return rows.map((row) => ({
    key: `${row.allocationOrder}:${row.claimItemId}:${row.legalBucket}`,
    amount: Number(BigInt(row.amountMinor)) / 100,
  }));
}

function toClaimComparisonRows(
  rows: readonly AllocationEvidenceVectorRow[],
): AllocationComparisonRow[] {
  return rows.map((row) => ({
    key: row.claimItemId,
    amount: Number(BigInt(row.amountMinor)) / 100,
  }));
}

function toBucketComparisonRows(
  rows: readonly AllocationEvidenceVectorRow[],
): AllocationComparisonRow[] {
  return rows.map((row) => ({
    key: row.legalBucket,
    amount: Number(BigInt(row.amountMinor)) / 100,
  }));
}

function checksumRows(rows: readonly AllocationEvidenceVectorRow[]): string {
  const normalized = [...rows].sort((left, right) =>
    `${left.allocationOrder}:${left.claimItemId}:${left.legalBucket}`
      .localeCompare(`${right.allocationOrder}:${right.claimItemId}:${right.legalBucket}`));
  return sha256(canonicalize(normalized));
}

function inspectSafeOutput(value: unknown, path: string, violations: string[]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSafeOutput(entry, `${path}[${index}]`, violations));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_OUTPUT_KEY.test(key)) violations.push(`${path}.${key}`);
      inspectSafeOutput(entry, `${path}.${key}`, violations);
    }
    return;
  }
  if (typeof value === 'string' && RAW_IDENTIFIER_VALUE.test(value)) {
    violations.push(path);
  }
}

function normalizeInstant(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error('INVALID_INSTANT');
  return instant.toISOString();
}

function canonicalize(value: unknown): string {
  if (value === undefined) throw new Error('UNDEFINED_NOT_ALLOWED');
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
