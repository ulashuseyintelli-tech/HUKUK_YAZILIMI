import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type {
  Adr014RepresentativeLocalSource,
  Adr014RepresentativeTransactionClient,
} from '../adr014-local-read-only-representative-runner';
import type {
  Adr014BoundOpaqueReference,
  Adr014LocalEvidenceHarnessReferenceKind,
} from '../adr014-disabled-local-evidence-harness';
import type {
  AllocationRepresentativeReplaySourceRowV1,
} from '../../modules/summary-engine/allocation-representative-replay-adapter';
import {
  buildAllocationRepresentativeDatasetManifest,
} from '../../modules/summary-engine/allocation-representative-replay-adapter';
import {
  type AllocationFrozenInputV1,
  buildAllocationFrozenInputFingerprint,
} from '../../modules/summary-engine/allocation-evidence-qualification';
import {
  type AllocationReplayEnvironmentSessionV1,
  type AllocationReplayLaunchPackageV1,
  buildAllocationReplayLaunchPackage,
  createAllocationReplayLaunchController,
  runAllocationReplayLaunchPreflightCli,
  validateAllocationReplayLaunchPackage,
} from '../rcv-ws04-p03-allocation-replay-launch';

const SHA = 'a'.repeat(40);
const NOW = new Date('2026-07-18T10:00:00.000Z');
const BINDING = `adr014-binding:v1:${'b'.repeat(32)}`;
const SELECTION = `rcv-ws04-p03-record:v1:${'c'.repeat(64)}`;

describe('RCV-P2-WS04-P03-A replay preflight and launch package', () => {
  let outputRoot: string;

  beforeEach(async () => {
    outputRoot = await fs.mkdtemp(path.join(tmpdir(), 'ws04-p03-a-'));
  });

  afterEach(async () => {
    await fs.rm(outputRoot, { recursive: true, force: true });
  });

  it('keeps the owner template default-disabled and cannot infer an approval', async () => {
    const templatePath = path.resolve(
      process.cwd(),
      'evidence-templates',
      'rcv-ws04-p03-a-launch-package.template.json',
    );
    const result = await runAllocationReplayLaunchPreflightCli(
      ['--package', templatePath],
      {
        RCV_WS04_P03_LAUNCH_MODE: 'DISABLED',
        RCV_WS04_P03_CANONICAL_SHA: SHA,
      },
    );

    expect(result.status).toBe('BLOCKED');
    if (result.status !== 'BLOCKED') throw new Error('expected blocked template');
    expect(result.blockerCodes).toContain('INVALID_LAUNCH_PACKAGE');
  });

  it('validates a fully bound synthetic package without accessing a provider', () => {
    const launchPackage = validPackage(outputRoot);
    const result = validateAllocationReplayLaunchPackage(
      launchPackage,
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
      NOW,
    );

    expect(result).toEqual({
      contractVersion: 'RCV-WS04-P03-A-V1',
      status: 'READY',
      outputPathReference: expect.stringMatching(
        /^rcv-ws04-p03-output:v1:[0-9a-f]{64}$/,
      ),
    });
  });

  it('fails closed when access, execution or environment approvals are absent', () => {
    const candidate = validPackage(outputRoot);
    const launchPackage = buildAllocationReplayLaunchPackage({
      ...withoutChecksum(candidate),
      accessRecord: {
        ...candidate.accessRecord,
        authorizationStatus: 'NOT_AUTHORIZED',
      },
      executionRecord: {
        ...candidate.executionRecord,
        authorizationStatus: 'NOT_AUTHORIZED',
      },
      environmentSession: {
        ...candidate.environmentSession,
        approvalStatus: 'DRAFT',
      },
    });

    const result = validateAllocationReplayLaunchPackage(
      launchPackage,
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
      NOW,
    );

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: expect.arrayContaining([
        'ACCESS_AUTHORIZATION_REQUIRED',
        'EXECUTION_AUTHORIZATION_REQUIRED',
        'ENVIRONMENT_APPROVAL_REQUIRED',
      ]),
    });
  });

  it('rejects stale SHA, reused authorization and inactive time windows', () => {
    const candidate = validPackage(outputRoot);
    const launchPackage = buildAllocationReplayLaunchPackage({
      ...withoutChecksum(candidate),
      accessRecord: {
        ...candidate.accessRecord,
        authorizationReference: candidate.executionRecord.authorizationReference,
        startsAt: '2026-07-18T11:00:00.000Z',
        endsAt: '2026-07-18T12:00:00.000Z',
      },
      preparationRequest: {
        ...candidate.preparationRequest,
        accessAuthorizationReference: boundReference(
          'ACCESS_AUTHORIZATION',
          candidate.preparationRequest.executionAuthorizationReference
            .opaqueReference,
        ),
      },
    });

    const result = validateAllocationReplayLaunchPackage(
      launchPackage,
      { mode: 'TEST_ONLY', currentCanonicalSha: 'd'.repeat(40) },
      NOW,
    );

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: expect.arrayContaining([
        'CANONICAL_SHA_MISMATCH',
        'ACCESS_WINDOW_INACTIVE',
        'AUTHORIZATION_REFERENCES_NOT_DISTINCT',
      ]),
    });
  });

  it('rejects launch-package payload fields that could carry raw PII', () => {
    const candidate = validPackage(outputRoot);
    const launchPackage = buildAllocationReplayLaunchPackage({
      ...withoutChecksum(candidate),
      payload: {
        caseId: '56f9782e-5d67-4e0f-b841-759a9c6fd37f',
      },
    } as Omit<AllocationReplayLaunchPackageV1, 'checksum'>);

    expect(validateAllocationReplayLaunchPackage(
      launchPackage,
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
      NOW,
    )).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: ['PII_SAFE_OUTPUT_VIOLATION'],
    });
  });

  it('requires a matching technical no-egress proof before provider access', async () => {
    const provider = { readRows: jest.fn(async () => [sourceRow()]) };
    const launchPackage = validPackage(outputRoot);
    const controller = createAllocationReplayLaunchController(
      {
        source: syntheticSource(),
        rowProvider: provider,
        noEgressProbe: {
          verify: jest.fn(async () => ({
            enforced: false,
            attestationReference: opaque('wrong-proof'),
            environmentReference:
              launchPackage.environmentSession.environmentReference,
            sessionReference: launchPackage.environmentSession.sessionReference,
          })),
        },
      },
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
    );

    const result = await controller.launch(launchPackage);

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: ['NO_EGRESS_RUNTIME_PROBE_MISMATCH'],
    });
    expect(provider.readRows).not.toHaveBeenCalled();
  });

  it('rejects an existing create-once output before provider access', async () => {
    const provider = { readRows: jest.fn(async () => [sourceRow()]) };
    const launchPackage = validPackage(outputRoot);
    await fs.writeFile(launchPackage.output.outputPath, '{}', 'utf8');
    const controller = createAllocationReplayLaunchController(
      {
        source: syntheticSource(),
        rowProvider: provider,
        noEgressProbe: matchingNoEgressProbe(
          launchPackage.environmentSession,
        ),
      },
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
    );

    const result = await controller.launch(launchPackage);

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: ['OUTPUT_ALREADY_EXISTS'],
    });
    expect(provider.readRows).not.toHaveBeenCalled();
  });

  it('captures only PII-safe evidence after every launch gate passes', async () => {
    const launchPackage = validPackage(outputRoot);
    const provider = { readRows: jest.fn(async () => [sourceRow()]) };
    const controller = createAllocationReplayLaunchController(
      {
        source: syntheticSource(),
        rowProvider: provider,
        noEgressProbe: matchingNoEgressProbe(
          launchPackage.environmentSession,
        ),
      },
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
    );

    const result = await controller.launch(launchPackage);

    expect(result).toMatchObject({
      status: 'CAPTURED_NOT_ACCEPTED',
      runnerResult: {
        artifact: {
          authority: 'NONE',
          representativeEvidenceAccepted: false,
          runtimeCutoverAuthorized: false,
          sourceAccess: 'READ_ONLY',
          transaction: 'REPEATABLE_READ_READ_ONLY',
          network: 'NO_EGRESS',
        },
      },
    });
    expect(provider.readRows).toHaveBeenCalledTimes(1);
    const output = await fs.readFile(launchPackage.output.outputPath, 'utf8');
    expect(output).not.toContain('synthetic-tenant');
    expect(output).not.toContain('synthetic-case');
    expect(output).not.toContain('synthetic-payment');
    expect(output).not.toContain('10000');
  });

  it('blocks before the row provider when DB read-only state cannot be proved', async () => {
    const launchPackage = validPackage(outputRoot);
    const provider = { readRows: jest.fn(async () => [sourceRow()]) };
    const controller = createAllocationReplayLaunchController(
      {
        source: syntheticSource('off'),
        rowProvider: provider,
        noEgressProbe: matchingNoEgressProbe(
          launchPackage.environmentSession,
        ),
      },
      { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
    );

    const result = await controller.launch(launchPackage);

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockerCodes: ['READ_ONLY_RUNTIME_PROBE_FAILED'],
    });
    expect(provider.readRows).not.toHaveBeenCalled();
  });
});

function validPackage(outputRoot: string): AllocationReplayLaunchPackageV1 {
  const environmentReference = adrReference('environment');
  const sessionReference = adrReference('session');
  const manifestReference = adrReference('manifest');
  const accessReference = adrReference('access-authorization');
  const executionReference = adrReference('execution-authorization');
  const datasetManifest = buildAllocationRepresentativeDatasetManifest({
    contractVersion: 'RCV-WS04-P03-DATASET-V1',
    manifestStatus: 'TEST_FIXTURE',
    sourceClassification: 'SYNTHETIC_FIXTURE',
    selectionShape: 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT',
    privacyBoundary: 'PII_SAFE_REFERENCES_ONLY',
    canonicalSha: SHA,
    environmentReference,
    sessionReference,
    manifestReference,
    datasetVersion: 'synthetic-launch-v1',
    selectionUniverseReference: opaque('selection-universe'),
    selectionMethodReference: opaque('selection-method'),
    distributionalBaseReference: opaque('distributional-base'),
    edgeCaseSupplementReference: opaque('edge-supplement'),
    selectionSetReference: opaque('selection-set'),
    recordCountReference: opaque('record-count'),
    ownerReference: opaque('owner'),
    reviewReference: opaque('review'),
    supersedesManifestReference: null,
    approvedAt: null,
    selectionReferences: [SELECTION],
  });
  const environmentSession: AllocationReplayEnvironmentSessionV1 = {
    approvalStatus: 'APPROVED',
    approvedByReference: opaque('environment-owner'),
    locality: 'LOCAL_OWNER_PC_OFFICE',
    environmentReference,
    sessionReference,
    canonicalSha: SHA,
    database: {
      attestationStatus: 'ATTESTED',
      attestationReference: opaque('read-only-proof'),
      transactionReadOnly: 'on',
      isolationLevel: 'repeatable read',
      verifiedAt: '2026-07-18T09:30:00.000Z',
    },
    network: {
      attestationStatus: 'ATTESTED',
      attestationReference: opaque('no-egress-proof'),
      boundary: 'NO_EGRESS',
      enforcement: 'ENFORCED',
      verifiedAt: '2026-07-18T09:31:00.000Z',
    },
  };
  return buildAllocationReplayLaunchPackage({
    contractVersion: 'RCV-WS04-P03-A-V1',
    taskId: 'RCV-P2-WS04-P03-A',
    enabled: true,
    mode: 'TEST_ONLY',
    canonicalSha: SHA,
    datasetManifest,
    preparationRequest: {
      contractVersion: '1',
      enabled: true,
      canonicalSha: SHA,
      environmentReference: boundReference(
        'ENVIRONMENT',
        environmentReference,
      ),
      sessionReference: boundReference('SESSION', sessionReference),
      manifestReference: boundReference('MANIFEST', manifestReference),
      accessAuthorizationReference: boundReference(
        'ACCESS_AUTHORIZATION',
        accessReference,
      ),
      executionAuthorizationReference: boundReference(
        'EXECUTION_AUTHORIZATION',
        executionReference,
      ),
    },
    accessRecord: {
      authorizationStatus: 'APPROVED',
      authorizationReference: accessReference,
      namedOperatorReference: opaque('operator'),
      approvedByReference: opaque('access-owner'),
      purpose: 'REPRESENTATIVE_ALLOCATION_REPLAY',
      sourceAccess: 'READ_ONLY',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.000Z',
      datasetManifestChecksum: datasetManifest.checksum,
    },
    executionRecord: {
      authorizationStatus: 'APPROVED',
      authorizationReference: executionReference,
      approvedByReference: opaque('execution-owner'),
      purpose: 'REPRESENTATIVE_ALLOCATION_REPLAY',
      singleRun: true,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.000Z',
      canonicalSha: SHA,
      datasetManifestChecksum: datasetManifest.checksum,
    },
    environmentSession,
    output: {
      ownerControlledRoot: outputRoot,
      outputPath: path.join(outputRoot, 'allocation-replay.json'),
      writeMode: 'CREATE_ONCE',
      locality: 'OWNER_CONTROLLED_LOCAL',
      contentBoundary: 'PII_SAFE_EVIDENCE_ONLY',
    },
    productionObservation: 'NOT_AUTHORIZED',
  });
}

function boundReference<K extends Adr014LocalEvidenceHarnessReferenceKind>(
  kind: K,
  opaqueReference: string,
): Adr014BoundOpaqueReference<K> {
  return { kind, opaqueReference, bindingReference: BINDING };
}

function adrReference(
  kind:
    | 'environment'
    | 'session'
    | 'manifest'
    | 'access-authorization'
    | 'execution-authorization',
): string {
  return `adr014-ref:v1:${kind}:${createHash('sha256')
    .update(kind)
    .digest('hex')
    .slice(0, 32)}`;
}

function opaque(kind: string): string {
  return `rcv-ws04-p03-ref:v1:${kind}:${createHash('sha256')
    .update(kind)
    .digest('hex')}`;
}

function matchingNoEgressProbe(
  environment: AllocationReplayEnvironmentSessionV1,
) {
  return {
    verify: jest.fn(async () => ({
      enforced: true,
      attestationReference: environment.network.attestationReference,
      environmentReference: environment.environmentReference,
      sessionReference: environment.sessionReference,
    })),
  };
}

function syntheticSource(
  readOnly: 'on' | 'off' = 'on',
): Adr014RepresentativeLocalSource {
  return {
    locality: 'LOCAL_ONLY',
    access: 'READ_ONLY',
    async $transaction<T>(
      callback: (tx: Adr014RepresentativeTransactionClient) => Promise<T>,
    ): Promise<T> {
      const tx: Adr014RepresentativeTransactionClient = {
        $executeRawUnsafe: jest.fn(async () => 0),
        $queryRawUnsafe: jest.fn(async (query: string) => {
          if (query.includes("current_setting('transaction_read_only')")) {
            return [{
              readOnly,
              isolationLevel: 'repeatable read',
            }];
          }
          return [];
        }),
      };
      return callback(tx);
    },
  };
}

function frozenInput(): AllocationFrozenInputV1 {
  return {
    contractVersion: 'RCV-WS04-P02-V1',
    tenantId: 'synthetic-tenant',
    caseId: 'synthetic-case',
    currency: 'TRY',
    payment: {
      id: 'synthetic-payment',
      amountMinor: '10000',
      effectiveAt: '2026-07-18T09:00:00.000Z',
    },
    claimItems: [{
      id: 'synthetic-claim',
      itemType: 'PRINCIPAL',
      currency: 'TRY',
      demandedAmountMinor: '10000',
      collectedAmountMinor: '10000',
      startAt: '2026-01-01T00:00:00.000Z',
      metadata: null,
    }],
    interest: {
      calculationAt: '2026-07-18T09:00:00.000Z',
      accrualFingerprint: 'synthetic-accrual',
      segmentFingerprint: 'synthetic-segment',
    },
    policy: {
      allocatorPolicy: 'TBK100',
      policyVersion: 'synthetic-v1',
      ancillaryPriority: ['EXPENSE'],
    },
    rounding: {
      minorUnit: 2,
      mode: 'HALF_UP_AWAY_FROM_ZERO',
    },
  };
}

function sourceRow(): AllocationRepresentativeReplaySourceRowV1 {
  const input = frozenInput();
  const fingerprint = buildAllocationFrozenInputFingerprint(input);
  const rows = [{
    claimItemId: 'synthetic-claim',
    legalBucket: 'PRINCIPAL',
    allocationOrder: 1,
    amountMinor: '10000',
  }];
  return {
    selectionReference: SELECTION,
    comparisonContext: 'COMPLETE',
    frozenInput: input,
    persistedLegalAllocation: { fingerprint, rows },
    runtimeAllocation: { fingerprint, rows },
    collectedAmountCache: rows,
    collectionAllocationProjection: rows,
    heldOverpayment: [],
    legacyAllocatorActivated: false,
    collectionAllocationFallback: 'NONE',
  };
}

function withoutChecksum(
  value: AllocationReplayLaunchPackageV1,
): Omit<AllocationReplayLaunchPackageV1, 'checksum'> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'checksum'),
  ) as Omit<AllocationReplayLaunchPackageV1, 'checksum'>;
}
