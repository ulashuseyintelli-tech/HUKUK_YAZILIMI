/**
 * In-Memory Snapshot Store
 * 
 * Phase 8 - Sprint 2C
 * 
 * InMemory implementation of ISnapshotStore.
 * Production adapter (DB/Redis) can be added later with same interface.
 * 
 * Key behaviors:
 * - Policy transitions use retention-policy.ts as SINGLE SOURCE OF TRUTH
 * - markPromoted returns result with changed flag (idempotent)
 * - applyLegalHold is convenience method for LEGAL_HOLD upgrade
 * - setRetentionPolicy enforces upgrade-only rule (downgrade FORBIDDEN)
 * - deleteExpired accepts optional now parameter for testing
 * - LEGAL_HOLD snapshots never expire
 * - TTL always based on createdAt (NOT promotedAt)
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { EvidenceSnapshot } from '../diagnostics.types';
import {
  ISnapshotStore,
  StoredSnapshot,
  SnapshotRetentionConfig,
  MarkPromotedResult,
  ApplyLegalHoldResult,
  SetRetentionPolicyResult,
} from './snapshot-store.types';
import {
  RetentionPolicy,
  validateTransition,
  calculateExpiresAt,
  isExpired,
} from './retention-policy';
import {
  ISnapshotAuditEmitter,
  NoOpSnapshotAuditEmitter,
  SnapshotPromotedEvent,
  SnapshotLegalHoldAppliedEvent,
  SnapshotPolicyChangedEvent,
} from './snapshot-audit.types';
import { IClock } from './clock.service';

@Injectable()
export class InMemorySnapshotStore implements ISnapshotStore {
  private readonly logger = new Logger(InMemorySnapshotStore.name);
  private readonly store: Map<string, StoredSnapshot> = new Map();
  private readonly auditEmitter: ISnapshotAuditEmitter;

  constructor(
    private readonly clock: IClock,
    _config?: Partial<SnapshotRetentionConfig>,
    auditEmitter?: ISnapshotAuditEmitter,
  ) {
    // Config is reserved for future use (e.g., custom retention hours)
    this.auditEmitter = auditEmitter || new NoOpSnapshotAuditEmitter();
  }

  async save(snapshot: EvidenceSnapshot): Promise<string> {
    const now = this.clock.now();
    const createdAt = now.toISOString();
    const expiresAt = calculateExpiresAt(now, 'STANDARD');

    const stored: StoredSnapshot = {
      ...snapshot,
      createdAt,
      expiresAt,
      promoted: false,
      retentionPolicy: 'STANDARD',
    };

    this.store.set(snapshot.snapshotId, stored);

    this.logger.debug('[SnapshotStore] Snapshot saved', {
      snapshotId: snapshot.snapshotId,
      incidentId: snapshot.incidentId,
      expiresAt,
    });

    return snapshot.snapshotId;
  }

  async get(snapshotId: string): Promise<StoredSnapshot | null> {
    const stored = this.store.get(snapshotId);
    
    if (!stored) {
      return null;
    }

    // Check if expired (LEGAL_HOLD never expires)
    const now = this.clock.now();
    if (isExpired(stored.expiresAt, stored.retentionPolicy, now)) {
      this.logger.debug('[SnapshotStore] Snapshot expired on access', {
        snapshotId,
        expiresAt: stored.expiresAt,
      });
      return null;
    }

    return stored;
  }

  async listByIncident(incidentId: string): Promise<StoredSnapshot[]> {
    const now = this.clock.now();
    const results: StoredSnapshot[] = [];

    for (const stored of this.store.values()) {
      if (stored.incidentId === incidentId && !isExpired(stored.expiresAt, stored.retentionPolicy, now)) {
        results.push(stored);
      }
    }

    // Sort by capturedAt DESC (newest first)
    results.sort((a, b) => {
      const aTime = new Date(a.capturedAt).getTime();
      const bTime = new Date(b.capturedAt).getTime();
      return bTime - aTime;
    });

    return results;
  }

  async markPromoted(snapshotId: string): Promise<MarkPromotedResult> {
    const stored = this.store.get(snapshotId);
    
    if (!stored) {
      this.logger.warn('[SnapshotStore] markPromoted: snapshot not found', { snapshotId });
      return {
        success: false,
        changed: false,
        previousPolicy: 'STANDARD', // Default for not found
        newPolicy: 'STANDARD',
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    const previousPolicy = stored.retentionPolicy;

    // LEGAL_HOLD > PROMOTED, so no-op if already LEGAL_HOLD
    if (stored.retentionPolicy === 'LEGAL_HOLD') {
      this.logger.debug('[SnapshotStore] markPromoted: already LEGAL_HOLD, skipping', {
        snapshotId,
      });
      return {
        success: true,
        changed: false,
        previousPolicy,
        newPolicy: 'LEGAL_HOLD',
      };
    }

    // Already promoted = idempotent no-op
    if (stored.promoted && stored.promotedAt) {
      this.logger.debug('[SnapshotStore] markPromoted: already promoted, skipping', {
        snapshotId,
        promotedAt: stored.promotedAt,
      });
      return {
        success: true,
        changed: false,
        previousPolicy,
        newPolicy: 'PROMOTED',
        promotedAt: stored.promotedAt,
      };
    }

    // First promote: set promotedAt and update policy
    const now = this.clock.now();
    const promotedAt = now.toISOString();
    
    stored.promoted = true;
    stored.promotedAt = promotedAt;
    stored.retentionPolicy = 'PROMOTED';
    // TTL based on createdAt, NOT promotedAt
    stored.expiresAt = calculateExpiresAt(new Date(stored.createdAt), 'PROMOTED');

    this.logger.debug('[SnapshotStore] Snapshot promoted', {
      snapshotId,
      promotedAt,
      newExpiresAt: stored.expiresAt,
    });

    // Emit audit event (only on actual change)
    const auditEvent: SnapshotPromotedEvent = {
      eventType: 'SNAPSHOT_PROMOTED',
      snapshotId,
      incidentId: stored.incidentId,
      tenantId: stored.tenantId,
      timestamp: promotedAt,
      actor: 'system',
      previousPolicy,
      newPolicy: 'PROMOTED',
      promotedAt,
    };
    this.auditEmitter.emit(auditEvent);

    return {
      success: true,
      changed: true,
      previousPolicy,
      newPolicy: 'PROMOTED',
      promotedAt,
    };
  }

  async applyLegalHold(snapshotId: string): Promise<ApplyLegalHoldResult> {
    const stored = this.store.get(snapshotId);
    
    if (!stored) {
      this.logger.warn('[SnapshotStore] applyLegalHold: snapshot not found', { snapshotId });
      return {
        success: false,
        changed: false,
        previousPolicy: 'STANDARD',
        newPolicy: 'STANDARD',
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    const previousPolicy = stored.retentionPolicy;

    // Already LEGAL_HOLD = idempotent no-op
    if (stored.retentionPolicy === 'LEGAL_HOLD') {
      this.logger.debug('[SnapshotStore] applyLegalHold: already LEGAL_HOLD, skipping', {
        snapshotId,
      });
      return {
        success: true,
        changed: false,
        previousPolicy,
        newPolicy: 'LEGAL_HOLD',
      };
    }

    // Apply LEGAL_HOLD (always allowed - upgrade)
    const now = this.clock.now();
    stored.retentionPolicy = 'LEGAL_HOLD';
    stored.expiresAt = null; // Never expires

    this.logger.debug('[SnapshotStore] Legal hold applied', {
      snapshotId,
      previousPolicy,
    });

    // Emit audit event (only on actual change)
    const auditEvent: SnapshotLegalHoldAppliedEvent = {
      eventType: 'SNAPSHOT_LEGAL_HOLD_APPLIED',
      snapshotId,
      incidentId: stored.incidentId,
      tenantId: stored.tenantId,
      timestamp: now.toISOString(),
      actor: 'system',
      previousPolicy,
      newPolicy: 'LEGAL_HOLD',
    };
    this.auditEmitter.emit(auditEvent);

    return {
      success: true,
      changed: true,
      previousPolicy,
      newPolicy: 'LEGAL_HOLD',
    };
  }

  async setRetentionPolicy(snapshotId: string, policy: RetentionPolicy): Promise<SetRetentionPolicyResult> {
    const stored = this.store.get(snapshotId);
    
    if (!stored) {
      this.logger.warn('[SnapshotStore] setRetentionPolicy: snapshot not found', { snapshotId });
      return {
        success: false,
        changed: false,
        previousPolicy: 'STANDARD',
        newPolicy: 'STANDARD',
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    const previousPolicy = stored.retentionPolicy;

    // Validate transition using SINGLE SOURCE OF TRUTH
    const transitionResult = validateTransition(previousPolicy, policy);

    if (!transitionResult.success) {
      this.logger.warn('[SnapshotStore] setRetentionPolicy: downgrade forbidden', {
        snapshotId,
        from: previousPolicy,
        to: policy,
      });
      return {
        ...transitionResult,
        newExpiresAt: stored.expiresAt,
      };
    }

    // No change = idempotent no-op
    if (!transitionResult.changed) {
      return {
        ...transitionResult,
        newExpiresAt: stored.expiresAt,
      };
    }

    // Apply policy change
    const now = this.clock.now();
    stored.retentionPolicy = policy;
    stored.expiresAt = calculateExpiresAt(new Date(stored.createdAt), policy);

    // Set promoted flag if upgrading to PROMOTED
    if (policy === 'PROMOTED' && !stored.promoted) {
      stored.promoted = true;
      stored.promotedAt = now.toISOString();
    }

    this.logger.debug('[SnapshotStore] Retention policy updated', {
      snapshotId,
      previousPolicy,
      newPolicy: policy,
      newExpiresAt: stored.expiresAt,
    });

    // Emit audit event (only on actual change)
    const auditEvent: SnapshotPolicyChangedEvent = {
      eventType: 'SNAPSHOT_POLICY_CHANGED',
      snapshotId,
      incidentId: stored.incidentId,
      tenantId: stored.tenantId,
      timestamp: now.toISOString(),
      actor: 'system',
      previousPolicy,
      newPolicy: policy,
      newExpiresAt: stored.expiresAt,
    };
    this.auditEmitter.emit(auditEvent);

    return {
      ...transitionResult,
      newExpiresAt: stored.expiresAt,
    };
  }

  async deleteExpired(now?: Date): Promise<number> {
    const currentTime = now || this.clock.now();
    let deletedCount = 0;

    for (const [snapshotId, stored] of this.store.entries()) {
      // LEGAL_HOLD snapshots are NEVER deleted
      if (stored.retentionPolicy === 'LEGAL_HOLD') {
        continue;
      }
      
      if (isExpired(stored.expiresAt, stored.retentionPolicy, currentTime)) {
        this.store.delete(snapshotId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.debug('[SnapshotStore] Expired snapshots deleted', {
        deletedCount,
        remainingCount: this.store.size,
      });
    }

    return deletedCount;
  }

  async getStats(): Promise<{
    totalCount: number;
    promotedCount: number;
    expiredCount: number;
    legalHoldCount: number;
  }> {
    const now = this.clock.now();
    let promotedCount = 0;
    let expiredCount = 0;
    let legalHoldCount = 0;

    for (const stored of this.store.values()) {
      if (stored.promoted) promotedCount++;
      if (stored.retentionPolicy === 'LEGAL_HOLD') legalHoldCount++;
      if (isExpired(stored.expiresAt, stored.retentionPolicy, now)) expiredCount++;
    }

    return {
      totalCount: this.store.size,
      promotedCount,
      expiredCount,
      legalHoldCount,
    };
  }

  /**
   * List all snapshots (for legal hold inventory)
   */
  async listAll(): Promise<StoredSnapshot[]> {
    const now = this.clock.now();
    const results: StoredSnapshot[] = [];

    for (const stored of this.store.values()) {
      // Include non-expired snapshots
      if (!isExpired(stored.expiresAt, stored.retentionPolicy, now)) {
        results.push(stored);
      }
    }

    // Sort by createdAt DESC (newest first)
    results.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    return results;
  }

  /**
   * Clear all snapshots (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get raw store size (for testing)
   */
  size(): number {
    return this.store.size;
  }
}
