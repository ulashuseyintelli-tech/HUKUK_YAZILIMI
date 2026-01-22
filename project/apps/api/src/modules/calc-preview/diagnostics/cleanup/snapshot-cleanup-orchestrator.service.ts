/**
 * Snapshot Cleanup Orchestrator Service
 * 
 * Phase 11 - Task 4: SnapshotCleanupOrchestrator Skeleton (P0)
 * 
 * Bounded + lock'lu + deterministic orchestrator for snapshot cleanup.
 * 
 * Key Design Decisions:
 * - runId generated at start (UUID v4) for audit trail
 * - runNow timestamp captured once, passed to all tenants (determinism)
 * - Lock acquired before any work, released in finally block
 * - Allowlist → Blocklist → maxTenantsPerRun precedence
 * - Invalid tenantId → SKIPPED_INVALID_TENANT (not FAIL)
 * - Slow tenant → log + metric, but NOT skipped
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CleanupConfig,
  CleanupRunOptions,
  CleanupRunResult,
  CleanupRunStatus,
  TenantCleanupResult,
  IDistributedLock,
  ISnapshotCleanupRepository,
  ICleanupMetrics,
  ICleanupFailureStateRepository,
  CleanupOperationResult,
  CLEANUP_LOCK_KEY,
  calculateLockTtlMs,
  isValidTenantId,
} from './cleanup.types';

// ============================================================================
// Orchestrator Service
// ============================================================================

@Injectable()
export class SnapshotCleanupOrchestratorService {
  private readonly logger = new Logger(SnapshotCleanupOrchestratorService.name);

  constructor(
    private readonly config: CleanupConfig,
    private readonly lock: IDistributedLock,
    private readonly repository: ISnapshotCleanupRepository,
    private readonly metrics: ICleanupMetrics,
    private readonly failureState?: ICleanupFailureStateRepository,
  ) {}

  /**
   * Run cleanup once
   * 
   * @param options Run options (dryRun, allowlist, blocklist, etc.)
   * @returns Cleanup run result
   */
  async runOnce(options: CleanupRunOptions = {}): Promise<CleanupRunResult> {
    const runId = randomUUID();
    const startedAt = Date.now();
    const runNow = new Date(startedAt); // Single timestamp for determinism
    const dryRun = options.dryRun ?? false;
    const lockTtlMs = calculateLockTtlMs(this.config);

    this.logger.log('[CleanupOrchestrator] Starting run', {
      runId,
      dryRun,
      lockTtlMs,
    });

    // Try to acquire lock
    const lockResult = await this.lock.acquireLock(CLEANUP_LOCK_KEY, lockTtlMs);

    if (!lockResult.acquired) {
      this.logger.warn('[CleanupOrchestrator] Lock not acquired - skipping run', {
        runId,
        existingLockId: lockResult.existingLockId,
      });

      return this.buildSkippedLockedResult(runId, startedAt, lockTtlMs, dryRun);
    }

    const lockId = lockResult.lockId!;

    try {
      return await this.executeRun(runId, startedAt, runNow, lockTtlMs, dryRun, options);
    } finally {
      // Always release lock
      const released = await this.lock.releaseLock(CLEANUP_LOCK_KEY, lockId);
      this.logger.debug('[CleanupOrchestrator] Lock released', {
        runId,
        released,
      });
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async executeRun(
    runId: string,
    startedAt: number,
    runNow: Date,
    lockTtlMs: number,
    dryRun: boolean,
    options: CleanupRunOptions,
  ): Promise<CleanupRunResult> {
    // 1. Discover tenants (deterministic order: ASC)
    const allTenants = await this.repository.listDistinctTenantIds();
    const tenantsDiscovered = allTenants.length;

    // 2. Apply allowlist → blocklist → maxTenantsPerRun
    const filteredTenants = this.filterTenants(allTenants, options);
    const maxTenants = options.maxTenantsPerRun ?? this.config.maxTenantsPerRun;
    const tenantsToProcess = filteredTenants.slice(0, maxTenants);
    const tenantsPlanned = tenantsToProcess.length;

    this.logger.debug('[CleanupOrchestrator] Tenant selection', {
      runId,
      tenantsDiscovered,
      afterFilter: filteredTenants.length,
      tenantsPlanned,
      maxTenants,
    });

    // 3. Process tenants
    const tenantResults: TenantCleanupResult[] = [];
    let tenantsProcessed = 0;
    let tenantsSucceeded = 0;
    let tenantsFailed = 0;
    let tenantsSkippedInvalid = 0;
    let totalDeleted = 0;
    let totalProtected = 0;
    let slowTenantCount = 0;

    for (const tenantId of tenantsToProcess) {
      const result = await this.processTenant(tenantId, runNow, dryRun, runId);
      tenantResults.push(result);
      tenantsProcessed++;

      if (result.status === 'SUCCESS') {
        tenantsSucceeded++;
        totalDeleted += result.deletedCount;
        totalProtected += result.protectedCount;
      } else if (result.status === 'FAILED') {
        tenantsFailed++;
      } else if (result.status === 'SKIPPED_INVALID_TENANT') {
        tenantsSkippedInvalid++;
        this.metrics.incrementInvalidTenantTotal();
      }

      if (result.isSlow) {
        slowTenantCount++;
        this.metrics.incrementSlowTenantTotal();
      }
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    // 4. Determine run status
    const status = this.determineRunStatus(
      tenantsSucceeded,
      tenantsFailed,
      tenantsSkippedInvalid,
      tenantsPlanned,
      dryRun,
    );

    this.metrics.recordRunDuration(durationMs, status);

    this.logger.log('[CleanupOrchestrator] Run completed', {
      runId,
      status,
      durationMs,
      tenantsProcessed,
      tenantsSucceeded,
      tenantsFailed,
      tenantsSkippedInvalid,
      totalDeleted,
      slowTenantCount,
    });

    return {
      runId,
      status,
      dryRun,
      startedAt,
      completedAt,
      lockTtlMs,
      tenantsDiscovered,
      tenantsPlanned,
      tenantsProcessed,
      tenantsSucceeded,
      tenantsFailed,
      tenantsSkippedInvalid,
      totalDeleted,
      totalProtected,
      slowTenantCount,
      durationMs,
      ...(options.emitPerTenantMetrics && { tenantResults }),
    };
  }

  private filterTenants(
    tenants: string[],
    options: CleanupRunOptions,
  ): string[] {
    let result = tenants;

    // Allowlist first (narrows set)
    if (options.tenantAllowlist && options.tenantAllowlist.length > 0) {
      const allowSet = new Set(options.tenantAllowlist);
      result = result.filter(t => allowSet.has(t));
    }

    // Blocklist second (excludes from narrowed set)
    if (options.tenantBlocklist && options.tenantBlocklist.length > 0) {
      const blockSet = new Set(options.tenantBlocklist);
      result = result.filter(t => !blockSet.has(t));
    }

    return result;
  }

  private async processTenant(
    tenantId: string,
    runNow: Date,
    dryRun: boolean,
    runId: string,
  ): Promise<TenantCleanupResult> {
    const tenantStart = Date.now();

    // Validate tenantId
    if (!isValidTenantId(tenantId)) {
      this.logger.warn('[CleanupOrchestrator] Invalid tenantId - skipping', {
        runId,
        tenantId,
      });

      return {
        tenantId: tenantId ?? '',
        status: 'SKIPPED_INVALID_TENANT',
        deletedCount: 0,
        protectedCount: 0,
        durationMs: Date.now() - tenantStart,
        errorCode: 'INVALID_TENANT_ID',
        isSlow: false,
      };
    }

    try {
      let result: CleanupOperationResult;

      if (dryRun) {
        // Dry run: count only, no delete
        result = await this.repository.countDeletable(tenantId, runNow);
      } else {
        // Real run: delete
        result = await this.repository.deleteExpired(tenantId, runNow);
      }

      const durationMs = Date.now() - tenantStart;
      const isSlow = durationMs > this.config.perTenantBudgetMs;

      if (isSlow) {
        this.logger.warn('[CleanupOrchestrator] Slow tenant detected', {
          runId,
          tenantId,
          durationMs,
          budgetMs: this.config.perTenantBudgetMs,
        });
      }

      // Success: reset failure counter (Task 6)
      if (this.failureState && !dryRun) {
        const previousState = await this.failureState.getFailureState(tenantId);
        await this.failureState.resetFailure(tenantId);
        
        // Emit success reset metric if there were previous failures
        if (previousState && previousState.consecutiveFailures > 0) {
          this.metrics.incrementSuccessResetsTotal?.();
        }
      }

      return {
        tenantId,
        status: 'SUCCESS',
        deletedCount: result.deletedCount,
        protectedCount: result.protectedCount,
        durationMs,
        isSlow,
      };
    } catch (error) {
      const durationMs = Date.now() - tenantStart;
      const errorCode = this.classifyError(error);

      this.logger.error('[CleanupOrchestrator] Tenant cleanup failed', {
        runId,
        tenantId,
        errorCode,
        error: error instanceof Error ? error.message : String(error),
      });

      // Failure: increment failure counter and check threshold (Task 6)
      if (this.failureState && !dryRun) {
        const consecutiveFailures = await this.failureState.incrementFailure(
          tenantId,
          errorCode,
        );

        if (consecutiveFailures >= this.config.failureThreshold) {
          this.logger.error('[CleanupOrchestrator] Failure threshold reached', {
            runId,
            tenantId,
            consecutiveFailures,
            threshold: this.config.failureThreshold,
          });
          this.metrics.emitFailureThresholdReached?.(tenantId, consecutiveFailures);
        }
      }

      return {
        tenantId,
        status: 'FAILED',
        deletedCount: 0,
        protectedCount: 0,
        durationMs,
        errorCode,
        isSlow: durationMs > this.config.perTenantBudgetMs,
      };
    }
  }

  /**
   * Classify error type for failure tracking
   * 
   * Error classification:
   * - TRANSIENT: Network, timeout errors → continue run
   * - LOGIC: Invariant breach → should abort (future)
   * - DATA_QUALITY: Invalid data → skip
   */
  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      const name = error.name.toLowerCase();
      const message = error.message.toLowerCase();

      // Transient errors
      if (
        name.includes('timeout') ||
        name.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('etimedout')
      ) {
        return 'TRANSIENT_ERROR';
      }

      // Database errors
      if (name.includes('prisma') || name.includes('database')) {
        return 'DATABASE_ERROR';
      }

      return error.name || 'UNKNOWN_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  private determineRunStatus(
    succeeded: number,
    failed: number,
    skippedInvalid: number,
    planned: number,
    dryRun: boolean,
  ): CleanupRunStatus {
    if (dryRun) {
      return 'DRY_RUN';
    }

    if (planned === 0) {
      return 'SUCCESS'; // No tenants to process = success
    }

    if (failed === 0 && skippedInvalid === 0) {
      return 'SUCCESS';
    }

    if (succeeded === 0) {
      return 'FAILED';
    }

    return 'PARTIAL_FAILURE';
  }

  private buildSkippedLockedResult(
    runId: string,
    startedAt: number,
    lockTtlMs: number,
    dryRun: boolean,
  ): CleanupRunResult {
    const completedAt = Date.now();
    return {
      runId,
      status: 'SKIPPED_LOCKED',
      dryRun,
      startedAt,
      completedAt,
      lockTtlMs,
      tenantsDiscovered: 0,
      tenantsPlanned: 0,
      tenantsProcessed: 0,
      tenantsSucceeded: 0,
      tenantsFailed: 0,
      tenantsSkippedInvalid: 0,
      totalDeleted: 0,
      totalProtected: 0,
      slowTenantCount: 0,
      durationMs: completedAt - startedAt,
    };
  }
}
