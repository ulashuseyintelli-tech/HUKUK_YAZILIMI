/**
 * Redrive Kill-Switch — Phase 12
 *
 * Provides a single function to check if redrive is disabled via environment variable.
 * Used by ManifestAdminController to short-circuit POST /dlq/:dlqId/redrive.
 *
 * Config flag name: REDRIVE_DISABLED (LOCKED — no aliases)
 * Values: 'true' (case-insensitive) → disabled; anything else → enabled.
 *
 * @see Phase 12: Redrive Operational Safeguards
 */

/**
 * Check if redrive is disabled via environment variable.
 *
 * Reads process.env.REDRIVE_DISABLED at call time (no caching).
 * Case-insensitive: 'true', 'TRUE', 'True' all disable redrive.
 *
 * @returns true if redrive is disabled, false otherwise
 */
export function isRedriveDisabled(): boolean {
  return process.env.REDRIVE_DISABLED?.toLowerCase() === 'true';
}
