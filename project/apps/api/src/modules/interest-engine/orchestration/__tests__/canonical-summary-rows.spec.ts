import {
  CANONICAL_SUMMARY_ROWS_CONTRACT_VERSION,
  CANONICAL_SUMMARY_TARGET_ROW_IDS,
  buildCanonicalSummaryShadowStatusRows,
  isCanonicalSummaryShadowStatusRowPrimaryEligible,
  type CanonicalSummaryShadowStatusRow,
} from '../canonical-summary-rows';

describe('buildCanonicalSummaryShadowStatusRows', () => {
  it('returns exactly the stable target row ids without relying on array position', () => {
    const rows = buildCanonicalSummaryShadowStatusRows();

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.rowId))).toEqual(new Set(CANONICAL_SUMMARY_TARGET_ROW_IDS));
  });

  it('returns unsupported shadow-status rows with null amounts, not zero', () => {
    const rows = buildCanonicalSummaryShadowStatusRows();

    for (const row of rows) {
      expect(row.status).toBe('UNSUPPORTED');
      expect(row.amount).toBeNull();
      expect(row.amount).not.toBe(0);
      expect(row.currency).toBeNull();
      expect(row.contractVersion).toBe(CANONICAL_SUMMARY_ROWS_CONTRACT_VERSION);
      expect(row.unsupportedReason).toEqual(expect.any(String));
      expect(row.diagnostics).toEqual([
        { code: 'CANONICAL_ROW_UNSUPPORTED', severity: 'BLOCKER' },
      ]);
    }
  });

  it('keeps every initial row outside canonical source authority and payment allocation', () => {
    const rows = buildCanonicalSummaryShadowStatusRows();

    for (const row of rows) {
      expect(row.sourceAuthority).toBe('UNKNOWN');
      expect(row.affectsPaymentAllocation).toBe(false);
      expect(row.allocationCategory).toBe('UNSUPPORTED');
      expect(Object.values(row.includedInTotals)).not.toContain('INCLUDED');
    }
  });

  it('marks every initial row as not primary eligible', () => {
    const rows = buildCanonicalSummaryShadowStatusRows();

    for (const row of rows) {
      expect(row.primaryEligible).toBe(false);
      expect(isCanonicalSummaryShadowStatusRowPrimaryEligible(row)).toBe(false);
    }
  });

  it('does not require or promote legacy raw calculation-summary fields', () => {
    const rows = buildCanonicalSummaryShadowStatusRows();
    const serializedRows = JSON.stringify(rows);

    expect(buildCanonicalSummaryShadowStatusRows).toHaveLength(0);
    expect(serializedRows).not.toContain('asilAlacak');
    expect(serializedRows).not.toContain('legacy');
    expect(serializedRows).not.toContain('0.10');
    expect(serializedRows).not.toContain('0.003');
  });

  it('fails closed for unsupported, error, unknown authority, null, and non-finite amounts', () => {
    const base: CanonicalSummaryShadowStatusRow = {
      ...buildCanonicalSummaryShadowStatusRows()[0],
      status: 'SUPPORTED',
      sourceAuthority: 'CANONICAL',
      amount: 1,
      allocationCategory: 'ACCRUED_INTEREST',
      primaryEligible: true,
      includedInTotals: {
        takipTutari: 'EXCLUDED',
        toplamBorc: 'EXCLUDED',
        sonBorc: 'EXCLUDED',
        kalanBorc: 'EXCLUDED',
        toplamTahsilat: 'EXCLUDED',
        kalanAnapara: 'EXCLUDED',
      },
    };

    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible(base)).toBe(true);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, status: 'UNSUPPORTED' })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, status: 'ERROR' })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, sourceAuthority: 'UNKNOWN' })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, amount: null })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, amount: Number.NaN })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, amount: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({ ...base, allocationCategory: 'UNSUPPORTED' })).toBe(false);
    expect(isCanonicalSummaryShadowStatusRowPrimaryEligible({
      ...base,
      includedInTotals: { ...base.includedInTotals, takipTutari: 'UNKNOWN' },
    })).toBe(false);
  });

  it('returns fresh row objects so tests cannot mutate shared state', () => {
    const firstRows = buildCanonicalSummaryShadowStatusRows();
    firstRows[0].includedInTotals.takipTutari = 'INCLUDED';

    const secondRows = buildCanonicalSummaryShadowStatusRows();

    expect(secondRows[0].includedInTotals.takipTutari).toBe('UNSUPPORTED');
  });
});
