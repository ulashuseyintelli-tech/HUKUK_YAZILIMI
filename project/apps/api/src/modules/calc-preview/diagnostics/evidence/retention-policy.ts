/**
 * Retention Policy - SINGLE SOURCE OF TRUTH
 * 
 * Phase 8 - Sprint 2C
 * 
 * Defines retention policy hierarchy and transition rules.
 * All policy transitions MUST go through this module.
 * 
 * HIERARCHY (upgrade only, downgrade FORBIDDEN):
 *   LEGAL_HOLD (∞) > PROMOTED (168h) > STANDARD (72h)
 * 
 * RULES:
 * - TTL always based on createdAt (NOT promotedAt)
 * - Promotion does NOT extend TTL, only changes policy
 * - LEGAL_HOLD never expires, never deleted by cleanup
 * - Downgrade attempts return error
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

/**
 * Retention policy types
 */
export type RetentionPolicy = 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD';

/**
 * Retention hours per policy
 * null = indefinite (LEGAL_HOLD)
 */
export const RETENTION_HOURS: Record<RetentionPolicy, number | null> = {
  STANDARD: 72,
  PROMOTED: 168, // 7 days
  LEGAL_HOLD: null, // indefinite
};

/**
 * Policy hierarchy rank (higher = more restrictive)
 * Used for transition validation
 */
export const POLICY_RANK: Record<RetentionPolicy, number> = {
  STANDARD: 1,
  PROMOTED: 2,
  LEGAL_HOLD: 3,
};

/**
 * Result of policy transition attempt
 */
export interface PolicyTransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** Whether the policy actually changed (false for no-op) */
  changed: boolean;
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy (same as previous if no change) */
  newPolicy: RetentionPolicy;
  /** Error code if transition failed */
  error?: 'RETENTION_DOWNGRADE_FORBIDDEN' | 'SNAPSHOT_NOT_FOUND';
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Check if policy transition is allowed
 * 
 * RULE: Only upgrades allowed (STANDARD → PROMOTED → LEGAL_HOLD)
 * Downgrade is FORBIDDEN
 * Same policy is allowed (no-op)
 * 
 * @param from Current policy
 * @param to Target policy
 * @returns true if transition is allowed
 */
export function isTransitionAllowed(from: RetentionPolicy, to: RetentionPolicy): boolean {
  return POLICY_RANK[to] >= POLICY_RANK[from];
}

/**
 * Validate policy transition and return result
 * 
 * @param currentPolicy Current policy
 * @param targetPolicy Target policy
 * @returns PolicyTransitionResult
 */
export function validateTransition(
  currentPolicy: RetentionPolicy,
  targetPolicy: RetentionPolicy,
): PolicyTransitionResult {
  // Same policy = no-op (success, no change)
  if (currentPolicy === targetPolicy) {
    return {
      success: true,
      changed: false,
      previousPolicy: currentPolicy,
      newPolicy: targetPolicy,
    };
  }

  // Check if upgrade
  if (isTransitionAllowed(currentPolicy, targetPolicy)) {
    return {
      success: true,
      changed: true,
      previousPolicy: currentPolicy,
      newPolicy: targetPolicy,
    };
  }

  // Downgrade attempt - FORBIDDEN
  return {
    success: false,
    changed: false,
    previousPolicy: currentPolicy,
    newPolicy: currentPolicy, // Stays the same
    error: 'RETENTION_DOWNGRADE_FORBIDDEN',
    errorMessage: `Cannot downgrade retention policy from ${currentPolicy} to ${targetPolicy}. Only upgrades are allowed.`,
  };
}

/**
 * Calculate expiration time based on policy and createdAt
 * 
 * @param createdAt Snapshot creation time
 * @param policy Retention policy
 * @returns Expiration time ISO string, or null for LEGAL_HOLD
 */
export function calculateExpiresAt(createdAt: Date, policy: RetentionPolicy): string | null {
  const hours = RETENTION_HOURS[policy];
  
  if (hours === null) {
    return null; // LEGAL_HOLD never expires
  }

  const expiresAt = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Check if snapshot is expired based on policy
 * 
 * @param expiresAt Expiration time (null = never)
 * @param policy Retention policy
 * @param now Current time
 * @returns true if expired
 */
export function isExpired(
  expiresAt: string | null,
  policy: RetentionPolicy,
  now: Date,
): boolean {
  // LEGAL_HOLD never expires
  if (policy === 'LEGAL_HOLD' || expiresAt === null) {
    return false;
  }

  const expiresAtDate = new Date(expiresAt);
  return now >= expiresAtDate; // >= comparison (exactly at threshold = expired)
}

/**
 * Get human-readable policy description
 */
export function getPolicyDescription(policy: RetentionPolicy): string {
  switch (policy) {
    case 'STANDARD':
      return `Standard retention (${RETENTION_HOURS.STANDARD}h)`;
    case 'PROMOTED':
      return `Promoted retention (${RETENTION_HOURS.PROMOTED}h)`;
    case 'LEGAL_HOLD':
      return 'Legal hold (indefinite)';
  }
}
