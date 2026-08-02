import {
  BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
  OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION,
  OfficialReceivableApplicationSnapshotProducer,
  allocateValidatedSnapshotForApply,
  computeBucketContextKey,
  computeSourceVersionSetHash,
  encodeCanonicalIdentityFields,
  produceOfficialReceivableSnapshotFromReadModel,
  produceBucketInstanceId,
  validateCanonicalSnapshot,
  type OfficialReceivableSnapshotReadModelV1,
  type ProduceOfficialSnapshotCommandV1,
} from '..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../canonical-snapshot-serializer';
import type { StrictJsonObject } from '../strict-json-parser';
import { REPRESENTATIVE_CORPUS_GOLDEN_VECTORS } from './representative-corpus/golden-vectors';
import { REPRESENTATIVE_CORPUS_SCENARIOS } from './representative-corpus/scenario-manifest';

function command(
  overrides: Partial<ProduceOfficialSnapshotCommandV1> = {},
): ProduceOfficialSnapshotCommandV1 {
  return {
    tenantId: 'tenant-official-01',
    caseId: 'case-official-01',
    targetCollectionId: 'collection-official-01',
    receiptAmountMinor: '10000',
    currency: 'TRY',
    minorUnit: 2,
    snapshotAsOfDate: '2026-08-02',
    applicationEffectiveDate: '2026-08-01',
    ...overrides,
  };
}

function readModel(
  overrides: Partial<OfficialReceivableSnapshotReadModelV1> = {},
): OfficialReceivableSnapshotReadModelV1 {
  return {
    readContractVersion: OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION,
    readConsistency: 'SINGLE_TRANSACTION',
    sourceConcurrencySafe: true,
    identityInputProvenance: 'FINAL_SNAPSHOT_INDEPENDENT',
    tenantId: 'tenant-official-01',
    caseId: 'case-official-01',
    snapshotAsOfDate: '2026-08-02',
    applicationEffectiveDate: '2026-08-01',
    historyBoundaryRef: 'history-boundary:official:v1:42',
    engineVersion: 'receivable-engine:v1',
    calculationRuleVersion: 'calculation-rule:v1',
    policyVersion: 'tbk100-policy:v1',
    rateTableVersion: 'rate-table:v1',
    interpretationProfileId: 'interpretation-profile:v1',
    formationContextAvailable: true,
    targetCollection: {
      collectionId: 'collection-official-01',
      tenantId: 'tenant-official-01',
      caseId: 'case-official-01',
      status: 'CONFIRMED',
      canonicalAdmission: 'PASSED',
      finality: 'FINAL',
      receiptAmountMinor: '10000',
      currency: 'TRY',
      minorUnit: 2,
      sourceReference: 'collection:collection-official-01',
      sourceVersion: 'confirmed:v4',
    },
    receivableSources: [
      { sourceReference: 'formation:case-official-01', sourceVersion: 'formation:v7' },
      { sourceReference: 'interest:case-official-01', sourceVersion: 'interest:v3' },
    ],
    collectionHistory: [
      {
        collectionId: 'collection-prior-confirmed',
        status: 'CONFIRMED',
        sourceReference: 'collection:prior-confirmed',
        sourceVersion: 'confirmed:v2',
      },
      {
        collectionId: 'collection-prior-pending',
        status: 'PENDING',
        sourceReference: 'collection:prior-pending',
        sourceVersion: 'pending:v9',
      },
    ],
    applicationHistory: [
      {
        batchId: 'application-batch-prior-01',
        batchType: 'APPLY',
        receiptAmountMinor: '2000',
        appliedAmountMinor: '1500',
        heldRemainderMinor: '500',
        sourceReference: 'legal-application-batch:prior-01',
        sourceVersion: 'apply:v1',
      },
    ],
    buckets: [
      {
        componentType: 'PRINCIPAL',
        componentCode: 'PRINCIPAL_STANDARD',
        sourceLineageSetRef: 'lineage:principal:v1',
        legalBasisRef: 'legal-basis:tbk100:v1',
        effectiveContextRef: 'effective-period:2026-08',
        priorityPolicyRef: 'priority-policy:tbk100',
        priorityPolicyVersion: 'v1',
        priorityRank: 40,
        liabilityContextRef: 'liability:principal:standard:v1',
        currency: 'TRY',
        minorUnit: 2,
        bucketBalanceMinor: '15000',
      },
      {
        componentType: 'ACCRUED_INTEREST',
        componentCode: 'INTEREST_DEFAULT',
        sourceLineageSetRef: 'lineage:interest:v1',
        legalBasisRef: 'legal-basis:tbk100:v1',
        effectiveContextRef: 'effective-period:2026-08',
        interestRuleRef: 'interest-rule:default:v1',
        priorityPolicyRef: 'priority-policy:tbk100',
        priorityPolicyVersion: 'v1',
        priorityRank: 30,
        liabilityContextRef: 'liability:interest:default:v1',
        currency: 'TRY',
        minorUnit: 2,
        bucketBalanceMinor: '2500',
      },
    ],
    legacyAuthority: {
      evidenceCompleteness: 'PROVEN',
      claimItemCollectedAmount: 'NON_AUTHORITATIVE',
      ledgerAllocation: 'NON_AUTHORITATIVE',
      collectionAllocation: 'NON_AUTHORITATIVE',
    },
    ...overrides,
  };
}

function expectSuccess(
  result: ReturnType<typeof produceOfficialReceivableSnapshotFromReadModel>,
) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.snapshotEnvelope;
}

function validationRequest(envelope: ReturnType<typeof expectSuccess>) {
  return {
    direction: 'APPLY',
    command: {
      tenantId: envelope.snapshot.tenantId,
      caseId: envelope.snapshot.caseId,
      collectionId: envelope.snapshot.targetCollectionId,
      receiptAmountMinor: envelope.snapshot.receiptAmountMinor.toString(),
      currency: envelope.snapshot.currency,
      minorUnit: envelope.snapshot.minorUnit,
      applicationEffectiveDate: envelope.snapshot.applicationEffectiveDate,
      expectedSnapshotRef: envelope.snapshotRef,
      expectedSnapshotHash: envelope.snapshotHash,
      expectedSourceVersionSetHash: envelope.snapshot.sourceVersionSetHash,
      expectedHistoryBoundaryRef: envelope.snapshot.historyBoundaryRef,
      idempotencyKey: 'producer-test:v1',
      commandHash: 'producer-test:v1',
    },
    snapshotEnvelope: {
      snapshotRef: envelope.snapshotRef,
      snapshotHash: envelope.snapshotHash,
      canonicalPayload: envelope.canonicalPayload,
    },
  };
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

describe('TPA-04D-I01 official Receivable snapshot producer', () => {
  it('produces an immutable, self-validating RCV-CAS/v1 envelope without runtime writes', () => {
    const envelope = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    expect(envelope.snapshot.snapshotContractVersion).toBe(
      'CanonicalReceivableApplicationSnapshotV1',
    );
    expect(envelope.snapshot.snapshotSerializationVersion).toBe('RCV-CAS/v1');
    expect(envelope.snapshot.bucketIdentityVersion).toBe('RCV-BINST/v1');
    expect(envelope.snapshot.canonicalBuckets.map((bucket) => bucket.componentType)).toEqual([
      'ACCRUED_INTEREST',
      'PRINCIPAL',
    ]);
    expect(envelope.snapshotRef).toBe(
      `rcv-app-snapshot:v1:sha256:${envelope.snapshotHash}`,
    );
    expect(validateCanonicalSnapshot(validationRequest(envelope)).ok).toBe(true);
    expectDeeplyFrozen(envelope);
  });

  it('is byte-deterministic across source, history and bucket input order', () => {
    const firstRead = readModel();
    const secondRead = readModel({
      receivableSources: [...firstRead.receivableSources].reverse(),
      collectionHistory: [...firstRead.collectionHistory].reverse(),
      applicationHistory: [...firstRead.applicationHistory].reverse(),
      buckets: [...firstRead.buckets].reverse(),
    });
    const first = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), firstRead),
    );
    const second = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), secondRead),
    );
    expect(second.canonicalPayload).toBe(first.canonicalPayload);
    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.snapshotRef).toBe(first.snapshotRef);
  });

  it('keeps final snapshot hash binding without feeding that digest back into instance identity', () => {
    const first = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    const second = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(
        command(),
        readModel({ engineVersion: 'receivable-engine:v2' }),
      ),
    );
    expect(second.snapshotHash).not.toBe(first.snapshotHash);
    expect(second.snapshotRef).not.toBe(first.snapshotRef);
    expect(second.snapshot.canonicalBuckets.map((bucket) => bucket.bucketInstanceId)).toEqual(
      first.snapshot.canonicalBuckets.map((bucket) => bucket.bucketInstanceId),
    );
  });

  it('uses tagged, length-prefixed NFC UTF-8 identity encoding without ambiguity', () => {
    const left = encodeCanonicalIdentityFields([
      { tag: 'first', value: 'ab' },
      { tag: 'second', value: 'c' },
    ]);
    const right = encodeCanonicalIdentityFields([
      { tag: 'first', value: 'a' },
      { tag: 'second', value: 'bc' },
    ]);
    const composed = encodeCanonicalIdentityFields([{ tag: 'value', value: 'é' }]);
    const decomposed = encodeCanonicalIdentityFields([{ tag: 'value', value: 'e\u0301' }]);
    expect(left.equals(right)).toBe(false);
    expect(composed.equals(decomposed)).toBe(true);
  });

  it('binds bucketInstanceId to every ratified non-circular preimage field', () => {
    const base = {
      identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      sourceVersionSetHash: 'a'.repeat(64),
      historyBoundaryRef: 'history:v1',
      snapshotAsOfDate: '2026-08-02',
      applicationEffectiveDate: '2026-08-01',
      calculationRuleVersion: 'rule:v1',
      bucketContextKey: `bctx:v1:sha256:${'b'.repeat(64)}`,
    } as const;
    const variants = [
      base,
      { ...base, tenantId: 'tenant-2' },
      { ...base, caseId: 'case-2' },
      { ...base, sourceVersionSetHash: 'c'.repeat(64) },
      { ...base, historyBoundaryRef: 'history:v2' },
      { ...base, snapshotAsOfDate: '2026-08-03' },
      { ...base, applicationEffectiveDate: '2026-08-02' },
      { ...base, calculationRuleVersion: 'rule:v2' },
      { ...base, bucketContextKey: `bctx:v1:sha256:${'d'.repeat(64)}` },
    ];
    const ids = variants.map((variant) => {
      const result = produceBucketInstanceId(variant);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error.code);
      }
      return result.value;
    });
    expect(new Set(ids).size).toBe(variants.length);
    expect(ids[0]).toMatch(/^binst:v1:sha256:[0-9a-f]{64}$/);
    expect(Object.keys(base)).not.toContain('snapshotHash');
    expect(Object.keys(base)).not.toContain('snapshotRef');
  });

  it('keeps sourceVersionSetHash, context and instance domains separated', () => {
    const sourceHash = computeSourceVersionSetHash([
      { sourceReference: 'source:1', sourceVersion: 'v1' },
    ]);
    const contextKey = computeBucketContextKey({
      componentType: 'PRINCIPAL',
      componentCode: 'PRINCIPAL_STANDARD',
      currency: 'TRY',
      minorUnit: 2,
      legalBasisRef: 'legal-basis:v1',
      effectiveContextRef: 'effective:v1',
      priorityPolicyRef: 'priority:v1',
      priorityPolicyVersion: 'v1',
      priorityRank: 40,
      liabilityContextRef: 'liability:v1',
    });
    const instanceResult = produceBucketInstanceId({
      identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
      tenantId: 'tenant-1',
      caseId: 'case-1',
      sourceVersionSetHash: sourceHash,
      historyBoundaryRef: 'history:v1',
      snapshotAsOfDate: '2026-08-02',
      applicationEffectiveDate: '2026-08-01',
      calculationRuleVersion: 'rule:v1',
      bucketContextKey: contextKey,
    });
    expect(instanceResult.ok).toBe(true);
    if (!instanceResult.ok) {
      throw new Error(instanceResult.error.code);
    }
    const instanceId = instanceResult.value;
    expect(contextKey.slice(-64)).not.toBe(sourceHash);
    expect(instanceId.slice(-64)).not.toBe(sourceHash);
    expect(instanceId.slice(-64)).not.toBe(contextKey.slice(-64));
  });

  it('fails closed on duplicate legal bucket context instead of merging balances', () => {
    const first = readModel().buckets[0];
    const result = produceOfficialReceivableSnapshotFromReadModel(
      command(),
      readModel({ buckets: [first, { ...first, bucketBalanceMinor: '1' }] }),
    );
    expect(result).toEqual({ ok: false, error: { code: 'DUPLICATE_BUCKET_CONTEXT' } });
  });

  it.each([
    ['tenant mismatch', command({ tenantId: 'tenant-other' }), 'TENANT_CONTEXT_MISMATCH'],
    ['case mismatch', command({ caseId: 'case-other' }), 'CASE_CONTEXT_MISMATCH'],
    ['currency mismatch', command({ currency: 'USD' }), 'CURRENCY_OR_MINOR_UNIT_INVALID'],
    ['zero receipt', command({ receiptAmountMinor: '0' }), 'RECEIPT_AMOUNT_INVALID'],
  ] as const)('rejects %s', (_title, producerCommand, code) => {
    const result = produceOfficialReceivableSnapshotFromReadModel(
      producerCommand,
      readModel(),
    );
    expect(result).toEqual({ ok: false, error: { code } });
  });

  it('requires confirmed, admitted and final target receipt evidence', () => {
    for (const targetCollection of [
      { ...readModel().targetCollection, status: 'PENDING' as const },
      { ...readModel().targetCollection, canonicalAdmission: 'NOT_PROVEN' as const },
      { ...readModel().targetCollection, finality: 'NOT_FINAL' as const },
    ]) {
      expect(
        produceOfficialReceivableSnapshotFromReadModel(
          command(),
          readModel({ targetCollection }),
        ),
      ).toEqual({ ok: false, error: { code: 'TARGET_COLLECTION_INVALID' } });
    }
  });

  it('excludes unconfirmed receipt history but binds confirmed and application history', () => {
    const baseline = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    const pendingChanged = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(
        command(),
        readModel({
          collectionHistory: readModel().collectionHistory.map((entry) =>
            entry.status === 'PENDING' ? { ...entry, sourceVersion: 'pending:v999' } : entry,
          ),
        }),
      ),
    );
    expect(pendingChanged.snapshotHash).toBe(baseline.snapshotHash);

    const confirmedChanged = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(
        command(),
        readModel({
          collectionHistory: readModel().collectionHistory.map((entry) =>
            entry.status === 'CONFIRMED' ? { ...entry, sourceVersion: 'confirmed:v999' } : entry,
          ),
        }),
      ),
    );
    expect(confirmedChanged.snapshotHash).not.toBe(baseline.snapshotHash);

    const reversal = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(
        command(),
        readModel({
          applicationHistory: [
            ...readModel().applicationHistory,
            {
              batchId: 'reversal-batch-1',
              batchType: 'REVERSAL',
              receiptAmountMinor: '2000',
              appliedAmountMinor: '2000',
              heldRemainderMinor: '0',
              reversesBatchId: 'application-batch-prior-01',
              sourceReference: 'legal-application-batch:reversal-1',
              sourceVersion: 'reversal:v1',
            },
          ],
        }),
      ),
    );
    expect(reversal.snapshotHash).not.toBe(baseline.snapshotHash);
  });

  it('rejects impossible application history and target leakage into pre-application history', () => {
    const impossible = produceOfficialReceivableSnapshotFromReadModel(
      command(),
      readModel({
        applicationHistory: [
          {
            ...readModel().applicationHistory[0],
            receiptAmountMinor: '2000',
            appliedAmountMinor: '1800',
            heldRemainderMinor: '500',
          },
        ],
      }),
    );
    expect(impossible).toEqual({
      ok: false,
      error: { code: 'FORMATION_CONTEXT_INCOMPLETE' },
    });

    const targetLeakage = produceOfficialReceivableSnapshotFromReadModel(
      command(),
      readModel({
        collectionHistory: [
          {
            collectionId: command().targetCollectionId,
            status: 'CONFIRMED',
            sourceReference: 'collection:target-leak',
            sourceVersion: 'v1',
          },
        ],
      }),
    );
    expect(targetLeakage).toEqual({
      ok: false,
      error: { code: 'HISTORY_BOUNDARY_UNAUTHORIZED' },
    });
  });

  it('keeps legacy surfaces non-authoritative and rejects unknown legacy disposition', () => {
    const envelope = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    expect(envelope.canonicalPayload).not.toMatch(
      /ClaimItem|collectedAmount|LedgerAllocation|CollectionAllocation/,
    );
    for (const evidenceCompleteness of ['UNKNOWN', 'NOT_PROVEN'] as const) {
      expect(
        produceOfficialReceivableSnapshotFromReadModel(
          command(),
          readModel({
            legacyAuthority: {
              ...readModel().legacyAuthority,
              evidenceCompleteness,
            },
          }),
        ),
      ).toEqual({ ok: false, error: { code: 'LEGACY_AUTHORITY_UNSAFE' } });
    }
  });

  it('uses the caller transaction and invokes the read port exactly once', async () => {
    const transaction = Object.freeze({ transactionId: 'tx-1' });
    const readSnapshot = jest.fn().mockResolvedValue(readModel());
    const producer = new OfficialReceivableApplicationSnapshotProducer({ readSnapshot });
    const result = await producer.produce(transaction, command());
    expect(result.ok).toBe(true);
    expect(readSnapshot).toHaveBeenCalledTimes(1);
    expect(readSnapshot).toHaveBeenCalledWith(transaction, command());
  });

  it('validator rejects a forged RCV-BINST/v1 even when envelope hash/ref are recomputed', () => {
    const envelope = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    const payload = JSON.parse(envelope.canonicalPayload) as StrictJsonObject;
    const buckets = payload.canonicalBuckets as readonly StrictJsonObject[];
    const forged: StrictJsonObject = {
      ...payload,
      canonicalBuckets: [
        { ...buckets[0], bucketInstanceId: `binst:v1:sha256:${'f'.repeat(64)}` },
        ...buckets.slice(1),
      ],
    };
    const canonicalPayload = serializeCanonicalJson(forged);
    const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
    const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
    const request = validationRequest(envelope);
    const result = validateCanonicalSnapshot({
      ...request,
      command: { ...request.command, expectedSnapshotHash: snapshotHash, expectedSnapshotRef: snapshotRef },
      snapshotEnvelope: { snapshotHash, snapshotRef, canonicalPayload },
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'BUCKET_IDENTITY_INVALID' }) }),
    );
  });

  it('validator recomputes the official source-version-set hash', () => {
    const envelope = expectSuccess(
      produceOfficialReceivableSnapshotFromReadModel(command(), readModel()),
    );
    const payload = JSON.parse(envelope.canonicalPayload) as StrictJsonObject;
    const sources = payload.sourceVersionSet as readonly StrictJsonObject[];
    const forged: StrictJsonObject = {
      ...payload,
      sourceVersionSet: [
        { ...sources[0], sourceVersion: 'forged-without-hash-update' },
        ...sources.slice(1),
      ],
    };
    const canonicalPayload = serializeCanonicalJson(forged);
    const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
    const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
    const request = validationRequest(envelope);
    const result = validateCanonicalSnapshot({
      ...request,
      command: {
        ...request.command,
        expectedSnapshotHash: snapshotHash,
        expectedSnapshotRef: snapshotRef,
      },
      snapshotEnvelope: { snapshotHash, snapshotRef, canonicalPayload },
    });
    expect(result).toEqual({ ok: false, error: { code: 'SOURCE_VERSION_INCOMPLETE' } });
  });

  it('produces allocation-compatible official snapshots for all nineteen Task 10 scenarios', () => {
    const golden = new Map(
      REPRESENTATIVE_CORPUS_GOLDEN_VECTORS.map((vector) => [vector.scenarioId, vector]),
    );
    expect(REPRESENTATIVE_CORPUS_SCENARIOS).toHaveLength(19);
    for (const seed of REPRESENTATIVE_CORPUS_SCENARIOS) {
      const producerCommand = command({
        tenantId: seed.commandTenantId ?? seed.tenantId,
        caseId: seed.caseId,
        targetCollectionId: seed.collectionId,
        receiptAmountMinor: seed.receiptAmountMinor,
        currency: seed.commandCurrency ?? seed.currency,
        minorUnit: seed.minorUnit,
        snapshotAsOfDate: seed.snapshotAsOfDate,
        applicationEffectiveDate: seed.applicationEffectiveDate,
      });
      const model = readModel({
        tenantId: seed.tenantId,
        caseId: seed.caseId,
        snapshotAsOfDate: seed.snapshotAsOfDate,
        applicationEffectiveDate: seed.applicationEffectiveDate,
        historyBoundaryRef: seed.historyBoundaryRef,
        targetCollection: {
          ...readModel().targetCollection,
          collectionId: seed.collectionId,
          tenantId: seed.tenantId,
          caseId: seed.caseId,
          receiptAmountMinor: seed.receiptAmountMinor,
          currency: seed.currency,
          minorUnit: seed.minorUnit,
          sourceReference: `collection:${seed.scenarioId}`,
        },
        receivableSources: seed.sources,
        collectionHistory: [],
        applicationHistory: [],
        buckets: seed.buckets.map((bucket, index) => ({
          componentType: bucket.componentType,
          componentCode: bucket.componentCode,
          sourceLineageSetRef: `lineage:${seed.scenarioId}:${index + 1}`,
          legalBasisRef: `legal-basis:${bucket.legalBasisRef}:v1`,
          effectiveContextRef: `effective:${bucket.effectivePeriodRef}`,
          ...(bucket.interestRuleRef === undefined
            ? {}
            : { interestRuleRef: bucket.interestRuleRef }),
          priorityPolicyRef: 'priority-policy:tbk100',
          priorityPolicyVersion: 'v1',
          priorityRank: bucket.priorityRank,
          liabilityContextRef: `liability:${bucket.componentCode}:v1`,
          currency: seed.currency,
          minorUnit: seed.minorUnit,
          bucketBalanceMinor: bucket.balanceMinor,
        })),
        legacyAuthority: {
          ...readModel().legacyAuthority,
          evidenceCompleteness: seed.envelopeMode === 'ABSENT' ? 'UNKNOWN' : 'PROVEN',
        },
      });
      const result = produceOfficialReceivableSnapshotFromReadModel(producerCommand, model);
      if (seed.scenarioId === '13-currency-mismatch') {
        expect(result).toEqual({
          ok: false,
          error: { code: 'CURRENCY_OR_MINOR_UNIT_INVALID' },
        });
        continue;
      }
      if (seed.scenarioId === '18-legacy-evidence-unknown') {
        expect(result).toEqual({ ok: false, error: { code: 'LEGACY_AUTHORITY_UNSAFE' } });
        continue;
      }
      if (seed.scenarioId === '19-cross-tenant-rejection') {
        expect(result).toEqual({ ok: false, error: { code: 'TENANT_CONTEXT_MISMATCH' } });
        continue;
      }
      const envelope = expectSuccess(result);
      const validation = validateCanonicalSnapshot(validationRequest(envelope));
      expect(validation.ok).toBe(true);
      if (!validation.ok) {
        throw new Error(validation.error.code);
      }
      const allocation = allocateValidatedSnapshotForApply({
        validatedSnapshot: validation.value,
        direction: 'APPLY',
        receiptAmountMinor: BigInt(seed.receiptAmountMinor),
      });
      expect(allocation.ok).toBe(true);
      if (!allocation.ok) {
        throw new Error(allocation.error.code);
      }
      const vector = golden.get(seed.scenarioId);
      expect(allocation.totalAppliedMinor.toString()).toBe(vector?.appliedAmountMinor);
      expect(allocation.remainingAmountMinor.toString()).toBe(vector?.heldRemainderMinor);
      expect(
        allocation.allocations.map((application) => ({
          componentType: application.componentType,
          appliedAmountMinor: application.appliedAmountMinor.toString(),
          bucketAfterMinor: application.bucketAfterMinor.toString(),
        })),
      ).toEqual(vector?.applications ?? []);
    }
  });
});
