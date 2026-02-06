/**
 * Manifest Retry Worker Safety Service
 * 
 * Phase 10.2 - Task 2.4-2.8
 * 
 * Worker safety controls for production hardening:
 * 1. Leader election with lease-based ownership
 * 2. Concurrent write limiting
 * 3. Self-pause on consecutive errors
 * 4. Auto-resume for CONSECUTIVE_ERRORS (not MANUAL_PAUSE)
 * 5. CB-open backoff (memory-only)
 * 
 * DESIGN DECISIONS (User Approved 2026-02-03):
 * - Singleton worker state: DB'de tek satır, ama owner+lease ile multi-instance safe
 * - CB backoff: Memory-only (restart'ta reset olması kabul edilebilir)
 * - Auto-resume: CONSECUTIVE_ERRORS için VAR (cooloff sonrası), MANUAL_PAUSE için YOK
 * - PauseReason: CONSECUTIVE_ERRORS, MANUAL_PAUSE, UNKNOWN (forward-compatible)
 * 
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { IWorkerMetrics, NoOpWorkerMetrics } from './manifest-retry-worker.service';

// ============================================================================
// Types
// ============================================================================

/**
 * PauseReason enum - forward-compatible with UNKNOWN
 */
export enum PauseReason {
  CONSECUTIVE_ERRORS = 'CONSECUTIVE_ERRORS',
  MANUAL_PAUSE = 'MANUAL_PAUSE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Worker Safety Configuration
 */
export interface WorkerSafetyConfig {
  /** Maximum concurrent writes (default: 1) */
  maxConcurrentWrites: number;
  /** Consecutive errors threshold for auto-pause (default: 10) */
  maxConsecutiveErrors: number;
  /** CB open backoff steps in ms (memory-only) */
  cbOpenBackoffSteps: number[];
  /** Auto-resume cooloff period in ms (default: 300000 = 5 min) */
  autoResumeCooloffMs: number;
  /** Lease timeout in ms (default: 60000 = 1 min) */
  leaseTimeoutMs: number;
  /** Unique instance ID (e.g., hostname + pid) */
  instanceId: string;
}

/**
 * Default configuration
 */
export const DEFAULT_WORKER_SAFETY_CONFIG: WorkerSafetyConfig = {
  maxConcurrentWrites: 1,
  maxConsecutiveErrors: 10,
  cbOpenBackoffSteps: [5000, 30000, 60000], // 5s → 30s → 60s
  autoResumeCooloffMs: 300_000, // 5 minutes
  leaseTimeoutMs: 60_000, // 1 minute
  instanceId: `worker-${process.pid}-${Date.now()}`,
};

/**
 * DB State - minimal, persisted in worker_state singleton table
 */
export interface WorkerSafetyDbState {
  isPaused: boolean;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  pausedBy: string | null;
  consecutiveErrors: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  ownerInstanceId: string | null;
  leaseExpiresAt: Date | null;
}

/**
 * Full state including memory-only fields
 */
export interface WorkerSafetyState extends WorkerSafetyDbState {
  currentCbBackoffIndex: number;
  isLeader: boolean;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ManifestRetryWorkerSafety implements OnModuleInit {
  private readonly logger = new Logger(ManifestRetryWorkerSafety.name);
  private readonly config: WorkerSafetyConfig;
  
  // Memory-only state (not persisted, resets on restart)
  private currentCbBackoffIndex = 0;
  private activeConcurrentWrites = 0;
  private lastLeaseExpiresAt: Date | null = null;
  private readonly writeQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    operation: () => Promise<unknown>;
  }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: IWorkerMetrics = new NoOpWorkerMetrics(),
    config: Partial<WorkerSafetyConfig> = {},
  ) {
    this.config = { ...DEFAULT_WORKER_SAFETY_CONFIG, ...config };
    this.logger.log(`WorkerSafety initialized: instanceId=${this.config.instanceId}`);
  }

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize: Ensure singleton row exists, attempt to acquire lease
   */
  async init(): Promise<void> {
    await this.ensureSingletonRow();
    const acquired = await this.tryAcquireLease();
    this.logger.log(`WorkerSafety init complete: leaseAcquired=${acquired}`);
  }

  private async ensureSingletonRow(): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO manifest_worker_state (id, is_paused, consecutive_errors)
      VALUES ('singleton', false, 0)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ==========================================================================
  // Leader Election
  // ==========================================================================

  /**
   * Try to acquire or renew lease for this instance
   * Returns true if this instance is the leader
   * 
   * Atomic lease acquisition pattern:
   * - Only succeed if no owner OR lease expired OR we already own it
   * - Uses DB time (now()) to avoid clock drift issues
   */
  async tryAcquireLease(): Promise<boolean> {
    // Use DB time to avoid clock drift between instances
    const result = await this.prisma.$queryRaw<Array<{ lease_expires_at: Date }>>`
      UPDATE manifest_worker_state
      SET owner_instance_id = ${this.config.instanceId},
          lease_expires_at = now() + (${this.config.leaseTimeoutMs}::int * interval '1 millisecond'),
          updated_at = now()
      WHERE id = 'singleton'
        AND (owner_instance_id IS NULL 
             OR lease_expires_at < now()
             OR owner_instance_id = ${this.config.instanceId})
      RETURNING lease_expires_at
    `;

    const acquired = result.length > 0;
    if (acquired) {
      this.lastLeaseExpiresAt = result[0].lease_expires_at;
      this.logger.debug(`Lease acquired: instanceId=${this.config.instanceId}, expiresAt=${this.lastLeaseExpiresAt}`);
    }
    return acquired;
  }

  /**
   * Check if this instance is the active leader
   */
  async isLeader(): Promise<boolean> {
    const state = await this.getDbState();
    if (!state.ownerInstanceId || !state.leaseExpiresAt) return false;
    
    return state.ownerInstanceId === this.config.instanceId 
           && state.leaseExpiresAt > new Date();
  }

  // ==========================================================================
  // Concurrent Write Control
  // ==========================================================================

  /**
   * Acquire a write slot, queuing if at capacity
   */
  async acquireWriteSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeConcurrentWrites >= this.config.maxConcurrentWrites) {
      // Queue the operation
      return new Promise<T>((resolve, reject) => {
        this.writeQueue.push({
          resolve: resolve as (value: unknown) => void,
          reject,
          operation: operation as () => Promise<unknown>,
        });
      });
    }

    this.activeConcurrentWrites++;
    try {
      return await operation();
    } finally {
      this.activeConcurrentWrites--;
      this.processWriteQueue();
    }
  }

  private processWriteQueue(): void {
    if (this.writeQueue.length > 0 && this.activeConcurrentWrites < this.config.maxConcurrentWrites) {
      const next = this.writeQueue.shift();
      if (next) {
        this.activeConcurrentWrites++;
        next.operation()
          .then(result => next.resolve(result))
          .catch(error => next.reject(error))
          .finally(() => {
            this.activeConcurrentWrites--;
            this.processWriteQueue();
          });
      }
    }
  }

  // ==========================================================================
  // Success/Error Recording (Atomic)
  // ==========================================================================

  /**
   * Record success - ATOMIC update: consecutive_errors = 0
   */
  async recordSuccess(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET consecutive_errors = 0
      WHERE id = 'singleton'
    `;
    this.currentCbBackoffIndex = 0; // Memory-only reset
  }

  /**
   * Record error - ATOMIC update: increment + check threshold + auto-pause
   * Returns true if worker should pause
   */
  async recordError(lastErrorCode: string, _lastErrorMessage?: string): Promise<boolean> {
    // Atomic increment + conditional pause in single UPDATE
    const result = await this.prisma.$queryRaw<Array<{ consecutive_errors: number; is_paused: boolean }>>`
      UPDATE manifest_worker_state
      SET consecutive_errors = consecutive_errors + 1,
          last_error_code = ${lastErrorCode},
          last_error_at = NOW(),
          is_paused = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} THEN true 
            ELSE is_paused 
          END,
          pause_reason = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} AND NOT is_paused 
            THEN 'CONSECUTIVE_ERRORS'::"ManifestWorkerPauseReason"
            ELSE pause_reason 
          END,
          paused_at = CASE 
            WHEN consecutive_errors + 1 >= ${this.config.maxConsecutiveErrors} AND NOT is_paused 
            THEN NOW() 
            ELSE paused_at 
          END
      WHERE id = 'singleton'
      RETURNING consecutive_errors, is_paused
    `;

    const newState = result[0];
    if (newState?.is_paused) {
      this.logger.warn('[WorkerSafety] Worker auto-paused', { 
        reason: PauseReason.CONSECUTIVE_ERRORS,
        consecutiveErrors: newState.consecutive_errors,
      });
      this.metrics.recordWorkerError('self_pause');
    }

    return newState?.is_paused ?? false;
  }

  // ==========================================================================
  // Pause/Resume
  // ==========================================================================

  /**
   * Manual pause - only ops_admin can trigger
   */
  async pause(actor: string, _reason?: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET is_paused = true,
          pause_reason = 'MANUAL_PAUSE'::"ManifestWorkerPauseReason",
          paused_at = NOW(),
          paused_by = ${actor}
      WHERE id = 'singleton'
    `;
    this.logger.warn('[WorkerSafety] Worker manually paused', { actor });
    this.metrics.recordWorkerError('manual_pause');
  }

  /**
   * Resume - resets consecutive errors
   */
  async resume(actor: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE manifest_worker_state
      SET is_paused = false,
          pause_reason = NULL,
          paused_at = NULL,
          paused_by = NULL,
          consecutive_errors = 0
      WHERE id = 'singleton'
    `;
    this.logger.log('[WorkerSafety] Worker resumed', { actor });
  }

  /**
   * Check if paused
   */
  async isPaused(): Promise<boolean> {
    const state = await this.getDbState();
    return state.isPaused;
  }

  // ==========================================================================
  // Auto-Resume (CONSECUTIVE_ERRORS only)
  // ==========================================================================

  /**
   * Check if auto-resume should happen
   * ONLY for CONSECUTIVE_ERRORS, NOT for MANUAL_PAUSE
   * Called by worker poll loop
   */
  async checkAndAutoResume(): Promise<boolean> {
    const state = await this.getDbState();
    
    if (!state.isPaused) return false;
    
    // MANUAL_PAUSE never auto-resumes
    if (state.pauseReason === PauseReason.MANUAL_PAUSE) {
      return false;
    }
    
    // UNKNOWN also doesn't auto-resume (conservative)
    if (state.pauseReason === PauseReason.UNKNOWN) {
      return false;
    }
    
    // CONSECUTIVE_ERRORS: auto-resume after cooloff
    if (state.pauseReason === PauseReason.CONSECUTIVE_ERRORS && state.pausedAt) {
      const pausedDuration = Date.now() - state.pausedAt.getTime();
      if (pausedDuration >= this.config.autoResumeCooloffMs) {
        // Must be leader to auto-resume
        const isLeader = await this.isLeader();
        if (!isLeader) {
          this.logger.debug('[WorkerSafety] Not leader, skipping auto-resume');
          return false;
        }
        
        this.logger.log('[WorkerSafety] Auto-resuming after cooloff', {
          pauseReason: state.pauseReason,
          pausedDurationMs: pausedDuration,
          cooloffMs: this.config.autoResumeCooloffMs,
        });
        
        await this.resume('auto-resume');
        return true;
      }
    }
    
    return false;
  }

  // ==========================================================================
  // CB Backoff (Memory-Only)
  // ==========================================================================

  /**
   * Get CB open backoff delay in ms
   * Memory-only: resets on restart (acceptable)
   */
  getCbOpenBackoffMs(): number {
    const backoff = this.config.cbOpenBackoffSteps[this.currentCbBackoffIndex] || 
                    this.config.cbOpenBackoffSteps[this.config.cbOpenBackoffSteps.length - 1];
    
    if (this.currentCbBackoffIndex < this.config.cbOpenBackoffSteps.length - 1) {
      this.currentCbBackoffIndex++;
    }
    
    return backoff;
  }

  /**
   * Reset CB backoff index
   */
  resetCbBackoff(): void {
    this.currentCbBackoffIndex = 0;
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get full state (DB + runtime)
   */
  async getState(): Promise<WorkerSafetyState> {
    const dbState = await this.getDbState();
    return {
      ...dbState,
      currentCbBackoffIndex: this.currentCbBackoffIndex,
      isLeader: await this.isLeader(),
    };
  }

  /**
   * Get DB state only
   */
  async getDbState(): Promise<WorkerSafetyDbState> {
    const row = await this.prisma.manifestWorkerState.findUnique({
      where: { id: 'singleton' },
    });
    
    if (!row) {
      return {
        isPaused: false,
        pauseReason: null,
        pausedAt: null,
        pausedBy: null,
        consecutiveErrors: 0,
        lastErrorCode: null,
        lastErrorAt: null,
        ownerInstanceId: null,
        leaseExpiresAt: null,
      };
    }

    return {
      isPaused: row.isPaused,
      pauseReason: row.pauseReason as PauseReason | null,
      pausedAt: row.pausedAt,
      pausedBy: row.pausedBy,
      consecutiveErrors: row.consecutiveErrors,
      lastErrorCode: row.lastErrorCode,
      lastErrorAt: row.lastErrorAt,
      ownerInstanceId: row.ownerInstanceId,
      leaseExpiresAt: row.leaseExpiresAt,
    };
  }

  /**
   * Get config (for testing)
   */
  getConfig(): WorkerSafetyConfig {
    return { ...this.config };
  }

  /**
   * Get lease expires in seconds (for metrics gauge)
   * Returns 0 if not leader or no lease
   */
  getLeaseExpiresInSeconds(): number {
    if (!this.lastLeaseExpiresAt) return 0;
    const now = Date.now();
    const expiresAt = this.lastLeaseExpiresAt.getTime();
    const remainingMs = expiresAt - now;
    return remainingMs > 0 ? remainingMs / 1000 : 0;
  }
}
