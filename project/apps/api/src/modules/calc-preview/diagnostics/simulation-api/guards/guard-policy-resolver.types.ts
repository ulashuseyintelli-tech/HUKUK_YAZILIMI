/**
 * Guard Policy Resolver — Type Definitions & Config Schema
 *
 * Operational Guard Phase — Task 1.1 + Task 2.3 (ms migration + SignalName)
 *
 * Three-level guard architecture types:
 *   G0: Kill-switch (BLOCK_503)
 *   G1: Degrade mode (HOLD / ALLOW via allowlist)
 *   G2: SLO/Alert guard (signal generation)
 *
 * BREAKING CHANGES (Task 2.3):
 *   - computedAt: string → computedAtMs: number
 *   - timestamp: string → timestampMs: number
 *   - evaluatedAt: string → evaluatedAtMs: number
 *   - signals key: string → SignalName (type alias from REQUIRED_SIGNAL_NAMES)
 *   - computeRiskContextHash: canonical key-sorted, integer ms fields
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D1
 * @see .kiro/specs/operational-guard-phase/requirements.md — R1, R2, R5
 */

import { createHash } from 'crypto';

// ============================================================================
// Guard Decision
// ============================================================================

/** Guard kararı — resolver çıktısı */
export enum GuardDecision {
  ALLOW = 'ALLOW',
  HOLD = 'HOLD',
  BLOCK_503 = 'BLOCK_503',
  DEGRADE = 'DEGRADE',
}

// ============================================================================
// Pipeline Operations
// ============================================================================

/** Pipeline operasyon tipleri */
export enum GuardOperation {
  PROMOTE = 'promote',
  EVALUATE = 'evaluate',
  ADMIN = 'admin',
}

// ============================================================================
// Degrade Allowlist (enum-based, not string)
// ============================================================================

/** Degrade modunda izin verilen operasyonlar — enum tabanlı allowlist */
export enum DegradeAllowedOp {
  ADMIN_READ = 'ADMIN_READ',
  HEALTH_CHECK = 'HEALTH_CHECK',
  METRICS_SCRAPE = 'METRICS_SCRAPE',
}

// ============================================================================
// Signal Status
// ============================================================================

/** Sinyal durumu */
export enum SignalStatus {
  FRESH = 'FRESH',
  STALE = 'STALE',
  INSUFFICIENT = 'INSUFFICIENT',
}

// ============================================================================
// Guard Mode — per-tenant rollout control
// ============================================================================

/**
 * Guard çalışma modu — per-tenant, strict enum.
 *   disabled: zero compute — no snapshot, no signal, no telemetry
 *   shadow:   full compute, zero enforcement — snapshot + telemetry, next.handle() always
 *   enforce:  full compute + enforcement — mevcut davranış (HOLD/BLOCK_503 short-circuit)
 */
export type GuardMode = 'enforce' | 'shadow' | 'disabled';

/** Valid guard modes — runtime validation (NR-4: unknown → reject) */
export const VALID_GUARD_MODES: readonly GuardMode[] = Object.freeze([
  'enforce',
  'shadow',
  'disabled',
]);

/** Validate guardMode — unknown → false (NR-4) */
export function isValidGuardMode(value: string): value is GuardMode {
  return VALID_GUARD_MODES.includes(value as GuardMode);
}

// ============================================================================
// Signal Names — single source of truth
// ============================================================================

/**
 * Required signal names for guard policy evaluation.
 * Single source of truth — engine produces these, resolver reads these.
 * Unknown signals are allowed but ignored by resolver.
 * Missing required signals → fail-closed (MISSING_SIGNAL:<name>).
 */
export const REQUIRED_SIGNAL_NAMES: readonly ['casConflictRate', 'dbTimeoutRate', 'clockSkewMs'] =
  Object.freeze(['casConflictRate', 'dbTimeoutRate', 'clockSkewMs'] as const);

/** Type-safe signal name — derived from REQUIRED_SIGNAL_NAMES */
export type SignalName = (typeof REQUIRED_SIGNAL_NAMES)[number];

// ============================================================================
// Window Config
// ============================================================================

/** Pencere konfigürasyonu */
export interface WindowConfig {
  /** Window size in seconds (default: 300) */
  readonly windowSizeSeconds: number;
  /** Sampling period in seconds (default: 10) */
  readonly samplingPeriodSeconds: number;
  /** Aggregation function */
  readonly aggregation: 'sum' | 'rate';
  /** Minimum sample count for valid signal (default: 5) */
  readonly minSampleCount: number;
  /** Staleness threshold in seconds (default: 60) */
  readonly stalenessThresholdSeconds: number;
  /** How to handle missing samples */
  readonly missingSampleStrategy: 'zero' | 'stale';
}

// ============================================================================
// Windowed Signal
// ============================================================================

/** Pencereli sinyal değeri — all timestamps in ms (no ISO strings) */
export interface WindowedSignal {
  readonly name: string;
  readonly value: number;
  readonly status: SignalStatus;
  readonly sampleCount: number;
  readonly windowParams: WindowConfig;
  /** Computation timestamp in ms (injected nowMs, not Date.now()) */
  readonly computedAtMs: number;
  /** Timestamp (ms) of the most recent sample in window, null if no samples */
  readonly lastSampleAtMs: number | null;
}

// ============================================================================
// Risk Context Snapshot
// ============================================================================

/** Risk bağlamı snapshot'ı — SignalWindowEngine çıktısı */
export interface RiskContextSnapshot {
  /** Snapshot timestamp in ms */
  readonly timestampMs: number;
  /** Signal map — keyed by signal name (SignalName for required, string for unknown) */
  readonly signals: Readonly<Record<string, WindowedSignal>>;
  readonly anyStale: boolean;
  readonly anyInsufficient: boolean;
}

// ============================================================================
// Guard Thresholds
// ============================================================================

/** Guard eşik değerleri */
export interface GuardThresholds {
  /** CAS conflict rate threshold (default: 0.5) */
  readonly casConflictRateThreshold: number;
  /** DB timeout rate threshold (default: 0.3) */
  readonly dbTimeoutRateThreshold: number;
  /** Clock skew threshold in ms (default: 500) */
  readonly clockSkewThresholdMs: number;
}

// ============================================================================
// Per-Tenant Guard Config
// ============================================================================

/** Per-tenant guard config */
export interface TenantGuardConfig {
  readonly killSwitchActive: boolean;
  readonly degradeModeActive: boolean;
  readonly thresholds: GuardThresholds;
  readonly allowedOpsInDegradeMode: readonly DegradeAllowedOp[];
  /** Guard mode — disabled/shadow/enforce (default: from globalGuardMode) */
  readonly guardMode: GuardMode;
}

// ============================================================================
// Global Guard Config
// ============================================================================

/** Global guard config — tüm tenant'lar için */
export interface GuardConfig {
  /** Config revision — policyVersion source-of-truth */
  readonly version: string;
  readonly globalDefaults: GuardThresholds;
  readonly globalDegradeAllowlist: readonly DegradeAllowedOp[];
  readonly tenantOverrides: Readonly<Record<string, Partial<TenantGuardConfig>>>;
  /** Global guard mode — tenant override yoksa bu kullanılır (default: 'disabled') */
  readonly globalGuardMode: GuardMode;
}

// ============================================================================
// Guard Decision Snapshot
// ============================================================================

/**
 * Guard karar snapshot'ı — request başında bir kez hesaplanır, immutable.
 * Mid-flight config/signal değişiklikleri bu snapshot'ı etkilemez.
 */
export interface GuardDecisionSnapshot {
  readonly decision: GuardDecision;
  readonly mode: string | null;
  readonly reasonCodes: readonly string[];
  readonly policyVersion: string;
  /** Evaluation timestamp in ms */
  readonly evaluatedAtMs: number;
  readonly riskContextHash: string;
  readonly tenantId: string;
}

// ============================================================================
// Defaults
// ============================================================================

/** Production sane defaults — window config */
export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  windowSizeSeconds: 300,
  samplingPeriodSeconds: 10,
  aggregation: 'rate',
  minSampleCount: 5,
  stalenessThresholdSeconds: 60,
  missingSampleStrategy: 'stale',
} as const;

/** Production sane defaults — guard thresholds */
export const DEFAULT_GUARD_THRESHOLDS: GuardThresholds = {
  casConflictRateThreshold: 0.5,
  dbTimeoutRateThreshold: 0.3,
  clockSkewThresholdMs: 500,
} as const;

/** Production sane defaults — global guard config */
export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  version: '1.0.0',
  globalDefaults: DEFAULT_GUARD_THRESHOLDS,
  globalDegradeAllowlist: [
    DegradeAllowedOp.ADMIN_READ,
    DegradeAllowedOp.HEALTH_CHECK,
    DegradeAllowedOp.METRICS_SCRAPE,
  ],
  tenantOverrides: {},
  globalGuardMode: 'disabled',
} as const;

// ============================================================================
// Validation
// ============================================================================

/** Threshold validation errors */
export interface GuardConfigValidationError {
  readonly field: string;
  readonly message: string;
  readonly value: unknown;
}

/**
 * Validate guard thresholds — reject negative/zero values.
 * Returns empty array if valid.
 */
export function validateGuardThresholds(
  thresholds: GuardThresholds,
): readonly GuardConfigValidationError[] {
  const errors: GuardConfigValidationError[] = [];

  if (thresholds.casConflictRateThreshold <= 0) {
    errors.push({
      field: 'casConflictRateThreshold',
      message: 'Must be positive',
      value: thresholds.casConflictRateThreshold,
    });
  }
  if (thresholds.dbTimeoutRateThreshold <= 0) {
    errors.push({
      field: 'dbTimeoutRateThreshold',
      message: 'Must be positive',
      value: thresholds.dbTimeoutRateThreshold,
    });
  }
  if (thresholds.clockSkewThresholdMs <= 0) {
    errors.push({
      field: 'clockSkewThresholdMs',
      message: 'Must be positive',
      value: thresholds.clockSkewThresholdMs,
    });
  }

  return errors;
}

/**
 * Validate window config — reject invalid parameters.
 */
export function validateWindowConfig(
  config: WindowConfig,
): readonly GuardConfigValidationError[] {
  const errors: GuardConfigValidationError[] = [];

  if (config.windowSizeSeconds <= 0) {
    errors.push({ field: 'windowSizeSeconds', message: 'Must be positive', value: config.windowSizeSeconds });
  }
  if (config.samplingPeriodSeconds <= 0) {
    errors.push({ field: 'samplingPeriodSeconds', message: 'Must be positive', value: config.samplingPeriodSeconds });
  }
  if (config.minSampleCount <= 0) {
    errors.push({ field: 'minSampleCount', message: 'Must be positive', value: config.minSampleCount });
  }
  if (config.stalenessThresholdSeconds <= 0) {
    errors.push({ field: 'stalenessThresholdSeconds', message: 'Must be positive', value: config.stalenessThresholdSeconds });
  }

  return errors;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve tenant config — merge tenant overrides with global defaults.
 * Returns a NEW object (immutable — no shared object mutation).
 * This is critical for P5 (per-tenant isolation).
 */
export function resolveTenantConfig(
  tenantId: string,
  config: GuardConfig,
): TenantGuardConfig {
  const override = config.tenantOverrides[tenantId];

  if (!override) {
    return {
      killSwitchActive: false,
      degradeModeActive: false,
      thresholds: { ...config.globalDefaults },
      allowedOpsInDegradeMode: [...config.globalDegradeAllowlist],
      guardMode: config.globalGuardMode ?? 'disabled',
    };
  }

  return {
    killSwitchActive: override.killSwitchActive ?? false,
    degradeModeActive: override.degradeModeActive ?? false,
    thresholds: override.thresholds
      ? { ...config.globalDefaults, ...override.thresholds }
      : { ...config.globalDefaults },
    allowedOpsInDegradeMode: override.allowedOpsInDegradeMode
      ? [...override.allowedOpsInDegradeMode]
      : [...config.globalDegradeAllowlist],
    guardMode: override.guardMode ?? config.globalGuardMode ?? 'disabled',
  };
}

/**
 * Compute deterministic hash of RiskContextSnapshot.
 * Canonicalization rules:
 *   - Keys sorted alphabetically
 *   - Numeric fields (ms) are integers
 *   - Signal values already 1e-6 rounded by engine
 * Same input → same hash, always.
 */
export function computeRiskContextHash(
  riskContext: RiskContextSnapshot,
): string {
  // Canonical: sorted keys, deterministic JSON
  const sortedSignalKeys = Object.keys(riskContext.signals).sort();
  const canonicalSignals: Record<string, unknown> = {};
  for (const key of sortedSignalKeys) {
    const sig = riskContext.signals[key]!;
    // windowParams included for audit trail completeness —
    // two snapshots with different window configs must produce different hashes.
    const wp = sig.windowParams;
    canonicalSignals[key] = {
      computedAtMs: sig.computedAtMs,
      lastSampleAtMs: sig.lastSampleAtMs,
      name: sig.name,
      sampleCount: sig.sampleCount,
      status: sig.status,
      value: sig.value,
      windowParams: {
        aggregation: wp.aggregation,
        minSampleCount: wp.minSampleCount,
        missingSampleStrategy: wp.missingSampleStrategy,
        samplingPeriodSeconds: wp.samplingPeriodSeconds,
        stalenessThresholdSeconds: wp.stalenessThresholdSeconds,
        windowSizeSeconds: wp.windowSizeSeconds,
      },
    };
  }

  const payload = JSON.stringify({
    anyInsufficient: riskContext.anyInsufficient,
    anyStale: riskContext.anyStale,
    signals: canonicalSignals,
    timestampMs: riskContext.timestampMs,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Build immutable GuardDecisionSnapshot.
 */
export function buildSnapshot(
  decision: GuardDecision,
  mode: string | null,
  reasonCodes: readonly string[],
  policyVersion: string,
  evaluatedAtMs: number,
  riskContext: RiskContextSnapshot,
  tenantId: string,
): GuardDecisionSnapshot {
  return Object.freeze({
    decision,
    mode,
    reasonCodes: Object.freeze([...reasonCodes]),
    policyVersion,
    evaluatedAtMs,
    riskContextHash: computeRiskContextHash(riskContext),
    tenantId,
  });
}

/**
 * Check if operation is allowed in degrade mode.
 * Maps GuardOperation → DegradeAllowedOp for allowlist check.
 *
 * Exhaustive switch ensures new GuardOperation values are handled at compile time.
 */
export function isDegradeAllowed(
  operation: GuardOperation,
  allowlist: readonly DegradeAllowedOp[],
): boolean {
  switch (operation) {
    case GuardOperation.ADMIN:
      // ADMIN operations map to ADMIN_READ in degrade mode
      return allowlist.includes(DegradeAllowedOp.ADMIN_READ);
    case GuardOperation.PROMOTE:
    case GuardOperation.EVALUATE:
      // Risky operations — never allowed in degrade mode
      return false;
    default:
      // Exhaustive check: if a new GuardOperation is added, TypeScript
      // will error here (operation has type 'never' if all cases covered).
      return assertUnreachable(operation);
  }
}

/** Compile-time exhaustiveness guard — forces handling of all enum variants */
function assertUnreachable(x: never): never {
  throw new Error(`Unhandled GuardOperation: ${String(x)}`);
}

/**
 * Check thresholds against risk context signals.
 * Returns array of breach reason codes (empty = no breaches).
 * Only reads REQUIRED_SIGNAL_NAMES — unknown signals are ignored.
 */
export function checkThresholds(
  riskContext: RiskContextSnapshot,
  thresholds: GuardThresholds,
): readonly string[] {
  const breaches: string[] = [];

  const casSignal = riskContext.signals['casConflictRate'];
  if (casSignal && casSignal.status === SignalStatus.FRESH && casSignal.value > thresholds.casConflictRateThreshold) {
    breaches.push('CAS_CONFLICT_RATE_EXCEEDED');
  }

  const dbTimeoutSignal = riskContext.signals['dbTimeoutRate'];
  if (dbTimeoutSignal && dbTimeoutSignal.status === SignalStatus.FRESH && dbTimeoutSignal.value > thresholds.dbTimeoutRateThreshold) {
    breaches.push('DB_TIMEOUT_RATE_EXCEEDED');
  }

  const clockSkewSignal = riskContext.signals['clockSkewMs'];
  if (clockSkewSignal && clockSkewSignal.status === SignalStatus.FRESH && clockSkewSignal.value > thresholds.clockSkewThresholdMs) {
    breaches.push('CLOCK_SKEW_EXCEEDED');
  }

  return breaches;
}
