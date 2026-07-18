import {
  ALLOCATION_AUTHORITY_CONTRACT_V1,
  AllocationDriftError,
  assertWriteTimeAllocationComparison,
  buildAllocationComparisonContext,
  classifyAllocationComparison,
  diagnoseCollectionAllocationProjection,
} from '../allocation-drift-baseline';

const context = buildAllocationComparisonContext({
  tenantId: 'tenant-1',
  caseId: 'case-1',
  currency: 'TRY',
  frozenInputId: 'command-1',
});

describe('WS04-P01 allocation drift baseline contract', () => {
  it('authority disposition sabitlerini değiştirmeden taşır', () => {
    expect(ALLOCATION_AUTHORITY_CONTRACT_V1).toEqual({
      persistedLegalAllocation: 'LedgerAllocation',
      runtimeAllocation: 'CALCULATION_ONLY',
      collectionAllocation: 'COMPATIBILITY_PROJECTION',
      collectedAmount: 'RECONCILED_CACHE',
    });
  });

  it('aynı frozen input ve cent-exact vektörü EQUALITY sınıfına alır', () => {
    const result = classifyAllocationComparison({
      canonical: [
        { key: '1:claim-principal', amount: 100.01 },
        { key: '2:claim-interest', amount: 20.05 },
      ],
      candidate: [
        { key: '2:claim-interest', amount: '20.05' },
        { key: '1:claim-principal', amount: 100.01 },
      ],
      canonicalContext: context,
      candidateContext: context,
    });

    expect(result).toMatchObject({
      classification: 'EQUALITY',
      reason: 'CENT_EXACT_EQUALITY',
      canonicalTotal: 120.06,
      candidateTotal: 120.06,
    });
  });

  it('yalnız explicit HELD overpayment ile açıklanan farkı ALLOWED_DIVERGENCE yapar', () => {
    const result = diagnoseCollectionAllocationProjection({
      ledgerAllocation: [{ key: 'PRINCIPAL', amount: 80 }],
      collectionAllocation: [
        { key: 'PRINCIPAL', amount: 80 },
        { key: 'OTHER', amount: 20 },
      ],
      heldOverpayment: [{ key: 'OTHER', amount: 20 }],
      context,
    });

    expect(result).toMatchObject({
      classification: 'ALLOWED_DIVERGENCE',
      reason: 'EXPLICIT_ALLOWED_DIVERGENCE',
      allowedDivergenceTotal: 20,
    });
  });

  it('CollectionAllocation compatibility projection farkını authority değiştirmeden explicit drift yapar', () => {
    const result = diagnoseCollectionAllocationProjection({
      ledgerAllocation: [
        { key: 'INTEREST', amount: 10 },
        { key: 'PRINCIPAL', amount: 90 },
      ],
      collectionAllocation: [{ key: 'PRINCIPAL', amount: 100 }],
      context,
    });

    expect(result).toMatchObject({
      classification: 'FAIL_CLOSED_DRIFT',
      reason: 'SAME_INPUT_VALUE_DRIFT',
    });
    expect(ALLOCATION_AUTHORITY_CONTRACT_V1.collectionAllocation)
      .toBe('COMPATIBILITY_PROJECTION');
  });

  it.each([
    [
      'eksik frozen input',
      { ...context, frozenInputId: undefined },
      'COMPARISON_CONTEXT_MISSING',
    ],
    [
      'farklı tenant',
      { ...context, tenantId: 'tenant-2' },
      'COMPARISON_CONTEXT_MISMATCH',
    ],
  ])('%s bağlamını NOT_COMPARABLE yapar', (_name, candidateContext, reason) => {
    const result = classifyAllocationComparison({
      canonical: [{ key: 'claim-1', amount: 10 }],
      candidate: [{ key: 'claim-1', amount: 10 }],
      canonicalContext: context,
      candidateContext,
    });

    expect(result).toMatchObject({
      classification: 'NOT_COMPARABLE',
      reason,
    });
  });

  it('aynı frozen input altında bir kuruş farkı FAIL_CLOSED_DRIFT yapar', () => {
    const result = classifyAllocationComparison({
      canonical: [{ key: 'claim-1', amount: 10 }],
      candidate: [{ key: 'claim-1', amount: 9.99 }],
      canonicalContext: context,
      candidateContext: context,
    });

    expect(result).toMatchObject({
      classification: 'FAIL_CLOSED_DRIFT',
      reason: 'SAME_INPUT_VALUE_DRIFT',
      deltas: [
        expect.objectContaining({
          key: 'claim-1',
          unexplainedDifference: -0.01,
        }),
      ],
    });
    expect(() => assertWriteTimeAllocationComparison('TEST_WRITE_BOUNDARY', result))
      .toThrow(AllocationDriftError);
  });

  it('write-time sınırında NOT_COMPARABLE sonucu da sessizce geçmez', () => {
    const result = classifyAllocationComparison({
      canonical: [],
      candidate: [],
      canonicalContext: context,
      candidateContext: { ...context, frozenInputId: undefined },
    });

    expect(() => assertWriteTimeAllocationComparison('TEST_CONTEXT_BOUNDARY', result))
      .toThrow(expect.objectContaining({
        code: 'ALLOCATION_COMPARISON_NOT_COMPARABLE',
      }));
  });
});
