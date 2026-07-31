import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeCanonicalSnapshotHash } from '../canonical-snapshot-serializer';
import {
  REPRESENTATIVE_CORPUS_CHECKSUM_PREFIX,
  REPRESENTATIVE_CORPUS_VERSION,
  type GoldenScenarioVector,
} from './representative-corpus/contracts';
import {
  canonicalizeCorpusJson,
  generateRepresentativeCorpus,
} from './representative-corpus/generator';
import {
  REPRESENTATIVE_CORPUS_GOLDEN_CHECKSUM,
  REPRESENTATIVE_CORPUS_GOLDEN_VECTORS,
} from './representative-corpus/golden-vectors';
import { REPRESENTATIVE_CORPUS_SCENARIOS } from './representative-corpus/scenario-manifest';

const EXPECTED_SCENARIO_IDS = Object.freeze([
  '01-single-principal',
  '02-principal-and-interest',
  '03-principal-and-cost',
  '04-all-components',
  '05-partial-application',
  '06-exact-application',
  '07-overpayment-held',
  '08-full-held',
  '09-multiple-receipts-history',
  '10-same-day-history',
  '11-mixed-history',
  '12-full-reversal-expectation',
  '13-currency-mismatch',
  '14-semantic-replay-expectation',
  '15-semantic-conflict-expectation',
  '16-concurrent-command-expectation',
  '17-rounding-boundary',
  '18-legacy-evidence-unknown',
  '19-cross-tenant-rejection',
]);

function summarizeGoldenVectors(): readonly GoldenScenarioVector[] {
  return generateRepresentativeCorpus().artifact.scenarios.map((scenario) => {
    if (scenario.outcome.kind === 'SNAPSHOT_REJECTION') {
      return {
        scenarioId: scenario.scenarioId,
        outcome: scenario.outcome.errorCode,
      };
    }
    return {
      scenarioId: scenario.scenarioId,
      outcome: 'PLAN',
      appliedAmountMinor: scenario.outcome.appliedAmountMinor,
      heldRemainderMinor: scenario.outcome.heldRemainderMinor,
      ...(scenario.outcome.heldReason === undefined
        ? {}
        : { heldReason: scenario.outcome.heldReason }),
      applications: scenario.outcome.applications.map((application) => ({
        componentType: application.componentType,
        appliedAmountMinor: application.appliedAmountMinor,
        bucketAfterMinor: application.bucketAfterMinor,
      })),
    };
  });
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value as Readonly<Record<string, unknown>>)) {
    expectDeeplyFrozen(nested);
  }
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const nested of value) {
      collectKeys(nested, keys);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
}

describe('TPA-04F-ENTRY representative corpus foundation', () => {
  it('generates the ratified nineteen-scenario manifest exactly once and in stable order', () => {
    const generated = generateRepresentativeCorpus();
    expect(REPRESENTATIVE_CORPUS_SCENARIOS).toHaveLength(19);
    expect(generated.artifact.scenarios.map((scenario) => scenario.scenarioId)).toEqual(
      EXPECTED_SCENARIO_IDS,
    );
    expect(new Set(EXPECTED_SCENARIO_IDS).size).toBe(EXPECTED_SCENARIO_IDS.length);
    expect(generated.artifact.task11InputContract.requiredScenarioCount).toBe(19);
    expect(generated.artifact.corpusVersion).toBe(REPRESENTATIVE_CORPUS_VERSION);
  });

  it('reproduces canonical bytes, the pinned checksum and a domain-separated checksum ref', () => {
    const first = generateRepresentativeCorpus();
    const second = generateRepresentativeCorpus();
    expect(second).toEqual(first);
    expect(second.canonicalPayload).toBe(first.canonicalPayload);
    expect(first.checksum).toBe(REPRESENTATIVE_CORPUS_GOLDEN_CHECKSUM);
    expect(first.checksumRef).toBe(
      `${REPRESENTATIVE_CORPUS_CHECKSUM_PREFIX}${REPRESENTATIVE_CORPUS_GOLDEN_CHECKSUM}`,
    );
    expect(first.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(first.canonicalPayload)).toEqual(first.artifact);
    expect(canonicalizeCorpusJson(JSON.parse(first.canonicalPayload))).toBe(
      first.canonicalPayload,
    );

    const snapshotDomainHash = computeCanonicalSnapshotHash(
      Buffer.from(first.canonicalPayload, 'utf8'),
    );
    expect(snapshotDomainHash).not.toBe(first.checksum);
  });

  it('matches independent golden plan/rejection vectors', () => {
    expect(summarizeGoldenVectors()).toEqual(REPRESENTATIVE_CORPUS_GOLDEN_VECTORS);
  });

  it('preserves exact-cent and per-bucket conservation for every successful plan', () => {
    const { scenarios } = generateRepresentativeCorpus().artifact;
    for (const scenario of scenarios) {
      if (scenario.outcome.kind !== 'PLAN') {
        continue;
      }
      const appliedSum = scenario.outcome.applications.reduce(
        (sum, application) => sum + BigInt(application.appliedAmountMinor),
        0n,
      );
      expect(BigInt(scenario.outcome.appliedAmountMinor)).toBe(appliedSum);
      expect(BigInt(scenario.outcome.receiptAmountMinor)).toBe(
        appliedSum + BigInt(scenario.outcome.heldRemainderMinor),
      );
      for (const application of scenario.outcome.applications) {
        expect(BigInt(application.bucketBeforeMinor)).toBe(
          BigInt(application.appliedAmountMinor) + BigInt(application.bucketAfterMinor),
        );
      }
    }
  });

  it('locks deterministic fail-closed tenant, currency and legacy-evidence errors', () => {
    const byId = new Map(
      generateRepresentativeCorpus().artifact.scenarios.map((scenario) => [
        scenario.scenarioId,
        scenario.outcome,
      ]),
    );
    expect(byId.get('13-currency-mismatch')).toEqual({
      kind: 'SNAPSHOT_REJECTION',
      errorCode: 'CURRENCY_OR_MINOR_UNIT_INVALID',
    });
    expect(byId.get('18-legacy-evidence-unknown')).toEqual({
      kind: 'SNAPSHOT_REJECTION',
      errorCode: 'SNAPSHOT_UNAVAILABLE',
    });
    expect(byId.get('19-cross-tenant-rejection')).toEqual({
      kind: 'SNAPSHOT_REJECTION',
      errorCode: 'TENANT_CONTEXT_MISMATCH',
    });
  });

  it('records future writer/reversal obligations without claiming their evidence', () => {
    const scenarios = new Map(
      generateRepresentativeCorpus().artifact.scenarios.map((scenario) => [
        scenario.scenarioId,
        scenario.futureObligation,
      ]),
    );
    expect(scenarios.get('12-full-reversal-expectation')).toBe(
      'FULL_REVERSAL_EXACT_INVERSE_TPA04E',
    );
    expect(scenarios.get('14-semantic-replay-expectation')).toBe(
      'WRITER_REPLAY_NO_NEW_EFFECT_TPA04F',
    );
    expect(scenarios.get('15-semantic-conflict-expectation')).toBe(
      'WRITER_SEMANTIC_CONFLICT_TPA04F',
    );
    expect(scenarios.get('16-concurrent-command-expectation')).toBe(
      'WRITER_CONCURRENCY_SINGLE_WINNER_TPA04F',
    );
  });

  it('keeps all generated evidence deeply immutable and mutation-sensitive', () => {
    const generated = generateRepresentativeCorpus();
    expectDeeplyFrozen(generated);

    const changed = JSON.parse(generated.canonicalPayload) as Record<string, unknown>;
    const task11 = changed.task11InputContract as Record<string, unknown>;
    task11.requiredScenarioCount = 18;
    const changedPayload = canonicalizeCorpusJson(changed);
    const changedChecksum = createHash('sha256')
      .update(Buffer.from(REPRESENTATIVE_CORPUS_VERSION, 'utf8'))
      .update(Buffer.from([0]))
      .update(Buffer.from(changedPayload, 'utf8'))
      .digest('hex');
    expect(changedChecksum).not.toBe(generated.checksum);
  });

  it('excludes legacy allocation/cache fields from every snapshot and plan target', () => {
    const prohibitedKeys = new Set([
      'claimItemId',
      'collectedAmount',
      'ledgerAllocationId',
      'collectionAllocationId',
      'expectedCollectedAmountByClaim',
      'expectedLedgerAllocation',
      'expectedCollectionAllocationProjection',
    ]);
    const generated = generateRepresentativeCorpus();

    for (const scenario of generated.artifact.scenarios) {
      const targetKeys = new Set<string>();
      collectKeys(JSON.parse(scenario.input.snapshotCanonicalPayload), targetKeys);
      collectKeys(scenario.outcome, targetKeys);
      for (const key of prohibitedKeys) {
        expect(targetKeys.has(key)).toBe(false);
      }
    }
    expect(generated.artifact.legacyDisposition).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: 'ClaimItem.collectedAmount', authority: 'PROHIBITED' }),
        expect.objectContaining({ surface: 'LedgerAllocation', authority: 'PROHIBITED' }),
        expect.objectContaining({ surface: 'CollectionAllocation', authority: 'PROHIBITED' }),
      ]),
    );
  });

  it('contains no raw payload, free-text, IBAN or provider evidence slots', () => {
    const payload = generateRepresentativeCorpus().canonicalPayload;
    expect(payload).not.toMatch(
      /\biban\b|providerPayload|rawPayload|freeText|bankDescription|accountNumber/i,
    );
  });

  it('keeps the generator deterministic, local and outside the runtime export graph', () => {
    const corpusDirectory = join(__dirname, 'representative-corpus');
    const generatorSource = readFileSync(join(corpusDirectory, 'generator.ts'), 'utf8');
    expect(generatorSource).not.toMatch(
      /\bDate\.now\(|\bnew Date\(|\bMath\.random\(|\bIntl\.|\bprocess\.env\b|\bfetch\(|@prisma|prisma/i,
    );

    const packageDirectory = join(__dirname, '..');
    const productionSources = readdirSync(packageDirectory)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    for (const sourceName of productionSources) {
      const source = readFileSync(join(packageDirectory, sourceName), 'utf8');
      expect(source).not.toMatch(/representative-corpus/i);
    }
    expect(readFileSync(join(packageDirectory, 'index.ts'), 'utf8')).not.toMatch(
      /representative-corpus/i,
    );
  });

  it('binds this evidence suite to required CI exactly once', () => {
    const apiDirectory = join(__dirname, '../../../../..');
    const manifestsDirectory = join(apiDirectory, 'ci-manifests');
    const expectedPath =
      'src/modules/interest-engine/legal-application-plan/__tests__/representative-corpus.spec.ts';
    const occurrences: string[] = [];

    for (const group of readdirSync(manifestsDirectory)) {
      const groupDirectory = join(manifestsDirectory, group);
      for (const manifestName of readdirSync(groupDirectory).filter((name) => name.endsWith('.txt'))) {
        const manifestPath = join(groupDirectory, manifestName);
        const manifest = readFileSync(manifestPath, 'utf8');
        if (manifest.split(/\r?\n/u).includes(expectedPath)) {
          occurrences.push(`${group}/${manifestName}`);
        }
      }
    }

    expect(occurrences).toEqual(['pure/platform-scripts-shared.txt']);
  });
});
