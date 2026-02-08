/**
 * Redrive Rate Limiter — Phase 11.4
 *
 * Enforces per-correlation-chain rate limiting on DLQ redrive operations.
 * Two-phase design:
 *   1. checkRateLimit (read-only decision) — called BEFORE carrier clone
 *   2. atomicRedrive with rateLimitGate (authoritative tx gate) — handles rate limit state update
 *
 * Rate limit state lives on the DLQ entry itself (no separate table).
 * Reject path: NO DB mutation (INV-11.4.3).
 * Fail-closed: controller wraps calls in try/catch → reject on error.
 *
 * Key resolution: rootCorrelationId ?? correlationId ?? dlqEntry.id
 * Cardinality clamp: key > 256 chars → SHA-256 hash with versioned prefix.
 *
 * MUST NOT: Rate limit key never appears in metric labels (cardinality explosion).
 *
 * @see .kiro/specs/phase-11-4-redrive-rate-limiting/design.md
 */

import { createHash } from 'crypto';
import type { DlqEntry } from '../../manifest-retry.types';
import {
  BackoffPolicyConfig,
  DEFAULT_BACKOFF_CONFIG,
} from './redrive-backoff-policy';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly reason?: 'RATE_LIMITED' | 'RATE_LIMIT_CHECK_FAILED';
  readonly waitSeconds?: number;
  readonly nextAllowedAt?: Date;
  readonly policy?: BackoffPolicyConfig;
  readonly redriveCount?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum key length before SHA-256 hash is applied */
export const MAX_KEY_LENGTH = 256;

/** Versioned prefix for hashed keys — future schema compat */
export const HASH_KEY_PREFIX = 'rl:v1:';

// ============================================================================
// Key Resolution
// ============================================================================

/**
 * Resolve the rate limit key from DLQ entry.
 * All layers use this function — single source of truth.
 *
 * LOCKED: Rate limit key = rootCorrelationId ?? correlationId ?? dlqEntry.id
 *
 * Priority:
 *   1. rootCorrelationId (carrier_json → rootCorrelationId) — same event family → single bucket
 *   2. correlationId (carrier_json → requestId) — if root absent, current correlation
 *   3. dlqEntry.id — carrier_json absent or unparseable → fallback
 *
 * Cardinality clamp: key max 256 char; exceeding keys are hashed (never truncated).
 * Hash format: "rl:v1:<sha256hex>" — versioned prefix for future schema compat.
 *
 * MUST NOT: Rate limit key never appears in metric labels (cardinality explosion).
 * Metric labels use only reason/bucket enum values.
 */
export function resolveRateLimitKey(dlqEntry: DlqEntry): string {
  if (dlqEntry.carrierJson) {
    try {
      const carrier = JSON.parse(dlqEntry.carrierJson);
      const root = carrier.rootCorrelationId;
      const corr = carrier.requestId; // correlationId = requestId in carrier
      const rawKey = root ?? corr ?? dlqEntry.id;
      return clampKey(String(rawKey));
    } catch {
      // Parse failed → fallback to dlqEntry.id
      return clampKey(dlqEntry.id);
    }
  }
  return clampKey(dlqEntry.id);
}

/**
 * Clamp key to max 256 chars.
 * If longer, hash with SHA-256 + versioned prefix.
 * Truncate MUST NOT be used — collision risk.
 */
export function clampKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH) return key;
  const hash = createHash('sha256').update(key).digest('hex');
  return `${HASH_KEY_PREFIX}${hash}`;
}

// ============================================================================
// Rate Limit Check (Read-Only Decision)
// ============================================================================

/**
 * Check rate limit (read-only decision — PRE-CHECK ONLY).
 *
 * This is an optimistic pre-check for UX speed. The authoritative gate
 * is inside atomicRedrive's transaction (SELECT ... FOR UPDATE + cooldown guard).
 *
 * Pre-check MUST NOT fail-open: controller wraps this in try/catch,
 * any error → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED (fail-closed).
 *
 * Decision matrix:
 *   - nextAllowedRedriveAt NULL → allow (first redrive)
 *   - now >= nextAllowedRedriveAt → allow
 *   - now < nextAllowedRedriveAt → reject + waitSeconds
 *
 * This function performs NO DB mutations (INV-11.4.3).
 *
 * @param dlqEntry - DLQ entry with current rate limit state
 * @param now - Current timestamp (app time, NOT DB NOW())
 * @param config - Backoff policy config (for response enrichment)
 */
export function checkRateLimit(
  dlqEntry: DlqEntry,
  now: Date,
  config: BackoffPolicyConfig = DEFAULT_BACKOFF_CONFIG,
): RateLimitCheckResult {
  const currentCount = dlqEntry.redriveCount ?? 0;

  // Case 1: First redrive — no rate limit state
  if (dlqEntry.nextAllowedRedriveAt == null) {
    return { allowed: true, redriveCount: currentCount };
  }

  const nextAllowed = new Date(dlqEntry.nextAllowedRedriveAt);

  // Case 2: Cooldown expired
  if (now.getTime() >= nextAllowed.getTime()) {
    return { allowed: true, redriveCount: currentCount };
  }

  // Case 3: Rate limited — cooldown active
  const diffMs = nextAllowed.getTime() - now.getTime();
  const waitSeconds = Math.ceil(diffMs / 1000);

  return {
    allowed: false,
    reason: 'RATE_LIMITED',
    waitSeconds,
    nextAllowedAt: nextAllowed,
    policy: config,
    redriveCount: currentCount,
  };
}
