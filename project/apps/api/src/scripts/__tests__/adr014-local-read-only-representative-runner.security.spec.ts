import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type {
  Adr014RepresentativeEvidenceReader,
  Adr014RepresentativeLocalSource,
} from '../adr014-local-read-only-representative-runner';
import {
  buildAdr014RepresentativeExecutionPlan,
  createAdr014LocalReadOnlyRepresentativeRunner,
} from '../adr014-local-read-only-representative-runner';

const SHA = '1'.repeat(40);
const BINDING = `adr014-binding:v1:${'2'.repeat(32)}`;

function reference(kind: string, slug: string) {
  return {
    kind,
    opaqueReference: `adr014-ref:v1:${slug}:${'3'.repeat(32)}`,
    bindingReference: BINDING,
  };
}

function request(outputPath: string) {
  return {
    contractVersion: '1',
    preparationRequest: {
      contractVersion: '1', enabled: true, canonicalSha: SHA,
      environmentReference: reference('ENVIRONMENT', 'environment'),
      sessionReference: reference('SESSION', 'session'),
      manifestReference: reference('MANIFEST', 'manifest'),
      accessAuthorizationReference: reference('ACCESS_AUTHORIZATION', 'access-authorization'),
      executionAuthorizationReference: reference('EXECUTION_AUTHORIZATION', 'execution-authorization'),
    },
    outputPath,
  };
}

function config(root: string) {
  return {
    mode: 'TEST_ONLY' as const,
    currentCanonicalSha: SHA,
    ownerControlledOutputRoot: root,
    sourceLocality: 'LOCAL_ONLY' as const,
    networkBoundary: 'NO_EGRESS' as const,
  };
}

function source(overrides: Partial<Adr014RepresentativeLocalSource> = {}) {
  const tx = {
    $executeRawUnsafe: jest.fn(async () => undefined),
    $queryRawUnsafe: jest.fn(async () => []),
  };
  const value: Adr014RepresentativeLocalSource = {
    locality: 'LOCAL_ONLY', access: 'READ_ONLY',
    $transaction: jest.fn(async (callback) => callback(tx)),
    ...overrides,
  };
  return { value, tx };
}

const BUSINESS_IDENTIFIER_LEAK = /tenantId|caseId|debtorId|creditorId|clientId|personId/;
const MONETARY_OR_INTERNAL_LEAK = /amount|principal|interest|fee|currency|rawError|stack|metadata/;
const HASH_COLLISION_SEARCH_LIMIT = 20000;

// Opak referans/digest alanlari (SHA-256 digest veya adr014-ref token'i) sozlesme geregi
// anlam tasimaz; rastgele hex baytlari, tamamen hex-gecerli harflerden olusan tek yasakli
// terim olan "fee"yi tesaduefen icerebilir (MR-057). Once her alanin hala kendi opak
// sekline uydugu dogrulanir (kacak veri o alana sizdirilamaz), sonra degerleri maskelenip
// geri kalan her sey -- yeni/beklenmeyen alanlar dahil -- taranir.
const OPAQUE_REFERENCE_SHAPES: Readonly<Record<string, RegExp>> = Object.freeze({
  environmentReference: /^adr014-ref:v1:environment:[0-9a-f]{32}$/,
  sessionReference: /^adr014-ref:v1:session:[0-9a-f]{32}$/,
  manifestReference: /^adr014-ref:v1:manifest:[0-9a-f]{32}$/,
  accessAuthorizationReference: /^adr014-ref:v1:access-authorization:[0-9a-f]{32}$/,
  executionAuthorizationReference: /^adr014-ref:v1:execution-authorization:[0-9a-f]{32}$/,
  executionPlanReference: /^adr014-execution-plan:v1:[0-9a-f]{64}$/,
  artifactDigest: /^sha256:[0-9a-f]{64}$/,
});
const OBSERVATION_REFERENCE_SHAPE = /^adr014-observation:v1:[0-9a-f]{64}$/;

function assertNoSemanticLeak(artifact: Record<string, unknown>): void {
  for (const [field, shape] of Object.entries(OPAQUE_REFERENCE_SHAPES)) {
    expect(String(artifact[field])).toMatch(shape);
  }
  const observations = artifact.observations as ReadonlyArray<Record<string, unknown>>;
  observations.forEach((observation) => {
    expect(String(observation.observationReference)).toMatch(OBSERVATION_REFERENCE_SHAPE);
  });

  const redacted = JSON.stringify({
    ...artifact,
    ...Object.fromEntries(
      Object.keys(OPAQUE_REFERENCE_SHAPES).map((field) => [field, '[OPAQUE_REFERENCE]']),
    ),
    observations: observations.map((observation) => ({
      ...observation,
      observationReference: '[OPAQUE_REFERENCE]',
    })),
  });
  expect(redacted).not.toMatch(BUSINESS_IDENTIFIER_LEAK);
  expect(redacted).not.toMatch(MONETARY_OR_INTERNAL_LEAK);
}

function validArtifactFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: '1',
    status: 'CAPTURED_NOT_ACCEPTED',
    authority: 'NONE',
    official: false,
    representativeEvidenceAccepted: false,
    runtimeCutoverAuthorized: false,
    canonicalSha: SHA,
    environmentReference: `adr014-ref:v1:environment:${'3'.repeat(32)}`,
    sessionReference: `adr014-ref:v1:session:${'3'.repeat(32)}`,
    manifestReference: `adr014-ref:v1:manifest:${'3'.repeat(32)}`,
    accessAuthorizationReference: `adr014-ref:v1:access-authorization:${'3'.repeat(32)}`,
    executionAuthorizationReference: `adr014-ref:v1:execution-authorization:${'3'.repeat(32)}`,
    executionPlanReference: `adr014-execution-plan:v1:${'0'.repeat(64)}`,
    source: 'LOCAL_ONLY',
    sourceAccess: 'READ_ONLY',
    transaction: 'REPEATABLE_READ_READ_ONLY',
    network: 'NO_EGRESS',
    observationCount: 1,
    observations: [{
      observationReference: `adr014-observation:v1:${'6'.repeat(64)}`,
      result: 'NOT_COMPARABLE',
      primaryDisplaySafety: 'NOT_EVALUATED',
    }],
    artifactDigest: `sha256:${'0'.repeat(64)}`,
    ...overrides,
  };
}

describe('ADR014-REP-01B security and boundary regression', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'adr014-rep01b-security-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    'INSERT INTO evidence(value) VALUES (1)',
    'WITH removed AS (DELETE FROM evidence RETURNING *) SELECT * FROM removed',
    'SELECT * FROM evidence; DROP TABLE evidence',
    'SELECT * FROM evidence -- hidden mutation',
    'SET TRANSACTION READ WRITE',
  ])('rejects write-capable or multi-statement SQL: %s', async (query) => {
    const localSource = source();
    const evidenceReader: Adr014RepresentativeEvidenceReader = {
      async read(port) {
        await port.query(query);
        return { observations: [] };
      },
    };
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      evidenceReader,
      config(root),
    );
    await expect(runner.run(request(path.join(root, 'rejected.json')))).resolves.toEqual({
      contractVersion: '1', status: 'BLOCKED',
      blockerCodes: ['WRITE_CAPABLE_QUERY_REJECTED'],
    });
    expect(localSource.tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a source that does not attest LOCAL_ONLY and READ_ONLY', async () => {
    const localSource = source({ access: 'READ_WRITE' as 'READ_ONLY' });
    const reader: Adr014RepresentativeEvidenceReader = { read: async () => ({ observations: [] }) };
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader,
      config(root),
    );
    await expect(runner.run(request(path.join(root, 'source.json')))).resolves.toEqual({
      contractVersion: '1', status: 'BLOCKED', blockerCodes: ['SOURCE_BOUNDARY_INVALID'],
    });
    expect(localSource.value.$transaction).not.toHaveBeenCalled();
  });

  it('rejects output outside the owner-controlled root', async () => {
    const localSource = source();
    const reader: Adr014RepresentativeEvidenceReader = { read: async () => ({ observations: [] }) };
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader,
      config(root),
    );
    const outside = path.join(path.dirname(root), 'outside-evidence.json');

    await expect(runner.run(request(outside))).resolves.toEqual({
      contractVersion: '1', status: 'BLOCKED', blockerCodes: ['OUTPUT_OUTSIDE_OWNER_ROOT'],
    });
    expect(localSource.value.$transaction).not.toHaveBeenCalled();
  });

  it('rejects symlink traversal outside the owner-controlled root', async () => {
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'adr014-rep01b-outside-'));
    const link = path.join(root, 'escape');
    try {
      await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
      const localSource = source();
      const reader: Adr014RepresentativeEvidenceReader = { read: async () => ({ observations: [] }) };
      const runner = createAdr014LocalReadOnlyRepresentativeRunner(
        localSource.value,
        reader,
        config(root),
      );
      await expect(runner.run(request(path.join(link, 'escaped.json')))).resolves.toEqual({
        contractVersion: '1', status: 'BLOCKED', blockerCodes: ['OUTPUT_OUTSIDE_OWNER_ROOT'],
      });
      expect(localSource.value.$transaction).not.toHaveBeenCalled();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects extra, duplicate or non-opaque evidence observations', async () => {
    const candidates = [
      [{ observationReference: `adr014-observation:v1:${'4'.repeat(64)}`, result: 'MATCH', primaryDisplaySafety: 'SAFE', tenantId: 'raw' }],
      [
        { observationReference: `adr014-observation:v1:${'5'.repeat(64)}`, result: 'MATCH', primaryDisplaySafety: 'SAFE' },
        { observationReference: `adr014-observation:v1:${'5'.repeat(64)}`, result: 'MATCH', primaryDisplaySafety: 'SAFE' },
      ],
      [{ observationReference: 'case-123', result: 'MATCH', primaryDisplaySafety: 'SAFE' }],
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const localSource = source();
      const evidenceReader = {
        read: async () => ({ observations: candidates[index] }),
      } as unknown as Adr014RepresentativeEvidenceReader;
      const runner = createAdr014LocalReadOnlyRepresentativeRunner(
        localSource.value,
        evidenceReader,
        config(root),
      );
      await expect(runner.run(request(path.join(root, `invalid-${index}.json`)))).resolves.toEqual({
        contractVersion: '1', status: 'BLOCKED', blockerCodes: ['INVALID_EVIDENCE_PAYLOAD'],
      });
    }
  });

  it('keeps captured output free of raw business identifiers and monetary payloads', async () => {
    const localSource = source();
    const reader: Adr014RepresentativeEvidenceReader = {
      read: async () => ({
        observations: [{
          observationReference: `adr014-observation:v1:${'6'.repeat(64)}`,
          result: 'NOT_COMPARABLE', primaryDisplaySafety: 'NOT_EVALUATED',
        }],
      }),
    };
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader,
      config(root),
    );
    const outputPath = path.join(root, 'safe.json');
    await expect(runner.run(request(outputPath))).resolves.toMatchObject({
      status: 'CAPTURED_NOT_ACCEPTED',
    });
    const serialized = await fs.readFile(outputPath, 'utf8');
    const artifact = JSON.parse(serialized) as Record<string, unknown>;
    assertNoSemanticLeak(artifact);
    expect(serialized).toContain('"authority": "NONE"');
    expect(serialized).toContain('"representativeEvidenceAccepted": false');
    expect(serialized).toContain('"runtimeCutoverAuthorized": false');
  });

  it('does not false-fail the full runner flow when the execution-plan digest coincidentally contains "fee" (MR-057 regression)', async () => {
    const localSource = source();
    const reader: Adr014RepresentativeEvidenceReader = {
      read: async () => ({
        observations: [{
          observationReference: `adr014-observation:v1:${'6'.repeat(64)}`,
          result: 'NOT_COMPARABLE', primaryDisplaySafety: 'NOT_EVALUATED',
        }],
      }),
    };
    const runnerConfig = config(root);

    let collidingOutputPath: string | undefined;
    for (let attempt = 0; attempt < HASH_COLLISION_SEARCH_LIMIT; attempt += 1) {
      const candidatePath = path.join(root, `collision-${attempt}.json`);
      const plan = buildAdr014RepresentativeExecutionPlan(request(candidatePath), runnerConfig);
      if ('executionPlanReference' in plan && /fee/.test(plan.executionPlanReference)) {
        collidingOutputPath = candidatePath;
        break;
      }
    }
    if (collidingOutputPath === undefined) {
      throw new Error(
        `could not find an executionPlanReference containing "fee" within ${HASH_COLLISION_SEARCH_LIMIT} attempts (~1.5% per-attempt odds); investigate before assuming this regression test is broken`,
      );
    }

    const runner = createAdr014LocalReadOnlyRepresentativeRunner(localSource.value, reader, runnerConfig);
    await expect(runner.run(request(collidingOutputPath))).resolves.toMatchObject({
      status: 'CAPTURED_NOT_ACCEPTED',
    });

    const serialized = await fs.readFile(collidingOutputPath, 'utf8');
    expect(serialized).toMatch(/fee/);
    assertNoSemanticLeak(JSON.parse(serialized) as Record<string, unknown>);
  });

  it('still fails a genuine business-identifier leak in an unexpected field (MR-057 regression)', () => {
    const leaky = validArtifactFixture({ debugContext: 'tenantId=abc-123' });
    expect(() => assertNoSemanticLeak(leaky)).toThrow();
  });

  it('still fails a genuine monetary or internal-diagnostic leak in an unexpected field (MR-057 regression)', () => {
    const leaky = validArtifactFixture({ debugContext: 'amount=500.00 fee=12.50' });
    expect(() => assertNoSemanticLeak(leaky)).toThrow();
  });

  it('does not false-fail when "fee" appears only inside a properly-shaped opaque digest (MR-057 regression)', () => {
    const withFeeInDigest = validArtifactFixture({
      artifactDigest: `sha256:${'0'.repeat(20)}fee${'0'.repeat(41)}`,
    });
    expect(() => assertNoSemanticLeak(withFeeInDigest)).not.toThrow();
  });
});
