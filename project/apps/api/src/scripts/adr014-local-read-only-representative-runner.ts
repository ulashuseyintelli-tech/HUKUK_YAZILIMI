import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Adr014DryValidationRequest, Adr014DryValidationResult } from './adr014-local-session-orchestrator-dry-validation';
import { createAdr014LocalSessionDryValidationOrchestrator } from './adr014-local-session-orchestrator-dry-validation';
import {
  type Adr014LocalEvidenceHarnessBlockerCode,
  type Adr014LocalEvidencePreparationRequest,
  prepareAdr014DisabledLocalEvidenceHarness,
} from './adr014-disabled-local-evidence-harness';

export const ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION = '1' as const;
export const ADR014_REPRESENTATIVE_RUNNER_DEFAULT_MODE = 'DISABLED' as const;
export const ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL =
  'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY' as const;

export const ADR014_REPRESENTATIVE_RUNNER_MODES = Object.freeze([
  'DISABLED',
  'TEST_ONLY',
  'OWNER_AUTHORIZED_LOCAL',
] as const);

export const ADR014_REPRESENTATIVE_OBSERVATION_RESULTS = Object.freeze([
  'MATCH',
  'NON_ZERO_FINANCIAL_DIFFERENCE',
  'NOT_COMPARABLE',
  'BLOCKED',
] as const);

export const ADR014_REPRESENTATIVE_PRIMARY_DISPLAY_RESULTS = Object.freeze([
  'SAFE',
  'UNSAFE',
  'NOT_EVALUATED',
] as const);

export const ADR014_REPRESENTATIVE_RUNNER_BLOCKER_CODES = Object.freeze([
  'INVALID_RUN_REQUEST',
  'INVALID_RUNNER_CONFIG',
  'INVALID_OUTPUT_PATH',
  'OUTPUT_OUTSIDE_OWNER_ROOT',
  'OUTPUT_ALREADY_EXISTS',
  'SOURCE_BOUNDARY_INVALID',
  'NO_EGRESS_BOUNDARY_INVALID',
  'ABORT_REQUESTED',
  'WRITE_CAPABLE_QUERY_REJECTED',
  'SOURCE_READ_FAILED',
  'INVALID_EVIDENCE_PAYLOAD',
  'OUTPUT_WRITE_FAILED',
] as const);

export type Adr014RepresentativeRunnerMode =
  (typeof ADR014_REPRESENTATIVE_RUNNER_MODES)[number];
export type Adr014RepresentativeObservationResult =
  (typeof ADR014_REPRESENTATIVE_OBSERVATION_RESULTS)[number];
export type Adr014RepresentativePrimaryDisplayResult =
  (typeof ADR014_REPRESENTATIVE_PRIMARY_DISPLAY_RESULTS)[number];
export type Adr014RepresentativeRunnerBlockerCode =
  (typeof ADR014_REPRESENTATIVE_RUNNER_BLOCKER_CODES)[number];

export interface Adr014RepresentativeRunnerRequest {
  readonly contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
  readonly preparationRequest: Readonly<Adr014LocalEvidencePreparationRequest>;
  readonly outputPath: string;
}

export interface Adr014RepresentativeRunnerConfig {
  readonly mode: Adr014RepresentativeRunnerMode;
  readonly currentCanonicalSha: string;
  readonly ownerControlledOutputRoot: string;
  readonly sourceLocality: 'LOCAL_ONLY';
  readonly networkBoundary: 'NO_EGRESS';
}

export interface Adr014RepresentativeStopSignal {
  isAbortRequested(): boolean;
}

export interface Adr014RepresentativeTransactionClient {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe(query: string, ...values: readonly unknown[]): Promise<unknown>;
}

export interface Adr014RepresentativeLocalSource {
  readonly locality: 'LOCAL_ONLY';
  readonly access: 'READ_ONLY';
  $transaction<T>(callback: (tx: Adr014RepresentativeTransactionClient) => Promise<T>): Promise<T>;
}

export interface Adr014RepresentativeReadOnlyQueryPort {
  query<T>(query: string, ...values: readonly unknown[]): Promise<T>;
}

export interface Adr014RepresentativeExecutionContext {
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly accessAuthorizationReference: string;
  readonly executionAuthorizationReference: string;
  readonly executionPlanReference: string;
}

export interface Adr014RepresentativeObservation {
  readonly observationReference: string;
  readonly result: Adr014RepresentativeObservationResult;
  readonly primaryDisplaySafety: Adr014RepresentativePrimaryDisplayResult;
}

export interface Adr014RepresentativeReadResult {
  readonly observations: readonly Adr014RepresentativeObservation[];
}

export interface Adr014RepresentativeEvidenceReader {
  read(
    queryPort: Adr014RepresentativeReadOnlyQueryPort,
    context: Readonly<Adr014RepresentativeExecutionContext>,
    stopSignal: Adr014RepresentativeStopSignal,
  ): Promise<Adr014RepresentativeReadResult>;
}

export interface Adr014RepresentativeExecutionPlan extends Adr014RepresentativeExecutionContext {
  readonly contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
  readonly source: 'LOCAL_ONLY';
  readonly sourceAccess: 'READ_ONLY';
  readonly transaction: 'REPEATABLE_READ_READ_ONLY';
  readonly network: 'NO_EGRESS';
  readonly outputPathReference: string;
  readonly authority: 'NONE';
}

export interface Adr014RepresentativeEvidenceArtifact extends Adr014RepresentativeExecutionContext {
  readonly contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
  readonly status: 'CAPTURED_NOT_ACCEPTED';
  readonly authority: 'NONE';
  readonly official: false;
  readonly representativeEvidenceAccepted: false;
  readonly runtimeCutoverAuthorized: false;
  readonly source: 'LOCAL_ONLY';
  readonly sourceAccess: 'READ_ONLY';
  readonly transaction: 'REPEATABLE_READ_READ_ONLY';
  readonly network: 'NO_EGRESS';
  readonly observationCount: number;
  readonly observations: readonly Adr014RepresentativeObservation[];
  readonly artifactDigest: string;
}

export type Adr014RepresentativeRunnerResult =
  | Readonly<{
      contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
      status: 'DISABLED';
    }>
  | Readonly<{
      contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
      status: 'BLOCKED';
      blockerCodes: readonly (
        | Adr014RepresentativeRunnerBlockerCode
        | Adr014LocalEvidenceHarnessBlockerCode
      )[];
    }>
  | Readonly<{
      contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
      status: 'ABORTED';
      blockerCodes: readonly ['ABORT_REQUESTED'];
    }>
  | Readonly<{
      contractVersion: typeof ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION;
      status: 'CAPTURED_NOT_ACCEPTED';
      outputPath: string;
      artifact: Adr014RepresentativeEvidenceArtifact;
    }>;

export interface Adr014LocalReadOnlyRepresentativeRunner {
  readonly mode: Adr014RepresentativeRunnerMode;
  buildPlan(request: unknown): Adr014RepresentativeExecutionPlan | Adr014RepresentativeRunnerResult;
  dryValidate(request: unknown): Adr014DryValidationResult;
  run(request: unknown, stopSignal?: Adr014RepresentativeStopSignal): Promise<Adr014RepresentativeRunnerResult>;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const OBSERVATION_REFERENCE = /^adr014-observation:v1:[0-9a-f]{64}$/;
const WRITE_CAPABLE_SQL = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE|LOCK|SET|RESET|VACUUM|ANALYZE|REFRESH|CLUSTER|REINDEX)\b/i;
const REQUEST_KEYS = Object.freeze(['contractVersion', 'preparationRequest', 'outputPath'] as const);
const OBSERVATION_KEYS = Object.freeze([
  'observationReference',
  'result',
  'primaryDisplaySafety',
] as const);
const READ_RESULT_KEYS = Object.freeze(['observations'] as const);

const DISABLED_RESULT = Object.freeze({
  contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
  status: 'DISABLED' as const,
});

const NEVER_ABORT = Object.freeze({ isAbortRequested: () => false });

class Adr014RunnerFailure extends Error {
  constructor(readonly blockerCode: Adr014RepresentativeRunnerBlockerCode) {
    super(blockerCode);
    this.name = 'Adr014RunnerFailure';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function blocked(
  blockerCodes: readonly (
    | Adr014RepresentativeRunnerBlockerCode
    | Adr014LocalEvidenceHarnessBlockerCode
  )[],
): Adr014RepresentativeRunnerResult {
  return Object.freeze({
    contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
    status: 'BLOCKED' as const,
    blockerCodes: Object.freeze([...new Set(blockerCodes)]),
  });
}

function aborted(): Adr014RepresentativeRunnerResult {
  return Object.freeze({
    contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
    status: 'ABORTED' as const,
    blockerCodes: Object.freeze(['ABORT_REQUESTED'] as const),
  });
}

function abortRequested(signal: Adr014RepresentativeStopSignal): boolean {
  try {
    return signal.isAbortRequested() === true;
  } catch (_error) {
    return true;
  }
}

function validMode(value: unknown): value is Adr014RepresentativeRunnerMode {
  return typeof value === 'string' && ADR014_REPRESENTATIVE_RUNNER_MODES.includes(
    value as Adr014RepresentativeRunnerMode,
  );
}

function validConfig(config: unknown): config is Adr014RepresentativeRunnerConfig {
  return isObject(config) && validMode(config.mode) && FULL_SHA.test(String(config.currentCanonicalSha)) &&
    typeof config.ownerControlledOutputRoot === 'string' &&
    path.isAbsolute(config.ownerControlledOutputRoot) && config.sourceLocality === 'LOCAL_ONLY' &&
    config.networkBoundary === 'NO_EGRESS';
}

function validRequest(value: unknown): value is Adr014RepresentativeRunnerRequest {
  return isObject(value) && hasExactKeys(value, REQUEST_KEYS) &&
    value.contractVersion === ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION &&
    isObject(value.preparationRequest) && typeof value.outputPath === 'string' &&
    path.isAbsolute(value.outputPath) && path.extname(value.outputPath).toLowerCase() === '.json';
}

function normalizedOutputReference(outputPath: string): string {
  const normalized = path.resolve(outputPath).replaceAll('\\', '/').toLowerCase();
  return `adr014-output-path:v1:${sha256(normalized)}`;
}

function reference(value: unknown): string {
  return isObject(value) && typeof value.opaqueReference === 'string' ? value.opaqueReference : '';
}

function executionPlanBody(
  request: Adr014RepresentativeRunnerRequest,
): Omit<Adr014RepresentativeExecutionPlan, 'executionPlanReference'> {
  const preparation = request.preparationRequest;
  return Object.freeze({
    contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
    canonicalSha: preparation.canonicalSha,
    environmentReference: reference(preparation.environmentReference),
    sessionReference: reference(preparation.sessionReference),
    manifestReference: reference(preparation.manifestReference),
    accessAuthorizationReference: reference(preparation.accessAuthorizationReference),
    executionAuthorizationReference: reference(preparation.executionAuthorizationReference),
    source: 'LOCAL_ONLY' as const,
    sourceAccess: 'READ_ONLY' as const,
    transaction: 'REPEATABLE_READ_READ_ONLY' as const,
    network: 'NO_EGRESS' as const,
    outputPathReference: normalizedOutputReference(request.outputPath),
    authority: 'NONE' as const,
  });
}

export function buildAdr014RepresentativeExecutionPlan(
  request: unknown,
  config: unknown,
): Adr014RepresentativeExecutionPlan | Adr014RepresentativeRunnerResult {
  if (!validConfig(config)) return blocked(['INVALID_RUNNER_CONFIG']);
  if (config.mode === 'DISABLED') return DISABLED_RESULT;
  if (!validRequest(request)) return blocked(['INVALID_RUN_REQUEST']);

  const preparation = prepareAdr014DisabledLocalEvidenceHarness(request.preparationRequest, {
    currentCanonicalSha: config.currentCanonicalSha,
  });
  if (preparation.status === 'BLOCKED') return blocked(preparation.blockerCodes);
  if (config.sourceLocality !== 'LOCAL_ONLY') return blocked(['SOURCE_BOUNDARY_INVALID']);
  if (config.networkBoundary !== 'NO_EGRESS') return blocked(['NO_EGRESS_BOUNDARY_INVALID']);

  const body = executionPlanBody(request);
  return Object.freeze({
    ...body,
    executionPlanReference: `adr014-execution-plan:v1:${sha256(JSON.stringify(body))}`,
  });
}

function isExecutionPlan(
  value: Adr014RepresentativeExecutionPlan | Adr014RepresentativeRunnerResult,
): value is Adr014RepresentativeExecutionPlan {
  return 'executionPlanReference' in value;
}

function isReadOnlyQuery(query: string): boolean {
  const normalized = query.trim();
  return normalized.length > 0 && !normalized.includes(';') && !normalized.includes('--') &&
    !normalized.includes('/*') && /^(SELECT|WITH)\b/i.test(normalized) &&
    !WRITE_CAPABLE_SQL.test(normalized);
}

function queryPortFor(tx: Adr014RepresentativeTransactionClient): Adr014RepresentativeReadOnlyQueryPort {
  return Object.freeze({
    query<T>(query: string, ...values: readonly unknown[]): Promise<T> {
      if (!isReadOnlyQuery(query)) {
        throw new Adr014RunnerFailure('WRITE_CAPABLE_QUERY_REJECTED');
      }
      return tx.$queryRawUnsafe(query, ...values) as Promise<T>;
    },
  });
}

function validObservation(value: unknown): value is Adr014RepresentativeObservation {
  return isObject(value) && hasExactKeys(value, OBSERVATION_KEYS) &&
    typeof value.observationReference === 'string' &&
    OBSERVATION_REFERENCE.test(value.observationReference) &&
    ADR014_REPRESENTATIVE_OBSERVATION_RESULTS.includes(
      value.result as Adr014RepresentativeObservationResult,
    ) && ADR014_REPRESENTATIVE_PRIMARY_DISPLAY_RESULTS.includes(
      value.primaryDisplaySafety as Adr014RepresentativePrimaryDisplayResult,
    );
}

function normalizeReadResult(value: unknown): Adr014RepresentativeReadResult {
  if (!isObject(value) || !hasExactKeys(value, READ_RESULT_KEYS) ||
    !Array.isArray(value.observations) || !value.observations.every(validObservation)) {
    throw new Adr014RunnerFailure('INVALID_EVIDENCE_PAYLOAD');
  }
  const seen = new Set<string>();
  const observations = value.observations.map((observation) => {
    if (seen.has(observation.observationReference)) {
      throw new Adr014RunnerFailure('INVALID_EVIDENCE_PAYLOAD');
    }
    seen.add(observation.observationReference);
    return Object.freeze({
      observationReference: observation.observationReference,
      result: observation.result,
      primaryDisplaySafety: observation.primaryDisplaySafety,
    });
  });
  observations.sort((left, right) => left.observationReference.localeCompare(right.observationReference));
  return Object.freeze({ observations: Object.freeze(observations) });
}

function artifactFor(
  plan: Adr014RepresentativeExecutionPlan,
  readResult: Adr014RepresentativeReadResult,
): Adr014RepresentativeEvidenceArtifact {
  const body = {
    contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
    status: 'CAPTURED_NOT_ACCEPTED' as const,
    authority: 'NONE' as const,
    official: false as const,
    representativeEvidenceAccepted: false as const,
    runtimeCutoverAuthorized: false as const,
    canonicalSha: plan.canonicalSha,
    environmentReference: plan.environmentReference,
    sessionReference: plan.sessionReference,
    manifestReference: plan.manifestReference,
    accessAuthorizationReference: plan.accessAuthorizationReference,
    executionAuthorizationReference: plan.executionAuthorizationReference,
    executionPlanReference: plan.executionPlanReference,
    source: 'LOCAL_ONLY' as const,
    sourceAccess: 'READ_ONLY' as const,
    transaction: 'REPEATABLE_READ_READ_ONLY' as const,
    network: 'NO_EGRESS' as const,
    observationCount: readResult.observations.length,
    observations: readResult.observations,
  };
  return Object.freeze({
    ...body,
    artifactDigest: `sha256:${sha256(JSON.stringify(body))}`,
  });
}

async function validateOutputPath(
  outputRoot: string,
  outputPath: string,
): Promise<Adr014RepresentativeRunnerBlockerCode | undefined> {
  try {
    const root = await fs.realpath(outputRoot);
    const parent = await fs.realpath(path.dirname(outputPath));
    const relative = path.relative(root, parent);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return 'OUTPUT_OUTSIDE_OWNER_ROOT';
    }
    await fs.access(parent, fsConstants.W_OK);
    return undefined;
  } catch (_error) {
    return 'INVALID_OUTPUT_PATH';
  }
}

async function writeOnce(
  outputPath: string,
  artifact: Adr014RepresentativeEvidenceArtifact,
): Promise<Adr014RepresentativeRunnerBlockerCode | undefined> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let blocker: Adr014RepresentativeRunnerBlockerCode | undefined;
  try {
    handle = await fs.open(outputPath, 'wx', 0o600);
    await handle.writeFile(stableJson(artifact), { encoding: 'utf8' });
    await handle.sync();
  } catch (error) {
    blocker = isObject(error) && error.code === 'EEXIST'
      ? 'OUTPUT_ALREADY_EXISTS'
      : 'OUTPUT_WRITE_FAILED';
  } finally {
    try {
      await handle?.close();
    } catch (_error) {
      blocker = 'OUTPUT_WRITE_FAILED';
    }
  }
  if (blocker !== undefined && handle !== undefined) {
    try {
      await fs.unlink(outputPath);
    } catch (_error) {
      // A failed partial artifact is never treated as a successful capture.
    }
  }
  return blocker;
}

function mapFailure(error: unknown): Adr014RepresentativeRunnerBlockerCode {
  return error instanceof Adr014RunnerFailure ? error.blockerCode : 'SOURCE_READ_FAILED';
}

export function createAdr014LocalReadOnlyRepresentativeRunner(
  source: Adr014RepresentativeLocalSource,
  reader: Adr014RepresentativeEvidenceReader,
  config: Readonly<Adr014RepresentativeRunnerConfig> = Object.freeze({
    mode: ADR014_REPRESENTATIVE_RUNNER_DEFAULT_MODE,
    currentCanonicalSha: '0000000000000000000000000000000000000000',
    ownerControlledOutputRoot: path.resolve('.'),
    sourceLocality: 'LOCAL_ONLY',
    networkBoundary: 'NO_EGRESS',
  }),
): Adr014LocalReadOnlyRepresentativeRunner {
  const mode = validConfig(config) ? config.mode : 'DISABLED';
  return Object.freeze({
    mode,
    buildPlan(request: unknown) {
      return buildAdr014RepresentativeExecutionPlan(request, config);
    },
    dryValidate(request: unknown) {
      const dryMode = mode === 'DISABLED' ? 'DISABLED' : 'TEST_ONLY';
      return createAdr014LocalSessionDryValidationOrchestrator({ mode: dryMode }).validate(
        request as Adr014DryValidationRequest,
      );
    },
    async run(
      request: unknown,
      stopSignal: Adr014RepresentativeStopSignal = NEVER_ABORT,
    ): Promise<Adr014RepresentativeRunnerResult> {
      const plan = buildAdr014RepresentativeExecutionPlan(request, config);
      if (!isExecutionPlan(plan)) return plan;
      if (source.locality !== 'LOCAL_ONLY' || source.access !== 'READ_ONLY') {
        return blocked(['SOURCE_BOUNDARY_INVALID']);
      }
      if (abortRequested(stopSignal)) return aborted();

      const outputPath = (request as Adr014RepresentativeRunnerRequest).outputPath;
      const pathBlocker = await validateOutputPath(config.ownerControlledOutputRoot, outputPath);
      if (pathBlocker !== undefined) return blocked([pathBlocker]);

      let readResult: Adr014RepresentativeReadResult;
      try {
        readResult = await source.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL);
          if (abortRequested(stopSignal)) throw new Adr014RunnerFailure('ABORT_REQUESTED');
          const result = await reader.read(queryPortFor(tx), plan, stopSignal);
          if (abortRequested(stopSignal)) throw new Adr014RunnerFailure('ABORT_REQUESTED');
          return normalizeReadResult(result);
        });
      } catch (error) {
        const code = mapFailure(error);
        return code === 'ABORT_REQUESTED' ? aborted() : blocked([code]);
      }

      if (abortRequested(stopSignal)) return aborted();
      const artifact = artifactFor(plan, readResult);
      const writeBlocker = await writeOnce(outputPath, artifact);
      if (writeBlocker !== undefined) return blocked([writeBlocker]);
      return Object.freeze({
        contractVersion: ADR014_REPRESENTATIVE_RUNNER_CONTRACT_VERSION,
        status: 'CAPTURED_NOT_ACCEPTED' as const,
        outputPath,
        artifact,
      });
    },
  });
}
