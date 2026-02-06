/**
 * Manifest Admin Audit Service
 * 
 * Phase 10.2 - Task 2.1
 * 
 * Buffered audit logging with degraded mode fallback.
 * 
 * ARCHITECTURE:
 * - Non-blocking append() for minimal latency impact
 * - Swap buffer pattern for thread-safe flush
 * - Dual flush triggers: time-based (5s) + size-based (1000)
 * - Degraded mode: file sink when DB unavailable
 * - Auto-recovery with health checks
 * 
 * STATE MACHINE:
 * - NORMAL: flush to DB
 * - DEGRADED: flush to file, health check every 30s
 * - 3 consecutive DB failures → DEGRADED
 * - Health check success → NORMAL
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../../../prisma/prisma.service';
import {
  AuditEvent,
  AuditEventInput,
  AuditServiceConfig,
  AuditServiceMode,
  AuditServiceState,
  DEFAULT_AUDIT_CONFIG,
  FlushReason,
} from './manifest-admin-audit.types';
import { hashIp } from './ip-hasher';
import { AuditFileSink } from './audit-file-sink';
import * as metrics from './audit-metrics';
import { getIdempotencyContext } from '../idempotency/idempotency-context';

// ============================================================================
// Interface
// ============================================================================

export interface IAuditService {
  append(event: AuditEventInput): void;
  flush(reason: FlushReason): Promise<void>;
  getState(): AuditServiceState;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class ManifestAdminAuditService implements IAuditService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ManifestAdminAuditService.name);
  private readonly config: AuditServiceConfig;
  
  // State
  private mode: AuditServiceMode = 'NORMAL';
  private consecutiveFailures = 0;
  private degradedSince: Date | null = null;
  private lastHealthCheckAt: Date | null = null;
  
  // Buffer (swap pattern)
  private buffer: AuditEvent[] = [];
  
  // Counters
  private totalFlushed = 0;
  private totalDropped = 0;
  private totalFileSinkWrites = 0;
  private dropLogCounter = 0;
  
  // Timers
  private flushTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  
  // File sink
  private fileSink: AuditFileSink;
  
  constructor(
    private readonly prisma: PrismaService,
    config?: Partial<AuditServiceConfig>,
  ) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.fileSink = new AuditFileSink({
      basePath: this.config.fileSinkPath,
      maxBytes: this.config.fileSinkMaxBytes,
      maxFiles: this.config.fileSinkMaxFiles,
    });
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  async onModuleInit(): Promise<void> {
    this.startFlushTimer();
    metrics.setServiceMode('NORMAL');
    this.logger.log('[AuditService] Initialized');
  }
  
  async onModuleDestroy(): Promise<void> {
    this.logger.log('[AuditService] Shutting down...');
    
    // 1. Stop timers
    this.stopTimers();
    
    // 2. Flush with timeout
    try {
      await Promise.race([
        this.flush('shutdown'),
        this.timeout(this.config.shutdownFlushTimeoutMs),
      ]);
    } catch (err) {
      this.logger.warn('[AuditService] Shutdown flush timeout or error, dumping to file');
      await this.dumpBufferToFile('shutdown_timeout');
    }
    
    this.logger.log('[AuditService] Shutdown complete');
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Append an audit event to the buffer.
   * Non-blocking - returns immediately.
   */
  append(input: AuditEventInput): void {
    // Check buffer overflow
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.handleBufferOverflow();
      return;
    }
    
    // PR-7.2: Enrich from ALS context (input takes precedence)
    const ctx = getIdempotencyContext();
    
    // Create event with timestamp and hashed IP
    const event: AuditEvent = {
      ...input,
      createdAt: new Date(),
      ipHash: hashIp(input.ipAddress, this.config.ipHashSecret),
      // PR-4: Normalize optional fields to null
      // PR-7.2: Enrich from ALS if input doesn't provide value
      actionId: input.actionId ?? ctx?.actionId ?? null,
      outcome: input.outcome ?? null,
      takeoverFrom: input.takeoverFrom ?? (ctx?.takeover ? ctx.previousActorId ?? null : null),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ? this.truncateErrorMessage(input.errorMessage) : null,
    };
    
    this.buffer.push(event);
    metrics.updateBufferSize(this.buffer.length);
    
    // Check size-based flush trigger
    if (this.buffer.length >= this.config.maxBufferSize) {
      // Schedule immediate flush (don't block append)
      setImmediate(() => this.flush('size').catch(err => {
        this.logger.error('[AuditService] Size-triggered flush failed', err);
      }));
    }
  }
  
  /**
   * Flush buffered events.
   * 
   * @param reason - Why flush was triggered
   */
  async flush(reason: FlushReason): Promise<void> {
    // Swap buffer (atomic)
    const batch = this.swapBuffer();
    if (batch.length === 0) return;
    
    const startTime = Date.now();
    
    if (this.mode === 'NORMAL') {
      await this.flushToDb(batch, reason, startTime);
    } else {
      await this.flushToFile(batch, reason);
    }
  }
  
  /**
   * Get current service state.
   */
  getState(): AuditServiceState {
    return {
      mode: this.mode,
      consecutiveFailures: this.consecutiveFailures,
      degradedSince: this.degradedSince,
      lastHealthCheckAt: this.lastHealthCheckAt,
      bufferSize: this.buffer.length,
      totalFlushed: this.totalFlushed,
      totalDropped: this.totalDropped,
      totalFileSinkWrites: this.totalFileSinkWrites,
    };
  }
  
  // ==========================================================================
  // Flush Implementations
  // ==========================================================================
  
  private async flushToDb(batch: AuditEvent[], reason: FlushReason, startTime: number): Promise<void> {
    try {
      await this.writeBatchToDb(batch);
      
      // Success
      const durationMs = Date.now() - startTime;
      this.totalFlushed += batch.length;
      this.consecutiveFailures = 0;
      
      metrics.recordFlush(batch.length, durationMs);
      this.logger.debug(`[AuditService] Flushed ${batch.length} events to DB (${reason}, ${durationMs}ms)`);
      
    } catch (err) {
      this.logger.error(`[AuditService] DB flush failed (${reason})`, err);
      metrics.recordDbWriteFailure();
      this.consecutiveFailures++;
      
      // Check degraded transition
      if (this.consecutiveFailures >= this.config.consecutiveFailThreshold) {
        this.transitionToDegraded();
      }
      
      // Dump failed batch to file
      await this.dumpBatchToFile(batch, 'db_failure');
    }
  }
  
  private async flushToFile(batch: AuditEvent[], reason: FlushReason): Promise<void> {
    try {
      const count = await this.fileSink.write(batch);
      this.totalFileSinkWrites += count;
      metrics.recordFileWrite(count);
      this.logger.debug(`[AuditService] Flushed ${count} events to file (${reason})`);
      
      // Update pending bytes metric
      const stats = await this.fileSink.getStats();
      metrics.updateDegradedFilePendingBytes(stats.pendingBytes);
      
    } catch (err) {
      this.logger.error(`[AuditService] File sink write failed (${reason})`, err);
      metrics.recordFileSinkFailure();
      // Events are lost - this is acceptable in degraded mode
      this.totalDropped += batch.length;
    }
  }
  
  // ==========================================================================
  // DB Operations
  // ==========================================================================
  
  private async writeBatchToDb(batch: AuditEvent[]): Promise<void> {
    // Use raw SQL for batch insert performance
    const values = batch.map(e => `(
      '${e.eventType}',
      '${this.escapeString(e.actor)}',
      '${this.escapeString(e.requestId)}',
      ${e.ipHash ? `'${e.ipHash}'` : 'NULL'},
      ${e.userAgent ? `'${this.escapeString(e.userAgent)}'` : 'NULL'},
      '${e.resourceType}',
      '${this.escapeString(e.resourceId)}',
      ${e.targetBundleId ? `'${this.escapeString(e.targetBundleId)}'::uuid` : 'NULL'},
      ${e.beforeState ? `'${this.escapeString(JSON.stringify(e.beforeState))}'::jsonb` : 'NULL'},
      ${e.afterState ? `'${this.escapeString(JSON.stringify(e.afterState))}'::jsonb` : 'NULL'},
      ${e.reason ? `'${this.escapeString(e.reason)}'` : 'NULL'},
      '${e.createdAt.toISOString()}'::timestamptz,
      ${e.actionId ? `'${this.escapeString(e.actionId)}'::uuid` : 'NULL'},
      ${e.outcome ? `'${e.outcome}'` : 'NULL'},
      ${e.takeoverFrom ? `'${this.escapeString(e.takeoverFrom)}'` : 'NULL'},
      ${e.errorCode ? `'${this.escapeString(e.errorCode)}'` : 'NULL'},
      ${e.errorMessage ? `'${this.escapeString(e.errorMessage)}'` : 'NULL'}
    )`).join(',\n');
    
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO manifest_admin_audit_log (
        event_type, actor, request_id, ip_hash, user_agent,
        resource_type, resource_id, target_bundle_id,
        before_state, after_state, reason, created_at,
        action_id, outcome, takeover_from, error_code, error_message
      ) VALUES ${values}
    `);
  }
  
  private async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
  
  // ==========================================================================
  // State Transitions
  // ==========================================================================
  
  private transitionToDegraded(): void {
    if (this.mode === 'DEGRADED') return;
    
    this.mode = 'DEGRADED';
    this.degradedSince = new Date();
    metrics.setServiceMode('DEGRADED');
    
    this.logger.warn(`[AuditService] Transitioned to DEGRADED mode after ${this.consecutiveFailures} failures`);
    
    // Start health check timer
    this.startHealthCheckTimer();
  }
  
  private async transitionToNormal(): Promise<void> {
    if (this.mode === 'NORMAL') return;
    
    this.mode = 'NORMAL';
    this.consecutiveFailures = 0;
    this.degradedSince = null;
    metrics.setServiceMode('NORMAL');
    
    this.logger.log('[AuditService] Recovered to NORMAL mode');
    
    // Stop health check timer
    this.stopHealthCheckTimer();
    
    // Flush any pending buffer to DB
    if (this.buffer.length > 0) {
      await this.flush('manual').catch(err => {
        this.logger.error('[AuditService] Post-recovery flush failed', err);
      });
    }
  }
  
  // ==========================================================================
  // Timers
  // ==========================================================================
  
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush('timer').catch(err => {
        this.logger.error('[AuditService] Timer-triggered flush failed', err);
      });
    }, this.config.flushIntervalMs);
  }
  
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(async () => {
      this.lastHealthCheckAt = new Date();
      
      const healthy = await this.healthCheck();
      if (healthy) {
        await this.transitionToNormal();
      } else {
        this.logger.debug('[AuditService] Health check failed, staying in DEGRADED mode');
      }
    }, this.config.recoveryCheckIntervalMs);
  }
  
  private stopTimers(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.stopHealthCheckTimer();
  }
  
  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  // ==========================================================================
  // Buffer Management
  // ==========================================================================
  
  private swapBuffer(): AuditEvent[] {
    const batch = this.buffer;
    this.buffer = [];
    metrics.updateBufferSize(0);
    return batch;
  }
  
  private handleBufferOverflow(): void {
    this.totalDropped++;
    metrics.recordBufferOverflow();
    
    // Rate-limited log (every 100 drops)
    this.dropLogCounter++;
    if (this.dropLogCounter % 100 === 1) {
      this.logger.warn(`[AuditService] Buffer overflow, dropping events. Total dropped: ${this.totalDropped}`);
    }
  }
  
  // ==========================================================================
  // File Dump Helpers
  // ==========================================================================
  
  private async dumpBatchToFile(batch: AuditEvent[], reason: string): Promise<void> {
    try {
      await this.fileSink.write(batch);
      this.totalFileSinkWrites += batch.length;
      metrics.recordFileWrite(batch.length);
      this.logger.debug(`[AuditService] Dumped ${batch.length} events to file (${reason})`);
    } catch (err) {
      this.logger.error(`[AuditService] Failed to dump batch to file (${reason})`, err);
      metrics.recordFileSinkFailure();
      this.totalDropped += batch.length;
    }
  }
  
  private async dumpBufferToFile(reason: string): Promise<void> {
    const batch = this.swapBuffer();
    if (batch.length > 0) {
      await this.dumpBatchToFile(batch, reason);
    }
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), ms);
    });
  }
  
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Truncate error message to 512 chars.
   * Removes stack traces and sanitizes content.
   */
  private truncateErrorMessage(message: string): string {
    // Remove stack traces (lines starting with "at ")
    const sanitized = message
      .split('\n')
      .filter(line => !line.trim().startsWith('at '))
      .join(' ')
      .trim();
    
    // Truncate to 512 chars
    if (sanitized.length <= 512) {
      return sanitized;
    }
    return sanitized.substring(0, 509) + '...';
  }
}
