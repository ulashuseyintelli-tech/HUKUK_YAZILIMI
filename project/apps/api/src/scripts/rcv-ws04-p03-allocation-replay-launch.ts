import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  Adr014RepresentativeExecutionContext,
  Adr014RepresentativeLocalSource,
  Adr014RepresentativeReadOnlyQueryPort,
  Adr014RepresentativeRunnerRequest,
  Adr014RepresentativeRunnerResult,
  Adr014RepresentativeStopSignal,
} from './adr014-local-read-only-representative-runner';
import type {
  AllocationRepresentativeDatasetManifestV1,
  AllocationRepresentativeReplayRowProvider,
} from '../modules/summary-engine/allocation-representative-replay-adapter';
import {
  assertPiiSafeAllocationReplayOutput,
  createAllocationRepresentativeReplayRunner,
  validateAllocationRepresentativeReplayReadiness,
} from '../modules/summary-engine/allocation-representative-replay-adapter';
import type {
  Adr014LocalEvidencePreparationRequest,
} from './adr014-disabled-local-evidence-harness';

export const ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION =
  'RCV-WS04-P03-A-V1' as const;
export const ALLOCATION_REPLAY_LAUNCH_DEFAULT_MODE = 'DISABLED' as const;

export const ALLOCATION_REPLAY_LAUNCH_BLOCKER_CODES = Object.freeze([
  'INVALID_LAUNCH_PACKAGE',
  'LAUNCH_PACKAGE_CHECKSUM_MISMATCH',
  'LAUNCH_DISABLED',
  'MODE_MISMATCH',
  'CANONICAL_SHA_MISMATCH',
  'DATASET_MANIFEST_NOT_APPROVED',
  'DATASET_MANIFEST_INVALID',
  'DATASET_REFERENCE_BINDING_MISMATCH',
  'ACCESS_AUTHORIZATION_REQUIRED',
  'ACCESS_WINDOW_INVALID',
  'ACCESS_WINDOW_INACTIVE',
  'EXECUTION_AUTHORIZATION_REQUIRED',
  'EXECUTION_WINDOW_INVALID',
  'EXECUTION_WINDOW_INACTIVE',
  'AUTHORIZATION_REFERENCES_NOT_DISTINCT',
  'ENVIRONMENT_APPROVAL_REQUIRED',
  'LOCAL_OWNER_ENVIRONMENT_REQUIRED',
  'SESSION_REFERENCE_BINDING_MISMATCH',
  'READ_ONLY_ATTESTATION_REQUIRED',
  'NO_EGRESS_ATTESTATION_REQUIRED',
  'NO_EGRESS_RUNTIME_PROBE_REQUIRED',
  'NO_EGRESS_RUNTIME_PROBE_MISMATCH',
  'OUTPUT_PATH_INVALID',
  'OUTPUT_OUTSIDE_OWNER_ROOT',
  'OUTPUT_ALREADY_EXISTS',
  'PRODUCTION_OBSERVATION_FORBIDDEN',
  'PII_SAFE_OUTPUT_VIOLATION',
  'READ_ONLY_RUNTIME_PROBE_FAILED',
  'ABORT_REQUESTED',
] as const);

export type AllocationReplayLaunchMode =
  | 'DISABLED'
  | 'TEST_ONLY'
  | 'OWNER_AUTHORIZED_LOCAL';

export type AllocationReplayLaunchBlockerCode =
  (typeof ALLOCATION_REPLAY_LAUNCH_BLOCKER_CODES)[number];

export interface AllocationReplayAccessRecordV1 {
  readonly authorizationStatus: 'APPROVED' | 'NOT_AUTHORIZED';
  readonly authorizationReference: string;
  readonly namedOperatorReference: string;
  readonly approvedByReference: string;
  readonly purpose: 'REPRESENTATIVE_ALLOCATION_REPLAY';
  readonly sourceAccess: 'READ_ONLY';
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly datasetManifestChecksum: string;
}

export interface AllocationReplayExecutionRecordV1 {
  readonly authorizationStatus: 'APPROVED' | 'NOT_AUTHORIZED';
  readonly authorizationReference: string;
  readonly approvedByReference: string;
  readonly purpose: 'REPRESENTATIVE_ALLOCATION_REPLAY';
  readonly singleRun: true;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly canonicalSha: string;
  readonly datasetManifestChecksum: string;
}

export interface AllocationReplayEnvironmentSessionV1 {
  readonly approvalStatus: 'APPROVED' | 'DRAFT';
  readonly approvedByReference: string;
  readonly locality: 'LOCAL_OWNER_PC_OFFICE';
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly canonicalSha: string;
  readonly database: Readonly<{
    attestationStatus: 'ATTESTED' | 'UNVERIFIED';
    attestationReference: string;
    transactionReadOnly: 'on' | 'unverified';
    isolationLevel: 'repeatable read' | 'unverified';
    verifiedAt: string | null;
  }>;
  readonly network: Readonly<{
    attestationStatus: 'ATTESTED' | 'UNVERIFIED';
    attestationReference: string;
    boundary: 'NO_EGRESS' | 'UNVERIFIED';
    enforcement: 'ENFORCED' | 'UNVERIFIED';
    verifiedAt: string | null;
  }>;
}

export interface AllocationReplayOutputContractV1 {
  readonly ownerControlledRoot: string;
  readonly outputPath: string;
  readonly writeMode: 'CREATE_ONCE';
  readonly locality: 'OWNER_CONTROLLED_LOCAL';
  readonly contentBoundary: 'PII_SAFE_EVIDENCE_ONLY';
}

export interface AllocationReplayLaunchPackageV1 {
  readonly contractVersion: typeof ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION;
  readonly taskId: 'RCV-P2-WS04-P03-A';
  readonly enabled: boolean;
  readonly mode: AllocationReplayLaunchMode;
  readonly canonicalSha: string;
  readonly datasetManifest: AllocationRepresentativeDatasetManifestV1;
  readonly preparationRequest: Adr014LocalEvidencePreparationRequest;
  readonly accessRecord: AllocationReplayAccessRecordV1;
  readonly executionRecord: AllocationReplayExecutionRecordV1;
  readonly environmentSession: AllocationReplayEnvironmentSessionV1;
  readonly output: AllocationReplayOutputContractV1;
  readonly productionObservation: 'NOT_AUTHORIZED';
  readonly checksum: string;
}

export interface AllocationReplayNoEgressRuntimeProof {
  readonly enforced: boolean;
  readonly attestationReference: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
}

export interface AllocationReplayNoEgressRuntimeProbe {
  verify(
    expected: Readonly<AllocationReplayEnvironmentSessionV1>,
  ): Promise<Readonly<AllocationReplayNoEgressRuntimeProof>>;
}

export interface AllocationReplayLaunchConfig {
  readonly mode: AllocationReplayLaunchMode;
  readonly currentCanonicalSha: string;
}

export type AllocationReplayLaunchReadiness =
  | Readonly<{
      contractVersion: typeof ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION;
      status: 'READY';
      outputPathReference: string;
    }>
  | Readonly<{
      contractVersion: typeof ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION;
      status: 'DISABLED' | 'BLOCKED';
      blockerCodes: readonly AllocationReplayLaunchBlockerCode[];
    }>;

export type AllocationReplayLaunchResult =
  | AllocationReplayLaunchReadiness
  | Readonly<{
      contractVersion: typeof ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION;
      status: 'CAPTURED_NOT_ACCEPTED';
      outputPathReference: string;
      runnerResult: Extract<
        Adr014RepresentativeRunnerResult,
        { status: 'CAPTURED_NOT_ACCEPTED' }
      >;
    }>;

export interface AllocationReplayLaunchController {
  preflight(
    launchPackage: unknown,
    now?: Date,
  ): Promise<AllocationReplayLaunchReadiness>;
  launch(
    launchPackage: unknown,
    stopSignal?: Adr014RepresentativeStopSignal,
  ): Promise<AllocationReplayLaunchResult>;
}

interface AllocationReplayLaunchDependencies {
  readonly source: Adr014RepresentativeLocalSource;
  readonly rowProvider: AllocationRepresentativeReplayRowProvider;
  readonly noEgressProbe: AllocationReplayNoEgressRuntimeProbe;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BINDING_REFERENCE = /^adr014-binding:v1:[0-9a-f]{32}$/;
const OPAQUE_REFERENCE =
  /^(?:adr014-ref:v1:[a-z0-9-]+:[0-9a-f]{32}|rcv-ws04-p03-ref:v1:[a-z0-9-]+:[0-9a-f]{64})$/;

export function buildAllocationReplayLaunchPackage(
  input: Omit<AllocationReplayLaunchPackageV1, 'checksum'>,
): AllocationReplayLaunchPackageV1 {
  const body = deepFreeze({
    ...input,
    datasetManifest: { ...input.datasetManifest },
    preparationRequest: { ...input.preparationRequest },
    accessRecord: { ...input.accessRecord },
    executionRecord: { ...input.executionRecord },
    environmentSession: {
      ...input.environmentSession,
      database: { ...input.environmentSession.database },
      network: { ...input.environmentSession.network },
    },
    output: { ...input.output },
  });
  return deepFreeze({
    ...body,
    checksum: sha256(stableJson(body)),
  });
}

export function validateAllocationReplayLaunchPackage(
  value: unknown,
  config: Readonly<AllocationReplayLaunchConfig>,
  now: Date = new Date(),
): AllocationReplayLaunchReadiness {
  if (!isLaunchPackage(value)) return blocked(['INVALID_LAUNCH_PACKAGE']);

  const blockers: AllocationReplayLaunchBlockerCode[] = [];
  const body = withoutChecksum(value);
  if (sha256(stableJson(body)) !== value.checksum) {
    blockers.push('LAUNCH_PACKAGE_CHECKSUM_MISMATCH');
  }
  if (!value.enabled || value.mode === 'DISABLED') blockers.push('LAUNCH_DISABLED');
  if (value.mode !== config.mode) blockers.push('MODE_MISMATCH');
  if (!FULL_SHA.test(config.currentCanonicalSha) ||
    value.canonicalSha !== config.currentCanonicalSha) {
    blockers.push('CANONICAL_SHA_MISMATCH');
  }
  if (value.productionObservation !== 'NOT_AUTHORIZED') {
    blockers.push('PRODUCTION_OBSERVATION_FORBIDDEN');
  }
  try {
    assertPiiSafeAllocationReplayOutput(value);
  } catch (_error) {
    blockers.push('PII_SAFE_OUTPUT_VIOLATION');
  }

  validateDatasetAndReferences(value, blockers);
  validateAuthorizations(value, now, blockers);
  validateEnvironment(value, blockers);

  const unique = orderedBlockers(blockers);
  if (unique.length > 0) {
    return unique.length === 1 && unique[0] === 'LAUNCH_DISABLED'
      ? disabled(unique)
      : blocked(unique);
  }
  return Object.freeze({
    contractVersion: ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION,
    status: 'READY' as const,
    outputPathReference: outputReference(value.output.outputPath),
  });
}

export function createAllocationReplayLaunchController(
  dependencies: Readonly<AllocationReplayLaunchDependencies>,
  config: Readonly<AllocationReplayLaunchConfig> = Object.freeze({
    mode: ALLOCATION_REPLAY_LAUNCH_DEFAULT_MODE,
    currentCanonicalSha: '0000000000000000000000000000000000000000',
  }),
): AllocationReplayLaunchController {
  return Object.freeze({
    async preflight(
      launchPackage: unknown,
      now: Date = new Date(),
    ): Promise<AllocationReplayLaunchReadiness> {
      const staticReadiness = validateAllocationReplayLaunchPackage(
        launchPackage,
        config,
        now,
      );
      if (staticReadiness.status !== 'READY') return staticReadiness;
      const typedPackage = launchPackage as AllocationReplayLaunchPackageV1;

      const noEgress = await verifyNoEgress(
        dependencies.noEgressProbe,
        typedPackage.environmentSession,
      );
      if (noEgress !== undefined) return blocked([noEgress]);

      const outputBlocker = await validateOutputContract(typedPackage.output);
      if (outputBlocker !== undefined) return blocked([outputBlocker]);

      return staticReadiness;
    },
    async launch(
      launchPackage: unknown,
      stopSignal?: Adr014RepresentativeStopSignal,
    ): Promise<AllocationReplayLaunchResult> {
      const preflight = await this.preflight(launchPackage);
      if (preflight.status !== 'READY') return preflight;
      const typedPackage = launchPackage as AllocationReplayLaunchPackageV1;
      let boundaryFailure: AllocationReplayLaunchBlockerCode | undefined;
      const attestedProvider = wrapProviderWithReadOnlyProbe(
        dependencies.rowProvider,
        (code) => {
          boundaryFailure = code;
        },
      );
      const runner = createAllocationRepresentativeReplayRunner(
        dependencies.source,
        attestedProvider,
        typedPackage.datasetManifest,
        {
          mode: typedPackage.mode,
          currentCanonicalSha: config.currentCanonicalSha,
          ownerControlledOutputRoot: typedPackage.output.ownerControlledRoot,
          sourceLocality: 'LOCAL_ONLY',
          networkBoundary: 'NO_EGRESS',
        },
        {
          mode: typedPackage.mode,
          dataAccess: typedPackage.accessRecord.authorizationStatus === 'APPROVED'
            ? 'AUTHORIZED'
            : 'NOT_AUTHORIZED',
          evidenceExecution:
            typedPackage.executionRecord.authorizationStatus === 'APPROVED'
              ? 'AUTHORIZED'
              : 'NOT_AUTHORIZED',
          productionObservation: 'NOT_AUTHORIZED',
          sourceAccess: 'READ_ONLY',
          networkBoundary: 'NO_EGRESS',
        },
      );
      const request: Adr014RepresentativeRunnerRequest = {
        contractVersion: '1',
        preparationRequest: typedPackage.preparationRequest,
        outputPath: typedPackage.output.outputPath,
      };
      const runnerResult = await runner.run(request, stopSignal);
      if (boundaryFailure !== undefined) return blocked([boundaryFailure]);
      if (runnerResult.status !== 'CAPTURED_NOT_ACCEPTED') {
        if (runnerResult.status === 'ABORTED') return blocked(['ABORT_REQUESTED']);
        if (runnerResult.status === 'DISABLED') return disabled(['LAUNCH_DISABLED']);
        return blocked(['INVALID_LAUNCH_PACKAGE']);
      }
      try {
        assertPiiSafeAllocationReplayOutput(runnerResult.artifact);
      } catch (_error) {
        return blocked(['PII_SAFE_OUTPUT_VIOLATION']);
      }
      return Object.freeze({
        contractVersion: ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION,
        status: 'CAPTURED_NOT_ACCEPTED' as const,
        outputPathReference: outputReference(typedPackage.output.outputPath),
        runnerResult,
      });
    },
  });
}

export async function runAllocationReplayLaunchPreflightCli(
  argv: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AllocationReplayLaunchReadiness> {
  const packagePath = argumentValue(argv, '--package');
  const mode = environment.RCV_WS04_P03_LAUNCH_MODE ?? 'DISABLED';
  const canonicalSha = environment.RCV_WS04_P03_CANONICAL_SHA ?? '';
  if (
    packagePath === undefined ||
    !path.isAbsolute(packagePath) ||
    !isLaunchMode(mode)
  ) {
    return blocked(['INVALID_LAUNCH_PACKAGE']);
  }
  let launchPackage: unknown;
  try {
    launchPackage = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch (_error) {
    return blocked(['INVALID_LAUNCH_PACKAGE']);
  }
  const readiness = validateAllocationReplayLaunchPackage(
    launchPackage,
    { mode, currentCanonicalSha: canonicalSha },
  );
  if (readiness.status !== 'READY') return readiness;
  return blocked(['NO_EGRESS_RUNTIME_PROBE_REQUIRED']);
}

function validateDatasetAndReferences(
  value: AllocationReplayLaunchPackageV1,
  blockers: AllocationReplayLaunchBlockerCode[],
): void {
  const datasetReadiness = validateAllocationRepresentativeReplayReadiness(
    value.datasetManifest,
    {
      mode: value.mode,
      dataAccess: value.accessRecord.authorizationStatus === 'APPROVED'
        ? 'AUTHORIZED'
        : 'NOT_AUTHORIZED',
      evidenceExecution:
        value.executionRecord.authorizationStatus === 'APPROVED'
          ? 'AUTHORIZED'
          : 'NOT_AUTHORIZED',
      productionObservation: 'NOT_AUTHORIZED',
      sourceAccess: 'READ_ONLY',
      networkBoundary: 'NO_EGRESS',
    },
  );
  if (
    value.mode === 'OWNER_AUTHORIZED_LOCAL' &&
    (value.datasetManifest.manifestStatus !== 'OWNER_APPROVED' ||
      value.datasetManifest.sourceClassification !== 'REPRESENTATIVE')
  ) {
    blockers.push('DATASET_MANIFEST_NOT_APPROVED');
  }
  if (
    datasetReadiness.blockerCodes.some((code) =>
      code === 'INVALID_DATASET_MANIFEST' ||
      code === 'DATASET_MANIFEST_CHECKSUM_MISMATCH' ||
      code === 'DATASET_SOURCE_NOT_ALLOWED_FOR_MODE')
  ) {
    blockers.push('DATASET_MANIFEST_INVALID');
  }
  const preparation = value.preparationRequest;
  const preparationReferences = [
    preparation.environmentReference,
    preparation.sessionReference,
    preparation.manifestReference,
    preparation.accessAuthorizationReference,
    preparation.executionAuthorizationReference,
  ];
  const bindingReferences = preparationReferences.map((reference) =>
    reference.bindingReference);
  if (
    preparation.enabled !== true ||
    preparation.canonicalSha !== value.canonicalSha ||
    preparation.environmentReference.kind !== 'ENVIRONMENT' ||
    preparation.sessionReference.kind !== 'SESSION' ||
    preparation.manifestReference.kind !== 'MANIFEST' ||
    preparation.accessAuthorizationReference.kind !==
      'ACCESS_AUTHORIZATION' ||
    preparation.executionAuthorizationReference.kind !==
      'EXECUTION_AUTHORIZATION' ||
    !preparationReferences.every((reference) =>
      OPAQUE_REFERENCE.test(reference.opaqueReference) &&
      BINDING_REFERENCE.test(reference.bindingReference)) ||
    new Set(bindingReferences).size !== 1 ||
    preparation.manifestReference.opaqueReference !==
      value.datasetManifest.manifestReference ||
    preparation.accessAuthorizationReference.opaqueReference !==
      value.accessRecord.authorizationReference ||
    preparation.executionAuthorizationReference.opaqueReference !==
      value.executionRecord.authorizationReference
  ) {
    blockers.push('DATASET_REFERENCE_BINDING_MISMATCH');
  }
  if (
    preparation.environmentReference.opaqueReference !==
      value.environmentSession.environmentReference ||
    preparation.sessionReference.opaqueReference !==
      value.environmentSession.sessionReference ||
    value.datasetManifest.environmentReference !==
      value.environmentSession.environmentReference ||
    value.datasetManifest.sessionReference !==
      value.environmentSession.sessionReference
  ) {
    blockers.push('SESSION_REFERENCE_BINDING_MISMATCH');
  }
}

function validateAuthorizations(
  value: AllocationReplayLaunchPackageV1,
  now: Date,
  blockers: AllocationReplayLaunchBlockerCode[],
): void {
  const access = value.accessRecord;
  const execution = value.executionRecord;
  if (
    access.authorizationStatus !== 'APPROVED' ||
    !OPAQUE_REFERENCE.test(access.authorizationReference) ||
    !OPAQUE_REFERENCE.test(access.namedOperatorReference) ||
    !OPAQUE_REFERENCE.test(access.approvedByReference) ||
    access.purpose !== 'REPRESENTATIVE_ALLOCATION_REPLAY' ||
    access.sourceAccess !== 'READ_ONLY' ||
    access.datasetManifestChecksum !== value.datasetManifest.checksum
  ) {
    blockers.push('ACCESS_AUTHORIZATION_REQUIRED');
  }
  const accessWindow = parseWindow(access.startsAt, access.endsAt);
  if (accessWindow === undefined) blockers.push('ACCESS_WINDOW_INVALID');
  else if (!withinWindow(now, accessWindow)) blockers.push('ACCESS_WINDOW_INACTIVE');

  if (
    execution.authorizationStatus !== 'APPROVED' ||
    !OPAQUE_REFERENCE.test(execution.authorizationReference) ||
    !OPAQUE_REFERENCE.test(execution.approvedByReference) ||
    execution.purpose !== 'REPRESENTATIVE_ALLOCATION_REPLAY' ||
    execution.singleRun !== true ||
    execution.canonicalSha !== value.canonicalSha ||
    execution.datasetManifestChecksum !== value.datasetManifest.checksum
  ) {
    blockers.push('EXECUTION_AUTHORIZATION_REQUIRED');
  }
  const executionWindow = parseWindow(execution.startsAt, execution.endsAt);
  if (executionWindow === undefined) blockers.push('EXECUTION_WINDOW_INVALID');
  else if (!withinWindow(now, executionWindow)) {
    blockers.push('EXECUTION_WINDOW_INACTIVE');
  }
  if (
    accessWindow !== undefined &&
    executionWindow !== undefined &&
    (executionWindow.startsAt < accessWindow.startsAt ||
      executionWindow.endsAt > accessWindow.endsAt)
  ) {
    blockers.push('EXECUTION_WINDOW_INVALID');
  }
  if (access.authorizationReference === execution.authorizationReference) {
    blockers.push('AUTHORIZATION_REFERENCES_NOT_DISTINCT');
  }
}

function validateEnvironment(
  value: AllocationReplayLaunchPackageV1,
  blockers: AllocationReplayLaunchBlockerCode[],
): void {
  const environment = value.environmentSession;
  if (
    environment.approvalStatus !== 'APPROVED' ||
    !OPAQUE_REFERENCE.test(environment.approvedByReference) ||
    environment.canonicalSha !== value.canonicalSha
  ) {
    blockers.push('ENVIRONMENT_APPROVAL_REQUIRED');
  }
  if (environment.locality !== 'LOCAL_OWNER_PC_OFFICE') {
    blockers.push('LOCAL_OWNER_ENVIRONMENT_REQUIRED');
  }
  if (
    environment.database.attestationStatus !== 'ATTESTED' ||
    environment.database.transactionReadOnly !== 'on' ||
    environment.database.isolationLevel !== 'repeatable read' ||
    !OPAQUE_REFERENCE.test(environment.database.attestationReference) ||
    parseInstant(environment.database.verifiedAt) === undefined
  ) {
    blockers.push('READ_ONLY_ATTESTATION_REQUIRED');
  }
  if (
    environment.network.attestationStatus !== 'ATTESTED' ||
    environment.network.boundary !== 'NO_EGRESS' ||
    environment.network.enforcement !== 'ENFORCED' ||
    !OPAQUE_REFERENCE.test(environment.network.attestationReference) ||
    parseInstant(environment.network.verifiedAt) === undefined
  ) {
    blockers.push('NO_EGRESS_ATTESTATION_REQUIRED');
  }
}

async function verifyNoEgress(
  probe: AllocationReplayNoEgressRuntimeProbe | undefined,
  expected: Readonly<AllocationReplayEnvironmentSessionV1>,
): Promise<AllocationReplayLaunchBlockerCode | undefined> {
  if (probe === undefined) return 'NO_EGRESS_RUNTIME_PROBE_REQUIRED';
  let actual: Readonly<AllocationReplayNoEgressRuntimeProof>;
  try {
    actual = await probe.verify(expected);
  } catch (_error) {
    return 'NO_EGRESS_RUNTIME_PROBE_MISMATCH';
  }
  return actual.enforced &&
    actual.attestationReference === expected.network.attestationReference &&
    actual.environmentReference === expected.environmentReference &&
    actual.sessionReference === expected.sessionReference
    ? undefined
    : 'NO_EGRESS_RUNTIME_PROBE_MISMATCH';
}

function wrapProviderWithReadOnlyProbe(
  provider: AllocationRepresentativeReplayRowProvider,
  reportFailure: (code: AllocationReplayLaunchBlockerCode) => void,
): AllocationRepresentativeReplayRowProvider {
  return Object.freeze({
    async readRows(
      queryPort: Adr014RepresentativeReadOnlyQueryPort,
      datasetManifest: Readonly<AllocationRepresentativeDatasetManifestV1>,
      context: Readonly<Adr014RepresentativeExecutionContext>,
      stopSignal: Adr014RepresentativeStopSignal,
    ) {
      if (stopSignal.isAbortRequested()) {
        reportFailure('ABORT_REQUESTED');
        throw new Error('RCV_WS04_P03_A_ABORT_REQUESTED');
      }
      const rows = await queryPort.query<Array<{
        readOnly: string;
        isolationLevel: string;
      }>>(
        "SELECT current_setting('transaction_read_only') AS \"readOnly\", " +
        "current_setting('transaction_isolation') AS \"isolationLevel\"",
      );
      const boundary = rows[0];
      if (
        boundary?.readOnly !== 'on' ||
        boundary.isolationLevel.toLowerCase() !== 'repeatable read'
      ) {
        reportFailure('READ_ONLY_RUNTIME_PROBE_FAILED');
        throw new Error('RCV_WS04_P03_A_READ_ONLY_RUNTIME_PROBE_FAILED');
      }
      return provider.readRows(
        queryPort,
        datasetManifest,
        context,
        stopSignal,
      );
    },
  });
}

async function validateOutputContract(
  output: Readonly<AllocationReplayOutputContractV1>,
): Promise<AllocationReplayLaunchBlockerCode | undefined> {
  if (
    !path.isAbsolute(output.ownerControlledRoot) ||
    !path.isAbsolute(output.outputPath) ||
    path.extname(output.outputPath).toLowerCase() !== '.json' ||
    output.writeMode !== 'CREATE_ONCE' ||
    output.locality !== 'OWNER_CONTROLLED_LOCAL' ||
    output.contentBoundary !== 'PII_SAFE_EVIDENCE_ONLY'
  ) {
    return 'OUTPUT_PATH_INVALID';
  }
  try {
    const root = await fs.realpath(output.ownerControlledRoot);
    const parent = await fs.realpath(path.dirname(output.outputPath));
    const relative = path.relative(root, parent);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return 'OUTPUT_OUTSIDE_OWNER_ROOT';
    }
    await fs.access(parent, fsConstants.W_OK);
    try {
      await fs.access(output.outputPath, fsConstants.F_OK);
      return 'OUTPUT_ALREADY_EXISTS';
    } catch (_error) {
      return undefined;
    }
  } catch (_error) {
    return 'OUTPUT_PATH_INVALID';
  }
}

function isLaunchPackage(value: unknown): value is AllocationReplayLaunchPackageV1 {
  if (!isRecord(value)) return false;
  const dataset = value.datasetManifest;
  const preparation = value.preparationRequest;
  const access = value.accessRecord;
  const execution = value.executionRecord;
  const environment = value.environmentSession;
  const output = value.output;
  return value.contractVersion === ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION &&
    value.taskId === 'RCV-P2-WS04-P03-A' &&
    typeof value.enabled === 'boolean' &&
    isLaunchMode(value.mode) &&
    typeof value.canonicalSha === 'string' &&
    FULL_SHA.test(value.canonicalSha) &&
    isRecord(dataset) &&
    typeof dataset.checksum === 'string' &&
    SHA256.test(dataset.checksum) &&
    isRecord(preparation) &&
    preparation.contractVersion === '1' &&
    typeof preparation.enabled === 'boolean' &&
    isRecord(access) &&
    typeof access.authorizationReference === 'string' &&
    isRecord(execution) &&
    typeof execution.authorizationReference === 'string' &&
    isRecord(environment) &&
    isRecord(environment.database) &&
    isRecord(environment.network) &&
    isRecord(output) &&
    typeof output.ownerControlledRoot === 'string' &&
    typeof output.outputPath === 'string' &&
    typeof value.checksum === 'string' &&
    SHA256.test(value.checksum);
}

function isLaunchMode(value: unknown): value is AllocationReplayLaunchMode {
  return value === 'DISABLED' ||
    value === 'TEST_ONLY' ||
    value === 'OWNER_AUTHORIZED_LOCAL';
}

function parseWindow(
  startsAt: string | null,
  endsAt: string | null,
): { startsAt: number; endsAt: number } | undefined {
  const start = parseInstant(startsAt);
  const end = parseInstant(endsAt);
  return start !== undefined && end !== undefined && start < end
    ? { startsAt: start, endsAt: end }
    : undefined;
}

function parseInstant(value: string | null): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function withinWindow(
  now: Date,
  window: Readonly<{ startsAt: number; endsAt: number }>,
): boolean {
  const timestamp = now.getTime();
  return Number.isFinite(timestamp) &&
    timestamp >= window.startsAt &&
    timestamp <= window.endsAt;
}

function withoutChecksum(
  value: AllocationReplayLaunchPackageV1,
): Omit<AllocationReplayLaunchPackageV1, 'checksum'> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'checksum'),
  ) as Omit<AllocationReplayLaunchPackageV1, 'checksum'>;
}

function outputReference(outputPath: string): string {
  return `rcv-ws04-p03-output:v1:${sha256(
    path.resolve(outputPath).replaceAll('\\', '/').toLowerCase(),
  )}`;
}

function orderedBlockers(
  blockers: readonly AllocationReplayLaunchBlockerCode[],
): readonly AllocationReplayLaunchBlockerCode[] {
  return Object.freeze(
    ALLOCATION_REPLAY_LAUNCH_BLOCKER_CODES.filter((code) =>
      blockers.includes(code)),
  );
}

function blocked(
  blockers: readonly AllocationReplayLaunchBlockerCode[],
): AllocationReplayLaunchReadiness {
  return Object.freeze({
    contractVersion: ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION,
    status: 'BLOCKED' as const,
    blockerCodes: orderedBlockers(blockers),
  });
}

function disabled(
  blockers: readonly ['LAUNCH_DISABLED'] | readonly AllocationReplayLaunchBlockerCode[],
): AllocationReplayLaunchReadiness {
  return Object.freeze({
    contractVersion: ALLOCATION_REPLAY_LAUNCH_CONTRACT_VERSION,
    status: 'DISABLED' as const,
    blockerCodes: orderedBlockers(blockers),
  });
}

function argumentValue(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

if (require.main === module) {
  runAllocationReplayLaunchPreflightCli()
    .then((result) => {
      const safeResult = {
        contractVersion: result.contractVersion,
        status: result.status,
        ...('blockerCodes' in result
          ? { blockerCodes: result.blockerCodes }
          : { outputPathReference: result.outputPathReference }),
      };
      process.stdout.write(`${JSON.stringify(safeResult)}\n`);
      process.exitCode = result.status === 'READY' ? 0 : 2;
    })
    .catch(() => {
      process.stderr.write('RCV_WS04_P03_A_PREFLIGHT_FAILED\n');
      process.exitCode = 1;
    });
}
