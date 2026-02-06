/**
 * Idempotency Gate Service
 * 
 * Phase 10.3 - PR-2
 * 
 * PostgreSQL-based idempotency gate for admin mutations.
 * 
 * ARCHITECTURE:
 * - INSERT-first pattern with ON CONFLICT DO NOTHING
 * - Lease-based ownership with CAS takeover
 * - Deterministic cached response replay
 * 
 * STATE MACHINE:
 * - NEW → IN_PROGRESS (INSERT success)
 * - IN_PROGRESS → COMPLETED | FAILED (owner completes)
 * - IN_PROGRESS (lease expired) → TAKEOVER (CAS update)
 * 
 * @see .kiro/specs/phase-10-3-idempotency-hardening/ARCHITECTURE.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../../prisma/prisma.service';
import {
  GateResult,
  GateAcquireInput,
  GateCompleteInput,
  GateFailInput,
  GateExtendLeaseInput,
  AdminActionRow,
  DEFAULT_IDEMPOTENCY_CONFIG,
} from './idempotency-gate.types';

// ============================================================================
// Interface
// ============================================================================

export interface IIdempotencyGateService {
  checkAndAcquire(input: GateAcquireInput): Promise<GateResult>;
  extendLease(input: GateExtendLeaseInput): Promise<void>;
  complete(input: GateCompleteInput): Promise<void>;
  fail(input: GateFailInput): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class IdempotencyGateService implements IIdempotencyGateService {
  private readonly logger = new Logger(IdempotencyGateService.name);
  private readonly config = DEFAULT_IDEMPOTENCY_CONFIG;

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Check And Acquire
  // ==========================================================================

  /**
   * Check if action exists and acquire ownership if not.
   * 
   * Flow:
   * 1. INSERT-first attempt (ON CONFLICT DO NOTHING)
   * 2. If inserted → PROCEED (new action)
   * 3. If conflict → SELECT existing row
   * 4. If COMPLETED/FAILED → CACHED (replay response)
   * 5. If IN_PROGRESS + lease valid → IN_PROGRESS (retry later)
   * 6. If IN_PROGRESS + lease expired → CAS takeover → PROCEED
   */
  async checkAndAcquire(input: GateAcquireInput): Promise<GateResult> {
    const {
      requestId,
      actionType,
      endpoint,
      resourceType,
      resourceId,
      actorId,
      actorEmail,
      ipHash,
      leaseSeconds,
      retentionDays,
    } = input;

    try {
      // 1. INSERT-first attempt
      const inserted = await this.prisma.$queryRaw<{ id: string; owner_token: string }[]>`
        INSERT INTO manifest_admin_actions (
          request_id, status,
          http_status, result_code, result_json,
          action_type, endpoint, resource_type, resource_id,
          actor_id, actor_email, ip_hash,
          owner_token, lease_expires_at,
          created_at, expires_at
        )
        VALUES (
          ${requestId}, 'IN_PROGRESS',
          NULL, NULL, NULL,
          ${actionType}, ${endpoint}, ${resourceType}, ${resourceId ?? null}::uuid,
          ${actorId}::uuid, ${actorEmail ?? null}, ${ipHash ?? null},
          gen_random_uuid(),
          now() + make_interval(secs => ${leaseSeconds}),
          now(),
          now() + make_interval(days => ${retentionDays})
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING id, owner_token
      `;

      if (inserted.length === 1) {
        this.logger.debug(`[checkAndAcquire] New action: requestId=${requestId}, actionId=${inserted[0].id}`);
        return {
          type: 'PROCEED',
          actionId: inserted[0].id,
          ownerToken: inserted[0].owner_token,
          takeover: false,
        };
      }

      // 2. Conflict → load existing row
      const rows = await this.prisma.$queryRaw<AdminActionRow[]>`
        SELECT id, status, http_status, result_json, lease_expires_at, actor_id
        FROM manifest_admin_actions
        WHERE request_id = ${requestId}
        LIMIT 1
      `;

      if (rows.length !== 1) {
        // Extremely unlikely: unique conflict but missing row
        this.logger.warn(`[checkAndAcquire] Conflict but row missing: requestId=${requestId}`);
        return { type: 'IN_PROGRESS', actionId: 'unknown', retryAfterSeconds: this.config.retryAfterSeconds };
      }

      const row = rows[0];

      // 3. COMPLETED or FAILED → CACHED
      if (row.status === 'COMPLETED' || row.status === 'FAILED') {
        this.logger.debug(`[checkAndAcquire] Cached: requestId=${requestId}, status=${row.status}`);
        return {
          type: 'CACHED',
          actionId: row.id,
          httpStatus: row.http_status ?? 200,
          payload: row.result_json ?? null,
        };
      }

      // 4. IN_PROGRESS: check lease
      const leaseExpired = row.lease_expires_at.getTime() <= Date.now();
      if (!leaseExpired) {
        this.logger.debug(`[checkAndAcquire] In progress: requestId=${requestId}, actionId=${row.id}`);
        return {
          type: 'IN_PROGRESS',
          actionId: row.id,
          retryAfterSeconds: this.config.retryAfterSeconds,
        };
      }

      // 5. Lease expired → CAS takeover
      const taken = await this.prisma.$queryRaw<{ id: string; owner_token: string }[]>`
        UPDATE manifest_admin_actions
        SET owner_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => ${leaseSeconds})
        WHERE id = ${row.id}::uuid
          AND status = 'IN_PROGRESS'
          AND lease_expires_at <= now()
        RETURNING id, owner_token
      `;

      if (taken.length === 1) {
        this.logger.warn(`[checkAndAcquire] Takeover: requestId=${requestId}, previousActor=${row.actor_id}`);
        return {
          type: 'PROCEED',
          actionId: taken[0].id,
          ownerToken: taken[0].owner_token,
          takeover: true,
          previousActorId: row.actor_id,
        };
      }

      // 6. CAS failed → someone else took it or completed it
      const reread = await this.prisma.$queryRaw<AdminActionRow[]>`
        SELECT id, status, http_status, result_json
        FROM manifest_admin_actions
        WHERE request_id = ${requestId}
        LIMIT 1
      `;

      if (reread.length === 1 && (reread[0].status === 'COMPLETED' || reread[0].status === 'FAILED')) {
        return {
          type: 'CACHED',
          actionId: reread[0].id,
          httpStatus: reread[0].http_status ?? 200,
          payload: reread[0].result_json ?? null,
        };
      }

      return { type: 'IN_PROGRESS', actionId: row.id, retryAfterSeconds: this.config.retryAfterSeconds };

    } catch (error) {
      this.logger.error(`[checkAndAcquire] Failed: requestId=${requestId}`, error);
      throw error;
    }
  }

  // ==========================================================================
  // Extend Lease
  // ==========================================================================

  /**
   * Extend lease for heartbeat pattern.
   * 
   * Clamp: lease_expires_at <= created_at + maxTotalSeconds
   * Only owner can extend (owner_token check).
   */
  async extendLease(input: GateExtendLeaseInput): Promise<void> {
    const { actionId, ownerToken, leaseSeconds, maxTotalSeconds } = input;

    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_admin_actions
        SET lease_expires_at = LEAST(
          now() + make_interval(secs => ${leaseSeconds}),
          created_at + make_interval(secs => ${maxTotalSeconds})
        )
        WHERE id = ${actionId}::uuid
          AND status = 'IN_PROGRESS'
          AND owner_token = ${ownerToken}::uuid
      `;

      this.logger.debug(`[extendLease] Extended: actionId=${actionId}`);
    } catch (error) {
      this.logger.error(`[extendLease] Failed: actionId=${actionId}`, error);
      throw error;
    }
  }

  // ==========================================================================
  // Complete
  // ==========================================================================

  /**
   * Mark action as completed with result.
   * 
   * Only owner can complete (owner_token check).
   * Result is stored for deterministic replay.
   */
  async complete(input: GateCompleteInput): Promise<void> {
    const { actionId, ownerToken, httpStatus, resultCode, resultJson } = input;

    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_admin_actions
        SET status = 'COMPLETED',
            http_status = ${httpStatus},
            result_code = ${resultCode},
            result_json = ${JSON.stringify(resultJson)}::jsonb,
            completed_at = now()
        WHERE id = ${actionId}::uuid
          AND status = 'IN_PROGRESS'
          AND owner_token = ${ownerToken}::uuid
      `;

      this.logger.debug(`[complete] Completed: actionId=${actionId}, httpStatus=${httpStatus}`);
    } catch (error) {
      this.logger.error(`[complete] Failed: actionId=${actionId}`, error);
      throw error;
    }
  }

  // ==========================================================================
  // Fail
  // ==========================================================================

  /**
   * Mark action as failed with error.
   * 
   * Only owner can fail (owner_token check).
   * Error is stored for deterministic replay.
   */
  async fail(input: GateFailInput): Promise<void> {
    const { actionId, ownerToken, httpStatus, resultCode, errorJson } = input;

    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_admin_actions
        SET status = 'FAILED',
            http_status = ${httpStatus},
            result_code = ${resultCode},
            result_json = ${JSON.stringify(errorJson)}::jsonb,
            completed_at = now()
        WHERE id = ${actionId}::uuid
          AND status = 'IN_PROGRESS'
          AND owner_token = ${ownerToken}::uuid
      `;

      this.logger.debug(`[fail] Failed: actionId=${actionId}, httpStatus=${httpStatus}, code=${resultCode}`);
    } catch (error) {
      this.logger.error(`[fail] DB error: actionId=${actionId}`, error);
      throw error;
    }
  }
}
