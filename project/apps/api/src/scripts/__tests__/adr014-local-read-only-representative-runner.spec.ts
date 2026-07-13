import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL,
  buildAdr014RepresentativeExecutionPlan,
  createAdr014LocalReadOnlyRepresentativeRunner,
  type Adr014RepresentativeEvidenceReader,
  type Adr014RepresentativeLocalSource,
  type Adr014RepresentativeReadOnlyQueryPort,
} from '../adr014-local-read-only-representative-runner';

const SHA = 'a'.repeat(40);
const BINDING = `adr014-binding:v1:${'b'.repeat(32)}`;
const OBSERVATION = `adr014-observation:v1:${'c'.repeat(64)}`;

function reference(kind: string, slug: string) {
  return Object.freeze({
    kind,
    opaqueReference: `adr014-ref:v1:${slug}:${'d'.repeat(32)}`,
    bindingReference: BINDING,
  });
}

function request(outputPath: string) {
  return Object.freeze({
    contractVersion: '1',
    preparationRequest: Object.freeze({
      contractVersion: '1',
      enabled: true,
      canonicalSha: SHA,
      environmentReference: reference('ENVIRONMENT', 'environment'),
      sessionReference: reference('SESSION', 'session'),
      manifestReference: reference('MANIFEST', 'manifest'),
      accessAuthorizationReference: reference('ACCESS_AUTHORIZATION', 'access-authorization'),
      executionAuthorizationReference: reference(
        'EXECUTION_AUTHORIZATION',
        'execution-authorization',
      ),
    }),
    outputPath,
  });
}

function config(root: string, mode: 'DISABLED' | 'TEST_ONLY' | 'OWNER_AUTHORIZED_LOCAL' = 'TEST_ONLY') {
  return Object.freeze({
    mode,
    currentCanonicalSha: SHA,
    ownerControlledOutputRoot: root,
    sourceLocality: 'LOCAL_ONLY' as const,
    networkBoundary: 'NO_EGRESS' as const,
  });
}

function source(rows: readonly unknown[] = [{ result: 'MATCH' }]) {
  const calls: string[] = [];
  const tx = {
    $executeRawUnsafe: jest.fn(async (query: string) => {
      calls.push(query);
    }),
    $queryRawUnsafe: jest.fn(async (query: string) => {
      calls.push(query);
      return rows;
    }),
  };
  const value: Adr014RepresentativeLocalSource = {
    locality: 'LOCAL_ONLY',
    access: 'READ_ONLY',
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  return { value, tx, calls };
}

function reader(): Adr014RepresentativeEvidenceReader {
  return Object.freeze({
    async read(queryPort: Adr014RepresentativeReadOnlyQueryPort) {
      await queryPort.query('SELECT result FROM synthetic_golden_fixture ORDER BY result');
      return Object.freeze({
        observations: Object.freeze([
          Object.freeze({
            observationReference: OBSERVATION,
            result: 'MATCH' as const,
            primaryDisplaySafety: 'SAFE' as const,
          }),
        ]),
      });
    },
  });
}

function dryValidationRequest() {
  let tick = 0;
  return {
    preparationRequest: request(path.join(tmpdir(), 'unused.json')).preparationRequest,
    preparationConstraints: { currentCanonicalSha: SHA },
    scenario: 'SESSION_SUCCESS',
    eventContext: {
      timestamp: '2026-07-13T15:00:00.000Z',
      canonicalShaReference: SHA,
      environmentReference: 'TEST',
    },
    monotonicClock: { readSeconds: () => ++tick },
  };
}

describe('ADR014-REP-01B local read-only representative runner', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'adr014-rep01b-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('is default-disabled and performs no source read or output write', async () => {
    const localSource = source();
    const outputPath = path.join(root, 'disabled.json');
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader(),
      config(root, 'DISABLED'),
    );

    expect(runner.mode).toBe('DISABLED');
    await expect(runner.run(request(outputPath))).resolves.toEqual({
      contractVersion: '1', status: 'DISABLED',
    });
    expect(localSource.value.$transaction).not.toHaveBeenCalled();
    await expect(fs.access(outputPath)).rejects.toBeDefined();
  });

  it('builds the same immutable execution plan for the same request and config', () => {
    const input = request(path.join(root, 'deterministic.json'));
    const first = buildAdr014RepresentativeExecutionPlan(input, config(root));
    const second = buildAdr014RepresentativeExecutionPlan(input, config(root));

    expect(first).toEqual(second);
    expect('executionPlanReference' in first && first.executionPlanReference)
      .toMatch(/^adr014-execution-plan:v1:[0-9a-f]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      source: 'LOCAL_ONLY', sourceAccess: 'READ_ONLY',
      transaction: 'REPEATABLE_READ_READ_ONLY', network: 'NO_EGRESS', authority: 'NONE',
    });
  });

  it('fails closed before source access when an authorization reference is missing', async () => {
    const localSource = source();
    const candidate = request(path.join(root, 'missing-auth.json')) as Record<string, unknown>;
    const preparation = { ...(candidate.preparationRequest as Record<string, unknown>) };
    delete preparation.executionAuthorizationReference;
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader(),
      config(root),
    );

    await expect(runner.run({ ...candidate, preparationRequest: preparation })).resolves.toEqual({
      contractVersion: '1', status: 'BLOCKED',
      blockerCodes: ['MISSING_EXECUTION_AUTHORIZATION'],
    });
    expect(localSource.value.$transaction).not.toHaveBeenCalled();
  });

  it('enforces the read-only transaction before the synthetic/golden read and writes once locally', async () => {
    const localSource = source();
    const outputPath = path.join(root, 'capture.json');
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader(),
      config(root),
    );

    const result = await runner.run(request(outputPath));

    expect(result.status).toBe('CAPTURED_NOT_ACCEPTED');
    expect(localSource.calls).toEqual([
      ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL,
      'SELECT result FROM synthetic_golden_fixture ORDER BY result',
    ]);
    expect(ADR014_REPRESENTATIVE_RUNNER_READ_ONLY_SQL)
      .toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const artifact = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(artifact).toMatchObject({
      status: 'CAPTURED_NOT_ACCEPTED', authority: 'NONE', official: false,
      representativeEvidenceAccepted: false, runtimeCutoverAuthorized: false,
      source: 'LOCAL_ONLY', sourceAccess: 'READ_ONLY',
      transaction: 'REPEATABLE_READ_READ_ONLY', network: 'NO_EGRESS',
      observationCount: 1,
    });
    expect(artifact.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    await expect(runner.run(request(outputPath))).resolves.toEqual({
      contractVersion: '1', status: 'BLOCKED', blockerCodes: ['OUTPUT_ALREADY_EXISTS'],
    });
  });

  it('honors stop before source access and after the bounded read without writing output', async () => {
    const beforeSource = source();
    const beforePath = path.join(root, 'before-abort.json');
    const beforeRunner = createAdr014LocalReadOnlyRepresentativeRunner(
      beforeSource.value,
      reader(),
      config(root),
    );
    await expect(beforeRunner.run(request(beforePath), { isAbortRequested: () => true }))
      .resolves.toEqual({
        contractVersion: '1', status: 'ABORTED', blockerCodes: ['ABORT_REQUESTED'],
      });
    expect(beforeSource.value.$transaction).not.toHaveBeenCalled();

    const duringSource = source();
    let aborted = false;
    const duringReader: Adr014RepresentativeEvidenceReader = {
      async read(queryPort) {
        await queryPort.query('SELECT result FROM synthetic_golden_fixture');
        aborted = true;
        return { observations: [] };
      },
    };
    const duringPath = path.join(root, 'during-abort.json');
    const duringRunner = createAdr014LocalReadOnlyRepresentativeRunner(
      duringSource.value,
      duringReader,
      config(root),
    );
    await expect(duringRunner.run(request(duringPath), { isAbortRequested: () => aborted }))
      .resolves.toMatchObject({ status: 'ABORTED', blockerCodes: ['ABORT_REQUESTED'] });
    await expect(fs.access(duringPath)).rejects.toBeDefined();
  });

  it('delegates synthetic lifecycle dry-validation to the canonical PE-06D orchestrator', () => {
    const localSource = source();
    const runner = createAdr014LocalReadOnlyRepresentativeRunner(
      localSource.value,
      reader(),
      config(root),
    );
    const result = runner.dryValidate(dryValidationRequest());

    expect(result.status).toBe('DRY_VALIDATED');
    if (result.status !== 'DRY_VALIDATED') throw new Error('expected dry validation');
    expect(result.factFamilies).toEqual([
      'SESSION', 'PHASE', 'MANIFEST', 'COVERAGE', 'BOUNDARY', 'CONTROL', 'HEALTH',
    ]);
    expect(localSource.value.$transaction).not.toHaveBeenCalled();
  });
});
