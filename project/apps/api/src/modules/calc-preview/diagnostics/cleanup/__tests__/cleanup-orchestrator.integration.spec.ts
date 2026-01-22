/**
 * Cleanup Orchestrator Integration Tests
 * 
 * Phase 11 - Task 9: Integration Tests (CI Locks)
 * 
 * These tests verify end-to-end behavior with realistic scenarios.
 * 
 * CI LOCKS:
 * - Lock 3: Cross-Tenant Isolation
 * - Lock 4: Immutable Snapshots Never Deleted
 * - Lock 5: Dry-Run Does Not Mutate
 * - Lock 6: Failure Threshold Tenant-Scoped
 */

import {
  CleanupConfig,
  DEFAULT_CLEANUP_CONFIG,
  ISnapshotCleanupRepository,
  ICleanupMetrics,
  ICleanupFailureStateRepository,
  CleanupOperationResult,
  TenantFailureState,
} from '../cleanup.types';
import { InMemoryDistributedLock } from '../distributed-lock.service';
import { SnapshotCleanupOrchestratorService } from '../snapshot-cleanup-orchestrator.service';

// ============================================================================
// Test 9.1-9.3: Multi-Tenant Golden Path
// ============================================================================

describe('Phase 11 - Task 9: Integration - Multi-Tenant Golden Path', () => {
  let lock: InMemoryDistributedLock;
  let repository: IntegrationMockRepository;
  let metrics: IntegrationMockMetrics;
  let failureState: IntegrationMockFailureState;
  let config: CleanupConfig;
  let orchestrator: SnapshotCleanupOrchestratorService;

  beforeEach(() => {
    lock = new InMemoryDistributedLock();
    repository = new IntegrationMockRepository();
    metrics = new IntegrationMockMetrics();
    failureState = new IntegrationMockFailureState();
    config = { ...DEFAULT_CLEANUP_CONFIG, failureThreshold: 3 };
    orchestrator = new SnapshotCleanupOrchestratorService(
      config,
      lock,
      repository,
      metrics,
      failureState,
    );
  });

  /**
   * 9.1-9.3: Seed DB with tenantA + tenantB, verify correct deletion
   */
  it('should delete only deletable snapshots per tenant, preserve protected', async () => {
    // Given: Two tenants with mixed snapshot types
    repository.seedTenant('tenant-a', {
      deletable: 10,
      legalHold: 2,
      promoted: 1,
      baseline: 1,
    });
    repository.seedTenant('tenant-b', {
      deletable: 5,
      legalHold: 1,
      promoted: 0,
      baseline: 1,
    });

    // When: Run cleanup
    const result = await orchestrator.runOnce({ emitPerTenantMetrics: true });

    // Then: Correct counts
    expect(result.status).toBe('SUCCESS');
    expect(result.tenantsProcessed).toBe(2);
    expect(result.totalDeleted).toBe(15); // 10 + 5 deletable
    expect(result.totalProtected).toBe(6); // 2+1+1 + 1+0+1 protected

    // And: Per-tenant results correct
    const tenantAResult = result.tenantResults?.find(r => r.tenantId === 'tenant-a');
    const tenantBResult = result.tenantResults?.find(r => r.tenantId === 'tenant-b');

    expect(tenantAResult?.deletedCount).toBe(10);
    expect(tenantAResult?.protectedCount).toBe(4); // 2 + 1 + 1
    expect(tenantBResult?.deletedCount).toBe(5);
    expect(tenantBResult?.protectedCount).toBe(2); // 1 + 0 + 1
  });

  /**
   * 9.4: Immutables never deleted (LEGAL_HOLD, PROMOTED, baseline)
   */
  it('should NEVER delete LEGAL_HOLD, PROMOTED, or baseline snapshots', async () => {
    // Given: Tenant with only protected snapshots
    repository.seedTenant('protected-only', {
      deletable: 0,
      legalHold: 5,
      promoted: 3,
      baseline: 2,
    });

    // When: Run cleanup
    const result = await orchestrator.runOnce({ emitPerTenantMetrics: true });

    // Then: Nothing deleted, all protected
    expect(result.totalDeleted).toBe(0);
    expect(result.totalProtected).toBe(10);
    expect(result.tenantResults?.[0].deletedCount).toBe(0);
    expect(result.tenantResults?.[0].protectedCount).toBe(10);
  });

  /**
   * 9.5: Cross-tenant leakage absent
   */
  it('should NOT leak data between tenants (isolation check)', async () => {
    // Given: Two tenants
    repository.seedTenant('tenant-x', { deletable: 100, legalHold: 0, promoted: 0, baseline: 0 });
    repository.seedTenant('tenant-y', { deletable: 50, legalHold: 0, promoted: 0, baseline: 0 });

    // When: Run with allowlist for tenant-x only
    const result = await orchestrator.runOnce({
      tenantAllowlist: ['tenant-x'],
      emitPerTenantMetrics: true,
    });

    // Then: Only tenant-x processed
    expect(result.tenantsProcessed).toBe(1);
    expect(result.totalDeleted).toBe(100);
    expect(result.tenantResults?.length).toBe(1);
    expect(result.tenantResults?.[0].tenantId).toBe('tenant-x');

    // And: tenant-y data untouched (verify via repository)
    expect(repository.getDeletedCountForTenant('tenant-y')).toBe(0);
  });
});

// ============================================================================
// Test 9.6: Lock Prevents Parallel Run
// ============================================================================

describe('Phase 11 - Task 9: Integration - Lock Prevents Parallel Run', () => {
  let lock: InMemoryDistributedLock;
  let repository: IntegrationMockRepository;
  let metrics: IntegrationMockMetrics;
  let config: CleanupConfig;
  let orchestrator: SnapshotCleanupOrchestratorService;

  beforeEach(() => {
    lock = new InMemoryDistributedLock();
    repository = new IntegrationMockRepository();
    metrics = new IntegrationMockMetrics();
    config = { ...DEFAULT_CLEANUP_CONFIG };
    orchestrator = new SnapshotCleanupOrchestratorService(
      config,
      lock,
      repository,
      metrics,
    );
  });

  /**
   * 9.6: Lock prevents parallel run
   */
  it('should return SKIPPED_LOCKED when another run holds the lock', async () => {
    // Given: Tenant with slow processing
    repository.seedTenant('slow-tenant', { deletable: 10, legalHold: 0, promoted: 0, baseline: 0 });
    repository.setProcessingDelay(100); // 100ms delay

    // When: Start first run (don't await)
    const firstRunPromise = orchestrator.runOnce();

    // And: Immediately start second run
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure first run started
    const secondResult = await orchestrator.runOnce();

    // Then: Second run skipped
    expect(secondResult.status).toBe('SKIPPED_LOCKED');
    expect(secondResult.tenantsProcessed).toBe(0);

    // And: First run completes successfully
    const firstResult = await firstRunPromise;
    expect(firstResult.status).toBe('SUCCESS');
    expect(firstResult.tenantsProcessed).toBe(1);
  });
});

// ============================================================================
// Test 9.7: Dry-Run Does Not Mutate
// ============================================================================

describe('Phase 11 - Task 9: Integration - Dry-Run Does Not Mutate', () => {
  let lock: InMemoryDistributedLock;
  let repository: IntegrationMockRepository;
  let metrics: IntegrationMockMetrics;
  let failureState: IntegrationMockFailureState;
  let config: CleanupConfig;
  let orchestrator: SnapshotCleanupOrchestratorService;

  beforeEach(() => {
    lock = new InMemoryDistributedLock();
    repository = new IntegrationMockRepository();
    metrics = new IntegrationMockMetrics();
    failureState = new IntegrationMockFailureState();
    config = { ...DEFAULT_CLEANUP_CONFIG };
    orchestrator = new SnapshotCleanupOrchestratorService(
      config,
      lock,
      repository,
      metrics,
      failureState,
    );
  });

  /**
   * 9.7: Dry-run does not mutate any data
   */
  it('should NOT delete any snapshots in dry-run mode', async () => {
    // Given: Tenant with deletable snapshots
    repository.seedTenant('tenant-a', { deletable: 50, legalHold: 5, promoted: 3, baseline: 2 });

    // When: Run in dry-run mode
    const result = await orchestrator.runOnce({ dryRun: true, emitPerTenantMetrics: true });

    // Then: Status is DRY_RUN
    expect(result.status).toBe('DRY_RUN');
    expect(result.dryRun).toBe(true);

    // And: Counts reported but nothing actually deleted
    expect(result.totalDeleted).toBe(50); // Reported as "would delete"
    expect(repository.actualDeletedTotal).toBe(0); // Actually deleted = 0
    expect(repository.deleteExpiredCalls).toBe(0); // deleteExpired never called
    expect(repository.countDeletableCalls).toBe(1); // countDeletable called instead
  });

  it('should NOT affect failure state in dry-run mode', async () => {
    // Given: Tenant that would fail
    repository.seedTenant('failing-tenant', { deletable: 10, legalHold: 0, promoted: 0, baseline: 0 });
    repository.setFailingTenants(['failing-tenant']);

    // When: Run in dry-run mode (failure won't happen because countDeletable is called, not deleteExpired)
    const result = await orchestrator.runOnce({ dryRun: true });

    // Then: No failure state changes
    expect(failureState.getFailureCount('failing-tenant')).toBe(0);
    expect(result.status).toBe('DRY_RUN');
  });
});

// ============================================================================
// Test: Failure Threshold is Tenant-Scoped
// ============================================================================

describe('Phase 11 - Task 9: Integration - Failure Threshold Tenant-Scoped', () => {
  let lock: InMemoryDistributedLock;
  let repository: IntegrationMockRepository;
  let metrics: IntegrationMockMetrics;
  let failureState: IntegrationMockFailureState;
  let config: CleanupConfig;
  let orchestrator: SnapshotCleanupOrchestratorService;

  beforeEach(() => {
    lock = new InMemoryDistributedLock();
    repository = new IntegrationMockRepository();
    metrics = new IntegrationMockMetrics();
    failureState = new IntegrationMockFailureState();
    config = { ...DEFAULT_CLEANUP_CONFIG, failureThreshold: 2 };
    orchestrator = new SnapshotCleanupOrchestratorService(
      config,
      lock,
      repository,
      metrics,
      failureState,
    );
  });

  /**
   * Failure counter is tenant-scoped, not global
   */
  it('should track failures per tenant, not globally', async () => {
    // Given: Two tenants, one failing
    repository.seedTenant('good-tenant', { deletable: 10, legalHold: 0, promoted: 0, baseline: 0 });
    repository.seedTenant('bad-tenant', { deletable: 5, legalHold: 0, promoted: 0, baseline: 0 });
    repository.setFailingTenants(['bad-tenant']);

    // When: Run cleanup twice
    await orchestrator.runOnce();
    await orchestrator.runOnce();

    // Then: bad-tenant has 2 failures, good-tenant has 0
    expect(failureState.getFailureCount('bad-tenant')).toBe(2);
    expect(failureState.getFailureCount('good-tenant')).toBe(0);

    // And: Threshold event emitted for bad-tenant only
    expect(metrics.failureThresholdReachedCalls.length).toBe(1);
    expect(metrics.failureThresholdReachedCalls[0].tenantId).toBe('bad-tenant');
  });

  /**
   * Success resets counter (integration verification)
   */
  it('should reset failure counter on success (fail, fail, success, fail = 1)', async () => {
    // Given: Tenant that fails intermittently
    repository.seedTenant('flaky-tenant', { deletable: 10, legalHold: 0, promoted: 0, baseline: 0 });

    // Fail twice
    repository.setFailingTenants(['flaky-tenant']);
    await orchestrator.runOnce();
    await orchestrator.runOnce();
    expect(failureState.getFailureCount('flaky-tenant')).toBe(2);

    // Success (resets counter)
    repository.setFailingTenants([]);
    await orchestrator.runOnce();
    expect(failureState.getFailureCount('flaky-tenant')).toBe(0);

    // Verify success reset metric emitted
    expect(metrics.successResetsTotalCalls).toBe(1);

    // Fail once more
    repository.setFailingTenants(['flaky-tenant']);
    await orchestrator.runOnce();
    expect(failureState.getFailureCount('flaky-tenant')).toBe(1);

    // Then: No threshold event (would need 2 consecutive)
    expect(metrics.failureThresholdReachedCalls.length).toBe(1); // Only from first 2 fails
  });
});

// ============================================================================
// Integration Mock Implementations
// ============================================================================

interface TenantData {
  deletable: number;
  legalHold: number;
  promoted: number;
  baseline: number;
}

class IntegrationMockRepository implements ISnapshotCleanupRepository {
  private tenants: Map<string, TenantData> = new Map();
  private deletedPerTenant: Map<string, number> = new Map();
  private failingTenants: string[] = [];
  private processingDelayMs = 0;

  // Call tracking
  listDistinctTenantIdsCalls = 0;
  countDeletableCalls = 0;
  deleteExpiredCalls = 0;
  actualDeletedTotal = 0;

  seedTenant(tenantId: string, data: TenantData): void {
    this.tenants.set(tenantId, data);
    this.deletedPerTenant.set(tenantId, 0);
  }

  setFailingTenants(tenants: string[]): void {
    this.failingTenants = tenants;
  }

  setProcessingDelay(ms: number): void {
    this.processingDelayMs = ms;
  }

  getDeletedCountForTenant(tenantId: string): number {
    return this.deletedPerTenant.get(tenantId) ?? 0;
  }

  async listDistinctTenantIds(): Promise<string[]> {
    this.listDistinctTenantIdsCalls++;
    return Array.from(this.tenants.keys()).sort();
  }

  async countDeletable(tenantId: string, _now: Date): Promise<CleanupOperationResult> {
    this.countDeletableCalls++;
    const data = this.tenants.get(tenantId);
    if (!data) {
      return { deletedCount: 0, protectedCount: 0 };
    }

    if (this.processingDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.processingDelayMs));
    }

    return {
      deletedCount: data.deletable,
      protectedCount: data.legalHold + data.promoted + data.baseline,
    };
  }

  async deleteExpired(tenantId: string, _now: Date): Promise<CleanupOperationResult> {
    this.deleteExpiredCalls++;

    if (this.failingTenants.includes(tenantId)) {
      throw new Error(`Simulated failure for ${tenantId}`);
    }

    const data = this.tenants.get(tenantId);
    if (!data) {
      return { deletedCount: 0, protectedCount: 0 };
    }

    if (this.processingDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.processingDelayMs));
    }

    // Track actual deletion
    this.actualDeletedTotal += data.deletable;
    this.deletedPerTenant.set(
      tenantId,
      (this.deletedPerTenant.get(tenantId) ?? 0) + data.deletable
    );

    return {
      deletedCount: data.deletable,
      protectedCount: data.legalHold + data.promoted + data.baseline,
    };
  }
}

class IntegrationMockMetrics implements ICleanupMetrics {
  slowTenantTotalCalls = 0;
  invalidTenantTotalCalls = 0;
  runDurationCalls = 0;
  successResetsTotalCalls = 0;
  failureThresholdReachedCalls: Array<{ tenantId: string; consecutiveFailures: number }> = [];

  incrementSlowTenantTotal(): void {
    this.slowTenantTotalCalls++;
  }

  incrementInvalidTenantTotal(): void {
    this.invalidTenantTotalCalls++;
  }

  recordRunDuration(): void {
    this.runDurationCalls++;
  }

  incrementSuccessResetsTotal(): void {
    this.successResetsTotalCalls++;
  }

  emitFailureThresholdReached(tenantId: string, consecutiveFailures: number): void {
    this.failureThresholdReachedCalls.push({ tenantId, consecutiveFailures });
  }
}

class IntegrationMockFailureState implements ICleanupFailureStateRepository {
  private failures: Map<string, { count: number; lastErrorCode: string | null }> = new Map();

  async incrementFailure(tenantId: string, errorCode: string): Promise<number> {
    const current = this.failures.get(tenantId) || { count: 0, lastErrorCode: null };
    const newCount = current.count + 1;
    this.failures.set(tenantId, { count: newCount, lastErrorCode: errorCode });
    return newCount;
  }

  async resetFailure(tenantId: string): Promise<void> {
    this.failures.set(tenantId, { count: 0, lastErrorCode: null });
  }

  async getFailureState(tenantId: string): Promise<TenantFailureState | null> {
    const state = this.failures.get(tenantId);
    if (!state) return null;
    return {
      tenantId,
      consecutiveFailures: state.count,
      lastFailedAt: new Date(),
      lastErrorCode: state.lastErrorCode,
    };
  }

  getFailureCount(tenantId: string): number {
    return this.failures.get(tenantId)?.count ?? 0;
  }
}
