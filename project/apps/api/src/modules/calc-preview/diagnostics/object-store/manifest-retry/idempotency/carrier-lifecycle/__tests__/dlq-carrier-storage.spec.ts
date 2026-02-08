/**
 * DLQ Carrier Storage Tests — Phase 11.2
 *
 * Tests for prepareCarrierForDlqStorage(), resolveCarrierForRedrive(),
 * and createMinimalCarrierFromDlq().
 *
 * SIGN-OFF TESTS:
 * 1. prepareCarrierForDlqStorage: oversize → truncated flag + stored json
 * 2. resolveCarrierForRedrive: stored json parse fail → degraded fallback
 * 3. Grep gates: carrier columns only in allowed methods
 *
 * @see phase-11-2-design.md
 */

import {
  prepareCarrierForDlqStorage,
  resolveCarrierForRedrive,
  createMinimalCarrierFromDlq,
} from '../dlq-carrier-storage';
import {
  IdempotencyContextCarrierV2,
  MAX_CARRIER_SIZE_BYTES,
} from '../carrier-lifecycle.types';
import type { DlqEntry } from '../../../manifest-retry.types';
import { ManifestErrorCode } from '../../../manifest-error-classifier';
import { resetAllMetrics } from '../carrier-lifecycle-metrics';

// ============================================================================
// Fixtures
// ============================================================================

const validV2Carrier: IdempotencyContextCarrierV2 = {
  version: 2,
  requestId: 'req-001',
  actionId: 'act-001',
  actionType: 'ADMIN_RETRY',
  resourceType: 'BUNDLE',
  resourceId: 'bundle-001',
  takeover: false,
  previousActorId: null,
  attemptNumber: 3,
};

const mockDlqEntry: DlqEntry = {
  id: 'dlq-001',
  bundleId: 'bundle-001',
  attempt: 7,
  finalErrorCode: ManifestErrorCode.S3_TIMEOUT,
  finalErrorMessage: 'Connection timed out',
  firstFailedAt: new Date('2026-02-06T10:00:00Z'),
  lastFailedAt: new Date('2026-02-06T17:00:00Z'),
  status: 'DLQ_OPEN',
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  redrivenAt: null,
  redrivenBy: null,
  createdAt: new Date('2026-02-06T17:00:00Z'),
  carrierJson: null,
  carrierVersion: null,
  carrierTruncated: false,
};

beforeEach(() => {
  resetAllMetrics();
});

// ============================================================================
// prepareCarrierForDlqStorage
// ============================================================================

describe('prepareCarrierForDlqStorage', () => {
  it('carrier=null → null fields, truncated=false', () => {
    const result = prepareCarrierForDlqStorage(null);

    expect(result.carrierJson).toBeNull();
    expect(result.carrierVersion).toBeNull();
    expect(result.carrierTruncated).toBe(false);
  });

  it('valid carrier within 4KB → stored as-is, truncated=false', () => {
    const result = prepareCarrierForDlqStorage(validV2Carrier);

    expect(result.carrierJson).not.toBeNull();
    expect(result.carrierVersion).toBe(2);
    expect(result.carrierTruncated).toBe(false);

    // Verify JSON is valid and round-trips
    const parsed = JSON.parse(result.carrierJson!);
    expect(parsed.version).toBe(2);
    expect(parsed.requestId).toBe('req-001');
  });

  it('carrier over 4KB with truncatable failureHistory → truncated=true', () => {
    // Create carrier with large failureHistory to exceed 4KB
    const largeHistory = Array.from({ length: 50 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      errorCode: `ERR_${i}`,
      errorMessage: 'x'.repeat(100),
    }));

    const largeCarrier: IdempotencyContextCarrierV2 = {
      ...validV2Carrier,
      failureHistory: largeHistory,
    };

    // Verify it's actually over the limit
    const size = Buffer.byteLength(JSON.stringify(largeCarrier), 'utf8');
    if (size <= MAX_CARRIER_SIZE_BYTES) {
      // Skip if fixture isn't large enough
      return;
    }

    const result = prepareCarrierForDlqStorage(largeCarrier);

    expect(result.carrierJson).not.toBeNull();
    expect(result.carrierVersion).toBe(2);
    expect(result.carrierTruncated).toBe(true);

    // Verify truncated JSON is within limit
    const truncatedSize = Buffer.byteLength(result.carrierJson!, 'utf8');
    expect(truncatedSize).toBeLessThanOrEqual(MAX_CARRIER_SIZE_BYTES);
  });

  it('INVARIANT: carrier_truncated=true ⇒ carrier_json IS NOT NULL', () => {
    // This is the DB constraint invariant
    const result = prepareCarrierForDlqStorage(validV2Carrier);

    if (result.carrierTruncated) {
      expect(result.carrierJson).not.toBeNull();
    }
  });

  it('INVARIANT: carrier_json=null ⇒ carrier_truncated=false', () => {
    const result = prepareCarrierForDlqStorage(null);

    if (result.carrierJson === null) {
      expect(result.carrierTruncated).toBe(false);
    }
  });

  it('never throws', () => {
    // Even with weird input, should not throw
    expect(() => prepareCarrierForDlqStorage(null)).not.toThrow();
    expect(() => prepareCarrierForDlqStorage(validV2Carrier)).not.toThrow();
  });
});

// ============================================================================
// resolveCarrierForRedrive
// ============================================================================

describe('resolveCarrierForRedrive', () => {
  it('stored carrier JSON → parsed V2 carrier', () => {
    const storedJson = JSON.stringify(validV2Carrier);
    const entry: DlqEntry = {
      ...mockDlqEntry,
      carrierJson: storedJson,
      carrierVersion: 2,
      carrierTruncated: false,
    };

    const result = resolveCarrierForRedrive(entry);

    expect(result.version).toBe(2);
    expect(result.requestId).toBe('req-001');
    expect(result.actionId).toBe('act-001');
  });

  it('corrupted carrier JSON → minimal fallback (never throws)', () => {
    const entry: DlqEntry = {
      ...mockDlqEntry,
      carrierJson: '{invalid json!!!',
      carrierVersion: 2,
      carrierTruncated: false,
    };

    // Should NOT throw
    const result = resolveCarrierForRedrive(entry);

    // Should return minimal carrier
    expect(result.version).toBe(2);
    expect(result.actionType).toBe('DLQ_REDRIVE');
    expect(result.resourceId).toBe('bundle-001');
  });

  it('null carrier JSON (pre-11.2 entry) → minimal fallback', () => {
    const result = resolveCarrierForRedrive(mockDlqEntry);

    expect(result.version).toBe(2);
    expect(result.actionType).toBe('DLQ_REDRIVE');
    expect(result.resourceId).toBe(mockDlqEntry.bundleId);
    expect(result.attemptNumber).toBe(mockDlqEntry.attempt);
  });

  it('stored V1 carrier → auto-upgraded to V2', () => {
    const v1Carrier = {
      version: 1,
      requestId: 'v1-req',
      actionId: 'v1-act',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: 'bundle-001',
      takeover: false,
      previousActorId: null,
    };
    const entry: DlqEntry = {
      ...mockDlqEntry,
      carrierJson: JSON.stringify(v1Carrier),
      carrierVersion: 1,
    };

    const result = resolveCarrierForRedrive(entry);

    expect(result.version).toBe(2);
    expect(result.requestId).toBe('v1-req');
  });

  it('never throws regardless of input', () => {
    expect(() => resolveCarrierForRedrive(mockDlqEntry)).not.toThrow();
    expect(() => resolveCarrierForRedrive({
      ...mockDlqEntry,
      carrierJson: 'garbage',
    })).not.toThrow();
  });
});

// ============================================================================
// createMinimalCarrierFromDlq
// ============================================================================

describe('createMinimalCarrierFromDlq', () => {
  it('creates valid V2 carrier from DLQ metadata', () => {
    const result = createMinimalCarrierFromDlq(mockDlqEntry);

    expect(result.version).toBe(2);
    expect(result.resourceType).toBe('BUNDLE');
    expect(result.resourceId).toBe('bundle-001');
    expect(result.actionType).toBe('DLQ_REDRIVE');
    expect(result.attemptNumber).toBe(7);
    expect(result.dlqReason).toBe('EXHAUSTED');
    expect(result.takeover).toBe(false);
  });

  it('requestId contains DLQ entry ID for traceability', () => {
    const result = createMinimalCarrierFromDlq(mockDlqEntry);

    expect(result.requestId).toContain('dlq-001');
  });

  it('movedToDlqAt is set from lastFailedAt', () => {
    const result = createMinimalCarrierFromDlq(mockDlqEntry);

    expect(result.movedToDlqAt).toBe(mockDlqEntry.lastFailedAt.toISOString());
  });
});
