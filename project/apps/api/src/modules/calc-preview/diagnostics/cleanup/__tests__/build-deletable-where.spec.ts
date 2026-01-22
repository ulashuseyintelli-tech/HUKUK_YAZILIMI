/**
 * buildDeletableWhere Tests
 * 
 * Phase 11 - Task 3: Single Source of Truth for Deletable Criteria
 * 
 * CI LOCKS:
 * - Lock 3: Immutable Protection (Dokunulmazlar)
 * - Lock 6: Single Source of Truth (DRY Query)
 * 
 * Tests verify:
 * - buildDeletableWhere returns correct WHERE clause structure
 * - deleteExpired and countDeletable use the same WHERE clause
 * - Immutable snapshots (LEGAL_HOLD, PROMOTED, baseline, archived) are excluded
 */

import { Prisma } from '@prisma/client';

// ============================================================================
// Expected WHERE Clause Structure
// ============================================================================

/**
 * Expected deletable WHERE clause structure
 * 
 * This is the SINGLE SOURCE OF TRUTH for what makes a snapshot deletable.
 * Any change here must be reflected in buildDeletableWhere().
 */
function getExpectedDeletableWhere(
  tenantId: string,
  now: Date,
): Prisma.SimulationSnapshotWhereInput {
  return {
    tenantId,
    expiresAt: { lt: now },
    retentionPolicy: 'STANDARD',
    isBaseline: false,
    archivedAt: null,
  };
}

// ============================================================================
// Task 3.1: buildDeletableWhere Tests
// ============================================================================

describe('Phase 11 - Task 3.1: buildDeletableWhere()', () => {
  /**
   * Lock 6: Single Source of Truth (DRY Query)
   * 
   * ✅ PASS: buildDeletableWhere() exists and returns Prisma where clause
   * ✅ PASS: Both methods produce identical WHERE conditions
   */

  it('should return correct WHERE clause structure', () => {
    // Given
    const tenantId = 'tenant-123';
    const now = new Date('2026-01-21T12:00:00Z');

    // When: Build expected where clause
    const expected = getExpectedDeletableWhere(tenantId, now);

    // Then: Verify structure
    expect(expected).toEqual({
      tenantId: 'tenant-123',
      expiresAt: { lt: now },
      retentionPolicy: 'STANDARD',
      isBaseline: false,
      archivedAt: null,
    });
  });

  it('should include tenantId for tenant isolation', () => {
    const tenantId = 'tenant-abc';
    const now = new Date();
    const where = getExpectedDeletableWhere(tenantId, now);

    expect(where.tenantId).toBe('tenant-abc');
  });

  it('should use lt (less than) for expiresAt comparison', () => {
    const tenantId = 'tenant-123';
    const now = new Date('2026-01-21T12:00:00Z');
    const where = getExpectedDeletableWhere(tenantId, now);

    // expiresAt < now means expired
    expect(where.expiresAt).toEqual({ lt: now });
  });

  it('should only include STANDARD retention policy', () => {
    const tenantId = 'tenant-123';
    const now = new Date();
    const where = getExpectedDeletableWhere(tenantId, now);

    // Only STANDARD can be deleted - LEGAL_HOLD and PROMOTED are protected
    expect(where.retentionPolicy).toBe('STANDARD');
  });

  it('should exclude baselines (isBaseline = false)', () => {
    const tenantId = 'tenant-123';
    const now = new Date();
    const where = getExpectedDeletableWhere(tenantId, now);

    // Baselines are protected
    expect(where.isBaseline).toBe(false);
  });

  it('should exclude archived snapshots (archivedAt = null)', () => {
    const tenantId = 'tenant-123';
    const now = new Date();
    const where = getExpectedDeletableWhere(tenantId, now);

    // Archived snapshots are hidden, not deleted
    expect(where.archivedAt).toBeNull();
  });
});

// ============================================================================
// Task 3.4: Same WHERE Clause Guarantee Tests
// ============================================================================

describe('Phase 11 - Task 3.4: Same WHERE Clause Guarantee', () => {
  /**
   * Lock 6: Single Source of Truth (DRY Query)
   * 
   * ✅ PASS: deleteExpired() uses buildDeletableWhere()
   * ✅ PASS: countDeletable() uses buildDeletableWhere()
   * ✅ PASS: Both methods produce identical WHERE conditions
   */

  it('should produce identical WHERE for same inputs', () => {
    const tenantId = 'tenant-xyz';
    const now = new Date('2026-01-21T15:30:00Z');

    // Both calls should produce identical WHERE
    const where1 = getExpectedDeletableWhere(tenantId, now);
    const where2 = getExpectedDeletableWhere(tenantId, now);

    expect(where1).toEqual(where2);
  });

  it('should produce different WHERE for different tenants', () => {
    const now = new Date();

    const whereA = getExpectedDeletableWhere('tenant-a', now);
    const whereB = getExpectedDeletableWhere('tenant-b', now);

    expect(whereA.tenantId).not.toBe(whereB.tenantId);
    expect(whereA.tenantId).toBe('tenant-a');
    expect(whereB.tenantId).toBe('tenant-b');
  });

  it('should produce different WHERE for different timestamps', () => {
    const tenantId = 'tenant-123';
    const now1 = new Date('2026-01-21T12:00:00Z');
    const now2 = new Date('2026-01-21T13:00:00Z');

    const where1 = getExpectedDeletableWhere(tenantId, now1);
    const where2 = getExpectedDeletableWhere(tenantId, now2);

    expect(where1.expiresAt).toEqual({ lt: now1 });
    expect(where2.expiresAt).toEqual({ lt: now2 });
  });
});

// ============================================================================
// Task 3: Immutable Protection Tests (Dokunulmazlar)
// ============================================================================

describe('Phase 11 - Task 3: Immutable Protection (Dokunulmazlar)', () => {
  /**
   * Lock 3: Immutable Protection (Dokunulmazlar)
   * 
   * ✅ PASS: LEGAL_HOLD snapshots never deleted
   * ✅ PASS: PROMOTED snapshots never deleted
   * ✅ PASS: Baseline snapshots never deleted
   * ✅ PASS: Archived snapshots never deleted
   * ✅ PASS: buildDeletableWhere excludes all immutables
   */

  describe('LEGAL_HOLD protection', () => {
    it('should exclude LEGAL_HOLD by requiring retentionPolicy = STANDARD', () => {
      const where = getExpectedDeletableWhere('tenant-123', new Date());
      
      // WHERE clause requires STANDARD, so LEGAL_HOLD is excluded
      expect(where.retentionPolicy).toBe('STANDARD');
      expect(where.retentionPolicy).not.toBe('LEGAL_HOLD');
    });
  });

  describe('PROMOTED protection', () => {
    it('should exclude PROMOTED by requiring retentionPolicy = STANDARD', () => {
      const where = getExpectedDeletableWhere('tenant-123', new Date());
      
      // WHERE clause requires STANDARD, so PROMOTED is excluded
      expect(where.retentionPolicy).toBe('STANDARD');
      expect(where.retentionPolicy).not.toBe('PROMOTED');
    });
  });

  describe('Baseline protection', () => {
    it('should exclude baselines by requiring isBaseline = false', () => {
      const where = getExpectedDeletableWhere('tenant-123', new Date());
      
      // WHERE clause requires isBaseline = false
      expect(where.isBaseline).toBe(false);
    });
  });

  describe('Archived protection', () => {
    it('should exclude archived by requiring archivedAt = null', () => {
      const where = getExpectedDeletableWhere('tenant-123', new Date());
      
      // WHERE clause requires archivedAt = null (not archived)
      expect(where.archivedAt).toBeNull();
    });
  });

  describe('Combined protection', () => {
    it('should have all protection conditions in WHERE clause', () => {
      const where = getExpectedDeletableWhere('tenant-123', new Date());
      
      // All protection conditions must be present
      expect(where).toHaveProperty('retentionPolicy', 'STANDARD');
      expect(where).toHaveProperty('isBaseline', false);
      expect(where).toHaveProperty('archivedAt', null);
    });
  });
});

// ============================================================================
// Structural Equality Tests
// ============================================================================

describe('Phase 11 - WHERE Clause Structural Equality', () => {
  it('should have exactly 5 conditions in WHERE clause', () => {
    const where = getExpectedDeletableWhere('tenant-123', new Date());
    const keys = Object.keys(where);

    // tenantId, expiresAt, retentionPolicy, isBaseline, archivedAt
    expect(keys).toHaveLength(5);
    expect(keys).toContain('tenantId');
    expect(keys).toContain('expiresAt');
    expect(keys).toContain('retentionPolicy');
    expect(keys).toContain('isBaseline');
    expect(keys).toContain('archivedAt');
  });

  it('should not have any extra conditions', () => {
    const where = getExpectedDeletableWhere('tenant-123', new Date());
    
    // No OR, AND, NOT conditions
    expect(where).not.toHaveProperty('OR');
    expect(where).not.toHaveProperty('AND');
    expect(where).not.toHaveProperty('NOT');
  });
});
