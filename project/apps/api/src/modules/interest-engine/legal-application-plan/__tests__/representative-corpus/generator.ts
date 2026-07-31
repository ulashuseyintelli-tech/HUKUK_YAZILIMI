import { createHash } from 'node:crypto';
import {
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  allocateValidatedSnapshotForApply,
  assembleLegalApplicationPlan,
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseCurrencyCode,
  parseEffectiveDate,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceVersionSetHash,
  parseTenantId,
  validateCanonicalSnapshot,
  type BuildLegalApplicationPlanCommand,
  type ParseResult,
} from '../..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../../canonical-snapshot-serializer';
import type {
  StrictJsonObject,
  StrictJsonValue,
} from '../../strict-json-parser';
import {
  REPRESENTATIVE_CORPUS_CHECKSUM_PREFIX,
  REPRESENTATIVE_CORPUS_VERSION,
  type GeneratedRepresentativeCorpus,
  type RepresentativeCorpusArtifact,
  type RepresentativeCorpusScenarioEvidence,
  type RepresentativeCorpusScenarioSeed,
} from './contracts';
import { REPRESENTATIVE_CORPUS_SCENARIOS } from './scenario-manifest';

const CORPUS_SOURCE_SET_DOMAIN = 'RCV-REP-SOURCE-SET/v1';
const CORPUS_BUCKET_CONTEXT_DOMAIN = 'RCV-REP-BUCKET-CONTEXT/v1';
const CORPUS_BUCKET_INSTANCE_DOMAIN = 'RCV-REP-BUCKET-INSTANCE/v1';
const CORPUS_COMMAND_DOMAIN = 'RCV-REP-COMMAND/v1';

function domainSeparatedSha256(domain: string, payload: string): string {
  return createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(payload, 'utf8'))
    .digest('hex');
}

function canonicalizeCorpusJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new Error('Representative corpus JSON numbers must be safe integers.');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    if (value.normalize('NFC') !== value) {
      throw new Error('Representative corpus strings must be NFC-normalized.');
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeCorpusJson(entry)).join(',')}]`;
  }

  if (typeof value !== 'object' || value === undefined) {
    throw new Error('Representative corpus contains a non-JSON value.');
  }

  const objectValue = value as Readonly<Record<string, unknown>>;
  const entries = Object.keys(objectValue)
    .sort((left, right) => Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8')))
    .map((key) => `${JSON.stringify(key)}:${canonicalizeCorpusJson(objectValue[key])}`);
  return `{${entries.join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function mustParse<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }
  return result.value;
}

function fixtureDigest(domain: string, facts: readonly unknown[]): string {
  return domainSeparatedSha256(domain, canonicalizeCorpusJson(facts));
}

function buildSnapshot(seed: RepresentativeCorpusScenarioSeed): StrictJsonObject {
  const sourceVersionSet: readonly StrictJsonValue[] = seed.sources.map((source) => ({
    sourceReference: source.sourceReference,
    sourceVersion: source.sourceVersion,
  }));
  const sourceVersionSetHash = domainSeparatedSha256(
    CORPUS_SOURCE_SET_DOMAIN,
    canonicalizeCorpusJson(sourceVersionSet),
  );

  const canonicalBuckets: readonly StrictJsonValue[] = seed.buckets.map(
    (bucket, index) => {
      const bucketContextHash = fixtureDigest(CORPUS_BUCKET_CONTEXT_DOMAIN, [
        seed.scenarioId,
        bucket.componentType,
        bucket.componentCode,
        bucket.legalBasisRef,
        bucket.effectivePeriodRef,
        bucket.interestRuleRef ?? 'NONE',
        bucket.priorityRank,
        seed.currency,
        seed.minorUnit,
        index,
      ]);
      const bucketInstanceHash = fixtureDigest(CORPUS_BUCKET_INSTANCE_DOMAIN, [
        seed.scenarioId,
        seed.tenantId,
        seed.caseId,
        seed.collectionId,
        seed.snapshotAsOfDate,
        seed.historyBoundaryRef,
        bucketContextHash,
        index,
      ]);

      return {
        componentType: bucket.componentType,
        componentCode: bucket.componentCode,
        bucketContextKey: `bctx:v1:sha256:${bucketContextHash}`,
        bucketInstanceId: `binst:v1:sha256:${bucketInstanceHash}`,
        sourceLineageSetRef: `lineage:representative:${seed.scenarioId}:${index + 1}`,
        legalBasisRef: bucket.legalBasisRef,
        effectivePeriodRef: bucket.effectivePeriodRef,
        ...(bucket.interestRuleRef === undefined
          ? {}
          : { interestRuleRef: bucket.interestRuleRef }),
        currency: seed.currency,
        minorUnit: seed.minorUnit,
        priorityRank: bucket.priorityRank,
        bucketBalanceMinor: bucket.balanceMinor,
      };
    },
  );

  return {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: seed.tenantId,
    caseId: seed.caseId,
    targetCollectionId: seed.collectionId,
    currency: seed.currency,
    minorUnit: seed.minorUnit,
    receiptAmountMinor: seed.receiptAmountMinor,
    snapshotAsOfDate: seed.snapshotAsOfDate,
    applicationEffectiveDate: seed.applicationEffectiveDate,
    historyBoundaryRef: seed.historyBoundaryRef,
    engineVersion: 'representative-engine-v1',
    calculationRuleVersion: 'representative-rule-v1',
    policyVersion: 'tbk100-policy-v1',
    rateTableVersion: 'representative-rate-table-v1',
    interpretationProfileId: 'representative-interpretation-v1',
    bucketIdentityVersion: 'representative-fixture-identity-v1',
    sourceVersionSet,
    sourceVersionSetHash,
    canonicalBuckets,
  };
}

function buildRawCommand(
  seed: RepresentativeCorpusScenarioSeed,
  snapshot: StrictJsonObject,
  snapshotRef: string,
  snapshotHash: string,
): Readonly<Record<string, StrictJsonValue>> {
  const commandWithoutHash: Readonly<Record<string, StrictJsonValue>> = {
    tenantId: seed.commandTenantId ?? seed.tenantId,
    caseId: seed.caseId,
    collectionId: seed.collectionId,
    receiptAmountMinor: seed.receiptAmountMinor,
    currency: seed.commandCurrency ?? seed.currency,
    minorUnit: seed.minorUnit,
    applicationEffectiveDate: seed.applicationEffectiveDate,
    expectedSnapshotRef: snapshotRef,
    expectedSnapshotHash: snapshotHash,
    expectedSourceVersionSetHash: snapshot.sourceVersionSetHash,
    expectedHistoryBoundaryRef: seed.historyBoundaryRef,
    idempotencyKey: `rcv-representative:${seed.scenarioId}`,
  };
  return {
    ...commandWithoutHash,
    commandHash: domainSeparatedSha256(
      CORPUS_COMMAND_DOMAIN,
      canonicalizeCorpusJson(commandWithoutHash),
    ),
  };
}

function buildTypedCommand(
  command: Readonly<Record<string, StrictJsonValue>>,
): BuildLegalApplicationPlanCommand {
  return Object.freeze({
    tenantId: mustParse(parseTenantId(command.tenantId)),
    caseId: mustParse(parseCaseId(command.caseId)),
    collectionId: mustParse(parseCollectionId(command.collectionId)),
    receiptAmountMinor: mustParse(
      parseReceiptAmountMinor(command.receiptAmountMinor),
    ),
    currency: mustParse(parseCurrencyCode(command.currency)),
    minorUnit: mustParse(parseMinorUnit(command.minorUnit)),
    applicationEffectiveDate: mustParse(
      parseEffectiveDate(command.applicationEffectiveDate),
    ),
    expectedSnapshotRef: mustParse(parseSnapshotRef(command.expectedSnapshotRef)),
    expectedSnapshotHash: mustParse(parseSnapshotHash(command.expectedSnapshotHash)),
    expectedSourceVersionSetHash: mustParse(
      parseSourceVersionSetHash(command.expectedSourceVersionSetHash),
    ),
    expectedHistoryBoundaryRef: mustParse(
      parseHistoryBoundaryRef(command.expectedHistoryBoundaryRef),
    ),
    idempotencyKey: mustParse(parseIdempotencyKey(command.idempotencyKey)),
    commandHash: mustParse(parseCommandHash(command.commandHash)),
  });
}

function generateScenarioEvidence(
  seed: RepresentativeCorpusScenarioSeed,
): RepresentativeCorpusScenarioEvidence {
  const snapshot = buildSnapshot(seed);
  const snapshotCanonicalPayload = serializeCanonicalJson(snapshot);
  const snapshotHash = computeCanonicalSnapshotHash(
    Buffer.from(snapshotCanonicalPayload, 'utf8'),
  );
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  const command = buildRawCommand(seed, snapshot, snapshotRef, snapshotHash);
  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command,
    ...(seed.envelopeMode === 'CANONICAL'
      ? {
          snapshotEnvelope: {
            snapshotRef,
            snapshotHash,
            canonicalPayload: snapshotCanonicalPayload,
          },
        }
      : {}),
  });

  const input = Object.freeze({
    tenantId: String(command.tenantId),
    caseId: String(command.caseId),
    collectionId: String(command.collectionId),
    currency: String(command.currency),
    minorUnit: Number(command.minorUnit),
    receiptAmountMinor: String(command.receiptAmountMinor),
    applicationEffectiveDate: String(command.applicationEffectiveDate),
    snapshotRef,
    snapshotHash,
    snapshotCanonicalPayload,
    idempotencyKey: String(command.idempotencyKey),
    commandHash: String(command.commandHash),
    envelopeMode: seed.envelopeMode,
  });

  if (!validation.ok) {
    if (
      seed.expectedOutcome !== 'SNAPSHOT_REJECTION' ||
      validation.error.code !== seed.expectedErrorCode
    ) {
      throw new Error(
        `${seed.scenarioId}: unexpected snapshot rejection ${validation.error.code}`,
      );
    }
    return deepFreeze({
      scenarioId: seed.scenarioId,
      title: seed.title,
      purpose: seed.purpose,
      corpusVersion: REPRESENTATIVE_CORPUS_VERSION,
      input,
      outcome: {
        kind: 'SNAPSHOT_REJECTION',
        errorCode: validation.error.code,
      },
      futureObligation: seed.futureObligation,
    });
  }

  if (seed.expectedOutcome !== 'PLAN') {
    throw new Error(`${seed.scenarioId}: expected rejection but validation succeeded`);
  }

  const typedCommand = buildTypedCommand(command);
  const allocation = allocateValidatedSnapshotForApply({
    validatedSnapshot: validation.value,
    direction: 'APPLY',
    receiptAmountMinor: typedCommand.receiptAmountMinor,
  });
  if (!allocation.ok) {
    throw new Error(`${seed.scenarioId}: allocation failed with ${allocation.error.code}`);
  }

  const planResult = assembleLegalApplicationPlan({
    direction: 'APPLY',
    command: typedCommand,
    validatedSnapshot: validation.value,
    allocationResult: allocation,
  });
  if (!planResult.ok) {
    throw new Error(`${seed.scenarioId}: plan failed with ${planResult.error.code}`);
  }

  const plan = planResult.plan;
  return deepFreeze({
    scenarioId: seed.scenarioId,
    title: seed.title,
    purpose: seed.purpose,
    corpusVersion: REPRESENTATIVE_CORPUS_VERSION,
    input,
    outcome: {
      kind: 'PLAN',
      planFingerprint: plan.planFingerprint,
      receiptAmountMinor: plan.receiptAmountMinor.toString(),
      appliedAmountMinor: plan.appliedAmountMinor.toString(),
      heldRemainderMinor: plan.heldRemainderMinor.toString(),
      ...(plan.heldReason === undefined ? {} : { heldReason: plan.heldReason }),
      applications: plan.applications.map((application) => ({
        componentType: application.componentType,
        componentCode: application.componentCode,
        bucketContextKey: application.bucketContextKey,
        bucketInstanceId: application.bucketInstanceId,
        priorityRank: application.priorityRank,
        sequence: application.sequence,
        bucketBeforeMinor: application.bucketBeforeMinor.toString(),
        appliedAmountMinor: application.appliedAmountMinor.toString(),
        bucketAfterMinor: application.bucketAfterMinor.toString(),
      })),
    },
    futureObligation: seed.futureObligation,
  });
}

function buildArtifact(): RepresentativeCorpusArtifact {
  const scenarios = REPRESENTATIVE_CORPUS_SCENARIOS.map(generateScenarioEvidence);
  return deepFreeze({
    corpusVersion: REPRESENTATIVE_CORPUS_VERSION,
    sourceSnapshotContract: 'CanonicalReceivableApplicationSnapshotV1',
    targetPlanContract: 'LegalApplicationPlan',
    authorityMode: 'TEST_EVIDENCE_ONLY',
    scenarios,
    acceptanceMatrix: {
      componentOrdering: ['02-principal-and-interest', '03-principal-and-cost', '04-all-components'],
      conservationAndHeld: [
        '05-partial-application',
        '06-exact-application',
        '07-overpayment-held',
        '08-full-held',
      ],
      historyBoundaries: [
        '09-multiple-receipts-history',
        '10-same-day-history',
        '11-mixed-history',
      ],
      deferredWriterEvidence: [
        '12-full-reversal-expectation',
        '14-semantic-replay-expectation',
        '15-semantic-conflict-expectation',
        '16-concurrent-command-expectation',
      ],
      failClosedBoundaries: [
        '13-currency-mismatch',
        '18-legacy-evidence-unknown',
        '19-cross-tenant-rejection',
      ],
      exactMinorUnits: ['17-rounding-boundary'],
    },
    legacyDisposition: [
      {
        surface: 'ClaimItem.collectedAmount',
        disposition: 'FROZEN_LEGACY_CACHE / RETIREMENT_REQUIRED',
        authority: 'PROHIBITED',
      },
      {
        surface: 'LedgerAllocation',
        disposition: 'HISTORICAL_LEGACY_RECORD / TARGET_AUTHORITY_PROHIBITED',
        authority: 'PROHIBITED',
      },
      {
        surface: 'CollectionAllocation',
        disposition: 'CANONICAL_OUTPUT_DERIVED_TRANSITIONAL_PROJECTION_ONLY',
        authority: 'PROHIBITED',
      },
    ],
    task11InputContract: {
      requiredCorpusVersion: REPRESENTATIVE_CORPUS_VERSION,
      requiredScenarioCount: REPRESENTATIVE_CORPUS_SCENARIOS.length,
      requiredChecksumAlgorithm: 'SHA-256',
      requiredChecksumDomain: REPRESENTATIVE_CORPUS_VERSION,
      runtimeAuthority: 'NONE',
    },
  });
}

export function generateRepresentativeCorpus(): GeneratedRepresentativeCorpus {
  const artifact = buildArtifact();
  const canonicalPayload = canonicalizeCorpusJson(artifact);
  const checksum = domainSeparatedSha256(
    REPRESENTATIVE_CORPUS_VERSION,
    canonicalPayload,
  );
  return deepFreeze({
    artifact,
    canonicalPayload,
    checksum,
    checksumRef: `${REPRESENTATIVE_CORPUS_CHECKSUM_PREFIX}${checksum}`,
  });
}

export { canonicalizeCorpusJson };
