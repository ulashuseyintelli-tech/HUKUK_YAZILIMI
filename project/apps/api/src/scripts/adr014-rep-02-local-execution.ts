import { createHash, randomUUID } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { CaseService } from '../modules/case/case.service';
import { BalanceDisplayShadowDiffService } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.service';
import type { BalanceDisplayShadowDiffReport } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.types';
import { InterestEngineService } from '../modules/interest-engine/interest-engine.service';
import { CaseBalanceService } from '../modules/interest-engine/orchestration/case-balance.service';
import { toCaseBalanceDisplay } from '../modules/interest-engine/orchestration/case-balance-display';
import { RateProviderService } from '../modules/interest-engine/rates/rate-provider.service';
import { PolicyGateV2Service } from '../modules/interest-engine/policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../modules/interest-engine/segments/segment-builder.service';
import { VersionPinningService } from '../modules/interest-engine/version/version-pinning.service';
import { TBK100AllocatorService } from '../modules/interest-engine/allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../modules/interest-engine/allocation/claim-priority.service';
import { AllocationEngineService } from '../modules/interest-engine/allocation/allocation-engine.service';
import {
  ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION,
  bindAdr014RuntimeCapture,
  type Adr014PreRunAuthorizedPackage,
} from './adr014-run-specific-authorization-package';
import {
  materializeAdr014FirstV2PreRunPackageInstance,
} from './adr014-v2-pre-run-package-instance';
import {
  ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL,
  buildAdr014RepresentativeExecutionPlan,
  type Adr014RepresentativeExecutionPlan,
  type Adr014RepresentativeObservationResult,
  type Adr014RepresentativePrimaryDisplayResult,
} from './adr014-local-read-only-representative-runner';
import { createAdr014LocalSessionDryValidationOrchestrator } from './adr014-local-session-orchestrator-dry-validation';

export const ADR014_REP_02_EXECUTION_CONTRACT_VERSION = '1' as const;
export const ADR014_REP_02_STATUS = Object.freeze([
  'CAPTURE_COMPLETE',
  'FAILED',
  'ABORTED',
] as const);
export const ADR014_REP_02_FAILURE_CODES = Object.freeze([
  'INVALID_EXECUTION_CONFIG',
  'PRE_RUN_PACKAGE_BLOCKED',
  'EXECUTION_PLAN_BLOCKED',
  'DRY_VALIDATION_FAILED',
  'SOURCE_NOT_LOCAL',
  'READ_ONLY_BOUNDARY_FAILED',
  'EMPTY_ELIGIBLE_POPULATION',
  'NON_ZERO_FINANCIAL_DISCREPANCY',
  'REQUIRED_EVIDENCE_NOT_COMPARABLE',
  'CANONICAL_HARD_STOP',
  'SOURCE_READ_FAILED',
  'TIMEOUT',
  'ABORT_REQUESTED',
  'RUNTIME_BINDING_FAILED',
  'OUTPUT_ALREADY_EXISTS',
  'OUTPUT_WRITE_FAILED',
] as const);

export type Adr014Rep02Status = (typeof ADR014_REP_02_STATUS)[number];
export type Adr014Rep02FailureCode = (typeof ADR014_REP_02_FAILURE_CODES)[number];
type FeeStatus = 'AVAILABLE' | 'NOT_CALCULATED' | 'UNAVAILABLE';
type CurrencyCoverage = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'OTHER_OR_INVALID';

export interface Adr014Rep02ExecutionConfig {
  readonly canonicalSha: string;
  readonly reviewerName: string;
  readonly outputRoot: string;
  readonly outputPath: string;
  readonly manifestApproval: 'APPROVED';
  readonly databaseUrl: string;
  readonly stopFilePath?: string;
}

interface EligibleCaseReference {
  readonly tenantId: string;
  readonly caseId: string;
}

export interface Adr014Rep02CaseObservation {
  readonly observationReference: string;
  readonly result: Adr014RepresentativeObservationResult;
  readonly primaryDisplaySafety: Adr014RepresentativePrimaryDisplayResult;
  readonly durationMs: number;
  readonly financialRowCount: number;
  readonly exactMatchRowCount: number;
  readonly nonZeroRowCount: number;
  readonly notComparableRowCount: number;
  readonly blockerCodes: readonly string[];
  readonly feeProjectionStatus: FeeStatus;
  readonly traceAvailable: boolean;
  readonly nonOfficialSnapshotPresent: boolean;
  readonly currencies: readonly CurrencyCoverage[];
}

interface Adr014Rep02BoundaryProof {
  readonly transactionIsolation: 'repeatable read';
  readonly transactionReadOnly: true;
  readonly databaseHostClass: 'LOCALHOST';
  readonly writeBack: 'FORBIDDEN';
  readonly network: 'NO_EGRESS';
}

export interface Adr014Rep02ReadSnapshot {
  readonly boundaryProof: Adr014Rep02BoundaryProof | null;
  readonly populationCount: number;
  readonly observations: readonly Adr014Rep02CaseObservation[];
  readonly stoppedBy?: Adr014Rep02FailureCode;
}

export interface Adr014Rep02ReadOnlyDatabase {
  readonly locality: 'LOCAL_ONLY';
  runReadOnly<T>(reader: (transaction: Adr014Rep02ReadTransaction) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
}

export interface Adr014Rep02ReadTransaction {
  verifyBoundary(): Promise<Adr014Rep02BoundaryProof>;
  listEligibleCases(): Promise<readonly EligibleCaseReference[]>;
  observeCase(
    reference: EligibleCaseReference,
    context: Readonly<{
      canonicalSha: string;
      sessionOpaqueReference: string;
      asOfDate: string;
      generatedAt: string;
    }>,
  ): Promise<Adr014Rep02CaseObservation>;
}

export interface Adr014Rep02EvidenceArtifact {
  readonly contractVersion: typeof ADR014_REP_02_EXECUTION_CONTRACT_VERSION;
  readonly status: Adr014Rep02Status;
  readonly failureCodes: readonly Adr014Rep02FailureCode[];
  readonly authority: 'NONE';
  readonly official: false;
  readonly representativeEvidenceAccepted: false;
  readonly pr11Authorized: false;
  readonly runtimeCutoverAuthorized: false;
  readonly canonicalSha: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly manifestApprovalReference: string;
  readonly reviewerReference: string;
  readonly actualAccessWindow: Readonly<{ startsAt: string; endsAt: string }>;
  readonly actualExecutionWindow: Readonly<{ startsAt: string; endsAt: string }>;
  readonly populationCount: number;
  readonly requestCount: number;
  readonly baseline: Readonly<{
    warmupRequestCount: 0;
    latencyMs: Readonly<{ minimum: number; p50: number; p95: number; p99: number; maximum: number }>;
    errorCount: number;
    timeoutCount: number;
    abortCount: number;
  }>;
  readonly financialReconciliation: Readonly<{
    exactMatchRowCount: number;
    nonZeroRowCount: number;
    notComparableRowCount: number;
    result: 'ZERO_CENT_EXACT' | 'FAIL_CLOSED';
  }>;
  readonly coverage: Readonly<{
    processedPopulation: number;
    complete: boolean;
    currencies: Readonly<Record<CurrencyCoverage, number>>;
    feeProjectionStatuses: Readonly<Record<FeeStatus, number>>;
    traceAvailableCount: number;
    nonOfficialSnapshotCount: number;
    primaryDisplaySafeCount: number;
    primaryDisplayUnsafeCount: number;
  }>;
  readonly hardStops: Readonly<{
    total: number;
    codes: readonly string[];
  }>;
  readonly sourceBoundary: Adr014Rep02BoundaryProof | null;
  readonly evidenceReferenceIndex: readonly string[];
  readonly runtimeBindingStatus: 'CAPTURE_COMPLETE' | 'NOT_COMPLETED';
  readonly capturePackageReference: string | null;
  readonly artifactDigest: string;
}

export type Adr014Rep02ExecutionResult = Readonly<{
  status: Adr014Rep02Status;
  outputPath: string;
  artifact: Adr014Rep02EvidenceArtifact;
}>;

const FULL_SHA = /^[0-9a-f]{40}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'CHF']);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function opaqueReference(namespace: string, seed: string): string {
  return `adr014-ref:v1:${namespace}:${sha256(seed).slice(0, 32)}`;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

function isLocalDatabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'postgresql:' && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isValidConfig(config: Adr014Rep02ExecutionConfig): boolean {
  const outputRoot = path.resolve(config.outputRoot);
  const outputPath = path.resolve(config.outputPath);
  const relative = path.relative(outputRoot, outputPath);
  return FULL_SHA.test(config.canonicalSha) && config.reviewerName.trim().length > 0 &&
    config.manifestApproval === 'APPROVED' && path.isAbsolute(config.outputRoot) &&
    path.isAbsolute(config.outputPath) && path.extname(config.outputPath).toLowerCase() === '.json' &&
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) &&
    isLocalDatabaseUrl(config.databaseUrl) &&
    (config.stopFilePath === undefined || path.isAbsolute(config.stopFilePath));
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Math.round((sorted[index] ?? 0) * 1000) / 1000;
}

function latencySummary(values: readonly number[]) {
  return Object.freeze({
    minimum: percentile(values, 0),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    maximum: percentile(values, 1),
  });
}

function increment<T extends string>(target: Record<T, number>, key: T): void {
  target[key] += 1;
}

function currencyClass(value: string): CurrencyCoverage {
  return SUPPORTED_CURRENCIES.has(value) ? value as CurrencyCoverage : 'OTHER_OR_INVALID';
}

function timeoutFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === 'P2028' ||
    (typeof candidate.message === 'string' && /timeout|timed out/i.test(candidate.message));
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function observationReference(
  canonicalSha: string,
  sessionReference: string,
  source: EligibleCaseReference,
): string {
  return `adr014-observation:v1:${sha256(
    `${canonicalSha}:${sessionReference}:${source.tenantId}:${source.caseId}`,
  )}`;
}

function buildEngine(prisma: Prisma.TransactionClient): CaseBalanceService {
  const engine = new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    {} as never,
    new VersionPinningService(),
    undefined,
  );
  return new CaseBalanceService(
    prisma as never,
    new RateProviderService(prisma as never),
    engine,
  );
}

function buildCaseService(
  prisma: Prisma.TransactionClient,
  canonicalBalance: CaseBalanceService,
): CaseService {
  const unused = {} as never;
  return new CaseService(
    prisma as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    canonicalBalance,
  );
}

function resultFor(report: BalanceDisplayShadowDiffReport): Adr014RepresentativeObservationResult {
  const rows = [...report.totals.diffs, ...report.bucketDiffs];
  if (rows.some((row) => row.delta !== null && row.delta !== 0)) {
    return 'NON_ZERO_FINANCIAL_DIFFERENCE';
  }
  if (rows.some((row) => row.status !== 'MATCH') || !report.comparability.comparable) {
    return 'NOT_COMPARABLE';
  }
  if (report.cutoverReadiness.blockers.length > 0) return 'BLOCKED';
  return 'MATCH';
}

class PrismaAdr014Rep02ReadTransaction implements Adr014Rep02ReadTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async verifyBoundary(): Promise<Adr014Rep02BoundaryProof> {
    const rows = await this.transaction.$queryRaw<Array<{
      transaction_isolation: string;
      transaction_read_only: string;
    }>>`SELECT current_setting('transaction_isolation') AS transaction_isolation,
              current_setting('transaction_read_only') AS transaction_read_only`;
    const row = rows[0];
    if (row?.transaction_isolation !== 'repeatable read' || row.transaction_read_only !== 'on') {
      throw new Error('ADR014_READ_ONLY_BOUNDARY_FAILED');
    }
    return Object.freeze({
      transactionIsolation: 'repeatable read' as const,
      transactionReadOnly: true as const,
      databaseHostClass: 'LOCALHOST' as const,
      writeBack: 'FORBIDDEN' as const,
      network: 'NO_EGRESS' as const,
    });
  }

  async listEligibleCases(): Promise<readonly EligibleCaseReference[]> {
    const rows = await this.transaction.case.findMany({
      orderBy: [{ tenantId: 'asc' }, { id: 'asc' }],
      select: { tenantId: true, id: true },
    });
    return Object.freeze(rows.map((row) => Object.freeze({
      tenantId: row.tenantId,
      caseId: row.id,
    })));
  }

  async observeCase(
    reference: EligibleCaseReference,
    context: Readonly<{
      canonicalSha: string;
      sessionOpaqueReference: string;
      asOfDate: string;
      generatedAt: string;
    }>,
  ): Promise<Adr014Rep02CaseObservation> {
    const startedAt = performance.now();
    const canonicalService = buildEngine(this.transaction);
    const balance = await canonicalService.computeCaseBalance(
      reference.tenantId,
      reference.caseId,
      context.asOfDate,
    );
    const cachedCanonical = Object.freeze({
      computeCaseBalance: async () => balance,
    }) as unknown as CaseBalanceService;
    const caseService = buildCaseService(this.transaction, cachedCanonical);
    const legacy = await caseService.getCalculationSummary(
      reference.tenantId,
      reference.caseId,
      context.asOfDate,
    );
    const comparison = new BalanceDisplayShadowDiffService(
      Object.freeze({ getCalculationSummary: async () => legacy }) as unknown as CaseService,
      cachedCanonical,
    );
    const report = await comparison.compare(
      reference.tenantId,
      reference.caseId,
      context.asOfDate,
      context.generatedAt,
    );
    const display = toCaseBalanceDisplay({
      tenantId: reference.tenantId,
      caseId: reference.caseId,
      balance,
      generatedAt: context.generatedAt,
    });
    const rows = [...report.totals.diffs, ...report.bucketDiffs];
    const nonZeroRowCount = rows.filter((row) => row.delta !== null && row.delta !== 0).length;
    const exactMatchRowCount = rows.filter((row) => row.status === 'MATCH').length;
    const notComparableRowCount = rows.filter((row) => row.status === 'NOT_COMPARABLE').length;
    return deepFreeze({
      observationReference: observationReference(
        context.canonicalSha,
        context.sessionOpaqueReference,
        reference,
      ),
      result: resultFor(report),
      primaryDisplaySafety: report.cutoverReadiness.safeForPrimaryDisplay ? 'SAFE' : 'UNSAFE',
      durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      financialRowCount: rows.length,
      exactMatchRowCount,
      nonZeroRowCount,
      notComparableRowCount,
      blockerCodes: sortedUnique([
        ...report.cutoverReadiness.blockers,
        ...report.comparability.blockers.map((blocker) => blocker.code),
      ]),
      feeProjectionStatus: balance.feeProjection.status,
      traceAvailable: display.trace.allocationSteps.length > 0 || display.trace.interestSegments.length > 0,
      nonOfficialSnapshotPresent:
        display.nonOfficialSnapshot.kind === 'NON_OFFICIAL_CASE_BALANCE_SNAPSHOT',
      currencies: sortedUnique(balance.currencyResults.map((row) => currencyClass(row.currency))) as readonly CurrencyCoverage[],
    });
  }
}

export function createPrismaAdr014Rep02Database(databaseUrl: string): Adr014Rep02ReadOnlyDatabase {
  if (!isLocalDatabaseUrl(databaseUrl)) throw new Error('ADR014_SOURCE_NOT_LOCAL');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return Object.freeze({
    locality: 'LOCAL_ONLY' as const,
    async runReadOnly<T>(reader: (transaction: Adr014Rep02ReadTransaction) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL);
        return reader(new PrismaAdr014Rep02ReadTransaction(transaction));
      }, { maxWait: 30_000, timeout: 3_600_000 });
    },
    async disconnect(): Promise<void> {
      await prisma.$disconnect();
    },
  });
}

function stopRequested(config: Adr014Rep02ExecutionConfig): boolean {
  return config.stopFilePath !== undefined && existsSync(config.stopFilePath);
}

function buildReferences(config: Adr014Rep02ExecutionConfig, bindingReference: string) {
  const runUuid = randomUUID();
  const seed = `${config.canonicalSha}:${runUuid}`;
  const sessionOpaqueReference = opaqueReference('session', seed);
  const manifestOpaqueReference = opaqueReference('manifest', `${seed}:manifest`);
  return deepFreeze({
    sessionReference: {
      kind: 'SESSION' as const,
      opaqueReference: sessionOpaqueReference,
      bindingReference,
    },
    manifestReference: {
      kind: 'MANIFEST' as const,
      opaqueReference: manifestOpaqueReference,
      bindingReference,
    },
    manifestApprovalReference: opaqueReference('rep02-manifest-approval', `${seed}:approved`),
    reviewerActorReference: opaqueReference(
      'rep02-reviewer',
      `${seed}:${config.reviewerName.normalize('NFKC').trim().toLocaleLowerCase('tr-TR')}`,
    ),
    reviewerAssignmentReference: opaqueReference('rep02-reviewer-assignment', `${seed}:reviewer`),
  });
}

function preparationRequest(
  preRun: Adr014PreRunAuthorizedPackage,
  refs: ReturnType<typeof buildReferences>,
) {
  return deepFreeze({
    contractVersion: '1' as const,
    enabled: true as const,
    canonicalSha: preRun.canonicalSha,
    environmentReference: preRun.environmentReference,
    sessionReference: refs.sessionReference,
    manifestReference: refs.manifestReference,
    accessAuthorizationReference: preRun.accessAuthorization.reference,
    executionAuthorizationReference: preRun.executionAuthorization.reference,
  });
}

function dryValidate(
  preRun: Adr014PreRunAuthorizedPackage,
  preparation: ReturnType<typeof preparationRequest>,
  generatedAt: string,
): boolean {
  let tick = 0;
  const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' }).validate({
    preparationRequest: preparation,
    preparationConstraints: { currentCanonicalSha: preRun.canonicalSha },
    scenario: 'SESSION_SUCCESS',
    eventContext: {
      timestamp: generatedAt,
      canonicalShaReference: preRun.canonicalSha,
      environmentReference: 'DEVELOPMENT',
    },
    monotonicClock: { readSeconds: () => ++tick },
  });
  return result.status === 'DRY_VALIDATED' && result.factFamilies.length === 7;
}

async function writeOnce(outputPath: string, artifact: Adr014Rep02EvidenceArtifact): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(outputPath, 'wx', 0o600);
    await handle.writeFile(stableJson(artifact), 'utf8');
    await handle.sync();
  } catch (error) {
    if (handle) await fs.unlink(outputPath).catch(() => undefined);
    throw error;
  } finally {
    await handle?.close();
  }
}

function failureCodeForObservation(observation: Adr014Rep02CaseObservation): Adr014Rep02FailureCode | undefined {
  if (observation.nonZeroRowCount > 0 || observation.result === 'NON_ZERO_FINANCIAL_DIFFERENCE') {
    return 'NON_ZERO_FINANCIAL_DISCREPANCY';
  }
  if (observation.notComparableRowCount > 0 || observation.result === 'NOT_COMPARABLE') {
    return 'REQUIRED_EVIDENCE_NOT_COMPARABLE';
  }
  if (observation.blockerCodes.length > 0 || observation.result === 'BLOCKED') {
    return 'CANONICAL_HARD_STOP';
  }
  return undefined;
}

function initialReadSnapshot(boundaryProof: Adr014Rep02BoundaryProof | null = null): Adr014Rep02ReadSnapshot {
  return Object.freeze({
    boundaryProof,
    populationCount: 0,
    observations: Object.freeze([]),
  });
}

function artifactBody(input: {
  config: Adr014Rep02ExecutionConfig;
  status: Adr014Rep02Status;
  failureCodes: readonly Adr014Rep02FailureCode[];
  refs: ReturnType<typeof buildReferences>;
  accessWindow: { startsAt: string; endsAt: string };
  executionWindow: { startsAt: string; endsAt: string };
  snapshot: Adr014Rep02ReadSnapshot;
  capturePackageReference: string | null;
}): Omit<Adr014Rep02EvidenceArtifact, 'artifactDigest'> {
  const observations = input.snapshot.observations;
  const currencies: Record<CurrencyCoverage, number> = {
    TRY: 0, USD: 0, EUR: 0, GBP: 0, CHF: 0, OTHER_OR_INVALID: 0,
  };
  const feeProjectionStatuses: Record<FeeStatus, number> = {
    AVAILABLE: 0, NOT_CALCULATED: 0, UNAVAILABLE: 0,
  };
  for (const observation of observations) {
    for (const currency of observation.currencies) increment(currencies, currency);
    increment(feeProjectionStatuses, observation.feeProjectionStatus);
  }
  const nonZeroRowCount = observations.reduce((sum, row) => sum + row.nonZeroRowCount, 0);
  const notComparableRowCount = observations.reduce((sum, row) => sum + row.notComparableRowCount, 0);
  const exactMatchRowCount = observations.reduce((sum, row) => sum + row.exactMatchRowCount, 0);
  const hardStopCodes = sortedUnique(observations.flatMap((row) => row.blockerCodes));
  const durations = observations.map((row) => row.durationMs);
  return deepFreeze({
    contractVersion: ADR014_REP_02_EXECUTION_CONTRACT_VERSION,
    status: input.status,
    failureCodes: sortedUnique(input.failureCodes) as readonly Adr014Rep02FailureCode[],
    authority: 'NONE' as const,
    official: false as const,
    representativeEvidenceAccepted: false as const,
    pr11Authorized: false as const,
    runtimeCutoverAuthorized: false as const,
    canonicalSha: input.config.canonicalSha,
    sessionReference: input.refs.sessionReference.opaqueReference,
    manifestReference: input.refs.manifestReference.opaqueReference,
    manifestApprovalReference: input.refs.manifestApprovalReference,
    reviewerReference: input.refs.reviewerActorReference,
    actualAccessWindow: Object.freeze(input.accessWindow),
    actualExecutionWindow: Object.freeze(input.executionWindow),
    populationCount: input.snapshot.populationCount,
    requestCount: observations.length,
    baseline: Object.freeze({
      warmupRequestCount: 0 as const,
      latencyMs: latencySummary(durations),
      errorCount: input.failureCodes.includes('SOURCE_READ_FAILED') ? 1 : 0,
      timeoutCount: input.failureCodes.includes('TIMEOUT') ? 1 : 0,
      abortCount: input.status === 'ABORTED' ? 1 : 0,
    }),
    financialReconciliation: Object.freeze({
      exactMatchRowCount,
      nonZeroRowCount,
      notComparableRowCount,
      result: nonZeroRowCount === 0 && notComparableRowCount === 0 &&
        observations.length === input.snapshot.populationCount
        ? 'ZERO_CENT_EXACT' as const
        : 'FAIL_CLOSED' as const,
    }),
    coverage: Object.freeze({
      processedPopulation: observations.length,
      complete: observations.length === input.snapshot.populationCount && input.snapshot.populationCount > 0,
      currencies: Object.freeze(currencies),
      feeProjectionStatuses: Object.freeze(feeProjectionStatuses),
      traceAvailableCount: observations.filter((row) => row.traceAvailable).length,
      nonOfficialSnapshotCount: observations.filter((row) => row.nonOfficialSnapshotPresent).length,
      primaryDisplaySafeCount: observations.filter((row) => row.primaryDisplaySafety === 'SAFE').length,
      primaryDisplayUnsafeCount: observations.filter((row) => row.primaryDisplaySafety === 'UNSAFE').length,
    }),
    hardStops: Object.freeze({
      total: observations.filter((row) => row.blockerCodes.length > 0).length,
      codes: hardStopCodes,
    }),
    sourceBoundary: input.snapshot.boundaryProof,
    evidenceReferenceIndex: Object.freeze(observations.map((row) => row.observationReference).sort()),
    runtimeBindingStatus: input.capturePackageReference ? 'CAPTURE_COMPLETE' as const : 'NOT_COMPLETED' as const,
    capturePackageReference: input.capturePackageReference,
  });
}

function withDigest(body: Omit<Adr014Rep02EvidenceArtifact, 'artifactDigest'>): Adr014Rep02EvidenceArtifact {
  return deepFreeze({
    ...body,
    artifactDigest: `sha256:${sha256(JSON.stringify(body))}`,
  });
}

function validWindow(start: Date, end: Date): { startsAt: string; endsAt: string } {
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 1);
  return Object.freeze({ startsAt: start.toISOString(), endsAt: end.toISOString() });
}

export async function executeAdr014Rep02(
  config: Adr014Rep02ExecutionConfig,
  database: Adr014Rep02ReadOnlyDatabase,
): Promise<Adr014Rep02ExecutionResult> {
  const accessStarted = new Date();
  const executionStarted = new Date();
  let snapshot = initialReadSnapshot();
  const failureCodes: Adr014Rep02FailureCode[] = [];
  let status: Adr014Rep02Status = 'FAILED';
  let capturePackageReference: string | null = null;

  if (!isValidConfig(config) || database.locality !== 'LOCAL_ONLY') {
    throw new Error('ADR014_INVALID_EXECUTION_CONFIG');
  }
  const materialized = materializeAdr014FirstV2PreRunPackageInstance(config.canonicalSha);
  if (materialized.authorization.status !== 'PRE_RUN_AUTHORIZED') {
    throw new Error('ADR014_PRE_RUN_PACKAGE_BLOCKED');
  }
  const preRun: Adr014PreRunAuthorizedPackage = materialized.authorization.package;
  const refs = buildReferences(config, preRun.environmentReference.bindingReference);
  const preparation = preparationRequest(preRun, refs);
  const plan = buildAdr014RepresentativeExecutionPlan({
    contractVersion: '1', preparationRequest: preparation, outputPath: config.outputPath,
  }, {
    mode: 'OWNER_AUTHORIZED_LOCAL',
    currentCanonicalSha: config.canonicalSha,
    ownerControlledOutputRoot: config.outputRoot,
    sourceLocality: 'LOCAL_ONLY',
    networkBoundary: 'NO_EGRESS',
  });
  if (!('executionPlanReference' in plan)) throw new Error('ADR014_EXECUTION_PLAN_BLOCKED');
  const executionPlan: Adr014RepresentativeExecutionPlan = plan;
  if (!dryValidate(preRun, preparation, executionStarted.toISOString())) {
    throw new Error('ADR014_DRY_VALIDATION_FAILED');
  }

  try {
    snapshot = await database.runReadOnly(async (transaction) => {
      const boundaryProof = await transaction.verifyBoundary();
      if (stopRequested(config)) {
        return Object.freeze({
          boundaryProof,
          populationCount: 0,
          observations: Object.freeze([]),
          stoppedBy: 'ABORT_REQUESTED' as const,
        });
      }
      const cases = await transaction.listEligibleCases();
      if (cases.length === 0) {
        return Object.freeze({
          boundaryProof,
          populationCount: 0,
          observations: Object.freeze([]),
          stoppedBy: 'EMPTY_ELIGIBLE_POPULATION' as const,
        });
      }
      const observations: Adr014Rep02CaseObservation[] = [];
      for (const sourceReference of cases) {
        if (stopRequested(config)) {
          return deepFreeze({
            boundaryProof,
            populationCount: cases.length,
            observations,
            stoppedBy: 'ABORT_REQUESTED' as const,
          });
        }
        const observation = await transaction.observeCase(sourceReference, {
          canonicalSha: config.canonicalSha,
          sessionOpaqueReference: refs.sessionReference.opaqueReference,
          asOfDate: executionStarted.toISOString().slice(0, 10),
          generatedAt: executionStarted.toISOString(),
        });
        observations.push(observation);
        const stop = failureCodeForObservation(observation);
        if (stop) {
          return deepFreeze({
            boundaryProof,
            populationCount: cases.length,
            observations,
            stoppedBy: stop,
          });
        }
      }
      return deepFreeze({
        boundaryProof,
        populationCount: cases.length,
        observations,
      });
    });
    if (snapshot.stoppedBy) failureCodes.push(snapshot.stoppedBy);
  } catch (error) {
    failureCodes.push(timeoutFailure(error) ? 'TIMEOUT' : 'SOURCE_READ_FAILED');
  } finally {
    await database.disconnect();
  }

  const executionEnded = new Date();
  const accessEnded = new Date();
  const accessWindow = validWindow(accessStarted, accessEnded);
  const executionWindow = validWindow(executionStarted, executionEnded);
  if (failureCodes.length === 0 && snapshot.populationCount > 0 &&
    snapshot.observations.length === snapshot.populationCount) {
    const binding = bindAdr014RuntimeCapture(preRun, {
      contractVersion: ADR014_PHASED_RUN_AUTHORIZATION_CONTRACT_VERSION,
      preRunPackageReference: preRun.preRunPackageReference,
      sessionReference: refs.sessionReference,
      approvedManifest: {
        reference: refs.manifestReference,
        approvalStatus: config.manifestApproval,
        approvalReference: refs.manifestApprovalReference,
      },
      independentReviewerAssignment: {
        actorReference: refs.reviewerActorReference,
        assignmentReference: refs.reviewerAssignmentReference,
      },
      actualAccessWindow: accessWindow,
      actualExecutionWindow: executionWindow,
      baselineFacts: {
        window: executionWindow,
        warmupRequestCount: 0,
        populationCount: snapshot.populationCount,
        requestCount: snapshot.observations.length,
      },
    });
    if (binding.status === 'CAPTURE_COMPLETE') {
      capturePackageReference = binding.package.capturePackageReference;
      status = 'CAPTURE_COMPLETE';
    } else {
      failureCodes.push('RUNTIME_BINDING_FAILED');
    }
  }
  if (failureCodes.includes('ABORT_REQUESTED')) status = 'ABORTED';
  if (status !== 'CAPTURE_COMPLETE' && status !== 'ABORTED') status = 'FAILED';

  const body = artifactBody({
    config,
    status,
    failureCodes,
    refs,
    accessWindow,
    executionWindow,
    snapshot,
    capturePackageReference,
  });
  const artifact = withDigest({
    ...body,
    evidenceReferenceIndex: Object.freeze([
      executionPlan.executionPlanReference,
      preRun.preRunPackageReference,
      refs.sessionReference.opaqueReference,
      refs.manifestReference.opaqueReference,
      refs.manifestApprovalReference,
      refs.reviewerActorReference,
      ...body.evidenceReferenceIndex,
      ...(capturePackageReference ? [capturePackageReference] : []),
    ].sort()),
  });
  try {
    await writeOnce(config.outputPath, artifact);
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST') {
      throw new Error('ADR014_OUTPUT_ALREADY_EXISTS');
    }
    throw new Error('ADR014_OUTPUT_WRITE_FAILED');
  }
  return Object.freeze({ status, outputPath: config.outputPath, artifact });
}

export function configFromEnvironment(environment: NodeJS.ProcessEnv): Adr014Rep02ExecutionConfig {
  const outputRoot = environment.ADR014_OUTPUT_ROOT ?? '';
  const sessionFile = environment.ADR014_OUTPUT_FILE ?? `adr014-rep-02-${Date.now()}.json`;
  return Object.freeze({
    canonicalSha: environment.ADR014_CANONICAL_SHA ?? '',
    reviewerName: environment.ADR014_REVIEWER_NAME ?? '',
    outputRoot,
    outputPath: path.resolve(outputRoot, sessionFile),
    manifestApproval: environment.ADR014_MANIFEST_APPROVAL === 'APPROVED'
      ? 'APPROVED'
      : '' as never,
    databaseUrl: environment.DATABASE_URL ?? '',
    ...(environment.ADR014_STOP_FILE ? { stopFilePath: environment.ADR014_STOP_FILE } : {}),
  });
}

export async function runAdr014Rep02FromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Adr014Rep02ExecutionResult> {
  const config = configFromEnvironment(environment);
  if (!isValidConfig(config)) throw new Error('ADR014_INVALID_EXECUTION_CONFIG');
  return executeAdr014Rep02(config, createPrismaAdr014Rep02Database(config.databaseUrl));
}

if (require.main === module) {
  runAdr014Rep02FromEnvironment()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({
        status: result.status,
        outputPath: result.outputPath,
        sessionReference: result.artifact.sessionReference,
        manifestReference: result.artifact.manifestReference,
        reviewerReference: result.artifact.reviewerReference,
        populationCount: result.artifact.populationCount,
        requestCount: result.artifact.requestCount,
        capturePackageReference: result.artifact.capturePackageReference,
        artifactDigest: result.artifact.artifactDigest,
      })}\n`);
      process.exitCode = result.status === 'CAPTURE_COMPLETE' ? 0 : 2;
    })
    .catch(() => {
      process.stderr.write('ADR014_REP_02_FAILED\n');
      process.exitCode = 1;
    });
}
