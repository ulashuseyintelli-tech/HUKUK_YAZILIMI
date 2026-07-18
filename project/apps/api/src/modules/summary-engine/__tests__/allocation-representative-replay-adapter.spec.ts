import { createHash } from 'node:crypto';
import type {
  Adr014RepresentativeExecutionContext,
  Adr014RepresentativeReadOnlyQueryPort,
} from '../../../scripts/adr014-local-read-only-representative-runner';
import {
  type AllocationRepresentativeDatasetManifestV1,
  type AllocationRepresentativeReplaySourceRowV1,
  ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_CHECKSUM,
  AllocationRepresentativeReplayError,
  assertPiiSafeAllocationReplayOutput,
  buildAllocationRepresentativeDatasetManifest,
  createAllocationRepresentativeReplayReader,
  mapAllocationRepresentativeSourceRow,
  qualifyAllocationRepresentativeRows,
  validateAllocationRepresentativeReplayReadiness,
} from '../allocation-representative-replay-adapter';
import {
  type AllocationEvidenceVectorRow,
  type AllocationFrozenInputV1,
  buildAllocationFrozenInputFingerprint,
} from '../allocation-evidence-qualification';

const SHA = 'a'.repeat(40);
const SELECTION = `rcv-ws04-p03-record:v1:${'b'.repeat(64)}`;

function reference(kind: string): string {
  return `rcv-ws04-p03-ref:v1:${kind}:${createHash('sha256')
    .update(kind)
    .digest('hex')}`;
}

function datasetManifest(
  overrides: Partial<Omit<AllocationRepresentativeDatasetManifestV1, 'checksum'>> = {},
) {
  return buildAllocationRepresentativeDatasetManifest({
    contractVersion: 'RCV-WS04-P03-DATASET-V1',
    manifestStatus: 'TEST_FIXTURE',
    sourceClassification: 'SYNTHETIC_FIXTURE',
    selectionShape: 'DISTRIBUTIONAL_BASE_PLUS_EDGE_CASE_SUPPLEMENT',
    privacyBoundary: 'PII_SAFE_REFERENCES_ONLY',
    canonicalSha: SHA,
    environmentReference: reference('environment'),
    sessionReference: reference('session'),
    manifestReference: reference('manifest'),
    datasetVersion: 'fixture-v1',
    selectionUniverseReference: reference('universe'),
    selectionMethodReference: reference('method'),
    distributionalBaseReference: reference('base'),
    edgeCaseSupplementReference: reference('edge'),
    selectionSetReference: reference('selection'),
    recordCountReference: reference('count'),
    ownerReference: reference('owner'),
    reviewReference: reference('review'),
    supersedesManifestReference: null,
    approvedAt: null,
    selectionReferences: [SELECTION],
    ...overrides,
  });
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
      policyVersion: 'fixture-v1',
      ancillaryPriority: ['EXPENSE'],
    },
    rounding: {
      minorUnit: 2,
      mode: 'HALF_UP_AWAY_FROM_ZERO',
    },
  };
}

function vector(amountMinor = '10000'): AllocationEvidenceVectorRow[] {
  return [{
    claimItemId: 'synthetic-claim',
    legalBucket: 'PRINCIPAL',
    allocationOrder: 1,
    amountMinor,
  }];
}

function sourceRow(
  overrides: Partial<AllocationRepresentativeReplaySourceRowV1> = {},
): AllocationRepresentativeReplaySourceRowV1 {
  const input = frozenInput();
  const fingerprint = buildAllocationFrozenInputFingerprint(input);
  return {
    selectionReference: SELECTION,
    comparisonContext: 'COMPLETE',
    frozenInput: input,
    persistedLegalAllocation: {
      fingerprint,
      rows: vector(),
    },
    runtimeAllocation: {
      fingerprint,
      rows: vector(),
    },
    collectedAmountCache: vector(),
    collectionAllocationProjection: vector(),
    heldOverpayment: [],
    legacyAllocatorActivated: false,
    collectionAllocationFallback: 'NONE',
    ...overrides,
  };
}

const context: Adr014RepresentativeExecutionContext = {
  canonicalSha: SHA,
  environmentReference: reference('environment'),
  sessionReference: reference('session'),
  manifestReference: reference('manifest'),
  accessAuthorizationReference: reference('access'),
  executionAuthorizationReference: reference('execution'),
  executionPlanReference: reference('plan'),
};

const testGate = {
  mode: 'TEST_ONLY',
  dataAccess: 'NOT_AUTHORIZED',
  evidenceExecution: 'NOT_AUTHORIZED',
  productionObservation: 'NOT_AUTHORIZED',
  sourceAccess: 'READ_ONLY',
  networkBoundary: 'NO_EGRESS',
} as const;

describe('RCV-P2-WS04-P03 representative allocation reader/manifest adapter', () => {
  it('is default-disabled and rejects before the provider can read', async () => {
    const provider = {
      readRows: jest.fn(async () => [sourceRow()]),
    };
    const reader = createAllocationRepresentativeReplayReader(
      provider,
      datasetManifest(),
    );

    await expect(reader.read(
      { query: jest.fn() } as Adr014RepresentativeReadOnlyQueryPort,
      context,
      { isAbortRequested: () => false },
    )).rejects.toMatchObject({
      blockerCodes: ['ADAPTER_DISABLED'],
    });
    expect(provider.readRows).not.toHaveBeenCalled();
  });

  it('representative source is fail-closed without separate access and execution authorization', () => {
    const manifest = datasetManifest({
      manifestStatus: 'OWNER_APPROVED',
      sourceClassification: 'REPRESENTATIVE',
      approvedAt: '2026-07-18T10:00:00.000Z',
    });
    const readiness = validateAllocationRepresentativeReplayReadiness(
      manifest,
      {
        ...testGate,
        mode: 'OWNER_AUTHORIZED_LOCAL',
      },
    );

    expect(readiness).toEqual({
      status: 'BLOCKED',
      blockerCodes: [
        'DATA_ACCESS_NOT_AUTHORIZED',
        'EVIDENCE_EXECUTION_NOT_AUTHORIZED',
      ],
    });
  });

  it('maps a complete P02 frozen input and rejects a mismatched persisted fingerprint', () => {
    const row = sourceRow();
    expect(mapAllocationRepresentativeSourceRow(row)).toMatchObject({
      frozenInputFingerprint: row.persistedLegalAllocation.fingerprint,
    });

    expect(() => mapAllocationRepresentativeSourceRow(sourceRow({
      persistedLegalAllocation: {
        fingerprint: 'c'.repeat(64),
        rows: vector(),
      },
    }))).toThrow(AllocationRepresentativeReplayError);
  });

  it('produces checksum-bound, opaque and PII-safe EQUALITY evidence', () => {
    const result = qualifyAllocationRepresentativeRows({
      rows: [sourceRow()],
      datasetManifest: datasetManifest(),
      context,
    });

    expect(result.evidenceManifest).toMatchObject({
      contractVersion: 'RCV-WS04-P03-V1',
      taskId: 'RCV-P2-WS04-P03',
      status: 'CAPTURED_NOT_ACCEPTED',
      authority: 'NONE',
      representativeEvidenceAccepted: false,
      productionObservation: 'NOT_AUTHORIZED',
      source: 'LOCAL_ONLY',
      sourceAccess: 'READ_ONLY',
      transaction: 'REPEATABLE_READ_READ_ONLY',
      network: 'NO_EGRESS',
      recordCount: 1,
      resultCounts: {
        EQUALITY: 1,
        ALLOWED_DIVERGENCE: 0,
        NOT_COMPARABLE: 0,
        FAIL_CLOSED_DRIFT: 0,
      },
      consumerManifestChecksum: ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_CHECKSUM,
    });
    expect(result.evidenceManifest.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidenceManifest.records[0]).toMatchObject({
      sourceReference: SELECTION,
      persistedRuntime: 'EQUALITY',
      collectedAmountCache: 'EQUALITY',
      collectionAllocationProjection: 'EQUALITY',
      legacyAllocatorActivation: 'NOT_OBSERVED',
      collectionAllocationFallback: 'NONE',
    });
    expect(JSON.stringify(result.evidenceManifest)).not.toContain('synthetic-tenant');
    expect(JSON.stringify(result.evidenceManifest)).not.toContain('synthetic-payment');
    expect(result.readResult.observations).toEqual([
      expect.objectContaining({
        result: 'MATCH',
        primaryDisplaySafety: 'SAFE',
      }),
    ]);
  });

  it.each([
    {
      name: 'same-input cent drift',
      row: () => sourceRow({
        runtimeAllocation: {
          fingerprint: buildAllocationFrozenInputFingerprint(frozenInput()),
          rows: vector('9999'),
        },
      }),
      expectedClass: 'FAIL_CLOSED_DRIFT',
      expectedResult: 'NON_ZERO_FINANCIAL_DIFFERENCE',
    },
    {
      name: 'missing comparison fingerprint',
      row: () => sourceRow({
        runtimeAllocation: {
          fingerprint: null,
          rows: vector(),
        },
      }),
      expectedClass: 'NOT_COMPARABLE',
      expectedResult: 'NOT_COMPARABLE',
    },
    {
      name: 'explicit held overpayment',
      row: () => sourceRow({
        runtimeAllocation: {
          fingerprint: buildAllocationFrozenInputFingerprint(frozenInput()),
          rows: vector('12000'),
        },
        heldOverpayment: vector('2000'),
      }),
      expectedClass: 'ALLOWED_DIVERGENCE',
      expectedResult: 'MATCH',
    },
  ])('$name classification is preserved', ({
    row,
    expectedClass,
    expectedResult,
  }) => {
    const result = qualifyAllocationRepresentativeRows({
      rows: [row()],
      datasetManifest: datasetManifest(),
      context,
    });
    expect(result.evidenceManifest.records[0].persistedRuntime).toBe(expectedClass);
    expect(result.readResult.observations[0].result).toBe(expectedResult);
  });

  it('legacy activation and projection fallback while ledger exists are unsafe diagnostics', () => {
    const result = qualifyAllocationRepresentativeRows({
      rows: [sourceRow({
        legacyAllocatorActivated: true,
        collectionAllocationFallback: 'WHILE_LEDGER_PRESENT',
      })],
      datasetManifest: datasetManifest(),
      context,
    });
    expect(result.evidenceManifest.resultCounts.FAIL_CLOSED_DRIFT).toBe(1);
    expect(result.readResult.observations[0]).toMatchObject({
      result: 'NON_ZERO_FINANCIAL_DIFFERENCE',
      primaryDisplaySafety: 'UNSAFE',
    });
  });

  it('compatibility-only history without persisted legal allocation is NOT_COMPARABLE, not PASS', () => {
    const empty = {
      fingerprint: buildAllocationFrozenInputFingerprint(frozenInput()),
      rows: [],
    };
    const result = qualifyAllocationRepresentativeRows({
      rows: [sourceRow({
        comparisonContext: 'PERSISTED_LEGAL_ALLOCATION_ABSENT',
        persistedLegalAllocation: empty,
        runtimeAllocation: {
          fingerprint: empty.fingerprint,
          rows: vector(),
        },
        collectedAmountCache: [],
        collectionAllocationProjection: vector(),
        collectionAllocationFallback: 'WITHOUT_LEDGER',
      })],
      datasetManifest: datasetManifest(),
      context,
    });

    expect(result.evidenceManifest.resultCounts.NOT_COMPARABLE).toBe(1);
    expect(result.readResult.observations[0]).toMatchObject({
      result: 'NOT_COMPARABLE',
      primaryDisplaySafety: 'NOT_EVALUATED',
    });
  });

  it('reader consumes only the injected read-only port and returns generic safe observations', async () => {
    const queryMock = jest.fn(async () => [sourceRow()]);
    const queryPort: Adr014RepresentativeReadOnlyQueryPort = {
      query: queryMock as Adr014RepresentativeReadOnlyQueryPort['query'],
    };
    const provider = {
      async readRows(port: Adr014RepresentativeReadOnlyQueryPort) {
        return port.query<AllocationRepresentativeReplaySourceRowV1[]>(
          'SELECT payload FROM ws04_p03_synthetic_fixture ORDER BY payload',
        );
      },
    };
    const reader = createAllocationRepresentativeReplayReader(
      provider,
      datasetManifest(),
      testGate,
    );

    await expect(reader.read(
      queryPort,
      context,
      { isAbortRequested: () => false },
    )).resolves.toEqual({
      observations: [
        expect.objectContaining({
          result: 'MATCH',
          primaryDisplaySafety: 'SAFE',
        }),
      ],
    });
    expect(queryMock).toHaveBeenCalledWith(
      'SELECT payload FROM ws04_p03_synthetic_fixture ORDER BY payload',
    );
  });

  it('tampered manifest and weakened read-only/no-egress boundaries fail closed', () => {
    const manifest = {
      ...datasetManifest(),
      checksum: 'f'.repeat(64),
    };
    expect(validateAllocationRepresentativeReplayReadiness(
      manifest,
      testGate,
    )).toEqual({
      status: 'BLOCKED',
      blockerCodes: ['DATASET_MANIFEST_CHECKSUM_MISMATCH'],
    });
    expect(validateAllocationRepresentativeReplayReadiness(
      datasetManifest(),
      {
        ...testGate,
        sourceAccess: 'WRITE' as never,
        networkBoundary: 'EGRESS_ALLOWED' as never,
      },
    )).toEqual({
      status: 'BLOCKED',
      blockerCodes: [
        'READ_ONLY_BOUNDARY_REQUIRED',
        'NO_EGRESS_BOUNDARY_REQUIRED',
      ],
    });
  });

  it('rejects duplicate/unmanifested selection and PII-like output', () => {
    const manifest = datasetManifest();
    expect(() => qualifyAllocationRepresentativeRows({
      rows: [sourceRow(), sourceRow()],
      datasetManifest: manifest,
      context,
    })).toThrow('SOURCE_SELECTION_DUPLICATE');
    expect(() => qualifyAllocationRepresentativeRows({
      rows: [sourceRow({
        selectionReference: `rcv-ws04-p03-record:v1:${'d'.repeat(64)}`,
      })],
      datasetManifest: manifest,
      context,
    })).toThrow('SOURCE_SELECTION_NOT_MANIFESTED');
    expect(() => assertPiiSafeAllocationReplayOutput({
      tenantId: 'should-never-leave-memory',
    })).toThrow('PII_SAFE_OUTPUT_VIOLATION');
  });
});
