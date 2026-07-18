import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  type Adr014RepresentativeLocalSource,
  type Adr014RepresentativeTransactionClient,
} from '../../../scripts/adr014-local-read-only-representative-runner';
import {
  type AllocationRepresentativeReplaySourceRowV1,
  buildAllocationRepresentativeDatasetManifest,
  createAllocationRepresentativeReplayRunner,
} from '../allocation-representative-replay-adapter';
import {
  type AllocationFrozenInputV1,
  buildAllocationFrozenInputFingerprint,
} from '../allocation-evidence-qualification';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('WS04-P03 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const SHA = 'a'.repeat(40);
const SELECTION = `rcv-ws04-p03-record:v1:${'b'.repeat(64)}`;
const BINDING = `adr014-binding:v1:${'c'.repeat(32)}`;

function reference(kind: string, slug: string) {
  return Object.freeze({
    kind,
    opaqueReference: `adr014-ref:v1:${slug}:${'d'.repeat(32)}`,
    bindingReference: BINDING,
  });
}

function opaqueReference(kind: string): string {
  return `rcv-ws04-p03-ref:v1:${kind}:${'e'.repeat(64)}`;
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

function datasetManifest() {
  return buildAllocationRepresentativeDatasetManifest({
    contractVersion: 'RCV-WS04-P03-DATASET-V1',
    manifestStatus: 'TEST_FIXTURE',
    sourceClassification: 'DISPOSABLE_POSTGRESQL',
    selectionShape: 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT',
    privacyBoundary: 'PII_SAFE_REFERENCES_ONLY',
    canonicalSha: SHA,
    environmentReference: opaqueReference('environment'),
    sessionReference: opaqueReference('session'),
    manifestReference: opaqueReference('manifest'),
    datasetVersion: 'disposable-v1',
    selectionUniverseReference: opaqueReference('universe'),
    selectionMethodReference: opaqueReference('method'),
    distributionalBaseReference: opaqueReference('base'),
    edgeCaseSupplementReference: opaqueReference('edge'),
    selectionSetReference: opaqueReference('selection'),
    recordCountReference: opaqueReference('count'),
    ownerReference: opaqueReference('owner'),
    reviewReference: opaqueReference('review'),
    supersedesManifestReference: null,
    approvedAt: null,
    selectionReferences: [SELECTION],
  });
}

describeWithDisposableDb('WS04-P03 read-only/no-egress disposable PostgreSQL evidence', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let outputRoot: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    outputRoot = await fs.mkdtemp(path.join(tmpdir(), 'ws04-p03-'));
  });

  afterEach(async () => {
    if (outputRoot) {
      await fs.rm(outputRoot, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('captures only PII-safe fixture evidence inside a DB-enforced read-only transaction', async () => {
    const provider = {
      async readRows(queryPort: { query<T>(
        query: string,
        ...values: readonly unknown[]
      ): Promise<T> }) {
        const result = await queryPort.query<Array<{ payload: unknown }>>(
          'SELECT $1::jsonb AS payload',
          JSON.stringify(sourceRow()),
        );
        return result.map((row) => row.payload as AllocationRepresentativeReplaySourceRowV1);
      },
    };
    const outputPath = path.join(outputRoot, 'evidence.json');
    const runner = createAllocationRepresentativeReplayRunner(
      localSource(prisma),
      provider,
      datasetManifest(),
      {
        mode: 'TEST_ONLY',
        currentCanonicalSha: SHA,
        ownerControlledOutputRoot: outputRoot,
        sourceLocality: 'LOCAL_ONLY',
        networkBoundary: 'NO_EGRESS',
      },
      {
        mode: 'TEST_ONLY',
        dataAccess: 'NOT_AUTHORIZED',
        evidenceExecution: 'NOT_AUTHORIZED',
        productionObservation: 'NOT_AUTHORIZED',
        sourceAccess: 'READ_ONLY',
        networkBoundary: 'NO_EGRESS',
      },
    );

    const result = await runner.run(runRequest(outputPath));

    expect(result).toMatchObject({
      status: 'CAPTURED_NOT_ACCEPTED',
      artifact: {
        sourceAccess: 'READ_ONLY',
        transaction: 'REPEATABLE_READ_READ_ONLY',
        network: 'NO_EGRESS',
        observationCount: 1,
        observations: [{
          result: 'MATCH',
          primaryDisplaySafety: 'SAFE',
        }],
      },
    });
    const output = await fs.readFile(outputPath, 'utf8');
    expect(output).not.toContain('fixture-tenant');
    expect(output).not.toContain('fixture-case');
    expect(output).not.toContain('fixture-payment');
    expect(output).not.toContain('10000');
  });

  it('rejects a write-capable provider query before PostgreSQL can execute it', async () => {
    const outputPath = path.join(outputRoot, 'blocked.json');
    const provider = {
      async readRows(queryPort: { query<T>(query: string): Promise<T> }) {
        await queryPort.query('UPDATE "ClaimItem" SET "status" = "status"');
        return [sourceRow()];
      },
    };
    const runner = createAllocationRepresentativeReplayRunner(
      localSource(prisma),
      provider,
      datasetManifest(),
      {
        mode: 'TEST_ONLY',
        currentCanonicalSha: SHA,
        ownerControlledOutputRoot: outputRoot,
        sourceLocality: 'LOCAL_ONLY',
        networkBoundary: 'NO_EGRESS',
      },
      {
        mode: 'TEST_ONLY',
        dataAccess: 'NOT_AUTHORIZED',
        evidenceExecution: 'NOT_AUTHORIZED',
        productionObservation: 'NOT_AUTHORIZED',
        sourceAccess: 'READ_ONLY',
        networkBoundary: 'NO_EGRESS',
      },
    );

    await expect(runner.run(runRequest(outputPath))).resolves.toEqual({
      contractVersion: '1',
      status: 'BLOCKED',
      blockerCodes: ['WRITE_CAPABLE_QUERY_REJECTED'],
    });
    await expect(fs.access(outputPath)).rejects.toBeDefined();
  });
});

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

function runRequest(outputPath: string) {
  return {
    contractVersion: '1',
    preparationRequest: {
      contractVersion: '1',
      enabled: true,
      canonicalSha: SHA,
      environmentReference: reference('ENVIRONMENT', 'environment'),
      sessionReference: reference('SESSION', 'session'),
      manifestReference: reference('MANIFEST', 'manifest'),
      accessAuthorizationReference: reference(
        'ACCESS_AUTHORIZATION',
        'access-authorization',
      ),
      executionAuthorizationReference: reference(
        'EXECUTION_AUTHORIZATION',
        'execution-authorization',
      ),
    },
    outputPath,
  };
}
