/**
 * Redrive Backoff Policy — Phase 11.4
 *
 * Pure function: deterministic backoff computation.
 * Config-driven, RNG injectable for test determinism.
 *
 * Formula:
 *   k = min(redriveCount, capExponent)
 *   backoff = min(maxBackoffMs, baseMs × 2^k)
 *   jitter = floor(rng() × jitterPct × backoff)
 *   nextAllowedAt = now + backoff + jitter
 *
 * Guarantees (validated by PBT):
 *   INV-11.4.5: backoffMs <= maxBackoffMs
 *   INV-11.4.5: jitterMs <= jitterPct × backoffMs
 *   INV-11.4.2: monotonic (jitter hariç, artan redriveCount → artan backoff)
 *   Determinism: aynı input → aynı output (sabit rng ile)
 *
 * @see .kiro/specs/phase-11-4-redrive-rate-limiting/design.md
 */

// ============================================================================
// Types
// ============================================================================

export interface BackoffPolicyConfig {
  /** Base cooldown in milliseconds (default: 30_000 = 30s) */
  readonly baseMs: number;
  /** Exponent cap — k = min(redriveCount, capExponent) */
  readonly capExponent: number;
  /** Maximum backoff in milliseconds (default: 3_600_000 = 1h) */
  readonly maxBackoffMs: number;
  /** Jitter percentage 0.0–1.0 (default: 0.20 = 20%) */
  readonly jitterPct: number;
}

export interface BackoffResult {
  /** Absolute timestamp: next allowed redrive time */
  readonly nextAllowedAt: Date;
  /** Computed backoff in ms (before jitter) */
  readonly backoffMs: number;
  /** Computed jitter in ms */
  readonly jitterMs: number;
  /** Effective exponent k = min(redriveCount, capExponent) */
  readonly k: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_BACKOFF_CONFIG: Readonly<BackoffPolicyConfig> = {
  baseMs: 30_000,          // 30 seconds
  capExponent: 7,          // 2^7 = 128 → 30s × 128 = 3840s ≈ 64min (capped at 1h)
  maxBackoffMs: 3_600_000, // 1 hour
  jitterPct: 0.20,         // 20%
} as const;

// ============================================================================
// Pure Function
// ============================================================================

/**
 * Compute next allowed redrive time.
 *
 * @param now - Current timestamp
 * @param redriveCount - Current redrive count (BEFORE increment).
 *   Negative/NaN values are clamped to 0 (defensive).
 *   Fractional values are floored.
 * @param config - Backoff configuration
 * @param rng - Random number generator [0, 1) — injectable for testing
 * @returns BackoffResult with nextAllowedAt, backoffMs, jitterMs, k
 */
export function computeNextAllowedAt(
  now: Date,
  redriveCount: number,
  config: BackoffPolicyConfig = DEFAULT_BACKOFF_CONFIG,
  rng: () => number = Math.random,
): BackoffResult {
  // Input guard: negative/NaN redriveCount clamped to 0
  const safeCount = Number.isFinite(redriveCount)
    ? Math.max(0, Math.floor(redriveCount))
    : 0;

  const k = Math.min(safeCount, config.capExponent);
  const rawBackoff = config.baseMs * Math.pow(2, k);
  const backoffMs = Math.min(rawBackoff, config.maxBackoffMs);

  // Clamp rng to [0, 1) for safety
  const safeRng = Math.max(0, Math.min(rng(), 1 - Number.EPSILON));
  const jitterMs = Math.floor(safeRng * config.jitterPct * backoffMs);

  const nextAllowedAt = new Date(now.getTime() + backoffMs + jitterMs);

  return { nextAllowedAt, backoffMs, jitterMs, k };
}
