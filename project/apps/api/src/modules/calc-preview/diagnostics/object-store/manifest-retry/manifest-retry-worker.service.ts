/**
 * Manifest Retry Worker Service
 * 
 * Phase 10 - Task 10.1.6
 * 
 * Core worker loop for processing manifest retry jobs:
 * 1. Claim eligible job (SKIP LOCKED)
 * 2. Attempt manifest write
 * 3. Classify result
 * 4. Execute state transition
 * 5. Emit metrics
 * 
 * LOCKED CONTRACT - See PHASE-10-WORKER-ARCHITECTURE.md
 * 
 * @see .kiro/specs/phase-10-retry-signature/PHASE-10-WORKER-ARCHITECTURE.md
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { 
  IManifestRetryQueueRepository,
} from './manifest-retry-queue.repository';
import {
  IManifestDlqRepository,
} from './manifest-dlq.repository';
import {
  classifyError,
  ClassifierDecision,
  ManifestErrorCode,
} from './manifest-error-classifier';
import {
  RetryQueueJob,
  calculateNextAttemptAt,
} from './manifest-retry.types';
import {
  ManifestRetryWorkerConfig,
  DEFAULT_WORKER_CONFIG,
  generateWorkerId,
} from './manifest-retry-worker.config';

// ============================================================================
// Types
// ============================================================================

/** Result of manifest write attempt */
export interface ManifestWriteResult {
  outcome: 'written' | 'already_exists' | 'error';
  manifestKey?: string;
  error?: unknown;
  errorCode?: ManifestErrorCode;
  errorMessage?: string;
}

/** Interface for manifest writer (injected dependency) */
export interface IManifestWriter {
  tryWriteManifest(bundleId: string): Promise<ManifestWriteResult>;
}

/** Result of single worker iteration */
export interface WorkerIterationResult {
  processed: boolean;
  skipped?: boolean;
  reason?: string;
  decision?: ClassifierDecision;
  jobId?: string;
  bundleId?: string;
  durationMs?: number;
  error?: unknown;
}

/** Worker metrics interface */
export interface IWorkerMetrics {
  recordJobClaimed(source: string): void;
  recordJobDone(reason: string, durationMs: number): void;
  recordJobRetryScheduled(errorCode: string, attempt: number): void;
  recordJobDlq(errorCode: string): void;
  recordCircuitBreakerState(state: 'closed' | 'open' | 'half_open'): void;
  recordWorkerPoll(): void;
  recordWorkerIdle(): void;
  recordWorkerError(errorCode: string): void;
}

/** No-op metrics implementation */
export class NoOpWorkerMetrics implements IWorkerMetrics {
  recordJobClaimed(_source: string): void {}
  recordJobDone(_reason: string, _durationMs: number): void {}
  recordJobRetryScheduled(_errorCode: string, _attempt: number): void {}
  recordJobDlq(_errorCode: string): void {}
  recordCircuitBreakerState(_state: 'closed' | 'open' | 'half_open'): void {}
  recordWorkerPoll(): void {}
  recordWorkerIdle(): void {}
  recordWorkerError(_errorCode: string): void {}
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  
  constructor(failureThreshold: number = 5, resetTimeoutMs: number = 60_000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }
  
  getState(): CircuitBreakerState {
    if (this.state === 'open') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half_open';
      }
    }
    return this.state;
  }
  
  isOpen(): boolean {
    return this.getState() === 'open';
  }
  
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }
  
  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }
  
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}

// ============================================================================
// Worker Service
// ============================================================================

@Injectable()
export class ManifestRetryWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(ManifestRetryWorkerService.name);
  private readonly instanceId: string;
  private readonly config: ManifestRetryWorkerConfig;
  private readonly circuitBreaker: CircuitBreaker;
  
  private running = false;
  private processingCount = 0;
  
  constructor(
    private readonly retryQueue: IManifestRetryQueueRepository,
    private readonly dlqRepo: IManifestDlqRepository,
    private readonly manifestWriter: IManifestWriter,
    private readonly metrics: IWorkerMetrics = new NoOpWorkerMetrics(),
    config: Partial<ManifestRetryWorkerConfig> = {},
  ) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
    this.instanceId = generateWorkerId(this.config.instanceIdPrefix);
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreakerFailureThreshold,
      this.config.circuitBreakerResetMs
    );
    
    this.logger.log(`Worker initialized: instanceId=${this.instanceId}`);
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  /**
   * Start the worker loop
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('Worker already running');
      return;
    }
    
    this.running = true;
    this.logger.log(`Worker started: instanceId=${this.instanceId}`);
    
    while (this.running) {
      try {
        await this.processOnce();
      } catch (error) {
        this.logger.error('Worker loop error', error);
        this.metrics.recordWorkerError('LOOP_ERROR');
      }
      
      if (this.running) {
        await this.sleep(this.config.pollIntervalMs);
      }
    }
    
    this.logger.log(`Worker stopped: instanceId=${this.instanceId}`);
  }
  
  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    this.logger.log(`Worker stopping: instanceId=${this.instanceId}`);
    this.running = false;
    
    // Wait for in-progress jobs to complete
    const startTime = Date.now();
    while (this.processingCount > 0) {
      if (Date.now() - startTime > this.config.shutdownTimeoutMs) {
        this.logger.warn(`Shutdown timeout reached, ${this.processingCount} jobs still processing`);
        break;
      }
      await this.sleep(100);
    }
  }
  
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
  
  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }
  
  /**
   * Get worker instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }
  
  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }
  
  // ==========================================================================
  // Core Processing
  // ==========================================================================
  
  /**
   * Process one iteration of the worker loop
   */
  async processOnce(): Promise<WorkerIterationResult> {
    this.metrics.recordWorkerPoll();
    
    // 1. Circuit breaker check
    if (this.config.circuitBreakerEnabled && this.circuitBreaker.isOpen()) {
      this.metrics.recordCircuitBreakerState('open');
      this.logger.debug('Circuit breaker open, skipping');
      return { processed: false, skipped: true, reason: 'circuit_open' };
    }
    
    // 2. Claim next job
    const claimResult = await this.retryQueue.claimNext(
      this.instanceId,
      this.config.leaseMs
    );
    
    if (!claimResult.claimed || !claimResult.job) {
      this.metrics.recordWorkerIdle();
      return { processed: false, reason: 'no_jobs' };
    }
    
    const job = claimResult.job;
    this.processingCount++;
    const startTime = Date.now();
    
    this.logger.debug(`Processing job: jobId=${job.id}, bundleId=${job.bundleId}, attempt=${job.attempt}`);
    this.metrics.recordJobClaimed(job.source);
    
    try {
      // 3. Attempt manifest write
      const writeResult = await this.manifestWriter.tryWriteManifest(job.bundleId);
      
      // 4. Classify result
      const decision = this.classifyWriteResult(writeResult, job.attempt);
      
      // 5. Execute transition
      await this.executeTransition(job, decision, writeResult);
      
      // 6. Update circuit breaker
      if (decision === 'DONE_NOOP' || writeResult.outcome === 'written') {
        this.circuitBreaker.recordSuccess();
      } else if (decision === 'RETRY' || decision === 'DLQ') {
        this.circuitBreaker.recordFailure();
      }
      
      // 7. Emit metrics
      const durationMs = Date.now() - startTime;
      this.emitDecisionMetrics(decision, writeResult, job, durationMs);
      
      this.logger.debug(`Job processed: jobId=${job.id}, decision=${decision}, durationMs=${durationMs}`);
      
      return {
        processed: true,
        decision,
        jobId: job.id,
        bundleId: job.bundleId,
        durationMs,
      };
      
    } catch (error) {
      // Handle unexpected errors
      const classified = classifyError(error, job.attempt);
      const writeResult: ManifestWriteResult = {
        outcome: 'error',
        error,
        errorCode: classified.errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      
      await this.executeTransition(job, classified.decision, writeResult);
      this.circuitBreaker.recordFailure();
      
      const durationMs = Date.now() - startTime;
      this.emitDecisionMetrics(classified.decision, writeResult, job, durationMs);
      
      this.logger.error(`Job error: jobId=${job.id}, error=${error}`);
      
      return {
        processed: true,
        decision: classified.decision,
        jobId: job.id,
        bundleId: job.bundleId,
        durationMs,
        error,
      };
    } finally {
      this.processingCount--;
    }
  }
  
  // ==========================================================================
  // Classification
  // ==========================================================================
  
  private classifyWriteResult(result: ManifestWriteResult, attempt: number): ClassifierDecision {
    if (result.outcome === 'written') {
      return 'DONE_NOOP'; // Actually success, but we use DONE_NOOP for consistency
    }
    
    if (result.outcome === 'already_exists') {
      return 'DONE_NOOP';
    }
    
    // Error case - use classifier
    return classifyError(result.error, attempt).decision;
  }
  
  // ==========================================================================
  // State Transitions
  // ==========================================================================
  
  private async executeTransition(
    job: RetryQueueJob,
    decision: ClassifierDecision,
    result: ManifestWriteResult
  ): Promise<void> {
    switch (decision) {
      case 'DONE_NOOP':
        // Success or already exists
        const reason = result.outcome === 'written' ? 'OK' : 'DONE_NOOP';
        await this.retryQueue.markDone({ jobId: job.id, reason });
        break;
        
      case 'RETRY':
        // Check max attempts
        if (job.attempt + 1 >= job.maxAttempts) {
          // Max attempts reached → DLQ
          await this.moveToDlq(job, result);
        } else {
          // Schedule retry with backoff
          const nextAttemptAt = calculateNextAttemptAt(job.attempt + 1);
          const scheduleInput: {
            jobId: string;
            errorCode: ManifestErrorCode;
            errorMessage?: string;
            nextAttemptAt: Date;
          } = {
            jobId: job.id,
            errorCode: result.errorCode ?? ManifestErrorCode.UNKNOWN,
            nextAttemptAt,
          };
          if (result.errorMessage !== undefined) {
            scheduleInput.errorMessage = result.errorMessage;
          }
          await this.retryQueue.scheduleRetry(scheduleInput);
        }
        break;
        
      case 'DLQ':
        await this.moveToDlq(job, result);
        break;
    }
  }
  
  private async moveToDlq(job: RetryQueueJob, result: ManifestWriteResult): Promise<void> {
    // Insert/update DLQ entry
    const dlqInput: {
      bundleId: string;
      attempt: number;
      errorCode: ManifestErrorCode;
      errorMessage?: string;
      firstFailedAt: Date;
      lastFailedAt: Date;
    } = {
      bundleId: job.bundleId,
      attempt: job.attempt + 1,
      errorCode: result.errorCode ?? ManifestErrorCode.UNKNOWN,
      firstFailedAt: job.createdAt,
      lastFailedAt: new Date(),
    };
    if (result.errorMessage !== undefined) {
      dlqInput.errorMessage = result.errorMessage;
    }
    await this.dlqRepo.upsert(dlqInput);
    
    // Mark job as done with DLQ reason
    await this.retryQueue.markDone({ jobId: job.id, reason: 'DLQ' });
  }
  
  // ==========================================================================
  // Metrics
  // ==========================================================================
  
  private emitDecisionMetrics(
    decision: ClassifierDecision,
    result: ManifestWriteResult,
    job: RetryQueueJob,
    durationMs: number
  ): void {
    switch (decision) {
      case 'DONE_NOOP':
        const reason = result.outcome === 'written' ? 'ok' : 'done_noop';
        this.metrics.recordJobDone(reason, durationMs);
        break;
        
      case 'RETRY':
        if (job.attempt + 1 >= job.maxAttempts) {
          // Actually went to DLQ due to max attempts
          this.metrics.recordJobDlq(result.errorCode ?? 'UNKNOWN');
        } else {
          this.metrics.recordJobRetryScheduled(
            result.errorCode ?? 'UNKNOWN',
            job.attempt + 1
          );
        }
        break;
        
      case 'DLQ':
        this.metrics.recordJobDlq(result.errorCode ?? 'UNKNOWN');
        break;
    }
    
    this.metrics.recordCircuitBreakerState(this.circuitBreaker.getState());
  }
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

