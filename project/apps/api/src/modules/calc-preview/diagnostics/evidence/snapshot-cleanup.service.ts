/**
 * Snapshot Cleanup Service
 * 
 * @deprecated Phase 11 - Use SnapshotCleanupOrchestratorService instead.
 * 
 * DEPRECATION TIMELINE:
 * - N+1 release: @Deprecated + warning log + forward to orchestrator
 * - N+2 release: Remove entirely (hard fail)
 * 
 * This service is kept for backward compatibility during migration.
 * All new code should use SnapshotCleanupOrchestratorService directly.
 * 
 * Legacy Features (DO NOT USE):
 * - Configurable interval (default: 10 minutes)
 * - Concurrency guard (boolean lock) - REPLACED by distributed lock
 * - Idempotent deleteExpired calls - REPLACED by orchestrator
 * 
 * @see .kiro/specs/phase-11-cleanup-orchestration/design.md
 * @see SnapshotCleanupOrchestratorService
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ILegacySnapshotStore } from './snapshot-store.types';

/**
 * @deprecated Use CleanupConfig from cleanup.types.ts instead
 */
export interface CleanupConfig {
  /** Cleanup interval in milliseconds (default: 10 minutes) */
  intervalMs: number;
  /** Enable/disable cleanup job */
  enabled: boolean;
}

/**
 * @deprecated Use DEFAULT_CLEANUP_CONFIG from cleanup.types.ts instead
 */
export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  intervalMs: 10 * 60 * 1000, // 10 minutes
  enabled: true,
};

/**
 * @deprecated Phase 11 - Use SnapshotCleanupOrchestratorService instead.
 * 
 * This service will be removed in N+2 release.
 * Migration guide: See PHASE-11-LOCK.md
 */
@Injectable()
export class SnapshotCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SnapshotCleanupService.name);
  private readonly config: CleanupConfig;
  
  /**
   * @deprecated Replaced by distributed lock in orchestrator
   */
  private cleanupInProgress = false;
  
  /** Interval handle for cleanup */
  private intervalHandle: NodeJS.Timeout | undefined;
  
  /** Total deleted count (for metrics) */
  private totalDeletedCount = 0;
  
  /** Deprecation warning emitted flag */
  private deprecationWarningEmitted = false;

  constructor(
    private readonly snapshotStore: ILegacySnapshotStore,
    config?: Partial<CleanupConfig>,
  ) {
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
    this.emitDeprecationWarning('constructor');
  }
  
  /**
   * Emit deprecation warning (once per method, for telemetry)
   */
  private emitDeprecationWarning(method: string): void {
    if (!this.deprecationWarningEmitted) {
      this.logger.warn(
        '[SnapshotCleanup] DEPRECATED: This service is deprecated. ' +
        'Use SnapshotCleanupOrchestratorService instead. ' +
        'This service will be removed in N+2 release.',
        { method, caller: new Error().stack?.split('\n')[3]?.trim() }
      );
      this.deprecationWarningEmitted = true;
    }
  }

  onModuleInit(): void {
    if (this.config.enabled) {
      this.startCleanupJob();
    }
  }

  onModuleDestroy(): void {
    this.stopCleanupJob();
  }

  /**
   * Start the cleanup job
   */
  startCleanupJob(): void {
    if (this.intervalHandle) {
      this.logger.warn('[SnapshotCleanup] Job already running');
      return;
    }

    this.logger.log('[SnapshotCleanup] Starting cleanup job', {
      intervalMs: this.config.intervalMs,
    });

    this.intervalHandle = setInterval(() => {
      this.runCleanup().catch(err => {
        this.logger.error('[SnapshotCleanup] Cleanup failed', err);
      });
    }, this.config.intervalMs);

    // Run immediately on start
    this.runCleanup().catch(err => {
      this.logger.error('[SnapshotCleanup] Initial cleanup failed', err);
    });
  }

  /**
   * Stop the cleanup job
   */
  stopCleanupJob(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.logger.log('[SnapshotCleanup] Cleanup job stopped');
    }
  }

  /**
   * Run cleanup (with concurrency guard)
   * 
   * @deprecated Use SnapshotCleanupOrchestratorService.runOnce() instead
   * @returns number of deleted snapshots (0 if skipped due to lock)
   */
  async runCleanup(): Promise<number> {
    this.emitDeprecationWarning('runCleanup');
    
    // Concurrency guard
    if (this.cleanupInProgress) {
      this.logger.debug('[SnapshotCleanup] Cleanup already in progress, skipping');
      return 0;
    }

    this.cleanupInProgress = true;

    try {
      const deletedCount = await this.snapshotStore.deleteExpired();
      
      if (deletedCount > 0) {
        this.totalDeletedCount += deletedCount;
        this.logger.log('[SnapshotCleanup] Cleanup completed', {
          deletedCount,
          totalDeletedCount: this.totalDeletedCount,
        });
      }

      return deletedCount;
    } finally {
      this.cleanupInProgress = false;
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats(): {
    totalDeletedCount: number;
    cleanupInProgress: boolean;
    enabled: boolean;
    intervalMs: number;
  } {
    return {
      totalDeletedCount: this.totalDeletedCount,
      cleanupInProgress: this.cleanupInProgress,
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
    };
  }

  /**
   * Force cleanup (for testing/manual trigger)
   * 
   * @deprecated Use SnapshotCleanupOrchestratorService.runOnce() instead
   */
  async forceCleanup(): Promise<number> {
    this.emitDeprecationWarning('forceCleanup');
    return this.runCleanup();
  }
}
