import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import type {
  BuildLegalApplicationPlanCommand,
  CanonicalSnapshotEnvelopeV1,
} from '../contracts';
import {
  LegalApplicationWriter,
  LegalApplicationWriterError,
  type WriteLegalApplicationPlanInput,
} from '../legal-application-writer';
import {
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseCurrencyCode,
  parseEffectiveDate,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceVersionSetHash,
  parseTenantId,
  type ParseResult,
} from '../primitives';
import { validateCanonicalSnapshot } from '../canonical-snapshot-validator';
import { generateRepresentativeCorpus } from './representative-corpus/generator';
import type { RepresentativeCorpusScenarioEvidence } from './representative-corpus/contracts';

const CREATED_AT = new Date('2026-08-02T00:00:00.000Z');

function must<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }
  return result.value;
}

function typedCommand(
  scenario: RepresentativeCorpusScenarioEvidence,
): BuildLegalApplicationPlanCommand {
  const input = scenario.input;
  return Object.freeze({
    tenantId: must(parseTenantId(input.tenantId)),
    caseId: must(parseCaseId(input.caseId)),
    collectionId: must(parseCollectionId(input.collectionId)),
    receiptAmountMinor: must(parseReceiptAmountMinor(input.receiptAmountMinor)),
    currency: must(parseCurrencyCode(input.currency)),
    minorUnit: must(parseMinorUnit(input.minorUnit)),
    applicationEffectiveDate: must(parseEffectiveDate(input.applicationEffectiveDate)),
    expectedSnapshotRef: must(parseSnapshotRef(input.snapshotRef)),
    expectedSnapshotHash: must(parseSnapshotHash(input.snapshotHash)),
    expectedSourceVersionSetHash: must(
      parseSourceVersionSetHash(
        JSON.parse(input.snapshotCanonicalPayload).sourceVersionSetHash,
      ),
    ),
    expectedHistoryBoundaryRef: must(
      parseHistoryBoundaryRef(
        JSON.parse(input.snapshotCanonicalPayload).historyBoundaryRef,
      ),
    ),
    idempotencyKey: must(parseIdempotencyKey(input.idempotencyKey)),
    commandHash: must(parseCommandHash(input.commandHash)),
  });
}

function writerInput(
  scenarioId = '01-single-principal',
): WriteLegalApplicationPlanInput {
  const scenario = generateRepresentativeCorpus().artifact.scenarios.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );
  if (scenario === undefined) {
    throw new Error(`missing representative scenario ${scenarioId}`);
  }
  const command = typedCommand(scenario);
  const rawEnvelope = {
    snapshotRef: scenario.input.snapshotRef,
    snapshotHash: scenario.input.snapshotHash,
    canonicalPayload: scenario.input.snapshotCanonicalPayload,
  };
  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command: {
      ...command,
      receiptAmountMinor: command.receiptAmountMinor.toString(),
    },
    ...(scenario.input.envelopeMode === 'CANONICAL'
      ? { snapshotEnvelope: rawEnvelope }
      : {}),
  });
  const snapshotEnvelope: CanonicalSnapshotEnvelopeV1 = validation.ok
    ? Object.freeze({ ...rawEnvelope, snapshot: validation.value.snapshot })
    : scenario.input.envelopeMode === 'ABSENT'
      ? (undefined as unknown as CanonicalSnapshotEnvelopeV1)
      : ({ ...rawEnvelope, snapshot: Object.freeze({}) } as unknown as CanonicalSnapshotEnvelopeV1);
  return Object.freeze({ command, snapshotEnvelope, createdAt: CREATED_AT });
}

interface MockTransaction {
  readonly $executeRaw: jest.Mock;
  readonly collection: { readonly findFirst: jest.Mock };
  readonly legalApplicationBatch: {
    readonly findUnique: jest.Mock;
    readonly findFirst: jest.Mock;
    readonly create: jest.Mock;
  };
}

function mockTransaction(overrides: Partial<MockTransaction> = {}): MockTransaction {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    collection: {
      findFirst: jest.fn().mockResolvedValue({
        status: 'CONFIRMED',
        confirmedAt: CREATED_AT,
        currency: 'TRY',
      }),
    },
    legalApplicationBatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
    },
    ...overrides,
  };
}

function asPrisma(transaction: MockTransaction): Prisma.TransactionClient {
  return transaction as unknown as Prisma.TransactionClient;
}

function persistedFromCreate(data: any, id = 'batch-1') {
  return {
    id,
    batchType: data.batchType,
    currency: data.currency,
    receiptAmountMinor: data.receiptAmountMinor,
    heldRemainderMinor: data.heldRemainderMinor,
    snapshotContractVersion: data.snapshotContractVersion,
    snapshotSerializationVersion: data.snapshotSerializationVersion,
    snapshotRef: data.snapshotRef,
    snapshotHash: data.snapshotHash,
    snapshotCanonicalPayload: data.snapshotCanonicalPayload,
    sourceVersionSetHash: data.sourceVersionSetHash,
    snapshotAsOfDate: data.snapshotAsOfDate,
    applicationEffectiveDate: data.applicationEffectiveDate,
    historyBoundaryRef: data.historyBoundaryRef,
    engineVersion: data.engineVersion,
    calculationRuleVersion: data.calculationRuleVersion,
    policyVersion: data.policyVersion,
    rateTableVersion: data.rateTableVersion,
    interpretationProfileId: data.interpretationProfileId,
    bucketIdentityVersion: data.bucketIdentityVersion,
    minorUnit: data.minorUnit,
    commandHash: data.commandHash,
    reversesBatchId: data.reversesBatchId,
    applications: data.applications?.create ?? [],
  };
}

async function writerError(
  promise: Promise<unknown>,
): Promise<LegalApplicationWriterError> {
  try {
    await promise;
    throw new Error('expected writer error');
  } catch (error) {
    expect(error).toBeInstanceOf(LegalApplicationWriterError);
    return error as LegalApplicationWriterError;
  }
}

describe('TPA-04D-I02 dormant LegalApplicationWriter', () => {
  const writer = new LegalApplicationWriter();

  it('accepts the canonical snapshot and persists one atomic batch/application graph', async () => {
    const transaction = mockTransaction();
    const input = writerInput();

    const result = await writer.writeApply(asPrisma(transaction), input);

    expect(result).toMatchObject({ batchId: 'batch-1', replayed: false });
    expect(result.plan.planFingerprint).toMatch(
      /^rcv-legal-application-plan:v1:sha256:[0-9a-f]{64}$/,
    );
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.legalApplicationBatch.create).toHaveBeenCalledTimes(1);
    const data = transaction.legalApplicationBatch.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: input.command.tenantId,
      caseId: input.command.caseId,
      collectionId: input.command.collectionId,
      batchType: 'APPLY',
      currency: input.command.currency,
      receiptAmountMinor: input.command.receiptAmountMinor,
      snapshotHash: input.command.expectedSnapshotHash,
      snapshotRef: input.command.expectedSnapshotRef,
      snapshotCanonicalPayload: input.snapshotEnvelope.canonicalPayload,
      reversesBatchId: null,
      createdAt: CREATED_AT,
    });
    expect(data.applications.create).toEqual(
      result.plan.applications.map((application) =>
        expect.objectContaining({
          componentCode: application.componentCode,
          sourceLineageSetRef: application.sourceLineageSetRef,
          bucketContextKey: application.bucketContextKey,
          bucketInstanceId: application.bucketInstanceId,
          sequence: application.sequence,
          appliedAmountMinor: application.appliedAmountMinor,
          bucketBeforeMinor: application.bucketBeforeMinor,
          bucketAfterMinor: application.bucketAfterMinor,
        }),
      ),
    );
  });

  it('rejects an invalid digest before lock, read or write', async () => {
    const transaction = mockTransaction();
    const valid = writerInput();
    const invalid = {
      ...valid,
      snapshotEnvelope: {
        ...valid.snapshotEnvelope,
        snapshotHash: `${valid.snapshotEnvelope.snapshotHash.startsWith('0') ? '1' : '0'}${valid.snapshotEnvelope.snapshotHash.slice(1)}`,
      },
    } as WriteLegalApplicationPlanInput;

    const error = await writerError(writer.writeApply(asPrisma(transaction), invalid));
    expect(error).toMatchObject({
      code: 'WRITER_PLAN_REJECTED',
      planErrorCode: expect.stringMatching(/SNAPSHOT_(?:HASH|REF)_MISMATCH/),
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.collection.findFirst).not.toHaveBeenCalled();
    expect(transaction.legalApplicationBatch.create).not.toHaveBeenCalled();
  });

  it.each([
    ['PENDING', null],
    ['CONFIRMED', null],
    ['CANCELLED', CREATED_AT],
  ])('rejects non-final collection state %s/%s', async (status, confirmedAt) => {
    const transaction = mockTransaction({
      collection: {
        findFirst: jest.fn().mockResolvedValue({ status, confirmedAt, currency: 'TRY' }),
      },
    });
    const error = await writerError(
      writer.writeApply(asPrisma(transaction), writerInput()),
    );
    expect(error.code).toBe('COLLECTION_NOT_CONFIRMED');
    expect(transaction.legalApplicationBatch.create).not.toHaveBeenCalled();
  });

  it('fails closed for tenant/case context absence and persisted currency mismatch', async () => {
    const missing = mockTransaction({
      collection: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    expect(
      (await writerError(writer.writeApply(asPrisma(missing), writerInput()))).code,
    ).toBe('COLLECTION_CONTEXT_MISMATCH');

    const currency = mockTransaction({
      collection: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'CONFIRMED',
          confirmedAt: CREATED_AT,
          currency: 'USD',
        }),
      },
    });
    expect(
      (await writerError(writer.writeApply(asPrisma(currency), writerInput()))).code,
    ).toBe('COLLECTION_CURRENCY_MISMATCH');
  });

  it('returns an exact no-write replay and rejects same-key/different-hash conflict', async () => {
    const input = writerInput();
    const transaction = mockTransaction();
    const first = await writer.writeApply(asPrisma(transaction), input);
    const createdData = transaction.legalApplicationBatch.create.mock.calls[0][0].data;
    transaction.legalApplicationBatch.findUnique.mockResolvedValue(
      persistedFromCreate(createdData),
    );

    const replay = await writer.writeApply(asPrisma(transaction), input);
    expect(replay).toEqual({ batchId: 'batch-1', replayed: true, plan: first.plan });
    expect(transaction.legalApplicationBatch.create).toHaveBeenCalledTimes(1);

    transaction.legalApplicationBatch.findUnique.mockResolvedValue({
      ...persistedFromCreate(createdData),
      commandHash: 'different-command-hash',
    });
    const conflict = await writerError(writer.writeApply(asPrisma(transaction), input));
    expect(conflict.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('rejects replay when persisted legal evidence differs despite the same key/hash', async () => {
    const input = writerInput();
    const transaction = mockTransaction();
    await writer.writeApply(asPrisma(transaction), input);
    const createdData = transaction.legalApplicationBatch.create.mock.calls[0][0].data;
    transaction.legalApplicationBatch.findUnique.mockResolvedValue({
      ...persistedFromCreate(createdData),
      heldRemainderMinor: createdData.heldRemainderMinor + 1n,
    });

    const error = await writerError(writer.writeApply(asPrisma(transaction), input));
    expect(error.code).toBe('PERSISTED_EVIDENCE_MISMATCH');
  });

  it('rejects a second APPLY for the collection and maps a uniqueness race fail-closed', async () => {
    const secondApply = mockTransaction();
    secondApply.legalApplicationBatch.findFirst.mockResolvedValue({ id: 'prior-batch' });
    expect(
      (await writerError(writer.writeApply(asPrisma(secondApply), writerInput()))).code,
    ).toBe('COLLECTION_ALREADY_APPLIED');

    const race = mockTransaction();
    race.legalApplicationBatch.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    expect(
      (await writerError(writer.writeApply(asPrisma(race), writerInput()))).code,
    ).toBe('PERSISTENCE_CONFLICT');
  });

  it('keeps plan and persistence facts deterministic for the same canonical input', async () => {
    const input = writerInput('04-all-components');
    const left = mockTransaction();
    const right = mockTransaction();
    const first = await writer.writeApply(asPrisma(left), input);
    const second = await writer.writeApply(asPrisma(right), input);

    expect(second.plan).toEqual(first.plan);
    expect(right.legalApplicationBatch.create.mock.calls[0][0].data).toEqual(
      left.legalApplicationBatch.create.mock.calls[0][0].data,
    );
  });

  it('preserves exact minor units including the one-minor-unit corpus boundary', async () => {
    const input = writerInput('17-rounding-boundary');
    const transaction = mockTransaction({
      collection: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'CONFIRMED',
          confirmedAt: CREATED_AT,
          currency: input.command.currency,
        }),
      },
    });
    const result = await writer.writeApply(
      asPrisma(transaction),
      input,
    );
    expect(result.plan).toMatchObject({
      receiptAmountMinor: 1n,
      appliedAmountMinor: 1n,
      heldRemainderMinor: 0n,
    });
    expect(result.plan.applications[0]).toMatchObject({ appliedAmountMinor: 1n });
  });

  it('executes all Task 10 representative outcomes without changing the corpus contract', async () => {
    const corpus = generateRepresentativeCorpus();
    for (const scenario of corpus.artifact.scenarios) {
      const transaction = mockTransaction({
        collection: {
          findFirst: jest.fn().mockResolvedValue({
            status: 'CONFIRMED',
            confirmedAt: CREATED_AT,
            currency: scenario.input.currency,
          }),
        },
      });
      if (scenario.outcome.kind === 'PLAN') {
        const result = await writer.writeApply(
          asPrisma(transaction),
          writerInput(scenario.scenarioId),
        );
        expect(result.plan.planFingerprint).toBe(scenario.outcome.planFingerprint);
        expect(result.plan.appliedAmountMinor.toString()).toBe(
          scenario.outcome.appliedAmountMinor,
        );
        continue;
      }

      const error = await writerError(
        writer.writeApply(asPrisma(transaction), writerInput(scenario.scenarioId)),
      );
      expect(error).toMatchObject({
        code: 'WRITER_PLAN_REJECTED',
        planErrorCode: scenario.outcome.errorCode,
      });
      expect(transaction.legalApplicationBatch.create).not.toHaveBeenCalled();
    }
  });

  it('is unreachable by default and has no legacy fallback or circular identity producer', () => {
    const sourceDirectory = join(__dirname, '..');
    const writerSource = readFileSync(
      join(sourceDirectory, 'legal-application-writer.ts'),
      'utf8',
    );
    expect(writerSource).not.toMatch(
      /@Injectable|@Controller|@Resolver|NestFactory|feature.?flag|ClaimItem|collectedAmount|LedgerAllocation|CollectionAllocation/iu,
    );
    expect(writerSource).not.toMatch(
      /produceBucketInstanceId|bucket-instance-identity|computeCanonicalSnapshotHash|canonicalSnapshotRefForHash/,
    );
    expect(writerSource).not.toContain('$transaction');

    const runtimeReferences = readdirSync(join(sourceDirectory, '..'), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((path) =>
        !path.includes(`${join('legal-application-plan', '__tests__')}`) &&
        !path.endsWith(join('legal-application-plan', 'index.ts')) &&
        !path.endsWith(join('legal-application-plan', 'legal-application-writer.ts')),
      )
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(runtimeReferences).not.toMatch(
      /from\s+['"][^'"]*legal-application-writer['"]|\bLegalApplicationWriter\b/,
    );
  });
});
