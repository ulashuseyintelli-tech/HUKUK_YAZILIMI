/**
 * Snapshot Cleanup Service
 * 
 * Phase 8 - Sprint 1B
 * 
 * Periodic cleanup job for expired snapshots.
 * 
 * Features:
 * - Configurable interval (default: 10 minutes)
 * - Concurrency guard (boolean lock)
 * - Idempotent deleteExpired calls
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ILegacySnapshotStore } from './snapshot-store.types';

export interface CleanupConfig {
  /** Cleanup interval in milliseconds (default: 10 minutes) */
  intervalMs: number;
  /** Enable/disable cleanup job */
  enabled: boolean;
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  intervalMs: 10 * 60 * 1000, // 10 minutes
  enabled: true,
};

@Injectable()
export class SnapshotCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SnapshotCleanupService.name);
  private readonly config: CleanupConfig;
  
  /** Concurrency guard - simple boolean lock */
  private cleanupInProgress = false;
  
  /** Interval handle for cleanup */
  private intervalHandle: NodeJS.Timeout | undefined;
  
  /** Total deleted count (for metrics) */
  private totalDeletedCount = 0;

  constructor(
    private readonly snapshotStore: ILegacySnapshotStore,
    config?: Partial<CleanupConfig>,
  ) {
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
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
   * @returns number of deleted snapshots (0 if skipped due to lock)
   */
  async runCleanup(): Promise<number> {
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
   */
  async forceCleanup(): Promise<number> {
    return this.runCleanup();
  }
}
