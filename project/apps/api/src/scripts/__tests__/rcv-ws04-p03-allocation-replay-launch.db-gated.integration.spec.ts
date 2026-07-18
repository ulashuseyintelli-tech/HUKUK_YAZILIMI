import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';
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
  type AllocationReplayLaunchPackageV1,
  buildAllocationReplayLaunchPackage,
  createAllocationReplayLaunchController,
} from '../rcv-ws04-p03-allocation-replay-launch';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('WS04-P03-A DB gate blocked: CI requires TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const SHA = 'a'.repeat(40);
const BINDING = `adr014-binding:v1:${'b'.repeat(32)}`;
const SELECTION = `rcv-ws04-p03-record:v1:${'c'.repeat(64)}`;

describeWithDisposableDb(
  'RCV-P2-WS04-P03-A disposable PostgreSQL launch characterization',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let outputRoot: string;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await prisma.$connect();
    });

    beforeEach(async () => {
      outputRoot = await fs.mkdtemp(path.join(tmpdir(), 'ws04-p03-a-db-'));
    });

    afterEach(async () => {
      await fs.rm(outputRoot, { recursive: true, force: true });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('attests the active read-only transaction before reading fixture rows', async () => {
      const launchPackage = validPackage(outputRoot);
      const provider = {
        async readRows(queryPort: {
          query<T>(query: string, ...values: readonly unknown[]): Promise<T>;
        }) {
          const result = await queryPort.query<Array<{ payload: unknown }>>(
            'SELECT $1::jsonb AS payload',
            JSON.stringify(sourceRow()),
          );
          return result.map((row) =>
            row.payload as AllocationRepresentativeReplaySourceRowV1);
        },
      };
      const controller = createAllocationReplayLaunchController(
        {
          source: localSource(prisma),
          rowProvider: provider,
          noEgressProbe: {
            async verify() {
              return {
                enforced: true,
                attestationReference:
                  launchPackage.environmentSession.network
                    .attestationReference,
                environmentReference:
                  launchPackage.environmentSession.environmentReference,
                sessionReference:
                  launchPackage.environmentSession.sessionReference,
              };
            },
          },
        },
        { mode: 'TEST_ONLY', currentCanonicalSha: SHA },
      );

      const result = await controller.launch(launchPackage);

      expect(result).toMatchObject({
        status: 'CAPTURED_NOT_ACCEPTED',
        runnerResult: {
          artifact: {
            sourceAccess: 'READ_ONLY',
            transaction: 'REPEATABLE_READ_READ_ONLY',
            network: 'NO_EGRESS',
            observationCount: 1,
          },
        },
      });
      const output = await fs.readFile(
        launchPackage.output.outputPath,
        'utf8',
      );
      expect(output).not.toContain('fixture-tenant');
      expect(output).not.toContain('fixture-case');
      expect(output).not.toContain('fixture-payment');
      expect(output).not.toContain('10000');
    });
  },
);

function localSource(prisma: PrismaClient): Adr014RepresentativeLocalSource {
  return {
    locality: 'LOCAL_ONLY',
    access: 'READ_ONLY',
    async $transaction<T>(
      callback: (tx: Adr014RepresentativeTransactionClient) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) =>
        callback(tx as unknown as Adr014RepresentativeTransactionClient));
    },
  };
}

function validPackage(outputRoot: string): AllocationReplayLaunchPackageV1 {
  const environmentReference = adrReference('environment');
  const sessionReference = adrReference('session');
  const manifestReference = adrReference('manifest');
  const accessReference = adrReference('access-authorization');
  const executionReference = adrReference('execution-authorization');
  const datasetManifest = buildAllocationRepresentativeDatasetManifest({
    contractVersion: 'RCV-WS04-P03-DATASET-V1',
    manifestStatus: 'TEST_FIXTURE',
    sourceClassification: 'DISPOSABLE_POSTGRESQL',
    selectionShape: 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT',
    privacyBoundary: 'PII_SAFE_REFERENCES_ONLY',
    canonicalSha: SHA,
    environmentReference,
    sessionReference,
    manifestReference,
    datasetVersion: 'disposable-launch-v1',
    selectionUniverseReference: opaque('universe'),
    selectionMethodReference: opaque('method'),
    distributionalBaseReference: opaque('base'),
    edgeCaseSupplementReference: opaque('edge'),
    selectionSetReference: opaque('selection'),
    recordCountReference: opaque('count'),
    ownerReference: opaque('owner'),
    reviewReference: opaque('review'),
    supersedesManifestReference: null,
    approvedAt: null,
    selectionReferences: [SELECTION],
  });
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
      environmentReference: bound('ENVIRONMENT', environmentReference),
      sessionReference: bound('SESSION', sessionReference),
      manifestReference: bound('MANIFEST', manifestReference),
      accessAuthorizationReference: bound(
        'ACCESS_AUTHORIZATION',
        accessReference,
      ),
      executionAuthorizationReference: bound(
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
    environmentSession: {
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
    },
    output: {
      ownerControlledRoot: outputRoot,
      outputPath: path.join(outputRoot, 'evidence.json'),
      writeMode: 'CREATE_ONCE',
      locality: 'OWNER_CONTROLLED_LOCAL',
      contentBoundary: 'PII_SAFE_EVIDENCE_ONLY',
    },
    productionObservation: 'NOT_AUTHORIZED',
  });
}

function bound<K extends Adr014LocalEvidenceHarnessReferenceKind>(
  kind: K,
  opaqueReference: string,
): Adr014BoundOpaqueReference<K> {
  return { kind, opaqueReference, bindingReference: BINDING };
}

function adrReference(kind: string): string {
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

function frozenInput(): AllocationFrozenInputV1 {
  return {
    contractVersion: 'RCV-WS04-P02-V1',
    tenantId: 'fixture-tenant',
    caseId: 'fixture-case',
    currency: 'TRY',
    payment: {
      id: 'fixture-payment',
      amountMinor: '10000',
      effectiveAt: '2026-07-18T09:00:00.000Z',
    },
    claimItems: [{
      id: 'fixture-claim',
      itemType: 'PRINCIPAL',
      currency: 'TRY',
      demandedAmountMinor: '10000',
      collectedAmountMinor: '10000',
      startAt: '2026-01-01T00:00:00.000Z',
      metadata: null,
    }],
    interest: {
      calculationAt: '2026-07-18T09:00:00.000Z',
      accrualFingerprint: 'fixture-accrual',
      segmentFingerprint: 'fixture-segment',
    },
    policy: {
      allocatorPolicy: 'TBK100',
      policyVersion: 'fixture-v1',
      ancillaryPriority: ['EXPENSE'],
    },
    rounding: { minorUnit: 2, mode: 'HALF_UP_AWAY_FROM_ZERO' },
  };
}

function sourceRow(): AllocationRepresentativeReplaySourceRowV1 {
  const input = frozenInput();
  const fingerprint = buildAllocationFrozenInputFingerprint(input);
  const rows = [{
    claimItemId: 'fixture-claim',
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
