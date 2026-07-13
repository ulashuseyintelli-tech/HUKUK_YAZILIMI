import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  createPrismaAdr014Rep02Database,
  executeAdr014Rep02,
  type Adr014Rep02CaseObservation,
  type Adr014Rep02ReadOnlyDatabase,
} from '../adr014-rep-02-local-execution';

const SOURCE = readFileSync(
  path.resolve(__dirname, '..', 'adr014-rep-02-local-execution.ts'),
  'utf8',
);

describe('ADR014-REP-02 local execution security', () => {
  it('contains no external transport, cloud, AI, telemetry or runtime activation client', () => {
    for (const forbidden of [
      "node:http", "node:https", "node:net", "node:tls", "node:dgram",
      "axios", "fetch(", "openai", "@aws-sdk", "ioredis", "prom-client",
      "NestFactory", "createApplicationContext", "listen(",
    ]) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });

  it('rejects non-local PostgreSQL sources before constructing an adapter', () => {
    expect(() => createPrismaAdr014Rep02Database(
      'postgresql://user:secret@database.example.com:5432/hukuk_db',
    )).toThrow('ADR014_SOURCE_NOT_LOCAL');
    expect(() => createPrismaAdr014Rep02Database(
      'https://localhost:5432/hukuk_db',
    )).toThrow('ADR014_SOURCE_NOT_LOCAL');
  });

  it('never serializes raw source identifiers, reviewer name, credentials, amounts or errors', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'adr014-rep02-sec-'));
    const rawTenant = 'tenant-sensitive-value';
    const rawCase = 'case-sensitive-value';
    const rawReviewer = 'Reviewer Sensitive Name';
    const rawPassword = 'database-secret-value';
    const observation: Adr014Rep02CaseObservation = Object.freeze({
      observationReference: `adr014-observation:v1:${'e'.repeat(64)}`,
      result: 'MATCH',
      primaryDisplaySafety: 'SAFE',
      durationMs: 1,
      financialRowCount: 1,
      exactMatchRowCount: 1,
      nonZeroRowCount: 0,
      notComparableRowCount: 0,
      blockerCodes: Object.freeze([]),
      feeProjectionStatus: 'AVAILABLE',
      traceAvailable: true,
      nonOfficialSnapshotPresent: true,
      currencies: Object.freeze(['TRY'] as const),
    });
    const database: Adr014Rep02ReadOnlyDatabase = {
      locality: 'LOCAL_ONLY',
      runReadOnly: async (reader) => reader({
        verifyBoundary: async () => ({
          transactionIsolation: 'repeatable read', transactionReadOnly: true,
          databaseHostClass: 'LOCALHOST', writeBack: 'FORBIDDEN', network: 'NO_EGRESS',
        }),
        listEligibleCases: async () => [{ tenantId: rawTenant, caseId: rawCase }],
        observeCase: async () => observation,
      }),
      disconnect: async () => undefined,
    };
    try {
      const result = await executeAdr014Rep02({
        canonicalSha: 'f'.repeat(40),
        reviewerName: rawReviewer,
        outputRoot: root,
        outputPath: path.join(root, 'security.json'),
        manifestApproval: 'APPROVED',
        databaseUrl: `postgresql://user:${rawPassword}@localhost:5432/hukuk_db`,
      }, database);
      const serialized = JSON.stringify(result.artifact);
      for (const sensitive of [rawTenant, rawCase, rawReviewer, rawPassword, 'principal', 'amount']) {
        expect(serialized).not.toContain(sensitive);
      }
      expect(result.artifact.representativeEvidenceAccepted).toBe(false);
      expect(result.artifact.pr11Authorized).toBe(false);
      expect(result.artifact.runtimeCutoverAuthorized).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
