import {
  DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL,
  READ_ONLY_REPEATABLE_READ_SQL,
  buildDueClaimItemInventory,
  runReadOnlyDueClaimItemInventory,
  rowsToInventoryInput,
  type ClaimItemInventoryRow,
  type DueInventoryRow,
  type InventoryDatabaseRow,
} from '../due-claimitem-inventory.core';

const due = (overrides: Partial<DueInventoryRow> = {}): DueInventoryRow => ({
  id: 'due-1', tenantId: 'tenant-1', caseId: 'case-1', type: 'PRINCIPAL', amount: '1000.00',
  currency: 'TRY', dueDate: '2026-01-15', interestType: null, interestRate: null,
  interestStartDate: null, interestEndDate: null, ...overrides,
});

const claim = (overrides: Partial<ClaimItemInventoryRow> = {}): ClaimItemInventoryRow => ({
  id: 'claim-1', tenantId: 'tenant-1', caseId: 'case-1', caseTenantId: 'tenant-1',
  itemType: 'PRINCIPAL', amount: '1000', originalAmount: '1000.00', demandedAmount: '1000.000',
  currency: 'TRY', dueDate: '2026-01-15', interestType: null, interestRate: null,
  interestStartDate: null, interestEndDate: null, status: 'ACTIVE', dueSyncSourceDueId: 'due-1',
  backfillSourceDueId: null, ...overrides,
});

describe('VER-05 Due / ClaimItem read-only inventory classifier', () => {
  it('strong dueSync pair is matched and output is deterministic', () => {
    const first = buildDueClaimItemInventory({ tenantId: 'tenant-1', dues: [due()], claimItems: [claim()] });
    const second = buildDueClaimItemInventory({ tenantId: 'tenant-1', dues: [due()], claimItems: [claim()] });

    expect(first).toEqual(second);
    expect(first.summary.classifications.MATCHED_PAIR).toBe(1);
    expect(first.summary.markers.dueSyncClaimItems).toBe(1);
    expect(JSON.stringify(first)).not.toContain('description');
  });

  it('NAFAKA is a Due-only exception, not a missing ClaimItem', () => {
    const report = buildDueClaimItemInventory({
      tenantId: 'tenant-1', dues: [due({ id: 'nafaka-1', type: 'NAFAKA' })], claimItems: [],
    });

    expect(report.summary.classifications.NAFAKA_EXPECTED_DUE_ONLY).toBe(1);
    expect(report.summary.classifications.DUE_ONLY).toBe(0);
  });

  it('detects duplicate strong markers and amount/type drift', () => {
    const duplicate = buildDueClaimItemInventory({
      tenantId: 'tenant-1', dues: [due()],
      claimItems: [claim(), claim({ id: 'claim-2', backfillSourceDueId: 'due-1', dueSyncSourceDueId: null })],
    });
    expect(duplicate.summary.classifications.DUPLICATE_PAIR).toBe(1);
    expect(duplicate.findings[0].confidence).toBe('STRONG');

    const drift = buildDueClaimItemInventory({
      tenantId: 'tenant-1', dues: [due()], claimItems: [claim({ demandedAmount: '900', itemType: 'INTEREST' })],
    });
    expect(drift.summary.classifications.AMOUNT_OR_TYPE_DRIFT).toBe(1);
    expect(drift.findings[0].reasons).toEqual(expect.arrayContaining(['ITEM_TYPE_MISMATCH', 'DEMANDED_AMOUNT_MISMATCH']));
  });

  it('separates active orphan markers from expected cancelled tombstones', () => {
    const report = buildDueClaimItemInventory({
      tenantId: 'tenant-1', dues: [],
      claimItems: [
        claim({ id: 'active-orphan', dueSyncSourceDueId: 'missing-due' }),
        claim({ id: 'cancelled-tombstone', status: 'CANCELLED', dueSyncSourceDueId: 'deleted-due' }),
      ],
    });

    expect(report.summary.classifications.ORPHANED_SYNC).toBe(1);
    expect(report.summary.classifications.EXPECTED_CANCELLED_TOMBSTONE).toBe(1);
  });

  it('reports heuristic marker-missing candidates without mutation authority and preserves Due/ClaimItem-only classes', () => {
    const report = buildDueClaimItemInventory({
      tenantId: 'tenant-1',
      dues: [due({ id: 'marker-missing' }), due({ id: 'due-only', caseId: 'case-2', amount: '200' })],
      claimItems: [
        claim({ id: 'candidate', dueSyncSourceDueId: null, backfillSourceDueId: null }),
        claim({ id: 'claim-only', caseId: 'case-3', dueSyncSourceDueId: null, backfillSourceDueId: null }),
      ],
    });

    expect(report.summary.classifications.MARKER_MISSING).toBe(1);
    expect(report.summary.classifications.DUE_ONLY).toBe(1);
    expect(report.summary.classifications.CLAIM_ITEM_ONLY).toBe(1);
    expect(report.findings.find((item) => item.classification === 'MARKER_MISSING')?.confidence).toBe('HEURISTIC');
  });

  it('does not treat an unmarked interest drift as a marker-missing exact candidate', () => {
    const report = buildDueClaimItemInventory({
      tenantId: 'tenant-1',
      dues: [due({ interestType: 'LEGAL', interestRate: '9.5' })],
      claimItems: [claim({ interestType: 'LEGAL', interestRate: '8.5', dueSyncSourceDueId: null })],
    });

    expect(report.summary.classifications.MARKER_MISSING).toBe(0);
    expect(report.summary.classifications.DUE_ONLY).toBe(1);
    expect(report.summary.classifications.CLAIM_ITEM_ONLY).toBe(1);
  });

  it('rejects tenant-crossing input before classification', () => {
    expect(() => buildDueClaimItemInventory({
      tenantId: 'tenant-1', dues: [due({ tenantId: 'tenant-2' })], claimItems: [],
    })).toThrow('tenant-scope dışı');
  });

  it('uses only SET TRANSACTION READ ONLY plus one static CTE query', async () => {
    const rows: InventoryDatabaseRow[] = [
      {
        row_kind: 'DUE', id: 'due-1', case_id: 'case-1', tenant_id: 'tenant-1', case_tenant_id: 'tenant-1',
        due_type: 'PRINCIPAL', claim_item_type: null, amount: '1000', original_amount: null, demanded_amount: null,
        currency: 'TRY', due_date: '2026-01-15', interest_type: null, interest_rate: null,
        interest_start_date: null, interest_end_date: null, status: null,
        due_sync_source_due_id: null, backfill_source_due_id: null,
      },
      {
        row_kind: 'CLAIM_ITEM', id: 'claim-1', case_id: 'case-1', tenant_id: 'tenant-1', case_tenant_id: 'tenant-1',
        due_type: null, claim_item_type: 'PRINCIPAL', amount: '1000', original_amount: '1000', demanded_amount: '1000',
        currency: 'TRY', due_date: '2026-01-15', interest_type: null, interest_rate: null,
        interest_start_date: null, interest_end_date: null, status: 'ACTIVE',
        due_sync_source_due_id: 'due-1', backfill_source_due_id: null,
      },
    ];
    const tx = {
      $executeRawUnsafe: jest.fn(async () => undefined),
      $queryRawUnsafe: jest.fn(async () => rows),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };

    const report = await runReadOnlyDueClaimItemInventory(prisma, 'tenant-1');

    expect(report.summary.classifications.MATCHED_PAIR).toBe(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(READ_ONLY_REPEATABLE_READ_SQL);
    expect(READ_ONLY_REPEATABLE_READ_SQL).toContain('READ ONLY');
    expect(READ_ONLY_REPEATABLE_READ_SQL).toContain('REPEATABLE READ, READ ONLY');
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL, 'tenant-1');
    expect(DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL).toMatch(/^\s*WITH tenant_cases/);
    expect(DUE_CLAIM_ITEM_INVENTORY_SELECT_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
  });

  it('rejects an unexpected database row kind instead of silently classifying it as ClaimItem', () => {
    expect(() => rowsToInventoryInput([{
      row_kind: 'UNKNOWN' as InventoryDatabaseRow['row_kind'], id: 'x', case_id: 'case-1',
      tenant_id: 'tenant-1', case_tenant_id: 'tenant-1', due_type: null, claim_item_type: null,
      amount: '1', original_amount: null, demanded_amount: null, currency: 'TRY', due_date: null,
      interest_type: null, interest_rate: null, interest_start_date: null, interest_end_date: null,
      status: null, due_sync_source_due_id: null, backfill_source_due_id: null,
    }], 'tenant-1')).toThrow('Bilinmeyen inventory row_kind');
  });
});
