import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  executeAdr014Rep02,
  type Adr014Rep02CaseObservation,
  type Adr014Rep02ExecutionConfig,
  type Adr014Rep02ReadOnlyDatabase,
  type Adr014Rep02ReadTransaction,
} from '../adr014-rep-02-local-execution';

const SHA = 'a'.repeat(40);

function observation(
  overrides: Partial<Adr014Rep02CaseObservation> = {},
): Adr014Rep02CaseObservation {
  return Object.freeze({
    observationReference: `adr014-observation:v1:${'b'.repeat(64)}`,
    result: 'MATCH',
    primaryDisplaySafety: 'SAFE',
    durationMs: 12.5,
    financialRowCount: 10,
    exactMatchRowCount: 10,
    nonZeroRowCount: 0,
    notComparableRowCount: 0,
    blockerCodes: Object.freeze([]),
    feeProjectionStatus: 'AVAILABLE',
    traceAvailable: true,
    nonOfficialSnapshotPresent: true,
    currencies: Object.freeze(['TRY'] as const),
    ...overrides,
  });
}

function database(observations: readonly Adr014Rep02CaseObservation[]): Adr014Rep02ReadOnlyDatabase {
  const cases = observations.map((_, index) => ({
    tenantId: `raw-tenant-${index}`,
    caseId: `raw-case-${index}`,
  }));
  const tx: Adr014Rep02ReadTransaction = {
    verifyBoundary: jest.fn(async () => Object.freeze({
      transactionIsolation: 'repeatable read',
      transactionReadOnly: true as const,
      databaseHostClass: 'LOCALHOST',
      writeBack: 'FORBIDDEN',
      network: 'NO_EGRESS',
    } as const)),
    listEligibleCases: jest.fn(async () => cases),
    observeCase: jest.fn(async (_reference, context) => {
      const index = (tx.observeCase as jest.Mock).mock.calls.length - 1;
      expect(context.canonicalSha).toBe(SHA);
      return observations[index];
    }),
  };
  return {
    locality: 'LOCAL_ONLY',
    runReadOnly: jest.fn(async (reader) => reader(tx)),
    disconnect: jest.fn(async () => undefined),
  };
}

function config(root: string, file = 'evidence.json'): Adr014Rep02ExecutionConfig {
  return Object.freeze({
    canonicalSha: SHA,
    reviewerName: 'Independent Reviewer',
    outputRoot: root,
    outputPath: path.join(root, file),
    manifestApproval: 'APPROVED',
    databaseUrl: 'postgresql://local:secret@localhost:5432/hukuk_db',
  });
}

describe('ADR014-REP-02 local representative evidence execution', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'adr014-rep02-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('completes runtime binding only after full zero-cent exact coverage', async () => {
    const db = database([observation(), observation({
      observationReference: `adr014-observation:v1:${'c'.repeat(64)}`,
      durationMs: 20,
      feeProjectionStatus: 'NOT_CALCULATED',
      currencies: Object.freeze(['USD'] as const),
    })]);

    const result = await executeAdr014Rep02(config(root), db);

    expect(result.status).toBe('CAPTURE_COMPLETE');
    expect(result.artifact).toMatchObject({
      status: 'CAPTURE_COMPLETE',
      authority: 'NONE',
      official: false,
      representativeEvidenceAccepted: false,
      pr11Authorized: false,
      runtimeCutoverAuthorized: false,
      populationCount: 2,
      requestCount: 2,
      runtimeBindingStatus: 'CAPTURE_COMPLETE',
      financialReconciliation: {
        exactMatchRowCount: 20,
        nonZeroRowCount: 0,
        notComparableRowCount: 0,
        result: 'ZERO_CENT_EXACT',
      },
      coverage: { complete: true, processedPopulation: 2 },
    });
    expect(result.artifact.capturePackageReference)
      .toMatch(/^adr014-capture-package:v2:[0-9a-f]{64}$/);
    expect(result.artifact.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.parse(await fs.readFile(result.outputPath, 'utf8'))).toEqual(result.artifact);
    expect(db.disconnect).toHaveBeenCalledTimes(1);
  });

  it('stops at the first non-zero financial discrepancy and fails closed', async () => {
    const db = database([
      observation({
        result: 'NON_ZERO_FINANCIAL_DIFFERENCE',
        primaryDisplaySafety: 'UNSAFE',
        exactMatchRowCount: 9,
        nonZeroRowCount: 1,
      }),
      observation({ observationReference: `adr014-observation:v1:${'d'.repeat(64)}` }),
    ]);

    const result = await executeAdr014Rep02(config(root, 'non-zero.json'), db);

    expect(result.status).toBe('FAILED');
    expect(result.artifact.failureCodes).toEqual(['NON_ZERO_FINANCIAL_DISCREPANCY']);
    expect(result.artifact.requestCount).toBe(1);
    expect(result.artifact.populationCount).toBe(2);
    expect(result.artifact.coverage.complete).toBe(false);
    expect(result.artifact.financialReconciliation.result).toBe('FAIL_CLOSED');
    expect(result.artifact.runtimeBindingStatus).toBe('NOT_COMPLETED');
    expect(result.artifact.capturePackageReference).toBeNull();
  });

  it('treats NOT_COMPARABLE as a fail-closed required-evidence stop', async () => {
    const db = database([observation({
      result: 'NOT_COMPARABLE',
      primaryDisplaySafety: 'UNSAFE',
      exactMatchRowCount: 8,
      notComparableRowCount: 2,
      blockerCodes: Object.freeze(['MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE']),
    })]);

    const result = await executeAdr014Rep02(config(root, 'not-comparable.json'), db);

    expect(result.status).toBe('FAILED');
    expect(result.artifact.failureCodes).toEqual(['REQUIRED_EVIDENCE_NOT_COMPARABLE']);
    expect(result.artifact.hardStops.codes).toEqual([
      'MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE',
    ]);
    expect(result.artifact.representativeEvidenceAccepted).toBe(false);
  });

  it('honors the deterministic stop file before source enumeration', async () => {
    const stopFilePath = path.join(root, 'STOP');
    await fs.writeFile(stopFilePath, 'stop', 'utf8');
    const db = database([observation()]);

    const result = await executeAdr014Rep02({
      ...config(root, 'aborted.json'), stopFilePath,
    }, db);

    expect(result.status).toBe('ABORTED');
    expect(result.artifact.failureCodes).toEqual(['ABORT_REQUESTED']);
    expect(result.artifact.requestCount).toBe(0);
    expect(result.artifact.baseline.abortCount).toBe(1);
  });

  it('does not overwrite an existing evidence artifact', async () => {
    const input = config(root, 'write-once.json');
    await fs.writeFile(input.outputPath, 'owner-data', 'utf8');

    await expect(executeAdr014Rep02(input, database([observation()])))
      .rejects.toThrow('ADR014_OUTPUT_ALREADY_EXISTS');
    await expect(fs.readFile(input.outputPath, 'utf8')).resolves.toBe('owner-data');
  });
});
